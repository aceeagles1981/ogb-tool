
import json
import logging
import os
import re
import tempfile
import threading
import time
from collections import defaultdict, deque
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timezone
from email import policy
from email.parser import BytesParser
from functools import wraps
from typing import Any, Deque, Dict, List, Optional, Tuple

import psycopg
import psycopg.rows
import requests
from flask import Flask, jsonify, request

try:
    from flask_cors import CORS
except Exception:
    CORS = None

try:
    import extract_msg  # type: ignore
except Exception:
    extract_msg = None

from workflow import workflow_bp
from comparison import comparison_bp

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("og_backend")

app = Flask(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "").strip()
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "").strip()
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514").strip()
APP_BASE_URL = os.getenv("APP_BASE_URL", "").strip() or "https://og-backend-production.up.railway.app"
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "").strip()
ADMIN_TOKEN = os.getenv("ADMIN_TOKEN", "").strip()

MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "15"))
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

if CORS and FRONTEND_ORIGIN:
    CORS(app, resources={r"/*": {"origins": [FRONTEND_ORIGIN]}}, supports_credentials=False)
elif CORS:
    logger.warning("FRONTEND_ORIGIN is not set. CORS is disabled to avoid open cross-origin access.")
else:
    logger.warning("flask-cors is unavailable. CORS headers will not be sent.")

# Explicit CORS handler — ensures preflight OPTIONS work for all routes including blueprints
@app.after_request
def add_cors_headers(response):
    if FRONTEND_ORIGIN:
        response.headers['Access-Control-Allow-Origin'] = FRONTEND_ORIGIN
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Admin-Token, X-User-Id, Authorization'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    return response

@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        from flask import make_response
        resp = make_response('', 204)
        if FRONTEND_ORIGIN:
            resp.headers['Access-Control-Allow-Origin'] = FRONTEND_ORIGIN
            resp.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Admin-Token, X-User-Id, Authorization'
            resp.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
        return resp

app.register_blueprint(workflow_bp)
app.register_blueprint(comparison_bp)

# -----------------------------------------------------------------------------
# Security helpers
# -----------------------------------------------------------------------------

RATE_LIMITS: Dict[str, Tuple[int, int]] = {
    "default_read": (120, 60),
    "default_write": (30, 60),
    "ai": (20, 60),
    "upload": (10, 60),
}
RATE_STATE: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)
RATE_LOCK = threading.Lock()


def client_ip() -> str:
    xff = (request.headers.get("X-Forwarded-For") or "").split(",")[0].strip()
    return xff or request.remote_addr or "unknown"


def _check_rate_limit(bucket: str) -> Optional[Tuple[int, int]]:
    limit, window = RATE_LIMITS[bucket]
    key = (bucket, client_ip())
    now = time.time()
    cutoff = now - window
    with RATE_LOCK:
        dq = RATE_STATE[key]
        while dq and dq[0] < cutoff:
            dq.popleft()
        if len(dq) >= limit:
            retry_after = max(1, int(dq[0] + window - now))
            return retry_after, limit
        dq.append(now)
    return None


def rate_limited(bucket: str):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            hit = _check_rate_limit(bucket)
            if hit:
                retry_after, limit = hit
                resp = jsonify({
                    "error": "rate_limit_exceeded",
                    "message": f"Rate limit exceeded for {bucket}. Try again later.",
                    "limit": limit,
                    "retry_after_seconds": retry_after,
                })
                resp.status_code = 429
                resp.headers["Retry-After"] = str(retry_after)
                return resp
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def get_auth_token_from_request() -> str:
    auth_header = (request.headers.get("Authorization") or "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return (request.headers.get("X-Admin-Token") or "").strip()


def require_admin(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not ADMIN_TOKEN:
            logger.error("ADMIN_TOKEN is not configured")
            return jsonify({"error": "server_not_configured", "message": "ADMIN_TOKEN is not configured"}), 500
        token = get_auth_token_from_request()
        if not token or token != ADMIN_TOKEN:
            return jsonify({"error": "unauthorized", "message": "Valid admin token required"}), 401
        return fn(*args, **kwargs)
    return wrapper


def get_user_id_from_request() -> Optional[int]:
    try:
        raw = request.headers.get("X-User-Id")
        return int(raw) if raw else None
    except Exception:
        return None


# -----------------------------------------------------------------------------
# Database helpers
# -----------------------------------------------------------------------------

def _normalise_db_url(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql://" + url[len("postgres://"):]
    return url


@contextmanager
def get_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is not configured")
    conn = psycopg.connect(_normalise_db_url(DATABASE_URL))
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    email TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'broker',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    canonical_name TEXT NOT NULL UNIQUE,
    producer TEXT,
    region TEXT,
    handler TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matters (
    id SERIAL PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    matter_type TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    target_date DATE,
    latest_summary TEXT,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    matter_id INTEGER REFERENCES matters(id) ON DELETE SET NULL,
    source_type TEXT NOT NULL DEFAULT 'email_ingest',
    source_ref TEXT,
    event_at TIMESTAMPTZ NOT NULL,
    subject TEXT,
    sender TEXT,
    recipients TEXT,
    raw_body TEXT,
    cleaned_body TEXT,
    summary_factual TEXT,
    requests_received JSONB NOT NULL DEFAULT '[]'::jsonb,
    promises_made JSONB NOT NULL DEFAULT '[]'::jsonb,
    suggested_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
    ai_output JSONB,
    needs_review BOOLEAN NOT NULL DEFAULT FALSE,
    review_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ingested_emails (
    id SERIAL PRIMARY KEY,
    source_filename TEXT,
    sender TEXT,
    subject TEXT,
    email_date TIMESTAMPTZ,
    raw_body TEXT,
    cleaned_body TEXT,
    ai_note JSONB,
    saved_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risks (
    id SERIAL PRIMARY KEY,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    matter_id INTEGER REFERENCES matters(id) ON DELETE SET NULL,
    assured_name TEXT NOT NULL,
    display_name TEXT,
    producer TEXT,
    handler TEXT,
    region TEXT,
    product TEXT,
    layer TEXT,
    status TEXT NOT NULL DEFAULT 'submission',
    accounting_year INTEGER NOT NULL,
    inception_date DATE,
    expiry_date DATE,
    currency TEXT NOT NULL DEFAULT 'USD',
    gross_premium NUMERIC(18,2),
    order_pct NUMERIC(8,4),
    brokerage_pct NUMERIC(8,4),
    retained_pct NUMERIC(8,4),
    estimated_gbp_commission NUMERIC(18,2),
    locked_gbp_commission NUMERIC(18,2),
    profit_commission_expected BOOLEAN NOT NULL DEFAULT FALSE,
    adjustable BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    source_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    ai_extracted JSONB,
    needs_review BOOLEAN NOT NULL DEFAULT FALSE,
    review_reason TEXT,
    merged_into_risk_id INTEGER REFERENCES risks(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_ledger_entries (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    entry_type TEXT NOT NULL,
    entry_date DATE,
    accounting_year INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'GBP',
    original_amount NUMERIC(18,2),
    gbp_amount NUMERIC(18,2) NOT NULL,
    description TEXT,
    source TEXT,
    source_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS risk_tasks (
    id SERIAL PRIMARY KEY,
    risk_id INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    owner TEXT,
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'open',
    due_date DATE,
    source TEXT,
    source_event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_events (
    id SERIAL PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'insured',
    parent_id INTEGER REFERENCES entities(id) ON DELETE SET NULL,
    region TEXT,
    handler TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entity_notes (
    id SERIAL PRIMARY KEY,
    entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
    risk_id INTEGER REFERENCES risks(id) ON DELETE SET NULL,
    note_date TEXT,
    handler TEXT,
    parties TEXT,
    summary TEXT,
    actions JSONB DEFAULT '[]',
    status_change TEXT,
    doc_type TEXT DEFAULT 'general-correspondence',
    terms JSONB DEFAULT '{}',
    source TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_needs_review ON events(needs_review);
CREATE INDEX IF NOT EXISTS idx_risks_status ON risks(status);
CREATE INDEX IF NOT EXISTS idx_risks_accounting_year ON risks(accounting_year);
CREATE INDEX IF NOT EXISTS idx_risks_assured_name ON risks(LOWER(assured_name));
CREATE INDEX IF NOT EXISTS idx_risks_merged_into_risk_id ON risks(merged_into_risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_tasks_risk_id ON risk_tasks(risk_id);
CREATE INDEX IF NOT EXISTS idx_risk_tasks_status ON risk_tasks(status);
CREATE INDEX IF NOT EXISTS idx_risk_ledger_entries_risk_id ON risk_ledger_entries(risk_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_events(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_parent ON entities(parent_id);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_entity_notes_entity ON entity_notes(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_notes_risk ON entity_notes(risk_id);
CREATE INDEX IF NOT EXISTS idx_risks_entity_id ON risks(entity_id);
"""


def ensure_schema() -> None:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(SCHEMA_SQL)
            # Migrations: add columns to existing tables (idempotent via DO blocks)
            cur.execute("""
                DO $$
                BEGIN
                    -- entity_id FK on risks
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='risks' AND column_name='entity_id') THEN
                        ALTER TABLE risks ADD COLUMN entity_id INTEGER REFERENCES entities(id) ON DELETE SET NULL;
                    END IF;
                    -- post-bind fields
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='risks' AND column_name='pb_evidence_of_cover') THEN
                        ALTER TABLE risks ADD COLUMN pb_evidence_of_cover BOOLEAN NOT NULL DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='risks' AND column_name='pb_subjectivities_cleared') THEN
                        ALTER TABLE risks ADD COLUMN pb_subjectivities_cleared BOOLEAN NOT NULL DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='risks' AND column_name='pb_invoice_sent') THEN
                        ALTER TABLE risks ADD COLUMN pb_invoice_sent BOOLEAN NOT NULL DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='risks' AND column_name='pb_closings_sent') THEN
                        ALTER TABLE risks ADD COLUMN pb_closings_sent BOOLEAN NOT NULL DEFAULT FALSE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='risks' AND column_name='pb_firm_order_date') THEN
                        ALTER TABLE risks ADD COLUMN pb_firm_order_date DATE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='risks' AND column_name='pb_formal_offer_date') THEN
                        ALTER TABLE risks ADD COLUMN pb_formal_offer_date DATE;
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='risks' AND column_name='direct_accounting') THEN
                        ALTER TABLE risks ADD COLUMN direct_accounting BOOLEAN NOT NULL DEFAULT FALSE;
                    END IF;
                    -- risk_documents table (was missing from SCHEMA_SQL, created ad-hoc previously)
                    CREATE TABLE IF NOT EXISTS risk_documents (
                        id SERIAL PRIMARY KEY,
                        risk_id INTEGER REFERENCES risks(id) ON DELETE CASCADE,
                        ingested_email_id INTEGER REFERENCES ingested_emails(id) ON DELETE SET NULL,
                        filename TEXT,
                        file_type TEXT,
                        doc_type TEXT,
                        doc_stage TEXT,
                        source_party TEXT,
                        raw_text TEXT,
                        extracted_by TEXT,
                        extraction_confidence NUMERIC(5,2),
                        extraction_error TEXT,
                        received_date DATE,
                        created_by INTEGER,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    CREATE TABLE IF NOT EXISTS risk_terms (
                        id SERIAL PRIMARY KEY,
                        risk_document_id INTEGER REFERENCES risk_documents(id) ON DELETE CASCADE,
                        risk_id INTEGER REFERENCES risks(id) ON DELETE CASCADE,
                        doc_stage TEXT,
                        source_party TEXT,
                        terms_json JSONB,
                        effective_date DATE,
                        superseded_by INTEGER REFERENCES risk_terms(id) ON DELETE SET NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                    CREATE TABLE IF NOT EXISTS risk_survey_findings (
                        id SERIAL PRIMARY KEY,
                        risk_document_id INTEGER REFERENCES risk_documents(id) ON DELETE CASCADE,
                        risk_id INTEGER REFERENCES risks(id) ON DELETE CASCADE,
                        findings_json JSONB,
                        overall_rating TEXT,
                        recommendations TEXT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    );
                END $$;
            """)
    logger.info("Database schema ensured")


if DATABASE_URL:
    try:
        ensure_schema()
    except Exception:
        logger.exception("Schema ensure failed at startup")
else:
    logger.warning("DATABASE_URL missing at startup; schema not ensured")


# -----------------------------------------------------------------------------
# Utility helpers
# -----------------------------------------------------------------------------

def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat()


def normalise_name(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


def compact_text(text: str) -> str:
    text = text.replace("\x00", "")
    text = re.sub(r"\r\n?", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def parse_decimal(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except Exception:
        return None


def parse_int_safe(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except Exception:
        return None


def canonical_risk_status(value: Optional[str]) -> str:
    raw = normalise_name(value or "")
    mapping = {
        "awaiting submission": "submission",
        "submission received": "submission",
        "submission": "submission",
        "in market": "in_market",
        "quoted": "quoted",
        "firm order": "firm_order",
        "firm": "firm_order",
        "on risk": "bound",
        "bound": "bound",
        "renewal pending": "renewal_pending",
        "expired check renewal": "expired_review",
        "expired — check renewal": "expired_review",
        "expired - check renewal": "expired_review",
        "ntu": "closed_ntu",
        "dead": "closed_ntu",
        "dead ntu": "closed_ntu",
        "closed": "closed_ntu",
    }
    return mapping.get(raw, raw.replace(" ", "_") if raw else "submission")


def display_risk_status(value: Optional[str]) -> str:
    s = canonical_risk_status(value)
    labels = {
        "submission": "Submission",
        "in_market": "In market",
        "quoted": "Quoted",
        "firm_order": "Firm order",
        "bound": "Bound",
        "renewal_pending": "Renewal pending",
        "expired_review": "Expired — check renewal",
        "closed_ntu": "NTU / Closed",
    }
    return labels.get(s, s.replace("_", " ").title())


def canonical_task_status(value: Optional[str]) -> str:
    raw = normalise_name(value or "")
    mapping = {
        "open": "open",
        "todo": "open",
        "to do": "open",
        "in progress": "in_progress",
        "in_progress": "in_progress",
        "pending": "in_progress",
        "done": "done",
        "closed": "done",
        "cancelled": "cancelled",
        "canceled": "cancelled",
    }
    return mapping.get(raw, "open")


def canonical_task_priority(value: Optional[str]) -> str:
    raw = normalise_name(value or "")
    mapping = {"low": "low", "normal": "normal", "medium": "normal", "high": "high", "urgent": "urgent"}
    return mapping.get(raw, "normal")


def validate_risk_payload(payload: Dict[str, Any], partial: bool = False) -> Optional[str]:
    if not partial:
        if not (payload.get("assured_name") or payload.get("display_name")):
            return "assured_name is required"
        if parse_int_safe(payload.get("accounting_year")) is None:
            return "accounting_year is required"

    for key in ("order_pct", "brokerage_pct", "retained_pct"):
        if key in payload and payload.get(key) not in (None, ""):
            value = parse_decimal(payload.get(key))
            if value is None or value < 0 or value > 100:
                return f"{key} must be between 0 and 100"

    for key in ("gross_premium", "estimated_gbp_commission", "locked_gbp_commission"):
        if key in payload and payload.get(key) not in (None, ""):
            value = parse_decimal(payload.get(key))
            if value is None or value < 0:
                return f"{key} must be 0 or greater"

    inception = payload.get("inception_date")
    expiry = payload.get("expiry_date")
    if inception and expiry and str(inception) > str(expiry):
        return "expiry_date must be on or after inception_date"

    if "currency" in payload and payload.get("currency"):
        ccy = str(payload.get("currency")).upper().strip()
        if len(ccy) != 3 or not ccy.isalpha():
            return "currency must be a 3-letter code"
    return None


def validate_task_payload(payload: Dict[str, Any], partial: bool = False) -> Optional[str]:
    if not partial:
        if parse_int_safe(payload.get("risk_id")) is None:
            return "risk_id is required"
        if not str(payload.get("title") or "").strip():
            return "title is required"
    return None


EMAIL_CHAIN_PATTERNS = [
    r"(?im)^from:\s.+$",
    r"(?im)^sent:\s.+$",
    r"(?im)^to:\s.+$",
    r"(?im)^subject:\s.+$",
    r"(?im)^on .+ wrote:$",
    r"(?im)^-----original message-----$",
]


def strip_email_chain(text: str) -> str:
    if not text:
        return ""
    cleaned = compact_text(text)
    cut_positions: List[int] = []
    for pat in EMAIL_CHAIN_PATTERNS:
        m = re.search(pat, cleaned)
        if m:
            cut_positions.append(m.start())
    if cut_positions:
        cleaned = cleaned[: min(cut_positions)]
    return compact_text(cleaned)


@dataclass
class ParsedEmail:
    filename: str
    sender: str
    recipients: str
    subject: str
    email_date: Optional[datetime]
    raw_body: str
    cleaned_body: str
    attachment_names: List[str]
    attachment_count: int


def parse_datetime_safe(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        from email.utils import parsedate_to_datetime
        dt = parsedate_to_datetime(value)
        if dt and dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        pass
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def _parse_eml_bytes(filename: str, raw_bytes: bytes) -> ParsedEmail:
    msg = BytesParser(policy=policy.default).parsebytes(raw_bytes)
    body_parts: List[str] = []
    attachments: List[str] = []
    if msg.is_multipart():
        for part in msg.walk():
            cd = part.get_content_disposition()
            ctype = (part.get_content_type() or "").lower()
            if cd == "attachment":
                attachments.append(part.get_filename() or "attachment")
                continue
            if ctype == "text/plain" and cd != "attachment":
                try:
                    body_parts.append(part.get_content())
                except Exception:
                    payload = part.get_payload(decode=True) or b""
                    body_parts.append(payload.decode(errors="ignore"))
    else:
        try:
            body_parts.append(msg.get_content())
        except Exception:
            payload = msg.get_payload(decode=True) or b""
            body_parts.append(payload.decode(errors="ignore"))
    raw_body = compact_text("\n\n".join([p for p in body_parts if p]))
    return ParsedEmail(
        filename=filename,
        sender=str(msg.get("From", "") or ""),
        recipients=str(msg.get("To", "") or ""),
        subject=str(msg.get("Subject", "") or ""),
        email_date=parse_datetime_safe(msg.get("Date")),
        raw_body=raw_body,
        cleaned_body=strip_email_chain(raw_body),
        attachment_names=attachments,
        attachment_count=len(attachments),
    )


def _parse_msg_bytes(filename: str, raw_bytes: bytes) -> ParsedEmail:
    if extract_msg is not None:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".msg") as tmp:
            tmp.write(raw_bytes)
            tmp_path = tmp.name
        try:
            msg = extract_msg.Message(tmp_path)
            msg_sender = getattr(msg, "sender", "") or ""
            msg_to = getattr(msg, "to", "") or ""
            msg_subject = getattr(msg, "subject", "") or ""
            msg_date = parse_datetime_safe(str(getattr(msg, "date", "") or ""))
            msg_body = compact_text(str(getattr(msg, "body", "") or ""))
            attachments = []
            try:
                for att in msg.attachments or []:
                    long_name = getattr(att, "longFilename", None) or getattr(att, "filename", None) or "attachment"
                    attachments.append(str(long_name))
            except Exception:
                pass
            return ParsedEmail(
                filename=filename,
                sender=msg_sender,
                recipients=msg_to,
                subject=msg_subject,
                email_date=msg_date,
                raw_body=msg_body,
                cleaned_body=strip_email_chain(msg_body),
                attachment_names=attachments,
                attachment_count=len(attachments),
            )
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    text = raw_bytes.decode(errors="ignore")
    return ParsedEmail(filename=filename, sender="", recipients="", subject=filename, email_date=None, raw_body=compact_text(text), cleaned_body=strip_email_chain(text), attachment_names=[], attachment_count=0)


def parse_uploaded_email(file_storage) -> ParsedEmail:
    raw_bytes = file_storage.read()
    filename = file_storage.filename or "upload"
    lower = filename.lower()
    if lower.endswith(".eml"):
        return _parse_eml_bytes(filename, raw_bytes)
    if lower.endswith(".msg"):
        return _parse_msg_bytes(filename, raw_bytes)
    text = raw_bytes.decode(errors="ignore")
    return ParsedEmail(filename=filename, sender="", recipients="", subject=filename, email_date=None, raw_body=compact_text(text), cleaned_body=strip_email_chain(text), attachment_names=[], attachment_count=0)


def anthropic_request(payload: Dict[str, Any]) -> Dict[str, Any]:
    if not ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")
    headers = {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    resp = requests.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload, timeout=90)
    resp.raise_for_status()
    return resp.json()


def anthropic_text(payload: Dict[str, Any]) -> str:
    data = anthropic_request(payload)
    blocks = data.get("content") or []
    texts = [b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"]
    return "\n".join([t for t in texts if t]).strip()


def extract_json_object(text: str) -> Dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {}
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            return {}
    return {}


INGEST_SYSTEM_PROMPT = """
You are an internal broker assistant for a Lloyd's cargo team.
Read the supplied email and return JSON only.

Required keys:
- account_name_candidates: array of strings
- matter_name_candidate: string or null
- event_date: string or null
- summary_factual: concise factual summary of the update
- requests_received: array of strings containing only explicit requests in the email
- promises_made: array of strings containing only explicit promises or commitments in the email
- suggested_actions: array of strings for useful broker actions that are clearly inferred rather than extracted
- status_change: string or null
- parties: string
- handler: string or null
- confidence: "high" | "medium" | "low"
- risk_draft: object or null with keys:
  assured_name, display_name, producer, handler, region, product, layer, status,
  accounting_year, inception_date, expiry_date, currency, gross_premium,
  brokerage_pct, retained_pct, estimated_gbp_commission, adjustable,
  profit_commission_expected, notes

Rules:
- Do not invent deadlines.
- Output valid JSON only.
""".strip()


def analyse_ingest(parsed: ParsedEmail) -> Dict[str, Any]:
    if not ANTHROPIC_API_KEY:
        return {
            "account_name_candidates": [],
            "matter_name_candidate": None,
            "event_date": iso(parsed.email_date),
            "summary_factual": parsed.cleaned_body[:500],
            "requests_received": [],
            "promises_made": [],
            "suggested_actions": [],
            "status_change": None,
            "parties": parsed.sender or "",
            "handler": None,
            "confidence": "low",
            "risk_draft": None,
        }

    user_text = {
        "filename": parsed.filename,
        "sender": parsed.sender,
        "recipients": parsed.recipients,
        "subject": parsed.subject,
        "email_date": iso(parsed.email_date),
        "attachment_names": parsed.attachment_names,
        "cleaned_body": parsed.cleaned_body,
    }
    text = anthropic_text({
        "model": ANTHROPIC_MODEL,
        "max_tokens": 1400,
        "system": INGEST_SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": json.dumps(user_text, ensure_ascii=False)}],
    })
    data = extract_json_object(text)
    return {
        "account_name_candidates": data.get("account_name_candidates") or [],
        "matter_name_candidate": data.get("matter_name_candidate"),
        "event_date": data.get("event_date") or iso(parsed.email_date),
        "summary_factual": data.get("summary_factual") or parsed.cleaned_body[:500],
        "requests_received": data.get("requests_received") or [],
        "promises_made": data.get("promises_made") or [],
        "suggested_actions": data.get("suggested_actions") or [],
        "status_change": data.get("status_change"),
        "parties": data.get("parties") or parsed.sender or "",
        "handler": data.get("handler"),
        "confidence": data.get("confidence") or "low",
        "risk_draft": data.get("risk_draft"),
        "_raw_ai_text": text,
    }


def log_event(conn, entity_type: str, entity_id: int, event_type: str, payload: Optional[Dict[str, Any]] = None, user_id: Optional[int] = None) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO activity_events (entity_type, entity_id, event_type, payload, user_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (entity_type, entity_id, event_type, json.dumps(payload or {}), user_id),
        )


def get_risk_row(conn, risk_id: int) -> Optional[Dict[str, Any]]:
    """Fetch a single risk row with account/matter/entity names joined."""
    with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
        cur.execute("""
            SELECT r.*,
                   a.canonical_name AS account_name,
                   m.title AS matter_title,
                   e.name AS entity_name,
                   pe.name AS producer_entity_name
            FROM risks r
            LEFT JOIN accounts a ON a.id = r.account_id
            LEFT JOIN matters m ON m.id = r.matter_id
            LEFT JOIN entities e ON e.id = r.entity_id
            LEFT JOIN entities pe ON pe.id = e.parent_id
            WHERE r.id = %s
        """, (risk_id,))
        row = cur.fetchone()
        return dict(row) if row else None


def append_note(existing: Optional[str], new_text: str) -> str:
    """Append text to an existing notes field with separator."""
    if not existing or not existing.strip():
        return new_text
    return existing.rstrip() + "\n\n" + new_text


def serialise_risk(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("id"),
        "account_id": row.get("account_id"),
        "account_name": row.get("account_name"),
        "matter_id": row.get("matter_id"),
        "matter_title": row.get("matter_title"),
        "assured_name": row.get("assured_name"),
        "display_name": row.get("display_name"),
        "producer": row.get("producer"),
        "handler": row.get("handler"),
        "region": row.get("region"),
        "product": row.get("product"),
        "layer": row.get("layer"),
        "status": canonical_risk_status(row.get("status")),
        "status_label": display_risk_status(row.get("status")),
        "accounting_year": row.get("accounting_year"),
        "inception_date": str(row.get("inception_date")) if row.get("inception_date") else None,
        "expiry_date": str(row.get("expiry_date")) if row.get("expiry_date") else None,
        "currency": row.get("currency"),
        "gross_premium": float(row["gross_premium"]) if row.get("gross_premium") is not None else None,
        "order_pct": float(row["order_pct"]) if row.get("order_pct") is not None else None,
        "brokerage_pct": float(row["brokerage_pct"]) if row.get("brokerage_pct") is not None else None,
        "retained_pct": float(row["retained_pct"]) if row.get("retained_pct") is not None else None,
        "estimated_gbp_commission": float(row["estimated_gbp_commission"]) if row.get("estimated_gbp_commission") is not None else None,
        "locked_gbp_commission": float(row["locked_gbp_commission"]) if row.get("locked_gbp_commission") is not None else None,
        "profit_commission_expected": bool(row.get("profit_commission_expected")),
        "adjustable": bool(row.get("adjustable")),
        "notes": row.get("notes"),
        "source_event_id": row.get("source_event_id"),
        "ai_extracted": row.get("ai_extracted") if isinstance(row.get("ai_extracted"), dict) else {},
        "needs_review": bool(row.get("needs_review")),
        "review_reason": row.get("review_reason"),
        "merged_into_risk_id": row.get("merged_into_risk_id"),
        "entity_id": row.get("entity_id"),
        "entity_name": row.get("entity_name"),
        "producer_entity_name": row.get("producer_entity_name"),
        "pb_evidence_of_cover": bool(row.get("pb_evidence_of_cover")),
        "pb_subjectivities_cleared": bool(row.get("pb_subjectivities_cleared")),
        "pb_invoice_sent": bool(row.get("pb_invoice_sent")),
        "pb_closings_sent": bool(row.get("pb_closings_sent")),
        "pb_firm_order_date": str(row.get("pb_firm_order_date")) if row.get("pb_firm_order_date") else None,
        "pb_formal_offer_date": str(row.get("pb_formal_offer_date")) if row.get("pb_formal_offer_date") else None,
        "direct_accounting": bool(row.get("direct_accounting")),
        "created_at": iso(row.get("created_at")),
        "updated_at": iso(row.get("updated_at")),
    }


def serialise_task(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("id"),
        "risk_id": row.get("risk_id"),
        "title": row.get("title"),
        "description": row.get("description"),
        "owner": row.get("owner"),
        "priority": canonical_task_priority(row.get("priority")),
        "status": canonical_task_status(row.get("status")),
        "due_date": str(row.get("due_date")) if row.get("due_date") else None,
        "source": row.get("source"),
        "source_event_id": row.get("source_event_id"),
        "created_at": iso(row.get("created_at")),
        "updated_at": iso(row.get("updated_at")),
        "assured_name": row.get("assured_name"),
        "display_name": row.get("display_name"),
        "producer": row.get("producer"),
        "risk_status": canonical_risk_status(row.get("risk_status")) if row.get("risk_status") else None,
        "accounting_year": row.get("accounting_year"),
    }


def serialise_ledger_entry(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("id"),
        "risk_id": row.get("risk_id"),
        "entry_type": row.get("entry_type"),
        "entry_date": str(row.get("entry_date")) if row.get("entry_date") else None,
        "accounting_year": row.get("accounting_year"),
        "currency": row.get("currency"),
        "original_amount": float(row["original_amount"]) if row.get("original_amount") is not None else None,
        "gbp_amount": float(row["gbp_amount"]) if row.get("gbp_amount") is not None else None,
        "description": row.get("description"),
        "source": row.get("source"),
        "source_event_id": row.get("source_event_id"),
        "created_at": iso(row.get("created_at")),
    }


@app.errorhandler(413)
def too_large(_err):
    return jsonify({"error": "file_too_large", "message": f"Upload exceeds {MAX_UPLOAD_MB}MB limit"}), 413


@app.get("/")
@rate_limited("default_read")
def root():
    return jsonify({"ok": True, "status": "ok", "service": "og-backend", "health_url": f"{APP_BASE_URL}/health"})


@app.get("/health")
@rate_limited("default_read")
def health():
    try:
        with get_conn() as conn:
            with conn.cursor() as cur:
                counts = {}
                for table, key in [("users","user_count"),("events","event_count"),("ingested_emails","email_count"),("risks","risk_count"),("risk_tasks","task_count"),("activity_events","activity_event_count"),("entities","entity_count"),("entity_notes","entity_note_count")]:
                    cur.execute(f"SELECT COUNT(*) FROM {table}")
                    counts[key] = cur.fetchone()[0]
        return jsonify({
            "ok": True, "status": "ok", "service": "og-backend",
            "database": True, "anthropic_key_present": bool(ANTHROPIC_API_KEY),
            "admin_token_present": bool(ADMIN_TOKEN), "frontend_origin_set": bool(FRONTEND_ORIGIN),
            **counts
        })
    except Exception as e:
        logger.exception("Health check failed")
        return jsonify({"ok": False, "status": "error", "error": str(e)}), 500


@app.get("/users")
@require_admin
@rate_limited("default_read")
def list_users():
    with get_conn() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                SELECT id, name, username, email, role, is_active, created_at
                FROM users
                WHERE is_active = TRUE
                ORDER BY CASE role WHEN 'admin' THEN 1 ELSE 2 END, LOWER(name)
            """)
            rows = [dict(r) for r in cur.fetchall()]
    return jsonify({"items": rows})


@app.get("/anthropic-test")
@require_admin
@rate_limited("ai")
def anthropic_test():
    if not ANTHROPIC_API_KEY:
        return jsonify({"ok": False, "status": "error", "error": "ANTHROPIC_API_KEY missing"}), 500
    try:
        text = anthropic_text({"model": ANTHROPIC_MODEL, "max_tokens": 8, "messages": [{"role": "user", "content": "Reply with OK only."}]})
        return jsonify({"ok": text.strip().upper().startswith("OK"), "status": "ok", "reply": text})
    except Exception as e:
        return jsonify({"ok": False, "status": "error", "error": str(e)}), 500


@app.post("/ai")
@require_admin
@rate_limited("ai")
def ai_proxy():
    try:
        payload = request.get_json(force=True, silent=False) or {}
        clean_payload = {
            "model": payload.get("model") or ANTHROPIC_MODEL,
            "max_tokens": int(payload.get("max_tokens") or 1200),
            "system": payload.get("system") or "",
            "messages": payload.get("messages") or [],
        }
        if payload.get("tools"):
            clean_payload["tools"] = payload.get("tools")
        if payload.get("tool_choice"):
            clean_payload["tool_choice"] = payload.get("tool_choice")
        if payload.get("temperature") is not None:
            clean_payload["temperature"] = payload.get("temperature")
        if not clean_payload["messages"]:
            user = payload.get("user")
            if user:
                clean_payload["messages"] = [{"role": "user", "content": user}]
        data = anthropic_request(clean_payload)
        return jsonify(data)
    except requests.HTTPError as e:
        body = e.response.text if e.response is not None else str(e)
        return jsonify({"error": {"message": body}}), 502
    except Exception as e:
        logger.exception("AI proxy failed")
        return jsonify({"error": {"message": str(e)}}), 500


@app.post("/parse")
@require_admin
@rate_limited("upload")
def parse_email_route():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        parsed = parse_uploaded_email(request.files["file"])
        return jsonify({
            "filename": parsed.filename,
            "from": parsed.sender,
            "to": parsed.recipients,
            "subject": parsed.subject,
            "date": iso(parsed.email_date),
            "body": parsed.raw_body,
            "clean_text": parsed.cleaned_body,
            "attachments": parsed.attachment_names,
            "attachment_count": parsed.attachment_count,
        })
    except Exception as e:
        logger.exception("Parse failed")
        return jsonify({"error": str(e)}), 500


@app.post("/ingest-email")
@require_admin
@rate_limited("upload")
def ingest_email():
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400
        parsed = parse_uploaded_email(request.files["file"])
        ingest = analyse_ingest(parsed)
        user_id = get_user_id_from_request()

        event_dt = parse_datetime_safe(ingest.get("event_date")) or parsed.email_date or now_utc()
        ai_output = {
            "summary_factual": ingest.get("summary_factual"),
            "requests_received": ingest.get("requests_received") or [],
            "promises_made": ingest.get("promises_made") or [],
            "suggested_actions": ingest.get("suggested_actions") or [],
            "status_change": ingest.get("status_change"),
            "confidence": ingest.get("confidence"),
            "risk_draft": ingest.get("risk_draft"),
            "raw_ai_text": ingest.get("_raw_ai_text", ""),
        }

        with get_conn() as conn:
            with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
                cur.execute("""
                    INSERT INTO events (
                        source_type, source_ref, event_at, subject, sender, recipients,
                        raw_body, cleaned_body, summary_factual, requests_received,
                        promises_made, suggested_actions, ai_output, needs_review, review_reason
                    )
                    VALUES ('email_ingest', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, TRUE, 'Awaiting review')
                    RETURNING *
                """, (
                    parsed.filename, event_dt, parsed.subject, parsed.sender, parsed.recipients,
                    parsed.raw_body, parsed.cleaned_body, ingest.get("summary_factual", ""),
                    json.dumps(ingest.get("requests_received") or []),
                    json.dumps(ingest.get("promises_made") or []),
                    json.dumps(ingest.get("suggested_actions") or []),
                    json.dumps(ai_output),
                ))
                event_row = dict(cur.fetchone())

                cur.execute("""
                    INSERT INTO ingested_emails (
                        source_filename, sender, subject, email_date,
                        raw_body, cleaned_body, ai_note, saved_event_id
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    parsed.filename, parsed.sender, parsed.subject, event_dt,
                    parsed.raw_body, parsed.cleaned_body, json.dumps(ai_output), event_row["id"],
                ))
                ingested_id = cur.fetchone()["id"]
                log_event(conn, "risk", event_row["id"], "ingest_event", {"subject": parsed.subject, "sender": parsed.sender}, user_id)

        # Build note/match shape expected by frontend
        note = {
            "date": ingest.get("event_date") or iso(parsed.email_date) or "",
            "handler": ingest.get("handler") or "",
            "parties": ingest.get("parties") or parsed.sender or "",
            "summary": ingest.get("summary_factual") or "",
            "actions": ingest.get("suggested_actions") or [],
            "statusChange": ingest.get("status_change") or "",
            "docType": "general-correspondence",
            "terms": {},
            "insuredName": (ingest.get("account_name_candidates") or [""])[0] if ingest.get("account_name_candidates") else "",
        }
        candidates = ingest.get("account_name_candidates") or []
        match = {
            "matched_id": None,
            "matched_name": candidates[0] if candidates else None,
            "confidence": ingest.get("confidence") or "low",
            "reason": "Name extracted from email" if candidates else "No account name found",
        }

        return jsonify({
            "success": True,
            "saved": True,
            "event_id": event_row["id"],
            "saved_record_id": ingested_id,
            "from": parsed.sender,
            "to": parsed.recipients,
            "subject": parsed.subject,
            "date": iso(parsed.email_date),
            "body": parsed.raw_body,
            "clean_text": parsed.cleaned_body,
            "attachments": parsed.attachment_names,
            "attachment_count": parsed.attachment_count,
            "event": {
                "id": event_row["id"],
                "event_at": iso(event_row["event_at"]),
                "subject": event_row["subject"],
                "summary_factual": event_row["summary_factual"],
                "needs_review": event_row["needs_review"],
                "review_reason": event_row["review_reason"],
            },
            "ingest": ingest,
            "note": note,
            "match": match,
        })
    except Exception as e:
        logger.exception("Ingest failed")
        return jsonify({"error": str(e)}), 500


@app.get("/risks")
@require_admin
@rate_limited("default_read")
def list_risks():
    q = (request.args.get("q") or "").strip()
    year = parse_int_safe(request.args.get("accounting_year"))
    producer = (request.args.get("producer") or "").strip()
    pipeline_only = str(request.args.get("pipeline_only") or "").lower() in {"1", "true", "yes"}
    include_merged = str(request.args.get("include_merged") or "").lower() in {"1", "true", "yes"}
    limit = min(int(request.args.get("limit") or 250), 1000)
    offset = max(int(request.args.get("offset") or 0), 0)

    where, params = [], []
    if q:
        where.append("(LOWER(r.assured_name) LIKE %s OR LOWER(COALESCE(r.display_name,'')) LIKE %s OR LOWER(COALESCE(r.producer,'')) LIKE %s)")
        like = f"%{q.lower()}%"
        params.extend([like, like, like])
    if year is not None:
        where.append("r.accounting_year = %s")
        params.append(year)
    if request.args.get("status"):
        where.append("r.status = %s")
        params.append(canonical_risk_status(request.args.get("status")))
    if request.args.get("needs_review") is not None:
        where.append("r.needs_review = %s")
        params.append(str(request.args.get("needs_review")).lower() in {"1","true","yes"})
    if producer:
        where.append("LOWER(COALESCE(r.producer,'')) = %s")
        params.append(producer.lower())
    if pipeline_only:
        where.append("r.status IN ('submission','in_market','quoted','firm_order','renewal_pending')")
    if not include_merged:
        where.append("r.merged_into_risk_id IS NULL")

    sql = """
        SELECT r.*,
               COALESCE((SELECT COUNT(*) FROM risk_tasks t WHERE t.risk_id = r.id AND t.status != 'done'), 0) AS open_task_count,
               e.name AS entity_name,
               pe.name AS producer_entity_name
        FROM risks r
        LEFT JOIN entities e ON e.id = r.entity_id
        LEFT JOIN entities pe ON pe.id = e.parent_id
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY r.accounting_year DESC, LOWER(r.assured_name), r.id DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    with get_conn() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(sql, params)
            items = [serialise_risk(dict(r)) | {"open_task_count": int(r.get("open_task_count") or 0)} for r in cur.fetchall()]
    return jsonify({"items": items, "total": len(items)})


@app.post("/risks")
@require_admin
@rate_limited("default_write")
def create_risk():
    payload = request.get_json(force=True, silent=True) or {}
    error = validate_risk_payload(payload, partial=False)
    if error:
        return jsonify({"error": error}), 400
    user_id = get_user_id_from_request()

    assured_name = (payload.get("assured_name") or payload.get("display_name") or "").strip()
    accounting_year = parse_int_safe(payload.get("accounting_year"))
    with get_conn() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                INSERT INTO risks (
                    assured_name, display_name, producer, handler, region, product, layer, status,
                    accounting_year, inception_date, expiry_date, currency,
                    gross_premium, brokerage_pct, retained_pct, estimated_gbp_commission,
                    adjustable, profit_commission_expected, notes, source_event_id,
                    ai_extracted, needs_review, review_reason, merged_into_risk_id,
                    entity_id, direct_accounting
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NULL,%s,%s)
                RETURNING *
            """, (
                assured_name,
                payload.get("display_name"),
                payload.get("producer"),
                payload.get("handler"),
                payload.get("region"),
                payload.get("product"),
                payload.get("layer"),
                canonical_risk_status(payload.get("status")),
                accounting_year,
                payload.get("inception_date"),
                payload.get("expiry_date"),
                str(payload.get("currency") or "USD").upper(),
                parse_decimal(payload.get("gross_premium")),
                parse_decimal(payload.get("brokerage_pct")),
                parse_decimal(payload.get("retained_pct")),
                parse_decimal(payload.get("estimated_gbp_commission")),
                bool(payload.get("adjustable", False)),
                bool(payload.get("profit_commission_expected", False)),
                payload.get("notes"),
                payload.get("source_event_id"),
                json.dumps(payload.get("ai_extracted") or {}),
                bool(payload.get("needs_review", False)),
                payload.get("review_reason"),
                parse_int_safe(payload.get("entity_id")),
                bool(payload.get("direct_accounting", False)),
            ))
            row = dict(cur.fetchone())
            log_event(conn, "risk", row["id"], "risk_created", {"assured_name": assured_name, "status": canonical_risk_status(payload.get("status"))}, user_id)
        full = get_risk_row(conn, row["id"])
    return jsonify(serialise_risk(full or row)), 201


@app.get("/risks/<int:risk_id>")
@require_admin
@rate_limited("default_read")
def get_risk(risk_id: int):
    with get_conn() as conn:
        row = get_risk_row(conn, risk_id)
        if not row:
            return jsonify({"error": "Risk not found"}), 404
    return jsonify(serialise_risk(row))


@app.patch("/risks/<int:risk_id>")
@require_admin
@rate_limited("default_write")
def update_risk(risk_id: int):
    payload = request.get_json(force=True, silent=True) or {}
    error = validate_risk_payload(payload, partial=True)
    if error:
        return jsonify({"error": error}), 400
    user_id = get_user_id_from_request()

    allowed = {
        "assured_name": payload.get("assured_name"),
        "display_name": payload.get("display_name"),
        "producer": payload.get("producer"),
        "handler": payload.get("handler"),
        "region": payload.get("region"),
        "product": payload.get("product"),
        "layer": payload.get("layer"),
        "status": canonical_risk_status(payload["status"]) if "status" in payload else None,
        "accounting_year": parse_int_safe(payload.get("accounting_year")) if "accounting_year" in payload else None,
        "inception_date": payload.get("inception_date") if "inception_date" in payload else None,
        "expiry_date": payload.get("expiry_date") if "expiry_date" in payload else None,
        "currency": str(payload.get("currency")).upper() if payload.get("currency") else payload.get("currency"),
        "gross_premium": parse_decimal(payload.get("gross_premium")) if "gross_premium" in payload else None,
        "brokerage_pct": parse_decimal(payload.get("brokerage_pct")) if "brokerage_pct" in payload else None,
        "retained_pct": parse_decimal(payload.get("retained_pct")) if "retained_pct" in payload else None,
        "estimated_gbp_commission": parse_decimal(payload.get("estimated_gbp_commission")) if "estimated_gbp_commission" in payload else None,
        "adjustable": bool(payload.get("adjustable")) if "adjustable" in payload else None,
        "profit_commission_expected": bool(payload.get("profit_commission_expected")) if "profit_commission_expected" in payload else None,
        "notes": payload.get("notes"),
        "source_event_id": payload.get("source_event_id"),
        "ai_extracted": json.dumps(payload.get("ai_extracted") or {}) if "ai_extracted" in payload else None,
        "needs_review": bool(payload.get("needs_review")) if "needs_review" in payload else None,
        "review_reason": payload.get("review_reason"),
        "merged_into_risk_id": payload.get("merged_into_risk_id"),
        "entity_id": parse_int_safe(payload.get("entity_id")) if "entity_id" in payload else None,
        "pb_evidence_of_cover": bool(payload.get("pb_evidence_of_cover")) if "pb_evidence_of_cover" in payload else None,
        "pb_subjectivities_cleared": bool(payload.get("pb_subjectivities_cleared")) if "pb_subjectivities_cleared" in payload else None,
        "pb_invoice_sent": bool(payload.get("pb_invoice_sent")) if "pb_invoice_sent" in payload else None,
        "pb_closings_sent": bool(payload.get("pb_closings_sent")) if "pb_closings_sent" in payload else None,
        "pb_firm_order_date": payload.get("pb_firm_order_date") if "pb_firm_order_date" in payload else None,
        "pb_formal_offer_date": payload.get("pb_formal_offer_date") if "pb_formal_offer_date" in payload else None,
        "direct_accounting": bool(payload.get("direct_accounting")) if "direct_accounting" in payload else None,
    }
    updates, params = [], []
    for field, value in allowed.items():
        if field in payload:
            updates.append(f"{field} = %s")
            params.append(value)
    if not updates:
        return jsonify({"error": "No valid fields to update"}), 400
    updates.append("updated_at = NOW()")
    params.append(risk_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE risks SET {', '.join(updates)} WHERE id = %s", params)
            if cur.rowcount == 0:
                return jsonify({"error": "Risk not found"}), 404
            log_event(conn, "risk", risk_id, "risk_updated", payload, user_id)
        row = get_risk_row(conn, risk_id)
    return jsonify(serialise_risk(row))


@app.get("/risks/<int:risk_id>/activity")
@require_admin
@rate_limited("default_read")
def risk_activity(risk_id: int):
    with get_conn() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                SELECT ae.*, u.name, u.username
                FROM activity_events ae
                LEFT JOIN users u ON u.id = ae.user_id
                WHERE entity_type = 'risk' AND entity_id = %s
                ORDER BY created_at DESC, id DESC
            """, (risk_id,))
            rows = [dict(r) for r in cur.fetchall()]
    return jsonify({"items": rows})


@app.post("/risks/<int:source_risk_id>/merge")
@require_admin
@rate_limited("default_write")
def merge_risk(source_risk_id: int):
    payload = request.get_json(force=True, silent=True) or {}
    target_risk_id = parse_int_safe(payload.get("target_risk_id"))
    if target_risk_id is None:
        return jsonify({"error": "target_risk_id is required"}), 400
    if target_risk_id == source_risk_id:
        return jsonify({"error": "source and target risk cannot be the same"}), 400
    user_id = get_user_id_from_request()

    with get_conn() as conn:
        source = get_risk_row(conn, source_risk_id)
        target = get_risk_row(conn, target_risk_id)
        if not source:
            return jsonify({"error": "Source risk not found"}), 404
        if not target:
            return jsonify({"error": "Target risk not found"}), 404
        if source.get("merged_into_risk_id"):
            return jsonify({"error": "Source risk has already been merged"}), 400
        if target.get("merged_into_risk_id"):
            return jsonify({"error": "Target risk is itself already merged into another risk"}), 400

        merge_note = payload.get("note") or ""
        merged_notes = append_note(target.get("notes"), f"Merged from risk #{source_risk_id} on {now_utc().date().isoformat()}.\n{merge_note}".strip())

        with conn.cursor() as cur:
            cur.execute("UPDATE risk_tasks SET risk_id = %s, updated_at = NOW() WHERE risk_id = %s", (target_risk_id, source_risk_id))
            cur.execute("UPDATE risk_ledger_entries SET risk_id = %s WHERE risk_id = %s", (target_risk_id, source_risk_id))
            cur.execute("""
                UPDATE risks
                SET status = 'closed_ntu', needs_review = FALSE, review_reason = 'merged',
                    merged_into_risk_id = %s, updated_at = NOW()
                WHERE id = %s
            """, (target_risk_id, source_risk_id))
            cur.execute("UPDATE risks SET notes = %s, updated_at = NOW() WHERE id = %s", (merged_notes, target_risk_id))
            log_event(conn, "risk", target_risk_id, "risk_merged", {"source_id": source_risk_id, "note": merge_note}, user_id)
        source_after = get_risk_row(conn, source_risk_id)
        target_after = get_risk_row(conn, target_risk_id)
    return jsonify({"ok": True, "source": serialise_risk(source_after), "target": serialise_risk(target_after), "moved": {"tasks": True, "ledger_entries": True}})


@app.get("/risks/<int:risk_id>/ledger")
@require_admin
@rate_limited("default_read")
def list_risk_ledger_entries(risk_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM risks WHERE id = %s", (risk_id,))
            if not cur.fetchone():
                return jsonify({"error": "Risk not found"}), 404
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("SELECT * FROM risk_ledger_entries WHERE risk_id = %s ORDER BY COALESCE(entry_date, created_at) ASC, id ASC", (risk_id,))
            rows = [serialise_ledger_entry(dict(r)) for r in cur.fetchall()]
    return jsonify({"items": rows})


@app.post("/risks/<int:risk_id>/ledger")
@require_admin
@rate_limited("default_write")
def create_risk_ledger_entry(risk_id: int):
    payload = request.get_json(force=True, silent=True) or {}
    entry_type = (payload.get("entry_type") or "").strip().lower()
    if entry_type not in {"original", "ap", "rp", "pc", "adj"}:
        return jsonify({"error": "entry_type must be one of: original, ap, rp, pc, adj"}), 400
    accounting_year = parse_int_safe(payload.get("accounting_year"))
    gbp_amount = parse_decimal(payload.get("gbp_amount"))
    if accounting_year is None:
        return jsonify({"error": "accounting_year is required"}), 400
    if gbp_amount is None:
        return jsonify({"error": "gbp_amount is required"}), 400
    user_id = get_user_id_from_request()

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM risks WHERE id = %s", (risk_id,))
            if not cur.fetchone():
                return jsonify({"error": "Risk not found"}), 404
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                INSERT INTO risk_ledger_entries (
                    risk_id, entry_type, entry_date, accounting_year, currency,
                    original_amount, gbp_amount, description, source, source_event_id
                ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                risk_id, entry_type, payload.get("entry_date"), accounting_year,
                str(payload.get("currency") or "GBP").upper(),
                parse_decimal(payload.get("original_amount")), gbp_amount,
                payload.get("description"), payload.get("source") or "manual", payload.get("source_event_id"),
            ))
            row = dict(cur.fetchone())
            log_event(conn, "risk", risk_id, "ledger_entry_added", {"entry_type": entry_type, "gbp_amount": gbp_amount, "description": payload.get("description")}, user_id)
    return jsonify(serialise_ledger_entry(row)), 201


@app.get("/portfolio-by-year")
@require_admin
@rate_limited("default_read")
def portfolio_by_year():
    year = parse_int_safe(request.args.get("year"))
    if year is None:
        return jsonify({"error": "year is required"}), 400
    status = request.args.get("status")
    q = (request.args.get("q") or "").strip()
    where = ["r.accounting_year = %s", "r.merged_into_risk_id IS NULL"]
    params: List[Any] = [year]
    if status:
        where.append("r.status = %s")
        params.append(canonical_risk_status(status))
    if q:
        where.append("(LOWER(r.assured_name) LIKE %s OR LOWER(COALESCE(r.display_name,'')) LIKE %s OR LOWER(COALESCE(r.producer,'')) LIKE %s)")
        like = f"%{q.lower()}%"
        params.extend([like, like, like])
    sql = f"""
        SELECT r.*,
               COALESCE((SELECT SUM(gbp_amount) FROM risk_ledger_entries le WHERE le.risk_id = r.id), 0) AS ledger_total_gbp,
               COALESCE((SELECT SUM(gbp_amount) FROM risk_ledger_entries le WHERE le.risk_id = r.id AND le.entry_type = 'ap'), 0) AS ap_gbp,
               COALESCE((SELECT SUM(gbp_amount) FROM risk_ledger_entries le WHERE le.risk_id = r.id AND le.entry_type = 'rp'), 0) AS rp_gbp,
               COALESCE((SELECT SUM(gbp_amount) FROM risk_ledger_entries le WHERE le.risk_id = r.id AND le.entry_type = 'pc'), 0) AS pc_gbp,
               COALESCE((SELECT SUM(gbp_amount) FROM risk_ledger_entries le WHERE le.risk_id = r.id AND le.entry_type = 'adj'), 0) AS adj_gbp,
               COALESCE((SELECT COUNT(*) FROM risk_tasks t WHERE t.risk_id = r.id AND t.status != 'done'), 0) AS open_task_count,
               e.name AS entity_name,
               pe.name AS producer_entity_name
        FROM risks r
        LEFT JOIN entities e ON e.id = r.entity_id
        LEFT JOIN entities pe ON pe.id = e.parent_id
        WHERE {" AND ".join(where)}
        ORDER BY LOWER(r.assured_name), r.id DESC
    """
    with get_conn() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(sql, params)
            raw_rows = [dict(r) for r in cur.fetchall()]
    items, totals = [], {"count":0,"gross_premium":0.0,"estimated_gbp_commission":0.0,"locked_gbp_commission":0.0,"ledger_total_gbp":0.0,"ap_gbp":0.0,"rp_gbp":0.0,"pc_gbp":0.0,"adj_gbp":0.0,"open_task_count":0}
    for row in raw_rows:
        item = serialise_risk(row)
        item["ledger_total_gbp"] = float(row["ledger_total_gbp"] or 0)
        item["ap_gbp"] = float(row["ap_gbp"] or 0)
        item["rp_gbp"] = float(row["rp_gbp"] or 0)
        item["pc_gbp"] = float(row["pc_gbp"] or 0)
        item["adj_gbp"] = float(row["adj_gbp"] or 0)
        item["open_task_count"] = int(row["open_task_count"] or 0)
        items.append(item)
        totals["count"] += 1
        totals["gross_premium"] += item["gross_premium"] or 0
        totals["estimated_gbp_commission"] += item["estimated_gbp_commission"] or 0
        totals["locked_gbp_commission"] += item["locked_gbp_commission"] or 0
        totals["ledger_total_gbp"] += item["ledger_total_gbp"]
        totals["ap_gbp"] += item["ap_gbp"]
        totals["rp_gbp"] += item["rp_gbp"]
        totals["pc_gbp"] += item["pc_gbp"]
        totals["adj_gbp"] += item["adj_gbp"]
        totals["open_task_count"] += item["open_task_count"]
    return jsonify({"year": year, "items": items, "totals": totals})


@app.get("/tasks")
@require_admin
@rate_limited("default_read")
def list_tasks():
    status = request.args.get("status")
    owner = (request.args.get("owner") or "").strip()
    risk_id = parse_int_safe(request.args.get("risk_id"))
    include_done = str(request.args.get("include_done") or "").lower() in {"1","true","yes"}
    limit = min(int(request.args.get("limit") or 250), 1000)
    offset = max(int(request.args.get("offset") or 0), 0)
    where, params = ["r.merged_into_risk_id IS NULL"], []
    if risk_id is not None:
        where.append("t.risk_id = %s")
        params.append(risk_id)
    if status:
        where.append("t.status = %s")
        params.append(canonical_task_status(status))
    elif not include_done:
        where.append("t.status != 'done'")
    if owner:
        where.append("LOWER(COALESCE(t.owner,'')) = %s")
        params.append(owner.lower())
    sql = """
        SELECT t.*, r.assured_name, r.display_name, r.producer, r.status AS risk_status, r.accounting_year
        FROM risk_tasks t
        JOIN risks r ON r.id = t.risk_id
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += """ ORDER BY CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
                      t.due_date NULLS LAST, t.id DESC LIMIT %s OFFSET %s"""
    params.extend([limit, offset])
    with get_conn() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(sql, params)
            items = [serialise_task(dict(r)) for r in cur.fetchall()]
    return jsonify({"items": items, "total": len(items)})


@app.post("/tasks")
@require_admin
@rate_limited("default_write")
def create_task():
    payload = request.get_json(force=True, silent=True) or {}
    error = validate_task_payload(payload, partial=False)
    if error:
        return jsonify({"error": error}), 400
    user_id = get_user_id_from_request()
    risk_id = parse_int_safe(payload.get("risk_id"))
    title = str(payload.get("title") or "").strip()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM risks WHERE id = %s", (risk_id,))
            if not cur.fetchone():
                return jsonify({"error": "Risk not found"}), 404
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                INSERT INTO risk_tasks (risk_id, title, description, owner, priority, status, due_date, source, source_event_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING *
            """, (
                risk_id, title, payload.get("description"), payload.get("owner"),
                canonical_task_priority(payload.get("priority")), canonical_task_status(payload.get("status")),
                payload.get("due_date"), payload.get("source") or "manual", payload.get("source_event_id"),
            ))
            row = dict(cur.fetchone())
            cur.execute("""
                SELECT t.*, r.assured_name, r.display_name, r.producer, r.status AS risk_status, r.accounting_year
                FROM risk_tasks t JOIN risks r ON r.id = t.risk_id WHERE t.id = %s
            """, (row["id"],))
            full = dict(cur.fetchone())
            log_event(conn, "risk", risk_id, "task_created", {"title": title, "owner": payload.get("owner"), "due_date": payload.get("due_date")}, user_id)
    return jsonify(serialise_task(full)), 201


@app.get("/risks/<int:risk_id>/tasks")
@require_admin
@rate_limited("default_read")
def list_risk_tasks(risk_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM risks WHERE id = %s", (risk_id,))
            if not cur.fetchone():
                return jsonify({"error": "Risk not found"}), 404
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                SELECT t.*, r.assured_name, r.display_name, r.producer, r.status AS risk_status, r.accounting_year
                FROM risk_tasks t JOIN risks r ON r.id = t.risk_id
                WHERE t.risk_id = %s
                ORDER BY CASE t.status WHEN 'open' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
                         CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,
                         t.due_date NULLS LAST, t.id DESC
            """, (risk_id,))
            items = [serialise_task(dict(r)) for r in cur.fetchall()]
    return jsonify({"items": items, "total": len(items)})


@app.patch("/tasks/<int:task_id>")
@require_admin
@rate_limited("default_write")
def update_task(task_id: int):
    payload = request.get_json(force=True, silent=True) or {}
    error = validate_task_payload(payload, partial=True)
    if error:
        return jsonify({"error": error}), 400
    user_id = get_user_id_from_request()
    allowed = {
        "title": payload.get("title"),
        "description": payload.get("description"),
        "owner": payload.get("owner"),
        "priority": canonical_task_priority(payload.get("priority")) if "priority" in payload else None,
        "status": canonical_task_status(payload.get("status")) if "status" in payload else None,
        "due_date": payload.get("due_date") if "due_date" in payload else None,
        "source": payload.get("source"),
        "source_event_id": payload.get("source_event_id"),
    }
    updates, params = [], []
    for field, value in allowed.items():
        if field in payload:
            updates.append(f"{field} = %s")
            params.append(value)
    if not updates:
        return jsonify({"error": "No valid fields to update"}), 400
    updates.append("updated_at = NOW()")
    params.append(task_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE risk_tasks SET {', '.join(updates)} WHERE id = %s", params)
            if cur.rowcount == 0:
                return jsonify({"error": "Task not found"}), 404
            cur.execute("SELECT risk_id FROM risk_tasks WHERE id = %s", (task_id,))
            risk_id = cur.fetchone()[0]
            log_event(conn, "risk", risk_id, "task_updated", payload, user_id)
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                SELECT t.*, r.assured_name, r.display_name, r.producer, r.status AS risk_status, r.accounting_year
                FROM risk_tasks t JOIN risks r ON r.id = t.risk_id WHERE t.id = %s
            """, (task_id,))
            row = dict(cur.fetchone())
    return jsonify(serialise_task(row))


@app.route('/risks/<int:risk_id>/store-extractions', methods=['POST'])
@require_admin
def store_extractions_endpoint(risk_id):
    """Store pre-processed extractions against a risk."""
    data = request.get_json()
    extractions = data.get('extractions', [])
    user_id = get_user_id_from_request() or 1
    doc_ids = []
    with get_conn() as conn:
        for att in extractions:
            classification = att.get('classification', {})
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO risk_documents
                      (risk_id, filename, file_type, doc_type, doc_stage,
                       source_party, extracted_by, extraction_confidence,
                       extraction_error, received_date, created_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    risk_id,
                    att.get('filename', 'unknown'),
                    att.get('file_type', 'unknown'),
                    classification.get('doc_type', 'unknown'),
                    classification.get('doc_stage', 'indicated'),
                    classification.get('source_party'),
                    'claude-haiku-4-5-20251001',
                    classification.get('confidence', 0.0),
                    att.get('error'),
                    date.today(),
                    user_id
                ))
                doc_id = cur.fetchone()[0]
                doc_ids.append(doc_id)
            if att.get('terms'):
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO risk_terms
                          (risk_document_id, risk_id, doc_stage, source_party,
                           terms_json, effective_date)
                        VALUES (%s, %s, %s, %s, %s, %s)
                    """, (
                        doc_id, risk_id,
                        classification.get('doc_stage', 'indicated'),
                        classification.get('source_party'),
                        json.dumps(att['terms']),
                        date.today()
                    ))
            if att.get('survey_findings'):
                findings = att['survey_findings']
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO risk_survey_findings
                          (risk_document_id, risk_id, findings_json,
                           overall_rating, recommendations)
                        VALUES (%s, %s, %s, %s, %s)
                    """, (
                        doc_id, risk_id,
                        json.dumps(findings),
                        findings.get('overall_rating'),
                        '\n'.join(findings.get('recommendations', []))
                    ))
    return jsonify({'document_ids': doc_ids})


# -----------------------------------------------------------------------------
# Entity endpoints
# -----------------------------------------------------------------------------

def serialise_entity(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("id"),
        "name": row.get("name"),
        "entity_type": row.get("entity_type"),
        "parent_id": row.get("parent_id"),
        "parent_name": row.get("parent_name"),
        "region": row.get("region"),
        "handler": row.get("handler"),
        "metadata": row.get("metadata") if isinstance(row.get("metadata"), dict) else {},
        "risk_count": int(row.get("risk_count") or 0),
        "note_count": int(row.get("note_count") or 0),
        "created_at": iso(row.get("created_at")),
        "updated_at": iso(row.get("updated_at")),
    }


def serialise_entity_note(row: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": row.get("id"),
        "entity_id": row.get("entity_id"),
        "risk_id": row.get("risk_id"),
        "note_date": row.get("note_date"),
        "handler": row.get("handler"),
        "parties": row.get("parties"),
        "summary": row.get("summary"),
        "actions": row.get("actions") if isinstance(row.get("actions"), list) else [],
        "status_change": row.get("status_change"),
        "doc_type": row.get("doc_type"),
        "terms": row.get("terms") if isinstance(row.get("terms"), dict) else {},
        "source": row.get("source"),
        "created_at": iso(row.get("created_at")),
    }


@app.get("/entities")
@require_admin
@rate_limited("default_read")
def list_entities():
    q = (request.args.get("q") or "").strip()
    entity_type = (request.args.get("type") or "").strip()
    parent_id = parse_int_safe(request.args.get("parent_id"))
    limit = min(int(request.args.get("limit") or 250), 1000)
    offset = max(int(request.args.get("offset") or 0), 0)

    where, params = [], []
    if q:
        where.append("LOWER(e.name) LIKE %s")
        params.append(f"%{q.lower()}%")
    if entity_type:
        where.append("e.entity_type = %s")
        params.append(entity_type)
    if parent_id is not None:
        where.append("e.parent_id = %s")
        params.append(parent_id)

    sql = """
        SELECT e.*,
               p.name AS parent_name,
               COALESCE((SELECT COUNT(*) FROM risks r WHERE r.entity_id = e.id AND r.merged_into_risk_id IS NULL), 0) AS risk_count,
               COALESCE((SELECT COUNT(*) FROM entity_notes en WHERE en.entity_id = e.id), 0) AS note_count
        FROM entities e
        LEFT JOIN entities p ON p.id = e.parent_id
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY e.entity_type, LOWER(e.name), e.id LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    with get_conn() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute(sql, params)
            items = [serialise_entity(dict(r)) for r in cur.fetchall()]
    return jsonify({"items": items, "total": len(items)})


@app.post("/entities")
@require_admin
@rate_limited("default_write")
def create_entity():
    payload = request.get_json(force=True, silent=True) or {}
    name = (payload.get("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    entity_type = (payload.get("entity_type") or "insured").strip()
    if entity_type not in ("insured", "producer"):
        return jsonify({"error": "entity_type must be 'insured' or 'producer'"}), 400
    parent_id = parse_int_safe(payload.get("parent_id"))
    user_id = get_user_id_from_request()

    with get_conn() as conn:
        if parent_id is not None:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM entities WHERE id = %s", (parent_id,))
                if not cur.fetchone():
                    return jsonify({"error": "Parent entity not found"}), 404
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                INSERT INTO entities (name, entity_type, parent_id, region, handler, metadata)
                VALUES (%s, %s, %s, %s, %s, %s)
                RETURNING *
            """, (
                name, entity_type, parent_id,
                payload.get("region"), payload.get("handler"),
                json.dumps(payload.get("metadata") or {}),
            ))
            row = dict(cur.fetchone())
            row["parent_name"] = None
            row["risk_count"] = 0
            row["note_count"] = 0
            log_event(conn, "entity", row["id"], "entity_created", {"name": name, "entity_type": entity_type}, user_id)
    return jsonify(serialise_entity(row)), 201


@app.get("/entities/<int:entity_id>")
@require_admin
@rate_limited("default_read")
def get_entity(entity_id: int):
    with get_conn() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                SELECT e.*,
                       p.name AS parent_name,
                       COALESCE((SELECT COUNT(*) FROM risks r WHERE r.entity_id = e.id AND r.merged_into_risk_id IS NULL), 0) AS risk_count,
                       COALESCE((SELECT COUNT(*) FROM entity_notes en WHERE en.entity_id = e.id), 0) AS note_count
                FROM entities e
                LEFT JOIN entities p ON p.id = e.parent_id
                WHERE e.id = %s
            """, (entity_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Entity not found"}), 404

            # Also fetch child entities (insureds under a producer)
            cur.execute("""
                SELECT e.*,
                       COALESCE((SELECT COUNT(*) FROM risks r WHERE r.entity_id = e.id AND r.merged_into_risk_id IS NULL), 0) AS risk_count,
                       COALESCE((SELECT COUNT(*) FROM entity_notes en WHERE en.entity_id = e.id), 0) AS note_count
                FROM entities e
                WHERE e.parent_id = %s
                ORDER BY LOWER(e.name)
            """, (entity_id,))
            children = []
            for child in cur.fetchall():
                c = dict(child)
                c["parent_name"] = row["name"]
                children.append(serialise_entity(c))

            # Fetch risks linked to this entity
            cur.execute("""
                SELECT r.*,
                       a.canonical_name AS account_name,
                       m.title AS matter_title,
                       e2.name AS entity_name,
                       pe.name AS producer_entity_name
                FROM risks r
                LEFT JOIN accounts a ON a.id = r.account_id
                LEFT JOIN matters m ON m.id = r.matter_id
                LEFT JOIN entities e2 ON e2.id = r.entity_id
                LEFT JOIN entities pe ON pe.id = e2.parent_id
                WHERE r.entity_id = %s AND r.merged_into_risk_id IS NULL
                ORDER BY r.accounting_year DESC, r.id DESC
            """, (entity_id,))
            risks = [serialise_risk(dict(r)) for r in cur.fetchall()]

    result = serialise_entity(dict(row))
    result["children"] = children
    result["risks"] = risks
    return jsonify(result)


@app.patch("/entities/<int:entity_id>")
@require_admin
@rate_limited("default_write")
def update_entity(entity_id: int):
    payload = request.get_json(force=True, silent=True) or {}
    user_id = get_user_id_from_request()
    allowed = {
        "name": payload.get("name"),
        "entity_type": payload.get("entity_type"),
        "parent_id": parse_int_safe(payload.get("parent_id")) if "parent_id" in payload else None,
        "region": payload.get("region"),
        "handler": payload.get("handler"),
        "metadata": json.dumps(payload.get("metadata") or {}) if "metadata" in payload else None,
    }
    updates, params = [], []
    for field, value in allowed.items():
        if field in payload:
            updates.append(f"{field} = %s")
            params.append(value)
    if not updates:
        return jsonify({"error": "No valid fields to update"}), 400
    updates.append("updated_at = NOW()")
    params.append(entity_id)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(f"UPDATE entities SET {', '.join(updates)} WHERE id = %s", params)
            if cur.rowcount == 0:
                return jsonify({"error": "Entity not found"}), 404
            log_event(conn, "entity", entity_id, "entity_updated", payload, user_id)
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                SELECT e.*, p.name AS parent_name,
                       COALESCE((SELECT COUNT(*) FROM risks r WHERE r.entity_id = e.id AND r.merged_into_risk_id IS NULL), 0) AS risk_count,
                       COALESCE((SELECT COUNT(*) FROM entity_notes en WHERE en.entity_id = e.id), 0) AS note_count
                FROM entities e LEFT JOIN entities p ON p.id = e.parent_id
                WHERE e.id = %s
            """, (entity_id,))
            row = dict(cur.fetchone())
    return jsonify(serialise_entity(row))


@app.delete("/entities/<int:entity_id>")
@require_admin
@rate_limited("default_write")
def delete_entity(entity_id: int):
    user_id = get_user_id_from_request()
    with get_conn() as conn:
        with conn.cursor() as cur:
            # Check for linked risks — don't delete if risks exist
            cur.execute("SELECT COUNT(*) FROM risks WHERE entity_id = %s AND merged_into_risk_id IS NULL", (entity_id,))
            risk_count = cur.fetchone()[0]
            if risk_count > 0:
                return jsonify({"error": f"Cannot delete: {risk_count} risk(s) linked to this entity. Unlink or reassign them first."}), 400
            # Unlink children (set parent_id to NULL)
            cur.execute("UPDATE entities SET parent_id = NULL, updated_at = NOW() WHERE parent_id = %s", (entity_id,))
            cur.execute("DELETE FROM entities WHERE id = %s", (entity_id,))
            if cur.rowcount == 0:
                return jsonify({"error": "Entity not found"}), 404
            log_event(conn, "entity", entity_id, "entity_deleted", {}, user_id)
    return jsonify({"ok": True, "deleted": entity_id})


# -----------------------------------------------------------------------------
# Entity notes endpoints
# -----------------------------------------------------------------------------

@app.get("/entities/<int:entity_id>/notes")
@require_admin
@rate_limited("default_read")
def list_entity_notes(entity_id: int):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM entities WHERE id = %s", (entity_id,))
            if not cur.fetchone():
                return jsonify({"error": "Entity not found"}), 404
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                SELECT * FROM entity_notes
                WHERE entity_id = %s
                ORDER BY COALESCE(note_date, created_at::text) DESC, id DESC
            """, (entity_id,))
            items = [serialise_entity_note(dict(r)) for r in cur.fetchall()]
    return jsonify({"items": items, "total": len(items)})


@app.post("/entities/<int:entity_id>/notes")
@require_admin
@rate_limited("default_write")
def create_entity_note(entity_id: int):
    payload = request.get_json(force=True, silent=True) or {}
    user_id = get_user_id_from_request()
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM entities WHERE id = %s", (entity_id,))
            if not cur.fetchone():
                return jsonify({"error": "Entity not found"}), 404
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                INSERT INTO entity_notes
                    (entity_id, risk_id, note_date, handler, parties, summary,
                     actions, status_change, doc_type, terms, source)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
            """, (
                entity_id,
                parse_int_safe(payload.get("risk_id")),
                payload.get("note_date") or payload.get("date"),
                payload.get("handler"),
                payload.get("parties"),
                payload.get("summary"),
                json.dumps(payload.get("actions") or []),
                payload.get("status_change"),
                payload.get("doc_type") or "general-correspondence",
                json.dumps(payload.get("terms") or {}),
                payload.get("source"),
            ))
            row = dict(cur.fetchone())
            log_event(conn, "entity", entity_id, "note_created", {"summary": (payload.get("summary") or "")[:100]}, user_id)
    return jsonify(serialise_entity_note(row)), 201


# -----------------------------------------------------------------------------
# Entity import (localStorage migration)
# -----------------------------------------------------------------------------

@app.post("/entities/import")
@require_admin
@rate_limited("default_write")
def import_entities():
    """Bulk import entities and notes from localStorage JSON export.

    Expected payload:
    {
        "entities": [
            {
                "name": "Integra",
                "entity_type": "producer",
                "region": "Turkey",
                "handler": "KE",
                "metadata": {},
                "notes": [...]
            },
            {
                "name": "Ekol Lojistik",
                "entity_type": "insured",
                "producer_name": "Integra",  // resolved to parent_id
                "region": "Turkey",
                "handler": "KE",
                "metadata": {},
                "notes": [
                    {"date": "...", "handler": "KE", "summary": "...", ...}
                ]
            }
        ],
        "link_risks": true  // if true, fuzzy-match risks to entities by assured_name
    }
    """
    payload = request.get_json(force=True, silent=True) or {}
    entities_data = payload.get("entities") or []
    link_risks = bool(payload.get("link_risks", True))
    user_id = get_user_id_from_request()

    if not entities_data:
        return jsonify({"error": "No entities provided"}), 400

    results = {"created": 0, "notes_created": 0, "risks_linked": 0, "errors": []}

    with get_conn() as conn:
        # Pass 1: create producers first (so insured parent_id can resolve)
        name_to_id: Dict[str, int] = {}
        for ent in entities_data:
            if (ent.get("entity_type") or "insured") == "producer":
                name = (ent.get("name") or "").strip()
                if not name:
                    results["errors"].append(f"Skipped producer with empty name")
                    continue
                with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
                    # Upsert: skip if name already exists
                    cur.execute("SELECT id FROM entities WHERE LOWER(name) = %s AND entity_type = 'producer'", (name.lower(),))
                    existing = cur.fetchone()
                    if existing:
                        name_to_id[name.lower()] = existing["id"]
                        continue
                    cur.execute("""
                        INSERT INTO entities (name, entity_type, region, handler, metadata)
                        VALUES (%s, 'producer', %s, %s, %s)
                        RETURNING id
                    """, (name, ent.get("region"), ent.get("handler"), json.dumps(ent.get("metadata") or {})))
                    eid = cur.fetchone()["id"]
                    name_to_id[name.lower()] = eid
                    results["created"] += 1

        # Pass 2: create insureds with parent_id resolved
        for ent in entities_data:
            if (ent.get("entity_type") or "insured") != "insured":
                continue
            name = (ent.get("name") or "").strip()
            if not name:
                results["errors"].append(f"Skipped insured with empty name")
                continue
            producer_name = (ent.get("producer_name") or ent.get("producer") or "").strip()
            parent_id = name_to_id.get(producer_name.lower()) if producer_name else None

            with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
                cur.execute("SELECT id FROM entities WHERE LOWER(name) = %s AND entity_type = 'insured'", (name.lower(),))
                existing = cur.fetchone()
                if existing:
                    eid = existing["id"]
                    name_to_id[name.lower()] = eid
                else:
                    cur.execute("""
                        INSERT INTO entities (name, entity_type, parent_id, region, handler, metadata)
                        VALUES (%s, 'insured', %s, %s, %s, %s)
                        RETURNING id
                    """, (name, parent_id, ent.get("region"), ent.get("handler"), json.dumps(ent.get("metadata") or {})))
                    eid = cur.fetchone()["id"]
                    name_to_id[name.lower()] = eid
                    results["created"] += 1

            # Import notes
            for note in (ent.get("notes") or []):
                with conn.cursor() as cur:
                    cur.execute("""
                        INSERT INTO entity_notes
                            (entity_id, note_date, handler, parties, summary,
                             actions, status_change, doc_type, terms, source)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """, (
                        eid,
                        note.get("date") or note.get("note_date"),
                        note.get("handler"),
                        note.get("parties"),
                        note.get("summary"),
                        json.dumps(note.get("actions") or []),
                        note.get("statusChange") or note.get("status_change"),
                        note.get("docType") or note.get("doc_type") or "general-correspondence",
                        json.dumps(note.get("terms") or {}),
                        note.get("source") or "localStorage_import",
                    ))
                    results["notes_created"] += 1

        # Pass 3: link existing risks to entities by assured_name
        if link_risks:
            with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
                cur.execute("SELECT id, assured_name FROM risks WHERE entity_id IS NULL AND merged_into_risk_id IS NULL")
                unlinked_risks = cur.fetchall()
            for risk_row in unlinked_risks:
                rname = normalise_name(risk_row["assured_name"] or "")
                if not rname:
                    continue
                # Exact match first
                matched_id = name_to_id.get(rname)
                if not matched_id:
                    # Try substring match (entity name contained in risk name or vice versa)
                    for ename, eid in name_to_id.items():
                        if ename in rname or rname in ename:
                            matched_id = eid
                            break
                if matched_id:
                    with conn.cursor() as cur:
                        cur.execute("UPDATE risks SET entity_id = %s, updated_at = NOW() WHERE id = %s", (matched_id, risk_row["id"]))
                        results["risks_linked"] += 1

        log_event(conn, "entity", 0, "bulk_import", results, user_id)

    return jsonify({"ok": True, **results})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
