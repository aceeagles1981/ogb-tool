"""
comparison.py — Terms comparison for OGB Tool
Compares multiple market quotes on the same risk.
Surfaces agreements, divergences, and outliers.
"""

import json
import logging
import os
import re
from datetime import date
from flask import Blueprint, request, jsonify

logger = logging.getLogger(__name__)

comparison_bp = Blueprint('comparison', __name__)


# ── Auth ──────────────────────────────────────────────────────────────────────

def check_auth():
    token = request.headers.get('X-Admin-Token', '')
    return token == os.environ.get('ADMIN_TOKEN', '')


# ── Core comparison logic ─────────────────────────────────────────────────────

# Fields to compare and how
COMPARISON_FIELDS = {
    # Commercial
    'rate': {
        'label': 'Rate',
        'category': 'commercial',
        'type': 'numeric_map',  # { transit: 0.005, stock: 0.002 }
        'format': 'percent',
        'lower_is': 'better_for_client'
    },
    'premium': {
        'label': 'Premium',
        'category': 'commercial',
        'type': 'object',  # { amount, currency, basis }
        'compare_key': 'amount',
        'format': 'currency',
        'lower_is': 'better_for_client'
    },
    'deductible': {
        'label': 'Deductible',
        'category': 'commercial',
        'type': 'object',
        'compare_key': 'amount',
        'format': 'currency',
        'lower_is': 'worse_for_client'  # higher deductible = worse for client
    },
    'brokerage': {
        'label': 'Brokerage',
        'category': 'commercial',
        'type': 'numeric',
        'format': 'percent_whole',
        'higher_is': 'better_for_broker'
    },

    # Coverage
    'limits': {
        'label': 'Limits',
        'category': 'coverage',
        'type': 'object_multi',  # compare each sub-key
        'sub_keys': ['any_one_conveyance', 'any_one_location', 'any_one_loss', 'aggregate'],
        'format': 'currency'
    },
    'perils': {
        'label': 'Perils Basis',
        'category': 'coverage',
        'type': 'string',
    },
    'war_cover': {
        'label': 'War Cover',
        'category': 'coverage',
        'type': 'boolean',
    },
    'strikes_cover': {
        'label': 'Strikes Cover',
        'category': 'coverage',
        'type': 'boolean',
    },
    'exclusions': {
        'label': 'Exclusions',
        'category': 'coverage',
        'type': 'list',
    },
    'conditions': {
        'label': 'Conditions',
        'category': 'coverage',
        'type': 'list',
    },
    'warranties': {
        'label': 'Warranties',
        'category': 'coverage',
        'type': 'list',
    },

    # Admin
    'subjectivities': {
        'label': 'Subjectivities',
        'category': 'conditions',
        'type': 'list_objects',
        'compare_key': 'item'
    },
    'period': {
        'label': 'Period',
        'category': 'conditions',
        'type': 'object',
        'display_keys': ['inception', 'expiry']
    },
}


def build_comparison(terms_rows: list[dict]) -> dict:
    """
    Build a structured comparison from multiple risk_terms rows.

    Input: list of { source_party, doc_stage, terms_json (dict), effective_date, filename }
    Output: {
        markets: [{ source_party, doc_stage, effective_date }],
        fields: [
            {
                key, label, category,
                values: { "Aviva": display_value, "Talbot": display_value },
                raw_values: { "Aviva": raw_value, "Talbot": raw_value },
                status: "agree" | "differ" | "outlier" | "partial",
                note: "explanation of divergence"
            }
        ],
        summary: { agreed: N, differing: N, outliers: N, partial: N }
    }
    """
    if len(terms_rows) < 2:
        return {
            'markets': [{'source_party': r.get('source_party', '?'), 'doc_stage': r.get('doc_stage')} for r in terms_rows],
            'fields': [],
            'summary': {'agreed': 0, 'differing': 0, 'outliers': 0, 'partial': 0}
        }

    markets = []
    for r in terms_rows:
        markets.append({
            'source_party': r.get('source_party', 'Unknown'),
            'doc_stage': r.get('doc_stage', 'indicated'),
            'effective_date': r.get('effective_date'),
            'filename': r.get('filename', '')
        })

    market_names = [m['source_party'] for m in markets]
    fields = []

    for key, spec in COMPARISON_FIELDS.items():
        field_result = compare_field(key, spec, terms_rows, market_names)
        if field_result:
            fields.append(field_result)

    # Count statuses
    summary = {'agreed': 0, 'differing': 0, 'outliers': 0, 'partial': 0}
    for f in fields:
        status = f.get('status', 'differ')
        if status in summary:
            summary[status] += 1

    return {
        'markets': markets,
        'fields': fields,
        'summary': summary
    }


def compare_field(key: str, spec: dict, terms_rows: list, market_names: list) -> dict | None:
    """Compare a single field across all market terms."""

    # Extract values from each market's terms_json
    raw_values = {}
    for i, row in enumerate(terms_rows):
        terms = row.get('terms_json', {})
        if isinstance(terms, str):
            try:
                terms = json.loads(terms)
            except:
                terms = {}
        val = terms.get(key)
        if val is not None:
            raw_values[market_names[i]] = val

    # If no market has this field, skip
    if not raw_values:
        return None

    # If only one market has it, mark as partial
    if len(raw_values) == 1:
        market = list(raw_values.keys())[0]
        return {
            'key': key,
            'label': spec['label'],
            'category': spec['category'],
            'values': {m: format_value(raw_values.get(m), spec) for m in market_names},
            'raw_values': raw_values,
            'status': 'partial',
            'note': f'Only {market} has specified this'
        }

    # Compare based on type
    field_type = spec.get('type', 'string')

    if field_type == 'numeric':
        return compare_numeric(key, spec, raw_values, market_names)
    elif field_type == 'numeric_map':
        return compare_numeric_map(key, spec, raw_values, market_names)
    elif field_type == 'object' and spec.get('compare_key'):
        return compare_object_numeric(key, spec, raw_values, market_names)
    elif field_type == 'object_multi':
        return compare_object_multi(key, spec, raw_values, market_names)
    elif field_type == 'string':
        return compare_string(key, spec, raw_values, market_names)
    elif field_type == 'boolean':
        return compare_boolean(key, spec, raw_values, market_names)
    elif field_type == 'list':
        return compare_list(key, spec, raw_values, market_names)
    elif field_type == 'list_objects':
        return compare_list_objects(key, spec, raw_values, market_names)
    elif field_type == 'object':
        return compare_object_display(key, spec, raw_values, market_names)

    return None


def compare_numeric(key, spec, raw_values, market_names):
    """Compare numeric values — flag outliers using >20% deviation from median."""
    values = {m: v for m, v in raw_values.items() if isinstance(v, (int, float))}
    if len(values) < 2:
        return make_field(key, spec, raw_values, market_names, 'partial', 'Insufficient numeric values')

    nums = list(values.values())
    median = sorted(nums)[len(nums) // 2]
    all_same = all(abs(n - nums[0]) < 0.0001 for n in nums)

    if all_same:
        return make_field(key, spec, raw_values, market_names, 'agree', 'All markets agree')

    # Check for outlier (>20% from median)
    outlier_markets = []
    if median > 0:
        for m, v in values.items():
            if abs(v - median) / median > 0.20:
                outlier_markets.append(m)

    if outlier_markets:
        return make_field(key, spec, raw_values, market_names, 'outlier',
                         f'{", ".join(outlier_markets)} significantly different from others')
    else:
        return make_field(key, spec, raw_values, market_names, 'differ', 'Markets differ')


def compare_numeric_map(key, spec, raw_values, market_names):
    """Compare rate-like objects { transit: 0.005, stock: 0.002 }."""
    # Flatten to comparable values — use first available sub-key
    flat_values = {}
    for m, v in raw_values.items():
        if isinstance(v, dict):
            # Use first non-null value
            for sk in ('flat', 'transit', 'stock'):
                if v.get(sk) is not None:
                    flat_values[m] = v[sk]
                    break
        elif isinstance(v, (int, float)):
            flat_values[m] = v

    if len(flat_values) < 2:
        return make_field(key, spec, raw_values, market_names, 'partial', 'Cannot compare rate structures')

    nums = list(flat_values.values())
    all_same = all(abs(n - nums[0]) < 0.00001 for n in nums)

    if all_same:
        return make_field(key, spec, raw_values, market_names, 'agree', 'All markets agree')

    median = sorted(nums)[len(nums) // 2]
    outliers = [m for m, v in flat_values.items() if median > 0 and abs(v - median) / median > 0.20]

    if outliers:
        return make_field(key, spec, raw_values, market_names, 'outlier',
                         f'{", ".join(outliers)} rate significantly different')
    return make_field(key, spec, raw_values, market_names, 'differ', 'Rates differ')


def compare_object_numeric(key, spec, raw_values, market_names):
    """Compare objects by a specific numeric key (e.g. premium.amount, deductible.amount)."""
    compare_key = spec['compare_key']
    nums = {}
    for m, v in raw_values.items():
        if isinstance(v, dict) and compare_key in v:
            val = v[compare_key]
            if isinstance(val, (int, float)):
                nums[m] = val

    if len(nums) < 2:
        return make_field(key, spec, raw_values, market_names, 'partial', f'Cannot compare {spec["label"]}')

    values = list(nums.values())
    all_same = all(abs(n - values[0]) < 0.01 for n in values)

    if all_same:
        return make_field(key, spec, raw_values, market_names, 'agree', 'All markets agree')

    median = sorted(values)[len(values) // 2]
    outliers = [m for m, v in nums.items() if median > 0 and abs(v - median) / median > 0.20]

    if outliers:
        return make_field(key, spec, raw_values, market_names, 'outlier',
                         f'{", ".join(outliers)} significantly different')
    return make_field(key, spec, raw_values, market_names, 'differ', f'{spec["label"]} differs')


def compare_object_multi(key, spec, raw_values, market_names):
    """Compare objects with multiple sub-keys (e.g. limits with conveyance, location, aggregate)."""
    sub_keys = spec.get('sub_keys', [])
    divergences = []

    for sk in sub_keys:
        sk_vals = {}
        for m, v in raw_values.items():
            if isinstance(v, dict) and sk in v and v[sk] is not None:
                sk_vals[m] = v[sk]
        if len(sk_vals) >= 2:
            nums = list(sk_vals.values())
            if not all(abs(n - nums[0]) < 0.01 for n in nums):
                divergences.append(sk.replace('_', ' '))

    if not divergences:
        return make_field(key, spec, raw_values, market_names, 'agree', 'All sub-limits match')
    else:
        return make_field(key, spec, raw_values, market_names, 'differ',
                         f'Differ on: {", ".join(divergences)}')


def compare_string(key, spec, raw_values, market_names):
    """Compare string values."""
    vals = [str(v).strip().lower() for v in raw_values.values()]
    if len(set(vals)) == 1:
        return make_field(key, spec, raw_values, market_names, 'agree', 'All markets agree')
    return make_field(key, spec, raw_values, market_names, 'differ', 'Markets differ')


def compare_boolean(key, spec, raw_values, market_names):
    """Compare boolean values."""
    vals = [bool(v) for v in raw_values.values()]
    if len(set(vals)) == 1:
        return make_field(key, spec, raw_values, market_names, 'agree', 'All markets agree')

    yes_markets = [m for m, v in raw_values.items() if v]
    no_markets = [m for m, v in raw_values.items() if not v]
    return make_field(key, spec, raw_values, market_names, 'differ',
                     f'Included: {", ".join(yes_markets)}. Excluded: {", ".join(no_markets)}')


def compare_list(key, spec, raw_values, market_names):
    """Compare lists — find common items and unique-to-market items."""
    sets = {}
    for m, v in raw_values.items():
        if isinstance(v, list):
            sets[m] = set(str(i).strip().lower() for i in v)
        else:
            sets[m] = set()

    if not sets:
        return None

    all_items = set()
    for s in sets.values():
        all_items |= s

    common = all_items.copy()
    for s in sets.values():
        common &= s

    if common == all_items:
        return make_field(key, spec, raw_values, market_names, 'agree', 'All markets have same items')

    unique_per_market = {}
    for m, s in sets.items():
        unique = s - common
        if unique:
            unique_per_market[m] = list(unique)

    note_parts = []
    if common:
        note_parts.append(f'{len(common)} common to all')
    for m, items in unique_per_market.items():
        note_parts.append(f'{m} adds: {"; ".join(items[:3])}{"..." if len(items) > 3 else ""}')

    return make_field(key, spec, raw_values, market_names, 'differ', '. '.join(note_parts))


def compare_list_objects(key, spec, raw_values, market_names):
    """Compare lists of objects by a key field (e.g. subjectivities by 'item')."""
    compare_key = spec.get('compare_key', 'item')
    sets = {}
    for m, v in raw_values.items():
        if isinstance(v, list):
            sets[m] = set(
                str(item.get(compare_key, item) if isinstance(item, dict) else item).strip().lower()
                for item in v
            )

    if not sets or len(sets) < 2:
        return make_field(key, spec, raw_values, market_names, 'partial', 'Insufficient data')

    all_items = set()
    for s in sets.values():
        all_items |= s
    common = all_items.copy()
    for s in sets.values():
        common &= s

    if common == all_items:
        return make_field(key, spec, raw_values, market_names, 'agree', 'Same subjectivities')

    counts = {m: len(s) for m, s in sets.items()}
    return make_field(key, spec, raw_values, market_names, 'differ',
                     f'Counts: {", ".join(f"{m}: {c}" for m, c in counts.items())}')


def compare_object_display(key, spec, raw_values, market_names):
    """Compare objects by display keys."""
    display_keys = spec.get('display_keys', [])
    diffs = []
    for dk in display_keys:
        vals = set()
        for m, v in raw_values.items():
            if isinstance(v, dict) and dk in v:
                vals.add(str(v[dk]))
        if len(vals) > 1:
            diffs.append(dk)

    if not diffs:
        return make_field(key, spec, raw_values, market_names, 'agree', 'All markets agree')
    return make_field(key, spec, raw_values, market_names, 'differ', f'Differ on: {", ".join(diffs)}')


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_field(key, spec, raw_values, market_names, status, note):
    return {
        'key': key,
        'label': spec['label'],
        'category': spec['category'],
        'values': {m: format_value(raw_values.get(m), spec) for m in market_names},
        'raw_values': {m: raw_values.get(m) for m in market_names},
        'status': status,
        'note': note
    }


def format_value(val, spec):
    """Format a value for display."""
    if val is None:
        return '—'

    fmt = spec.get('format', '')

    if fmt == 'percent' and isinstance(val, (int, float)):
        return f'{val * 100:.3f}%'
    elif fmt == 'percent' and isinstance(val, dict):
        parts = []
        for k, v in val.items():
            if isinstance(v, (int, float)):
                parts.append(f'{k}: {v * 100:.3f}%')
        return ', '.join(parts) if parts else str(val)
    elif fmt == 'percent_whole' and isinstance(val, (int, float)):
        return f'{val}%'
    elif fmt == 'currency' and isinstance(val, dict):
        ccy = val.get('currency', '')
        amt = val.get('amount', val.get(spec.get('compare_key', ''), 0))
        basis = val.get('basis', '')
        if isinstance(amt, (int, float)):
            return f'{ccy} {amt:,.0f}' + (f' ({basis})' if basis else '')
        return str(val)
    elif fmt == 'currency' and isinstance(val, (int, float)):
        return f'{val:,.0f}'
    elif isinstance(val, list):
        if all(isinstance(i, str) for i in val):
            return '; '.join(val[:5]) + ('...' if len(val) > 5 else '')
        elif all(isinstance(i, dict) for i in val):
            return '; '.join(
                str(i.get('item', i.get('name', str(i)))) for i in val[:5]
            ) + ('...' if len(val) > 5 else '')
        return str(val)
    elif isinstance(val, dict):
        parts = [f'{k}: {v}' for k, v in val.items() if v is not None]
        return ', '.join(parts[:4])
    elif isinstance(val, bool):
        return 'Yes' if val else 'No'

    return str(val)


# ── AI-powered comparison analysis ────────────────────────────────────────────

COMPARISON_ANALYSIS_SYSTEM = """You are an expert Lloyd's marine cargo insurance broker at OG Broking.
You are reviewing multiple market quotes for the same risk. Provide a concise broker's analysis.

Return ONLY valid JSON:
{
  "recommendation": "Which market position is strongest overall and why (2-3 sentences)",
  "best_rate": "market name",
  "best_coverage": "market name",
  "negotiation_points": [
    {
      "market": "name",
      "point": "what to push back on or negotiate",
      "leverage": "why you have leverage here"
    }
  ],
  "red_flags": [
    "any concerning exclusions, unusual conditions, or terms that deviate from market norm"
  ],
  "client_summary": "2-3 sentence summary suitable for sending to the producing broker — factual, no market names if sensitive, focuses on the range of terms available"
}
"""


def ai_comparison_analysis(comparison: dict, risk_context: str, api_key: str) -> dict:
    """Run AI analysis on a completed comparison."""
    import requests as req

    user_prompt = f"""Risk context: {risk_context}

Comparison data:
Markets: {json.dumps(comparison['markets'], default=str)}
Summary: {json.dumps(comparison['summary'])}

Field-by-field comparison:
{json.dumps(comparison['fields'], indent=2, default=str)[:8000]}
"""

    try:
        resp = req.post(
            'https://api.anthropic.com/v1/messages',
            headers={
                'Content-Type': 'application/json',
                'x-api-key': api_key,
                'anthropic-version': '2023-06-01'
            },
            json={
                'model': 'claude-sonnet-4-20250514',
                'max_tokens': 2000,
                'system': COMPARISON_ANALYSIS_SYSTEM,
                'messages': [{'role': 'user', 'content': user_prompt}]
            },
            timeout=60
        )
        resp.raise_for_status()
        data = resp.json()

        text = ''
        for block in data.get('content', []):
            if block.get('type') == 'text':
                text += block.get('text', '')

        text = text.strip()
        text = re.sub(r'^```json\s*', '', text)
        text = re.sub(r'\s*```$', '', text)

        return json.loads(text)
    except Exception as e:
        logger.error(f"Comparison analysis failed: {e}")
        return {'error': str(e)}


# ── Routes ────────────────────────────────────────────────────────────────────

@comparison_bp.route('/risks/<int:risk_id>/compare', methods=['GET'])
def compare_risk_terms(risk_id):
    """
    Compare all indicated terms for a risk side-by-side.
    Query params:
      stage: filter by doc_stage (default: 'indicated')
      analyze: 'true' to include AI analysis
    """
    if not check_auth():
        return jsonify({'error': 'Unauthorized'}), 401

    stage = request.args.get('stage', 'indicated')
    do_analysis = request.args.get('analyze', 'false').lower() == 'true'

    from app import get_db
    conn = get_db()

    # Fetch all terms for this risk at the requested stage
    with conn.cursor() as cur:
        cur.execute("""
            SELECT rt.id, rt.doc_stage, rt.source_party, rt.terms_json,
                   rt.effective_date, rd.filename, rd.doc_type
            FROM risk_terms rt
            JOIN risk_documents rd ON rd.id = rt.risk_document_id
            WHERE rt.risk_id = %s AND rt.doc_stage = %s
              AND rt.superseded_by IS NULL
            ORDER BY rt.created_at DESC
        """, (risk_id, stage))
        columns = [d[0] for d in cur.description]
        rows = [dict(zip(columns, row)) for row in cur.fetchall()]

    # Parse terms_json if stored as string
    for row in rows:
        if isinstance(row.get('terms_json'), str):
            try:
                row['terms_json'] = json.loads(row['terms_json'])
            except:
                row['terms_json'] = {}
        # Serialise dates
        for k in ('effective_date',):
            if row.get(k) and hasattr(row[k], 'isoformat'):
                row[k] = row[k].isoformat()

    if len(rows) < 2:
        return jsonify({
            'comparison': None,
            'message': f'Need at least 2 market positions to compare. Found {len(rows)} for stage "{stage}".',
            'terms_count': len(rows)
        })

    # Build comparison
    comparison = build_comparison(rows)

    # Optional AI analysis
    analysis = None
    if do_analysis:
        api_key = os.environ.get('ANTHROPIC_API_KEY', '')
        # Get risk context
        with conn.cursor() as cur:
            cur.execute("SELECT assured_name, product, notes FROM risks WHERE id = %s", (risk_id,))
            risk_row = cur.fetchone()
            risk_context = f"{risk_row[0] if risk_row else ''} - {risk_row[1] if risk_row else ''}"

        analysis = ai_comparison_analysis(comparison, risk_context, api_key)

    return jsonify({
        'comparison': comparison,
        'analysis': analysis,
        'terms_count': len(rows)
    })
