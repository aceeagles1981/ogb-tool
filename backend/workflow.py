"""
workflow.py — Ingest workflow routes for OGB Tool
Chains: email parse → attachment extraction → classification → terms extraction → DB storage → output generation
Uses app.py helpers: get_conn, parse_uploaded_email, anthropic_text, extract_json_object
"""

import json
import logging
import os
from datetime import date, datetime
from flask import Blueprint, request, jsonify

from doc_extract import process_all_attachments

logger = logging.getLogger("og_backend")

workflow_bp = Blueprint('workflow', __name__)


# ── Generate workflow outputs ─────────────────────────────────────────────────

WORKFLOW_OUTPUT_SYSTEM = """You are an expert Lloyd's of London marine cargo insurance broker at OG Broking.
Given the extracted terms from an inbound submission, generate the following outputs.
You must return ONLY valid JSON with these sections:

{
  "email_classification": {
    "type": "submission | renewal | feedback | endorsement | query | update | firm_order | claim",
    "confidence": 0.95,
    "summary": "One sentence describing what this email is about"
  },
  "risk_draft": {
    "assured_name": "legal name of the insured",
    "display_name": "short display name for the insured",
    "producer": "name of the overseas broker / producing broker who sent this submission",
    "product": "MC | STP | WHLL | FFL | PC",
    "status": "Submission | AW Submission | In market | Quoted | Bound",
    "region": "...",
    "handler": "assign based on email TO field — see handler rules below",
    "currency": "USD",
    "estimated_premium": null,
    "notes": "Brief risk summary including cedant name, key locations, goods type, and annual turnover if known"
  },
  "proposal_form": {
    "insured_name": "...",
    "business_description": "...",
    "goods_description": "...",
    "annual_turnover": {"amount": number_or_null, "currency": "USD"},
    "locations": [{"name": "full address", "country": "...", "max_values": number, "average_values": number_or_null}],
    "transits": [{"from": "...", "to": "...", "mode": "sea|road|air|rail", "annual_value": number_or_null}],
    "incoterms_split": {"FOB": 0, "CIF": 0, "stated": false, "note": "inferred/not stated in submission"},
    "limits_requested": {"conveyance": number, "location": number, "storage": number, "natcat": number, "currency": "USD"},
    "deductible_requested": {"transit": number, "stock": number, "natcat_note": "...", "currency": "USD"},
    "loss_history": "Nil claims reported OR detailed summary — NEVER say 'not provided' if the document says no claims",
    "special_conditions": ["any notable requirements"],
    "missing_information": ["fields genuinely not found in any attached document — do NOT list items that ARE in the attachments"]
  },
  "market_email": {
    "subject": "New STP Submission — [Insured Name] — [Territory] — via [Producer]",
    "body": "Professional market submission email. MUST include: (1) Insured name and business, (2) Cedant/reinsured name, (3) Annual turnover if known, (4) Key locations and values, (5) Limits and deductibles, (6) Coverage basis, (7) Loss record, (8) Survey highlights — name specific locations and findings, (9) Whether this is direct or facultative reinsurance, (10) What we need from them (indication on terms). Sign off as OG Broking.",
    "suggested_recipients": ["ONLY suggest markets if you have specific knowledge of their appetite. Otherwise return empty array and note 'Check market feedback log for territory/product routing'"]
  },
  "suggested_underwriters": [
    {
      "market": "ONLY if you have genuine knowledge of appetite — otherwise omit entirely",
      "rationale": "MUST be factual, not invented. If you don't know, don't guess.",
      "expected_role": "lead | follow",
      "estimated_line": "percentage range"
    }
  ],
  "tasks": [
    {
      "title": "...",
      "description": "SPECIFIC and actionable — reference actual findings, name locations, cite specific values or deficiencies. Not generic.",
      "priority": "urgent | high | medium | low",
      "owner": "assign based on email TO field — see handler rules",
      "category": "info_chase | review | market_approach | compliance | admin",
      "due_date": "YYYY-MM-DD — calculate based on rules below"
    }
  ],
  "information_gaps": [
    {
      "field": "what's missing",
      "importance": "critical | important | nice_to_have",
      "chase_text": "suggested wording for requesting this from the producer"
    }
  ]
}

CRITICAL RULES:
1. HANDLER ASSIGNMENT: Check the email TO/recipients field. If addressed to keaglestone@ogbroking.com → handler is KE. If addressed to ewilcox → EW. If addressed to mmoss → MM. The TO field takes priority over territory inference.
2. PREMIUM: If no premium or rate is stated in the documents, set estimated_premium to null. NEVER invent a premium figure. If a rate and turnover are both available, you may calculate: note it as "calculated from rate x turnover".
3. MARKET SUGGESTIONS: If you do not have specific factual knowledge of a market's appetite for this exact territory and product combination, return an empty array for suggested_underwriters and note in market_email that the broker should check their market routing. Do NOT invent rationales.
4. LOSS HISTORY: If any document says "No claims", "Nil", or "sin siniestros", the loss history IS "Nil claims reported". Do not flag this as missing information.
5. SURVEY SUMMARY: In the risk_draft notes, name specific locations and specific findings from surveys. Not "fire protection concerns at one location" but "Block 24 Zona Libre — no sprinklers, no fire doors, fire protection rated poor".
6. INFORMATION GAPS: Only flag information as missing if it genuinely cannot be found in ANY of the attached documents. If the annual turnover is in the slip, do not flag it as missing.
7. INCOTERMS: If not explicitly stated in the submission, note as "not stated — inferred" rather than assuming CIF 100%.

CONTEXT:
- OG Broking specialises in marine cargo, STP, WHLL, FFL, and project cargo at Lloyd's
- ABBREVIATIONS: STP = Stock Throughput Policy (NOT Straight-Through Processing). MC = Marine Cargo. WHLL = Warehouse Keepers and Logistics Liability. FFL = Freight Forwarder Liability. PC = Project Cargo. RI = Reinsurance. Fac = Facultative.
- This is a wholesale Lloyd's broker — submissions come from overseas producers/cedants
- Handlers: KE=Kether Eaglestone (senior, handles Turkey/RI, also overall team lead), EW=Edward Wilcox (LatAm, Dubai, project cargo), MM=Maisie Moss (cargo war), JK=Jonathan Kaye (US via RT Specialty)
- Standard brokerage ~25%, OGB retain varies by producer relationship
- Territory routing: Panama → check Fiducia first. Turkey → Integra panel. General cargo → Aviva as typical lead.

TASK DUE DATE RULES (calculate from the email date):
- Acknowledge receipt to producer: SAME DAY as email date
- Review attached documentation: NEXT WORKING DAY after email date
- Chase missing critical information: within 2 WORKING DAYS of email date
- Market approach / obtain quotes: within 2-3 WORKING DAYS if submission is complete, otherwise after info received
- If the email indicates URGENCY (words like "urgent", "asap", "immediate", "rush"): compress all dates by 1 day
- If the email indicates a future inception (months away): relax market approach to 5 working days
- If the submission is clearly incomplete (missing loss record, no turnover, no limits): prioritise info chase BEFORE market approach
- Return due_date as YYYY-MM-DD format

TASK QUALITY RULES:
- Every task description MUST reference specific data — name the insured, cite values, reference specific locations or survey findings
- "Review the slip" is NOT acceptable. "Review King Cargo STP slip — verify NatCat USD 3M sublimit adequacy for Panama EQ zone, check Coco Solito max value USD 3M against survey" IS acceptable
- Acknowledgment task: include the producer name (e.g. "Acknowledge receipt to LATAM Re for King Cargo STP submission")
- Info chase tasks: list the SPECIFIC items needed (e.g. "Chase LATAM Re for: inception/expiry dates, 5-year loss history, rate structure")
- Market approach tasks: reference the product, territory, and any routing notes (e.g. "Approach Fiducia for Panama STP indication — USD 15M turnover, two Panama locations")
"""


def generate_workflow_outputs(email_body, attachment_results):
    """Generate all workflow outputs. Uses Sonnet via app.py's anthropic helpers."""
    from app import anthropic_text, extract_json_object

    context_parts = [f"EMAIL BODY:\n{email_body[:5000]}"]

    for i, att in enumerate(attachment_results):
        context_parts.append(f"\n--- ATTACHMENT {i+1}: {att['filename']} ---")
        if att.get('classification'):
            c = att['classification']
            context_parts.append(f"Type: {c.get('doc_type')} | Stage: {c.get('doc_stage')} | Source: {c.get('source_party')}")
        if att.get('terms'):
            context_parts.append(f"Extracted terms:\n{json.dumps(att['terms'], indent=2)[:4000]}")
        if att.get('survey_findings'):
            context_parts.append(f"Survey findings:\n{json.dumps(att['survey_findings'], indent=2)[:3000]}")
        if att.get('error'):
            context_parts.append(f"Extraction note: {att['error']}")

    try:
        raw = anthropic_text({
            'model': 'claude-sonnet-4-20250514',
            'max_tokens': 4000,
            'system': WORKFLOW_OUTPUT_SYSTEM,
            'messages': [{'role': 'user', 'content': '\n'.join(context_parts)}]
        })
        return extract_json_object(raw)
    except Exception as e:
        logger.exception("Workflow output generation failed")
        return {
            'error': str(e),
            'email_classification': {'type': 'unknown', 'confidence': 0, 'summary': 'Output generation failed'},
            'risk_draft': {}, 'proposal_form': {}, 'market_email': {},
            'suggested_underwriters': [], 'tasks': [], 'information_gaps': []
        }


# ── Database storage ──────────────────────────────────────────────────────────

def store_extractions(conn, risk_id, ingested_email_id, attachment_results, user_id):
    """Store extraction results. conn is inside a `with get_conn() as conn:` block."""
    doc_ids = []

    for att in attachment_results:
        classification = att.get('classification', {})

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO risk_documents
                  (risk_id, ingested_email_id, filename, file_type,
                   doc_type, doc_stage, source_party,
                   raw_text, raw_text_truncated,
                   extracted_by, extraction_confidence, extraction_error,
                   received_date, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                risk_id, ingested_email_id,
                att['filename'], att.get('file_type', 'unknown'),
                classification.get('doc_type', 'unknown'),
                classification.get('doc_stage', 'indicated'),
                classification.get('source_party'),
                att.get('raw_text', ''), att.get('raw_text_truncated', False),
                'claude-haiku-4-5-20251001',
                classification.get('confidence', 0.0),
                att.get('error'),
                date.today(), user_id
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

    return doc_ids


# ── Serialise helper ──────────────────────────────────────────────────────────

def _serialise(obj):
    if isinstance(obj, dict):
        return {k: _serialise(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_serialise(v) for v in obj]
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    return obj


# ── Main workflow endpoint ────────────────────────────────────────────────────

@workflow_bp.route('/ingest-workflow', methods=['POST'])
def ingest_workflow():
    """Full ingest workflow: parse → extract attachments → classify → extract terms → generate outputs."""
    from app import get_conn, parse_uploaded_email, get_user_id_from_request, \
        get_auth_token_from_request, ADMIN_TOKEN as admin_token, ANTHROPIC_API_KEY as api_key

    # Auth
    token = get_auth_token_from_request()
    if not admin_token or not token or token != admin_token:
        return jsonify({'error': 'Unauthorized'}), 401

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']
    file_bytes = file.read()
    filename = file.filename or 'unknown'
    file.seek(0)  # reset for parse_uploaded_email

    risk_id = request.form.get('risk_id')
    if risk_id:
        risk_id = int(risk_id)
    do_workflow = request.form.get('workflow', 'false').lower() == 'true'
    user_id = get_user_id_from_request() or 1
    haiku_model = os.environ.get('ANTHROPIC_MODEL', 'claude-haiku-4-5-20251001')

    response = {
        'email_parse': None,
        'attachment_extractions': [],
        'workflow_outputs': None,
        'stored_document_ids': [],
        'errors': []
    }

    # Step 1: Parse email body
    email_body = ''
    try:
        parsed = parse_uploaded_email(file)
        response['email_parse'] = {
            'filename': parsed.filename,
            'from': parsed.sender,
            'to': parsed.recipients,
            'subject': parsed.subject,
            'date': parsed.email_date.isoformat() if parsed.email_date else None,
            'body': parsed.raw_body,
            'clean_text': parsed.cleaned_body,
            'attachments': parsed.attachment_names,
            'attachment_count': parsed.attachment_count,
        }
        email_body = parsed.cleaned_body or parsed.raw_body or ''
    except Exception as e:
        logger.exception("Workflow email parse failed")
        response['errors'].append(f"Email parse failed: {str(e)}")

    # Step 2: Extract and process all attachments
    attachment_results = []
    try:
        attachment_results = process_all_attachments(
            file_bytes, filename, email_body,
            api_key, haiku_model
        )
        response['attachment_extractions'] = [
            {
                'filename': r['filename'],
                'file_type': r['file_type'],
                'classification': r.get('classification'),
                'terms': r.get('terms'),
                'survey_findings': r.get('survey_findings'),
                'raw_text_length': len(r.get('raw_text', '')),
                'raw_text_truncated': r.get('raw_text_truncated', False),
                'error': r.get('error')
            }
            for r in attachment_results
        ]
    except Exception as e:
        logger.exception("Attachment extraction failed")
        response['errors'].append(f"Attachment extraction failed: {str(e)}")

    # Step 3: Store extractions in DB (if we have a risk_id)
    if risk_id and attachment_results:
        try:
            with get_conn() as conn:
                doc_ids = store_extractions(conn, risk_id, None, attachment_results, user_id)
                response['stored_document_ids'] = doc_ids
        except Exception as e:
            logger.exception("DB storage failed")
            response['errors'].append(f"DB storage failed: {str(e)}")

    # Step 4: Generate full workflow outputs (if requested)
    if do_workflow:
        try:
            outputs = generate_workflow_outputs(email_body, attachment_results)
            response['workflow_outputs'] = outputs
        except Exception as e:
            logger.exception("Workflow output generation failed")
            response['errors'].append(f"Workflow output generation failed: {str(e)}")

    return jsonify(_serialise(response))


# ── Document retrieval endpoints ──────────────────────────────────────────────

def _check_auth():
    from app import get_auth_token_from_request, ADMIN_TOKEN as admin_token
    token = get_auth_token_from_request()
    return admin_token and token and token == admin_token


@workflow_bp.route('/risks/<int:risk_id>/documents', methods=['GET'])
def get_risk_documents(risk_id):
    if not _check_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    from app import get_conn
    import psycopg.rows
    with get_conn() as conn:
        with conn.cursor(row_factory=psycopg.rows.dict_row) as cur:
            cur.execute("""
                SELECT id, filename, file_type, doc_type, doc_stage,
                       source_party, received_date, extraction_confidence,
                       extraction_error, raw_text_truncated, created_at
                FROM risk_documents WHERE risk_id = %s ORDER BY created_at DESC
            """, (risk_id,))
            docs = [dict(row) for row in cur.fetchall()]

    return jsonify(_serialise({'documents': docs}))


@workflow_bp.route('/risks/<int:risk_id>/terms', methods=['GET'])
def get_risk_terms_route(risk_id):
    if not _check_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    from app import get_conn
    with get_conn() as conn:
        terms = get_risk_terms_history(conn, risk_id)

    return jsonify(_serialise({'terms': terms}))


@workflow_bp.route('/risks/<int:risk_id>/terms/current', methods=['GET'])
def get_risk_current_terms_route(risk_id):
    if not _check_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    from app import get_conn
    with get_conn() as conn:
        current = get_current_terms(conn, risk_id)

    if not current:
        return jsonify({'terms': None, 'stage': None})

    return jsonify(_serialise(current))
