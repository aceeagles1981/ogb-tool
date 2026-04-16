/**
 * comparison.js — Terms Comparison UI for OGB Tool
 * Part 16: Side-by-side market quote comparison with AI analysis.
 * Additive module — does not modify existing code.
 */

var _comparisonData = null;
var _comparisonAnalysis = null;

// ── Load comparison for a risk ──────────────────────────────────────────────

async function loadComparison(riskId, containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const stage = options.stage || 'indicated';
  const analyze = options.analyze !== false; // default: true

  container.innerHTML = `
    <div style="padding:20px;text-align:center">
      <div style="font-size:12px;color:var(--text2)">Comparing market positions...</div>
    </div>
  `;

  try {
    const url = `/risks/${riskId}/compare?stage=${stage}&analyze=${analyze}`;
    const resp = await apiFetch(url);
    const data = await resp.json();

    if (!data.comparison) {
      container.innerHTML = `
        <div style="padding:16px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
          <div style="font-size:12px;color:var(--text2)">${data.message || 'Not enough market positions to compare.'}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:4px">
            ${data.terms_count || 0} position${data.terms_count !== 1 ? 's' : ''} found for stage "${stage}".
            Need at least 2 to compare.
          </div>
        </div>
      `;
      return;
    }

    _comparisonData = data.comparison;
    _comparisonAnalysis = data.analysis;
    renderComparison(container, data.comparison, data.analysis);

  } catch (err) {
    container.innerHTML = `
      <div style="padding:16px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px">
        <div style="font-size:12px;color:#991B1B">Comparison failed: ${err.message}</div>
      </div>
    `;
  }
}


// ── Render comparison ───────────────────────────────────────────────────────

function renderComparison(container, comparison, analysis) {
  const markets = comparison.markets || [];
  const fields = comparison.fields || [];
  const summary = comparison.summary || {};

  // Group fields by category
  const categories = {};
  for (const f of fields) {
    const cat = f.category || 'other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(f);
  }

  const catLabels = {
    commercial: 'Commercial Terms',
    coverage: 'Coverage',
    conditions: 'Conditions & Subjectivities',
    other: 'Other'
  };

  const catOrder = ['commercial', 'coverage', 'conditions', 'other'];

  container.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">

      <!-- Header -->
      <div style="background:#003366;color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:14px;font-weight:700">Market Comparison</div>
          <div style="font-size:11px;opacity:0.8;margin-top:2px">
            ${markets.length} market${markets.length !== 1 ? 's' : ''} · 
            <span style="color:#86EFAC">${summary.agreed || 0} agreed</span> · 
            <span style="color:#FCD34D">${summary.differing || 0} differ</span> · 
            <span style="color:#FCA5A5">${summary.outliers || 0} outlier${summary.outliers !== 1 ? 's' : ''}</span>
          </div>
        </div>
      </div>

      <!-- Comparison table -->
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">

          <!-- Market header row -->
          <thead>
            <tr style="background:var(--bg)">
              <th style="padding:10px 14px;text-align:left;font-weight:600;color:var(--text2);border-bottom:1px solid var(--border);
                position:sticky;left:0;background:var(--bg);z-index:1;min-width:140px">Term</th>
              ${markets.map(m => `
                <th style="padding:10px 14px;text-align:left;border-bottom:1px solid var(--border);min-width:160px">
                  <div style="font-weight:700;color:var(--text)">${m.source_party}</div>
                  <div style="font-size:10px;font-weight:400;color:var(--text2);margin-top:1px">
                    ${compStageLabel(m.doc_stage)} ${m.effective_date ? '· ' + m.effective_date : ''}
                  </div>
                </th>
              `).join('')}
              <th style="padding:10px 14px;text-align:center;font-weight:600;color:var(--text2);
                border-bottom:1px solid var(--border);width:80px">Status</th>
            </tr>
          </thead>

          <tbody>
            ${catOrder.map(cat => {
              const catFields = categories[cat];
              if (!catFields || !catFields.length) return '';
              return `
                <tr>
                  <td colspan="${markets.length + 2}" style="padding:8px 14px;font-size:10px;font-weight:700;
                    text-transform:uppercase;letter-spacing:.5px;color:var(--text2);background:var(--bg);
                    border-bottom:1px solid var(--border)">${catLabels[cat] || cat}</td>
                </tr>
                ${catFields.map(f => compRenderRow(f, markets)).join('')}
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      ${analysis && !analysis.error ? compRenderAnalysis(analysis) : ''}
    </div>
  `;
}


function compRenderRow(field, markets) {
  const statusConfig = {
    agree: { bg: '#D1FAE5', color: '#065F46', icon: '✓', label: 'Agreed' },
    differ: { bg: '#FEF3C7', color: '#92400E', icon: '≠', label: 'Differs' },
    outlier: { bg: '#FEE2E2', color: '#991B1B', icon: '!', label: 'Outlier' },
    partial: { bg: '#E5E7EB', color: '#374151', icon: '?', label: 'Partial' }
  };

  const sc = statusConfig[field.status] || statusConfig.differ;

  return `
    <tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px 14px;font-weight:500;color:var(--text);
        position:sticky;left:0;background:var(--card);z-index:1">
        ${field.label}
        ${field.note && field.status !== 'agree' ? `
          <div style="font-size:10px;font-weight:400;color:var(--text2);margin-top:2px;max-width:130px">${field.note}</div>
        ` : ''}
      </td>
      ${markets.map(m => {
        const val = field.values?.[m.source_party] || '—';
        const isOutlier = field.note && field.status === 'outlier' && field.note.includes(m.source_party);
        return `
          <td style="padding:8px 14px;color:var(--text);
            ${isOutlier ? 'background:#FEF2F2;font-weight:600' : ''}">
            ${val}
          </td>
        `;
      }).join('')}
      <td style="padding:8px 14px;text-align:center">
        <span style="display:inline-block;font-size:9px;padding:2px 8px;border-radius:4px;
          background:${sc.bg};color:${sc.color};font-weight:600">${sc.label}</span>
      </td>
    </tr>
  `;
}


function compRenderAnalysis(analysis) {
  return `
    <div style="border-top:2px solid var(--border);padding:16px">

      <!-- Recommendation -->
      ${analysis.recommendation ? `
        <div style="background:#EFF6FF;border:1px solid #BFDBFE;border-radius:8px;padding:12px 14px;margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;color:#1E40AF;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px">Broker's View</div>
          <div style="font-size:12px;color:#1E3A5F;line-height:1.6">${analysis.recommendation}</div>
          ${analysis.best_rate ? `
            <div style="font-size:11px;color:var(--text2);margin-top:6px">
              Best rate: <b>${analysis.best_rate}</b>
              ${analysis.best_coverage && analysis.best_coverage !== analysis.best_rate
                ? ` · Best coverage: <b>${analysis.best_coverage}</b>` : ''}
            </div>
          ` : ''}
        </div>
      ` : ''}

      <!-- Negotiation points -->
      ${analysis.negotiation_points?.length ? `
        <div style="margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Negotiation Points</div>
          ${analysis.negotiation_points.map(np => `
            <div style="border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:6px">
              <div style="font-size:11px;font-weight:600;color:var(--text)">${np.market}: ${np.point}</div>
              ${np.leverage ? `<div style="font-size:10px;color:var(--text2);margin-top:2px;font-style:italic">Leverage: ${np.leverage}</div>` : ''}
            </div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Red flags -->
      ${analysis.red_flags?.length ? `
        <div style="background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:12px 14px;margin-bottom:12px">
          <div style="font-size:10px;font-weight:700;color:#991B1B;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Red Flags</div>
          ${analysis.red_flags.map(rf => `
            <div style="font-size:11px;color:#7F1D1D;margin-bottom:3px">• ${rf}</div>
          `).join('')}
        </div>
      ` : ''}

      <!-- Client summary -->
      ${analysis.client_summary ? `
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">Client Summary</div>
            <button onclick="compCopyClientSummary()" style="font-size:10px;padding:3px 10px;border:1px solid var(--border);
              border-radius:4px;background:var(--card);cursor:pointer;color:var(--text)">Copy</button>
          </div>
          <div style="font-size:11px;color:var(--text);line-height:1.6" id="comp-client-summary">${analysis.client_summary}</div>
        </div>
      ` : ''}
    </div>
  `;
}


// ── Helpers ──────────────────────────────────────────────────────────────────

function compStageLabel(stage) {
  switch (stage) {
    case 'indicated': return 'Indicated';
    case 'firm': return 'Firm';
    case 'endorsement': return 'Endorsement';
    default: return stage || '';
  }
}

function compCopyClientSummary() {
  const el = document.getElementById('comp-client-summary');
  if (!el) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    if (typeof showNotice === 'function') showNotice('Client summary copied', 'ok');
  });
}
