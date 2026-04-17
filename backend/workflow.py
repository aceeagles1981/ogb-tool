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
    "assured_name": "...",
    "product": "MC | STP | WHLL | FFL | PC",
    "status": "Submission | AW Submission | In market | Quoted | Bound",
    "region": "...",
    "handler": "KE | EW | MM | JK",
    "currency": "USD",
    "estimated_premium": 0,
    "notes": "Brief risk summary for the pipeline"
  },
  "proposal_form": {
    "insured_name": "...",
    "business_description": "...",
    "goods_description": "...",
    "annual_turnover": {"amount": 0, "currency": "USD"},
    "locations": [{"name": "...", "country": "...", "max_values": 0}],
    "transits": [{"from": "...", "to": "...", "mode": "sea|road|air|rail", "annual_value": 0}],
    "incoterms_split": {"FOB": 0, "CIF": 0},
    "limits_requested": {"conveyance": 0, "location": 0, "currency": "USD"},
    "deductible_requested": {"amount": 0, "currency": "USD"},
    "loss_history": "summary if available",
    "special_conditions": ["any notable requirements"],
    "missing_information": ["fields we still need from the producer"]
  },
  "market_email": {
    "subject": "...",
    "body": "Draft email to send to underwriters with risk summary and the ask.",
    "suggested_recipients": ["underwriter names based on product/geography"]
  },
  "suggested_underwriters": [
    {
      "market": "underwriter/syndicate name",
      "rationale": "why they'd be interested",
      "expected_role": "lead | follow",
      "estimated_line": "10-20%"
    }
  ],
  "tasks": [
    {
      "title": "...",
      "description": "...",
      "priority": "urgent | high | medium | low",
      "owner": "KE | EW",
      "category": "info_chase | review | market_approach | compliance | admin"
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

CONTEXT:
- OG Broking specialises in marine cargo, STP, WHLL, FFL, and project cargo
- Key markets: Aviva (cargo lead), CNA Hardy, Allied World, Talbot, AXIS, Brit, Everest, Fidelis
- Turkey/RI business through Integra (main producer)
- Handlers: KE (senior, Turkey/RI), EW (LatAm, Dubai, project cargo), MM (cargo war), JK (US via RT Specialty)
- Standard brokerage ~25%, OGB retain varies

Be specific and actionable. If you don't have enough information, say so in information_gaps.
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

@workflow_bp.route('/ingest-workflow', methods=['POST', 'OPTIONS'])
def ingest_workflow():
    """Full ingest workflow: parse → extract attachments → classify → extract terms → generate outputs."""
    if request.method == 'OPTIONS':
        return '', 204
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
