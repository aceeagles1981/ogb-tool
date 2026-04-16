/**
 * workflow.js — Ingest Workflow UI for OGB Tool
 * Part 16: Shows AI-generated outputs in a tabbed dashboard after email ingest.
 * User reviews finished products, not blank forms.
 *
 * Additive only — does not modify main.js or existing ingest logic.
 * Hooks into handleEmailFile's completion to optionally run the full workflow.
 */

// ── Workflow state ───────────────────────────────────────────────────────────

var _workflowResult = null;
var _workflowActiveTab = 'summary';

// ── Trigger workflow from ingest panel ───────────────────────────────────────

async function runIngestWorkflow(file, riskId) {
  /**
   * Called after initial email parse succeeds.
   * Sends the file to /ingest-workflow with workflow=true.
   * Shows the workflow result card when complete.
   */
  const container = document.getElementById('workflow-result-area');
  if (!container) return;

  container.innerHTML = `
    <div style="padding:24px;text-align:center">
      <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:8px">
        Processing attachments and generating outputs...
      </div>
      <div style="font-size:11px;color:var(--text2);margin-bottom:16px">
        Reading documents → Classifying → Extracting terms → Generating slip, market email, tasks
      </div>
      <div style="width:200px;height:4px;background:var(--border);border-radius:2px;margin:0 auto;overflow:hidden">
        <div style="height:100%;width:30%;background:var(--accent);border-radius:2px;animation:wfProgress 3s ease-in-out infinite"></div>
      </div>
    </div>
  `;

  // Add animation keyframes if not already present
  if (!document.getElementById('wf-keyframes')) {
    const style = document.createElement('style');
    style.id = 'wf-keyframes';
    style.textContent = `
      @keyframes wfProgress {
        0% { width: 10%; margin-left: 0; }
        50% { width: 60%; margin-left: 20%; }
        100% { width: 10%; margin-left: 90%; }
      }
    `;
    document.head.appendChild(style);
  }

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('workflow', 'true');
    if (riskId) formData.append('risk_id', riskId);

    // Get insured list from localStorage for matching
    try {
      const state = gs();
      const ents = state.entities || [];
      const insuredList = ents.map(e => ({ id: e.id, name: e.name }));
      formData.append('insured_list', JSON.stringify(insuredList));
    } catch (e) { /* non-fatal */ }

    const resp = await fetch(BACKEND + '/ingest-workflow', {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const result = await resp.json();

    _workflowResult = result;
    renderWorkflowResult(container, result);

  } catch (err) {
    container.innerHTML = `
      <div style="padding:16px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;margin-top:12px">
        <div style="font-size:12px;font-weight:600;color:#991B1B;margin-bottom:4px">Workflow failed</div>
        <div style="font-size:11px;color:#7F1D1D">${err.message}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:8px">
          The basic ingest still works — you can review the draft above and save manually.
        </div>
      </div>
    `;
  }
}


// ── Render workflow result card ──────────────────────────────────────────────

function renderWorkflowResult(container, result) {
  const outputs = result.workflow_outputs || {};
  const extractions = result.attachment_extractions || [];
  const errors = result.errors || [];
  const classification = outputs.email_classification || {};

  // Count what we got
  const hasProposal = outputs.proposal_form && Object.keys(outputs.proposal_form).length > 2;
  const hasMarketEmail = outputs.market_email && outputs.market_email.body;
  const hasUnderwriters = outputs.suggested_underwriters && outputs.suggested_underwriters.length > 0;
  const hasTasks = outputs.tasks && outputs.tasks.length > 0;
  const hasGaps = outputs.information_gaps && outputs.information_gaps.length > 0;
  const hasTerms = extractions.some(a => a.terms);
  const hasSurvey = extractions.some(a => a.survey_findings);

  // Build tabs
  const tabs = [
    { id: 'summary', label: 'Summary', show: true },
    { id: 'documents', label: `Documents (${extractions.length})`, show: extractions.length > 0 },
    { id: 'terms', label: 'Terms', show: hasTerms },
    { id: 'proposal', label: 'Proposal', show: hasProposal },
    { id: 'market', label: 'Market Email', show: hasMarketEmail },
    { id: 'underwriters', label: 'Underwriters', show: hasUnderwriters },
    { id: 'tasks', label: `Tasks (${(outputs.tasks||[]).length})`, show: hasTasks },
    { id: 'gaps', label: 'Info Gaps', show: hasGaps },
    { id: 'survey', label: 'Survey', show: hasSurvey },
  ].filter(t => t.show);

  container.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-top:16px">
      <!-- Header -->
      <div style="background:var(--accent);color:#fff;padding:12px 16px;display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:13px;font-weight:700">Workflow Complete</div>
          <div style="font-size:11px;opacity:0.85;margin-top:2px">
            ${classification.summary || 'Email processed'} · ${classification.type || 'unknown'} · Confidence ${Math.round((classification.confidence||0)*100)}%
          </div>
        </div>
        <div style="display:flex;gap:8px">
          ${errors.length > 0 ? `<span style="font-size:10px;background:#FCA5A5;color:#7F1D1D;padding:2px 8px;border-radius:10px">${errors.length} warning${errors.length>1?'s':''}</span>` : ''}
          <span style="font-size:10px;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:10px">${extractions.length} doc${extractions.length!==1?'s':''} extracted</span>
        </div>
      </div>

      <!-- Tabs -->
      <div style="display:flex;border-bottom:1px solid var(--border);background:var(--bg);overflow-x:auto" id="wf-tab-bar">
        ${tabs.map(t => `
          <button onclick="wfTab('${t.id}')" id="wf-tab-${t.id}"
            style="padding:8px 14px;font-size:11px;font-weight:500;border:none;background:none;
              cursor:pointer;white-space:nowrap;border-bottom:2px solid transparent;
              color:var(--text2);transition:all .15s">${t.label}</button>
        `).join('')}
      </div>

      <!-- Tab panels -->
      <div id="wf-panels" style="padding:16px;max-height:600px;overflow-y:auto">
      </div>

      <!-- Actions -->
      <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;background:var(--bg)">
        <button onclick="wfCopyMarketEmail()" style="padding:6px 14px;font-size:11px;border:1px solid var(--border);
          border-radius:6px;background:var(--card);cursor:pointer;color:var(--text)">Copy Market Email</button>
        <button onclick="wfSaveAll()" style="padding:6px 14px;font-size:11px;border:none;
          border-radius:6px;background:var(--accent);color:#fff;cursor:pointer;font-weight:600">Save Risk + Tasks →</button>
      </div>
    </div>
  `;

  // Show first tab
  wfTab(tabs[0].id);
}


// ── Tab switching ────────────────────────────────────────────────────────────

function wfTab(id) {
  _workflowActiveTab = id;
  const bar = document.getElementById('wf-tab-bar');
  if (bar) {
    bar.querySelectorAll('button').forEach(btn => {
      const isActive = btn.id === `wf-tab-${id}`;
      btn.style.borderBottomColor = isActive ? 'var(--accent)' : 'transparent';
      btn.style.color = isActive ? 'var(--accent)' : 'var(--text2)';
      btn.style.fontWeight = isActive ? '600' : '500';
    });
  }

  const panel = document.getElementById('wf-panels');
  if (!panel || !_workflowResult) return;

  const outputs = _workflowResult.workflow_outputs || {};
  const extractions = _workflowResult.attachment_extractions || [];

  switch (id) {
    case 'summary': panel.innerHTML = wfRenderSummary(outputs, extractions); break;
    case 'documents': panel.innerHTML = wfRenderDocuments(extractions); break;
    case 'terms': panel.innerHTML = wfRenderTerms(extractions); break;
    case 'proposal': panel.innerHTML = wfRenderProposal(outputs.proposal_form || {}); break;
    case 'market': panel.innerHTML = wfRenderMarketEmail(outputs.market_email || {}); break;
    case 'underwriters': panel.innerHTML = wfRenderUnderwriters(outputs.suggested_underwriters || []); break;
    case 'tasks': panel.innerHTML = wfRenderTasks(outputs.tasks || []); break;
    case 'gaps': panel.innerHTML = wfRenderGaps(outputs.information_gaps || []); break;
    case 'survey': panel.innerHTML = wfRenderSurvey(extractions); break;
    default: panel.innerHTML = '';
  }
}


// ── Tab renderers ────────────────────────────────────────────────────────────

function wfRenderSummary(outputs, extractions) {
  const risk = outputs.risk_draft || {};
  const gaps = outputs.information_gaps || [];
  const criticalGaps = gaps.filter(g => g.importance === 'critical');

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="background:var(--bg);border-radius:8px;padding:14px;border:1px solid var(--border)">
        <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Risk</div>
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">${risk.assured_name || '—'}</div>
        <div style="font-size:11px;color:var(--text2)">
          ${risk.product || '—'} · ${risk.region || '—'} · ${risk.handler || '—'}
        </div>
        <div style="font-size:11px;color:var(--text2);margin-top:4px">
          ${risk.currency || ''} ${risk.estimated_premium ? Number(risk.estimated_premium).toLocaleString() : '—'} estimated premium
        </div>
      </div>
      <div style="background:var(--bg);border-radius:8px;padding:14px;border:1px solid var(--border)">
        <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Documents Processed</div>
        ${extractions.map(a => `
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:10px;padding:1px 6px;border-radius:3px;
              background:${a.classification ? wfStageColor(a.classification.doc_stage) : '#E5E7EB'};
              color:${a.classification ? wfStageTextColor(a.classification.doc_stage) : '#6B7280'}">
              ${a.classification ? a.classification.doc_stage : '?'}
            </span>
            <span style="font-size:11px;color:var(--text)">${a.filename}</span>
            <span style="font-size:10px;color:var(--text2)">${a.classification ? a.classification.doc_type : ''}</span>
          </div>
        `).join('')}
      </div>
    </div>
    ${criticalGaps.length > 0 ? `
      <div style="background:#FEF3C7;border:1px solid #F59E0B30;border-radius:8px;padding:12px 14px;margin-bottom:12px">
        <div style="font-size:11px;font-weight:700;color:#92400E;margin-bottom:6px">Critical Information Missing</div>
        ${criticalGaps.map(g => `
          <div style="font-size:11px;color:#78350F;margin-bottom:4px">• ${g.field}: ${g.chase_text || ''}</div>
        `).join('')}
      </div>
    ` : ''}
    ${risk.notes ? `
      <div style="font-size:11px;color:var(--text2);line-height:1.6;padding:10px 14px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
        ${risk.notes}
      </div>
    ` : ''}
  `;
}


function wfRenderDocuments(extractions) {
  return extractions.map((a, i) => `
    <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px;background:var(--card)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:12px;font-weight:600;color:var(--text)">${a.filename}</span>
        <span style="font-size:10px;padding:1px 6px;border-radius:3px;
          background:${wfStageColor(a.classification?.doc_stage)};
          color:${wfStageTextColor(a.classification?.doc_stage)}">${a.classification?.doc_stage || '?'}</span>
        <span style="font-size:10px;padding:1px 6px;border-radius:3px;background:#E5E7EB;color:#374151">
          ${a.classification?.doc_type || '?'}</span>
        <span style="font-size:10px;color:var(--text2)">from ${a.classification?.source_party || '?'}</span>
      </div>
      ${a.classification?.reasoning ? `
        <div style="font-size:10px;color:var(--text2);margin-bottom:6px;font-style:italic">${a.classification.reasoning}</div>
      ` : ''}
      <div style="font-size:10px;color:var(--text2)">
        ${a.raw_text_length ? `${Math.round(a.raw_text_length/1024)}KB text extracted` : 'No text'} ·
        Confidence: ${Math.round((a.classification?.confidence||0)*100)}%
        ${a.error ? ` · <span style="color:#DC2626">${a.error}</span>` : ''}
      </div>
    </div>
  `).join('');
}


function wfRenderTerms(extractions) {
  const withTerms = extractions.filter(a => a.terms);
  if (!withTerms.length) return '<div style="font-size:11px;color:var(--text2)">No terms extracted</div>';

  return withTerms.map(a => {
    const t = a.terms;
    return `
      <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
        <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:10px">
          ${a.filename}
          <span style="font-size:10px;font-weight:400;color:var(--text2);margin-left:8px">
            ${a.classification?.doc_stage} · ${a.classification?.source_party}</span>
        </div>
        <div style="display:grid;grid-template-columns:140px 1fr;gap:4px 12px;font-size:11px">
          ${wfTermRow('Insured', t.insured)}
          ${wfTermRow('Goods', t.goods)}
          ${wfTermRow('Product', t.product)}
          ${wfTermRow('Limit (conv)', t.limits?.any_one_conveyance ? `${t.limits.currency || ''} ${Number(t.limits.any_one_conveyance).toLocaleString()}` : null)}
          ${wfTermRow('Limit (loc)', t.limits?.any_one_location ? `${t.limits.currency || ''} ${Number(t.limits.any_one_location).toLocaleString()}` : null)}
          ${wfTermRow('Deductible', t.deductible ? `${t.deductible.currency || ''} ${Number(t.deductible.amount).toLocaleString()} ${t.deductible.basis || ''}` : null)}
          ${wfTermRow('Rate', t.rate ? Object.entries(t.rate).map(([k,v]) => `${k}: ${(v*100).toFixed(3)}%`).join(', ') : null)}
          ${wfTermRow('Premium', t.premium ? `${t.premium.currency || ''} ${Number(t.premium.amount).toLocaleString()} (${t.premium.basis || ''})` : null)}
          ${wfTermRow('Perils', t.perils)}
          ${wfTermRow('Period', t.period ? `${t.period.inception} to ${t.period.expiry}` : null)}
          ${wfTermRow('Brokerage', t.brokerage ? `${t.brokerage}%` : null)}
          ${wfTermRow('Exclusions', t.exclusions?.length ? t.exclusions.join('; ') : null)}
          ${wfTermRow('Policy Ref', t.policy_ref)}
        </div>
        ${t.subjectivities?.length ? `
          <div style="margin-top:10px;padding-top:8px;border-top:1px solid var(--border)">
            <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:4px">Subjectivities</div>
            ${t.subjectivities.map(s => `
              <div style="font-size:11px;color:var(--text);margin-bottom:2px">
                <span style="font-size:9px;padding:1px 5px;border-radius:3px;margin-right:4px;
                  background:${s.status==='received'?'#D1FAE5':s.status==='waived'?'#E5E7EB':'#FEF3C7'};
                  color:${s.status==='received'?'#065F46':s.status==='waived'?'#374151':'#92400E'}">${s.status}</span>
                ${s.item}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}


function wfTermRow(label, value) {
  if (!value) return '';
  return `
    <div style="color:var(--text2);font-weight:500">${label}</div>
    <div style="color:var(--text)">${value}</div>
  `;
}


function wfRenderProposal(pf) {
  if (!pf || !pf.insured_name) return '<div style="font-size:11px;color:var(--text2)">No proposal data</div>';

  return `
    <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:12px">
      Proposal Form — ${pf.insured_name}
    </div>
    <div style="display:grid;grid-template-columns:160px 1fr;gap:6px 12px;font-size:11px">
      ${wfTermRow('Insured', pf.insured_name)}
      ${wfTermRow('Business', pf.business_description)}
      ${wfTermRow('Goods', pf.goods_description)}
      ${wfTermRow('Annual Turnover', pf.annual_turnover ? `${pf.annual_turnover.currency} ${Number(pf.annual_turnover.amount).toLocaleString()}` : null)}
      ${wfTermRow('Limits Requested', pf.limits_requested ? `Conv: ${pf.limits_requested.currency} ${Number(pf.limits_requested.conveyance||0).toLocaleString()} / Loc: ${Number(pf.limits_requested.location||0).toLocaleString()}` : null)}
      ${wfTermRow('Deductible', pf.deductible_requested ? `${pf.deductible_requested.currency} ${Number(pf.deductible_requested.amount).toLocaleString()}` : null)}
      ${wfTermRow('Incoterms', pf.incoterms_split ? Object.entries(pf.incoterms_split).map(([k,v]) => `${k} ${v}%`).join(' / ') : null)}
      ${wfTermRow('Loss History', pf.loss_history)}
    </div>
    ${pf.locations?.length ? `
      <div style="margin-top:12px">
        <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:6px">Locations</div>
        ${pf.locations.map(l => `
          <div style="font-size:11px;color:var(--text);margin-bottom:2px">
            ${l.name}${l.country ? `, ${l.country}` : ''} ${l.max_values ? `— max ${Number(l.max_values).toLocaleString()}` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}
    ${pf.transits?.length ? `
      <div style="margin-top:12px">
        <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:6px">Transits</div>
        ${pf.transits.map(t => `
          <div style="font-size:11px;color:var(--text);margin-bottom:2px">
            ${t.from} → ${t.to} (${t.mode || '?'}) ${t.annual_value ? `— ${Number(t.annual_value).toLocaleString()}/yr` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}
    ${pf.missing_information?.length ? `
      <div style="margin-top:12px;padding:10px;background:#FEF3C7;border-radius:6px">
        <div style="font-size:10px;font-weight:600;color:#92400E;margin-bottom:4px">Still needed</div>
        ${pf.missing_information.map(m => `
          <div style="font-size:11px;color:#78350F;margin-bottom:2px">• ${m}</div>
        `).join('')}
      </div>
    ` : ''}
  `;
}


function wfRenderMarketEmail(me) {
  if (!me || !me.body) return '<div style="font-size:11px;color:var(--text2)">No market email generated</div>';

  return `
    <div style="margin-bottom:12px">
      <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:4px">Subject</div>
      <input type="text" value="${(me.subject||'').replace(/"/g,'&quot;')}" id="wf-market-subject"
        style="width:100%;padding:6px 10px;font-size:12px;border:1px solid var(--border);border-radius:6px;
        background:var(--card);color:var(--text);font-family:inherit">
    </div>
    <div style="margin-bottom:12px">
      <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:4px">Body</div>
      <textarea id="wf-market-body" rows="16"
        style="width:100%;padding:8px 10px;font-size:11px;border:1px solid var(--border);border-radius:6px;
        background:var(--card);color:var(--text);font-family:inherit;line-height:1.6;resize:vertical">${me.body||''}</textarea>
    </div>
    ${me.suggested_recipients?.length ? `
      <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:4px">Suggested recipients</div>
      <div style="font-size:11px;color:var(--text)">${me.suggested_recipients.join(', ')}</div>
    ` : ''}
  `;
}


function wfRenderUnderwriters(uw) {
  if (!uw.length) return '<div style="font-size:11px;color:var(--text2)">No underwriter suggestions</div>';

  return `
    <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px">
      Suggested Markets
    </div>
    ${uw.map(u => `
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;display:flex;align-items:flex-start;gap:12px">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:600;color:var(--text)">${u.market}</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${u.rationale}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:10px;padding:2px 8px;border-radius:4px;
            background:${u.expected_role==='lead'?'#DBEAFE':'#E5E7EB'};
            color:${u.expected_role==='lead'?'#1E40AF':'#374151'}">${u.expected_role}</div>
          <div style="font-size:10px;color:var(--text2);margin-top:4px">${u.estimated_line || ''}</div>
        </div>
      </div>
    `).join('')}
  `;
}


function wfRenderTasks(tasks) {
  if (!tasks.length) return '<div style="font-size:11px;color:var(--text2)">No tasks generated</div>';

  const priorityColors = {
    urgent: { bg: '#FEE2E2', text: '#991B1B' },
    high: { bg: '#FEF3C7', text: '#92400E' },
    medium: { bg: '#DBEAFE', text: '#1E40AF' },
    low: { bg: '#E5E7EB', text: '#374151' }
  };

  return tasks.map((t, i) => {
    const pc = priorityColors[t.priority] || priorityColors.medium;
    return `
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;display:flex;align-items:flex-start;gap:10px">
        <input type="checkbox" id="wf-task-${i}" style="margin-top:2px">
        <div style="flex:1">
          <div style="font-size:12px;font-weight:500;color:var(--text)">${t.title}</div>
          ${t.description ? `<div style="font-size:11px;color:var(--text2);margin-top:2px">${t.description}</div>` : ''}
        </div>
        <div style="display:flex;gap:4px;flex-shrink:0">
          <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:${pc.bg};color:${pc.text}">${t.priority}</span>
          <span style="font-size:9px;padding:2px 6px;border-radius:3px;background:#E5E7EB;color:#374151">${t.owner || '—'}</span>
        </div>
      </div>
    `;
  }).join('');
}


function wfRenderGaps(gaps) {
  if (!gaps.length) return '<div style="font-size:11px;color:var(--text2)">No information gaps identified</div>';

  const importanceColors = {
    critical: { bg: '#FEE2E2', text: '#991B1B', border: '#FCA5A5' },
    important: { bg: '#FEF3C7', text: '#92400E', border: '#FCD34D' },
    nice_to_have: { bg: '#F3F4F6', text: '#374151', border: '#D1D5DB' }
  };

  return `
    <div style="margin-bottom:12px">
      <button onclick="wfGenerateChaseEmail()" style="padding:6px 12px;font-size:11px;border:1px solid var(--border);
        border-radius:6px;background:var(--card);cursor:pointer;color:var(--text)">Generate chase email from gaps</button>
    </div>
    ${gaps.map(g => {
      const ic = importanceColors[g.importance] || importanceColors.important;
      return `
        <div style="border:1px solid ${ic.border};border-radius:8px;padding:12px;margin-bottom:8px;background:${ic.bg}">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
            <span style="font-size:10px;font-weight:600;color:${ic.text};text-transform:uppercase">${g.importance}</span>
            <span style="font-size:12px;font-weight:500;color:${ic.text}">${g.field}</span>
          </div>
          ${g.chase_text ? `<div style="font-size:11px;color:${ic.text};opacity:0.8;font-style:italic">"${g.chase_text}"</div>` : ''}
        </div>
      `;
    }).join('')}
  `;
}


function wfRenderSurvey(extractions) {
  const withSurvey = extractions.filter(a => a.survey_findings);
  if (!withSurvey.length) return '<div style="font-size:11px;color:var(--text2)">No survey data</div>';

  return withSurvey.map(a => {
    const sf = a.survey_findings;
    const ratingColor = sf.overall_rating === 'satisfactory' ? '#065F46' :
                        sf.overall_rating === 'needs_improvement' ? '#92400E' : '#991B1B';
    return `
      <div style="border:1px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
          <span style="font-size:12px;font-weight:600;color:var(--text)">${a.filename}</span>
          <span style="font-size:10px;padding:2px 8px;border-radius:4px;background:${ratingColor}15;color:${ratingColor};font-weight:600">
            ${sf.overall_rating || 'unrated'}
          </span>
        </div>
        <div style="display:grid;grid-template-columns:140px 1fr;gap:4px 12px;font-size:11px">
          ${wfTermRow('Surveyor', sf.surveyor)}
          ${wfTermRow('Date', sf.survey_date)}
          ${wfTermRow('Locations', sf.locations_inspected?.join(', '))}
          ${wfTermRow('Construction', sf.construction_type)}
          ${wfTermRow('Sprinklered', sf.sprinklered !== undefined ? (sf.sprinklered ? 'Yes' : 'No') : null)}
        </div>
        ${sf.recommendations?.length ? `
          <div style="margin-top:10px">
            <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:4px">Recommendations</div>
            ${sf.recommendations.map(r => `<div style="font-size:11px;color:var(--text);margin-bottom:2px">• ${r}</div>`).join('')}
          </div>
        ` : ''}
        ${sf.deficiencies?.length ? `
          <div style="margin-top:10px">
            <div style="font-size:10px;font-weight:600;color:#991B1B;margin-bottom:4px">Deficiencies</div>
            ${sf.deficiencies.map(d => `<div style="font-size:11px;color:#7F1D1D;margin-bottom:2px">• ${d}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}


// ── Helpers ──────────────────────────────────────────────────────────────────

function wfStageColor(stage) {
  switch (stage) {
    case 'indicated': return '#DBEAFE';
    case 'firm': return '#D1FAE5';
    case 'endorsement': return '#E9D5FF';
    default: return '#E5E7EB';
  }
}

function wfStageTextColor(stage) {
  switch (stage) {
    case 'indicated': return '#1E40AF';
    case 'firm': return '#065F46';
    case 'endorsement': return '#6B21A8';
    default: return '#374151';
  }
}


// ── Actions ──────────────────────────────────────────────────────────────────

function wfCopyMarketEmail() {
  const subject = document.getElementById('wf-market-subject');
  const body = document.getElementById('wf-market-body');
  if (!subject || !body) return;

  const text = `Subject: ${subject.value}\n\n${body.value}`;
  navigator.clipboard.writeText(text).then(() => {
    if (typeof showNotice === 'function') showNotice('Market email copied to clipboard', 'ok');
  });
}


function wfGenerateChaseEmail() {
  if (!_workflowResult?.workflow_outputs?.information_gaps) return;

  const gaps = _workflowResult.workflow_outputs.information_gaps;
  const assured = _workflowResult.workflow_outputs?.risk_draft?.assured_name || 'the insured';
  const lines = gaps.map(g => `- ${g.chase_text || g.field}`);

  const email = `Dear colleague,

Thank you for the submission regarding ${assured}. To progress this to market, we would be grateful if you could provide the following additional information:

${lines.join('\n')}

Please let us know if you have any questions.

Kind regards`;

  navigator.clipboard.writeText(email).then(() => {
    if (typeof showNotice === 'function') showNotice('Chase email copied to clipboard', 'ok');
  });
}


async function wfSaveAll() {
  if (!_workflowResult?.workflow_outputs) return;

  const outputs = _workflowResult.workflow_outputs;
  const risk = outputs.risk_draft || {};

  // Build risk payload for backend
  const payload = {
    assured_name: risk.assured_name,
    product: risk.product,
    status: risk.status || 'Submission',
    region: risk.region,
    handler: risk.handler,
    currency: risk.currency,
    estimated_premium: risk.estimated_premium,
    notes: risk.notes,
    source: 'workflow'
  };

  try {
    // Create risk
    const resp = await apiFetch('/risks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const riskData = await resp.json();
    const riskId = riskData.id;

    // Create tasks
    if (outputs.tasks?.length && riskId) {
      for (const t of outputs.tasks) {
        await apiFetch('/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            risk_id: riskId,
            title: t.title,
            description: t.description,
            priority: t.priority,
            assigned_to: t.owner,
            category: t.category
          })
        });
      }
    }

    // Store document extractions against the new risk
    if (_workflowResult.attachment_extractions?.length && riskId) {
      // Re-run storage with the risk_id now known
      // (attachment raw data is no longer available — extractions were already processed)
      // The extractions are already in _workflowResult but we need the backend to store them
      await apiFetch(`/risks/${riskId}/store-extractions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extractions: _workflowResult.attachment_extractions
        })
      });
    }

    if (typeof showNotice === 'function') {
      showNotice(`Risk "${risk.assured_name}" saved with ${(outputs.tasks||[]).length} tasks`, 'ok');
    }

    // Navigate to the risk
    if (typeof tab === 'function') tab('pipeline');

  } catch (err) {
    if (typeof showNotice === 'function') {
      showNotice(`Save failed: ${err.message}`, 'err');
    }
  }
}
