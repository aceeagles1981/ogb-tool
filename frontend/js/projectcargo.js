// ─── PROJECT CARGO TAB ─────────────────────────────────────────
const PC_CHECKLIST = [
  { id:'pc1',  label:'Project description and type (oil/gas, wind, mining, etc.)', critical:true },
  { id:'pc2',  label:'Full shipping schedule — all items with values, origins, shipping dates, transport mode', critical:true },
  { id:'pc3',  label:'Scheduled Commercial Operation Date (SCOD)', critical:true },
  { id:'pc4',  label:'List of Critical Items with individual values and anticipated shipping dates — standard thresholds: >USD 5M break-bulk; >50MT; >12m×2.5m×2.5m (won\'t fit 40ft); ocean barge shipments', critical:true },
  { id:'pc5',  label:'Replacement time for each Critical Item (re-order to site delivery)', critical:true },
  { id:'pc6',  label:'Installation, testing and commissioning period for Critical Items', critical:true },
  { id:'pc7',  label:'Basis of DSU indemnity selected (Gross Profit OR Fixed Costs/Debt Service + ICW)', critical:true },
  { id:'pc8',  label:'Indemnity period required (months from SCOD)', critical:true },
  { id:'pc9',  label:'Proposed time deductible (days aggregate)', critical:false },
  { id:'pc10', label:'Named Marine Warranty Surveyor (MWS) confirmed', critical:true },
  { id:'pc11', label:'Project financing details (lender, loan structure) — needed if debt service basis', critical:false },
  { id:'pc12', label:'Details of on-site laydown/storage (location, duration, flood/storm exposure)', critical:false },
  { id:'pc13', label:'Any second-hand or non-OEM Critical Items', critical:false },
  { id:'pc14', label:'CAR/EAR policy in place (required under Section 2 condition precedent)', critical:true },
  { id:'pc15', label:'Confirmed all cargo to be insured Marine + War + Strikes (Section 2 condition precedent)', critical:true },
  { id:'pc16', label:'Proportion containerised vs breakbulk/OOG', critical:false },
  { id:'pc17', label:'Domestic transit arrangements (under this policy or CAR/EAR?)', critical:false },
  { id:'pc18', label:'Any ocean barge shipments identified', critical:false },
  { id:'pc19', label:'Route surveys completed for road legs carrying OOG items', critical:false },
  { id:'pc20', label:'Lenders endorsement confirmed — obtain form from CTA/Schedule 7 before binding; lenders will require it materially as per their specific form', critical:true },
  { id:'pc_sasria', label:'SASRIA (South Africa only) — inland SA transit legs require separate SASRIA cover; Lloyd\'s/commercial market cannot cover political/SRCC perils for property/transit within SA', critical:false },
  { id:'pc20b', label:'50/50 clause agreed with CAR/EAR underwriters — mechanism for losses of uncertain origin at site delivery', critical:false },
  { id:'pc21', label:'Critical Item Separation clause — confirm whether items from same manufacturer/production line may ship together', critical:false },
  { id:'pc22', label:'Red Sea/Gulf of Aden / Black Sea routing — WSRCC excluded by default on these routes; confirm if cover needed and at what additional premium', critical:false },
  { id:'pc20', label:'How is project being financed (equity / bank debt / ECA / bond)', critical:false },
];

let _pcChecked = {};

function renderProjectCargo() {
  // Load saved state
  try { _pcChecked = JSON.parse(localStorage.getItem('og_pc_checked')||'{}'); } catch(e){}
  pcTab('overview');
  renderPcChecklist();
}

function pcTab(id) {
  ['overview','checklist','dsu','survey','pricing','ai'].forEach(t => {
    const panel = document.getElementById('pc-panel-'+t);
    const btn = document.getElementById('pc-tab-'+t);
    if(panel) panel.style.display = t===id ? '' : 'none';
    if(btn) {
      btn.style.borderBottom = t===id ? '2px solid var(--accent)' : '';
      btn.style.fontWeight = t===id ? '600' : '';
    }
  });
}

function renderPcChecklist() {
  const container = document.getElementById('pc-checklist-items');
  if(!container) return;
  const total = PC_CHECKLIST.length;
  const done = PC_CHECKLIST.filter(i => _pcChecked[i.id]).length;
  const critical_done = PC_CHECKLIST.filter(i => i.critical && _pcChecked[i.id]).length;
  const critical_total = PC_CHECKLIST.filter(i => i.critical).length;
  container.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;padding:10px 14px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">
      <div style="font-size:11px;color:var(--text2)">Progress: <b style="color:var(--text)">${done}/${total}</b> items confirmed</div>
      <div style="height:6px;flex:1;background:var(--border);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${Math.round(done/total*100)}%;background:var(--accent);border-radius:3px;transition:width .3s"></div>
      </div>
      <div style="font-size:11px;color:${critical_done===critical_total?'#1D9E75':'#A32D2D'}">
        Critical: ${critical_done}/${critical_total} ${critical_done===critical_total?'✓':'⚠'}
      </div>
    </div>
    ${PC_CHECKLIST.map(item => `
      <label style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;border:1px solid ${_pcChecked[item.id]?'#C6EDDA':'var(--border)'};background:${_pcChecked[item.id]?'#F0FAF5':'var(--bg)'}">
        <input type="checkbox" ${_pcChecked[item.id]?'checked':''} onchange="pcToggle('${item.id}',this.checked)" style="margin-top:2px;flex-shrink:0">
        <span style="font-size:11px;line-height:1.6;color:${_pcChecked[item.id]?'var(--text2)':'var(--text)'}">
          ${item.critical ? '<span style="color:#A32D2D;font-weight:700;font-size:10px;margin-right:4px">CRITICAL</span>' : ''}
          ${item.label}
        </span>
      </label>`).join('')}
  `;
}

function pcToggle(id, checked) {
  _pcChecked[id] = checked;
  localStorage.setItem('og_pc_checked', JSON.stringify(_pcChecked));
  renderPcChecklist();
}

function pcReset() {
  _pcChecked = {};
  localStorage.removeItem('og_pc_checked');
  renderPcChecklist();
}

function pcAskPreset(q) {
  document.getElementById('pc-ai-input').value = q;
  pcTab('ai');
  pcAskAI();
}

async function pcAskAI() {
  const input = document.getElementById('pc-ai-input');
  const responseEl = document.getElementById('pc-ai-response');
  const q = input.value.trim();
  if(!q) return;
  const key = getKey();
  if(!key){ responseEl.textContent = 'Please set your API key first.'; return; }
  responseEl.textContent = 'Thinking...';

  const system = `You are an expert marine cargo underwriter specialising in Project Cargo Insurance (PCI) and Project Cargo Delay in Start Up (PCDSU/DSU) at Lloyd's of London. You have studied the placed Nyanza Light Metals Project slip (B1743ONEMA, ONE1743, Oneglobal/Maksure Financial Holdings, South Africa, 2025) as a real-world precedent for how a PCI/DSU policy is structured in practice. You have deep practical knowledge of:

WORDING: JC2009/020 PCI/PCDSU (the JCC standard wording). Section 1 = cargo (physical loss/damage). Section 2 = DSU (consequential delay to Scheduled Commercial Operation Date).

DSU MECHANICS: Triggered by Section 1 cargo loss event OR H&M breakdown (CL285/CL295) OR land vehicle breakdown OR GA/salvage. Basis of indemnity: Gross Profit (Rate × Turnover shortfall) OR Fixed Costs + Debt Service + Increased Cost of Working. Time deductible (aggregate days, minimum 30, best practice 45-60 days). Indemnity period: from planned completion to actual completion, capped at policy maximum. DSU NEVER written standalone — requires cargo policy including War and Strikes as condition precedent.

CRITICAL ITEMS: Project Cargo Critical Items = items whose loss/delay would push back the SCOD. Defined by: can't be replaced in time for SCOD; OR unit value exceeds threshold (break-bulk); OR OOG (>12m × 2.5m × 2.5m, won't fit 40ft container); OR weight exceeds threshold; OR ocean barge shipments. Replacement time = re-order to site delivery including manufacture, test, pack, ship, install, commission. Post-COVID replacement times have extended dramatically (transformers/HVDC: 24-36 months; turbines: 18-24 months).

SURVEY WARRANTY: Named Marine Warranty Surveyor (MWS) is essential — attends loading/unloading/stowage of Critical Items. 72-hour advance notification rule: if Assured notifies in time and MWS fails to attend, not a breach. Breach reduces cover (not voids): to ICC(B) without Cl.1.3 for main shipments, ICC(C) for on-deck/barge. Survey exemptions: door-to-door containers; airfreight; surveyor waiver; component sub-assemblies not requiring survey.

FINAL POSITIONING EXCLUSION: Once installation of Critical Item begins directly from carrying conveyance at project site, DSU cover ceases. Temporary laydown at site preserves coverage through installation.

KEY EXCLUSIONS (Section 2): Liquidated damages/penalties (unless specifically included); post-damage improvements/alterations; import licence lapse; government commandeering (unless CL295); Final Positioning; contractor's own materials; public authority restrictions; non-availability of funds.

PRICING: Section 1 rated on confirmed shipping schedule values. Section 2 rated by daily indemnity method or marine rate on total DSU limit. Key rating drivers: replacement time per Critical Item; number of items on critical path; schedule float; MWS quality; time deductible; indemnity period cap.

CAR/EAR INTERFACE: DSU bridges the gap between cargo and construction insurance. Cargo policy ends at site delivery; CAR/EAR policy covers erection/construction. A 50/50 claims clause is often used where a loss straddles both policies. The CAR/EAR policy's ALOP section covers delay from on-site construction events; the DSU section of the cargo policy covers delay from transit events.

You give practical, technically precise answers relevant to Lloyd's underwriting. You flag risks, gotchas and market best practice. Keep answers focused and useful.

LENDERS' REQUIREMENTS: In project-financed assets, lenders provide a Minimum Insurance Requirements schedule (part of the Common Terms Agreement). This specifies all required policies. For marine cargo, lenders typically require: ICC(A)+War+SRCC+piracy; 50/50 clause with CAR; intermediate storage; concealed damage; airfreight replacement; packing waiver (key components only); returned/refused shipments; piracy total loss clause; DIC clause; lenders endorsement per CTA. The marine cargo terms PREVAIL over incoterms agreed between buyer and seller.

SASRIA (South Africa): The South African Special Risks Insurance Association is a state-backed insurer that is the ONLY entity that can cover political/civil/SRCC risks for property and works WITHIN South Africa. Commercial insurers (including Lloyd's) CANNOT cover these perils for property/works in SA — only SASRIA can. For a Lloyd's marine cargo placement on a SA project: international transit legs are covered under CL386 (ISC); inland SA transit legs need separate SASRIA inland transit cover. This is a mandatory gap to address on any SA project cargo placement. The WW/Nyanza Insurance Schedule in the Slip Library contains the full lenders' insurance specification for the Nyanza project as a reference.`;

  try {
    const text = await aiText({
      model:'claude-sonnet-4-20250514',
      max_tokens:1000,
      system,
      user:q
    });
    responseEl.textContent = text || 'No response';
  } catch(e) {
    responseEl.textContent = 'Error: ' + e.message;
  }
}
// ─────────────────────────────────────────────────────────────
