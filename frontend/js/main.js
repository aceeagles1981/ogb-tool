const BACKEND = 'https://og-backend-production.up.railway.app';
const TABS = ['home','pipeline','review','triage','projectcargo','placements','ingest','cargowar','draft','markets','slips','lessons','book','sov','proposal','intake','entities','contacts','assistant','reporting','renewals','production','intelligence','sliplib','clauselib','clausecheck'];


const RISK_STATUS_META = {
  submission:       { label:'Submission',                badge:'b-draft',  fg:'var(--acc)',    bg:'var(--acc-bg)' },
  in_market:        { label:'In market',                 badge:'b-live',   fg:'var(--acc)',    bg:'var(--acc-bg)' },
  quoted:           { label:'Quoted',                    badge:'b-quoted', fg:'var(--purple)', bg:'var(--purple-bg)' },
  firm_order:       { label:'Firm order',                badge:'b-cond',   fg:'var(--warn)',   bg:'var(--warn-bg)' },
  bound:            { label:'Bound',                     badge:'b-bound',  fg:'var(--ok)',     bg:'var(--ok-bg)' },
  renewal_pending:  { label:'Renewal pending',           badge:'b-cond',   fg:'var(--warn)',   bg:'var(--warn-bg)' },
  expired_review:   { label:'Expired — check renewal',   badge:'b-ntu',    fg:'var(--err)',    bg:'var(--err-bg)' },
  closed_ntu:       { label:'NTU / Closed',              badge:'b-ntu',    fg:'var(--err)',    bg:'var(--err-bg)' }
};

const RISK_STATUS_ALIASES = {
  'submission': 'submission',
  'awaiting submission': 'submission',
  'awaiting-submission': 'submission',
  'submission received': 'submission',
  'submission-received': 'submission',
  'aw submission': 'submission',
  'in market': 'in_market',
  'in-market': 'in_market',
  'live': 'in_market',
  'quoted': 'quoted',
  'firm order': 'firm_order',
  'firm-order': 'firm_order',
  'bound': 'bound',
  'on risk': 'bound',
  'on-risk': 'bound',
  'renewal pending': 'renewal_pending',
  'renewal': 'renewal_pending',
  'expired — check renewal': 'expired_review',
  'expired - check renewal': 'expired_review',
  'expired check renewal': 'expired_review',
  'ntu': 'closed_ntu',
  'dead': 'closed_ntu',
  'closed': 'closed_ntu',
  'closed ntu': 'closed_ntu',
  'closed_ntu': 'closed_ntu'
};

function canonicalRiskStatus(raw) {
  const key = String(raw == null ? '' : raw).trim().toLowerCase();
  return RISK_STATUS_ALIASES[key] || 'submission';
}

function riskStatusMeta(raw) {
  return RISK_STATUS_META[canonicalRiskStatus(raw)] || RISK_STATUS_META.submission;
}

function riskStatusLabel(raw) {
  return riskStatusMeta(raw).label;
}

function riskStatusBadgeClass(raw) {
  return riskStatusMeta(raw).badge;
}

function riskStatusBadgeHtml(raw) {
  const meta = riskStatusMeta(raw);
  return `<span class="badge ${meta.badge}">${meta.label}</span>`;
}

function riskStatusIsPipeline(raw) {
  return ['submission','in_market','quoted','firm_order','renewal_pending'].includes(canonicalRiskStatus(raw));
}

function riskStatusSortRank(raw) {
  return {
    bound: 80,
    renewal_pending: 70,
    firm_order: 60,
    quoted: 50,
    in_market: 40,
    submission: 30,
    expired_review: 20,
    closed_ntu: 10
  }[canonicalRiskStatus(raw)] || 0;
}

function parseUkDateLoose(value) {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  const s = String(value).trim();
  const p = s.split('/');
  if (p.length === 3) {
    const d = new Date(Number(p[2]), Number(p[1]) - 1, Number(p[0]));
    return isNaN(d) ? new Date(0) : d;
  }
  const d = new Date(s);
  return isNaN(d) ? new Date(0) : d;
}

function saveKey(){ return true; }
function getKey(){ return 'backend'; }

const ADMIN_TOKEN_STORAGE_KEY = 'og_admin_token_v1';

function getAdminToken(){
  try { return localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || ''; } catch(_) { return ''; }
}

function setAdminToken(token){
  try { localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, String(token || '').trim()); } catch(_) {}
}

function getCurrentUserId(){
  try { return localStorage.getItem('og_current_user_id') || ''; } catch(_) { return ''; }
}

function setCurrentUserId(id){
  try { localStorage.setItem('og_current_user_id', String(id || '').trim()); } catch(_) {}
}

function clearAdminToken(){
  try { localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY); } catch(_) {}
  const input = document.getElementById('admin-token-input');
  if(input) input.value = '';
  updateAdminTokenUi();
  checkBackend();
}

async function refreshUsers(){
  try{
    await loadUsers(true);
    showNotice('Users refreshed', 'ok');
  }catch(e){
    showNotice('Could not load users: ' + e.message, 'err');
  }
}

async function loadUsers(force){
  const token = getAdminToken();
  const userBar = document.getElementById('user-bar');
  const select = document.getElementById('user-select');
  if(!token || !select){
    if(userBar) userBar.style.display = 'none';
    return;
  }
  if(select.dataset.loaded === '1' && !force){
    if(userBar) userBar.style.display = 'flex';
    return;
  }
  const data = await apiFetch('/users');
  const items = Array.isArray(data.items) ? data.items : [];
  select.innerHTML = items.map(function(u){
    return '<option value="'+u.id+'">'+escapeHtml((u.name||u.username||('User '+u.id)) + ' · ' + (u.role||'user'))+'</option>';
  }).join('');
  var saved = getCurrentUserId();
  if(saved && items.some(function(u){ return String(u.id) === String(saved); })){
    select.value = saved;
  } else if(items.length){
    select.value = String(items[0].id);
    setCurrentUserId(items[0].id);
  }
  select.onchange = function(){ setCurrentUserId(select.value); };
  select.dataset.loaded = '1';
  if(userBar) userBar.style.display = items.length ? 'flex' : 'none';
}

function saveAdminToken(){
  const input = document.getElementById('admin-token-input');
  const token = (input && input.value ? input.value : '').trim();
  if(!token){
    showNotice('Paste the admin token first', 'err');
    return;
  }
  setAdminToken(token);
  updateAdminTokenUi();
  checkBackend();
  loadUsers(true).catch(function(){});
  showNotice('Admin token saved in this browser', 'ok');
}

function updateAdminTokenUi(){
  const bar = document.getElementById('api-key-bar');
  const input = document.getElementById('admin-token-input');
  const userBar = document.getElementById('user-bar');
  const hasToken = !!getAdminToken();
  if(input && hasToken && !input.value) input.value = '••••••••••';
  if(bar) bar.style.display = hasToken ? 'none' : 'flex';
  if(userBar) userBar.style.display = hasToken ? 'flex' : 'none';
}

function authHeaders(extra = {}){
  const headers = Object.assign({}, extra || {});
  const token = getAdminToken();
  const userId = getCurrentUserId();
  if(token) headers['X-Admin-Token'] = token;
  if(userId) headers['X-User-Id'] = userId;
  return headers;
}

async function apiFetch(path, options = {}) {
  const opts = Object.assign({}, options || {});
  opts.headers = authHeaders(opts.headers || {});
  const resp = await fetch(`${BACKEND}${path}`, opts);
  let data = null;
  try { data = await resp.json(); } catch(_) { data = null; }
  if (resp.status === 401) {
    updateAdminTokenUi();
    const msg = (data && data.message) || (data && data.error) || 'Admin token required';
    throw new Error(msg);
  }
  if (!resp.ok) {
    const msg = (data && data.error && data.error.message) || (data && data.message) || (data && data.error) || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return data;
}

function extractAIText(data){
  if (!data) return '';
  return (data.content || [])
    .filter(block => block.type === 'text')
    .map(block => block.text || '')
    .join('')
    .trim();
}

async function aiRequest(payload) {
  return apiFetch('/ai', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
}

async function aiText({ model = 'claude-sonnet-4-20250514', max_tokens = 1000, system = '', user = '', tools } = {}) {
  const payload = {
    model,
    max_tokens,
    system,
    messages: [{ role: 'user', content: user }]
  };
  if (tools) payload.tools = tools;
  const data = await aiRequest(payload);
  if (data && data.error) {
    throw new Error(data.error.message || 'AI request failed');
  }
  return extractAIText(data);
}

window.addEventListener('load', () => {
  const input = document.getElementById('admin-token-input');
  const existingToken = getAdminToken();
  if(input && existingToken) input.value = '••••••••••';
  updateAdminTokenUi();
  checkBackend();
  init();
  renderPipeline();
  populateRefs();
  renderHomeTileStats();
  initExtensions();
});

async function checkBackend(){
  const dot = document.getElementById('backend-dot');
  const txt = document.getElementById('backend-status');
  try{
    const res = await fetch(`${BACKEND}/health?_=${Date.now()}`, { cache:'no-store' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    if(d && d.ok){
      const hasToken = !!getAdminToken();
      if(dot) dot.style.background = hasToken ? 'var(--ok)' : 'var(--warn)';
      if(txt) txt.textContent = hasToken ? 'Backend connected' : 'Backend live · token needed';
      try {
        updateAdminTokenUi();
      } catch (uiErr) {
        console.error('updateAdminTokenUi failed after successful health check', uiErr);
      }
      console.log('checkBackend ok', { backend: BACKEND, hasToken, health: d });
      return true;
    }
    if(dot) dot.style.background = 'var(--err)';
    if(txt) txt.textContent = 'Backend error';
    console.error('checkBackend health payload not ok', d);
    return false;
  } catch(e){
    if(dot) dot.style.background = 'var(--err)';
    if(txt) txt.textContent = 'Backend offline';
    console.error('checkBackend failed', { backend: BACKEND, error: e });
    return false;
  }
}


// ── Breadcrumb navigation ──────────────────────────────────────────────────

const BREADCRUMB_LABELS = {
  home:         'Home',
  pipeline:     'Pipeline',
  review:       'Review Queue',
  triage:       'Technical Assistant',
  placements:   'Placements',
  ingest:       'Email Ingest',
  draft:        'Draft Comms',
  markets:      'Market Reporting',
  slips:        'Quote Slips',
  lessons:      'Lessons',
  book:         'Book View',
  sov:          'SOV & CAT Monitor',
  proposal:     'Proposal Form',
  intake:       'Submission Intake',
  entities:     'Existing Accounts',
  contacts:     'Address Book',
  assistant:    'Technical Assistant',
  reporting:    'Market Reporting',
  renewals:     'Renewals & Post-bind',
  cargowar:     'Cargo War',
  production:   'Production',
  intelligence: 'Intelligence',
  sliplib:      'Slip Library',
  clauselib:    'Clause Library',
};

// Which section each tab belongs to on the home screen
const TAB_SECTION = {
  pipeline:     'Core',
  cargowar:     'Core',
  renewals:     'Core',
  entities:     'Core',
  ingest:       'Core',
  placements:   'Core',
  triage:       'Tools',
  assistant:    'Tools',
  reporting:    'Tools',
  contacts:     'Tools',
  production:   'Tools',
  draft:        'Tools',
  slips:        'Tools',
  proposal:     'Tools',
  intake:       'Tools',
  markets:      'Growth',
  sliplib:      'Growth',
  clauselib:    'Growth',
  sov:          'Tools',
  book:         'Tools',
  lessons:      'Growth',
  intelligence: 'Tools',
};

function renderBreadcrumb(id) {
  const bc = document.getElementById('breadcrumb');
  if (!bc) return;
  if (id === 'home') { bc.innerHTML = ''; return; }

  const sep = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" style="opacity:.4;flex-shrink:0"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const crumb = (label, onclick, active=false) => {
    const style = active
      ? 'font-weight:600;color:var(--text);cursor:default'
      : 'color:var(--text3);cursor:pointer;padding:2px 4px;border-radius:4px;transition:background .15s';
    const hover = active ? '' : `onmouseenter="this.style.background='var(--border)'" onmouseleave="this.style.background=''"`;
    const click = active ? '' : `onclick="${onclick}"`;
    return `<span style="${style}" ${hover} ${click}>${label}</span>`;
  };

  const label = BREADCRUMB_LABELS[id] || id;
  bc.innerHTML = crumb('Home', "tab('home')") + sep + crumb(label, '', true);
}


function tab(id){
  TABS.forEach(t => {
    const el = document.getElementById(t);
    if(el) el.classList.toggle('active', t===id);
  });
  // Show/hide sub-nav (hide on home)
  const subnav = document.getElementById('sub-nav');
  if(subnav) subnav.style.display = id==='home' ? 'none' : 'flex';
  renderBreadcrumb(id);
  if(id==='placements') renderPlacements();
  if(id==='review') renderReviewQueue();
  if(id==='lessons') renderLessons();
  if(id==='markets') renderFeedback();
  if(id==='draft'||id==='slips') populateRefs();
  if(id==='sov') sovRender();
  if(id==='entities') renderEntities();
  if(id==='contacts') renderContacts();
  if(id==='renewals') renderRenewals();
  if(id==='production') renderProduction();
  if(id==='home') renderHomeTileStats();
  if(id==='cargowar'){ cwInit(); }
  if(id==='projectcargo') renderProjectCargo();
    if(id==='sliplib'){ ensureBulkSTPRISeed(); ensureStandardSTPSeed(); ensurePharmaSTPSeed(); renderSlipLib(); }
  if(id==='clauselib') renderClauseLib();
}

function gs(){ try{ return JSON.parse(localStorage.getItem('og_state_v4')||'{}'); }catch{ return {}; } }
function ss(s){ localStorage.setItem('og_state_v4', JSON.stringify(s)); }

function init(){
  const s = gs();
  if(!s.placements){
    s.placements = {
    "auto-import-internac-2026": {
        "ref": "auto-import-internac-2026",
        "insured": "Auto Import Internacional SA",
        "producer": "Momentum Panama",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "",
        "markets": "CNA Hardy",
        "notes": "CNA Hardy indication USD 20k. Two deductible options pending firm terms.",
        "handler": "KE",
        "region": "Panama",
        "newRenewal": "New",
        "enquiryDate": "09/04/2026",
        "inceptionDate": "",
        "comm": "",
        "actions": [],
        "created": "09/04/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "amapa-materials-2026": {
        "ref": "amapa-materials-2026",
        "insured": "Amapa Materials",
        "producer": "Galcor Brazil",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "150000",
        "markets": "Chubb",
        "notes": "VRI From Chubb - need full wording and questions",
        "handler": "KE",
        "region": "Brazil",
        "newRenewal": "New",
        "enquiryDate": "10/10/2025",
        "inceptionDate": "14/03/2026",
        "comm": "22500",
        "actions": [],
        "created": "10/10/2025",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "bacon-galleries-inc-2026": {
        "ref": "bacon-galleries-inc-2026",
        "insured": "Bacon Galleries Inc",
        "producer": "RT Specialty Florida",
        "product": "",
        "ccy": "USD",
        "status": "live",
        "si": "20000",
        "markets": "Contour",
        "notes": "Have blocked Contour on this one - awaiting updated renewal apps closer to renewal date to send out submission. Maisie chased.",
        "handler": "MM",
        "region": "USA",
        "newRenewal": "New",
        "enquiryDate": "01/09/2025",
        "inceptionDate": "23/04/2026",
        "comm": "2000",
        "actions": [],
        "created": "01/09/2025",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "clapotis-carriers-lt-2026": {
        "ref": "clapotis-carriers-lt-2026",
        "insured": "Clapotis Carriers Ltd",
        "producer": "SANAD",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "90000",
        "markets": "Landmark",
        "notes": "Quoted - pushing Landmark terms 13/03 - chased for feedback 13/03",
        "handler": "KE",
        "region": "UAE",
        "newRenewal": "New",
        "enquiryDate": "02/03/2026",
        "inceptionDate": "01/04/2026",
        "comm": "",
        "actions": [],
        "created": "02/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "cobantur-all-risks-2026": {
        "ref": "cobantur-all-risks-2026",
        "insured": "Cobantur All Risks",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "live",
        "si": "266000",
        "markets": "Contour",
        "notes": "Quote sent to Integra / Contour lead 50% quote / EW chased for feedback 23/03",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "10/03/2026",
        "inceptionDate": "01/04/2026",
        "comm": "53200",
        "actions": [],
        "created": "10/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "dayana-internacional-2026": {
        "ref": "dayana-internacional-2026",
        "insured": "Dayana Internacional SA",
        "producer": "LatAm Re Panama",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "15000",
        "markets": "Fiducia",
        "notes": "Quoted 14/03 / Chased for feedback 23/03",
        "handler": "KE",
        "region": "Panama",
        "newRenewal": "New",
        "enquiryDate": "24/02/2026",
        "inceptionDate": "01/04/2026",
        "comm": "1875",
        "actions": [],
        "created": "24/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "delta-fashion-sa-2026": {
        "ref": "delta-fashion-sa-2026",
        "insured": "Delta Fashion SA",
        "producer": "LatAm Re Panama",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "15000",
        "markets": "Fiducia",
        "notes": "Quoted 16/03 / Chased for feedback 23/03",
        "handler": "KE",
        "region": "Panama",
        "newRenewal": "New",
        "enquiryDate": "24/02/2026",
        "inceptionDate": "24/02/2026",
        "comm": "1875",
        "actions": [],
        "created": "24/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "faith-exp-2026": {
        "ref": "faith-exp-2026",
        "insured": "Faith EXP",
        "producer": "LatAm Re Panama",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "166800",
        "markets": "Fiducia",
        "notes": "Quoted 13/03 / Chased for feedback 23/03",
        "handler": "EW",
        "region": "Panama",
        "newRenewal": "New",
        "enquiryDate": "04/03/2026",
        "inceptionDate": "01/04/2026",
        "comm": "20850",
        "actions": [],
        "created": "04/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "denko-trading-2026": {
        "ref": "denko-trading-2026",
        "insured": "DENKO Trading",
        "producer": "Gemini Brokers",
        "product": "",
        "ccy": "USD",
        "status": "live",
        "si": "400000",
        "markets": "Navium",
        "notes": "Questions back with producer? Are we losing the PD?",
        "handler": "EW",
        "region": "HK",
        "newRenewal": "Renewal",
        "enquiryDate": "25/03/2026",
        "inceptionDate": "16/04/2026",
        "comm": "",
        "actions": [],
        "created": "25/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "euromaster-2026": {
        "ref": "euromaster-2026",
        "insured": "Euromaster",
        "producer": "Strada Consulting",
        "product": "",
        "ccy": "USD",
        "status": "live",
        "si": "108888",
        "markets": "Fiducia",
        "notes": "Sent to Fiducia 17/03",
        "handler": "KE",
        "region": "Panama",
        "newRenewal": "New",
        "enquiryDate": "16/03/2026",
        "inceptionDate": "05/04/2026",
        "comm": "13611",
        "actions": [],
        "created": "16/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "cobantur-logistics-s-2026": {
        "ref": "cobantur-logistics-s-2026",
        "insured": "Cobantur Logistics Stock Only RI",
        "producer": "Integra",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "266000",
        "markets": "Contour Underwriting",
        "notes": "Quoted 17/03 - 50% lead line from Contour",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "10/03/2026",
        "inceptionDate": "",
        "comm": "45200",
        "actions": [],
        "created": "10/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "almacenadora-sur-al-2026": {
        "ref": "almacenadora-sur-al-2026",
        "insured": "ALMACENADORA SUR (ALSUR)",
        "producer": "Sky Re",
        "product": "",
        "ccy": "USD",
        "status": "live",
        "si": "850000",
        "markets": "",
        "notes": "Questions asked about whether STP or WHLL / FFL",
        "handler": "KE",
        "region": "Mexico",
        "newRenewal": "New",
        "enquiryDate": "20/03/2026",
        "inceptionDate": "28/03/2026",
        "comm": "85000",
        "actions": [],
        "created": "20/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "misc-2026": {
        "ref": "misc-2026",
        "insured": "MISC",
        "producer": "MMS Brokers",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "250000",
        "markets": "Contour",
        "notes": "Contour Lead Terms to GA only cover. Chased 13/03",
        "handler": "KE",
        "region": "Malaysia",
        "newRenewal": "New",
        "enquiryDate": "01/09/2025",
        "inceptionDate": "01/04/2026",
        "comm": "31250",
        "actions": [],
        "created": "01/09/2025",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "importadora-amigo-2026": {
        "ref": "importadora-amigo-2026",
        "insured": "IMPORTADORA AMIGO",
        "producer": "LatAm Re Panama",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "77000",
        "markets": "Fiducia",
        "notes": "Fiducia lead quote (50%) - Ed updating quote slip to send to Fiducia for agreement 23/03",
        "handler": "MM",
        "region": "Panama",
        "newRenewal": "New",
        "enquiryDate": "20/02/2026",
        "inceptionDate": "01/03/2026",
        "comm": "9625",
        "actions": [],
        "created": "20/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "kai-lojistik-2026": {
        "ref": "kai-lojistik-2026",
        "insured": "KAI Lojistik",
        "producer": "Integra",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "7950",
        "markets": "Freeboard Maritime",
        "notes": "Quoted by FB 27/02 - awaiting client feedback / chased 23/03 - Cuba is excluded",
        "handler": "MM",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "27/02/2026",
        "inceptionDate": "01/04/2026",
        "comm": "1590",
        "actions": [],
        "created": "27/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "distribuidora-liverp-2026": {
        "ref": "distribuidora-liverp-2026",
        "insured": "Distribuidora Liverpool Mexico",
        "producer": "Strada Consulting",
        "product": "",
        "ccy": "USD",
        "status": "live",
        "si": "400000",
        "markets": "Landmark",
        "notes": "Questions/Feedback due from producer // chased 23/03 probably not a goer",
        "handler": "EW",
        "region": "Mexico",
        "newRenewal": "New",
        "enquiryDate": "03/03/2026",
        "inceptionDate": "01/04/2026",
        "comm": "",
        "actions": [],
        "created": "03/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "medlog-ffl-2026": {
        "ref": "medlog-ffl-2026",
        "insured": "MEDLOG FFL",
        "producer": "KMC Brokers",
        "product": "",
        "ccy": "",
        "status": "live",
        "si": "",
        "markets": "Freeboard Maritime",
        "notes": "Have requested submission",
        "handler": "MM",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "26/02/2026",
        "inceptionDate": "01/04/2026",
        "comm": "",
        "actions": [],
        "created": "26/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "mirage-trading-sa-2026": {
        "ref": "mirage-trading-sa-2026",
        "insured": "Mirage Trading SA",
        "producer": "LatAm Re Panama",
        "product": "",
        "ccy": "",
        "status": "live",
        "si": "25000",
        "markets": "Fiducia",
        "notes": "Latam Re advise firm order - looking to pick up terms quoted to CR / Chased 23/03",
        "handler": "EW",
        "region": "Panama",
        "newRenewal": "",
        "enquiryDate": "21/02/2026",
        "inceptionDate": "01/04/2026",
        "comm": "5000",
        "actions": [],
        "created": "21/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "mystic-corporation-2026": {
        "ref": "mystic-corporation-2026",
        "insured": "Mystic Corporation",
        "producer": "LatAm Re Panama",
        "product": "",
        "ccy": "",
        "status": "live",
        "si": "",
        "markets": "Fiducia",
        "notes": "Submission sent to Fiducia 26/02 - chased LatamRe 23/03",
        "handler": "MM",
        "region": "Panama",
        "newRenewal": "New",
        "enquiryDate": "21/02/2026",
        "inceptionDate": "01/04/2026",
        "comm": "",
        "actions": [],
        "created": "21/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "nora-ffl-2026": {
        "ref": "nora-ffl-2026",
        "insured": "NORA FFL",
        "producer": "Integra",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "25000",
        "markets": "Freeboard Maritime",
        "notes": "QUOTED - quote slip currently with Integra 13/02 - need to discuss Bill of Ladings",
        "handler": "MM",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "04/02/2026",
        "inceptionDate": "02/04/2026",
        "comm": "",
        "actions": [],
        "created": "04/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "varodi-group-sa-2026": {
        "ref": "varodi-group-sa-2026",
        "insured": "Varodi Group SA",
        "producer": "Momentum",
        "product": "",
        "ccy": "USD",
        "status": "quoted",
        "si": "7500",
        "markets": "Fiducia",
        "notes": "Quoted by Fiducia - looking positive - chased 11/03",
        "handler": "EW",
        "region": "Panama",
        "newRenewal": "New",
        "enquiryDate": "29/01/2026",
        "inceptionDate": "01/03/2026",
        "comm": "750",
        "actions": [],
        "created": "29/01/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "texas-card-show-and--2026": {
        "ref": "texas-card-show-and--2026",
        "insured": "Texas Card Show and More LLC",
        "producer": "RT Specialty Dallas",
        "product": "",
        "ccy": "USD",
        "status": "live",
        "si": "150000",
        "markets": "Axa Art",
        "notes": "Call with RT / AXA to discuss regulations",
        "handler": "MM",
        "region": "USA",
        "newRenewal": "New",
        "enquiryDate": "10/03/2026",
        "inceptionDate": "01/04/2026",
        "comm": "15000",
        "actions": [],
        "created": "10/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "oldengate-ffl-2026": {
        "ref": "oldengate-ffl-2026",
        "insured": "OLDENGATE FFL",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "quoted",
        "si": "9000",
        "markets": "Freeboard",
        "notes": "Quoted by FB - await Integra feedback",
        "handler": "MM",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "02/04/2026",
        "inceptionDate": "",
        "comm": "1800",
        "actions": [],
        "created": "02/04/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "city-pharmaceutical--2026": {
        "ref": "city-pharmaceutical--2026",
        "insured": "City Pharmaceutical Company FAC R/I",
        "producer": "Chedid RE",
        "product": "",
        "ccy": "USD",
        "status": "live",
        "si": "100000",
        "markets": "",
        "notes": "Out to market - Chubb, Parsyl, Allianz, CNA, AML",
        "handler": "MM/EW",
        "region": "UAE",
        "newRenewal": "New",
        "enquiryDate": "08/04/2026",
        "inceptionDate": "",
        "comm": "10000",
        "actions": [],
        "created": "08/04/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "forestal-del-sur-2026": {
        "ref": "forestal-del-sur-2026",
        "insured": "Forestal del Sur",
        "producer": "Strada Consulting",
        "product": "",
        "ccy": "",
        "status": "live",
        "si": "",
        "markets": "",
        "notes": "Renewal information has been sent in by Pietro Sarti",
        "handler": "KE",
        "region": "",
        "newRenewal": "Renewal",
        "enquiryDate": "",
        "inceptionDate": "29/04/2026",
        "comm": "",
        "actions": [],
        "created": "2026-01-01",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "tradezone-2026": {
        "ref": "tradezone-2026",
        "insured": "Tradezone",
        "producer": "Integra",
        "product": "",
        "ccy": "",
        "status": "live",
        "si": "",
        "markets": "",
        "notes": "W/Josh",
        "handler": "KE",
        "region": "",
        "newRenewal": "Renewal",
        "enquiryDate": "02/04/2026",
        "inceptionDate": "01/05/2026",
        "comm": "",
        "actions": [],
        "created": "02/04/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "paptrans-2026": {
        "ref": "paptrans-2026",
        "insured": "Paptrans",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "live",
        "si": "",
        "markets": "",
        "notes": "Renewal invite sent",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "Renewal",
        "enquiryDate": "",
        "inceptionDate": "03/05/2026",
        "comm": "",
        "actions": [],
        "created": "2026-01-01",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "jefo-nutrition-2026": {
        "ref": "jefo-nutrition-2026",
        "insured": "Jefo Nutrition",
        "producer": "Lareau",
        "product": "",
        "ccy": "",
        "status": "live",
        "si": "",
        "markets": "",
        "notes": "BOR moved away from Langelier",
        "handler": "KE",
        "region": "",
        "newRenewal": "Renewal",
        "enquiryDate": "",
        "inceptionDate": "19/05/2026",
        "comm": "",
        "actions": [],
        "created": "2026-01-01",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "semillas-batlle-2026": {
        "ref": "semillas-batlle-2026",
        "insured": "Semillas Batlle",
        "producer": "ARB International",
        "product": "",
        "ccy": "",
        "status": "live",
        "si": "",
        "markets": "",
        "notes": "Renewal",
        "handler": "KE",
        "region": "",
        "newRenewal": "Renewal",
        "enquiryDate": "",
        "inceptionDate": "31/05/2026",
        "comm": "",
        "actions": [],
        "created": "2026-01-01",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "dfds-poland-2026": {
        "ref": "dfds-poland-2026",
        "insured": "DFDS Poland",
        "producer": "Integra",
        "product": "",
        "ccy": "",
        "status": "live",
        "si": "",
        "markets": "",
        "notes": "Renewal",
        "handler": "KE",
        "region": "",
        "newRenewal": "Renewal",
        "enquiryDate": "",
        "inceptionDate": "31/05/2026",
        "comm": "",
        "actions": [],
        "created": "2026-01-01",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "image-trust-2026": {
        "ref": "image-trust-2026",
        "insured": "Image Trust",
        "producer": "RT Specialty Tampa",
        "product": "",
        "ccy": "",
        "status": "live",
        "si": "",
        "markets": "",
        "notes": "Renewal",
        "handler": "KE",
        "region": "",
        "newRenewal": "Renewal",
        "enquiryDate": "",
        "inceptionDate": "08/06/2026",
        "comm": "",
        "actions": [],
        "created": "2026-01-01",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "sumex-america-corp-2026": {
        "ref": "sumex-america-corp-2026",
        "insured": "SUMEX America Corp",
        "producer": "Argentum RE",
        "product": "",
        "ccy": "USD",
        "status": "live",
        "si": "20000",
        "markets": "",
        "notes": "C Hardy working on it.",
        "handler": "EW",
        "region": "",
        "newRenewal": "",
        "enquiryDate": "06/04/2026",
        "inceptionDate": "",
        "comm": "2500",
        "actions": [],
        "created": "06/04/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },    "inpasa-grenco-2025": {
        "ref": "inpasa-grenco-2025",
        "insured": "Inpasa Grenco",
        "producer": "OGB Brazil",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "",
        "markets": "",
        "notes": "Quoted 17/11 - Latest chase 08/12 - crickets (will close for now)",
        "handler": "KE",
        "region": "Brazil",
        "newRenewal": "New",
        "enquiryDate": "23/10/2025",
        "inceptionDate": "23/10/2025",
        "comm": "4000",
        "actions": [],
        "created": "23/10/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "23/10/2025"
    },
    "the-bruery-llc-2025": {
        "ref": "the-bruery-llc-2025",
        "insured": "The Bruery LLC",
        "producer": "Hull & Co",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "",
        "markets": "Contour",
        "notes": "Local broker cheaper",
        "handler": "JK",
        "region": "UK",
        "newRenewal": "New",
        "enquiryDate": "23/10/2025",
        "inceptionDate": "13/12/2025",
        "comm": "2100",
        "actions": [],
        "created": "23/10/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "13/12/2025"
    },
    "glengyle-2025": {
        "ref": "glengyle-2025",
        "insured": "Glengyle",
        "producer": "Houlders",
        "product": "",
        "ccy": "",
        "status": "ntu",
        "si": "200000",
        "markets": "",
        "notes": "Leader terms provided - gone quiet",
        "handler": "KE",
        "region": "Hong Kong",
        "newRenewal": "New",
        "enquiryDate": "24/10/2025",
        "inceptionDate": "24/10/2025",
        "comm": "20000",
        "actions": [],
        "created": "24/10/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "24/10/2025"
    },
    "universal-acarsan-gr-2025": {
        "ref": "universal-acarsan-gr-2025",
        "insured": "Universal Acarsan Group",
        "producer": "Integra",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "",
        "markets": "N/A",
        "notes": "55M of stock in Iraq - request for clarifications sent. Awaiting data. - chased 16/12 no info",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "20/11/2025",
        "inceptionDate": "30/11/2025",
        "comm": "",
        "actions": [],
        "created": "20/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "30/11/2025"
    },
    "la-consolidada-para-2025": {
        "ref": "la-consolidada-para-2025",
        "insured": "La Consolidada (Paraguay)",
        "producer": "JNP Re Argentina",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "",
        "markets": "",
        "notes": "Have asked for full proposal. Kether chased on 26.11.",
        "handler": "KE",
        "region": "Paraguay",
        "newRenewal": "New",
        "enquiryDate": "03/11/2025",
        "inceptionDate": "30/11/2025",
        "comm": "",
        "actions": [],
        "created": "03/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "30/11/2025"
    },
    "sunar-misir-stp-2025": {
        "ref": "sunar-misir-stp-2025",
        "insured": "Sunar Misir STP",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "ntu",
        "si": "300000",
        "markets": "Fiducia",
        "notes": "Quoted - chasing feedback",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "",
        "enquiryDate": "27/10/2025",
        "inceptionDate": "27/10/2025",
        "comm": "30000",
        "actions": [],
        "created": "27/10/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "27/10/2025"
    },
    "byd-mexico-2025": {
        "ref": "byd-mexico-2025",
        "insured": "BYD Mexico",
        "producer": "SKY RE",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "",
        "markets": "Landmark",
        "notes": "Quoted/Looking for front - closed subject to Sky Re finding fronting solution 16/12",
        "handler": "EW",
        "region": "",
        "newRenewal": "",
        "enquiryDate": "28/10/2025",
        "inceptionDate": "01/11/2025",
        "comm": "30000",
        "actions": [],
        "created": "28/10/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "01/11/2025"
    },
    "cooprocarcat-mining--2025": {
        "ref": "cooprocarcat-mining--2025",
        "insured": "COOPROCARCAT Mining Cooperative",
        "producer": "OG Colombia",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "",
        "markets": "",
        "notes": "Have asked for full proposal from Jorge - not received as at 16/12",
        "handler": "EW",
        "region": "",
        "newRenewal": "",
        "enquiryDate": "31/10/2025",
        "inceptionDate": "31/10/2025",
        "comm": "",
        "actions": [],
        "created": "31/10/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "31/10/2025"
    },
    "ygl-lojistik-2025": {
        "ref": "ygl-lojistik-2025",
        "insured": "YGL Lojistik",
        "producer": "KMC",
        "product": "",
        "ccy": "EUR",
        "status": "ntu",
        "si": "",
        "markets": "Freeboard",
        "notes": "UW questions sent to client - no reply - closing file",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "12/12/2025",
        "inceptionDate": "11/12/2025",
        "comm": "",
        "actions": [],
        "created": "12/12/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "11/12/2025"
    },
    "chalhoub-group-2025": {
        "ref": "chalhoub-group-2025",
        "insured": "Chalhoub Group",
        "producer": "OG Dubai",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "",
        "markets": "Fiducia",
        "notes": "Discussed with Starr & RSA. Eva chased for key information.",
        "handler": "EW",
        "region": "",
        "newRenewal": "",
        "enquiryDate": "03/11/2025",
        "inceptionDate": "01/12/2025",
        "comm": "30000",
        "actions": [],
        "created": "03/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "01/12/2025"
    },
    "fuelpar-2025": {
        "ref": "fuelpar-2025",
        "insured": "FUELPAR",
        "producer": "JNP Re Argentina",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "15000",
        "markets": "Fiducia",
        "notes": "Indicated on 16 Dec 2025. Put a draft quote slip across to him - no reply as at 05/01/26 so closing",
        "handler": "EW",
        "region": "Bolivia",
        "newRenewal": "New",
        "enquiryDate": "16/12/2025",
        "inceptionDate": "22/12/2025",
        "comm": "1500",
        "actions": [],
        "created": "16/12/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "22/12/2025"
    },
    "erkport-2025": {
        "ref": "erkport-2025",
        "insured": "ERKPort",
        "producer": "Integra",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "750000",
        "markets": "Landmark",
        "notes": "Cars - primary indication with Joe Danphal - local market (Axa) super cheap - closed",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "11/12/2025",
        "inceptionDate": "30/12/2025",
        "comm": "75000",
        "actions": [],
        "created": "11/12/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "30/12/2025"
    },
    "etanoles-del-magdale-2025": {
        "ref": "etanoles-del-magdale-2025",
        "insured": "Etanoles Del Magdalena",
        "producer": "OG Colombia",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "10000",
        "markets": "WISE / Fiducia",
        "notes": "Chased Quote Feedback 01/12 - cedants have issues with Fiducia - no feedback so closing",
        "handler": "EW",
        "region": "Colombia",
        "newRenewal": "New",
        "enquiryDate": "07/11/2025",
        "inceptionDate": "31/12/2025",
        "comm": "1000",
        "actions": [],
        "created": "07/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "31/12/2025"
    },
    "evolog-nakliyat-ffl-2025": {
        "ref": "evolog-nakliyat-ffl-2025",
        "insured": "EVOLOG Nakliyat FFL",
        "producer": "Integra",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "115000",
        "markets": "Freeboard Maritime",
        "notes": "Freeboard indicated $110k with a 12.5k deductible - chased 16/12, 05/01 - closing",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "03/12/2025",
        "inceptionDate": "31/12/2025",
        "comm": "23000",
        "actions": [],
        "created": "03/12/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "31/12/2025"
    },
    "triangle-commodities-2025": {
        "ref": "triangle-commodities-2025",
        "insured": "Triangle Commodities Trading",
        "producer": "OGB Dubai",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "",
        "markets": "N/A",
        "notes": "Awaiting information. Ed chased on 26.11.2025 & 02.12.2025",
        "handler": "EW",
        "region": "",
        "newRenewal": "",
        "enquiryDate": "05/11/2025",
        "inceptionDate": "05/11/2025",
        "comm": "2500",
        "actions": [],
        "created": "05/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "05/11/2025"
    },
    "irmak-warehousing-2025": {
        "ref": "irmak-warehousing-2025",
        "insured": "Irmak Warehousing",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "ntu",
        "si": "150000",
        "markets": "50% Contour",
        "notes": "Primary EUR 25M quoted - (options needed for 25M x 25 and 55M x 25M)",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "16/12/2025",
        "inceptionDate": "31/12/2025",
        "comm": "30000",
        "actions": [],
        "created": "16/12/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "31/12/2025"
    },
    "logitrans-2025": {
        "ref": "logitrans-2025",
        "insured": "Logitrans",
        "producer": "KMC",
        "product": "",
        "ccy": "",
        "status": "ntu",
        "si": "",
        "markets": "",
        "notes": "Too claims intensive for London - Nil deductible - closing",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "16/12/2025",
        "inceptionDate": "31/12/2025",
        "comm": "",
        "actions": [],
        "created": "16/12/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "31/12/2025"
    },
    "nasser-bin-abdullati-2025": {
        "ref": "nasser-bin-abdullati-2025",
        "insured": "Nasser Bin Abdullatif Alserkal Group (Tyres)",
        "producer": "OGB Dubai",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "200000",
        "markets": "Fiducia",
        "notes": "Unable to compete with regional market deductibles and pricing.",
        "handler": "EW",
        "region": "UAE",
        "newRenewal": "New",
        "enquiryDate": "27/11/2025",
        "inceptionDate": "31/12/2025",
        "comm": "20000",
        "actions": [],
        "created": "27/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "31/12/2025"
    },
    "kupfer-hnos-2025": {
        "ref": "kupfer-hnos-2025",
        "insured": "Kupfer HNOS",
        "producer": "Strada Consulting",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "225000",
        "markets": "Fiducia",
        "notes": "$225k VVRI from Fiducia - claims record shit - asked for RM deets 02/12",
        "handler": "EW",
        "region": "Chile",
        "newRenewal": "New",
        "enquiryDate": "18/11/2025",
        "inceptionDate": "31/12/2025",
        "comm": "22500",
        "actions": [],
        "created": "18/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "31/12/2025"
    },
    "euroherc-insurance-2025": {
        "ref": "euroherc-insurance-2025",
        "insured": "Euroherc Insurance",
        "producer": "Fortus Inter Partes",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "",
        "markets": "",
        "notes": "Bought Locally",
        "handler": "KE",
        "region": "",
        "newRenewal": "",
        "enquiryDate": "20/11/2025",
        "inceptionDate": "20/11/2025",
        "comm": "10000",
        "actions": [],
        "created": "20/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "20/11/2025"
    },
    "halk-insurance-plc-2025": {
        "ref": "halk-insurance-plc-2025",
        "insured": "Halk Insurance plc",
        "producer": "Fortus Inter Partes",
        "product": "",
        "ccy": "",
        "status": "ntu",
        "si": "",
        "markets": "",
        "notes": "Sent out to Markets 08/12 - couldn't secure solution",
        "handler": "KE",
        "region": "Croatia",
        "newRenewal": "",
        "enquiryDate": "20/11/2025",
        "inceptionDate": "01/01/2026",
        "comm": "",
        "actions": [],
        "created": "20/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "01/01/2026"
    },
    "sunwoda-mobility-ene-2025": {
        "ref": "sunwoda-mobility-ene-2025",
        "insured": "SUNWODA Mobility Energy Technology",
        "producer": "Integra",
        "product": "",
        "ccy": "",
        "status": "ntu",
        "si": "",
        "markets": "N/A",
        "notes": "With UW's 25/11/2025. Quoted. Placed locally",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "20/11/2025",
        "inceptionDate": "20/11/2025",
        "comm": "",
        "actions": [],
        "created": "20/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "20/11/2025"
    },
    "orion-ffl-2025": {
        "ref": "orion-ffl-2025",
        "insured": "Orion FFL",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "ntu",
        "si": "11500",
        "markets": "Freeboard Maritime",
        "notes": "Quoted 17/12, No feedback as at 05/01 so closing file.",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "09/12/2025",
        "inceptionDate": "31/12/2025",
        "comm": "2300",
        "actions": [],
        "created": "09/12/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "31/12/2025"
    },
    "semillas-el-campillo-2025": {
        "ref": "semillas-el-campillo-2025",
        "insured": "Semillas El Campillo",
        "producer": "ARB International",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "",
        "markets": "",
        "notes": "W/AMP 08/12 - placed locally",
        "handler": "KE",
        "region": "Spain",
        "newRenewal": "",
        "enquiryDate": "24/11/2025",
        "inceptionDate": "16/12/2026",
        "comm": "3500",
        "actions": [],
        "created": "24/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "16/12/2026"
    },
    "seafrost-2025": {
        "ref": "seafrost-2025",
        "insured": "Seafrost",
        "producer": "Oneglobal Peru",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "150000",
        "markets": "Fiducia",
        "notes": "Quoted - OGB Peru still working with cedant 15/12 - no reply for over a month closed file as at 05/01/26",
        "handler": "EW",
        "region": "Peru",
        "newRenewal": "New",
        "enquiryDate": "28/10/2025",
        "inceptionDate": "31/12/2025",
        "comm": "15000",
        "actions": [],
        "created": "28/10/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "31/12/2025"
    },
    "servicio-huanimaro-2025": {
        "ref": "servicio-huanimaro-2025",
        "insured": "Servicio Huanimaro",
        "producer": "Sky Re",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "20000",
        "markets": "",
        "notes": "Quoted 15/12/25, no feedback as at 05/01/2026 so closing",
        "handler": "EW",
        "region": "Mexico",
        "newRenewal": "New",
        "enquiryDate": "25/11/2025",
        "inceptionDate": "31/12/2025",
        "comm": "2000",
        "actions": [],
        "created": "25/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "31/12/2025"
    },
    "jacob-&-jacob-2025": {
        "ref": "jacob-&-jacob-2025",
        "insured": "Jacob & Jacob",
        "producer": "SKY RE",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "",
        "markets": "Fiducia",
        "notes": "Indicated on 01/12/2025. Ed chased on 04.12.2025.",
        "handler": "EW",
        "region": "",
        "newRenewal": "",
        "enquiryDate": "29/11/2025",
        "inceptionDate": "12/08/2025",
        "comm": "1000",
        "actions": [],
        "created": "29/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "12/08/2025"
    },
    "yalova-roro-excess-w-2025": {
        "ref": "yalova-roro-excess-w-2025",
        "insured": "Yalova RORO Excess WHLL",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "ntu",
        "si": "135000",
        "markets": "Contour 50%",
        "notes": "Quoted - Integra pushing for order 09/12 - Feedback is that this is expensive although they do not have other quotes",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "04/11/2025",
        "inceptionDate": "31/12/2025",
        "comm": "27000",
        "actions": [],
        "created": "04/11/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "31/12/2025"
    },
    "cma-paraguay-2025": {
        "ref": "cma-paraguay-2025",
        "insured": "CMA Paraguay",
        "producer": "JNP Re Argentina",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "25000",
        "markets": "Fiducia",
        "notes": "Quoted 25,000 10/12 - only 39% order / have asked for local slip 16/12",
        "handler": "KE",
        "region": "Paraguay",
        "newRenewal": "New",
        "enquiryDate": "01/12/2025",
        "inceptionDate": "01/01/2026",
        "comm": "2500",
        "actions": [],
        "created": "01/12/2025",
        "updated": "2025-12-31",
        "wipYear": "2025",
        "chaseDate": "01/01/2026"
    },
    "colakoglu-cargo-war-2026": {
        "ref": "colakoglu-cargo-war-2026",
        "insured": "Colakoglu Cargo War",
        "producer": "Integra",
        "product": "",
        "ccy": "USD",
        "status": "ntu",
        "si": "600000",
        "markets": "Cargo War Binder",
        "notes": "Issues with binder exclusions vs Anadolu requirements. Too cheap 0.08% net - held the line at 0.095%",
        "handler": "EW",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "17/12/2025",
        "inceptionDate": "26/02/2026",
        "comm": "90000",
        "actions": [],
        "created": "17/12/2025",
        "updated": "2026-12-31",
        "wipYear": "2026",
        "chaseDate": "26/02/2026"
    },
    "ceva-lojistik--boru-2026": {
        "ref": "ceva-lojistik--boru-2026",
        "insured": "CEVA Lojistik / Borusan Vehicle Logistics",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "bound",
        "si": "565000",
        "markets": "Landmark",
        "notes": "BOUND",
        "handler": "KE/MM/EW",
        "region": "Turkey",
        "newRenewal": "Renewal",
        "enquiryDate": "03/02/2026",
        "inceptionDate": "29/03/2026",
        "comm": "77688",
        "actions": [],
        "created": "03/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "cobantur-ffl-&-whll-2026": {
        "ref": "cobantur-ffl-&-whll-2026",
        "insured": "Cobantur (FFL & WHLL)",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "bound",
        "si": "80000",
        "markets": "Freeboard Maritime",
        "notes": "BOUND",
        "handler": "EW",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "21/01/2026",
        "inceptionDate": "01/02/2026",
        "comm": "7500",
        "actions": [],
        "created": "21/01/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "fg-ship-bunkers-ren-2026": {
        "ref": "fg-ship-bunkers-ren-2026",
        "insured": "FG Ship Bunkers (Renewal)",
        "producer": "AIB",
        "product": "",
        "ccy": "USD",
        "status": "bound",
        "si": "30000",
        "markets": "A2B",
        "notes": "BOUND",
        "handler": "EW/MM",
        "region": "Malta",
        "newRenewal": "Renewal",
        "enquiryDate": "01/02/2026",
        "inceptionDate": "01/02/2026",
        "comm": "5000",
        "actions": [],
        "created": "01/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "semex-2026": {
        "ref": "semex-2026",
        "insured": "Semex",
        "producer": "Langelier",
        "product": "",
        "ccy": "USD",
        "status": "bound",
        "si": "5000",
        "markets": "Markel",
        "notes": "Bound",
        "handler": "EW",
        "region": "Canada",
        "newRenewal": "New",
        "enquiryDate": "29/01/2026",
        "inceptionDate": "31/01/2026",
        "comm": "500",
        "actions": [],
        "created": "29/01/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "strides-pharma-usa-2026": {
        "ref": "strides-pharma-usa-2026",
        "insured": "Strides Pharma USA",
        "producer": "Prudent India",
        "product": "",
        "ccy": "USD",
        "status": "bound",
        "si": "300000",
        "markets": "W/Allianz",
        "notes": "Bound - With subjectivities",
        "handler": "KE",
        "region": "USA",
        "newRenewal": "New",
        "enquiryDate": "03/11/2025",
        "inceptionDate": "28/01/2026",
        "comm": "30000",
        "actions": [],
        "created": "03/11/2025",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "sunset-converting-co-2026": {
        "ref": "sunset-converting-co-2026",
        "insured": "Sunset Converting Corp",
        "producer": "Langelier",
        "product": "",
        "ccy": "USD",
        "status": "bound",
        "si": "20000",
        "markets": "Markel",
        "notes": "Quoted 19/02",
        "handler": "MM",
        "region": "Canada",
        "newRenewal": "Renewal",
        "enquiryDate": "12/02/2026",
        "inceptionDate": "05/03/2026",
        "comm": "2000",
        "actions": [],
        "created": "12/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "yafaar-international-2026": {
        "ref": "yafaar-international-2026",
        "insured": "Yafaar International",
        "producer": "LatAm Re Panama",
        "product": "",
        "ccy": "USD",
        "status": "bound",
        "si": "69500",
        "markets": "Fiducia",
        "notes": "Fiducia lead quote (50%) - trying to support",
        "handler": "MM",
        "region": "Panama",
        "newRenewal": "New",
        "enquiryDate": "19/02/2026",
        "inceptionDate": "01/04/2026",
        "comm": "13900",
        "actions": [],
        "created": "19/02/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "cofco-warcapstonei-2026": {
        "ref": "cofco-warcapstonei-2026",
        "insured": "COFCO War/Capstone/Ink",
        "producer": "Direct",
        "product": "",
        "ccy": "USD",
        "status": "bound",
        "si": "56000",
        "markets": "Landmark",
        "notes": "BOUND SLIP/Passed compliance",
        "handler": "EW",
        "region": "UAE",
        "newRenewal": "New",
        "enquiryDate": "09/03/2026",
        "inceptionDate": "09/03/2026",
        "comm": "14000",
        "actions": [],
        "created": "09/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "tech-energy-ffl-2026": {
        "ref": "tech-energy-ffl-2026",
        "insured": "Tech Energy FFL",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "bound",
        "si": "7000",
        "markets": "Freeboard Maritime",
        "notes": "100% bound - Freeboard",
        "handler": "MM",
        "region": "Turkey",
        "newRenewal": "New",
        "enquiryDate": "03/03/2026",
        "inceptionDate": "19/03/2026",
        "comm": "1400",
        "actions": [],
        "created": "03/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "pars-demiryolu-2026": {
        "ref": "pars-demiryolu-2026",
        "insured": "PARS Demiryolu",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "bound",
        "si": "19500",
        "markets": "Freeboard",
        "notes": "BOUND",
        "handler": "KE",
        "region": "Turkey",
        "newRenewal": "Renewal",
        "enquiryDate": "25/03/2026",
        "inceptionDate": "07/04/2026",
        "comm": "3900",
        "actions": [],
        "created": "25/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "nabil-internacional--2026": {
        "ref": "nabil-internacional--2026",
        "insured": "Nabil Internacional SA 2026",
        "producer": "Momentum",
        "product": "",
        "ccy": "USD",
        "status": "bound",
        "si": "25000",
        "markets": "C Hardy",
        "notes": "BOUND, Endt 001 to action",
        "handler": "EW",
        "region": "Panama",
        "newRenewal": "New",
        "enquiryDate": "20/03/2026",
        "inceptionDate": "28/03/2026",
        "comm": "2500",
        "actions": [],
        "created": "20/03/2026",
        "updated": "2026-04-12",
        "wipYear": "2026"
    },
    "pars-demiryolu-rene-2026": {
        "ref": "pars-demiryolu-rene-2026",
        "insured": "PARS Demiryolu (renewal processing)",
        "producer": "Integra",
        "product": "",
        "ccy": "EUR",
        "status": "bound",
        "si": "19500",
        "markets": "Freeboard",
        "notes": "Bound - Slip with client. To be processed. PC due as well as invoice due.",
        "handler": "KE/EW",
        "region": "Turkey",
        "newRenewal": "Renewal",
        "enquiryDate": "",
        "inceptionDate": "07/04/2026",
        "comm": "3900",
        "actions": [],
        "created": "2026-01-01",
        "updated": "2026-04-12",
        "wipYear": "2026"
    }
};
  }
  if(!s.lessons){
    s.lessons = [
      {tag:'min premium',src:'PY Foods / JNP Re',text:'Min premium is the real floor — check before starting. Flat non-adjustable premium is a structural weapon against adjustable rate.',date:'2026-04'},
      {tag:'submission craft',src:'Auto Import 2026',text:'Story first, data second. Research the client. Weave a narrative. An underwriter should know why this is a good risk before they hit the data block.',date:'2026-04'},
      {tag:'commodity description',src:'PPAQ 2024',text:'Describe maple syrup as "bulk in hermetically sealed steel drums" not foodstuffs.',date:'2024-12'},
      {tag:'known loss history',src:'PPAQ 2024',text:'The 2011/12 maple syrup heist ($18.7M) is known to market — address proactively.',date:'2024-12'},
      {tag:'NTU record',src:'PY Foods',text:'Every NTU must produce a structured record. Intellectual labour must not be given away for free.',date:'2026-04'},
      {tag:'zero-conversion',src:'JNP Re',text:'Zero-conversion sources get one-liner only until they convert. Request loss record and min premium check before starting.',date:'2026-04'},
      {tag:'relationship override',src:'Auto Import / Momentum',text:'Min premium flags can be overridden for T2 diversification targets where a commercial commitment exists. Document the rationale.',date:'2026-04'},
      {tag:'auto parts exclusions',src:'Auto Import / CNA Hardy',text:'Standard exclusions for auto parts stock-only: scratching/denting/marring on unpacked items; rust/oxidisation on unpacked items; mechanical/electrical/electromagnetic derangement.',date:'2026-04'},
      {tag:'min premium negotiation',src:'Auto Import / Momentum',text:'When premium gap exists, offer two deductible options — original deductible with best premium, and higher deductible for a reduction. Gives cedant a choice without reopening the whole negotiation.',date:'2026-04'},
    ];
  }
  if(!s.marketFeedback){
    s.marketFeedback = [
      {market:'CNA Hardy — Sarah Moses',product:'Stock Only RI',territory:'Panama',outcome:'indicated',notes:'100% line USD 20k min premium. Ex scratching/denting/marring, ex rust/oxidisation, ex mechanical/electrical derangement on unpacked items.',ref:'autoimport-2026',date:'2026-04-10'},
      {market:'Canopius — Balca Gursoy',product:'STP XS',territory:'Canada',outcome:'declined',notes:'Seen STP last year. Min premium makes excess unworkable. Cannot do excess stock.',ref:'ppaq-2024',date:'2024-12'},
      {market:'CNA Hardy — James Killingback (382)',product:'STP XS',territory:'Canada',outcome:'bound',notes:'Fast mover. 10% on 1st XS. Valid to inception.',ref:'ppaq-2024',date:'2024-12'},
    ];
  }

  if(!s.contacts) s.contacts = [];
  ss(s);
}


async function fetchRiskList(params){
  var qs = new URLSearchParams();
  params = params || {};
  Object.keys(params).forEach(function(k){
    if(params[k] !== undefined && params[k] !== null && params[k] !== '') qs.set(k, String(params[k]));
  });
  var data = await apiFetch('/risks?' + qs.toString());
  return data.items || [];
}


async function fetchTaskList(params){
  var qs = new URLSearchParams();
  params = params || {};
  Object.keys(params).forEach(function(k){
    if(params[k] !== undefined && params[k] !== null && params[k] !== '') qs.set(k, String(params[k]));
  });
  var data = await apiFetch('/tasks?' + qs.toString());
  return data.items || [];
}

function riskToWipRow(r){
  var ai = r.ai_extracted || {};
  return {
    id: r.id,
    insured: r.display_name || r.assured_name,
    producer: r.producer || '—',
    handler: r.handler || '—',
    enquiryDate: isoToUk(r.created_at),
    inceptionDate: isoToUk(r.inception_date),
    expiryDate: isoToUk(r.expiry_date),
    ccy: r.currency || 'USD',
    premium: r.gross_premium,
    comm: r.locked_gbp_commission != null && r.locked_gbp_commission !== 0 ? r.locked_gbp_commission : r.estimated_gbp_commission,
    region: r.region || '—',
    status: canonicalRiskStatus(r.status),
    statusLabel: r.status_label || riskStatusLabel(r.status),
    product: r.product || '—',
    newRenewal: ai.newRenewal || ai.new_renewal || '',
    quoteLeader: ai.quoteLeader || ai.quote_leader || '',
    notes: (r.notes || '').replace(/\s+/g, ' ').slice(0, 120),
    review: !!r.needs_review,
    reviewReason: r.review_reason || '',
    raw: r
  };
}


function buildRiskTimelineEvents(risk, tasks, ledger){
  var ev = [];
  function push(date, icon, title, detail, tone){
    if(!date) return;
    ev.push({date:date, icon:icon||'•', title:title||'', detail:detail||'', tone:tone||'var(--accent)'});
  }

  push(risk.created_at, '🆕', 'Risk created', (risk.display_name||risk.assured_name||'Risk') + ' · ' + (risk.status_label||risk.status||'—'), 'var(--accent)');

  if(risk.source_event_id){
    push(risk.created_at, '📨', 'Created from ingest', 'Source event #' + risk.source_event_id, 'var(--warn)');
  }
  if(risk.review_reason){
    push(risk.updated_at || risk.created_at, '⚠️', 'Review flag', risk.review_reason, 'var(--warn)');
  }
  if(risk.merged_into_risk_id){
    push(risk.updated_at || risk.created_at, '🔀', 'Merged into another risk', 'Merged into risk #' + risk.merged_into_risk_id, 'var(--err)');
  }
  if(risk.notes){
    var notePreview = String(risk.notes).trim().replace(/\s+/g,' ').slice(0,140);
    push(risk.updated_at || risk.created_at, '📝', 'Notes updated', notePreview + (String(risk.notes).trim().length>140?'…':''), 'var(--text2)');
  }

  (tasks||[]).forEach(function(t){
    push(t.created_at || t.updated_at, '✅', 'Task created', (t.title||'Task') + (t.owner ? ' · ' + t.owner : ''), 'var(--ok)');
    if(t.status === 'done'){
      push(t.updated_at || t.created_at, '✔️', 'Task completed', t.title||'Task', 'var(--ok)');
    } else if(t.status === 'in_progress'){
      push(t.updated_at || t.created_at, '⏳', 'Task in progress', t.title||'Task', 'var(--warn)');
    }
    if(t.source_event_id){
      push(t.created_at || t.updated_at, '📎', 'Task linked to ingest', 'Source event #' + t.source_event_id, 'var(--warn)');
    }
  });

  (ledger||[]).forEach(function(e){
    var amt = e.gbp_amount!=null ? '£' + Number(e.gbp_amount).toLocaleString() : '—';
    push(e.entry_date || e.created_at, '💷', 'Ledger ' + String(e.entry_type||'entry').toUpperCase(), amt + (e.description ? ' · ' + e.description : ''), 'var(--accent)');
  });

  ev.sort(function(a,b){
    var da = new Date(a.date || 0).getTime();
    var db = new Date(b.date || 0).getTime();
    return db - da;
  });
  return ev;
}

function formatBackendActivityEvent(ev){
  var p = ev && ev.payload ? ev.payload : {};
  var who = (ev && (ev.username || ev.name)) ? (ev.username || ev.name) : ((ev && ev.event_type === 'ingest_event') ? 'ai_ingest' : 'system');
  var when = isoToUk(ev && ev.created_at ? ev.created_at : '');
  var title = ev && ev.event_type ? ev.event_type : 'event';
  var detail = '';

  switch(title){
    case 'risk_created':
      title = 'Risk created';
      detail = who + (p && p.assured_name ? ' · ' + p.assured_name : '');
      break;
    case 'risk_updated':
      title = 'Risk updated';
      if(p && p.status) detail = who + ' · status ' + p.status;
      else detail = who;
      break;
    case 'task_created':
      title = 'Task created';
      detail = who + (p && p.title ? ' · ' + p.title : '');
      break;
    case 'task_updated':
      title = 'Task updated';
      detail = who + (p && p.title ? ' · ' + p.title : '');
      break;
    case 'ledger_entry_added':
      title = 'Ledger entry added';
      detail = who + (p && p.entry_type ? ' · ' + String(p.entry_type).toUpperCase() : '');
      break;
    case 'risk_merged':
      title = 'Risk merged';
      detail = who + (p && p.source_id ? ' · merged source #' + p.source_id : '');
      break;
    case 'ingest_event':
      title = 'Email ingested';
      detail = p && p.subject ? p.subject : who;
      break;
    default:
      detail = who;
  }

  return {
    date: ev && ev.created_at ? ev.created_at : '',
    icon: '•',
    title: title,
    detail: detail + (when ? ' · ' + when : ''),
    tone: 'var(--accent)'
  };
}

function renderRiskTimelineHtml(risk, tasks, ledger, activityItems){
  if(Array.isArray(activityItems) && activityItems.length){
    return activityItems.map(function(raw){
      var e = formatBackendActivityEvent(raw);
      return '<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">'+
        '<div style="width:24px;flex:0 0 24px;text-align:center;font-size:14px">'+e.icon+'</div>'+
        '<div style="flex:1 1 auto">'+
          '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">'+
            '<div style="font-size:12px;font-weight:600;color:'+e.tone+'">'+escapeHtml(e.title)+'</div>'+
            '<div class="muted" style="font-size:11px;white-space:nowrap">'+escapeHtml(isoToUk(e.date))+'</div>'+
          '</div>'+
          (e.detail?'<div style="margin-top:4px;font-size:11px;color:var(--text2)">'+escapeHtml(e.detail)+'</div>':'')+
        '</div>'+
      '</div>';
    }).join('');
  }

  var ev = buildRiskTimelineEvents(risk, tasks, ledger);
  if(!ev.length) return '<div class="muted">No activity yet.</div>';
  return ev.map(function(e){
    return '<div style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">'+
      '<div style="width:24px;flex:0 0 24px;text-align:center;font-size:14px">'+e.icon+'</div>'+
      '<div style="flex:1 1 auto">'+
        '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">'+
          '<div style="font-size:12px;font-weight:600;color:'+e.tone+'">'+escapeHtml(e.title)+'</div>'+
          '<div class="muted" style="font-size:11px;white-space:nowrap">'+escapeHtml(isoToUk(e.date))+'</div>'+
        '</div>'+
        (e.detail?'<div style="margin-top:4px;font-size:11px;color:var(--text2)">'+escapeHtml(e.detail)+'</div>':'')+
      '</div>'+
    '</div>';
  }).join('');
}

// handleMissingLocalInsured — called when a localStorage operation tries to
// act on an insured ID that isn't in entGetState(). The ID might be:
//   (a) a valid PG integer risk ID — in which case we can at least show the
//       backend risk card (view-only; mutating operations aren't portable)
//   (b) a legacy localStorage ID whose entity has been deleted
//   (c) falsy (null, undefined, '') — caller bug
// `operation` is a short label ("view", "delete note", "toggle post-bind")
// used to make the notice helpful.
function handleMissingLocalInsured(insId, operation) {
  operation = operation || 'that action';
  var asNum = Number(insId);
  var isValidPgId = insId != null && insId !== '' &&
                    Number.isFinite(asNum) && Number.isInteger(asNum) && asNum > 0;

  if (isValidPgId) {
    // View operations translate cleanly to the backend risk card.
    // Mutating operations (delete, toggle) don't — warn the user.
    var isViewOnly = operation === 'view' || operation === 'open';
    if (isViewOnly) {
      openBackendRiskCard(asNum);
    } else {
      if (typeof showNotice === 'function') {
        showNotice(
          '"' + operation + '" isn\'t available for backend-only risks yet. Opening the view card instead.',
          'warn'
        );
      }
      openBackendRiskCard(asNum);
    }
    return;
  }

  // Not a valid PG ID — entity is genuinely missing.
  if (typeof showNotice === 'function') {
    var msg = insId == null || insId === ''
      ? 'Cannot ' + operation + ' — no account selected'
      : 'Cannot ' + operation + ' — account not found (may have been deleted)';
    showNotice(msg, 'warn');
  }
  console.warn('[handleMissingLocalInsured] id=' + JSON.stringify(insId) + ' operation=' + operation);
}

function openBackendRiskCard(riskId){
  // Guard: backend routes are <int:risk_id>. Non-integer IDs produce 404s
  // without CORS headers, which surface as confusing CORS errors in the browser.
  var asNum = Number(riskId);
  var isValidInt = riskId != null && riskId !== '' &&
                   Number.isFinite(asNum) && Number.isInteger(asNum) && asNum > 0;
  if (!isValidInt) {
    if (typeof showNotice === 'function') {
      showNotice(
        riskId == null || riskId === '' || riskId === 'null' || riskId === 'undefined'
          ? 'This item isn\'t linked to a risk yet'
          : 'Cannot open — invalid risk ID: ' + String(riskId),
        'warn'
      );
    }
    return;
  }
  riskId = asNum;
  return (async function(){
    try{
      var risk = await apiFetch('/risks/' + riskId);
      var ledger = await apiFetch('/risks/' + riskId + '/ledger').catch(function(){ return {items:[]}; });
      var tasks = await apiFetch('/risks/' + riskId + '/tasks').catch(function(){ return {items:[]}; });
      var activity = await apiFetch('/risks/' + riskId + '/activity').catch(function(){ return {items:[]}; });
      var wrap = document.getElementById('ent-card');
      var inner = document.getElementById('ent-card-inner');
      if(!wrap || !inner) return;
      var led = (ledger.items||[]).length ? (ledger.items||[]).map(function(e){
        return '<tr><td>'+ (e.entry_date||'—') +'</td><td>'+ String(e.entry_type||'').toUpperCase() +'</td><td>'+ (e.currency||'GBP') +'</td><td style="text-align:right">'+ (e.gbp_amount!=null?Number(e.gbp_amount).toLocaleString():'—') +'</td><td>'+ (e.description||'') +'</td></tr>';
      }).join('') : '<tr><td colspan="5" class="muted">No ledger entries</td></tr>';
      var taskHtml = (tasks.items||[]).length ? (tasks.items||[]).map(function(t){
        var pri = (t.priority||'normal').replace('_',' ');
        var st = (t.status||'open').replace('_',' ');
        return '<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)"><div><div style="font-size:12px;font-weight:600">'+(t.title||'Task')+'</div><div class="muted" style="margin-top:3px;font-size:11px">'+(t.owner||'Unassigned')+' · '+st+' · '+pri+(t.due_date?' · due '+isoToUk(t.due_date):'')+'</div>'+(t.description?'<div style="margin-top:4px;font-size:11px;color:var(--text2)">'+t.description+'</div>':'')+'</div><div><button class="btn sm" onclick="completeRiskTask('+t.id+','+riskId+')">Done</button></div></div>';
      }).join('') : '<div class="muted">No tasks yet.</div>';
      inner.innerHTML = `
        <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;gap:12px">
          <div>
            <div style="font-size:18px;font-weight:700;color:var(--text)">${risk.display_name || risk.assured_name}</div>
            <div class="muted" style="margin-top:4px">${risk.producer || '—'} · ${risk.region || '—'} · ${risk.product || '—'} · ${risk.handler || '—'}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">${riskStatusBadgeHtml(risk.status)}<button class="btn" onclick="document.getElementById('ent-card').style.display='none'">Close</button></div>
        </div>
        <div style="padding:18px 20px">
          <div class="row" style="margin-bottom:14px">
            <div class="metric"><label>Accounting year</label><div class="val" style="font-size:18px">${risk.accounting_year || '—'}</div></div>
            <div class="metric"><label>Premium</label><div class="val" style="font-size:18px">${risk.currency || ''} ${risk.gross_premium!=null?Number(risk.gross_premium).toLocaleString():'—'}</div></div>
            <div class="metric"><label>Est/Locked GBP</label><div class="val" style="font-size:18px">£${Number((risk.locked_gbp_commission!=null && risk.locked_gbp_commission!==0 ? risk.locked_gbp_commission : (risk.estimated_gbp_commission||0))).toLocaleString()}</div></div>
            <div class="metric"><label>Open tasks</label><div class="val" style="font-size:18px">${(tasks.items||[]).filter(t=>t.status!=='done').length}</div></div>
          </div>
          <div class="card" style="padding:12px 14px;margin-bottom:12px">
            <div class="sh" style="font-size:12px">Risk details</div>
            <div style="font-size:12px;line-height:1.9">
              <b>Inception:</b> ${isoToUk(risk.inception_date)} &nbsp;·&nbsp; <b>Expiry:</b> ${isoToUk(risk.expiry_date)}<br>
              <b>Layer:</b> ${risk.layer || '—'} &nbsp;·&nbsp; <b>Order:</b> ${risk.order_pct!=null?risk.order_pct+'%':'—'} &nbsp;·&nbsp; <b>Brokerage:</b> ${risk.brokerage_pct!=null?risk.brokerage_pct+'%':'—'} &nbsp;·&nbsp; <b>Retained:</b> ${risk.retained_pct!=null?risk.retained_pct+'%':'—'}<br>
              <b>Adjustable:</b> ${risk.adjustable?'Yes':'No'} &nbsp;·&nbsp; <b>PC:</b> ${risk.profit_commission_expected?'Yes':'No'}
            </div>
            ${risk.notes ? '<div style="margin-top:8px;font-size:12px;color:var(--text2);white-space:pre-wrap">'+risk.notes+'</div>' : ''}
            ${risk.review_reason ? '<div class="notice warn" style="margin-top:8px">Review: '+risk.review_reason+'</div>' : ''}
          </div>
          <div class="card" style="padding:12px 14px;margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
              <div class="sh" style="font-size:12px;margin:0">Tasks</div>
              <button class="btn sm primary" onclick="quickAddRiskTask(${risk.id})">+ Task</button>
            </div>
            ${taskHtml}
          </div>
          <div class="card" style="padding:12px 14px;margin-bottom:12px">
            <div class="sh" style="font-size:12px">Activity timeline</div>
            ${renderRiskTimelineHtml(risk, tasks.items||[], ledger.items||[], activity.items||[])}
          </div>
          <div class="card" style="padding:12px 14px">
            <div class="sh" style="font-size:12px">Ledger</div>
            <table><tr><th>Date</th><th>Type</th><th>CCY</th><th style="text-align:right">GBP</th><th>Description</th></tr>${led}</table>
          </div>
        </div>`;
      wrap.style.display='block';
    }catch(e){ showNotice('Could not load risk: '+e.message,'err'); }
  })();
}

async function quickAddRiskTask(riskId){
  var title = window.prompt('Task title');
  if(!title) return;
  var due = window.prompt('Due date (YYYY-MM-DD, optional)', '');
  try {
    await apiFetch('/tasks', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ risk_id:riskId, title:title, due_date:due || null, priority:'normal', status:'open' })
    });
    showNotice('✓ Task added','ok');
    openBackendRiskCard(riskId);
    renderPipeline();
  } catch(e){ showNotice('Task save failed: '+e.message,'err'); }
}

async function completeRiskTask(taskId, riskId){
  try {
    await apiFetch('/tasks/' + taskId, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ status:'done' })
    });
    showNotice('✓ Task completed','ok');
    openBackendRiskCard(riskId);
    renderPipeline();
  } catch(e){ showNotice('Task update failed: '+e.message,'err'); }
}


async function fetchReviewRisks(){
  var all = await fetchRiskList({ limit: 1000 });
  var owner = document.getElementById('review-owner-filter') ? document.getElementById('review-owner-filter').value : '';
  var rows = all.filter(function(r){ return !!r.needs_review; });
  if(owner) rows = rows.filter(function(r){ return (r.handler||'') === owner; });
  rows.sort(function(a,b){
    return (a.review_reason||'').localeCompare(b.review_reason||'') || (a.display_name||a.assured_name||'').localeCompare(b.display_name||b.assured_name||'');
  });
  return rows;
}

async function renderReviewQueue(){
  try{
    var risks = await fetchReviewRisks();
    var tasks = await fetchTaskList({ include_done: false, limit: 1000 });
    var ingestTasks = tasks.filter(function(t){ return String(t.source||'').toLowerCase().indexOf('ingest') > -1; });

    var metrics = document.getElementById('review-metrics');
    if(metrics){
      metrics.innerHTML = [
        {label:'Risks needing review', val: risks.length, sub:'AI-created or unresolved'},
        {label:'Open ingest tasks', val: ingestTasks.length, sub:'check operational output'},
        {label:'High priority tasks', val: ingestTasks.filter(function(t){ return t.priority==='high' || t.priority==='urgent'; }).length, sub:'urgent follow-up'},
        {label:'Due within 7d', val: ingestTasks.filter(function(t){ return t.due_date && ((new Date(t.due_date) - new Date()) / 86400000) <= 7; }).length, sub:'imminent deadlines'},
      ].map(function(m){
        return '<div class="metric"><label>'+m.label+'</label><div class="val">'+m.val+'</div><div class="sub">'+m.sub+'</div></div>';
      }).join('');
    }

    var riskWrap = document.getElementById('review-risk-list');
    if(riskWrap){
      riskWrap.innerHTML = risks.length ? (
        '<div style="overflow-x:auto"><table style="min-width:1050px;font-size:11px"><tr>' +
        '<th>Assured</th><th>Producer</th><th>Handler</th><th>Year</th><th>Status</th><th>Premium</th><th>Reason</th><th>Actions</th></tr>' +
        risks.map(function(r){
          var statusMeta = riskStatusMeta(r.status);
          return '<tr>' +
            '<td style="font-weight:600">'+escapeHtml(r.display_name || r.assured_name || '—')+'</td>' +
            '<td>'+escapeHtml(r.producer || '—')+'</td>' +
            '<td>'+escapeHtml(r.handler || '—')+'</td>' +
            '<td>'+(r.accounting_year || '—')+'</td>' +
            '<td><span class="badge '+statusMeta.badge+'">'+statusMeta.label+'</span></td>' +
            '<td style="text-align:right">'+(r.gross_premium!=null?Number(r.gross_premium).toLocaleString():'—')+'</td>' +
            '<td style="max-width:260px">'+escapeHtml(r.review_reason || 'Needs review')+'</td>' +
            '<td><div style="display:flex;gap:6px;flex-wrap:wrap">' +
              '<button class="btn sm success" onclick="approveRiskReview('+r.id+')">Approve</button>' +
              '<button class="btn sm" onclick="editRiskReview('+r.id+')">Edit</button>' +
              '<button class="btn sm" onclick="mergeRiskReview('+r.id+')">Merge</button>' +
              '<button class="btn sm" onclick="rejectRiskReview('+r.id+')">Reject</button>' +
              '<button class="btn sm" onclick="openBackendRiskCard('+r.id+')">View</button>' +
            '</div></td>' +
          '</tr>';
        }).join('') + '</table></div>'
      ) : '<span class="muted">No backend risks currently need review.</span>';
    }

    var taskWrap = document.getElementById('review-task-list');
    if(taskWrap){
      taskWrap.innerHTML = ingestTasks.length ? ingestTasks.slice(0, 50).map(function(t){
        var pri = t.priority || 'normal';
        return '<div class="action-item"><div>' +
          '<div>'+escapeHtml(t.title || 'Untitled task')+'</div>' +
          '<div class="muted" style="margin-top:2px">'+escapeHtml(t.display_name || t.assured_name || 'Risk') +
          (t.owner ? ' · ' + escapeHtml(t.owner) : '') +
          (t.due_date ? ' · due ' + isoToUk(t.due_date) : '') +
          ' · ' + escapeHtml(pri) +
          '</div></div><div style="display:flex;gap:6px">' +
          '<button class="btn sm" onclick="openBackendRiskCard('+t.risk_id+')">Open</button>' +
          '<button class="btn sm" onclick="completeRiskTask('+t.id+','+t.risk_id+')">Done</button>' +
          '</div></div>';
      }).join('') : '<span class="muted">No open ingest-created tasks found.</span>';
    }
  } catch(e){
    var riskWrap = document.getElementById('review-risk-list');
    if(riskWrap) riskWrap.innerHTML = '<span class="muted">Review queue failed to load: '+escapeHtml(e.message)+'</span>';
    var taskWrap = document.getElementById('review-task-list');
    if(taskWrap) taskWrap.innerHTML = '<span class="muted">Task list failed to load.</span>';
  }
}

async function approveRiskReview(riskId){
  try{
    await apiFetch('/risks/' + riskId, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ needs_review:false, review_reason:'' })
    });
    showNotice('✓ Risk approved','ok');
    renderReviewQueue();
    renderPipeline();
  } catch(e){ showNotice('Approve failed: '+e.message,'err'); }
}

async function rejectRiskReview(riskId){
  if(!confirm('Reject this risk draft? It will be marked closed and removed from the review queue.')) return;
  try{
    await apiFetch('/risks/' + riskId, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ status:'closed_ntu', needs_review:false, review_reason:'rejected' })
    });
    showNotice('✓ Risk rejected','ok');
    renderReviewQueue();
    renderPipeline();
  } catch(e){ showNotice('Reject failed: '+e.message,'err'); }
}

async function editRiskReview(riskId){
  try{
    var risk = await apiFetch('/risks/' + riskId);
    var assured_name = prompt('Assured name', risk.assured_name || risk.display_name || '');
    if(assured_name === null) return;
    var producer = prompt('Producer', risk.producer || '');
    if(producer === null) return;
    var gross_premium = prompt('Gross premium', risk.gross_premium != null ? String(risk.gross_premium) : '');
    if(gross_premium === null) return;
    var status = prompt('Status (submission, in_market, quoted, firm_order, bound, renewal_pending, expired_review, closed_ntu)', risk.status || 'submission');
    if(status === null) return;

    await apiFetch('/risks/' + riskId, {
      method:'PATCH',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        assured_name: assured_name,
        display_name: assured_name,
        producer: producer,
        gross_premium: gross_premium === '' ? null : Number(gross_premium),
        status: status,
        needs_review: false,
        review_reason: ''
      })
    });
    showNotice('✓ Risk updated','ok');
    renderReviewQueue();
    renderPipeline();
    renderEntities();
    renderBook();
  } catch(e){ showNotice('Edit failed: '+e.message,'err'); }
}


function ensureMergePreviewModal(){
  if(document.getElementById('merge-preview-modal')) return;
  var wrap = document.createElement('div');
  wrap.id = 'merge-preview-modal';
  wrap.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:center;justify-content:center;padding:24px';
  wrap.innerHTML = ''+
    '<div style="background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:14px;max-width:1100px;width:100%;max-height:88vh;overflow:auto;box-shadow:0 18px 60px rgba(0,0,0,.25)">'+
      '<div style="padding:16px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:12px">'+
        '<div><div class="sh" style="margin:0">Merge preview</div><div class="muted" id="merge-preview-sub" style="font-size:12px;margin-top:4px">Compare source and target before confirming.</div></div>'+
        '<button class="btn sm" onclick="closeMergePreview()">Close</button>'+
      '</div>'+
      '<div id="merge-preview-body" style="padding:16px 18px"></div>'+
      '<div style="padding:16px 18px;border-top:1px solid var(--border)">'+
        '<label style="display:block;font-size:11px;font-weight:600;color:var(--text2);margin-bottom:6px">MERGE NOTE (OPTIONAL)</label>'+
        '<textarea id="merge-preview-note" rows="3" placeholder="Why are these being merged?" style="width:100%;margin-bottom:12px"></textarea>'+
        '<div style="display:flex;justify-content:flex-end;gap:8px">'+
          '<button class="btn" onclick="closeMergePreview()">Cancel</button>'+
          '<button class="btn primary" id="merge-preview-confirm-btn">Confirm merge</button>'+
        '</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(wrap);
}

function closeMergePreview(){
  var el = document.getElementById('merge-preview-modal');
  if(el) el.style.display = 'none';
}

function fmtMoney(v){
  if(v===null || v===undefined || v==='') return '—';
  var n = Number(v);
  if(Number.isNaN(n)) return String(v);
  return n.toLocaleString();
}

function previewFieldRow(label, sourceVal, targetVal, hint, highlight){
  var rowStyle = highlight ? 'background:rgba(59,130,246,.08)' : '';
  return '<tr style="'+rowStyle+'">'+
    '<td style="font-weight:600;padding:6px 8px;border-bottom:1px solid var(--border);white-space:nowrap">'+escapeHtml(label)+'</td>'+
    '<td style="padding:6px 8px;border-bottom:1px solid var(--border)">'+escapeHtml(sourceVal || '—')+'</td>'+
    '<td style="padding:6px 8px;border-bottom:1px solid var(--border)">'+escapeHtml(targetVal || '—')+'</td>'+
    '<td style="padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text2)">'+(hint || '—')+'</td>'+
  '</tr>';
}

function mergePreviewBlank(v){
  return v === null || v === undefined || String(v).trim() === '';
}

function mergePreviewHint(kind, sourceVal, targetVal){
  if(kind === 'status'){
    var sr = riskStatusSortRank(sourceVal);
    var tr = riskStatusSortRank(targetVal);
    if(sr > tr) return '<span style="color:var(--ok);font-weight:600">Prefer source</span> · later-stage status';
    if(tr > sr) return '<span style="color:var(--text2);font-weight:600">Keep target</span> · already later stage';
    return 'No material change';
  }

  if(kind === 'review'){
    if(sourceVal && !targetVal) return '<span style="color:var(--warn);font-weight:600">Review target</span> · source was flagged';
    if(!sourceVal && targetVal) return '<span style="color:var(--ok);font-weight:600">Clear on merge</span>';
    return 'No material change';
  }

  if(kind === 'date' || kind === 'text' || kind === 'number'){
    var sBlank = mergePreviewBlank(sourceVal);
    var tBlank = mergePreviewBlank(targetVal);

    if(!sBlank && tBlank) return '<span style="color:var(--ok);font-weight:600">Take source</span> · fills missing target';
    if(sBlank && !tBlank) return '<span style="color:var(--text2);font-weight:600">Keep target</span>';
    if(sBlank && tBlank) return 'No value on either side';

    if(String(sourceVal) === String(targetVal)) return 'No material change';

    if(kind === 'number') return '<span style="color:var(--warn);font-weight:600">Review manually</span> · numeric conflict';
    if(kind === 'date') return '<span style="color:var(--warn);font-weight:600">Review manually</span> · date conflict';
    return '<span style="color:var(--warn);font-weight:600">Review manually</span> · text differs';
  }

  return 'Review manually';
}

function sourceTargetTable(sourceRisk, targetRisk){
  var statusMetaS = riskStatusMeta(sourceRisk.status);
  var statusMetaT = riskStatusMeta(targetRisk.status);
  var sourceStatus = '<span class="badge '+statusMetaS.badge+'">'+statusMetaS.label+'</span>';
  var targetStatus = '<span class="badge '+statusMetaT.badge+'">'+statusMetaT.label+'</span>';
  return ''+
    '<table style="width:100%;font-size:12px;border-collapse:collapse">'+
      '<tr>'+
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border)">Field</th>'+
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border)">Source draft</th>'+
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border)">Target risk</th>'+
        '<th style="text-align:left;padding:6px 8px;border-bottom:1px solid var(--border)">Likely winner</th>'+
      '</tr>'+
      previewFieldRow('Assured', sourceRisk.display_name || sourceRisk.assured_name || '', targetRisk.display_name || targetRisk.assured_name || '', mergePreviewHint('text', sourceRisk.display_name || sourceRisk.assured_name || '', targetRisk.display_name || targetRisk.assured_name || ''), (sourceRisk.display_name || sourceRisk.assured_name || '') !== (targetRisk.display_name || targetRisk.assured_name || ''))+
      previewFieldRow('Producer', sourceRisk.producer || '', targetRisk.producer || '', mergePreviewHint('text', sourceRisk.producer || '', targetRisk.producer || ''), (sourceRisk.producer || '') !== (targetRisk.producer || ''))+
      previewFieldRow('Handler', sourceRisk.handler || '', targetRisk.handler || '', mergePreviewHint('text', sourceRisk.handler || '', targetRisk.handler || ''), (sourceRisk.handler || '') !== (targetRisk.handler || ''))+
      previewFieldRow('Year', String(sourceRisk.accounting_year || ''), String(targetRisk.accounting_year || ''), mergePreviewHint('number', String(sourceRisk.accounting_year || ''), String(targetRisk.accounting_year || '')), String(sourceRisk.accounting_year || '') !== String(targetRisk.accounting_year || ''))+
      '<tr><td style="font-weight:600;padding:6px 8px;border-bottom:1px solid var(--border)">Status</td><td style="padding:6px 8px;border-bottom:1px solid var(--border)">'+sourceStatus+'</td><td style="padding:6px 8px;border-bottom:1px solid var(--border)">'+targetStatus+'</td><td style="padding:6px 8px;border-bottom:1px solid var(--border);color:var(--text2)">'+mergePreviewHint('status', sourceRisk.status, targetRisk.status)+'</td></tr>'+
      previewFieldRow('Product', sourceRisk.product || '', targetRisk.product || '', mergePreviewHint('text', sourceRisk.product || '', targetRisk.product || ''), (sourceRisk.product || '') !== (targetRisk.product || ''))+
      previewFieldRow('Layer', sourceRisk.layer || '', targetRisk.layer || '', mergePreviewHint('text', sourceRisk.layer || '', targetRisk.layer || ''), (sourceRisk.layer || '') !== (targetRisk.layer || ''))+
      previewFieldRow('Inception', isoToUk(sourceRisk.inception_date) || '', isoToUk(targetRisk.inception_date) || '', mergePreviewHint('date', sourceRisk.inception_date || '', targetRisk.inception_date || ''), (sourceRisk.inception_date || '') !== (targetRisk.inception_date || ''))+
      previewFieldRow('Expiry', isoToUk(sourceRisk.expiry_date) || '', isoToUk(targetRisk.expiry_date) || '', mergePreviewHint('date', sourceRisk.expiry_date || '', targetRisk.expiry_date || ''), (sourceRisk.expiry_date || '') !== (targetRisk.expiry_date || ''))+
      previewFieldRow('Currency', sourceRisk.currency || '', targetRisk.currency || '', mergePreviewHint('text', sourceRisk.currency || '', targetRisk.currency || ''), (sourceRisk.currency || '') !== (targetRisk.currency || ''))+
      previewFieldRow('Gross premium', fmtMoney(sourceRisk.gross_premium), fmtMoney(targetRisk.gross_premium), mergePreviewHint('number', sourceRisk.gross_premium ?? '', targetRisk.gross_premium ?? ''), String(sourceRisk.gross_premium ?? '') !== String(targetRisk.gross_premium ?? ''))+
      previewFieldRow('Brokerage %', fmtMoney(sourceRisk.brokerage_pct), fmtMoney(targetRisk.brokerage_pct), mergePreviewHint('number', sourceRisk.brokerage_pct ?? '', targetRisk.brokerage_pct ?? ''), String(sourceRisk.brokerage_pct ?? '') !== String(targetRisk.brokerage_pct ?? ''))+
      previewFieldRow('Retained %', fmtMoney(sourceRisk.retained_pct), fmtMoney(targetRisk.retained_pct), mergePreviewHint('number', sourceRisk.retained_pct ?? '', targetRisk.retained_pct ?? ''), String(sourceRisk.retained_pct ?? '') !== String(targetRisk.retained_pct ?? ''))+
      previewFieldRow('Est. GBP comm', fmtMoney(sourceRisk.estimated_gbp_commission), fmtMoney(targetRisk.estimated_gbp_commission), mergePreviewHint('number', sourceRisk.estimated_gbp_commission ?? '', targetRisk.estimated_gbp_commission ?? ''), String(sourceRisk.estimated_gbp_commission ?? '') !== String(targetRisk.estimated_gbp_commission ?? ''))+
      previewFieldRow('Needs review', sourceRisk.needs_review ? 'Yes' : 'No', targetRisk.needs_review ? 'Yes' : 'No', mergePreviewHint('review', sourceRisk.needs_review, targetRisk.needs_review), sourceRisk.needs_review !== targetRisk.needs_review)+
    '</table>';
}

async function showMergePreview(sourceRisk, targetRisk){
  ensureMergePreviewModal();
  var modal = document.getElementById('merge-preview-modal');
  var body = document.getElementById('merge-preview-body');
  var sub = document.getElementById('merge-preview-sub');
  var note = document.getElementById('merge-preview-note');
  var btn = document.getElementById('merge-preview-confirm-btn');

  var targetTasks = await fetchRiskTasks(targetRisk.id).catch(function(){ return []; });
  var sourceTasks = await fetchRiskTasks(sourceRisk.id).catch(function(){ return []; });
  var targetLedger = await fetchRiskLedger(targetRisk.id).catch(function(){ return []; });
  var sourceLedger = await fetchRiskLedger(sourceRisk.id).catch(function(){ return []; });

  sub.textContent = 'Source #' + sourceRisk.id + ' will merge into target #' + targetRisk.id + '. Tasks and ledger entries move to the target; the source is retained as merged for audit.';
  note.value = '';
  body.innerHTML = ''+
    '<div class="notice info" style="margin-bottom:12px">'+
      '<strong>What will happen:</strong> target risk keeps its ID, source risk is marked merged, source tasks move across, source ledger entries move across, and an audit note is appended to the target.<br><span class="muted" style="font-size:12px">Winner hints are advisory only. They show the likely surviving value, but you should still sanity-check commercial conflicts before confirming.</span>'+
    '</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">'+
      '<div class="card" style="padding:12px"><div class="sh" style="margin-bottom:8px">Source draft</div><div><strong>#'+sourceRisk.id+'</strong> · '+escapeHtml(sourceRisk.display_name || sourceRisk.assured_name || '—')+'</div><div class="muted" style="font-size:11px;margin-top:4px">'+escapeHtml(sourceRisk.review_reason || 'Needs review')+'</div></div>'+
      '<div class="card" style="padding:12px"><div class="sh" style="margin-bottom:8px">Target risk</div><div><strong>#'+targetRisk.id+'</strong> · '+escapeHtml(targetRisk.display_name || targetRisk.assured_name || '—')+'</div><div class="muted" style="font-size:11px;margin-top:4px">Open tasks: '+(targetTasks.length)+' · Ledger entries: '+(targetLedger.length)+'</div></div>'+
    '</div>'+
    '<div class="card" style="padding:12px;margin-bottom:12px"><div class="sh" style="margin-bottom:8px">Side-by-side comparison</div>'+sourceTargetTable(sourceRisk, targetRisk)+'</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'+
      '<div class="card" style="padding:12px"><div class="sh" style="margin-bottom:8px">Source payload moving</div><div class="muted" style="font-size:12px">Tasks: <strong>'+sourceTasks.length+'</strong><br>Ledger entries: <strong>'+sourceLedger.length+'</strong></div></div>'+
      '<div class="card" style="padding:12px"><div class="sh" style="margin-bottom:8px">Target after merge</div><div class="muted" style="font-size:12px">Tasks after merge: <strong>'+(targetTasks.length + sourceTasks.length)+'</strong><br>Ledger entries after merge: <strong>'+(targetLedger.length + sourceLedger.length)+'</strong></div></div>'+
    '</div>';

  btn.onclick = async function(){
    btn.disabled = true;
    var old = btn.textContent;
    btn.textContent = 'Merging...';
    try{
      await apiFetch('/risks/' + sourceRisk.id + '/merge', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ target_risk_id: targetRisk.id, note: note.value || '' })
      });
      closeMergePreview();
      showNotice('✓ Risk #' + sourceRisk.id + ' merged into #' + targetRisk.id, 'ok');
      renderReviewQueue();
      renderPipeline();
      renderEntities();
      renderBook();
    } catch(e){
      showNotice('Merge failed: ' + e.message, 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  };

  modal.style.display = 'flex';
}

function scoreMergeCandidate(sourceRisk, candidate){
  var score = 0;
  var srcName = (sourceRisk.assured_name || sourceRisk.display_name || '').trim().toLowerCase();
  var candName = (candidate.assured_name || candidate.display_name || '').trim().toLowerCase();
  if(srcName && candName){
    if(srcName === candName) score += 60;
    else if(srcName.indexOf(candName) > -1 || candName.indexOf(srcName) > -1) score += 40;
    else {
      var srcWords = srcName.split(/\s+/).filter(Boolean);
      var candWords = new Set(candName.split(/\s+/).filter(Boolean));
      var overlap = srcWords.filter(w => candWords.has(w)).length;
      score += Math.min(30, overlap * 10);
    }
  }
  if((sourceRisk.producer||'').trim().toLowerCase() && (candidate.producer||'').trim().toLowerCase() && (sourceRisk.producer||'').trim().toLowerCase() === (candidate.producer||'').trim().toLowerCase()) score += 15;
  if(sourceRisk.accounting_year && candidate.accounting_year && Number(sourceRisk.accounting_year) === Number(candidate.accounting_year)) score += 12;
  if((sourceRisk.product||'').trim().toLowerCase() && (candidate.product||'').trim().toLowerCase() && (sourceRisk.product||'').trim().toLowerCase() === (candidate.product||'').trim().toLowerCase()) score += 10;
  if((sourceRisk.inception_date||'') && (candidate.inception_date||'') && sourceRisk.inception_date === candidate.inception_date) score += 8;
  return score;
}

function ensureMergeTargetPicker(){
  if(document.getElementById('merge-target-picker-modal')) return;
  var wrap = document.createElement('div');
  wrap.id = 'merge-target-picker-modal';
  wrap.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9998;align-items:center;justify-content:center;padding:24px';
  wrap.innerHTML = ''+
    '<div style="width:min(980px,96vw);max-height:88vh;overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:16px;box-shadow:0 20px 70px rgba(0,0,0,.35)">'+
      '<div style="padding:16px 18px;border-bottom:1px solid var(--line);display:flex;justify-content:space-between;align-items:center;gap:12px">'+
        '<div><div class="sh" style="margin:0">Choose merge target</div><div class="muted" id="merge-target-picker-sub" style="font-size:12px;margin-top:4px">Pick an existing risk to merge into.</div></div>'+
        '<button class="btn" onclick="closeMergeTargetPicker()">Close</button>'+
      '</div>'+
      '<div style="padding:16px 18px">'+
        '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">'+
          '<input id="merge-target-search" placeholder="Search assured / producer / product" style="flex:1;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--text)">'+
          '<button class="btn" id="merge-target-search-btn">Search</button>'+
        '</div>'+
        '<div id="merge-target-picker-body"></div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(wrap);
}

function closeMergeTargetPicker(){
  var el = document.getElementById('merge-target-picker-modal');
  if(el) el.style.display = 'none';
}

async function openMergeTargetPicker(sourceRisk){
  ensureMergeTargetPicker();
  var modal = document.getElementById('merge-target-picker-modal');
  var body = document.getElementById('merge-target-picker-body');
  var sub = document.getElementById('merge-target-picker-sub');
  var search = document.getElementById('merge-target-search');
  var searchBtn = document.getElementById('merge-target-search-btn');
  modal.style.display = 'flex';
  sub.textContent = 'Source #' + sourceRisk.id + ' · ' + (sourceRisk.display_name || sourceRisk.assured_name || 'Unnamed risk');
  search.value = sourceRisk.assured_name || sourceRisk.display_name || '';

  async function runSearch(){
    body.innerHTML = '<div class="muted">Loading candidates...</div>';
    try{
      var query = (search.value || sourceRisk.assured_name || sourceRisk.display_name || '').trim();
      var params = new URLSearchParams();
      params.set('limit','50');
      params.set('include_merged','false');
      if(query) params.set('q', query);
      var data = await apiFetch('/risks?' + params.toString());
      var items = (data.items || []).filter(r => Number(r.id) !== Number(sourceRisk.id));
      items.forEach(r => r._mergeScore = scoreMergeCandidate(sourceRisk, r));
      items.sort((a,b) => (b._mergeScore||0) - (a._mergeScore||0) || Number(b.accounting_year||0) - Number(a.accounting_year||0));
      var top = items.slice(0, 12);
      if(!top.length){
        body.innerHTML = '<div class="muted">No target candidates found. Try a broader search.</div>';
        return;
      }
      body.innerHTML = ''+
        '<div class="muted" style="font-size:12px;margin-bottom:10px">Ranked likely targets. Higher score means a closer commercial match.</div>'+
        '<div style="overflow-x:auto"><table style="min-width:900px;font-size:12px">'+
          '<tr><th>Score</th><th>ID</th><th>Assured</th><th>Producer</th><th>Year</th><th>Product</th><th>Status</th><th>Tasks</th><th></th></tr>'+
          top.map(function(r){
            return '<tr>'+
              '<td><strong>'+String(r._mergeScore||0)+'</strong></td>'+
              '<td>#'+String(r.id)+'</td>'+
              '<td>'+(r.display_name||r.assured_name||'—')+'</td>'+
              '<td>'+(r.producer||'—')+'</td>'+
              '<td>'+(r.accounting_year||'—')+'</td>'+
              '<td>'+(r.product||'—')+'</td>'+
              '<td><span class="badge">'+(r.status_label||r.status||'—')+'</span></td>'+
              '<td>'+(r.open_task_count!=null ? String(r.open_task_count) : '—')+'</td>'+
              '<td><button class="btn sm" onclick="selectMergeTarget('+sourceRisk.id+','+r.id+')">Compare</button></td>'+
            '</tr>';
          }).join('')+
        '</table></div>';
    } catch(e){
      body.innerHTML = '<div class="muted" style="color:var(--err)">Search failed: '+(e.message||e)+'</div>';
    }
  }

  searchBtn.onclick = runSearch;
  search.onkeydown = function(ev){ if(ev.key === 'Enter') runSearch(); };
  await runSearch();
}

async function selectMergeTarget(sourceId, targetId){
  try{
    var sourceRisk = await apiFetch('/risks/' + sourceId);
    var targetRisk = await apiFetch('/risks/' + targetId);
    closeMergeTargetPicker();
    await showMergePreview(sourceRisk, targetRisk);
  } catch(e){ showNotice('Merge preview failed: '+e.message,'err'); }
}

async function mergeRiskReview(riskId){
  try{
    var sourceRisk = await apiFetch('/risks/' + riskId);
    await openMergeTargetPicker(sourceRisk);
  } catch(e){ showNotice('Unable to load merge candidates: '+e.message,'err'); }
}


function renderPipeline(){
  (async function(){
    try {
      const pipeStatusF = document.getElementById('pipe-status-filter') ? document.getElementById('pipe-status-filter').value : '';
      const pipeHandlerF = document.getElementById('pipe-handler-filter') ? document.getElementById('pipe-handler-filter').value : '';
      const risks = await fetchRiskList({ limit: 1000, pipeline_only: true });
      const tasks = await fetchTaskList({ include_done: false, limit: 1000 });
      let rows = risks.map(riskToWipRow);
      const reviewRows = rows.filter(r => r.review);
      if(pipeStatusF) rows = rows.filter(r => canonicalRiskStatus(r.status) === canonicalRiskStatus(pipeStatusF));
      if(pipeHandlerF) rows = rows.filter(r => (r.handler||'').indexOf(pipeHandlerF) > -1);
      rows.sort((a,b)=> riskStatusSortRank(b.status)-riskStatusSortRank(a.status) || parseUkDateLoose(b.inceptionDate)-parseUkDateLoose(a.inceptionDate));

      const dueSoon = tasks.filter(t => t.due_date && ((new Date(t.due_date) - new Date()) / 86400000) <= 7).length;
      const metricsEl = document.getElementById('pipeline-metrics');
      if(metricsEl) metricsEl.innerHTML = [
        {label:'Live risks',val:rows.length,sub:'in WIP'},
        {label:'Open tasks',val:tasks.length,sub:'operational queue'},
        {label:'Due within 7d',val:dueSoon,sub:'urgent attention'},
        {label:'Needs review',val:reviewRows.length,sub:'check AI/output'},
      ].map(m=>`<div class="metric"><label>${m.label}</label><div class="val">${m.val}</div><div class="sub">${m.sub}</div></div>`).join('');

      const actionsEl = document.getElementById('actions-list');
      if(actionsEl){
        const reviewHtml = reviewRows.map(r=>`<div class="action-item"><div><div>Review backend risk</div><div class="muted" style="margin-top:2px">${r.insured} · ${r.reviewReason||'Needs review'}</div></div><div style="display:flex;gap:6px"><button class="btn sm" onclick="openBackendRiskCard(${r.id})">View</button></div></div>`).join('');
        const taskHtml = tasks.slice(0, 12).map(t=>`<div class="action-item"><div><div>${t.title}</div><div class="muted" style="margin-top:2px">${t.display_name||t.assured_name||'Risk'} · ${t.owner||'Unassigned'}${t.due_date?' · due '+isoToUk(t.due_date):''}</div></div><div style="display:flex;gap:6px"><button class="btn sm" onclick="openBackendRiskCard(${t.risk_id})">Open</button><button class="btn sm" onclick="completeRiskTask(${t.id},${t.risk_id})">Done</button></div></div>`).join('');
        actionsEl.innerHTML = (reviewHtml + taskHtml) || '<span class="muted">No outstanding tasks or review items.</span>';
      }

      const pipeCountEl = document.getElementById('pipe-count');
      if(pipeCountEl) pipeCountEl.textContent = rows.length + ' risks · ' + tasks.length + ' open tasks';

      const fmtEst = v => v!=null ? Number(v).toLocaleString() : '—';
      const truncNote = n => n && n.length > 60 ? n.slice(0,57)+'…' : (n||'—');
      const nrBadge = nr => nr ? `<span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:8px;background:${nr==='Renewal'?'var(--warn-bg)':'var(--ok-bg)'};color:${nr==='Renewal'?'var(--warn)':'var(--ok)'}">${nr==='Renewal'?'R':'N'}</span>` : '<span class="muted">—</span>';
      const tbodyHtml = rows.length ? `
        <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
          <button class="btn sm" onclick="exportPipelineXlsx()" title="Export pipeline to Excel">📊 Export Excel</button>
        </div>
        <div style="overflow-x:auto"><table style="min-width:1280px;font-size:11px">
          <tr>
            <th>Handler</th><th style="min-width:180px">Insured</th><th>Producer</th><th>Received</th><th>Inception</th><th>Expiry</th><th style="text-align:center">N/R</th><th>CCY</th><th style="text-align:right">Premium</th><th style="text-align:right">GBP comm</th><th>Region</th><th>Status</th><th>Product</th><th>Quote Leader</th><th style="text-align:center">Tasks</th><th style="min-width:140px">Notes</th><th></th>
          </tr>
          ${rows.map(r=>`<tr>
            <td style="font-weight:600;color:var(--acc)">${r.handler||'—'}</td>
            <td style="font-weight:500">${r.insured}</td>
            <td class="muted">${r.producer||'—'}</td>
            <td style="white-space:nowrap">${r.enquiryDate||'—'}</td>
            <td style="white-space:nowrap">${r.inceptionDate||'—'}</td>
            <td style="white-space:nowrap">${r.expiryDate||'—'}</td>
            <td style="text-align:center">${nrBadge(r.newRenewal)}</td>
            <td>${r.ccy||'—'}</td>
            <td style="text-align:right">${fmtEst(r.premium)}</td>
            <td style="text-align:right">${fmtEst(r.comm)}</td>
            <td>${r.region||'—'}</td>
            <td>${riskStatusBadgeHtml(r.status)}</td>
            <td>${r.product||'—'}</td>
            <td style="font-size:10px;color:var(--text2);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.quoteLeader||'—'}</td>
            <td style="text-align:center">${r.raw && r.raw.open_task_count!=null ? r.raw.open_task_count : 0}</td>
            <td style="font-size:10px;color:var(--text2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(r.notes||'').replace(/"/g,'&quot;')}">${truncNote(r.notes)}</td>
            <td><button class="btn sm" onclick="openBackendRiskCard(${r.id})">View</button></td>
          </tr>`).join('')}
        </table></div>` : `<p class="muted">No backend risks match the current WIP filter.</p>`;
      document.getElementById('pipeline-table').innerHTML = tbodyHtml;
    } catch(e){
      document.getElementById('pipeline-table').innerHTML = `<div class="notice err">WIP load failed: ${e.message}</div>`;
    }
  })();
}

// ── Pipeline Excel Export ─────────────────────────────────────────────────────
// Generates a .csv (Excel-compatible) from the current pipeline view.
// Uses CSV rather than .xlsx to avoid a library dependency.
function exportPipelineXlsx(){
  (async function(){
    try {
      var risks = await fetchRiskList({ limit: 1000, pipeline_only: false });
      var rows = risks.map(riskToWipRow);
      var headers = ['Handler','Insured','Producer','Received','Inception','Expiry','N/R','CCY','Premium','GBP Commission','Region','Status','Product','Quote Leader','Notes'];
      var csvRows = [headers.join(',')];
      rows.forEach(function(r){
        var cells = [
          r.handler, r.insured, r.producer, r.enquiryDate, r.inceptionDate, r.expiryDate,
          r.newRenewal || '', r.ccy, r.premium != null ? r.premium : '',
          r.comm != null ? r.comm : '', r.region, r.statusLabel || r.status,
          r.product, r.quoteLeader || '', (r.notes || '').replace(/"/g, '""')
        ];
        csvRows.push(cells.map(function(c){ return '"' + String(c==null?'':c).replace(/"/g,'""') + '"'; }).join(','));
      });
      var blob = new Blob([csvRows.join('\n')], {type:'text/csv;charset=utf-8;'});
      var a = document.createElement('a');
      var date = new Date().toISOString().slice(0,10);
      a.href = URL.createObjectURL(blob);
      a.download = 'OGB-Pipeline-' + date + '.csv';
      a.click();
      URL.revokeObjectURL(a.href);
      showNotice('Pipeline exported: OGB-Pipeline-' + date + '.csv', 'ok');
    } catch(e){
      showNotice('Export failed: ' + e.message, 'err');
    }
  })();
}

function toggleOgb(ref){
  const s=gs(); if(s.placements[ref]) s.placements[ref].ogbPipeline=!s.placements[ref].ogbPipeline;
  ss(s); renderPipeline();
}
function markDone(ref,aid){
  const s=gs(); const p=s.placements[ref]; if(!p) return;
  const a=p.actions?.find(x=>x.id===aid); if(a) a.done=true;
  p.updated=new Date().toISOString().slice(0,10);
  ss(s); renderPipeline();
}

function renderPlacements(){
  const s=gs(); const ps=Object.values(s.placements||{});
  const sb=st=>({'awaiting-submission':'b-draft','submission-received':'b-live','quoted':'b-quoted','firm-order':'b-cond','on-risk':'b-bound','ntu':'b-ntu','bound':'b-bound','live':'b-live'}[st]||'b-draft');
  document.getElementById('placements-wrap').innerHTML = ps.length
    ? `<table><tr><th>Ref</th><th>Insured</th><th>Producer</th><th>Product</th><th>Status</th><th>Open actions</th><th>Updated</th><th></th></tr>${ps.map(p=>{const open=(p.actions||[]).filter(a=>!a.done).length;return`<tr><td><code style="font-size:11px">${p.ref}</code></td><td>${p.insured}</td><td>${p.producer}</td><td>${p.product}</td><td><span class="badge ${sb(p.status)}">${p.status}</span></td><td>${open?`<span class="badge b-cond">${open}</span>`:'—'}</td><td>${p.updated||'—'}</td><td><button class="btn sm" onclick="viewPlacement('${p.ref}')">View</button></td></tr>`}).join('')}</table>`
    : '<p class="muted">No placements.</p>';
}

function viewPlacement(ref){
  const s=gs(); const p=s.placements[ref]; if(!p) return;
  const sb=st=>({'awaiting-submission':'b-draft','submission-received':'b-live','quoted':'b-quoted','firm-order':'b-cond','on-risk':'b-bound','ntu':'b-ntu','bound':'b-bound','live':'b-live'}[st]||'b-draft');
  const open=(p.actions||[]).filter(a=>!a.done);
  document.getElementById('placement-detail').innerHTML=`<div class="card" style="margin-top:14px">
<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:14px">
<div><div style="font-weight:600;font-size:15px">${p.insured}</div><div class="muted">${p.ref} · ${p.product} · ${p.ccy}</div></div>
<span class="badge ${sb(p.status)}">${p.status}</span>
</div>
<div class="row" style="margin-bottom:12px">
<div><div class="muted" style="font-size:11px">Producer</div><div style="font-size:13px">${p.producer}</div></div>
<div><div class="muted" style="font-size:11px">Sum insured</div><div style="font-size:13px">${p.si?p.ccy+' '+Number(p.si).toLocaleString():'—'}</div></div>
<div><div class="muted" style="font-size:11px">Updated</div><div style="font-size:13px">${p.updated||'—'}</div></div>
</div>
${p.markets?`<div style="margin-bottom:10px"><div class="muted" style="font-size:11px;margin-bottom:3px">Markets</div><div style="font-size:12px;line-height:1.7">${p.markets}</div></div>`:''}
${p.notes?`<div style="margin-bottom:10px"><div class="muted" style="font-size:11px;margin-bottom:3px">Notes</div><div style="font-size:12px;line-height:1.7;white-space:pre-wrap">${p.notes}</div></div>`:''}
${open.length?`<div style="margin-bottom:12px"><div class="muted" style="font-size:11px;margin-bottom:6px">Open actions</div>${open.map(a=>`<div class="action-item"><div><div>${a.text}</div><div class="muted" style="margin-top:2px">Due ${a.due||'ASAP'}</div></div><button class="btn sm success" onclick="markDone('${ref}','${a.id}');viewPlacement('${ref}')">Done</button></div>`).join('')}</div>`:''}
<div style="display:flex;gap:8px;flex-wrap:wrap">
<button class="btn" onclick="document.getElementById('placement-detail').innerHTML=''">Close</button>
<button class="btn" onclick="updateStatus('${ref}')">Update status</button>
<button class="btn" onclick="markNTU('${ref}')" style="color:var(--err);border-color:var(--err)30">✕ Mark NTU</button>
<button class="btn" onclick="addAction('${ref}')">+ Action</button>
<button class="btn primary" onclick="quickDraft('${ref}','submission','')">Market submission ↗</button>
<button class="btn primary" onclick="quickDraft('${ref}','client','')">Client response ↗</button>
<button class="btn success" onclick="quickSlip('${ref}')">Quote slip ↗</button>
</div>
</div>`;
}

function quickDraft(ref,type,ctx){
  tab('draft');
  setTimeout(()=>{
    document.getElementById('draft-ref').value=ref;
    document.getElementById('draft-type').value=type;
    document.getElementById('draft-ctx').value=ctx||'';
  },50);
}
function quickSlip(ref){ tab('slips'); setTimeout(()=>{ document.getElementById('slip-ref').value=ref; },50); }

function updateStatus(ref){
  const s=gs(); const p=s.placements[ref];
  const ns=prompt(`Current: ${p.status}\nNew status (draft/live/quoted/bound/ntu/conditional):`);
  if(ns&&['draft','live','quoted','bound','ntu','conditional'].includes(ns.trim())){
    p.status=ns.trim();
    p.statusEnteredDate=new Date().toISOString().slice(0,10);
    p.updated=new Date().toISOString().slice(0,10);
    ss(s); renderPlacements(); viewPlacement(ref);
  }
}
function addAction(ref){
  const text=prompt('Action:'); if(!text) return;
  const due=prompt('Due (YYYY-MM-DD):','2026-04-25');
  const s=gs(); const p=s.placements[ref]; if(!p) return;
  if(!p.actions) p.actions=[];
  p.actions.push({id:'a'+Date.now(),text,due:due||'',done:false});
  p.updated=new Date().toISOString().slice(0,10);
  ss(s); viewPlacement(ref);
}
function showNewForm(){ const f=document.getElementById('new-form'); f.style.display=f.style.display==='none'?'block':'none'; }
function saveNew(){
  const ref=document.getElementById('nref').value.trim(); if(!ref){alert('Ref required');return;}
  const s=gs();
  s.placements[ref]={ref,insured:document.getElementById('nins').value.trim(),producer:document.getElementById('nprod').value.trim(),product:document.getElementById('nprod2').value,ccy:document.getElementById('nccy').value,si:document.getElementById('nsi').value.trim(),notes:document.getElementById('nnotes').value.trim(),markets:'',status:'draft',actions:[],created:new Date().toISOString().slice(0,10),updated:new Date().toISOString().slice(0,10)};
  ss(s); document.getElementById('new-form').style.display='none'; renderPlacements();
}

function populateRefs(){
  const s=gs(); const ps=Object.keys(s.placements||{});
  ['draft-ref','slip-ref'].forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const cur=el.value;
    el.innerHTML='<option value="">Select placement...</option>'+ps.map(r=>`<option value="${r}">${r}</option>`).join('');
    if(cur) el.value=cur;
  });
}

// INGEST (wrapped in DOMContentLoaded per Build Rule 6)
document.addEventListener('DOMContentLoaded',function(){
  var dzEl=document.getElementById('dz');
  if(dzEl){
    dzEl.addEventListener('dragover',function(e){e.preventDefault();dzEl.classList.add('over');});
    dzEl.addEventListener('dragleave',function(){dzEl.classList.remove('over');});
    dzEl.addEventListener('drop',function(e){e.preventDefault();dzEl.classList.remove('over');handleFiles(e.dataTransfer.files);});
  }
});

async function handleFiles(files){
  if(!files||!files.length) return;
  const all=Array.from(files);
  dz.classList.remove('loaded','processing');
  document.getElementById('dz-pills').innerHTML='';
  document.getElementById('dz-atts').innerHTML='';
  document.getElementById('parse-notice').style.display='block';
  document.getElementById('analyse-btn').disabled=true;
  let combined='', allAtts=[], errors=[];
  for(const file of all){
    try{
      document.getElementById('parse-msg').textContent=`Parsing ${file.name}...`;
      const fd=new FormData(); fd.append('file',file);
      const res=await fetch(`${BACKEND}/parse`,{method:'POST',body:fd,headers:authHeaders()});
      const data=await res.json();
      if(data.error){errors.push(`${file.name}: ${data.error}`);continue;}
      combined+=(combined?'\n\n':'')+data.clean_text;
      allAtts=allAtts.concat(data.attachments||[]);
      const pill=document.createElement('span');
      pill.className='file-pill';
      pill.textContent=`📎 ${file.name}${data.attachment_count>0?' + '+data.attachment_count+' attachment(s)':''}`;
      document.getElementById('dz-pills').appendChild(pill);
    }catch(e){errors.push(`${file.name}: ${e.message}`);}
  }
  document.getElementById('parse-notice').style.display='none';
  document.getElementById('analyse-btn').disabled=false;
  if(combined){
    const ex=document.getElementById('tin').value.trim();
    document.getElementById('tin').value=(ex?ex+'\n\n':'')+combined;
    dz.classList.add('loaded');
    document.getElementById('dz-label').textContent=`${all.length-errors.length} file(s) ready`;
    if(allAtts.length) document.getElementById('dz-atts').textContent='Attachments: '+allAtts.join(', ');
  }
  if(errors.length) showNotice(errors.join('\n'),'err');
}

function showNotice(msg,type){
  const n=document.createElement('div'); n.className=`notice ${type}`; n.textContent=msg;
  document.querySelector('.content').prepend(n); setTimeout(()=>n.remove(),6000);
}

function buildSys(){
  const s=gs();
  return `You are an AI assistant for OG Broking, a Lloyd's wholesale broker specialising in Marine Cargo, STP, Stock-Only RI and related products. Current state: ${JSON.stringify(s,null,2)}. Min premium USD 25k floor (overridable for T2 diversification targets). Tiers: T0=Integra, T1=Langelier/ARB, T2=active targets including Momentum Panama, T3=conditional one-liner only, T4=partner review. Output STATE_DELTA:{} JSON for new or updated placements. Think like a senior Lloyd's broker.`;
}

async function callAI(sys,user,maxTok=1000){
  return await aiText({
    model:'claude-sonnet-4-20250514',
    max_tokens:maxTok,
    system:sys,
    user:user
  });
}

window._delta=null;
async function analyse(){
  const text=document.getElementById('tin').value.trim();
  if(!text){showNotice('No content — drop a file or paste text','err');return;}
  document.getElementById('ai-spin').style.display='inline';
  document.getElementById('aout').textContent='Analysing...';
  document.getElementById('dwrap').style.display='none';
  try{
    const resp=await callAI(buildSys(),`Analyse and triage this submission. Include STATE_DELTA if new or updated placement:\n\n${text}`);
    if(!resp) return;
    document.getElementById('aout').textContent=resp;
    const m=resp.match(/STATE_DELTA:(\{[\s\S]+?\})(?:\s*$|\s*\n[A-Z])/);
    if(m){document.getElementById('dcontent').textContent=m[1];document.getElementById('dwrap').style.display='block';window._delta=JSON.parse(m[1]);}
  }catch(e){document.getElementById('aout').textContent='Error: '+e.message;}
  document.getElementById('ai-spin').style.display='none';
}
function applyDelta(){
  if(!window._delta) return;
  const s=gs();
  if(window._delta.placements) Object.assign(s.placements||(s.placements={}),window._delta.placements);
  if(window._delta.lessons) s.lessons=(s.lessons||[]).concat(window._delta.lessons);
  ss(s); document.getElementById('dwrap').style.display='none';
  showNotice('Placement tracker updated.','ok');
}
function clearIngest(){
  document.getElementById('tin').value='';
  document.getElementById('aout').textContent='Drop a .msg file or paste text above, then click Analyse.';
  document.getElementById('dwrap').style.display='none';
  dz.classList.remove('loaded','processing');
  document.getElementById('dz-label').textContent='Drop .msg files here';
  document.getElementById('dz-pills').innerHTML='';
  document.getElementById('dz-atts').innerHTML='';
  document.getElementById('fi').value='';
  document.getElementById('analyse-btn').disabled=false;
}

function runTriage(){
  const src=document.getElementById('ts').value;
  const tier=src?src.split('|')[1]:'T2';
  const name=src?src.split('|')[0]:'Unknown';
  const prem=parseFloat(document.getElementById('tprem').value)||0;
  const single=document.getElementById('tsin').value==='yes';
  const loss=document.getElementById('tloss').checked;
  const qual=document.getElementById('tqual').checked;
  const inst=document.getElementById('tinst').checked;
  const div=document.getElementById('tdiv').checked;
  const over=document.getElementById('tover').checked;
  const isT01=tier==='T0'||tier==='T1';
  const isT34=tier==='T3'||tier==='T4';
  let fails=0,warns=0,items=[];
  const chk=(cond,fm,wm,hard)=>{
    if(!cond){
      if(over){warns++;items.push(`<span class="flag-w">⚠ ${wm||fm} [overridden]</span>`);}
      else if(isT01){warns++;items.push(`<span class="flag-w">⚠ ${wm||fm}</span>`);}
      else if(isT34||hard){fails++;items.push(`<span class="flag-f">✕ ${fm}</span>`);}
      else{warns++;items.push(`<span class="flag-w">⚠ ${wm||fm}</span>`);}
    }else items.push(`<span class="flag-ok">✓ ${fm}</span>`);
  };
  chk(prem>=25000,'Min premium ≥ USD 25k','Below floor',true);
  chk(!single,'Not a single shipment','Single shipment',true);
  chk(loss,'Loss record provided','Loss record missing',false);
  chk(qual,'Professional submission','Submission quality',false);
  chk(inst,'Can instruct','Ability to instruct unconfirmed',false);
  let score=100-(fails*25)-(warns*10);
  if(div) score=Math.min(100,score+15);
  if(over) score=Math.min(100,score+10);
  score=Math.max(0,score);
  let verdict,vc;
  if(fails===0&&warns<=1){verdict='Quote — proceed';vc='b-bound';}
  else if(fails===0&&warns<=3){verdict='Conditional — request info';vc='b-cond';}
  else if(fails<=1){verdict='Escalate — senior broker';vc='b-quoted';}
  else{verdict='Decline';vc='b-ntu';}
  const r=document.getElementById('triage-result');
  r.style.display='block';
  r.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px"><div><strong>${name}</strong> <span class="muted">${tier}${over?' · senior override':''}</span></div><span class="badge ${vc}" style="font-size:13px;padding:4px 14px">${verdict}</span></div><div style="margin-bottom:10px;line-height:2">${items.join('<br>')}</div><div class="muted" style="font-size:11px;margin-bottom:3px">Score: ${score}/100</div><div class="score-bar"><div class="score-fill" style="width:${score}%;background:${score>=70?'var(--ok)':score>=40?'var(--warn)':'var(--err)'}"></div></div>`;
}

const DRAFT_SYS={
  submission:`You are a senior Lloyd's wholesale broker at OG Broking writing a market submission email. Story first — research the client, weave context about who they are and why they're credible. Then a numbered risk data block. Address sensitive locations directly. Transparent on premium. Clear close. Plain text, Subject: line first. No markdown asterisks.`,
  client:`You are a senior Lloyd's wholesale broker at OG Broking writing a response to a client or overseas producer. Professional, clear, concise. Summarise placement status, terms obtained, what's outstanding, next steps. Plain text.`,
  decline:`You are a senior Lloyd's wholesale broker at OG Broking writing a decline. Direct but respectful. Explain why clearly. Offer guidance on what would need to change. Plain text.`,
  conditional:`You are a senior Lloyd's wholesale broker at OG Broking writing a conditional response. List precisely what is missing and why it matters. Plain text.`,
  chase:`You are a senior Lloyd's wholesale broker at OG Broking writing a chase email. Brief, direct. State what is outstanding and what you need. Plain text.`
};

window._lastDraft='';
async function generateDraft(){
  const ref=document.getElementById('draft-ref').value;
  const type=document.getElementById('draft-type').value;
  const ctx=document.getElementById('draft-ctx').value.trim();
  if(!ref){showNotice('Select a placement first','err');return;}
  const s=gs(); const p=s.placements[ref]; if(!p) return;
  document.getElementById('draft-out-card').style.display='block';
  document.getElementById('draft-spin').style.display='inline';
  document.getElementById('draft-out-label').textContent={submission:'Market submission',client:'Client response',decline:'Decline',conditional:'Conditional',chase:'Chase'}[type]||'Draft';
  document.getElementById('draft-out').textContent='Drafting...';
  document.getElementById('draft-subject').style.display='none';
  try{
    const resp=await callAI(DRAFT_SYS[type]||DRAFT_SYS.submission,`Placement: ${JSON.stringify(p,null,2)}\nMarket feedback: ${JSON.stringify(s.marketFeedback,null,2)}\nLessons: ${JSON.stringify(s.lessons,null,2)}${ctx?'\nAdditional context: '+ctx:''}`);
    if(!resp) return;
    window._lastDraft=resp;
    const lines=resp.split('\n');
    const si=lines.findIndex(l=>/^subject:/i.test(l.trim()));
    let subj='',body=resp;
    if(si!==-1){subj=lines[si].replace(/^subject:\s*/i,'').trim();body=lines.slice(si+1).join('\n').trim();}
    if(subj){document.getElementById('draft-subject').textContent='Subject: '+subj;document.getElementById('draft-subject').style.display='block';}
    document.getElementById('draft-out').textContent=body;
  }catch(e){document.getElementById('draft-out').textContent='Error: '+e.message;}
  document.getElementById('draft-spin').style.display='none';
}
function copyDraft(){if(!window._lastDraft)return;navigator.clipboard.writeText(window._lastDraft).then(()=>{const b=event.target;b.textContent='Copied!';setTimeout(()=>b.textContent='Copy',2000);});}

const SLIP_SYS=`You are a senior Lloyd's wholesale broker at OG Broking preparing a structured quote slip for Whitespace. Output clean plain text with ALL CAPS section headers. No markdown. Include all standard clauses for the product type. For bulk commodity STP/RI: include Guaranteed Outturn (GAFTA/FOSFA surveyor CP), Co-Mingling, Skimmings, Fire/Heating/Sweating, Storage Risks, Carriage by Chartered Vessels. For pharma STP: Fear of Loss/Suspect Goods, Regulatory Rejection, Clinical Trial Materials, Emergency Air Freight, GDP Compliance. For RI structures: Claims Control CP, Simultaneous Payment, Subrogation (RI), Paramount War. Turkish cedant RI: Turkish law, 90-day cancellation.`;

window._lastSlip='';
async function generateSlip(){
  const ref=document.getElementById('slip-ref').value;
  if(!ref){showNotice('Select a placement first','err');return;}
  const s=gs(); const p=s.placements[ref]; if(!p) return;
  const extra=document.getElementById('slip-extra').value.trim();
  document.getElementById('slip-out-card').style.display='block';
  document.getElementById('slip-spin').style.display='inline';
  document.getElementById('slip-out').textContent='Generating...';
  try{
    const resp=await callAI(SLIP_SYS,`Generate quote slip for: ${JSON.stringify(p,null,2)}${extra?'\nAdditional terms: '+extra:''}`,1000);
    if(!resp) return;
    window._lastSlip=resp;
    document.getElementById('slip-out').textContent=resp;
  }catch(e){document.getElementById('slip-out').textContent='Error: '+e.message;}
  document.getElementById('slip-spin').style.display='none';
}
function copySlip(){if(!window._lastSlip)return;navigator.clipboard.writeText(window._lastSlip).then(()=>{const b=event.target;b.textContent='Copied!';setTimeout(()=>b.textContent='Copy — paste to Whitespace',2000);});}

// ── FFL / Cargo Liability Quotation Generator ─────────────────────────────

const FFL_SYS = `You are a senior OG Broking cargo liability specialist. Generate a professional, structured quotation letter for a Freeboard Maritime / Lloyd's cargo liability risk. Use plain text only — no markdown, no asterisks, no bullets with dashes. Use em-dashes (—) for section rules. Use numbered lists for conditions precedent. Produce the full letter body only — no subject line. The tone is professional but clear. The insurer line must always read exactly: "Freeboard Maritime, acting as coverholder on behalf of 100% Underwriters at Lloyd's of London".`;

function buildFFLPrompt(){
  const g = id => (document.getElementById(id)||{}).value||'';
  const to       = g('ffl-to');
  const client   = g('ffl-client');
  const ref      = g('ffl-ref2');
  const date     = g('ffl-date') || new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  const services = g('ffl-services');
  const gfr      = g('ffl-gfr');
  const contracts= g('ffl-contracts');
  const law      = g('ffl-law');
  const cargoLim = g('ffl-cargo-lim');
  const cargoDed = g('ffl-cargo-ded');
  const valLim   = g('ffl-val-lim');
  const valDed   = g('ffl-val-ded');
  const tplLim   = g('ffl-tpl-lim');
  const tplDed   = g('ffl-tpl-ded');
  const piLim    = g('ffl-pi-lim');
  const fdLim    = g('ffl-fd-lim');
  const premA    = g('ffl-prem-a');
  const premB    = g('ffl-prem-b');
  const cpsRaw   = g('ffl-cps');
  const notes    = g('ffl-notes');

  const cps = cpsRaw.split('\n').filter(l=>l.trim()).map((l,i)=>`${i+1}. ${l.trim()}`).join('\n');

  return `Generate a cargo liability quotation letter with these details:

TO: ${to||'[Broker]'}
CLIENT: ${client||'[Insured]'}
REF: ${ref||'[OGB ref]'}
DATE: ${date}
INSURER: Freeboard Maritime, acting as coverholder on behalf of 100% Underwriters at Lloyd's of London
PERIOD: 12 months from TBA
TERRITORY: Worldwide, subject to sanctions exclusion (LMA3100A)
LAW & JURISDICTION: ${law}
INSURED SERVICES: ${services||'[To be specified]'}
FORECAST GROSS FREIGHT RECEIPTS: ${gfr||'[To be confirmed]'}
APPROVED CONTRACTS: ${contracts||'CMR'}

COVERAGE:
Section 2.1 Cargo Liability — Limit: ${cargoLim||'[TBC]'} — Deductible: ${cargoDed||'[TBC]'}
${valLim?`Valuable Cargo sublimit — Limit: ${valLim} — Deductible: ${valDed||cargoDed||'[TBC]'}`:'(No valuable cargo sublimit)'}
Section 2.2 Third Party Liability — Limit: ${tplLim||'[TBC]'} — Deductible: ${tplDed||cargoDed||'[TBC]'}
Section 2.3 Claims Expenses — Within applicable section limit
${piLim?`PI Extension (Claims Made) — Limit: ${piLim} — Retroactive Date: TBC`:'(PI extension not included)'}
${fdLim?`F&D Extension (Claims Made) — Limit: ${fdLim} — Retroactive Date: TBC`:'(F&D extension not included)'}

PREMIUM:
Option A: ${premA||'[TBC]'}${premB?'\nOption B (increased deductible): '+premB:''}

NO CLAIMS REBATE: 15% nil claims / 5% claims under 50% of premium / 0% claims over 50% (clause 4.2, contingent on renewal)

CONDITIONS PRECEDENT TO BINDING:
${cps||'1. Subcontractor insurance confirmation\n2. Standard trading conditions for Underwriter approval\n3. Full 5-year claims record'}

${notes?'ADDITIONAL NOTES: '+notes:''}

Include sections for: Important Notices (duty of fair presentation, claims notification within 30 days, no admission of liability without prior written consent, contract review obligation). End with quotation validity (30 days), how to accept, and sign-off for [Name] / OG Broking.`;
}

async function generateFFL(){
  const out = document.getElementById('ffl-out');
  const card = document.getElementById('ffl-out-card');
  const spin = document.getElementById('ffl-spin');
  card.style.display='block';
  spin.style.display='inline';
  out.textContent='Generating quotation...';
  try{
    const prompt = buildFFLPrompt();
    const resp = await callAI(FFL_SYS, prompt, 1800);
    if(!resp) return;
    window._lastFFL = resp;
    out.textContent = resp;
  }catch(e){ out.textContent='Error: '+e.message; }
  spin.style.display='none';
}

function copyFFL(){
  if(!window._lastFFL) return;
  navigator.clipboard.writeText(window._lastFFL).then(()=>{
    const b=event.target; b.textContent='Copied!';
    setTimeout(()=>b.textContent='Copy to clipboard',2000);
  });
}

function clearFFL(){
  ['ffl-to','ffl-client','ffl-ref2','ffl-date','ffl-services','ffl-gfr',
   'ffl-contracts','ffl-cargo-lim','ffl-cargo-ded','ffl-val-lim','ffl-val-ded',
   'ffl-tpl-lim','ffl-tpl-ded','ffl-pi-lim','ffl-fd-lim','ffl-prem-a','ffl-prem-b',
   'ffl-cps','ffl-notes'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('ffl-out-card').style.display='none';
  window._lastFFL='';
}


// ── Pharma STP MRC Generator ─────────────────────────────────────────────────

const PHARMA_MRC_SYS = `You are a senior Lloyd's wholesale broker at OG Broking specialising in pharmaceutical marine cargo and stock throughput insurance. You are populating an MRC (Marine Risk Certificate) for a pharmaceutical stock throughput placement. Output clean professional plain text in the exact MRC section sequence. Use ALL CAPS for field labels. No markdown. Use em-dashes and proper Lloyd's market terminology throughout. The insurer line must always read "Lloyd's Underwriters (multiple syndicates — to be confirmed at placement)". Always include all five OG Broking enhancements: Fear of Loss/Suspect Goods, Regulatory Rejection, Clinical Trial Materials, Emergency Air Freight, and GDP Compliance Condition.`;

function buildPharmaMRCPrompt(){
  const g = id => (document.getElementById(id)||{}).value||'';
  const insured   = g('pharma-insured') || '[Insured name TBC]';
  const broker    = g('pharma-broker')  || '[Producing broker TBC]';
  const turnover  = g('pharma-turnover')|| '[Turnover TBC]';
  const inception = g('pharma-inception')|| '[Inception date TBC]';
  const locLim    = g('pharma-loc-limit')|| '[Location limit TBC]';
  const convLim   = g('pharma-conv-limit')|| '[Conveyance limit TBC]';
  const dedT      = g('pharma-ded-transit')|| '[TBC]';
  const dedS      = g('pharma-ded-stock')  || '[TBC]';
  const prem      = g('pharma-prem')       || '[TBC]';
  const rate      = g('pharma-rate')       || '[TBC]';
  const pc        = g('pharma-pc');
  const notes     = g('pharma-notes');

  return `Populate a Lloyd's MRC for the following pharmaceutical STP placement, using the OG Broking Pharma STP template as the basis:

ASSURED: ${insured}
PRODUCING BROKER: ${broker}
ESTIMATED TURNOVER / SALES: ${turnover}
INCEPTION: ${inception} — 12 months
ANY ONE LOCATION LIMIT: ${locLim}
ANY ONE CONVEYANCE LIMIT: ${convLim}
TRANSIT DEDUCTIBLE: ${dedT}
STOCK DEDUCTIBLE: ${dedS}
MINIMUM & DEPOSIT PREMIUM: ${prem}
RATE ON TURNOVER: ${rate}
${pc ? 'PROFIT COMMISSION: ' + pc : ''}
${notes ? 'SPECIAL TERMS / NOTES: ' + notes : ''}

Use the following as the structural precedent: Strides Pharma Inc, UMR B1743MC2643840, AGCS lead, inception 28 January 2026.

Produce the complete MRC in sequence: TYPE / ASSURED / ASSURED ADDRESS / LOSS PAYEE / PERIOD / CANCELLATION / VOYAGES & CONVEYANCES / GEOGRAPHICAL LIMITS / SUBJECT MATTER INSURED / LIMITS OF LIABILITY (table) / BASIS OF VALUATION / DEDUCTIBLE / CONDITIONS (primary institute clauses then all five OG enhancements then all standard clauses in alphabetical order) / GDP COMPLIANCE CONDITION / PROFIT COMMISSION / SUBJECTIVITIES / EXPRESS WARRANTIES / CONDITIONS PRECEDENT / CHOICE OF LAW & JURISDICTION / PREMIUM / SECURITY DETAILS / SUBSCRIPTION AGREEMENT / FISCAL AND REGULATORY / BROKER REMUNERATION / INFORMATION.

For SUBJECT MATTER INSURED: Use the Strides Pharma description (generic pharmaceuticals, APIs, finished dose forms, biologics, clinical trial materials, packaging materials).

For CONDITIONS: Include all five OG Broking enhancements labelled ★ and all standard clauses from the Strides precedent EXCEPT Institute Frozen Food Clauses (A) CL430 and Institute Strikes Frozen/Chilled Food CL424 (removed — ambient pharma products, no reefer required).

Fill in the actual numbers from the risk details above wherever they appear. Use [TBC] for anything not specified.`;
}

async function generatePharmaMRC(){
  const out = document.getElementById('pharma-out');
  const card = document.getElementById('pharma-out-card');
  const spin = document.getElementById('pharma-spin');
  card.style.display='block';
  spin.style.display='inline';
  out.textContent='Generating MRC...';
  try{
    const resp = await callAI(PHARMA_MRC_SYS, buildPharmaMRCPrompt(), 2000);
    if(!resp) return;
    window._lastPharmaMRC = resp;
    out.textContent = resp;
  }catch(e){ out.textContent='Error: '+e.message; }
  spin.style.display='none';
}

function copyPharmaMRC(){
  if(!window._lastPharmaMRC) return;
  navigator.clipboard.writeText(window._lastPharmaMRC).then(()=>{
    const b=event.target; b.textContent='Copied!';
    setTimeout(()=>b.textContent='Copy to clipboard',2000);
  });
}

function clearPharmaMRC(){
  ['pharma-insured','pharma-broker','pharma-turnover','pharma-inception',
   'pharma-loc-limit','pharma-conv-limit','pharma-ded-transit','pharma-ded-stock',
   'pharma-prem','pharma-rate','pharma-pc','pharma-notes'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('pharma-out-card').style.display='none';
  window._lastPharmaMRC='';
}


// ── Standard STP MRC Generator ────────────────────────────────────────────────

const STANDARD_STP_SYS = `You are a senior Lloyd's wholesale broker at OG Broking preparing an STP MRC. Use ALL CAPS field labels. No markdown. Include all 15 OG Broking standard clauses: Accumulation, Automatic Acquisition, Selling Price BOV, Brands & Labels JCC2019/002, Contingent Interest/DIC, Full Value Reporting, JCC Conditions JC2020-016, JCC Wildfire JC2020-017, Market Loss/Rejection, Pairs & Sets, Prohibited Labour JC2019-008, Unattended Vehicle Security, Marine Cyber JC2025-026, Five Powers War JC2023-024, Profit Commission. For bulk agricultural commodities: add Guaranteed Outturn (0.5%/min, GAFTA/FOSFA surveyor CP — without surveyors reverts to ICC(A)), Co-Mingling, Skimmings, Fire/Implosion/Heating/Sweating, Storage Risks (monthly declaration, survey threshold), Carriage by Chartered Vessels (replaces CL354). For RI structure with Turkish cedant: Claims Control CP, Simultaneous Payment, Subrogation (RI), Paramount War, Turkish law, 90-day cancellation. Misappropriation JC2017/010. Process Exclusion JC2019-005.`;

function buildStandardSTPPrompt(){
  const g = id => (document.getElementById(id)||{}).value||'';
  const insured   = g('stp-insured')    || '[Insured TBC]';
  const broker    = g('stp-broker')     || '[Producing broker TBC]';
  const goods     = g('stp-goods')      || '[Goods description TBC]';
  const ccy       = g('stp-ccy')        || 'USD';
  const inception = g('stp-inception')  || '[Inception TBC]';
  const turnover  = g('stp-turnover')   || '[Turnover TBC]';
  const locLim    = g('stp-loc-limit')  || '[TBC]';
  const convLim   = g('stp-conv-limit') || '[TBC]';
  const dedT      = g('stp-ded-t')      || '[TBC]';
  const dedS      = g('stp-ded-s')      || '[TBC]';
  const prem      = g('stp-prem')       || '[TBC]';
  const rate      = g('stp-rate')       || '[TBC]';
  const pc        = g('stp-pc');
  const law       = g('stp-law')        || 'English law and arbitration';
  const notes     = g('stp-notes');

  return `Populate a complete Lloyd's MRC for the following standard STP placement:

ASSURED: ${insured}
PRODUCING BROKER: ${broker}
PRINCIPAL GOODS: ${goods}
CURRENCY: ${ccy}
INCEPTION: ${inception} — 12 months
ESTIMATED ANNUAL TURNOVER / INSURED VALUES: ${turnover}
ANY ONE LOCATION LIMIT: ${ccy} ${locLim}
ANY ONE SEA/AIR CONVEYANCE LIMIT: ${ccy} ${convLim}
ANY ONE INLAND/ROAD CONVEYANCE LIMIT: [proportionate to conveyance limit — suggest 50-60% of sea/air limit]
CAT SUBLIMITS: ${ccy} [suggest appropriate EQ/Wind/Flood sublimits based on location exposure]
TRANSIT DEDUCTIBLE: ${ccy} ${dedT}
STOCK DEDUCTIBLE: ${ccy} ${dedS}
MINIMUM & DEPOSIT PREMIUM: ${ccy} ${prem}
RATE ON TURNOVER/VALUES: ${rate}
${pc ? 'PROFIT COMMISSION: ' + pc : 'PROFIT COMMISSION: [Negotiate at placement — typically 10-15% on 60-67.5% loss ratio basis]'}
LAW & JURISDICTION: ${law}
${notes ? 'SPECIAL TERMS: ' + notes : ''}

Use the OG Broking Standard STP MRC Template as the basis. Produce the complete MRC in sequence covering all standard sections. Fill in actual figures from the risk details above. Flag any fields requiring further information with [TBC]. Include all 15 OG Broking standard clauses in the CONDITIONS section and the full suite of standard clauses (alphabetical order after the OG standard clauses). In the INFORMATION section include placeholder prompts for COPE, SOV, transit exposure summary, and loss history.`;
}

async function generateStandardSTP(){
  const out  = document.getElementById('stp-out');
  const card = document.getElementById('stp-out-card');
  const spin = document.getElementById('stp-spin');
  card.style.display='block';
  spin.style.display='inline';
  out.textContent='Generating MRC...';
  try{
    const resp = await callAI(STANDARD_STP_SYS, buildStandardSTPPrompt(), 2000);
    if(!resp) return;
    window._lastStandardSTP = resp;
    out.textContent = resp;
  }catch(e){ out.textContent='Error: '+e.message; }
  spin.style.display='none';
}

function copyStandardSTP(){
  if(!window._lastStandardSTP) return;
  navigator.clipboard.writeText(window._lastStandardSTP).then(()=>{
    const b=event.target; b.textContent='Copied!';
    setTimeout(()=>b.textContent='Copy to clipboard',2000);
  });
}

function clearStandardSTP(){
  ['stp-insured','stp-broker','stp-goods','stp-inception','stp-turnover',
   'stp-loc-limit','stp-conv-limit','stp-ded-t','stp-ded-s',
   'stp-prem','stp-rate','stp-pc','stp-notes'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('stp-out-card').style.display='none';
  window._lastStandardSTP='';
}

async function suggestMarkets(){
  const prod=document.getElementById('mkt-prod').value;
  const terr=document.getElementById('mkt-terr').value.trim();
  const prem=document.getElementById('mkt-prem').value.trim();
  const s=gs();
  document.getElementById('mkt-out').style.display='block';
  document.getElementById('mkt-spin').style.display='inline';
  document.getElementById('mkt-content').textContent='Analysing...';
  try{
    const resp=await callAI(`You are a senior Lloyd's broker. Based on the market feedback log and lessons, suggest which markets to approach in priority order. For each: name, why they fit, typical conditions/exclusions, caveats. Be specific. Plain numbered list.`,`Product: ${prod}\nTerritory: ${terr||'Not specified'}\nEst. premium: USD ${prem||'TBC'}\nMarket feedback: ${JSON.stringify(s.marketFeedback,null,2)}\nLessons: ${JSON.stringify(s.lessons,null,2)}`,800);
    if(!resp) return;
    document.getElementById('mkt-content').textContent=resp;
  }catch(e){document.getElementById('mkt-content').textContent='Error: '+e.message;}
  document.getElementById('mkt-spin').style.display='none';
}

function renderFeedback(){
  const s=gs(); const fb=s.marketFeedback||[];
  const oc={indicated:'b-live',bound:'b-bound',declined:'b-ntu',conditional:'b-cond','no appetite':'b-ntu'};
  document.getElementById('mkt-feedback-list').innerHTML=fb.length
    ? fb.slice().sort((a,b)=> String(b.date||'').localeCompare(String(a.date||''))).map(f=>`<div style="display:flex;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:12px;align-items:flex-start"><div style="flex:1"><div style="font-weight:500">${f.market}</div><div class="muted">${f.product} · ${f.territory||'—'} · ${f.ref||''} · ${f.date||''}</div>${f.notes?`<div style="color:var(--text2);margin-top:2px;line-height:1.6">${f.notes}</div>`:''}</div><span class="badge ${oc[f.outcome]||'b-draft'}">${f.outcome}</span></div>`).join('')
    : '<p class="muted">No feedback logged yet.</p>';
}

function logFeedback(){
  const market=document.getElementById('mf-mkt').value.trim(); if(!market) return;
  const s=gs(); if(!s.marketFeedback) s.marketFeedback=[];
  s.marketFeedback.push({market,ref:document.getElementById('mf-ref').value.trim(),product:document.getElementById('mf-prod').value,territory:document.getElementById('mf-terr').value.trim(),outcome:document.getElementById('mf-out').value,notes:document.getElementById('mf-notes').value.trim(),date:new Date().toISOString().slice(0,10)});
  ss(s); ['mf-mkt','mf-ref','mf-terr','mf-notes'].forEach(id=>document.getElementById(id).value='');
  renderFeedback(); showNotice('Feedback logged.','ok');
}

function renderLessons(){
  const s=gs();
  const ls=(s.lessons||[]).slice().sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')));
  const el = document.getElementById('lessons-list');
  if(!el) return;
  el.innerHTML=ls.length
    ? ls.map(l=>`<div class="lesson-item"><span class="les-tag">${l.tag}</span><div style="flex:1"><div style="font-size:12px;line-height:1.6">${l.text}</div><div class="muted" style="font-size:11px;margin-top:2px">${l.src} · ${l.date}</div></div></div>`).join('')
    : '<p class="muted">No lessons yet.</p>';
}
function addLesson(){
  const tag=document.getElementById('ltag').value.trim();
  const src=document.getElementById('lsrc').value.trim();
  const text=document.getElementById('ltext').value.trim(); if(!text) return;
  const s=gs(); s.lessons=s.lessons||[];
  s.lessons.push({tag:tag||'general',src:src||'—',text,date:new Date().toISOString().slice(0,10).slice(0,7)});
  ss(s); ['ltag','lsrc','ltext'].forEach(id=>document.getElementById(id).value='');
  renderLessons();
}

// ═══════════════════════════════════════════════════════
// SOV & CAT MONITOR
// ═══════════════════════════════════════════════════════
const EQ_Z=['turkey','japan','california','chile','new zealand','philippines','indonesia','greece','italy','mexico','peru','colombia','ecuador','taiwan','nepal','iran','pakistan'];
const WIND_Z=['florida','gulf coast','texas','louisiana','caribbean','bahamas','bermuda','japan','philippines','taiwan','bangladesh','hong kong','vietnam','south china'];
const FLOOD_Z=['bangladesh','pakistan','netherlands','vietnam','thailand','myanmar','india','nigeria','mozambique','argentina','uruguay','paraguay'];

function getCATF(city='',state='',country=''){
  const t=(city+' '+state+' '+country).toLowerCase();
  return{eq:EQ_Z.some(z=>t.includes(z)),wind:WIND_Z.some(z=>t.includes(z)),flood:FLOOD_Z.some(z=>t.includes(z))};
}

function sovLoad(){return(gs().sov_locations||[]);}
function sovSave(locs){const s=gs();s.sov_locations=locs;ss(s);}

let sovLocs=[];
let sovNextId=1;

function sovInit(){
  const s=gs();
  sovLocs=s.sov_locations||[];
  if(sovLocs.length) sovNextId=Math.max(...sovLocs.map(l=>l.id||0))+1;
  sovRender();
}

function sovAddLoc(overrides={}){
  const loc={id:sovNextId++,insured:'',address:'',city:'',state:'',country:'',lat:'',lng:'',occupancy:'Warehouse',tenure:'Leased',sqft:'',storeys:'1',built:'',walls:'Steel',roof:'Metal',sprinkler_pct:'0',sprinkler_connected:'No',burglar_alarm:'Yes',fire_alarm:'Yes',fire_stn_km:'',hydrant_m:'',stock_cost:0,stock_others:0,stock_avg:0,peak_month:'',limit:0,rate:0,currency:'USD',eq_zone:false,wind_zone:false,flood_zone:false,...overrides};
  sovLocs.push(loc); sovRender();
}

function sovRender(){
  if(document.getElementById('tab-pipeline')&&!document.getElementById('sov').classList.contains('active')) return;
  const heads=['#','Insured','Address','City','St/Prov','Country','Lat','Long','Occupancy','Tenure','Sq ft','Storeys','Built','Walls','Roof','Spr %','Spr conn','Burglar','Fire alarm','Fire stn km','Hydrant m','Stock cost','Sell price','3P stock','Avg stock','Peak mo','Limit','EQ','Wind','Flood','Rate%','Premium','CCY',''];
  const catCols={27:'cat-eq',28:'cat-wind',29:'cat-flood'};
  const thead=document.getElementById('sov-head');
  thead.innerHTML=heads.map((h,i)=>`<th class="sov-th${catCols[i]?' '+catCols[i]:''}">${h}</th>`).join('');

  const tbody=document.getElementById('sov-body');
  if(!sovLocs.length){tbody.innerHTML=`<tr><td colspan="34" style="padding:20px;text-align:center;color:var(--text2);font-style:italic">No locations yet.</td></tr>`;sovUpdateMetrics();return;}

  tbody.innerHTML='';
  sovLocs.forEach((loc,idx)=>{
    const f=getCATF(loc.city,loc.state,loc.country);
    loc.eq_zone=f.eq;loc.wind_zone=f.wind;loc.flood_zone=f.flood;
    const sell=loc.stock_cost?Math.round(loc.stock_cost*1.175):0;
    const prem=loc.stock_avg&&loc.rate?Math.round(loc.stock_avg*parseFloat(loc.rate)/100):0;
    const inp=(field,type='text',w='100%')=>`<input type="${type}" value="${loc[field]||''}" style="width:${w}" onchange="sovUpd(${idx},'${field}',this.value)">`;
    const sel=(field,opts)=>`<select onchange="sovUpd(${idx},'${field}',this.value)">${opts.map(o=>`<option${loc[field]===o?' selected':''}>${o}</option>`).join('')}</select>`;
    const tr=document.createElement('tr');
    tr.innerHTML=`
      <td class="sov-td" style="color:var(--text2);width:24px">${idx+1}</td>
      <td class="sov-td">${inp('insured')}</td>
      <td class="sov-td">${inp('address')}</td>
      <td class="sov-td">${inp('city')}</td>
      <td class="sov-td">${inp('state','text','60px')}</td>
      <td class="sov-td">${inp('country')}</td>
      <td class="sov-td">${inp('lat','text','68px')}</td>
      <td class="sov-td">${inp('lng','text','68px')}</td>
      <td class="sov-td">${inp('occupancy')}</td>
      <td class="sov-td">${sel('tenure',['Owned','Leased','3rd party'])}</td>
      <td class="sov-td">${inp('sqft','number','65px')}</td>
      <td class="sov-td">${inp('storeys','text','36px')}</td>
      <td class="sov-td">${inp('built','text','46px')}</td>
      <td class="sov-td">${sel('walls',['Steel','Concrete','Masonry','Wood','Mixed'])}</td>
      <td class="sov-td">${sel('roof',['Metal','Concrete','Steel','Tar & gravel','EPDM','Wood'])}</td>
      <td class="sov-td">${inp('sprinkler_pct','number','40px')}</td>
      <td class="sov-td">${sel('sprinkler_connected',['Yes','No','Partial'])}</td>
      <td class="sov-td">${sel('burglar_alarm',['Yes','No','Partial'])}</td>
      <td class="sov-td">${sel('fire_alarm',['Yes','No','Partial'])}</td>
      <td class="sov-td">${inp('fire_stn_km','number','42px')}</td>
      <td class="sov-td">${inp('hydrant_m','number','42px')}</td>
      <td class="sov-td"><input type="number" value="${loc.stock_cost||''}" style="width:90px" onchange="sovUpd(${idx},'stock_cost',parseFloat(this.value)||0);sovRender()"></td>
      <td class="sov-td comp">${sell?sell.toLocaleString():'—'}</td>
      <td class="sov-td"><input type="number" value="${loc.stock_others||''}" style="width:90px" onchange="sovUpd(${idx},'stock_others',parseFloat(this.value)||0)"></td>
      <td class="sov-td"><input type="number" value="${loc.stock_avg||''}" style="width:90px" onchange="sovUpd(${idx},'stock_avg',parseFloat(this.value)||0);sovRender()"></td>
      <td class="sov-td">${sel('peak_month',['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])}</td>
      <td class="sov-td"><input type="number" value="${loc.limit||''}" style="width:90px" onchange="sovUpd(${idx},'limit',parseFloat(this.value)||0)"></td>
      <td class="sov-td" style="text-align:center">${f.eq?'<span class="b-eq">EQ</span>':'—'}</td>
      <td class="sov-td" style="text-align:center">${f.wind?'<span class="b-wind">Wind</span>':'—'}</td>
      <td class="sov-td" style="text-align:center">${f.flood?'<span class="b-flood">Flood</span>':'—'}</td>
      <td class="sov-td"><input type="number" value="${loc.rate||''}" step="0.001" style="width:58px" onchange="sovUpd(${idx},'rate',parseFloat(this.value)||0);sovRender()"></td>
      <td class="sov-td comp">${prem?prem.toLocaleString():'—'}</td>
      <td class="sov-td">${sel('currency',['USD','CAD','EUR','GBP'])}</td>
      <td class="sov-td"><button class="btn sm" style="color:var(--err);border:none;background:none;padding:2px 5px" onclick="sovRemove(${idx})">✕</button></td>`;
    tbody.appendChild(tr);
  });
  sovUpdateTotals();sovUpdateMetrics();sovSave(sovLocs);
}

function sovUpd(idx,field,val){if(sovLocs[idx])sovLocs[idx][field]=val;sovSave(sovLocs);}
function sovRemove(idx){if(confirm('Remove location?')){sovLocs.splice(idx,1);sovRender();}}

function sovUpdateTotals(){
  const sum=f=>sovLocs.reduce((s,l)=>s+(parseFloat(l[f])||0),0);
  const fmt=v=>v?Math.round(v).toLocaleString():'—';
  const tfoot=document.getElementById('sov-foot');
  const sell=sovLocs.reduce((s,l)=>s+(l.stock_cost?Math.round(l.stock_cost*1.175):0),0);
  const prem=sovLocs.reduce((s,l)=>s+(l.stock_avg&&l.rate?Math.round(l.stock_avg*parseFloat(l.rate)/100):0),0);
  tfoot.innerHTML=`<td class="sov-td" colspan="21" style="font-weight:600;padding:5px 8px">TOTAL (${sovLocs.length} locations)</td><td class="sov-td" style="text-align:right;font-weight:600">${fmt(sum('stock_cost'))}</td><td class="sov-td" style="text-align:right;font-weight:600">${fmt(sell)}</td><td class="sov-td" style="text-align:right;font-weight:600">${fmt(sum('stock_others'))}</td><td class="sov-td" style="text-align:right;font-weight:600">${fmt(sum('stock_avg'))}</td><td></td><td class="sov-td" style="text-align:right;font-weight:600">${fmt(sum('limit'))}</td><td></td><td></td><td></td><td></td><td class="sov-td" style="text-align:right;font-weight:600;color:var(--acc)">${fmt(prem)}</td><td colspan="2"></td>`;
}

function sovUpdateMetrics(){
  const locs=sovLocs;
  const fmtM=v=>v>=1e6?`${(v/1e6).toFixed(1)}M`:v>=1e3?`${(v/1e3).toFixed(0)}k`:(v||0).toLocaleString();
  const totalAvg=locs.reduce((s,l)=>s+(parseFloat(l.stock_avg)||0),0);
  const eqE=locs.filter(l=>l.eq_zone).reduce((s,l)=>s+(parseFloat(l.stock_avg)||0),0);
  const wE=locs.filter(l=>l.wind_zone).reduce((s,l)=>s+(parseFloat(l.stock_avg)||0),0);
  const fE=locs.filter(l=>l.flood_zone).reduce((s,l)=>s+(parseFloat(l.stock_avg)||0),0);
  const prem=locs.reduce((s,l)=>s+(l.stock_avg&&l.rate?Math.round(l.stock_avg*parseFloat(l.rate)/100):0),0);
  const countries=[...new Set(locs.map(l=>l.country).filter(Boolean))].length;
  document.getElementById('sov-metrics-bar').innerHTML=[
    {label:'Locations',val:locs.length,sub:`${countries} countr${countries===1?'y':'ies'}`},
    {label:'Total avg stock',val:fmtM(totalAvg),sub:'all locations'},
    {label:'EQ exposure',val:eqE?fmtM(eqE):'None',sub:`${locs.filter(l=>l.eq_zone).length} loc(s)`,style:'color:#7B2D8B'},
    {label:'Wind exposure',val:wE?fmtM(wE):'None',sub:`${locs.filter(l=>l.wind_zone).length} loc(s)`,style:'color:#854F0B'},
    {label:'Flood exposure',val:fE?fmtM(fE):'None',sub:`${locs.filter(l=>l.flood_zone).length} loc(s)`,style:'color:#185FA5'},
    {label:'Total premium',val:fmtM(prem),sub:'rated locations'},
  ].map(m=>`<div class="metric"><label>${m.label}</label><div class="val" ${m.style?`style="${m.style}"`:''}>${m.val}</div><div class="sub">${m.sub}</div></div>`).join('');
}

function queryCat(){
  const q=document.getElementById('cat-q').value.toLowerCase().trim();
  const peril=document.getElementById('cat-peril').value;
  if(!q){document.getElementById('cat-result').innerHTML='';return;}
  const matched=sovLocs.filter(l=>{
    const t=(l.insured+' '+l.city+' '+l.state+' '+l.country).toLowerCase();
    if(!t.includes(q))return false;
    if(peril==='eq'&&!l.eq_zone)return false;
    if(peril==='wind'&&!l.wind_zone)return false;
    if(peril==='flood'&&!l.flood_zone)return false;
    return true;
  });
  const fmt=v=>Math.round(v).toLocaleString();
  const el=document.getElementById('cat-result');
  if(!matched.length){el.innerHTML=`<div class="notice ok">✓ No exposure found matching "<strong>${q}</strong>"${peril!=='all'?' for '+peril:''} in current schedule.</div>`;return;}
  const totalAvg=matched.reduce((s,l)=>s+(parseFloat(l.stock_avg)||0),0);
  const totalLimit=matched.reduce((s,l)=>s+(parseFloat(l.limit)||0),0);
  let html=`<div class="notice warn"><strong>⚠ ${matched.length} location(s) exposed — "${q}"</strong><br>Total avg stock: ${fmt(totalAvg)} · Total limits: ${fmt(totalLimit)}</div>
  <div style="overflow-x:auto"><table style="width:100%;font-size:11px;border-collapse:collapse"><tr style="border-bottom:1px solid var(--border)"><th style="text-align:left;padding:5px 8px;font-size:10px">Insured</th><th style="text-align:left;padding:5px 8px;font-size:10px">Location</th><th style="text-align:right;padding:5px 8px;font-size:10px">Avg stock</th><th style="text-align:right;padding:5px 8px;font-size:10px">Limit</th><th style="padding:5px 8px;font-size:10px">Perils</th></tr>`;
  matched.forEach(l=>{
    const cats=[l.eq_zone?'<span class="b-eq">EQ</span>':'',l.wind_zone?'<span class="b-wind">Wind</span>':'',l.flood_zone?'<span class="b-flood">Flood</span>':''].filter(Boolean).join(' ');
    html+=`<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:5px 8px">${l.insured||'—'}</td><td style="padding:5px 8px">${l.city||''} ${l.state||''}, ${l.country||''}</td><td style="padding:5px 8px;text-align:right;font-weight:500">${l.stock_avg?fmt(l.stock_avg):'—'}</td><td style="padding:5px 8px;text-align:right;font-weight:500">${l.limit?fmt(l.limit):'—'}</td><td style="padding:5px 8px">${cats||'—'}</td></tr>`;
  });
  el.innerHTML=html+'</table></div>';
}

function sovExportCSV(){
  const heads=['#','Insured','Address','City','State/Prov','Country','Lat','Long','Occupancy','Tenure','Sq ft','Storeys','Year built','Walls','Roof','Sprinkler%','Spr connected','Burglar alarm','Fire alarm','Fire stn km','Hydrant m','Stock cost','Stock selling','3P stock','Avg stock','Peak month','Limit','EQ zone','Wind zone','Flood zone','Rate%','Premium','Currency'];
  const rows=sovLocs.map((l,i)=>[i+1,l.insured,l.address,l.city,l.state,l.country,l.lat,l.lng,l.occupancy,l.tenure,l.sqft,l.storeys,l.built,l.walls,l.roof,l.sprinkler_pct,l.sprinkler_connected,l.burglar_alarm,l.fire_alarm,l.fire_stn_km,l.hydrant_m,l.stock_cost,l.stock_cost?Math.round(l.stock_cost*1.175):0,l.stock_others,l.stock_avg,l.peak_month,l.limit,l.eq_zone?'Yes':'No',l.wind_zone?'Yes':'No',l.flood_zone?'Yes':'No',l.rate,l.stock_avg&&l.rate?Math.round(l.stock_avg*parseFloat(l.rate)/100):0,l.currency].map(v=>`"${v||''}"`).join(','));
  const csv=[heads.join(','),...rows].join('\n');
  const a=document.createElement('a');a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv);a.download='OGBroking_SOV_'+new Date().toISOString().slice(0,10)+'.csv';a.click();
}

// ═══════════════════════════════════════════════════════
// PROPOSAL FORM
// ═══════════════════════════════════════════════════════
function ptab(id){
  document.querySelectorAll('.ppanel').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.querySelectorAll('.ptab').forEach((b,i)=>b.classList.toggle('active',['p-insured','p-goods','p-transit','p-storage','p-loss','p-rating'][i]===id));
  if(id==='p-rating') calcPremium();
}

const PROP_INCO=['EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP'];
const PROP_ROLE={EXW:{buy:'primary',sell:'contingent'},FCA:{buy:'primary',sell:'contingent'},FAS:{buy:'primary',sell:'contingent'},FOB:{buy:'primary',sell:'contingent'},CFR:{buy:'primary',sell:'contingent'},CIF:{buy:'contingent',sell:'primary'},CPT:{buy:'primary',sell:'contingent'},CIP:{buy:'contingent',sell:'primary'},DAP:{buy:'contingent',sell:'primary'},DPU:{buy:'contingent',sell:'primary'},DDP:{buy:'contingent',sell:'primary'}};
const PROP_PERSP={im:'buy',ex:'sell'};
let propIncoCounters={im:0,ex:0};
let propIncoState={im:[],ex:[]};

function addIncoRow(cat,code='FOB',pct=100){
  const id=`pi-${cat}-${++propIncoCounters[cat]}`;
  const persp=PROP_PERSP[cat];
  const div=document.createElement('div');
  div.className='inco-row-p';div.id=id;
  div.innerHTML=`<select style="flex:0 0 155px" onchange="updatePropInco('${id}','${cat}');calcPremium()">${PROP_INCO.map(c=>`<option value="${c}"${c===code?' selected':''}>${c}</option>`).join('')}</select><input type="number" value="${pct}" min="0" max="100" style="flex:0 0 52px" oninput="calcPremium()" placeholder="%"> %<span id="${id}-role" class="badge"></span><span style="flex:1;font-size:10px;color:var(--text2)" id="${id}-desc"></span><button class="btn sm" onclick="removePropInco('${id}','${cat}')" style="color:var(--err);border:none;background:none;padding:2px 5px">✕</button>`;
  document.getElementById(`pt-${cat}-incos`).appendChild(div);
  propIncoState[cat].push(id);
  updatePropInco(id,cat);
}

function updatePropInco(id,cat){
  const row=document.getElementById(id);if(!row)return;
  const code=row.querySelector('select').value;
  const role=PROP_ROLE[code]?.[PROP_PERSP[cat]]||'primary';
  const badge=document.getElementById(`${id}-role`);
  badge.className=`badge ${role==='primary'?'b-ok':'b-draft'}`;
  badge.textContent=role==='primary'?'Primary':'Contingent';
}

function removePropInco(id,cat){document.getElementById(id)?.remove();propIncoState[cat]=propIncoState[cat].filter(x=>x!==id);calcPremium();}

function syncPropRate(cat){
  const pr=parseFloat(document.getElementById(`pt-${cat}-pr`)?.value)||0;
  const el=document.getElementById(`pt-${cat}-cr`);
  if(el) el.value=Math.round(pr/3*1000000)/1000000;
}

function calcPremium(){
  const nv=id=>parseFloat(document.getElementById(id)?.value)||0;
  const fmt=v=>Math.round(v).toLocaleString();
  const fmtR=v=>v?(v*100).toFixed(4)+'%':'—';

  // Imports
  const imVal=nv('pt-im-val');const imPr=nv('pt-im-pr');const imCr=nv('pt-im-cr');
  const imRows=propIncoState.im.map(id=>{const row=document.getElementById(id);if(!row)return null;const code=row.querySelector('select').value;const pct=parseFloat(row.querySelector('input[type=number]').value)||0;return{pct,role:PROP_ROLE[code]?.buy||'primary'};}).filter(Boolean);
  let imP=0,imC=0;imRows.forEach(r=>r.role==='primary'?imP+=r.pct:imC+=r.pct);if(!imRows.length)imP=100;
  const imPrem=(imVal*(imP/100)*imPr)+(imVal*(imC/100)*imCr);

  // Exports
  const exVal=nv('pt-ex-val');const exPr=nv('pt-ex-pr');const exCr=nv('pt-ex-cr');
  const exRows=propIncoState.ex.map(id=>{const row=document.getElementById(id);if(!row)return null;const code=row.querySelector('select').value;const pct=parseFloat(row.querySelector('input[type=number]').value)||0;return{pct,role:PROP_ROLE[code]?.sell||'primary'};}).filter(Boolean);
  let exP=0,exC=0;exRows.forEach(r=>r.role==='primary'?exP+=r.pct:exC+=r.pct);if(!exRows.length)exP=100;
  const exPrem=(exVal*(exP/100)*exPr)+(exVal*(exC/100)*exCr);

  const doPrem=nv('pt-do-val')*nv('pt-do-pr');
  const stPrem=nv('ps-avg')*nv('ps-rate');
  const catApply=document.getElementById('ps-cat-apply')?.checked;
  const catPrem=catApply?nv('ps-avg')*nv('ps-cat-rate'):0;
  const transit=imPrem+exPrem+doPrem;
  const grand=transit+stPrem+catPrem;
  const totalVal=imVal+exVal+nv('pt-do-val');
  const blended=totalVal>0?transit/totalVal:0;

  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('pt-im-prem',`Premium: ${fmt(imPrem)}`);
  set('pt-ex-prem',`Premium: ${fmt(exPrem)}`);
  set('pt-do-prem',`Premium: ${fmt(doPrem)}`);
  set('ps-prem',`Premium: ${fmt(stPrem)}`);
  set('ps-cat-prem',`CAT premium: ${fmt(catPrem)}`);
  set('pr-im',fmt(imPrem));set('pr-ex',fmt(exPrem));set('pr-do',fmt(doPrem));set('pr-st',fmt(stPrem));set('pr-cat',fmt(catPrem));
  set('pr-total',fmt(grand));set('pr-rate',fmtR(blended));
  const catRow=document.getElementById('pr-cat-row');
  if(catRow) catRow.style.display=catApply?'flex':'none';
}

function calcLoss(){
  const years=['21','22','23','24','25'];
  const tT=years.reduce((s,y)=>s+(parseFloat(document.getElementById(`ll${y}t`)?.value)||0),0);
  const sT=years.reduce((s,y)=>s+(parseFloat(document.getElementById(`ll${y}s`)?.value)||0),0);
  const fmt=v=>v?`USD ${Math.round(v).toLocaleString()}`:'NIL';
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('ll-tt',fmt(tT));set('ll-st',fmt(sT));
  const tp=parseFloat(document.getElementById('ll-tp')?.value)||0;
  const sp=parseFloat(document.getElementById('ll-sp')?.value)||0;
  set('ll-tlr',tp>0?`${Math.round(tT/tp*100)}%`:'—');
  set('ll-slr',sp>0?`${Math.round(sT/sp*100)}%`:'—');
}

function copyRatingSummary(){
  const nv=id=>document.getElementById(id)?.value||'';
  const lines=[`OG BROKING — CARGO/STP RATING SUMMARY`,``,`Insured: ${nv('pi-name')||'TBC'}`,`Country: ${nv('pi-country')||'TBC'}`,`Goods: ${nv('pg-desc')||'TBC'}`,``,`PREMIUM: USD ${document.getElementById('pr-total')?.textContent||'0'}`,`Blended rate: ${document.getElementById('pr-rate')?.textContent||'—'}`];
  navigator.clipboard.writeText(lines.join('\n')).then(()=>{const b=event.target;b.textContent='Copied!';setTimeout(()=>b.textContent='Copy summary',2000);});
}

function resetProposal(){
  if(!confirm('Reset all proposal form data?'))return;
  document.querySelectorAll('#proposal input[type=text],#proposal input[type=number],#proposal input[type=date],#proposal textarea').forEach(el=>{if(!el.readOnly)el.value='';});
  ['im','ex'].forEach(cat=>{document.getElementById(`pt-${cat}-incos`).innerHTML='';propIncoState[cat]=[];propIncoCounters[cat]=0;addIncoRow(cat,'FOB',100);});
  document.getElementById('ps-cat-apply').checked=false;
  syncPropRate('im');syncPropRate('ex');calcPremium();
}

// ═══════════════════════════════════════════════════════
// SUBMISSION INTAKE
// ═══════════════════════════════════════════════════════
const INTAKE_AUTO_IMPORT=`Subject: Auto Import Internacional S.A. 2026 - Stock-only Quote Invitation - Panama\n\nDear Ed,\n\nWe are pleased to invite you to quote a new Stock-Only STP reinsurance opportunity in Panama called Auto Import Internacional S.A.\n\nThe risk relates to the storage of automotive parts and accessories at a single location in Colón Free Zone, with target terms based on a limit of US$ 2,400,000 each and every loss and the same amount in the annual aggregate in respect of CAT perils.\n\nSurvey dated 27 March 2026 - General risk assessment: GOOD.\n\nOriginal Assured: Auto Import Internacional S.A.\nCedant: La Internacional de Seguros S.A.\nAddress: 17th Street, Block 122-6A, Barrio Sur, Zona Libre de Colón, Colón, Republic of Panama\nInterest: Automotive parts and accessories (wholesale import warehouse, established 1980)\nTotal Insured Value: USD 2,400,000 / Average Value: USD 1,680,000\nDeductible: USD 25,000 AOO / USD 75,000 CAT\nLoss record: 5-year clean\nTarget premium: USD 12,000 (0.50%)\nJurisdiction: Panama\n\nKind regards,\nLuis Zambrano\nMomentum Panama`;

const INTAKE_SPARSE=`Hi Ed\n\nNew one - Turkish food manufacturer, Tiryaki Agro, wants RI cover. They export sunflower seeds and vegetable oils. Mostly FOB sales to Europe. Annual turnover around USD 200M. They had a small claim in 2023, about USD 80k.\n\nThanks\nIntegra`;

function loadIntakeDemo(type){
  document.getElementById('intake-text').value=type==='autoimport'?INTAKE_AUTO_IMPORT:INTAKE_SPARSE;
}

const INTAKE_SYSTEM=`You are a senior Lloyd's marine cargo broker extracting structured data from a submission. Extract everything you can. For each field assign confidence: "extracted" (stated directly), "inferred" (deduced from context), or "missing" (not found). Return ONLY valid JSON:\n{"insured_name":{"value":"","confidence":""},"cedant":{"value":"","confidence":""},"producer":{"value":"","confidence":""},"country":{"value":"","confidence":""},"address":{"value":"","confidence":""},"goods_description":{"value":"","confidence":""},"product_type":{"value":"Stock Only RI","confidence":""},"currency":{"value":"USD","confidence":""},"annual_turnover":{"value":null,"confidence":""},"export_value":{"value":null,"confidence":""},"import_value":{"value":null,"confidence":""},"avg_stock":{"value":null,"confidence":""},"max_stock":{"value":null,"confidence":""},"limit_eel":{"value":null,"confidence":""},"limit_cat":{"value":null,"confidence":""},"deductible_aoo":{"value":null,"confidence":""},"deductible_cat":{"value":null,"confidence":""},"target_premium":{"value":null,"confidence":""},"target_rate":{"value":null,"confidence":""},"incoterms_selling":{"value":"","confidence":""},"incoterms_buying":{"value":"","confidence":""},"loss_record":{"value":"","confidence":""},"route_from":{"value":"","confidence":""},"route_to":{"value":"","confidence":""},"storage_location":{"value":"","confidence":""},"survey_rating":{"value":"","confidence":""},"subjectivities":{"value":"","confidence":""},"jurisdiction":{"value":"","confidence":""},"stock_only":{"value":false,"confidence":""},"triage_flags":["..."]}`;

let _lastIntakeData=null;

async function runIntake(){
  const text=document.getElementById('intake-text').value.trim();
  if(!text){alert('Paste a submission first');return;}
  document.getElementById('intake-spin').style.display='inline';
  document.getElementById('intake-result').style.display='none';

  const key=getKey();
  if(!key){
    // Demo mode
    const isAI=text.includes('Auto Import');
    _lastIntakeData=isAI?{
      insured_name:{value:'Auto Import Internacional S.A.',confidence:'extracted'},cedant:{value:'La Internacional de Seguros S.A.',confidence:'extracted'},producer:{value:'Momentum Panama',confidence:'extracted'},country:{value:'Panama',confidence:'extracted'},address:{value:'17th Street, Block 122-6A, Zona Libre de Colón, Panama',confidence:'extracted'},goods_description:{value:'Automotive parts and accessories — wholesale import warehouse',confidence:'extracted'},product_type:{value:'Stock Only RI',confidence:'extracted'},currency:{value:'USD',confidence:'extracted'},annual_turnover:{value:null,confidence:'missing'},export_value:{value:null,confidence:'missing'},import_value:{value:null,confidence:'missing'},avg_stock:{value:1680000,confidence:'extracted'},max_stock:{value:2400000,confidence:'extracted'},limit_eel:{value:2400000,confidence:'extracted'},limit_cat:{value:2400000,confidence:'extracted'},deductible_aoo:{value:25000,confidence:'extracted'},deductible_cat:{value:75000,confidence:'extracted'},target_premium:{value:12000,confidence:'extracted'},target_rate:{value:0.005,confidence:'extracted'},incoterms_selling:{value:'',confidence:'missing'},incoterms_buying:{value:'',confidence:'missing'},loss_record:{value:'5-year clean loss record',confidence:'extracted'},route_from:{value:'',confidence:'missing'},route_to:{value:'',confidence:'missing'},storage_location:{value:'17th Street, Block 122-6A, Zona Libre de Colón',confidence:'extracted'},survey_rating:{value:'GOOD — Survey No. 2250, 27 March 2026',confidence:'extracted'},subjectivities:{value:'(1) Fire extinguisher labelling NFPA-10; (2) Fire alarm panel repair NFPA-72 — both within 60 days',confidence:'extracted'},jurisdiction:{value:'Panama',confidence:'extracted'},stock_only:{value:true,confidence:'extracted'},triage_flags:['Below USD 25k min premium','Panama jurisdiction','Survey subjectivities present']
    }:{
      insured_name:{value:'Tiryaki Agro Gida Sanayi Ve Ticaret A.S.',confidence:'extracted'},cedant:{value:'',confidence:'missing'},producer:{value:'Integra',confidence:'extracted'},country:{value:'Turkey',confidence:'inferred'},address:{value:'',confidence:'missing'},goods_description:{value:'Sunflower seeds and vegetable oils',confidence:'extracted'},product_type:{value:'Marine Cargo RI',confidence:'inferred'},currency:{value:'USD',confidence:'inferred'},annual_turnover:{value:200000000,confidence:'extracted'},export_value:{value:200000000,confidence:'inferred'},import_value:{value:null,confidence:'missing'},avg_stock:{value:null,confidence:'missing'},max_stock:{value:null,confidence:'missing'},limit_eel:{value:null,confidence:'missing'},limit_cat:{value:null,confidence:'missing'},deductible_aoo:{value:null,confidence:'missing'},deductible_cat:{value:null,confidence:'missing'},target_premium:{value:null,confidence:'missing'},target_rate:{value:null,confidence:'missing'},incoterms_selling:{value:'FOB',confidence:'extracted'},incoterms_buying:{value:'',confidence:'missing'},loss_record:{value:'One claim 2023 approx USD 80k',confidence:'extracted'},route_from:{value:'Turkey',confidence:'inferred'},route_to:{value:'Europe',confidence:'extracted'},storage_location:{value:'',confidence:'missing'},survey_rating:{value:'',confidence:'missing'},subjectivities:{value:'',confidence:'missing'},jurisdiction:{value:'',confidence:'missing'},stock_only:{value:false,confidence:'inferred'},triage_flags:['Sparse submission','No limit/deductible/premium','Stock values unknown','Loss record incomplete']
    };
    showIntakeResult(_lastIntakeData,text);
    document.getElementById('intake-spin').style.display='none';
    return;
  }

  try{
    const raw = await aiText({
      model:'claude-sonnet-4-20250514',
      max_tokens:2000,
      system:INTAKE_SYSTEM,
      user:`Extract from:

${text}`
    });
    const clean=raw.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/\s*```$/,'').trim();
    _lastIntakeData=JSON.parse(clean);
    showIntakeResult(_lastIntakeData,text);
  }catch(e){
    document.getElementById('intake-result').innerHTML=`<div class="notice warn">Extraction error: ${e.message}</div>`;
    document.getElementById('intake-result').style.display='block';
  }
  document.getElementById('intake-spin').style.display='none';
}

function showIntakeResult(data,submissionText){
  const confBadge=c=>({extracted:'<span class="conf-ex">✓ Extracted</span>',inferred:'<span class="conf-inf">~ Inferred</span>',missing:'<span class="conf-mis">✕ Missing</span>'}[c]||'');
  const d=data;
  const counts={extracted:0,inferred:0,missing:0};
  Object.values(d).forEach(f=>{if(f&&f.confidence)counts[f.confidence]=(counts[f.confidence]||0)+1;});

  const fields=[
    ['Insured name','insured_name'],['Cedant (RI)','cedant'],['Producer','producer'],['Country','country'],['Address','address'],['Goods','goods_description'],['Product type','product_type'],['Currency','currency'],['Annual turnover','annual_turnover'],['Export value','export_value'],['Import value','import_value'],['Average stock','avg_stock'],['Max stock','max_stock'],['Limit EEL','limit_eel'],['CAT limit','limit_cat'],['Deductible AOO','deductible_aoo'],['CAT deductible','deductible_cat'],['Target premium','target_premium'],['Target rate','target_rate'],['Incoterms selling','incoterms_selling'],['Incoterms buying','incoterms_buying'],['Loss record','loss_record'],['Route from','route_from'],['Route to','route_to'],['Storage location','storage_location'],['Survey rating','survey_rating'],['Subjectivities','subjectivities'],['Jurisdiction','jurisdiction'],['Stock only','stock_only'],
  ];

  document.getElementById('intake-counts').textContent=`${counts.extracted} extracted · ${counts.inferred} inferred · ${counts.missing} missing`;

  let html='<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px">';
  fields.forEach(([label,key])=>{
    const f=d[key];
    const val=f?.value===null||f?.value===undefined||f?.value===''?'—':String(f.value);
    html+=`<div style="padding:5px 0;border-bottom:0.5px solid var(--border)"><div style="font-size:10px;color:var(--text2);margin-bottom:2px">${label}</div><div style="font-size:12px;font-weight:${f?.confidence==='extracted'?'500':'400'};display:flex;align-items:center;gap:6px">${val} ${confBadge(f?.confidence)}</div></div>`;
  });
  html+='</div>';
  document.getElementById('intake-fields').innerHTML=html;

  // Gaps
  const missingLabels={'insured_name':'Insured full legal name','country':'Country of incorporation','goods_description':'Goods description','annual_turnover':'Annual turnover / sales','export_value':'Annual export value','import_value':'Annual import value','avg_stock':'Average stock value','max_stock':'Peak / maximum stock value','limit_eel':'Policy limit (EEL)','deductible_aoo':'Deductible (AOO)','target_premium':'Target premium','incoterms_selling':'Incoterms (selling)','incoterms_buying':'Incoterms (buying)','route_from':'Countries of origin','route_to':'Countries of destination','storage_location':'Storage location(s) with address','loss_record':'5-year loss record'};
  const missingItems=Object.entries(missingLabels).filter(([key])=>{const f=d[key];return !f||f.confidence==='missing'||f.value===null||f.value===undefined||f.value==='';});
  const gapsCard=document.getElementById('intake-gaps-card');
  if(missingItems.length){
    gapsCard.style.display='block';
    document.getElementById('intake-missing-list').innerHTML=missingItems.map(([,label])=>`✕ ${label}`).join('<br>');
    const producer=d.producer?.value||'[producer]';
    const insured=d.insured_name?.value||'the insured';
    document.getElementById('intake-info-request').textContent=`Dear ${producer.split('(')[0].trim()},\n\nThank you for the submission of ${insured}.\n\nIn order to approach the market, we require the following additional information:\n\n${missingItems.map(([,label],i)=>`${i+1}. ${label}`).join('\n')}\n\nCould you please provide the above at your earliest convenience.\n\nMany thanks,\nOG Broking`;
  } else { gapsCard.style.display='none'; }

  // Triage flags
  const flagsCard=document.getElementById('intake-flags-card');
  if(d.triage_flags?.length){
    flagsCard.style.display='block';
    document.getElementById('intake-flags').innerHTML=d.triage_flags.map(f=>`<span class="badge b-warn" style="margin:2px 3px;display:inline-block">${f}</span>`).join('');
  } else { flagsCard.style.display='none'; }

  document.getElementById('intake-result').style.display='block';
}

function applyIntakeToProposal(){
  if(!_lastIntakeData){alert('Extract a submission first');return;}
  const d=_lastIntakeData;
  const set=(id,val)=>{const el=document.getElementById(id);if(el&&val!==null&&val!==undefined&&val!=='')el.value=val;};
  set('pi-name',d.insured_name?.value);
  set('pi-country',d.country?.value);
  set('pi-addr',d.address?.value);
  set('pg-desc',d.goods_description?.value);
  set('pi-turn',d.annual_turnover?.value);
  set('pt-im-val',d.import_value?.value);
  set('pt-ex-val',d.export_value?.value);
  set('ps-avg',d.avg_stock?.value);
  set('ps-peak',d.max_stock?.value);
  set('pg-from',d.route_from?.value);
  set('pg-to',d.route_to?.value);
  syncPropRate('im');syncPropRate('ex');calcPremium();
  tab('proposal');ptab('p-insured');
  alert(`Applied to proposal form — ${Object.values(d).filter(f=>f?.confidence==='extracted').length} fields populated. Review and fill missing fields.`);
}

function copyInfoRequest(){
  const el=document.getElementById('intake-info-request');
  if(el) navigator.clipboard.writeText(el.textContent).then(()=>{const b=event.target;b.textContent='Copied!';setTimeout(()=>b.textContent='Copy email',2000);});
}


// ═══════════════════════════════════════════════════════
// ENTITIES SEED VERSION — bump this string to force a smart merge reseed
// Merge logic: seed data wins for seed enquiry IDs; user-added enquiries preserved;
// notes/emails/slips/companyBackground preserved; user-added insureds preserved.
var ENTITIES_SEED_VERSION_NEW = "v9.0";

function entGetState(){
  var s = gs();
  if(!s.entities || s.entitiesVersion !== ENTITIES_SEED_VERSION_NEW){
    var seed = JSON.parse(JSON.stringify(ENTITIES_SEED));
    if(s.entities && s.entitiesVersion){
      // Smart merge — preserve user additions
      var seedIds = new Set(seed.insureds.map(function(i){ return i.id; }));
      var userAdded = (s.entities.insureds||[]).filter(function(i){ return !seedIds.has(i.id); });
      var DELETED_STUB_IDS = new Set(['fg-ship-bunkers-01012026']);
      seed.insureds.forEach(function(seedIns){
        var existing = (s.entities.insureds||[]).find(function(i){ return i.id===seedIns.id; });
        if(existing){
          var seedEnqIds = new Set(seedIns.enquiries.map(function(e){ return e.id; }));
          var userEnqs = (existing.enquiries||[]).filter(function(e){
            return !seedEnqIds.has(e.id) && !DELETED_STUB_IDS.has(e.id);
          });
          seedIns.enquiries = seedIns.enquiries.concat(userEnqs);
          if(existing.notes&&existing.notes.length) seedIns.notes = existing.notes;
          if(existing.emails&&existing.emails.length) seedIns.emails = existing.emails;
          if(existing.slips&&existing.slips.length) seedIns.slips = existing.slips;
          if(existing.companyBackground) seedIns.companyBackground = existing.companyBackground;
        }
      });
      seed.insureds = seed.insureds.concat(userAdded);
    }
    s.entities = seed;
    s.entitiesVersion = ENTITIES_SEED_VERSION_NEW;
    ss(s);
  }
  return s.entities;
}

const ENTITIES_SEED = {"producers": [{"id": "integra", "name": "Integra", "insureds": ["ceva-lojistik-borusan-vehicle-logist", "makine-ve-kimya-end-strisi-a", "maxlog-ffl", "pars-demi-ryolu-i-letmeci-li-i-anoni", "tradezone", "paptrans", "dfds-poland", "yapi-merkezi", "korver-ffl", "origin-fevzi-gandur", "universal-acarsan-group", "sunar-misir-stp", "erkport", "evolog-nakli-yat-i-hti-yari-ffl-dest", "irmak-warehousing", "sunwoda-mobility-energy-technology-c", "orion-ffl-tekli-f-talebi-hk", "yalova-roro-excess-whll", "akar-i-ve-d-tic-ltd-ti", "asav-ffl", "gemlik-cargo-plus-war", "fevzi-gandur-whll", "tlm-ffl", "ekol-lojistik-as", "sunel-tobacco", "tiryaki-agro-gida-sanayi-ve-ticaret-", "gefco-tasimacilik-ve-lojistik-as", "kayikcioglu-kadoline-trans", "dnt-uluslararasi-nakliye", "gumustas-lojistik", "hakan-gida", "asbas-marine", "metal-market-international", "origin-fgl-lojistik-a-s", "tlc-klima-san-ve-tic-a-s", "cobantur-logistics", "sasa-polyester", "tech-enerji-danismanlik-ltd-sti"]}, {"id": "langelier", "name": "Langelier", "insureds": ["ppaq", "sunset-converting-corp", "semex-canada", "soline-trading-ltd", "semex-inc"]}, {"id": "arb-international", "name": "ARB International / ARB Europe", "insureds": ["semillas-el-campillo", "semillas-batlle", "tole-catalana", "serradora-boix", "calconut-sl"]}, {"id": "momentum", "name": "Momentum (Panama)", "insureds": ["lx-pantos-logistics-panama-s-a-2026-", "muresa-intertrade"]}, {"id": "latam-re", "name": "Latam Re", "insureds": ["distribeaute-sa", "yaafar-internacional-s-a", "mirage-trading-s-a"]}, {"id": "prudent", "name": "Prudent Insurance Brokers", "insureds": ["strides-pharma-inc"]}, {"id": "ink-consulting", "name": "Ink Consulting SARL", "insureds": ["ink-consulting-sarl"]}, {"id": "aib", "name": "AIB", "insureds": ["fg-ship-bunkers"]}, {"id": "khai-gemini-brokers", "name": "Khai @ Gemini Brokers", "insureds": ["denko-trading"]}, {"id": "rt-specialty", "name": "RT Specialty", "insureds": ["bzs-transport-llc", "ship-rooster-ai-inc", "precision-citrus-hedging", "rush-golfscapes-llc-cpe", "slb-equipment-list-of-trailers", "natural-ag-solutions-llc", "vital-planet-llc", "name-tbc-childrens-arts-supplies", "sutton-services-llc", "merits-health-products-inc", "bill-casey-electric-sales-inc", "barnaby-ltd", "good-vibrations", "image-trust", "mote-marine-laboratory-inc"]}, {"id": "strada-consulting", "name": "Strada Consulting", "insureds": ["forestal-del-sur", "mon-meros-colombo-venezolanos-s-a", "grupo-titanio", "euromaster", "kupfer-hnos"]}, {"id": "kmc", "name": "KMC", "insureds": ["ygl-lojistik", "logitrans", "ody-lojistik"]}, {"id": "mds-corredores", "name": "MDS Corredores de Reaseguros SA", "insureds": ["forestal-del-sur"]}, {"id": "jnp-re", "name": "JNP Re", "insureds": ["patria-seguros-y-reaseguros-paraguay", "tecnomyl-s-a", "la-consolidada-paraguay", "fuelpar", "cma-paraguay-s-a"]}, {"id": "oneglobal-peru", "name": "OneGlobal Peru", "insureds": ["inmobiliaria-don-salomon", "seafrost"]}, {"id": "oneglobal-colombia", "name": "OneGlobal Colombia", "insureds": ["cooprocarcat-mining-cooperative-coal", "etanoles-del-magdalena"]}, {"id": "oneglobal-dubai", "name": "OneGlobal Dubai", "insureds": ["chalhoub-group", "triangle-commodities-trading", "nasser-bin-abdullatif-alserkal-group"]}, {"id": "oneglobal-brazil", "name": "OneGlobal Brazil", "insureds": ["inpasa-grenco-tankage-operation", "innospace-do-brasil-ltd"]}, {"id": "argentum-re", "name": "Argentum RE", "insureds": ["sumex-america-corp"]}, {"id": "bfl-canada", "name": "BFL Canada", "insureds": ["guy-d-anjou-inc"]}, {"id": "bms-brasil", "name": "BMS Brasil", "insureds": ["vtc-operadora-logistica-ltda"]}, {"id": "bridge-specialty", "name": "Bridge Specialty", "insureds": ["life-electric-vehicles-inc"]}, {"id": "charter", "name": "Charter", "insureds": ["harvest-marketing-trading-llc"]}, {"id": "energy-london", "name": "Energy London", "insureds": ["silleno-cargo-project-cargo"]}, {"id": "fortus-inter-partes", "name": "Fortus Inter Partes", "insureds": ["halk-insurance-plc", "euroherc-insurance"]}, {"id": "houlders", "name": "Houlders", "insureds": ["glengyle"]}, {"id": "hull-co", "name": "Hull & Co", "insureds": ["the-bruery-llc-et-al"]}, {"id": "jonasre", "name": "JonasRe Ltd", "insureds": ["brimich-logistics-and-packaging-inc"]}, {"id": "lareau", "name": "Lareau", "insureds": ["jefo-nutrition-bor-moved-away-from-l"]}, {"id": "lillenfeld", "name": "Lillenfeld", "insureds": ["akikb-minibodegas-spa"]}, {"id": "pf-chile", "name": "PF CHile", "insureds": ["castillomax-oil-and-gas-s-a-venezuel"]}, {"id": "pacific-insurance", "name": "Pacific Insurance Brokers Corp", "insureds": ["extrum-sa"]}, {"id": "sky-re", "name": "SKY RE", "insureds": ["byd-mexico", "unimog", "servicio-huan-maro-s-a-de-c-v", "jacob-jacob"]}, {"id": "volcafe-uk", "name": "Volcafe UK", "insureds": ["volcafe-uk"]}], "insureds": [{"id": "semillas-el-campillo", "name": "Semillas EL Campillo", "producerId": "arb-international", "region": "Spain", "enquiries": [{"id": "semillas-el-campillo-16122026", "handler": "KE", "enquiryDate": "24/11/2025", "inceptionDate": "16/12/2025", "currency": "USD", "premium": "", "commission": "3500", "notes": "W/AMP 08/12 - placed locally", "newRenewal": "", "region": "Spain", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "halk-insurance-plc", "name": "Halk Insurance plc", "producerId": "fortus-inter-partes", "region": "Croatia", "enquiries": [{"id": "halk-insurance-plc-01012026", "handler": "KE", "enquiryDate": "20/11/2025", "inceptionDate": "01/01/2026", "currency": "", "premium": "", "commission": "", "notes": "Sent out to Markets 08/12 - couldn't secure solution", "newRenewal": "", "region": "Croatia", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "ceva-lojistik-borusan-vehicle-logist", "name": "CEVA Lojistik / Borusan Vehicle Logistics", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "ceva-lojistik-borusan-ve-29032026", "handler": "KE/MM/EW", "enquiryDate": "03/02/2026", "inceptionDate": "29/03/2026", "currency": "EUR", "premium": "565000", "commission": "77687", "notes": "Marine Cargo RI. EUR 300k limit per loss, EUR 1,500 deductible per vehicle. MDP EUR 565,000 adjustable. Landmark 100% line to stand. Profit commission 15%.", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "Landmark", "cedant": "T\u00fcrkiye Sigorta A.S.", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}, "placement": {"id": "ceva-mc-2026-27", "period": "29 Mar 2026 \u2013 28 Mar 2027", "type": "Marine Cargo Reinsurance", "currency": "EUR", "overseasBroker": "Integra Sigorta ve Reas\u00fcrans Brokerli\u011fi A.\u015e.", "totalPremium": 565000, "notes": "MDP EUR 565,000 adjustable at 0.03042% on total values (est. EUR 2,127,000,000). Profit commission 15% of profit. Loss history: 2024-25 EUR 513,918 (incl EUR 50k AAD); 2023-24 EUR 424,431; 2022-23 EUR 267,393; 2021-22 EUR 293,985.", "layers": [{"id": "ceva-l1", "umr": "B1743MC2681275", "description": "EUR 300,000 any one loss \u2014 transit (first loss basis)", "limitM": 0.3, "attachmentM": 0, "cedant": "T\u00fcrkiye Sigorta A.S.", "slipLeader": "Landmark Chelsea Underwriting (obo PVI Insurance Corporation)", "grossPremium": 565000, "brokerage": 13.72, "netPremium": 488458, "markets": [{"name": "Landmark Chelsea / PVI", "syndicate": "off-platform", "written": 100.0, "signed": 100.0, "note": "Line To Stand"}]}]}}], "emails": [], "slips": []}, {"id": "makine-ve-kimya-end-strisi-a", "name": "Makine ve Kimya End\u00fcstrisi A.\u015e.", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "makine-ve-kimya-end-stri-01.Jan.2", "handler": "EW", "enquiryDate": "05/12/2025", "inceptionDate": "01/01/2026", "currency": "USD", "premium": "", "commission": "10000", "notes": "Ed awaiting information - Ekin to answer compliance questionnaire", "newRenewal": "", "region": "Turkey", "status": "Dead", "quoteLeader": "Fiducia", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "tecnomyl-s-a", "name": "TECNOMYL S.A.", "producerId": "jnp-re", "region": "Paraguay", "enquiries": [{"id": "tecnomyl-s-a-01012026", "handler": "EW", "enquiryDate": "05/11/2025", "inceptionDate": "01/01/2026", "currency": "USD", "premium": "25000", "commission": "2500", "notes": "Quoted - put up 28/11. Ed chased on 03.12.2026. Q instalments offered. They purchased a master/brazil HQ programme locally.", "newRenewal": "N", "region": "Paraguay", "status": "Dead", "quoteLeader": "Fiducia", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "fg-ship-bunkers", "name": "FG Ship Bunkers", "producerId": "aib", "region": "Malta", "enquiries": [{"id": "fg-ship-bunkers-01012026", "handler": "EW", "enquiryDate": "15/12/2025", "inceptionDate": "01/01/2026", "currency": "USD", "premium": "50000", "commission": "5000", "notes": "Quoted, now under 1 month extension.", "newRenewal": "Renewal", "region": "Malta", "status": "Bound", "quoteLeader": "A2B", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}, {"id": "fg-ship-bunkers-01022026", "handler": "EW/MM", "enquiryDate": "01/02/2026", "inceptionDate": "01/02/2026", "currency": "USD", "premium": "30000", "commission": "5000", "notes": "BOUND", "newRenewal": "Renewal", "region": "Malta", "status": "Bound", "quoteLeader": "A2B", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "inmobiliaria-don-salomon", "name": "INMOBILIARIA DON SALOMON", "producerId": "oneglobal-peru", "region": "", "enquiries": [{"id": "inmobiliaria-don-salomon-tbc", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "", "premium": "", "commission": "", "notes": "Cars/No EOM", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "maxlog-ffl", "name": "MAXLOG - FFL", "producerId": "integra", "region": "", "enquiries": [{"id": "maxlog-ffl-tbc", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "", "premium": "7500", "commission": "", "notes": "", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "mirage-trading-s-a", "name": "Mirage Trading S.A", "producerId": "latam-re", "region": "Panama", "enquiries": [{"id": "mirage-trading-s-a-01042026", "handler": "EW", "enquiryDate": "21/02/2026", "inceptionDate": "01/04/2026", "currency": "", "premium": "25000", "commission": "5000", "notes": "Latam Re advise firm order - looking to pick up terms quoted to CR / Chased 23/03", "newRenewal": "", "region": "Panama", "status": "Submission", "quoteLeader": "Fiducia", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "bzs-transport-llc", "name": "BZS Transport LLC", "producerId": "rt-specialty", "region": "", "enquiries": [{"id": "bzs-transport-llc-11032026", "handler": "JK", "enquiryDate": "15/01/2026", "inceptionDate": "11/03/2026", "currency": "", "premium": "", "commission": "", "notes": "", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "sunset-converting-corp", "name": "Sunset Converting Corp", "producerId": "langelier", "region": "Canada", "enquiries": [{"id": "sunset-converting-corp-05032026", "handler": "MM", "enquiryDate": "12/02/2026", "inceptionDate": "05/03/2026", "currency": "USD", "premium": "20000", "commission": "2000", "notes": "Quoted 19/02", "newRenewal": "Renewal", "region": "Canada", "status": "Bound", "quoteLeader": "Markel", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "barnaby-ltd", "name": "Barnaby Ltd", "producerId": "rt-specialty", "region": "", "enquiries": [{"id": "barnaby-ltd-tbc", "handler": "MM", "enquiryDate": "", "inceptionDate": "", "currency": "", "premium": "", "commission": "", "notes": "Binned - too small", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "good-vibrations", "name": "Good Vibrations", "producerId": "rt-specialty", "region": "", "enquiries": [{"id": "good-vibrations-02042026", "handler": "MM", "enquiryDate": "12/03/2026", "inceptionDate": "02/04/2026", "currency": "USD", "premium": "", "commission": "", "notes": "Binned", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "life-electric-vehicles-inc", "name": "Life Electric Vehicles, Inc.", "producerId": "bridge-specialty", "region": "", "enquiries": [{"id": "life-electric-vehicles-i-09032026", "handler": "EW", "enquiryDate": "09/03/2026", "inceptionDate": "09/03/2026", "currency": "", "premium": "", "commission": "", "notes": "Portia Price/Slip to do. No feedback/comms between wholesaler and retailer have broken down.", "newRenewal": "", "region": "", "status": "Submission", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "castillomax-oil-and-gas-s-a-venezuel", "name": "CASTILLOMAX Oil and Gas S.A. (Venezuela)", "producerId": "pf-chile", "region": "", "enquiries": [{"id": "castillomax-oil-and-gas--09032026", "handler": "EW", "enquiryDate": "09/03/2026", "inceptionDate": "09/03/2026", "currency": "", "premium": "", "commission": "", "notes": "Compliance queries with producer?", "newRenewal": "", "region": "", "status": "Submission", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "denko-trading", "name": "DENKO Trading", "producerId": "khai-gemini-brokers", "region": "HK", "enquiries": [{"id": "denko-trading-16042026", "handler": "EW", "enquiryDate": "25/03/2026", "inceptionDate": "16/04/2026", "currency": "USD", "premium": "400000", "commission": "", "notes": "Questions back with producer? Are we losing the PD?\n\nIncome data: May 2025 \u00a34,917, Jun reversal -\u00a32,424. Net \u00a32,493. Renewal Apr 2026 \u2014 USD 400k premium, currently with Navium (AW Submission).", "newRenewal": "Renewal", "region": "HK", "status": "AW Submission", "quoteLeader": "Navium", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "pars-demi-ryolu-i-letmeci-li-i-anoni", "name": "PARS DEM\u0130RYOLU \u0130\u015eLETMEC\u0130L\u0130\u011e\u0130 ANON\u0130M \u015e\u0130RKET\u0130", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "pars-demi-ryolu-i-letmec-07042026", "handler": "KE", "enquiryDate": "25/03/2026", "inceptionDate": "07/04/2026", "currency": "EUR", "premium": "19500", "commission": "3900", "notes": "BOUND", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "Freeboard", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "forestal-del-sur", "name": "Forestal del Sur", "producerId": "strada-consulting", "region": "", "enquiries": [{"id": "forestal-del-sur-29042026", "handler": "KE", "enquiryDate": "N/A", "inceptionDate": "29/04/2026", "currency": "", "premium": "", "commission": "", "notes": "Producer: Strada Consulting (Pietro Sarti). Accounting flows through MDS Corredores de Reaseguros SA.\nRenewal information has been sent in by Pietro Sarti\n\nIncome data: Multiple MDS entries 2025/26. Renewal info received from Pietro Sarti. Apr 2026 inception.", "newRenewal": "Renewal", "region": "", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "tradezone", "name": "Tradezone", "producerId": "integra", "region": "", "enquiries": [{"id": "tradezone-01052026", "handler": "KE", "enquiryDate": "02/04/2026", "inceptionDate": "01/05/2026", "currency": "", "premium": "", "commission": "", "notes": "W/Josh", "newRenewal": "Renewal", "region": "", "status": "Renewal pending", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "paptrans", "name": "Paptrans", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "paptrans-03052026", "handler": "KE", "enquiryDate": "N/A", "inceptionDate": "03/05/2026", "currency": "EUR", "premium": "", "commission": "", "notes": "Renewal invite sent", "newRenewal": "Renewal", "region": "Turkey", "status": "Renewal pending", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "jefo-nutrition-bor-moved-away-from-l", "name": "Jefo Nutrition (BOR moved away from Langelier)", "producerId": "lareau", "region": "", "enquiries": [{"id": "jefo-nutrition-bor-moved-19052026", "handler": "KE", "enquiryDate": "N/A", "inceptionDate": "19/05/2026", "currency": "", "premium": "", "commission": "", "notes": "\n\nIncome data: Jun 2025 \u00a318,370. Renewal due May 2026 \u2014 broker moved from Langelier to Lareau/BOR.", "newRenewal": "Renewal", "region": "", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "semillas-batlle", "name": "Semillas Batlle", "producerId": "arb-international", "region": "", "enquiries": [{"id": "semillas-batlle-31052026", "handler": "KE", "enquiryDate": "", "inceptionDate": "31/05/2026", "currency": "", "premium": "", "commission": "", "notes": "", "newRenewal": "Renewal", "region": "", "status": "Renewal pending", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "dfds-poland", "name": "DFDS Poland", "producerId": "integra", "region": "", "enquiries": [{"id": "dfds-poland-31052026", "handler": "KE", "enquiryDate": "", "inceptionDate": "31/05/2026", "currency": "", "premium": "", "commission": "", "notes": "\n\nIncome data: Jul 2025 \u00a35,893. Feb/Mar 2026 near-zero.", "newRenewal": "Renewal", "region": "", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "image-trust", "name": "Image Trust", "producerId": "rt-specialty", "region": "", "enquiries": [{"id": "image-trust-08062026", "handler": "KE", "enquiryDate": "", "inceptionDate": "08/06/2026", "currency": "", "premium": "", "commission": "", "notes": "\n\nIncome data: Jul 2025 \u00a31,072. Renewal Jun 2026.", "newRenewal": "Renewal", "region": "", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "sumex-america-corp", "name": "SUMEX AMERICA CORP", "producerId": "argentum-re", "region": "", "enquiries": [{"id": "sumex-america-corp-ASAP", "handler": "EW", "enquiryDate": "06/04/2026", "inceptionDate": "ASAP", "currency": "USD", "premium": "20000", "commission": "2500", "notes": "C Hardy working on it.", "newRenewal": "", "region": "", "status": "Submission", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "patria-seguros-y-reaseguros-paraguay", "name": "PATRIA SEGUROS Y REASEGUROS (PARAGUAY) - O/A: PY FOODS", "producerId": "jnp-re", "region": "", "enquiries": [{"id": "patria-seguros-y-reasegu-ASAP", "handler": "EW", "enquiryDate": "01/04/2026", "inceptionDate": "ASAP", "currency": "", "premium": "", "commission": "", "notes": "", "newRenewal": "", "region": "", "status": "Submission", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "mon-meros-colombo-venezolanos-s-a", "name": "Mon\u00f3meros Colombo Venezolanos S.A", "producerId": "strada-consulting", "region": "", "enquiries": [{"id": "mon-meros-colombo-venezo-ASAP", "handler": "EW", "enquiryDate": "06/04/2026", "inceptionDate": "ASAP", "currency": "", "premium": "", "commission": "", "notes": "W/ Compliance and Translation team", "newRenewal": "", "region": "", "status": "Submission", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "grupo-titanio", "name": "Grupo Titanio", "producerId": "strada-consulting", "region": "", "enquiries": [{"id": "grupo-titanio-ASAP", "handler": "EW", "enquiryDate": "", "inceptionDate": "ASAP", "currency": "", "premium": "", "commission": "", "notes": "", "newRenewal": "", "region": "", "status": "Submission", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "silleno-cargo-project-cargo", "name": "Silleno Cargo - Project Cargo", "producerId": "energy-london", "region": "", "enquiries": [{"id": "silleno-cargo-project-ca-ASAP", "handler": "EW", "enquiryDate": "", "inceptionDate": "ASAP", "currency": "", "premium": "", "commission": "", "notes": "", "newRenewal": "", "region": "", "status": "Submission", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "euromaster", "name": "EUROMASTER", "producerId": "strada-consulting", "region": "", "enquiries": [{"id": "euromaster-ASAP", "handler": "EW", "enquiryDate": "02/04/2026", "inceptionDate": "ASAP", "currency": "", "premium": "", "commission": "", "notes": "", "newRenewal": "", "region": "", "status": "Submission", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "lx-pantos-logistics-panama-s-a-2026-", "name": "LX Pantos Logistics Panama, S.A.\u00a02026 - Stock-only Quote Invitation - Panama", "producerId": "momentum", "region": "", "enquiries": [{"id": "lx-pantos-logistics-pana-ASAP", "handler": "EW", "enquiryDate": "25/03/2026", "inceptionDate": "ASAP", "currency": "USD", "premium": "95000", "commission": "", "notes": "Awaiting on feedback?", "newRenewal": "", "region": "", "status": "Submission", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "yapi-merkezi", "name": "Yapi Merkezi", "producerId": "integra", "region": "", "enquiries": [{"id": "yapi-merkezi-08042026", "handler": "MM/EW", "enquiryDate": "08/04/2026", "inceptionDate": "", "currency": "", "premium": "", "commission": "", "notes": "", "newRenewal": "", "region": "", "status": "Submission", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "korver-ffl", "name": "KORVER - FFL", "producerId": "integra", "region": "", "enquiries": [{"id": "korver-ffl-asap", "handler": "MM", "enquiryDate": "25/03/2026", "inceptionDate": "asap", "currency": "", "premium": "", "commission": "", "notes": "FB declined due to project/oversized/specialsit loads ooa", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "ship-rooster-ai-inc", "name": "Ship Rooster AI Inc", "producerId": "rt-specialty", "region": "USA", "enquiries": [{"id": "ship-rooster-ai-inc-01092025", "handler": "MM/EW", "enquiryDate": "01/09/2025", "inceptionDate": "01/09/2025", "currency": "USD", "premium": "15000", "commission": "1500", "notes": "QUOTED - terms sent to Producer, awaiting feedback, chased 11/02 and confirmed still awaiting decision / KE Chased 20/02 / hold open", "newRenewal": "New", "region": "USA", "status": "Quoted", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "origin-fevzi-gandur", "name": "Origin Fevzi Gandur", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "origin-fevzi-gandur-27112025", "handler": "KE", "enquiryDate": "27/10/2025", "inceptionDate": "27/11/2025", "currency": "EUR", "premium": "150000", "commission": "", "notes": "Cargo Liability RI via Freeboard Maritime binder. USD 2M limit each claim. Additional insureds include full Fevzi Gandur group entities. USD 150,000 premium.", "newRenewal": "New", "region": "Turkey", "status": "Bound", "quoteLeader": "Freeboard Maritime", "cedant": "Anadolu Sigorta A.\u015e.", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}, "placement": {"id": "origin-fgl-cli-2025-26", "period": "27 Nov 2025 \u2013 27 Nov 2026", "type": "Cargo Liability Reinsurance", "currency": "USD", "overseasBroker": "Integra (via Freeboard Maritime binder B1145M241254)", "totalPremium": 150000, "notes": "Cargo liability policy via Freeboard Maritime binder. Additional insureds: Fevzi Gandur Uluslararas\u0131 Lojistik, Stella Gemi, Worldwide E-ticaret, Fevzi Gandur Gemi Acenteli\u011fi, Fevzi Gandur D\u0131\u015f Ticaret, Pharma Care. Forecast gross freight receipts USD 125m.", "layers": [{"id": "origin-fgl-l1", "umr": "E250589", "description": "USD 2,000,000 each claim \u2014 cargo liability", "limitM": 2.0, "attachmentM": 0, "cedant": "Anadolu Sigorta A.\u015e.", "slipLeader": "Freeboard Maritime (Pen Underwriting)", "grossPremium": 150000, "brokerage": 0, "netPremium": 150000, "markets": [{"name": "Lloyd's of London via Freeboard Maritime", "syndicate": "B1145M241254", "written": 100.0, "signed": 100.0, "note": "Line To Stand \u2014 100% Lloyd's of London"}]}]}}], "emails": [], "slips": []}, {"id": "inpasa-grenco-tankage-operation", "name": "Inpasa Grenco - Tankage Operation", "producerId": "oneglobal-brazil", "region": "Brazil", "enquiries": [{"id": "inpasa-grenco-tankage-op-23102025", "handler": "KE", "enquiryDate": "23/10/2025", "inceptionDate": "23/10/2025", "currency": "USD", "premium": "", "commission": "4000", "notes": "Quoted 17/11 - Latest chase 08/12 - crickets (will close for now)", "newRenewal": "N", "region": "Brazil", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "the-bruery-llc-et-al", "name": "The Bruery, LLC; et al", "producerId": "hull-co", "region": "UK", "enquiries": [{"id": "the-bruery-llc-et-al-13122025", "handler": "JK", "enquiryDate": "23/10/2025", "inceptionDate": "13/12/2025", "currency": "USD", "premium": "", "commission": "2100", "notes": "Local broker cheaper", "newRenewal": "N", "region": "UK", "status": "Dead", "quoteLeader": "Contour", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "glengyle", "name": "Glengyle", "producerId": "houlders", "region": "Hong Kong", "enquiries": [{"id": "glengyle-24102025", "handler": "KE", "enquiryDate": "24/10/2025", "inceptionDate": "24/10/2025", "currency": "", "premium": "200000", "commission": "20000", "notes": "Leader terms provided - gone quiet.", "newRenewal": "N", "region": "Hong Kong", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "universal-acarsan-group", "name": "Universal Acarsan Group", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "universal-acarsan-group-30112025", "handler": "KE", "enquiryDate": "20/11/2025", "inceptionDate": "30/11/2025", "currency": "USD", "premium": "0", "commission": "0", "notes": "55M of stock in Iraq - request for clarifications sent. Awaiting data. - chased 16/12 no info", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "N/A", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "la-consolidada-paraguay", "name": "LA CONSOLIDADA (PARAGUAY)", "producerId": "jnp-re", "region": "Paraguay", "enquiries": [{"id": "la-consolidada-paraguay-30112025", "handler": "KE", "enquiryDate": "03/11/2025", "inceptionDate": "30/11/2025", "currency": "USD", "premium": "0", "commission": "0", "notes": "Have asked for full proposal. Kether chased on 26.11.", "newRenewal": "New", "region": "Paraguay", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "sunar-misir-stp", "name": "SUNAR MISIR STP", "producerId": "integra", "region": "", "enquiries": [{"id": "sunar-misir-stp-27102025", "handler": "KE", "enquiryDate": "27/10/2025", "inceptionDate": "27/10/2025", "currency": "EUR", "premium": "300000", "commission": "30000", "notes": "Quoted - chasing feedback", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "Fiducia", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "byd-mexico", "name": "BYD Mexico", "producerId": "sky-re", "region": "", "enquiries": [{"id": "byd-mexico-01112025", "handler": "EW", "enquiryDate": "28/10/2025", "inceptionDate": "01/11/2025", "currency": "USD", "premium": "", "commission": "30000", "notes": "Quoted/Looking for front - closed subject to Sky Re finding fronting solution 16/12", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "Landmark", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "muresa-intertrade", "name": "Muresa Intertrade", "producerId": "momentum", "region": "Panama", "enquiries": [{"id": "muresa-intertrade-09122025", "handler": "KE", "enquiryDate": "12/11/2025", "inceptionDate": "09/12/2025", "currency": "USD", "premium": "40000", "commission": "4000", "notes": "Quoted. Chased on 02 Dec 2025.", "newRenewal": "New", "region": "Panama", "status": "Bound", "quoteLeader": "Fiducia", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "precision-citrus-hedging", "name": "Precision Citrus Hedging", "producerId": "rt-specialty", "region": "", "enquiries": [{"id": "precision-citrus-hedging-09122025", "handler": "KE", "enquiryDate": "30/10/2025", "inceptionDate": "09/12/2025", "currency": "USD", "premium": "", "commission": "", "notes": "Contractors Plant & Equipment - Seeking solution", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "cooprocarcat-mining-cooperative-coal", "name": "COOPROCARCAT MINING COOPERATIVE (Coal)", "producerId": "oneglobal-colombia", "region": "", "enquiries": [{"id": "cooprocarcat-mining-coop-31102025", "handler": "EW", "enquiryDate": "31/10/2025", "inceptionDate": "31/10/2025", "currency": "USD", "premium": "", "commission": "", "notes": "Have asked for full proposal from Jorge - not received as at 16/12", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "rush-golfscapes-llc-cpe", "name": "RUSH  Golfscapes, LLC CPE", "producerId": "rt-specialty", "region": "", "enquiries": [{"id": "rush-golfscapes-llc-cpe-31102025", "handler": "KE", "enquiryDate": "31/10/2025", "inceptionDate": "31/10/2025", "currency": "USD", "premium": "", "commission": "", "notes": "Contractors Plant & Equipment - Seeking solution", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "slb-equipment-list-of-trailers", "name": "SLB Equipment list of trailers", "producerId": "rt-specialty", "region": "", "enquiries": [{"id": "slb-equipment-list-of-tr-31102025", "handler": "KE", "enquiryDate": "31/10/2025", "inceptionDate": "31/10/2025", "currency": "USD", "premium": "", "commission": "", "notes": "Contractors Plant & Equipment - Seeking solution", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "ygl-lojistik", "name": "YGL Lojistik", "producerId": "kmc", "region": "Turkey", "enquiries": [{"id": "ygl-lojistik-11122025", "handler": "KE", "enquiryDate": "12/12/2025", "inceptionDate": "11/12/2025", "currency": "EUR", "premium": "0", "commission": "0", "notes": "UW's questions have been sent over to the client - no reply -closing file", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "Freeboard", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "chalhoub-group", "name": "Chalhoub Group", "producerId": "oneglobal-dubai", "region": "", "enquiries": [{"id": "chalhoub-group-01122025", "handler": "EW", "enquiryDate": "03/11/2025", "inceptionDate": "01/12/2025", "currency": "USD", "premium": "", "commission": "30000", "notes": "Discussed with Starr & RSA. Eva been chased for key information.", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "Fiducia", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "fuelpar", "name": "FUELPAR", "producerId": "jnp-re", "region": "Bolivia", "enquiries": [{"id": "fuelpar-22122025", "handler": "EW", "enquiryDate": "16/12/2025", "inceptionDate": "22/12/2025", "currency": "USD", "premium": "15000", "commission": "1500", "notes": "Indicated on 16 Dec 2025. Put a draft quote slip across to him - no reply as at 05/01/26 so closing", "newRenewal": "New", "region": "Bolivia", "status": "Dead", "quoteLeader": "Fiducia.", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "erkport", "name": "ERKPort", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "erkport-30122025", "handler": "KE", "enquiryDate": "11/12/2025", "inceptionDate": "30/12/2025", "currency": "USD", "premium": "750000", "commission": "75000", "notes": "Cars - primary indication with Joe Danphal - local market (Axa) super cheap - closed", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "Landmark", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "etanoles-del-magdalena", "name": "Etanoles Del Magdalena", "producerId": "oneglobal-colombia", "region": "Colombia", "enquiries": [{"id": "etanoles-del-magdalena-31122025", "handler": "EW", "enquiryDate": "07/11/2025", "inceptionDate": "31/12/2025", "currency": "USD", "premium": "10000", "commission": "1000", "notes": "Chased Quote Feedback 01/12 -cedants have issues with Fiducia - no feedback so closing", "newRenewal": "New", "region": "Colombia", "status": "Dead", "quoteLeader": "WISE / Fiducia", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "evolog-nakli-yat-i-hti-yari-ffl-dest", "name": "EVOLOG NAKL\u0130YAT \u0130HT\u0130YAR\u0130 FFL DESTEK TALEB\u0130 HK.", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "evolog-nakli-yat-i-hti-y-31122025", "handler": "KE", "enquiryDate": "03/12/2025", "inceptionDate": "31/12/2025", "currency": "USD", "premium": "115000", "commission": "23000", "notes": "Freeboard indicated $110k with a 12.5k deductible - chased 16/12, 05/01 - closing", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "Freeboard Maritime", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "triangle-commodities-trading", "name": "TRIANGLE COMMODITIES TRADING", "producerId": "oneglobal-dubai", "region": "", "enquiries": [{"id": "triangle-commodities-tra-05112025", "handler": "EW", "enquiryDate": "05/11/2025", "inceptionDate": "05/11/2025", "currency": "USD", "premium": "", "commission": "2500", "notes": "Awaiting information. Ed chased on 26.11.2025 & 02.12.2025", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "N/A", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "irmak-warehousing", "name": "Irmak Warehousing", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "irmak-warehousing-31122025", "handler": "KE", "enquiryDate": "16/12/2025", "inceptionDate": "31/12/2025", "currency": "EUR", "premium": "150000", "commission": "30000", "notes": "Primary EUR 25M quoted - (options needed for 25M X 25 and 55M X 25M)", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "50% Contour", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "logitrans", "name": "Logitrans", "producerId": "kmc", "region": "Turkey", "enquiries": [{"id": "logitrans-31122025", "handler": "KE", "enquiryDate": "16/12/2025", "inceptionDate": "31/12/2025", "currency": "", "premium": "0", "commission": "0", "notes": "Too claims intensive for London - Nil deductible - closing", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "nasser-bin-abdullatif-alserkal-group", "name": "Nasser Bin Abdullatif Alserkal Group (Tyres)", "producerId": "oneglobal-dubai", "region": "UAE", "enquiries": [{"id": "nasser-bin-abdullatif-al-31122025", "handler": "EW", "enquiryDate": "27/11/2025", "inceptionDate": "31/12/2025", "currency": "USD", "premium": "200000", "commission": "20000", "notes": "Unable to compete with regional market deductibles and pricing.", "newRenewal": "New", "region": "UAE", "status": "Dead", "quoteLeader": "Fiducia.", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "natural-ag-solutions-llc", "name": "Natural AG Solutions, LLC,", "producerId": "rt-specialty", "region": "", "enquiries": [{"id": "natural-ag-solutions-llc-01122025", "handler": "KE", "enquiryDate": "17/11/2025", "inceptionDate": "01/12/2025", "currency": "USD", "premium": "", "commission": "0", "notes": "For Property", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "vital-planet-llc", "name": "Vital Planet LLC", "producerId": "rt-specialty", "region": "", "enquiries": [{"id": "vital-planet-llc-11122025", "handler": "KE", "enquiryDate": "17/11/2025", "inceptionDate": "11/12/2025", "currency": "", "premium": "", "commission": "", "notes": "Contour advise far too cheap", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "name-tbc-childrens-arts-supplies", "name": "Name TBC (Childrens Arts supplies)", "producerId": "rt-specialty", "region": "USA", "enquiries": [{"id": "name-tbc-childrens-arts--31122025", "handler": "EW", "enquiryDate": "19/11/2025", "inceptionDate": "31/12/2025", "currency": "USD", "premium": "0", "commission": "0", "notes": "Not Quoted - Not Required", "newRenewal": "New", "region": "USA", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "kupfer-hnos", "name": "Kupfer HNOS", "producerId": "strada-consulting", "region": "Chile", "enquiries": [{"id": "kupfer-hnos-31122025", "handler": "EW", "enquiryDate": "18/11/2025", "inceptionDate": "31/12/2025", "currency": "USD", "premium": "225000", "commission": "22500", "notes": "$225k VVRI from Fiducia - claims record shit - asked for RM deets 02/12", "newRenewal": "New", "region": "Chile", "status": "Dead", "quoteLeader": "Fiducia", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "sutton-services-llc", "name": "Sutton Services LLC", "producerId": "rt-specialty", "region": "", "enquiries": [{"id": "sutton-services-llc-19112025", "handler": "KE", "enquiryDate": "19/11/2025", "inceptionDate": "19/11/2025", "currency": "", "premium": "", "commission": "", "notes": "Local retailer radio silence", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "akikb-minibodegas-spa", "name": "AKIKB MINIBODEGAS SPA", "producerId": "lillenfeld", "region": "", "enquiries": [{"id": "akikb-minibodegas-spa-20112025", "handler": "KE", "enquiryDate": "20/11/2025", "inceptionDate": "20/11/2025", "currency": "", "premium": "", "commission": "", "notes": "Storage facilities. Queries out with producer. Yellow storage esq. -silence / closing 16/12", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "euroherc-insurance", "name": "Euroherc Insurance", "producerId": "fortus-inter-partes", "region": "", "enquiries": [{"id": "euroherc-insurance-20112025", "handler": "KE", "enquiryDate": "20/11/2025", "inceptionDate": "20/11/2025", "currency": "USD", "premium": "", "commission": "10000", "notes": "Bought Locally", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "sunwoda-mobility-energy-technology-c", "name": "SUNWODA MOBILITY ENERGY TECHNOLOGY CO., LTD", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "sunwoda-mobility-energy--20112025", "handler": "KE", "enquiryDate": "20/11/2025", "inceptionDate": "20/11/2025", "currency": "", "premium": "", "commission": "", "notes": "With UW's 25/11/2025. Quoted. Placed locally", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "N/A", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "orion-ffl-tekli-f-talebi-hk", "name": "ORION FFL TEKL\u0130F TALEB\u0130 HK", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "orion-ffl-tekli-f-talebi-31122025", "handler": "KE", "enquiryDate": "09/12/2025", "inceptionDate": "31/12/2025", "currency": "EUR", "premium": "11500", "commission": "2300", "notes": "Quoted 17/12, No feedback as at 05/01 so closing file.", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "Freeboard Maritime", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "unimog", "name": "UNIMOG", "producerId": "sky-re", "region": "", "enquiries": [{"id": "unimog-21112025", "handler": "EW", "enquiryDate": "21/11/2025", "inceptionDate": "21/11/2025", "currency": "USD", "premium": "", "commission": "", "notes": "AMP Quoted. Chased on 16.12.2025", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "seafrost", "name": "Seafrost", "producerId": "oneglobal-peru", "region": "Peru", "enquiries": [{"id": "seafrost-31122025", "handler": "EW", "enquiryDate": "28/10/2025", "inceptionDate": "31/12/2025", "currency": "USD", "premium": "150000", "commission": "15000", "notes": "Quoted - OGB Peru still working with cedant 15/12 - no reply for over a month closed file as at 05/01/26", "newRenewal": "New", "region": "Peru", "status": "Dead", "quoteLeader": "Fiducia", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "servicio-huan-maro-s-a-de-c-v", "name": "Servicio Huan\u00edmaro, S.A. de C.V.,", "producerId": "sky-re", "region": "Mexico", "enquiries": [{"id": "servicio-huan-maro-s-a-d-31122025", "handler": "EW", "enquiryDate": "25/11/2025", "inceptionDate": "31/12/2025", "currency": "USD", "premium": "20000", "commission": "2000", "notes": "Quoted 15/12/25 , no feedback as at 05/01/2026 so closing", "newRenewal": "New", "region": "Mexico", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "jacob-jacob", "name": "JACOB & JACOB", "producerId": "sky-re", "region": "", "enquiries": [{"id": "jacob-jacob-01122025", "handler": "EW", "enquiryDate": "29/11/2025", "inceptionDate": "01/12/2025", "currency": "USD", "premium": "", "commission": "1000", "notes": "Indicated on 01/12/2025. Ed chased on 04.12.2025.", "newRenewal": "", "region": "", "status": "Dead", "quoteLeader": "Fiducia.", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "yalova-roro-excess-whll", "name": "YALOVA RORO EXCESS WHLL", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "yalova-roro-excess-whll-31122025", "handler": "KE", "enquiryDate": "04/11/2025", "inceptionDate": "31/12/2025", "currency": "EUR", "premium": "135000", "commission": "27000", "notes": "Quoted - Integra pushing for order 09/12 - Feedback is that this is expensive although they do not have other quotes", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "Contour 50%", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "innospace-do-brasil-ltd", "name": "Innospace do Brasil Ltd", "producerId": "oneglobal-brazil", "region": "Brazil", "enquiries": [{"id": "innospace-do-brasil-ltd-31122025", "handler": "MM", "enquiryDate": "22/12/2025", "inceptionDate": "31/12/2025", "currency": "USD", "premium": "0", "commission": "0", "notes": "Sent over to Christian Warren, not one for us.", "newRenewal": "New", "region": "Brazil", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "ody-lojistik", "name": "ODY Lojistik", "producerId": "kmc", "region": "Turkey", "enquiries": [{"id": "ody-lojistik-31122025", "handler": "KE", "enquiryDate": "10/12/2025", "inceptionDate": "31/12/2025", "currency": "EUR", "premium": "0", "commission": "0", "notes": "Info not provided - closing files", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "akar-i-ve-d-tic-ltd-ti", "name": "AKAR \u0130\u00e7 ve D\u0131\u015f Tic. Ltd. \u015eti.", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "akar-i-ve-d-tic-ltd-ti-22122025", "handler": "KE", "enquiryDate": "03/12/2025", "inceptionDate": "22/12/2025", "currency": "", "premium": "", "commission": "", "notes": "Too much Russia / Ukraine exposure to quote", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "Freeboard Maritime", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "asav-ffl", "name": "Asav FFL", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "asav-ffl-15122025", "handler": "KE", "enquiryDate": "08/12/2025", "inceptionDate": "15/12/2025", "currency": "EUR", "premium": "33000", "commission": "", "notes": "Producer has requested to bind coverage as of 15/12", "newRenewal": "New", "region": "Turkey", "status": "Bound", "quoteLeader": "Freeboard Maritime", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "gemlik-cargo-plus-war", "name": "Gemlik Cargo plus War", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "gemlik-cargo-plus-war-08122025", "handler": "KE", "enquiryDate": "08/12/2025", "inceptionDate": "08/12/2025", "currency": "USD", "premium": "", "commission": "", "notes": "Too small to quote", "newRenewal": "New", "region": "Turkey", "status": "Dead", "quoteLeader": "N/A", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "cma-paraguay-s-a", "name": "CMA Paraguay S.A.", "producerId": "jnp-re", "region": "Paraguay", "enquiries": [{"id": "cma-paraguay-s-a-01012026", "handler": "KE", "enquiryDate": "01/12/2025", "inceptionDate": "01/01/2026", "currency": "USD", "premium": "25000", "commission": "2500", "notes": "Quoted 25,000 10/12 - only 39% order / have asked for local slip 16/12", "newRenewal": "New", "region": "Paraguay", "status": "Dead", "quoteLeader": "Fidcuia", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "fevzi-gandur-whll", "name": "Fevzi Gandur - WHLL", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "fevzi-gandur-whll-27112025", "handler": "KE", "enquiryDate": "27/10/2025", "inceptionDate": "27/11/2025", "currency": "EUR", "premium": "22500", "commission": "4500", "notes": "Quoted - Integra presenting 18/11 - chased 16/12 - Integra working on FO", "newRenewal": "New", "region": "Turkey", "status": "Bound", "quoteLeader": "Contour / Landmark", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "tlm-ffl", "name": "TLM FFL", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "tlm-ffl-31122025", "handler": "EW", "enquiryDate": "23/12/2025", "inceptionDate": "31/12/2025", "currency": "USD", "premium": "12000", "commission": "", "notes": "Firm Order in. Awaiting Freeboard docs.", "newRenewal": "New", "region": "Turkey", "status": "Bound", "quoteLeader": "Freeboard Maritime", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "ekol-lojistik-as", "name": "Ekol Lojistik AS", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "ekol-lojistik-as-income", "handler": "KE", "enquiryDate": "", "inceptionDate": "01/07/2026", "currency": "EUR", "premium": "1013000", "commission": "", "notes": "WHLL programme \u2014 4 layers, 4 cedants. EUR 1,013,000 total gross premium. EUR 799,200 net to markets. Nil loss history to layer.", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}, "placement": {"id": "ekol-whll-2025-26", "period": "1 Jul 2025 \u2013 30 Jun 2026", "type": "Excess Warehouse Legal Liability Reinsurance", "currency": "EUR", "overseasBroker": "Integra Sigorta ve Reas\u00fcrans Brokerli\u011fi A.\u015e.", "totalPremium": 1013000, "layers": [{"id": "ekol-l1", "umr": "B1743ONEMC2515185", "description": "EUR 100M xs EUR 100M", "limitM": 100, "attachmentM": 100, "cedant": "HDI Sigorta", "slipLeader": "CNA Hardy", "grossPremium": 183000, "brokerage": 20.0, "netPremium": 146400, "markets": [{"name": "CNA Hardy", "syndicate": "0382", "written": 15.0, "signed": 13.96}, {"name": "MS Amlin", "syndicate": "2001", "written": 12.5, "signed": 11.63}, {"name": "Everest", "syndicate": "2786", "written": 10.0, "signed": 9.3}, {"name": "Talbot", "syndicate": "1183", "written": 15.0, "signed": 13.95}, {"name": "Markel", "syndicate": "3000", "written": 15.0, "signed": 13.95}, {"name": "Canopius", "syndicate": "4444", "written": 7.5, "signed": 6.98}, {"name": "Ark", "syndicate": "4020", "written": 10.0, "signed": 9.3}, {"name": "Aviva", "syndicate": "4044019", "written": 10.0, "signed": 9.3}, {"name": "Berkshire Hathaway Specialty", "syndicate": "off-platform", "written": 7.5, "signed": 6.98}, {"name": "Freeboard Maritime", "syndicate": "off-platform", "written": 5.0, "signed": 4.65}]}, {"id": "ekol-l2", "umr": "B1743ONEMC2516060", "description": "EUR 200M xs EUR 200M", "limitM": 200, "attachmentM": 200, "cedant": "Turkiye Sigorta A.\u015e.", "slipLeader": "Navium Marine", "grossPremium": 260000, "brokerage": 26.5, "netPremium": 191100, "markets": [{"name": "Navium / Fidelis", "syndicate": "NAV", "written": 15.0, "signed": 12.78}, {"name": "AXIS", "syndicate": "1686", "written": 15.0, "signed": 12.77}, {"name": "Allied World", "syndicate": "2232", "written": 7.5, "signed": 6.38}, {"name": "The Hartford", "syndicate": "1221", "written": 7.5, "signed": 6.38}, {"name": "Convex", "syndicate": "C9800", "written": 10.0, "signed": 8.51}, {"name": "Arch", "syndicate": "AAL2012/ASL1955", "written": 7.5, "signed": 6.38}, {"name": "Lancashire", "syndicate": "LRE9329", "written": 7.5, "signed": 6.38}, {"name": "Ascot", "syndicate": "ASC4872", "written": 10.0, "signed": 8.51}, {"name": "Hiscox", "syndicate": "033", "written": 10.0, "signed": 8.51}, {"name": "Chubb", "syndicate": "2488", "written": 20.0, "signed": 17.02}, {"name": "Antares", "syndicate": "1274", "written": 7.5, "signed": 6.38}]}, {"id": "ekol-l3", "umr": "B1743ONEMC2540509", "description": "EUR 45M xs EUR 5M", "limitM": 45, "attachmentM": 5, "cedant": "T\u00fcrkiye Sigorta A.\u015e.", "slipLeader": "Chubb (CGM 2488)", "grossPremium": 390000, "brokerage": 19.0, "netPremium": 315900, "markets": [{"name": "Chubb", "syndicate": "2488", "written": 15.0, "signed": 11.77}, {"name": "Convex", "syndicate": "C9800", "written": 10.0, "signed": 7.85}, {"name": "Argenta", "syndicate": "2121", "written": 5.0, "signed": 3.93}, {"name": "Markel", "syndicate": "3000", "written": 15.0, "signed": 11.76}, {"name": "IQUW", "syndicate": "1856", "written": 10.0, "signed": 7.84}, {"name": "Canopius", "syndicate": "4444", "written": 5.0, "signed": 3.92}, {"name": "AXIS", "syndicate": "1686", "written": 10.0, "signed": 7.84}, {"name": "Talbot", "syndicate": "1183", "written": 10.0, "signed": 7.84}, {"name": "Hiscox", "syndicate": "033", "written": 10.0, "signed": 7.84}, {"name": "Freeboard Maritime", "syndicate": "off-platform", "written": 20.0, "signed": 15.69}, {"name": "Landmark Chelsea / AMFirst", "syndicate": "off-platform", "written": 7.5, "signed": 5.88}, {"name": "Contour", "syndicate": "off-platform", "written": 10.0, "signed": 7.84}]}, {"id": "ekol-l4", "umr": "B1743ONEMC2576888", "description": "EUR 50M xs EUR 50M", "limitM": 50, "attachmentM": 50, "cedant": "AK Sigorta A.S.", "slipLeader": "Navium Marine", "grossPremium": 180000, "brokerage": 19.0, "netPremium": 145800, "markets": [{"name": "Navium / Fidelis", "syndicate": "NAV", "written": 25.0, "signed": 22.73}, {"name": "Chaucer", "syndicate": "C9701", "written": 20.0, "signed": 18.18}, {"name": "Argenta", "syndicate": "2121", "written": 10.0, "signed": 9.09}, {"name": "CNA Hardy", "syndicate": "0382", "written": 15.0, "signed": 13.64}, {"name": "IQUW", "syndicate": "1856", "written": 20.0, "signed": 18.18}, {"name": "Chubb", "syndicate": "2488", "written": 20.0, "signed": 18.18}]}]}}], "emails": [], "slips": []}, {"id": "sunel-tobacco", "name": "Sunel Tobacco", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "sunel-tobacco-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Renews later 2026", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "tiryaki-agro-gida-sanayi-ve-ticaret-", "name": "Tiryaki Agro Gida Sanayi Ve Ticaret A.S.", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "tiryaki-agro-gida-sanayi-ve-ticaret--income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Jan, Feb, Dec 2025 bookings. Dec \u00a32,932.", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "gefco-tasimacilik-ve-lojistik-as", "name": "Gefco Tasimacilik Ve Lojistik AS", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "gefco-tasimacilik-ve-lojistik-as-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "EUR", "premium": "", "commission": "", "notes": "Mar 2025 \u00a338,183. Now CEVA \u2014 renewal Apr 2026 \u00a367,167.", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "kayikcioglu-kadoline-trans", "name": "Kayikcioglu Kadoline Trans", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "kayikcioglu-kadoline-trans-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "EUR", "premium": "", "commission": "", "notes": "May 2025 booking, Jun reversal. Net zero.\nCancelled ab initio", "newRenewal": "Renewal", "region": "Turkey", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "dnt-uluslararasi-nakliye", "name": "DNT Uluslararasi Nakliye", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "dnt-uluslararasi-nakliye-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "EUR", "premium": "", "commission": "", "notes": "Jul 2025 \u00a37,403.\nJuly 2026 renewal", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "gumustas-lojistik", "name": "Gumustas Lojistik", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "gumustas-lojistik-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "EUR", "premium": "", "commission": "", "notes": "Jul 2025 \u00a32,435. Aug zero.\n2026 renewal expected", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "hakan-gida", "name": "Hakan Gida", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "hakan-gida-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Jul/Aug/Sep 2025 \u2014 all negative adjustments. Net -\u00a33,989.", "newRenewal": "Renewal", "region": "Turkey", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "asbas-marine", "name": "Asbas Marine", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "asbas-marine-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Renews later 2026", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "metal-market-international", "name": "Metal Market International", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "metal-market-international-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Dec 2025 \u00a39,615.", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "origin-fgl-lojistik-a-s", "name": "Origin FGL Lojistik A.S", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "origin-fgl-lojistik-a-s-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Same risk as Origin Fevzi Gandur \u2014 cargo liability RI via Freeboard Maritime. USD 150,000 premium. Dec 2025 income: \u00a322,425.", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "Anadolu Sigorta A.\u015e.", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}, "placement": {"id": "origin-fgl-cli-2025-26", "period": "27 Nov 2025 \u2013 27 Nov 2026", "type": "Cargo Liability Reinsurance", "currency": "USD", "overseasBroker": "Integra (via Freeboard Maritime binder B1145M241254)", "totalPremium": 150000, "notes": "Cargo liability policy via Freeboard Maritime binder. Additional insureds: Fevzi Gandur Uluslararas\u0131 Lojistik, Stella Gemi, Worldwide E-ticaret, Fevzi Gandur Gemi Acenteli\u011fi, Fevzi Gandur D\u0131\u015f Ticaret, Pharma Care. Forecast gross freight receipts USD 125m.", "layers": [{"id": "origin-fgl-l1", "umr": "E250589", "description": "USD 2,000,000 each claim \u2014 cargo liability", "limitM": 2.0, "attachmentM": 0, "cedant": "Anadolu Sigorta A.\u015e.", "slipLeader": "Freeboard Maritime (Pen Underwriting)", "grossPremium": 150000, "brokerage": 0, "netPremium": 150000, "markets": [{"name": "Lloyd's of London via Freeboard Maritime", "syndicate": "B1145M241254", "written": 100.0, "signed": 100.0, "note": "Line To Stand \u2014 100% Lloyd's of London"}]}]}}], "emails": [], "slips": []}, {"id": "tlc-klima-san-ve-tic-a-s", "name": "TLC Klima San. Ve Tic. A.S.", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "tlc-klima-san-ve-tic-a-s-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Renews later 2026", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "cobantur-logistics", "name": "Cobantur Logistics", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "cobantur-logistics-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "EUR", "premium": "", "commission": "", "notes": "Feb 2026 \u00a36,005.", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "sasa-polyester", "name": "SASA Polyester", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "sasa-polyester-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Feb 2026 \u00a34,625.", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "tech-enerji-danismanlik-ltd-sti", "name": "Tech Enerji Danismanlik Ltd STI", "producerId": "integra", "region": "Turkey", "enquiries": [{"id": "tech-enerji-danismanlik-ltd-sti-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "EUR", "premium": "", "commission": "", "notes": "Apr 2026 \u00a31,213.", "newRenewal": "Renewal", "region": "Turkey", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "semex-canada", "name": "Semex Canada", "producerId": "langelier", "region": "Canada", "enquiries": [{"id": "semex-canada-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "CAD", "premium": "", "commission": "", "notes": "Sep 2025 \u00a3368, Dec \u00a3566, Jan 2026 \u00a3464.", "newRenewal": "Renewal", "region": "Canada", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "soline-trading-ltd", "name": "Soline Trading Ltd", "producerId": "langelier", "region": "Canada", "enquiries": [{"id": "soline-trading-ltd-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "CAD", "premium": "", "commission": "", "notes": "Aug 2025 \u00a31,347.\nAugust 2026 renewal expected", "newRenewal": "Renewal", "region": "Canada", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "semex-inc", "name": "Semex Inc", "producerId": "langelier", "region": "Canada", "enquiries": [{"id": "semex-inc-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Feb 2026 \u00a3368. Sister entity to Semex Canada.", "newRenewal": "Renewal", "region": "Canada", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "tole-catalana", "name": "TOLE Catalana", "producerId": "arb-international", "region": "Spain", "enquiries": [{"id": "tole-catalana-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "EUR", "premium": "", "commission": "", "notes": "Jan 2025 \u00a32,096.", "newRenewal": "Renewal", "region": "Spain", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "serradora-boix", "name": "Serradora Boix", "producerId": "arb-international", "region": "Spain", "enquiries": [{"id": "serradora-boix-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "EUR", "premium": "", "commission": "", "notes": "Mar 2025 \u00a32,511. Jun reversal. Dec \u00a32,870. ARB Europe.\nCancelled ab initio", "newRenewal": "Renewal", "region": "Spain", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "calconut-sl", "name": "Calconut SL", "producerId": "arb-international", "region": "Spain", "enquiries": [{"id": "calconut-sl-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "EUR", "premium": "", "commission": "", "notes": "Aug \u00a33,032, Sep \u00a3394, Dec \u00a32,870. ARB Europe.", "newRenewal": "Renewal", "region": "Spain", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "mote-marine-laboratory-inc", "name": "Mote Marine Laboratory Inc", "producerId": "rt-specialty", "region": "USA", "enquiries": [{"id": "mote-marine-laboratory-inc-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Mar 2025 \u00a31,941. Jan 2026 \u00a31,855.", "newRenewal": "Renewal", "region": "USA", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "merits-health-products-inc", "name": "Merits Health Products Inc", "producerId": "rt-specialty", "region": "USA", "enquiries": [{"id": "merits-health-products-inc-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Aug 2025 \u00a35,989. Jan 2026 \u00a3103.", "newRenewal": "Renewal", "region": "USA", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "bill-casey-electric-sales-inc", "name": "Bill Casey Electric Sales Inc", "producerId": "rt-specialty", "region": "USA", "enquiries": [{"id": "bill-casey-electric-sales-inc-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Renews later 2026", "newRenewal": "Renewal", "region": "USA", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "vtc-operadora-logistica-ltda", "name": "VTC Operadora Logistica Ltda", "producerId": "bms-brasil", "region": "Brazil", "enquiries": [{"id": "vtc-operadora-logistica-ltda-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Apr 2025 reversal, Jul 2025 \u00a35,880. BMS Brasil.", "newRenewal": "Renewal", "region": "Brazil", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "extrum-sa", "name": "Extrum SA", "producerId": "pacific-insurance", "region": "Chile", "enquiries": [{"id": "extrum-sa-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Mar 2025 \u00a32,620. Jun reversal. Pacific Insurance Brokers.\nCancelled ab initio", "newRenewal": "Renewal", "region": "Chile", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "brimich-logistics-and-packaging-inc", "name": "Brimich Logistics and Packaging Inc", "producerId": "jonasre", "region": "Canada", "enquiries": [{"id": "brimich-logistics-and-packaging-inc-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "CAD", "premium": "", "commission": "", "notes": "JonasRe \u2014 negative 2025. Apr -\u00a3307, May -\u00a34,053. Partner review flagged.\nLost on BOR", "newRenewal": "Renewal", "region": "Canada", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "harvest-marketing-trading-llc", "name": "Harvest Marketing & Trading LLC", "producerId": "charter", "region": "USA", "enquiries": [{"id": "harvest-marketing-trading-llc-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Nov 2025 \u00a37,299. Charter.", "newRenewal": "Renewal", "region": "USA", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "volcafe-uk", "name": "Volcafe UK", "producerId": "volcafe-uk", "region": "UK", "enquiries": [{"id": "volcafe-uk-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "GBP", "premium": "", "commission": "", "notes": "Sep 2025 \u00a3792.\nLocal policy placed as favour \u2014 small fee income", "newRenewal": "Renewal", "region": "UK", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "guy-d-anjou-inc", "name": "Guy D'Anjou Inc", "producerId": "bfl-canada", "region": "Canada", "enquiries": [{"id": "guy-d-anjou-inc-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "CAD", "premium": "", "commission": "", "notes": "Aug 2025 \u00a311. BFL Canada.\nLapsed", "newRenewal": "Renewal", "region": "Canada", "status": "Dead", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "strides-pharma-inc", "name": "Strides Pharma Inc", "producerId": "prudent", "region": "India", "enquiries": [{"id": "strides-pharma-inc-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Feb 2026 \u00a324,279. Prudent Insurance Brokers.", "newRenewal": "Renewal", "region": "India", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "distribeaute-sa", "name": "Distribeaute SA", "producerId": "latam-re", "region": "Canada", "enquiries": [{"id": "distribeaute-sa-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Dec 2025 \u00a31,682 (Oneglobal Colombia). Feb 2026 \u00a31,839 (Latam Re). Feb 2026 reversal -\u00a31,655.", "newRenewal": "Renewal", "region": "Canada", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "yaafar-internacional-s-a", "name": "YAAFAR INTERNACIONAL S.A.", "producerId": "latam-re", "region": "Panama", "enquiries": [{"id": "yaafar-internacional-s-a-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Apr 2026 \u00a38,562. Latam Re.", "newRenewal": "Renewal", "region": "Panama", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "ink-consulting-sarl", "name": "Ink Consulting SARL", "producerId": "ink-consulting", "region": "", "enquiries": [{"id": "ink-consulting-sarl-income", "handler": "", "enquiryDate": "", "inceptionDate": "", "currency": "USD", "premium": "", "commission": "", "notes": "Apr 2026 \u00a310,484.", "newRenewal": "Renewal", "region": "", "status": "Bound", "quoteLeader": "", "cedant": "", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}}], "emails": [], "slips": []}, {"id": "ppaq", "name": "PPAQ \u2014 Producteurs et Productrices Acericoles du Quebec", "producerId": "langelier", "region": "Canada", "enquiries": [{"id": "ppaq-22122025", "handler": "KE", "enquiryDate": "01/12/2024", "inceptionDate": "22/12/2025", "currency": "CAD", "premium": "355279", "commission": "97702", "notes": "STP + Excess Stock. Primary CAD 75M (B1743MC2533330) + 2nd XS CAD 100M xs 75M (B1743MC2597987). Total gross CAD 355,278.76. Brokerage 27.50% both layers. Renewal Dec 2026.", "newRenewal": "Renewal", "region": "Canada", "status": "Bound", "quoteLeader": "Aviva (primary) / Talbot (excess)", "cedant": "La Financi\u00e8re Agricole du Quebec", "postBind": {"eoc": "", "openingMemo": "", "imageRight": "", "eclipse": "", "invoiced": "", "sharepoint": "", "gfr": ""}, "placement": {"id": "ppaq-stp-2025-26", "period": "22 Dec 2025 \u2013 21 Dec 2026", "type": "Stock Throughput + Excess Stock Insurance", "currency": "CAD", "overseasBroker": "Langelier Assurances, 550 Chamble Road Suite 230, Longueuil QC J4H 3L8", "totalPremium": 355279, "notes": "Loss payees: La Financi\u00e8re Agricole du Quebec; La Banque Nationale du Canada; The Maple Treat Corporation. Profit commission 10% on primary. 3 warehouse locations: (1) 326 rue Tanguay Laurierville \u2014 pasteurisation + storage; (2) 1650 route de l'\u00c9glise St-Antoine de Tilly \u2014 storage; (3) 2555 Avenue Alphonse Poulin Plessisville \u2014 storage (att. Apr 2024). Transit: CAD 225k any one conveyance, 42km route, 4 transits/day 6-8 months. Process Exclusion JC2019-005 during pasteurisation \u2014 named perils only. Misappropriation exclusion JC2017/002.", "layers": [{"id": "ppaq-l1", "umr": "B1743MC2533330", "description": "CAD 75,000,000 any one location \u2014 Stock Throughput (primary)", "limitM": 75, "attachmentM": 0, "cedant": "La Financi\u00e8re Agricole du Quebec", "slipLeader": "Aviva Insurance Ltd obo Aviva Insurance Company of Canada (XIS 404403) \u2014 Richard Grant", "grossPremium": 220279, "brokerage": 27.5, "netPremium": 159702, "markets": [{"name": "Aviva / Aviva Canada", "syndicate": "XIS 404403", "written": 20.0, "signed": 20.0, "note": "Slip Leader. Line to stand."}, {"name": "Allied World", "syndicate": "2232 AWH", "written": 7.5, "signed": 6.4655, "note": "Michael Wilks"}, {"name": "Brit", "syndicate": "2987 BRT", "written": 17.5, "signed": 15.0862, "note": "Hannah Clark. Bureau Leader."}, {"name": "Antares", "syndicate": "1274 AUL", "written": 7.5, "signed": 6.4655, "note": "Andy Bridgwood"}, {"name": "AXIS", "syndicate": "1686 AXS", "written": 12.5, "signed": 10.7759, "note": "Joanne Reynolds"}, {"name": "Fidelis", "syndicate": "9584", "written": 17.5, "signed": 17.5, "note": "Lara Janse van Rensburg. Line to stand. Bureau Binder B1735ND0051724."}, {"name": "Tokio Marine HCC", "syndicate": "4141", "written": 10.0, "signed": 8.6207, "note": "Scott Matthews."}, {"name": "Everest", "syndicate": "2786 EVE", "written": 17.5, "signed": 15.0862, "note": "Leigh Meekings"}]}, {"id": "ppaq-l2", "umr": "B1743MC2597987", "description": "CAD 100,000,000 xs CAD 75,000,000 \u2014 Excess Stock Insurance", "limitM": 100, "attachmentM": 75, "cedant": "La Financi\u00e8re Agricole du Quebec", "slipLeader": "Talbot (TAL 1183) \u2014 Tom Lennard", "grossPremium": 135000, "brokerage": 27.5, "netPremium": 97875, "markets": [{"name": "Talbot", "syndicate": "1183 TAL", "written": 15.0, "signed": 15.0, "note": "Slip Leader. Line to stand."}, {"name": "CNA Hardy", "syndicate": "0382 HDU", "written": 12.5, "signed": 11.4131, "note": "Elliot Paul"}, {"name": "Westfield Specialty", "syndicate": "1200 WSM", "written": 12.5, "signed": 11.413, "note": "Safia Pal"}, {"name": "Fidelis", "syndicate": "9584", "written": 32.5, "signed": 32.5, "note": "Lara Janse van Rensburg. Line to stand."}, {"name": "Ark", "syndicate": "4020 ARK", "written": 7.5, "signed": 6.8478, "note": "Francine Rule"}, {"name": "IQUW", "syndicate": "1856 IQU", "written": 15.0, "signed": 13.6957, "note": "Imogen Southcott"}, {"name": "Lancashire", "syndicate": "9329 LRE", "written": 10.0, "signed": 9.1304, "note": "Richard Costain."}]}]}}], "emails": [], "slips": []}]};

function entGetState(){
  const s = gs();
  if(!s.entities){
    s.entities = JSON.parse(JSON.stringify(ENTITIES_SEED));
    ss(s);
  }
  return s.entities;
}

function entSave(ent){ const s=gs(); s.entities=ent; ss(s); }

function entStatusBadge(st){
  return riskStatusBadgeHtml(st);
}

function entLatestEnquiry(ins){
  if(!ins.enquiries||!ins.enquiries.length) return null;
  return ins.enquiries[ins.enquiries.length-1];
}

function renderEntities(){
  (async function(){
    try {
      const q = (document.getElementById('ent-search')||{value:''}).value.toLowerCase().trim();
      const sfRaw = (document.getElementById('ent-status')||{value:''}).value;
      const sf = sfRaw ? canonicalRiskStatus(sfRaw) : '';
      const pf = (document.getElementById('ent-prod-filter')||{value:''}).value;
      const risks = await fetchRiskList({ limit: 1000 });

      const producerMap = {};
      risks.forEach(function(r){
        var key = (r.producer || 'Unknown').trim() || 'Unknown';
        producerMap[key] = true;
      });
      const psel = document.getElementById('ent-prod-filter');
      if(psel && psel.options.length===1){
        Object.keys(producerMap).sort().forEach(function(name){
          var o=document.createElement('option'); o.value=name; o.textContent=name; psel.appendChild(o);
        });
      }

      let filtered = risks.filter(function(r){
        if(pf && (r.producer||'') !== pf) return false;
        if(sf && canonicalRiskStatus(r.status) !== sf) return false;
        if(q){
          var hay = [r.assured_name, r.display_name, r.producer, r.region, r.notes, r.product].join(' ').toLowerCase();
          if(hay.indexOf(q) === -1) return false;
        }
        return true;
      });

      const latestByAssured = {};
      filtered.forEach(function(r){
        var key = (r.assured_name || r.display_name || '').toLowerCase().trim();
        if(!key) return;
        if(!latestByAssured[key]) latestByAssured[key] = [];
        latestByAssured[key].push(r);
      });

      const grouped = {};
      Object.values(latestByAssured).forEach(function(arr){
        arr.sort(function(a,b){
          return (b.accounting_year||0) - (a.accounting_year||0) || (new Date(b.updated_at||0) - new Date(a.updated_at||0));
        });
        var latest = arr[0];
        var prod = (latest.producer || 'Unknown').trim() || 'Unknown';
        if(!grouped[prod]) grouped[prod] = [];
        grouped[prod].push({ latest: latest, count: arr.length });
      });

      const insuredCount = Object.values(latestByAssured).length;
      document.getElementById('ent-counts').textContent = `${insuredCount} insured${insuredCount!==1?'s':''} · ${Object.keys(grouped).length} producers`;

      let html='';
      Object.keys(grouped).sort().forEach(function(prod){
        var arr = grouped[prod].sort(function(a,b){
          return riskStatusSortRank(b.latest.status)-riskStatusSortRank(a.latest.status) || String(a.latest.assured_name||'').localeCompare(String(b.latest.assured_name||''));
        });
        html += `<div class="card" style="margin-bottom:10px;padding:12px 16px">
          <div style="font-size:11px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;display:flex;justify-content:space-between">
            <span>📦 ${prod}</span><span class="muted">${arr.length} insured${arr.length!==1?'s':''}</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:4px">`;
        arr.forEach(function(obj){
          var r = obj.latest;
          var prem = r.gross_premium!=null ? Number(r.gross_premium).toLocaleString() : '—';
          var commVal = r.locked_gbp_commission != null && r.locked_gbp_commission !== 0 ? r.locked_gbp_commission : r.estimated_gbp_commission;
          var comm = commVal!=null ? Number(commVal).toLocaleString() : '—';
          html += `<div onclick="openBackendRiskCard(${r.id})" style="display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:6px;cursor:pointer;transition:background 0.1s" onmouseover="this.style.background='var(--bg)'" onmouseout="this.style.background=''">
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.display_name || r.assured_name}</div>
              <div style="font-size:11px;color:var(--text2)">${r.region||'—'} · Inception: ${isoToUk(r.inception_date)} · Handler: ${r.handler||'—'} · ${obj.count} risk${obj.count!==1?'s':''}</div>
            </div>
            <div style="text-align:right;flex-shrink:0">
              <div>${riskStatusBadgeHtml(r.status)}</div>
              <div style="font-size:10px;color:var(--text2);margin-top:2px">${r.currency||''} ${prem} · Comm: ${comm}</div>
            </div>
          </div>`;
        });
        html += '</div></div>';
      });

      document.getElementById('ent-list').innerHTML = html || '<div class="notice info">No backend accounts match the current filters.</div>';
    } catch(e){
      document.getElementById('ent-list').innerHTML = '<div class="notice err">Accounts load failed: '+e.message+'</div>';
    }
  })();
}

function entOpenCard(insId){
  const ent=entGetState();
  const ins=ent.insureds.find(i=>i.id===insId);
  if(!ins) { handleMissingLocalInsured(insId, 'view'); return; }
  const prod=ent.producers.find(p=>p.id===ins.producerId);

  const statusBadge=entStatusBadge;
  const fmtNum=v=>v&&v!=='0'?Number(v).toLocaleString():'—';

  // Enquiries timeline
  let enqHtml='';
  if(ins.enquiries&&ins.enquiries.length){
    [...ins.enquiries].reverse().forEach(e=>{
      const isB=e.status==='Bound';
      enqHtml+=`<div style="border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:8px;background:${isB?'var(--ok-bg)':'var(--surface)'}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px;margin-bottom:8px">
          <div>
            <div style="font-size:12px;font-weight:500">Inception: ${e.inceptionDate||'—'} <span class="muted">· Enquiry: ${e.enquiryDate||'—'}</span></div>
            <div style="font-size:11px;color:var(--text2);margin-top:2px">Handler: ${e.handler||'—'} · ${e.newRenewal||'—'} · ${e.currency||''} ${fmtNum(e.premium)} · Comm: ${fmtNum(e.commission)}</div>
          </div>
          <div style="text-align:right">
            ${statusBadge(e.status||'')}
            ${e.quoteLeader?`<div style="font-size:10px;color:var(--text2);margin-top:3px">Lead: ${e.quoteLeader}</div>`:''}
            ${e.cedant?`<div style="font-size:10px;color:var(--text2)">Cedant: ${e.cedant}</div>`:''}
            ${e.compliance ? `<div style="margin-top:4px"><span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${{'pass':'var(--ok-bg)','review':'var(--warn-bg)','decline':'var(--err-bg)'}[e.compliance.result]||'var(--gray-bg)'};color:${{'pass':'var(--ok)','review':'var(--warn)','decline':'var(--err)'}[e.compliance.result]||'var(--text3)'}">
              ${{'pass':'✓ Compliance PASS','review':'⚠ Compliance REVIEW','decline':'✕ Compliance DECLINE'}[e.compliance.result]||''}
            </span></div>` : ''}
            <div style="margin-top:6px">
              <button onclick="pbOpenCompliance('${insId}','${e.id}')" style="font-size:10px;padding:2px 8px;border-radius:4px;background:var(--err-bg);color:var(--err);border:1px solid var(--err)30;cursor:pointer;font-weight:600">
                ${e.compliance ? '⚖ Review compliance' : '⚖ Pre-bind check'}
              </button>
            </div>
          </div>
        </div>
        ${e.notes?`<div style="font-size:11px;color:var(--text);line-height:1.6;background:var(--bg);padding:7px 10px;border-radius:5px">${e.notes}</div>`:''}
        ${isB?`<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">
          <div style="font-size:10px;font-weight:600;color:var(--text2);margin-bottom:6px">POST-BIND CHECKLIST</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${['eoc','openingMemo','imageRight','eclipse','invoiced','sharepoint','gfr'].map(k=>{
              const done=e.postBind&&e.postBind[k];
              const labels={eoc:'EOC',openingMemo:'Opening Memo',imageRight:'ImageRight',eclipse:'Eclipse',invoiced:'Invoiced',sharepoint:'SharePoint',gfr:'GFR'};
              return `<span onclick="entTogglePostBind('${insId}','${e.id}','${k}')" style="cursor:pointer;font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;background:${done?'var(--ok-bg)':'var(--gray-bg)'};color:${done?'var(--ok)':'var(--text2)'}">${done?'✓':'○'} ${labels[k]}</span>`;
            }).join('')}
          </div>
        </div>`:''}
      </div>`;
    });
  } else { enqHtml='<div class="muted">No enquiries recorded.</div>'; }

  // Notes timeline (from email ingest)
  let emailHtml='';
  const notes = [...(ins.notes || [])].sort((a, b) => {
    const da = parseDate(a.date), db = parseDate(b.date);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return db - da;
  });

  const DOC_TYPE_LABELS = {
    'terms-indication':      {label:'Terms indication',   colour:'#C97800'},
    'terms-clarification':   {label:'Terms clarification',colour:'#C97800'},
    'quote-slip':            {label:'Quote slip',         colour:'#1A6FBF'},
    'client-quotation':      {label:'Client quotation',   colour:'#1A6FBF'},
    'firm-order':            {label:'Firm order',         colour:'#1A8A3A'},
    'binding-confirmation':  {label:'Binding confirmation',colour:'#1A8A3A'},
    'commission-advice':     {label:'Commission advice',  colour:'#6B3FA0'},
    'closing-docs':          {label:'Closing docs',       colour:'#6B3FA0'},
    'general-correspondence':{label:'',                   colour:''}
  };

  const CRITICAL_TYPES = new Set(['terms-indication','terms-clarification','quote-slip',
    'client-quotation','firm-order','binding-confirmation','commission-advice','closing-docs']);

  if(notes.length){
    notes.forEach(n=>{
      const actHtml=n.actions&&n.actions.length
        ?`<div style="margin-top:5px">${n.actions.map(a=>`<div style="font-size:11px;color:var(--acc)">→ ${a}</div>`).join('')}</div>`:'';
      const scHtml=n.statusChange
        ?`<span class="badge b-cond" style="font-size:10px;margin-left:6px">${n.statusChange}</span>`:'';

      // Doc type badge
      const dt = n.docType||'general-correspondence';
      const dtInfo = DOC_TYPE_LABELS[dt]||{label:'',colour:''};
      const dtBadge = dtInfo.label
        ?`<span style="font-size:10px;font-weight:600;padding:1px 7px;border-radius:10px;background:${dtInfo.colour}18;color:${dtInfo.colour};border:1px solid ${dtInfo.colour}40;margin-left:6px">${dtInfo.label}</span>`:'';

      // Terms block — only for critical doc types with actual data
      let termsHtml = '';
      const t = n.terms||{};
      const isCritical = CRITICAL_TYPES.has(dt);
      const hasTerms = isCritical && (t.market||t.premium||t.policyRef||t.brokerage||t.conditions||t.limit||t.deductible);
      if(hasTerms){
        const row = (label, val) => val ? `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid ${dtInfo.colour}18">
          <div style="width:100px;flex-shrink:0;font-size:10px;font-weight:600;color:var(--text2);text-transform:uppercase;padding-top:1px">${label}</div>
          <div style="font-size:12px">${val}</div>
        </div>` : '';
        const premStr = t.premium ? `${t.currency||''} ${Number(t.premium).toLocaleString()}`.trim() : '';
        const bkgStr = t.brokerage ? t.brokerage+'%' : '';
        termsHtml = `<div style="margin-top:8px;padding:8px 10px;border-radius:6px;background:${dtInfo.colour}08;border:1px solid ${dtInfo.colour}30">
          ${row('Market', t.market)}
          ${row('Line', t.line)}
          ${row('Premium', premStr)}
          ${row('Brokerage', bkgStr)}
          ${row('Limit', t.limit)}
          ${row('Deductible', t.deductible)}
          ${row('Policy ref', t.policyRef)}
          ${row('Wording', t.wording)}
          ${row('Basis', t.basis)}
          ${row('Conditions', t.conditions)}
        </div>`;
      }

      const dotColour = isCritical && dtInfo.colour ? dtInfo.colour : 'var(--acc)';
      emailHtml+=`<div class="tl">
        <div class="tl-d">${n.date||''}</div>
        <div class="tl-dot" style="background:${dotColour}"></div>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div style="font-size:12px;font-weight:500">${n.handler||'—'} · ${n.parties||''}${scHtml}${dtBadge}</div>
            <button onclick="deleteNote('${ins.id}','${n.id}')" title="Delete this note"
              style="border:none;background:none;cursor:pointer;color:var(--text3);font-size:11px;padding:0 2px;flex-shrink:0;line-height:1">✕</button>
          </div>
          <div style="font-size:12px;margin-top:3px;line-height:1.6">${n.summary||''}</div>
          ${termsHtml}
          ${actHtml}
        </div>
      </div>`;
    });
  } else {
    emailHtml='<div class="muted" style="font-size:12px">No notes yet. Drop .msg files in the Ingest tab to generate notes.</div>';
  }

  // Documents section
  let docsHtml = '';
  const docs = [...(ins.documents||[])].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(docs.length){
    const DOC_ICONS = {'quote-slip':'📋','firm-order':'✅','endorsement':'📝','debit-note':'💷','closing-slip':'🔏'};
    docsHtml = docs.map(d=>`
      <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:8px;overflow:hidden">
        <div style="background:var(--bg);padding:7px 12px;display:flex;justify-content:space-between;align-items:center;cursor:pointer"
             onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'">
          <div>
            <span style="font-size:13px">${DOC_ICONS[d.type]||'📄'}</span>
            <span style="font-size:12px;font-weight:600;margin-left:6px">${d.title||d.type||'Document'}</span>
            <span class="muted" style="font-size:11px;margin-left:8px">${d.date||''}</span>
          </div>
          <span class="muted" style="font-size:11px">▾ expand</span>
        </div>
        <div style="display:none;padding:10px 12px;font-size:12px;line-height:1.7;white-space:pre-wrap;font-family:monospace;background:var(--surface);border-top:1px solid var(--border)">${d.content||''}</div>
      </div>`).join('');
  }

  // Loss record section
  let lossHtml = '';
  const lossRec = [...(ins.lossRecord||[])].sort((a,b)=>(b.year||'').localeCompare(a.year||''));
  if(lossRec.length){
    lossHtml = `<table style="width:100%;font-size:12px">
      <tr><th>Year</th><th>Paid</th><th>Outstanding</th><th>Currency</th><th>Notes</th></tr>
      ${lossRec.map(r=>`<tr>
        <td>${r.year||'—'}</td>
        <td>${r.paid!=null?Number(r.paid).toLocaleString():'—'}</td>
        <td>${r.outstanding!=null?Number(r.outstanding).toLocaleString():'—'}</td>
        <td>${r.currency||'—'}</td>
        <td class="muted">${r.notes||''}</td>
      </tr>`).join('')}
    </table>`;
  }

  // Placing structure
  let slipHtml = '';
  // Check for structured placement data on any enquiry
  const placedEnq = ins.enquiries.find(e => e.placement && e.placement.layers);
  if(placedEnq){
    const pl = placedEnq.placement;
    const fmtM = v => v >= 1 ? v.toLocaleString() + 'M' : v;
    const fmtN = v => v ? Number(v).toLocaleString() : '—';
    slipHtml += `<div style="background:var(--acc-bg);border:0.5px solid #B5D4F4;border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:11px">
      <div style="font-weight:600;color:var(--acc);margin-bottom:2px">${pl.type||''}</div>
      <div class="muted">${pl.period||''} · ${pl.currency} ${fmtN(pl.totalPremium)} gross · ${pl.overseasBroker||''}</div>
    </div>`;
    pl.layers.forEach((layer, li) => {
      const netPct = (100 - layer.brokerage).toFixed(1);
      slipHtml += `<div style="border:1px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden">
        <div style="background:var(--bg);padding:8px 12px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:4px">
          <div>
            <div style="font-size:12px;font-weight:600">Layer ${li+1}: ${layer.description}</div>
            <div style="font-size:11px;color:var(--text2);margin-top:1px">Cedant: ${layer.cedant} · Lead: ${layer.slipLeader} · UMR: ${layer.umr}</div>
          </div>
          <div style="text-align:right;font-size:11px">
            <div style="font-weight:600;color:var(--acc)">${layer.currency||pl.currency} ${fmtN(layer.grossPremium)} gross</div>
            <div class="muted">${layer.brokerage}% bkg · ${layer.currency||pl.currency} ${fmtN(layer.netPremium)} net</div>
          </div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;font-size:11px;border-collapse:collapse">
            <tr style="background:var(--bg)">
              <th style="text-align:left;padding:4px 10px;font-weight:600;color:var(--text2);border-bottom:1px solid var(--border)">Market</th>
              <th style="text-align:left;padding:4px 8px;font-weight:600;color:var(--text2);border-bottom:1px solid var(--border)">Syndicate</th>
              <th style="text-align:right;padding:4px 8px;font-weight:600;color:var(--text2);border-bottom:1px solid var(--border)">Written</th>
              <th style="text-align:right;padding:4px 8px;font-weight:600;color:var(--text2);border-bottom:1px solid var(--border)">Signed</th>
              <th style="text-align:right;padding:4px 10px;font-weight:600;color:var(--text2);border-bottom:1px solid var(--border)">Gross prem</th>
              <th style="text-align:right;padding:4px 10px;font-weight:600;color:var(--text2);border-bottom:1px solid var(--border)">Net prem</th>
            </tr>
            ${layer.markets.map(m => {
              const grossShare = Math.round(layer.grossPremium * m.signed / 100);
              const netShare = Math.round(grossShare * (1 - layer.brokerage/100));
              return `<tr style="border-bottom:0.5px solid var(--border)">
                <td style="padding:4px 10px;font-weight:500">${m.name}</td>
                <td style="padding:4px 8px;color:var(--text2)">${m.syndicate}</td>
                <td style="padding:4px 8px;text-align:right">${m.written.toFixed(2)}%</td>
                <td style="padding:4px 8px;text-align:right;color:${m.written!==m.signed?'var(--warn)':'var(--text)'}">${m.signed.toFixed(2)}%</td>
                <td style="padding:4px 10px;text-align:right">${(layer.currency||pl.currency)} ${grossShare.toLocaleString()}</td>
                <td style="padding:4px 10px;text-align:right;color:var(--ok)">${(layer.currency||pl.currency)} ${netShare.toLocaleString()}</td>
              </tr>`;
            }).join('')}
            <tr style="background:var(--bg);font-weight:600">
              <td colspan="2" style="padding:5px 10px;font-size:11px">TOTAL (signed to 100%)</td>
              <td style="padding:5px 8px;text-align:right">${layer.markets.reduce((s,m)=>s+m.written,0).toFixed(2)}%</td>
              <td style="padding:5px 8px;text-align:right">100.00%</td>
              <td style="padding:5px 10px;text-align:right">${layer.currency||pl.currency} ${fmtN(layer.grossPremium)}</td>
              <td style="padding:5px 10px;text-align:right;color:var(--ok)">${layer.currency||pl.currency} ${fmtN(layer.netPremium)}</td>
            </tr>
          </table>
        </div>
      </div>`;
    });
    // Programme totals
    const totalNet = pl.layers.reduce((s,l)=>s+l.netPremium,0);
    slipHtml += `<div style="padding:10px 14px;background:var(--ok-bg);border-radius:8px;display:flex;justify-content:space-between;font-size:12px;font-weight:600">
      <span>Programme total — ${pl.layers.length} layers</span>
      <span>${pl.currency} ${fmtN(pl.totalPremium)} gross · ${pl.currency} ${fmtN(totalNet)} net</span>
    </div>`;
  } else if(ins.slips&&ins.slips.length){
    ins.slips.forEach(sl=>{
      slipHtml+=`<div class="tl"><div class="tl-d">${sl.date||''}</div><div class="tl-dot" style="background:var(--ok)"></div><div><div style="font-weight:500">${sl.filename||'Slip'}</div><div class="muted">${sl.cedant?'Cedant: '+sl.cedant:''}</div></div></div>`;
    });
  } else { slipHtml='<div class="muted" style="font-size:12px">No placing structure recorded yet.</div>'; }

  document.getElementById('ent-card-inner').innerHTML=`
    <div style="padding:18px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
      <div>
        <div style="font-size:16px;font-weight:600">${ins.name}</div>
        <div class="muted" style="margin-top:3px">Producer: ${prod?.name||ins.producerId} · Region: ${ins.region||'—'} · ${ins.enquiries.length} enquir${ins.enquiries.length===1?'y':'ies'}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn" onclick="entCloseCard()">✕ Close</button>
        <button class="btn sm" id="research-btn-${ins.id}" onclick="researchCompany('${ins.id}')">
          ${ins.companyBackground ? '✓ Research on file' : '🔍 Research company'}
        </button>
        <button class="btn sm" id="verify-name-btn-${ins.id}" onclick="verifyLegalName('${ins.id}')" title="Check registered legal name online">
          ${ins.legalNameVerified ? '✓ Name verified' : '⚖ Verify legal name'}
        </button>
        <button class="btn sm" onclick="deleteInsured('${ins.id}')" style="color:var(--err);border-color:var(--err)40">🗑 Delete</button>
      </div>
    </div>
    ${ins.companyBackground ? `<div style="padding:10px 20px;background:#F0F7FF;border-bottom:1px solid var(--border);font-size:11px;color:var(--text2)">
      <span style="font-weight:600;color:var(--acc)">Company intelligence</span> · Researched ${ins.companyBackground.researched||''}
      <div style="margin-top:4px;line-height:1.6;white-space:pre-wrap">${(ins.companyBackground.text||'').slice(0,600)}${ins.companyBackground.text&&ins.companyBackground.text.length>600?'…':''}</div>
    </div>` : ''}
    <div id="name-verify-panel-${ins.id}" style="display:none;padding:12px 20px;border-bottom:1px solid var(--border);background:var(--warn-bg)"></div>
    <div style="display:flex;gap:0;padding:0 20px;border-bottom:1px solid var(--border);background:var(--bg)">
      <button class="ptab active" id="ect-tab-overview" onclick="entCardTab('overview','${ins.id}')">Overview</button>
      <button class="ptab" id="ect-tab-timeline" onclick="entCardTab('timeline','${ins.id}')">360 Timeline</button>
      <button class="ptab" id="ect-tab-docs" onclick="entCardTab('docs','${ins.id}')">Docs & Slips</button>
    </div>
    <div style="padding:16px 20px">
      <div id="ect-overview">
        <div class="sh" style="margin-bottom:10px">Enquiry history</div>
        ${enqHtml}
        ${lossRec.length ? `<div class="sh" style="margin-bottom:10px;margin-top:16px">Loss record</div>${lossHtml}` : ''}
        <div class="sh" style="margin-bottom:10px;margin-top:16px">Correspondence notes <span class="muted">(${(ins.notes||[]).length})</span></div>
        ${emailHtml}
      </div>
      <div id="ect-timeline" style="display:none">
        <div id="ect-timeline-inner"></div>
      </div>
      <div id="ect-docs" style="display:none">
        ${docs.length ? `<div class="sh" style="margin-bottom:10px">Documents issued <span class="muted">(${docs.length})</span></div>${docsHtml}` : '<p class="muted">No documents on file.</p>'}
        <div class="sh" style="margin-bottom:10px;margin-top:16px">Placing structure</div>
        ${slipHtml}
      </div>
    </div>`;

  document.getElementById('ent-card').style.display='block';
  document.body.style.overflow='hidden';
}


// ─── ENTITY CARD TABS + 360 TIMELINE ─────────────────────────────────────────

function entCardTab(tab, insId){
  ['overview','timeline','docs'].forEach(function(t){
    var el  = document.getElementById('ect-'+t);
    var btn = document.getElementById('ect-tab-'+t);
    if(el)  el.style.display  = t===tab ? 'block' : 'none';
    if(btn) btn.classList.toggle('active', t===tab);
  });
  if(tab==='timeline') renderEntityTimeline(insId);
}

function renderEntityTimeline(insId){
  var el = document.getElementById('ect-timeline-inner');
  if(!el) return;

  var ent = entGetState();
  var ins = (ent.insureds||[]).find(function(i){ return i.id===insId; });
  if(!ins){ el.innerHTML='<p class="muted">Account not found.</p>'; return; }

  var events = [];

  // ── Enquiries ──
  (ins.enquiries||[]).forEach(function(enq){
    if(enq.enquiryDate){
      events.push({ date:enq.enquiryDate, type:'enquiry', icon:'📥',
        col:'var(--acc)', bg:'var(--acc-bg)',
        title:'Enquiry opened',
        detail:enq.newRenewal+' · Handler: '+(enq.handler||'—')+' · Inception: '+(enq.inceptionDate||'TBC') });
    }
    if(enq.status==='Bound' && enq.inceptionDate){
      events.push({ date:enq.inceptionDate, type:'bound', icon:'✅',
        col:'var(--ok)', bg:'var(--ok-bg)',
        title:'Risk bound',
        detail:(enq.currency||'')+' '+(enq.premium?Number(enq.premium).toLocaleString():'—')+' · Lead: '+(enq.quoteLeader||'—') });
    }
    if(enq.compliance && enq.compliance.date){
      var rmap = {pass:'✓ Compliance PASS',review:'⚠ Compliance REVIEW',decline:'✕ Compliance DECLINE'};
      var cmap = {pass:'var(--ok)',review:'var(--warn)',decline:'var(--err)'};
      events.push({ date:enq.compliance.date, type:'compliance', icon:'⚖',
        col:cmap[enq.compliance.result]||'var(--text2)',
        bg:enq.compliance.result==='pass'?'var(--ok-bg)':enq.compliance.result==='decline'?'var(--err-bg)':'var(--warn-bg)',
        title:rmap[enq.compliance.result]||'Compliance check',
        detail:'Handler: '+(enq.compliance.handler||'—')+(enq.compliance.notes?' · '+enq.compliance.notes.slice(0,80):'') });
    }
    // Post-bind milestones
    var pb = enq.postBind||{};
    var pbLabels = {eoc:'EOC issued',openingMemo:'Opening memo',imageRight:'ImageRight',eclipse:'Eclipse',invoiced:'Invoiced',sharepoint:'SharePoint',gfr:'GFR'};
    Object.keys(pbLabels).forEach(function(k){
      if(pb[k] && typeof pb[k]==='string' && pb[k].match(/\d{2}\/\d{2}\/\d{4}|\d{4}-\d{2}-\d{2}/)){
        events.push({ date:pb[k], type:'admin', icon:'📋',
          col:'var(--text2)', bg:'var(--gray-bg)',
          title:pbLabels[k], detail:'Post-bind admin' });
      }
    });
  });

  // ── Notes / Correspondence ──
  (ins.notes||[]).forEach(function(n){
    var dtypeIcons = {'general-correspondence':'✉','client-quotation':'💬','firm-order':'✅','claims-advice':'⚠','endorsement':'📝','debit-note':'💷'};
    events.push({ date:n.date||'', type:'note', icon:dtypeIcons[n.docType]||'📝',
      col:'var(--text)', bg:'var(--surface)',
      title:(n.docType||'note').replace(/-/g,' ').replace(/\b\w/g,function(c){ return c.toUpperCase(); }),
      detail:(n.summary||'').slice(0,120)+(n.handler?' · Handler: '+n.handler:'')
        +(n.actions&&n.actions.length?' · Actions: '+n.actions.slice(0,2).join('; '):'') });
  });

  // ── Slips ──
  (ins.slips||[]).forEach(function(sl){
    events.push({ date:sl.date||'', type:'slip', icon:'📄',
      col:'var(--purple)', bg:'var(--purple-bg)',
      title:'Slip: '+(sl.type||sl.ref||'—'),
      detail:sl.markets||sl.ref||'' });
  });

  // ── Sort chronologically, newest first ──
  events = events.filter(function(e){ return e.date; });
  events.sort(function(a,b){
    var da = parseDate(a.date), db = parseDate(b.date);
    if(!da&&!db) return 0; if(!da) return 1; if(!db) return -1;
    return db-da;
  });

  if(!events.length){
    el.innerHTML='<p class="muted" style="padding:12px 0">No events recorded yet. Notes, enquiry dates, and post-bind milestones will appear here as you add them.</p>';
    return;
  }

  el.innerHTML = '<div style="position:relative;padding-left:28px">'
    +'<div style="position:absolute;left:8px;top:0;bottom:0;width:2px;background:var(--border)"></div>'
    +events.map(function(ev){
      return '<div style="position:relative;margin-bottom:14px">'
        +'<div style="position:absolute;left:-24px;top:2px;width:18px;height:18px;border-radius:50%;background:'+ev.bg+';border:2px solid '+ev.col+';display:flex;align-items:center;justify-content:center;font-size:9px">'+ev.icon+'</div>'
        +'<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:9px 12px;border-left:3px solid '+ev.col+'">'
        +'<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">'
        +'<div style="font-size:12px;font-weight:600;color:'+ev.col+'">'+ev.title+'</div>'
        +'<div style="font-size:10px;color:var(--text3);white-space:nowrap">'+ev.date+'</div>'
        +'</div>'
        +(ev.detail?'<div style="font-size:11px;color:var(--text2);margin-top:3px;line-height:1.5">'+ev.detail+'</div>':'')
        +'</div></div>';
    }).join('')
    +'</div>';
}

function entCloseCard(){
  document.getElementById('ent-card').style.display='none';
  document.body.style.overflow='';
}

function entTogglePostBind(insId,enqId,field){
  const ent=entGetState();
  const ins=ent.insureds.find(i=>i.id===insId);
  if(!ins) { handleMissingLocalInsured(insId, 'toggle post-bind field'); return; }
  const enq=ins.enquiries.find(e=>e.id===enqId);
  if(!enq||!enq.postBind) return;
  enq.postBind[field]=enq.postBind[field]?'':'DONE';
  entSave(ent);
  entOpenCard(insId); // re-render card
}

// Close card on backdrop click (wrapped in DOMContentLoaded per Build Rule 6)
document.addEventListener('DOMContentLoaded',function(){
  var entCardEl=document.getElementById('ent-card');
  if(entCardEl) entCardEl.addEventListener('click',function(e){
    if(e.target===this) entCloseCard();
  });
});



// ═══════════════════════════════════════════════════════
// INGEST — EMAIL TO ACCOUNT NOTE
// ═══════════════════════════════════════════════════════

function ingestMode(mode){
  document.getElementById('ingest-email-mode').style.display = mode==='email'?'block':'none';
  document.getElementById('ingest-batch-mode').style.display = mode==='batch'?'block':'none';
  document.getElementById('ingest-analyse-mode').style.display = mode==='analyse'?'block':'none';
  document.getElementById('ingest-tab-email').classList.toggle('active', mode==='email');
  document.getElementById('ingest-tab-batch').classList.toggle('active', mode==='batch');
  document.getElementById('ingest-tab-analyse').classList.toggle('active', mode==='analyse');
}

(function(){
  window.addEventListener('load', function(){
    const dz = document.getElementById('dz-email');
    if(!dz) return;
    dz.addEventListener('dragover', e=>{e.preventDefault(); dz.classList.add('over');});
    dz.addEventListener('dragleave', ()=>dz.classList.remove('over'));
    dz.addEventListener('drop', e=>{e.preventDefault(); dz.classList.remove('over'); handleEmailFile(e.dataTransfer.files);});
  });
})();

// ─── HOME SCREEN INGEST ───────────────────────────────────────────────────────
var _hiNoteData = null;

function hiDrop(e){
  e.preventDefault();
  var files = e.dataTransfer.files;
  if(files && files.length) hiFile(files);
}

async function hiFile(files){
  if(!files||!files.length) return;
  var dz      = document.getElementById('hi-dz');
  var proc    = document.getElementById('hi-processing');
  var procMsg = document.getElementById('hi-proc-msg');
  var result  = document.getElementById('hi-result');
  var saved   = document.getElementById('hi-saved');
  var label   = document.getElementById('hi-dz-label');

  saved.style.display = 'none';
  result.style.display = 'none';
  proc.style.display = 'block';
  label.textContent = files[0].name;

  var ent = entGetState();
  var insuredList = ent.insureds.map(function(i){ return {id:i.id, name:i.name}; });

  try {
    procMsg.textContent = 'Parsing ' + files[0].name + '...';
    var fd = new FormData();
    fd.append('file', files[0]);
    fd.append('insureds', JSON.stringify(insuredList));
    procMsg.textContent = 'Generating account note...';
    var res = await fetch(BACKEND + '/ingest-email', {method:'POST', body:fd, headers: authHeaders()});
    var data = await res.json();
    if(data.error){ proc.style.display='none'; showNotice('Error: '+data.error,'err'); return; }

    _hiNoteData = data;
    var note = data.note||{};
    var match = data.match||{};

    // Populate fields
    var g = function(id){ return document.getElementById(id); };
    if(g('hi-date'))    g('hi-date').value    = note.date||data.date||'';
    if(g('hi-handler')) g('hi-handler').value = note.handler||'';
    if(g('hi-parties')) g('hi-parties').value = note.parties||data.sender||'';
    if(g('hi-summary')) g('hi-summary').value = note.summary||'';
    if(g('hi-actions')) g('hi-actions').value = (note.actions||[]).join('\n');
    if(g('hi-status'))  g('hi-status').value  = note.statusChange||'';

    // Match badge
    var confCol = {high:'var(--ok)',medium:'var(--warn)',low:'var(--err)'}[match.confidence]||'var(--text2)';
    var mb = g('hi-match-badge');
    if(mb) mb.innerHTML = match.matched_name
      ? '<div style="padding:7px 10px;border-radius:6px;background:var(--bg);border:1px solid var(--border);font-size:12px"><span style="color:'+confCol+';font-weight:600">'+(match.confidence==='high'?'✓':match.confidence==='medium'?'~':'?')+' '+match.confidence+'</span> — matched to <strong>'+match.matched_name+'</strong><br><span class="muted">'+( match.reason||'')+'</span></div>'
      : '<div class="notice warn" style="margin:0">No automatic match — please select account below.</div>';


    // Auto-compliance on high-confidence match
    if(match.confidence==='high' && match.matched_id) {
      var hiMatchedIns = ent.insureds.find(function(i){ return i.id===match.matched_id; });
      var hiMatchedEnq = hiMatchedIns && hiMatchedIns.enquiries && hiMatchedIns.enquiries[hiMatchedIns.enquiries.length-1];
      if(hiMatchedEnq) {
        autoComplianceScreen(match.matched_id, hiMatchedEnq.id).then(function(r){
          if(!r) return;
          var mbEl = document.getElementById('hi-match-badge');
          if(mbEl) mbEl.innerHTML = (mbEl.innerHTML||'') + r.bannerHtml;
        });
      }
    }
    // Populate insured select
    var sel = g('hi-insured-select');
    if(sel){
      sel.innerHTML = '<option value="">— select insured —</option>';
      var sorted = [...ent.insureds].sort(function(a,b){ return a.name.localeCompare(b.name); });
      sorted.forEach(function(i){
        var o = document.createElement('option');
        o.value = i.id; o.textContent = i.name;
        if(i.id === match.matched_id) o.selected = true;
        sel.appendChild(o);
      });
      hiPopulateEnquiry(match.matched_id||'');
    }


    // Auto-save high-confidence match — home ingest (Chat 12 · #3)
    if(match.confidence==='high' && match.matched_id) {
      var hiAsEnt = entGetState();
      var hiAsIns = hiAsEnt.insureds.find(function(i){ return i.id===match.matched_id; });
      if(hiAsIns) {
        var hiAsNote = {
          id: 'note-'+Date.now(),
          date: note.date||data.date||'',
          handler: note.handler||'',
          parties: note.parties||data.sender||'',
          summary: note.summary||'',
          actions: note.actions||[],
          statusChange: note.statusChange||'',
          enquiryId: hiAsIns.enquiries.length ? hiAsIns.enquiries[hiAsIns.enquiries.length-1].id : '',
          docType: (note.docType)||'general-correspondence',
          terms: (note.terms)||{},
          source: 'ingest-auto'
        };
        if(!hiAsIns.notes) hiAsIns.notes = [];
        if(!isDuplicateNote(hiAsIns, hiAsNote)) {
          hiAsIns.notes.push(hiAsNote);
          if(_hiNoteData && _hiNoteData.contacts && _hiNoteData.contacts.length) upsertContacts(_hiNoteData.contacts, hiAsIns.name);
          entSave(hiAsEnt);
        }
        proc.style.display = 'none';
        saved.textContent = '✓ Auto-saved to ' + hiAsIns.name + (hiAsNote.statusChange ? ' · Status: '+hiAsNote.statusChange : '');
        saved.style.display = 'block';
        document.getElementById('hi-drop-area').style.display = 'block';
        document.getElementById('hi-dz-label').textContent = 'Drop .msg file here';
        document.getElementById('hi-fi').value = '';
        _hiNoteData = null;
        setTimeout(function(){ saved.style.display='none'; }, 5000);
        renderHomeUpload();
        return;
      }
    }

    proc.style.display = 'none';
    result.style.display = 'block';
  } catch(e){
    proc.style.display = 'none';
    showNotice('Failed: '+e.message, 'err');
  }
}

function hiPopulateEnquiry(insId){
  var ent = entGetState();
  var ins = ent.insureds.find(function(i){ return i.id===insId; });
  var sel = document.getElementById('hi-enquiry-select');
  if(!sel) return;
  sel.innerHTML = '<option value="">— select —</option>';
  if(!ins) { handleMissingLocalInsured(insId, 'list enquiries'); return; }
  [...ins.enquiries].reverse().forEach(function(e){
    var o = document.createElement('option');
    o.value = e.id;
    o.textContent = (e.inceptionDate||'No date')+' · '+(e.status||'—')+' · '+(e.newRenewal||'');
    sel.appendChild(o);
  });
  if(ins.enquiries.length) sel.value = ins.enquiries[ins.enquiries.length-1].id;
}

function hiSave(){
  var insId = document.getElementById('hi-insured-select').value;
  var enqId = document.getElementById('hi-enquiry-select').value;
  if(!insId){ showNotice('Select an insured first','err'); return; }
  var ent = entGetState();
  var ins = ent.insureds.find(function(i){ return i.id===insId; });
  if(!ins){ showNotice('Insured not found','err'); return; }

  var actRaw = document.getElementById('hi-actions').value.trim();
  var note = {
    id: 'note-'+Date.now(),
    date:         document.getElementById('hi-date').value.trim(),
    handler:      document.getElementById('hi-handler').value.trim(),
    parties:      document.getElementById('hi-parties').value.trim(),
    summary:      document.getElementById('hi-summary').value.trim(),
    actions:      actRaw ? actRaw.split('\n').map(function(s){ return s.trim(); }).filter(Boolean) : [],
    statusChange: document.getElementById('hi-status').value.trim(),
    enquiryId:    enqId||'',
    docType:      (_hiNoteData&&_hiNoteData.note&&_hiNoteData.note.docType)||'general-correspondence',
    terms:        (_hiNoteData&&_hiNoteData.note&&_hiNoteData.note.terms)||{}
  };

  if(!ins.notes) ins.notes = [];
  if(isDuplicateNote(ins, note)){ showNotice('Duplicate note detected','err'); return; }
  ins.notes.push(note);

  if(note.statusChange && enqId){
    var enq = ins.enquiries.find(function(e){ return e.id===enqId; });
    if(enq){
      var parts = note.statusChange.split(/[→>]|\s+to\s+/i);
      if(parts.length === 2) enq.status = parts[1].trim();
    }
  }

  autoTickPostBind(ent, ins, note);
  entSave(ent);

  if(_hiNoteData && _hiNoteData.contacts && _hiNoteData.contacts.length){
    upsertContacts(_hiNoteData.contacts, ins.name);
  }

  var saved = document.getElementById('hi-saved');
  saved.textContent = '✓ Note saved to ' + ins.name + (note.statusChange ? ' · Status: '+note.statusChange : '');
  saved.style.display = 'block';
  document.getElementById('hi-result').style.display = 'none';
  document.getElementById('hi-drop-area').style.display = 'block';
  document.getElementById('hi-dz-label').textContent = 'Drop .msg file here';
  document.getElementById('hi-fi').value = '';
  _hiNoteData = null;
  setTimeout(function(){ saved.style.display='none'; }, 5000);
  renderHomeUpload();
}

function hiReset(){
  document.getElementById('hi-result').style.display = 'none';
  document.getElementById('hi-saved').style.display = 'none';
  document.getElementById('hi-dz-label').textContent = 'Drop .msg file here';
  document.getElementById('hi-fi').value = '';
  _hiNoteData = null;
}

async function handleEmailFile(files){
  if(!files||!files.length) return;
  const file = files[0];
  const dz = document.getElementById('dz-email');
  const proc = document.getElementById('email-processing');
  const resultCard = document.getElementById('email-result-card');
  const savedNotice = document.getElementById('email-saved-notice');
  dz.classList.remove('loaded');
  resultCard.style.display='none';
  savedNotice.style.display='none';
  proc.style.display='block';
  document.getElementById('email-proc-msg').textContent='Parsing email...';
  const ent = entGetState();
  const insuredList = ent.insureds.map(i=>({id:i.id,name:i.name}));
  try{
    const fd = new FormData();
    fd.append('file', file);
    fd.append('insureds', JSON.stringify(insuredList));
    document.getElementById('email-proc-msg').textContent='Generating account note...';
    const res = await fetch(BACKEND+'/ingest-email',{method:'POST',body:fd, headers: authHeaders()});
    const data = await res.json();
    if(data.error){proc.style.display='none';showNotice('Error: '+data.error,'err');return;}
    const note = data.note||{};
    const match = data.match||{};
    document.getElementById('en-date').value = note.date||data.date||'';
    document.getElementById('en-handler').value = note.handler||'';
    document.getElementById('en-parties').value = note.parties||data.sender||'';
    window._lastEmailData = {from:data.from||'',to:data.to||'',body:stripEmailChain(data.body||'')};
    window._lastEmailContacts = data.contacts||[];
    window._lastNoteData = data.note||{};
    document.getElementById('en-summary').value = note.summary||'';
    document.getElementById('en-actions').value = (note.actions||[]).join('\n');
    document.getElementById('en-status').value = note.statusChange||'';
    // Legacy form-filling (fillIngestRiskDraft, en-insured-select, en-match-badge,
    // populateEnquirySelect, single-new-name) removed Part 17 — workflow card replaces.
    // Auto-compliance on high-confidence match
    if(match.confidence==='high' && match.matched_id) {
      var hfMatchedIns = ent.insureds.find(function(i){ return i.id===match.matched_id; });
      var hfMatchedEnq = hfMatchedIns && hfMatchedIns.enquiries && hfMatchedIns.enquiries[hfMatchedIns.enquiries.length-1];
      if(hfMatchedEnq) {
        autoComplianceScreen(match.matched_id, hfMatchedEnq.id).then(function(r){
          if(!r) return;
          var badgeEl = document.getElementById('en-match-badge');
          if(badgeEl) badgeEl.innerHTML = (badgeEl.innerHTML||'') + r.bannerHtml;
        });
      }
    }
    // Legacy insured-select population removed Part 17 (DOM elements removed)

    // Auto-save high-confidence match (Chat 12 · #3)
    if(match.confidence==='high' && match.matched_id) {
      var asEnt = entGetState();
      var asIns = asEnt.insureds.find(function(i){ return i.id===match.matched_id; });
      if(asIns) {
        var asNote = {
          id: 'note-'+Date.now(),
          date: note.date||data.date||'',
          handler: note.handler||'',
          parties: note.parties||data.sender||'',
          summary: note.summary||'',
          actions: note.actions||[],
          statusChange: note.statusChange||'',
          enquiryId: asIns.enquiries.length ? asIns.enquiries[asIns.enquiries.length-1].id : '',
          docType: (note.docType)||'general-correspondence',
          terms: (note.terms)||{},
          source: 'ingest-auto'
        };
        if(!asIns.notes) asIns.notes = [];
        if(!isDuplicateNote(asIns, asNote)) {
          asIns.notes.push(asNote);
          if(note.document && note.document.content) {
            if(!asIns.documents) asIns.documents = [];
            asIns.documents.push({id:'doc-'+Date.now(),date:asNote.date,type:note.document.type||'',title:note.document.title||'',content:note.document.content,source:'ingest-auto'});
          }
          if(note.lossRecord && note.lossRecord.length) {
            if(!asIns.lossRecord) asIns.lossRecord = [];
            note.lossRecord.forEach(function(lr){ if(!asIns.lossRecord.some(function(x){ return x.year===lr.year; })) asIns.lossRecord.push(lr); });
          }
          if(note.statusChange && asNote.enquiryId) {
            var asEnq = asIns.enquiries.find(function(e){ return e.id===asNote.enquiryId; });
            if(asEnq) { var asParts = note.statusChange.split(/→|to|->/i); if(asParts.length===2) asEnq.status = asParts[1].trim(); }
          }
          entSave(asEnt);
          if(data.contacts && data.contacts.length) upsertContacts(data.contacts, asIns.name);
        }
        proc.style.display='none';
        dz.classList.remove('loaded');
        document.getElementById('dz-email-label').textContent='Drop .msg file here';
        document.getElementById('fi-email').value='';
        savedNotice.textContent='✓ Auto-saved to '+asIns.name+(asNote.statusChange?' · Status: '+asNote.statusChange:'');
        savedNotice.style.display='block';
        setTimeout(function(){savedNotice.style.display='none';},5000);
        renderHomeUpload&&renderHomeUpload();
        return;
      }
    }

    dz.classList.add('loaded');
    document.getElementById('dz-email-label').textContent=file.name;
    proc.style.display='none';
    resultCard.style.display='block';
    // Part 16: trigger full workflow (attachment extraction + output generation)
    if(typeof runIngestWorkflow==='function'){
      try{ runIngestWorkflow(file, null); }catch(wfErr){ console.warn('Workflow trigger failed:', wfErr); }
    }
  }catch(e){
    proc.style.display='none';
    showNotice('Failed: '+e.message,'err');
  }
}


function inferRiskStatusFromText(s){
  var t=(s||'').toLowerCase();
  if(/bound|on risk/.test(t)) return 'bound';
  if(/firm/.test(t)) return 'firm_order';
  if(/quoted|quote|indicative|indication/.test(t)) return 'quoted';
  if(/renew/.test(t)) return 'renewal_pending';
  if(/market/.test(t)) return 'in_market';
  return 'submission';
}


function escapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&#39;');
}

function initExtensions(){
  sovInit();
  syncPropRate('im');syncPropRate('ex');
  addIncoRow('im','FOB',100);addIncoRow('ex','FOB',100);
  calcPremium();
}

// ─── HOME TILE STATS ─────────────────────────────────────────────────────────

function calcRevenueForecast(){
  try {
    var s = gs(), rows = (s.bookRows||[]).filter(function(r){ return r.accountingYear==='2026' && r.gbpComm; });
    var ytd = rows.reduce(function(sum,r){ return sum + (parseFloat(r.gbpComm)||0); }, 0);
    var monthsElapsed = Math.max(1, new Date().getMonth() + 1);
    var projected = Math.round(ytd / monthsElapsed * 12);
    return { ytd: ytd, projected: projected, monthsElapsed: monthsElapsed };
  } catch(e) { return { ytd: 0, projected: 0, monthsElapsed: 1 }; }
}

function renderHomeTileStats(){
  const s = gs();
  const ent = entGetState();
  // Greeting
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const el = document.getElementById('home-greeting');
  if(el) el.textContent = greet + ' · ' + days[new Date().getDay()] + ', ' + new Date().toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  // Pipeline stat
  const ps = Object.values(s.placements||{});
  const active = ps.filter(p=>!['bound','ntu'].includes(p.status));
  const pEl = document.getElementById('home-stat-pipeline');
  if(pEl) pEl.textContent = active.length + ' active · ' + ps.filter(p=>p.actions&&p.actions.some(a=>!a.done)).length + ' actions pending';
  // Entities stat
  const eEl = document.getElementById('home-stat-entities');
  if(eEl) eEl.textContent = (ent.insureds||[]).length + ' insureds · ' + (ent.producers||[]).length + ' producers';
  // Contacts stat
  const cEl = document.getElementById('home-stat-contacts');
  if(cEl) cEl.textContent = (s.contacts||[]).length + ' contacts';
  // Renewals stat
  const upcoming = getRenewalList(90);
  const urgent = upcoming.filter(r=>r.daysUntil<=30).length;
  const rEl = document.getElementById('home-stat-renewals');
  if(rEl) rEl.textContent = upcoming.length + ' renewing · ' + urgent + ' urgent';
  // Hero stats — live 2026 YTD GWP
  // Source 1: bookRows with gbpComm set for 2026
  const boundAccounts = (ent.insureds||[]).filter(i=>(i.enquiries||[]).some(e=>e.status==='Bound')).length;
  var s2026 = gs();
  var ytdRows = (s2026.bookRows||[]).filter(function(r){ return r.accountingYear==='2026' && r.gbpComm!=null; });
  var ytdGbp = ytdRows.reduce(function(acc,r){ return acc+(r.gbpComm||0); }, 0);
  // Source 2: entities with Bound 2026 enquiries that have commission set,
  // not already represented in bookRows (match by name prefix)
  var bookNames = new Set(ytdRows.map(function(r){ return (r.displayName||r.assured||'').toLowerCase().slice(0,14); }));
  (ent.insureds||[]).forEach(function(ins){
    (ins.enquiries||[]).forEach(function(enq){
      if(enq.status !== 'Bound') return;
      var parts = (enq.inceptionDate||'').split('/');
      if(parts.length !== 3 || parts[2].trim() !== '2026') return;
      var comm = parseFloat(enq.commission)||0;
      if(comm <= 0) return;
      var key = ins.name.toLowerCase().slice(0,14);
      if(bookNames.has(key)) return; // already in bookRows
      // Rough GBP conversion: USD/EUR ~0.79, CAD ~0.58, others ~0.79
      var ccy = (enq.currency||'GBP').toUpperCase();
      var fx = ccy==='GBP'?1 : ccy==='EUR'?0.84 : ccy==='CAD'?0.58 : 0.79;
      ytdGbp += Math.round(comm * fx);
      bookNames.add(key);
    });
  });
  var ytdLabel = ytdGbp >= 1000000
    ? '£' + (Math.round(ytdGbp/10000)/100).toFixed(2) + 'M'
    : ytdGbp > 0
    ? '£' + Math.round(ytdGbp/1000) + 'k'
    : '—';
  ['hs-gwp','hs-active','hs-renew','hs-accounts'].forEach((id,i)=>{
    const vals = [ytdLabel, active.length, upcoming.length, boundAccounts];
    const el2 = document.getElementById(id); if(el2) el2.textContent = vals[i];
  });
  // Forecast stat
  var fcData = calcRevenueForecast();
  var fcStatEl = document.getElementById('hs-forecast');
  if(fcStatEl) fcStatEl.textContent = fcData.projected ? '~£'+Math.round(fcData.projected/1000)+'k' : '—';
  renderHomeTasks();
  renderHomeUpload();
  // Revenue forecast
  var fc = calcRevenueForecast();
}



// ─── HOME UPLOAD TASKS ────────────────────────────────────────────────────────

function findDuplicateEntities(){
  var ent = entGetState();
  var insureds = ent.insureds || [];
  var results = [];
  for(var i = 0; i < insureds.length; i++){
    for(var j = i + 1; j < insureds.length; j++){
      var a = (insureds[i].name||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
      var b = (insureds[j].name||'').toLowerCase().replace(/[^a-z0-9\s]/g,'').trim();
      if(!a || !b) continue;
      var sim = 0;
      if(a === b) sim = 100;
      else if(a.indexOf(b) > -1 || b.indexOf(a) > -1) sim = 90;
      else {
        var at = a.split(/\s+/), bt = b.split(/\s+/);
        var inter = at.filter(function(w){ return bt.indexOf(w) > -1; }).length;
        var union = new Set(at.concat(bt)).size || 1;
        sim = Math.round(inter / union * 100);
      }
      if(sim >= 70) results.push({ aName: insureds[i], bName: insureds[j], similarity: sim });
    }
  }
  return results;
}

function renderHomeUpload(){
  var el = document.getElementById('home-upload-inner');
  if(!el) return;

  var ent = entGetState();
  var today = new Date(); today.setHours(0,0,0,0);
  var items = [];

  function daysAgo(dateStr){
    var d = parseDate(dateStr); if(!d) return null;
    return Math.round((today - d) / 86400000);
  }

  (ent.insureds||[]).forEach(function(ins){
    var prod = (ent.producers||[]).find(function(p){ return p.id===ins.producerId; });
    var prodName = prod ? prod.name : '—';
    var notes = ins.notes||[];
    var docs = ins.documents||[];

    (ins.enquiries||[]).forEach(function(enq){
      var status = enq.status||'';
      var isBound = status === 'Bound';
      var isActive = ['Quoted','AW Submission','Submission','In market','Renewal pending'].includes(status);
      var age = daysAgo(enq.enquiryDate);

      if(isBound){
        if(!notes.length){
          items.push({priority:'err',icon:'📭',label:'No correspondence on file',detail:ins.name+' — '+prodName+' · Bound '+( enq.inceptionDate||''),nav:'entities'});
        }
        if(!docs.length){
          items.push({priority:'warn',icon:'📄',label:'No documents uploaded',detail:ins.name+' — closing slip, debit note, EOC',nav:'entities'});
        }
        if(!enq.policyRef && !enq.quoteLeader){
          items.push({priority:'warn',icon:'🔖',label:'Policy reference missing',detail:ins.name+' — add UMR or policy ref to enquiry',nav:'entities'});
        }
        if(!enq.compliance || !enq.compliance.result){
          items.push({priority:'warn',icon:'⚖',label:'Compliance check not recorded',detail:ins.name+' — pre-bind compliance screen not run',nav:'entities'});
        }
        var pb = enq.postBind||{};
        if(!pb.eoc){
          items.push({priority:'warn',icon:'📋',label:'EOC not issued',detail:ins.name+' — mark complete when issued',nav:'renewals'});
        }
      }

      if(isActive && age !== null && age > 14 && !notes.length){
        items.push({priority:'warn',icon:'🗂',label:'No file notes — '+age+'d old',detail:ins.name+' ('+status+') — no correspondence recorded',nav:'entities'});
      }

      if(status === 'Quoted' && !docs.length && !notes.some(function(n){
        return n.docType==='client-quotation'||n.docType==='quote-slip'||n.docType==='terms-indication';
      })){
        items.push({priority:'warn',icon:'💬',label:'Quote not documented',detail:ins.name+' — no quote slip or terms on file',nav:'entities'});
      }
    });
  });

  // Duplicate entity detection
  var dupes = findDuplicateEntities();
  dupes.forEach(function(d){
    items.push({
      priority:'warn', icon:'👥',
      label:'Possible duplicate: '+d.aName.name+' / '+d.bName.name,
      detail:'Name similarity '+d.similarity+'% — consider merging or linking as parent/subsidiary',
      nav:'entities'
    });
  });

  if(!items.length){
    el.innerHTML='<div style="color:var(--ok);font-size:12px;font-weight:600;padding:10px 0">✓ All files look complete</div>';
    return;
  }

  items.sort(function(a,b){ return (a.priority==='err'?0:1)-(b.priority==='err'?0:1); });

  var seen = new Set();
  items = items.filter(function(t){
    var k=t.label+'|'+t.detail;
    if(seen.has(k)) return false;
    seen.add(k); return true;
  });

  var colours={err:'var(--err)',warn:'var(--warn)'};
  var bgs={err:'var(--err-bg)',warn:'var(--warn-bg)'};

  el.innerHTML = items.slice(0,12).map(function(t){
    return '<div onclick="tab(\''+t.nav+'\')" style="cursor:pointer;padding:10px 12px;background:var(--surface);border:1px solid '+colours[t.priority]+'30;border-left:3px solid '+colours[t.priority]+';border-radius:var(--radius);display:flex;gap:10px;align-items:flex-start;transition:background 0.15s;box-shadow:var(--shadow-sm)" onmouseover="this.style.background=\''+bgs[t.priority]+'\'" onmouseout="this.style.background=\'var(--surface)\'">'
      +'<span style="font-size:14px;flex-shrink:0;margin-top:1px">'+t.icon+'</span>'
      +'<div><div style="font-size:12px;font-weight:600;color:'+colours[t.priority]+'">'+t.label+'</div>'
      +'<div style="font-size:11px;color:var(--text2);margin-top:2px">'+t.detail+'</div></div>'
      +'</div>';
  }).join('');

  if(items.length>12){
    el.innerHTML+='<div style="font-size:11px;color:var(--text3);padding:6px 2px">+'+(items.length-12)+' more — review accounts individually</div>';
  }
}

// ─── HOME TASKS ───────────────────────────────────────────────────────────────

function renderHomeTasks(){
  var el = document.getElementById('home-tasks-inner');
  if(!el) return;

  var ent = entGetState();
  var s = gs();
  var today = new Date(); today.setHours(0,0,0,0);
  var tasks = [];

  function daysAgo(dateStr){
    var d = parseDate(dateStr); if(!d) return null;
    return Math.round((today - d) / 86400000);
  }
  function daysUntil(dateStr){
    var d = parseDate(dateStr); if(!d) return null;
    return Math.round((d - today) / 86400000);
  }

  (ent.insureds||[]).forEach(function(ins){
    var prod = (ent.producers||[]).find(function(p){ return p.id===ins.producerId; });
    var prodName = prod ? prod.name : ins.producerId||'—';

    (ins.enquiries||[]).forEach(function(enq){
      var status = (enq.status||'').toLowerCase();
      var incDay = daysUntil(enq.inceptionDate);
      var enqAge = daysAgo(enq.enquiryDate);

      // 1. Open subjectivities on bound account
      if(enq.status==='Bound'){
        var bindingNote = ([].concat(ins.notes||[])).reverse().find(function(n){
          return n.docType==='binding-confirmation'||n.docType==='firm-order'||(n.statusChange||'').toLowerCase().includes('bound');
        });
        var subj = bindingNote&&bindingNote.terms&&bindingNote.terms.conditions ? bindingNote.terms.conditions : '';
        if(subj){
          tasks.push({priority:'err',icon:'\u26a0',label:'Subjectivities outstanding',detail:ins.name+' \u2014 '+subj.slice(0,60)+(subj.length>60?'\u2026':''),nav:'renewals',enqId:enq.id});
        }
      }

      // 2. Renewal overdue (inception passed, still renewal pending)
      if(enq.status==='Renewal pending' && incDay!==null && incDay < 0){
        tasks.push({priority:'err',icon:'\u23f0',label:'Renewal overdue',detail:ins.name+' \u2014 inception '+enq.inceptionDate+' ('+Math.abs(incDay)+'d ago)',nav:'renewals'});
      }

      // 3. Renewal within 14 days, still pending
      if(enq.status==='Renewal pending' && incDay!==null && incDay>=0 && incDay<=14){
        tasks.push({priority:'err',icon:'\ud83d\udcc5',label:'Renewal due in '+incDay+'d',detail:ins.name+' \u2014 '+prodName,nav:'renewals'});
      }

      // 4. Quoted risk — inception within 14 days, no firm order
      if(enq.status==='Quoted' && incDay!==null && incDay>=0 && incDay<=14){
        tasks.push({priority:'err',icon:'\ud83d\udccc',label:'Quote expiring — no firm order',detail:ins.name+' \u2014 inception '+enq.inceptionDate,nav:'entities'});
      }

      // 5. Submission with no handler
      if(['Submission','AW Submission','Quoted'].includes(enq.status) && !enq.handler){
        tasks.push({priority:'warn',icon:'\ud83d\udc64',label:'No handler assigned',detail:ins.name+' \u2014 '+prodName,nav:'entities'});
      }

      // 6. Submission stale >21 days with no update
      if(enq.status==='Submission' && enqAge!==null && enqAge>21){
        tasks.push({priority:'warn',icon:'\ud83d\udcec',label:'Stale submission ('+enqAge+'d)',detail:ins.name+' \u2014 last activity '+enq.enquiryDate,nav:'pipeline'});
      }

      // 7. AW Submission stale >30 days
      if(enq.status==='AW Submission' && enqAge!==null && enqAge>30){
        tasks.push({priority:'warn',icon:'\ud83d\udcec',label:'AW submission stale ('+enqAge+'d)',detail:ins.name+' \u2014 check with AW',nav:'pipeline'});
      }

      // 8. Quoted >60 days with no decision
      if(enq.status==='Quoted' && enqAge!==null && enqAge>60){
        tasks.push({priority:'warn',icon:'\ud83d\udd54',label:'Quote outstanding 60d+',detail:ins.name+' \u2014 quoted '+enq.enquiryDate,nav:'pipeline'});
      }
    });
  });

  // Pipeline: actions pending in old placements system
  var ps = Object.values(s.placements||{});
  ps.filter(function(p){ return p.actions&&p.actions.some(function(a){ return !a.done; }); })
    .forEach(function(p){
      var open = p.actions.filter(function(a){ return !a.done; }).length;
      tasks.push({priority:'warn',icon:'\u2713',label:open+' open action'+(open>1?'s':''),detail:(p.insured||p.ref||'—')+' \u2014 pipeline',nav:'pipeline'});
    });

  if(!tasks.length){
    el.innerHTML = '<div style="color:var(--ok);font-size:12px;font-weight:600;padding:10px 0">\u2713 No suggested tasks \u2014 all clear</div>';
    return;
  }

  // Sort: err first, then warn
  tasks.sort(function(a,b){ return (a.priority==='err'?0:1)-(b.priority==='err'?0:1); });

  // Deduplicate by detail (avoid same account appearing multiple times for same issue)
  var seen = new Set();
  tasks = tasks.filter(function(t){
    var k = t.label+'|'+t.detail;
    if(seen.has(k)) return false;
    seen.add(k); return true;
  });

  var colours = {err:'var(--err)',warn:'var(--warn)'};
  var bgs = {err:'var(--err-bg)',warn:'var(--warn-bg)'};

  el.innerHTML = tasks.slice(0,12).map(function(t){
    return '<div onclick="tab(\''+t.nav+'\')" style="cursor:pointer;padding:10px 12px;background:var(--surface);border:1px solid '+colours[t.priority]+'30;border-left:3px solid '+colours[t.priority]+';border-radius:var(--radius);display:flex;gap:10px;align-items:flex-start;transition:background 0.15s" onmouseover="this.style.background=\''+bgs[t.priority]+'\'" onmouseout="this.style.background=\'var(--surface)\'">'
      +'<span style="font-size:14px;flex-shrink:0;margin-top:1px">'+t.icon+'</span>'
      +'<div><div style="font-size:12px;font-weight:600;color:'+colours[t.priority]+'">'+t.label+'</div>'
      +'<div style="font-size:11px;color:var(--text2);margin-top:2px">'+t.detail+'</div></div>'
      +'</div>';
  }).join('');

  if(tasks.length > 12){
    el.innerHTML += '<div style="font-size:11px;color:var(--text3);padding:6px 0">+'+(tasks.length-12)+' more tasks \u2014 review each section</div>';
  }
}

// ─── RENEWAL DIARY ────────────────────────────────────────────────────────────

function parseDate(str){
  if(!str) return null;
  const p = str.split('/');
  if(p.length!==3) return null;
  const d = new Date(p[2], p[1]-1, p[0]);
  return isNaN(d.getTime()) ? null : d;
}

function getRenewalList(days){
  const ent = entGetState();
  const today = new Date(); today.setHours(0,0,0,0);
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + days);
  const results = [];

  (ent.insureds||[]).forEach(ins=>{
    (ins.enquiries||[]).forEach(enq=>{
      if(!enq.inceptionDate) return;
      const code = canonicalRiskStatus(enq.status || 'submission');
      if(['bound','closed_ntu'].includes(code)) return;

      const d = parseDate(enq.inceptionDate);
      if(!d) return;
      const daysUntil = Math.round((d - today) / 86400000);
      if(daysUntil < -7 || d > cutoff) return;

      const prod = (ent.producers||[]).find(p=>p.id===ins.producerId);
      results.push({
        insured: ins.name,
        insId: ins.id,
        enqRef: enq.id,
        producer: prod ? prod.name : ins.producerId||'—',
        inception: enq.inceptionDate,
        daysUntil,
        status: riskStatusLabel(code),
        statusCode: code,
        premium: enq.premium ? (enq.currency||'') + ' ' + Number(enq.premium).toLocaleString() : '—',
        handler: enq.handler||'—'
      });
    });
  });

  return results.sort((a,b)=>{
    if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil;
    return riskStatusSortRank(b.statusCode) - riskStatusSortRank(a.statusCode);
  });
}

function getPostBindList(){
  // Find all bound accounts with outstanding tasks — no time limit, stays until cleared
  const ent = entGetState();
  const today = new Date(); today.setHours(0,0,0,0);
  const results = [];

  (ent.insureds||[]).forEach(ins=>{
    (ins.enquiries||[]).forEach(enq=>{
      if(enq.status !== 'Bound') return;

      // Find the binding note — most recent note with docType binding-confirmation OR statusChange containing Bound
      const bindingNote = [...(ins.notes||[])].reverse().find(n=>
        n.docType==='binding-confirmation' ||
        n.docType==='firm-order' ||
        (n.statusChange||'').toLowerCase().includes('bound')
      );

      const bindDate = bindingNote ? parseDate(bindingNote.date) : parseDate(enq.inceptionDate);
      const daysSinceBind = bindDate ? Math.round((today - bindDate) / 86400000) : null;

      // Post-bind checklist outstanding items
      const checklist = enq.checklist || {};
      const CHECKLIST_ITEMS = ['EOC','Opening Memo','ImageRight','Eclipse','Invoiced','SharePoint','GFR'];
      const outstandingChecklist = CHECKLIST_ITEMS.filter(item => !checklist[item]);

      // Open actions from ALL notes since binding
      const openActions = [];
      const bindDateTs = bindDate ? bindDate.getTime() : 0;
      (ins.notes||[]).forEach(n=>{
        const nd = parseDate(n.date);
        if(nd && nd.getTime() >= bindDateTs - 86400000*3){ // within 3 days before bind
          (n.actions||[]).forEach(a=>{
            const actionText = typeof a === 'string' ? a : (a.text||'');
            const done = typeof a === 'object' ? a.done : false;
            if(!done && actionText) openActions.push(actionText);
          });
        }
      });

      // Subjectivities from binding note terms
      const subjectivities = bindingNote && bindingNote.terms && bindingNote.terms.conditions
        ? bindingNote.terms.conditions : '';

      // E&O risk: unactioned subjectivities are the primary concern
      const hasOpenSubjectivities = !!subjectivities;
      const hasOutstanding = hasOpenSubjectivities || openActions.length > 0;

      // Drop from tracker entirely if no outstanding items (subjectivities or open actions)
      // Checklist state is admin only and does not affect inclusion
      if(!hasOutstanding) return;

      const prod = (ent.producers||[]).find(p=>p.id===ins.producerId);
      results.push({
        insId: ins.id,
        enqId: enq.id,
        insured: ins.name,
        producer: prod ? prod.name : ins.producerId||'—',
        inception: enq.inceptionDate,
        handler: enq.handler||'—',
        daysSinceBind,
        bindDate: bindingNote ? bindingNote.date : (enq.inceptionDate||''),
        outstandingChecklist,
        openActions,
        subjectivities,
        hasOutstanding,
        checklist,
        premium: enq.premium ? (enq.currency||'') + ' ' + Number(enq.premium).toLocaleString() : '—',
      });
    });
  });

  // Sort: accounts with outstanding items first, then by bind date descending
  return results.sort((a,b)=>{
    if(a.hasOutstanding && !b.hasOutstanding) return -1;
    if(!a.hasOutstanding && b.hasOutstanding) return 1;
    return (b.daysSinceBind||0) - (a.daysSinceBind||0);
  });
}

function toggleChecklistItem(insId, enqId, item){
  const ent = entGetState();
  const ins = (ent.insureds||[]).find(i=>i.id===insId);
  if(!ins) { handleMissingLocalInsured(insId, 'toggle checklist item'); return; }
  const enq = (ins.enquiries||[]).find(e=>e.id===enqId);
  if(!enq) return;
  if(!enq.checklist) enq.checklist = {};
  enq.checklist[item] = !enq.checklist[item];
  entSave(ent);
  renderRenewals();
}

function renderRenewals(){
  const today = new Date(); today.setHours(0,0,0,0);
  const urgencyColour = d => d <= 0 ? 'var(--err)' : d <= 14 ? 'var(--err)' : d <= 30 ? 'var(--warn)' : 'var(--ok)';
  const urgencyBg = d => d <= 0 ? 'var(--err-bg)' : d <= 14 ? 'var(--err-bg)' : d <= 30 ? 'var(--warn-bg)' : 'var(--ok-bg)';

  // ── Upcoming ──────────────────────────────────────────────────────────────
  const upcoming = getRenewalList(90);
  const upEl = document.getElementById('renewal-upcoming');
  if(upEl){
    if(!upcoming.length){
      upEl.innerHTML='<div class="card"><p class="muted">No renewals in the next 90 days. Make sure inception dates are set on account enquiries.</p></div>';
    } else {
      upEl.innerHTML = `<div class="card" style="margin-bottom:10px"><p class="muted" style="margin:0">Calendar view only. WIP owns live placement handling; this screen keeps upcoming renewal dates visible so nothing quietly rolls over.</p></div><div style="overflow-x:auto"><table>
        <tr><th>Days</th><th>Insured</th><th>Producer</th><th>Inception</th><th>Status</th><th>Premium</th><th>Handler</th><th>Churn risk</th></tr>
        ${upcoming.map(r=>`<tr>
          <td><span style="display:inline-block;padding:2px 9px;border-radius:10px;font-weight:700;font-size:12px;background:${urgencyBg(r.daysUntil)};color:${urgencyColour(r.daysUntil)}">${r.daysUntil <= 0 ? 'OVERDUE' : r.daysUntil + 'd'}</span></td>
          <td><strong>${r.insured}</strong></td>
          <td class="muted">${r.producer}</td>
          <td>${r.inception}</td>
          <td>${riskStatusBadgeHtml(r.statusCode || r.status)}</td>
          <td>${r.premium}</td>
          <td>${r.handler}</td>
          <td>${(()=>{ const ent=entGetState(); const ins=(ent.insureds||[]).find(i=>i.id===r.insId); const enq=ins&&(ins.enquiries||[]).find(e=>e.id===r.enqRef); if(!ins||!enq) return '—'; const ch=calcChurnRisk(ins,enq); return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;background:'+ch.bg+';color:'+ch.col+'" title="'+ch.flags.join(', ')+'">'+ch.level+'</span>'; })()}</td>
        </tr>`).join('')}
      </table></div>`;
    }
  }

  // ── Post-bind tracker ─────────────────────────────────────────────────────
  const bound = getPostBindList();
  const pbEl = document.getElementById('renewal-postbind');
  if(!pbEl) return;

  if(!bound.length){
    pbEl.innerHTML='<div class="card"><p class="muted">No bound accounts with outstanding controls. Accounts appear here after binding and drop off only when all post-placement actions are complete.</p></div>';
    return;
  }

  const CHECKLIST_ITEMS = ['EOC','Opening Memo','ImageRight','Eclipse','Invoiced','SharePoint','GFR'];

  pbEl.innerHTML = bound.map(r => {
    const age = r.daysSinceBind != null ? r.daysSinceBind : '?';
    const ageBg = age <= 7 ? 'var(--ok-bg)' : age <= 30 ? 'var(--warn-bg)' : 'var(--err-bg)';
    const ageCol = age <= 7 ? 'var(--ok)' : age <= 30 ? 'var(--warn)' : 'var(--err)';
    const allClear = !r.hasOutstanding;

    // Subjectivities warning — E&O risk
    const subjWarningHtml = r.subjectivities
      ? `<div style="margin-bottom:8px;padding:8px 10px;background:var(--err-bg);border:1px solid var(--err)40;border-radius:6px;display:flex;gap:8px;align-items:flex-start">
          <span style="color:var(--err);font-weight:700;font-size:12px;flex-shrink:0">⚠ Subjectivities outstanding</span>
          <span style="font-size:11px;color:var(--err)">${r.subjectivities}</span>
        </div>` : '';

    // Checklist pills — admin only, does not drive inclusion
    const checklistHtml = CHECKLIST_ITEMS.map(item => {
      const done = r.checklist[item];
      return `<span onclick="toggleChecklistItem('${r.insId}','${r.enqId}','${item}')"
        style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;cursor:pointer;margin:2px;
        background:${done?'var(--ok-bg)':'var(--surface)'};color:${done?'var(--ok)':'var(--text3)'};border:1px solid ${done?'var(--ok)':'var(--border)'}">
        ${done?'✓':'○'} ${item}
      </span>`;
    }).join('');

    // Open actions
    const actionsHtml = r.openActions.length
      ? r.openActions.slice(0,5).map(a=>`<div style="font-size:11px;color:var(--acc);padding:2px 0">→ ${a}</div>`).join('')
      : '';

    // Subjectivities
    const subjHtml = r.subjectivities
      ? `<div style="margin-top:6px;padding:6px 8px;background:var(--warn-bg);border-radius:5px;font-size:11px;color:var(--warn)">
          <span style="font-weight:600">Subjectivities: </span>${r.subjectivities}
        </div>` : '';

    return `<div class="card" style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:10px">
        <div>
          <div style="font-size:13px;font-weight:600">${r.insured}</div>
          <div class="muted" style="font-size:11px">${r.producer} · Inception ${r.inception} · ${r.handler}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:11px;font-weight:600;padding:2px 10px;border-radius:10px;background:${ageBg};color:${ageCol}">
            ${r.subjectivities ? '⚠ Subjectivities open' : age+'d since bind'}
          </span>
        </div>
      </div>
      ${subjWarningHtml}
      <div style="margin-bottom:4px;margin-top:6px">${checklistHtml}</div>
      <div style="font-size:10px;color:var(--text3);margin-bottom:4px">Post-placement admin — tick when complete</div>
      ${actionsHtml ? `<div style="margin-top:6px">${actionsHtml}</div>` : ''}
      ${!r.subjectivities ? '<div style="font-size:11px;color:var(--ok);margin-top:6px;font-weight:600">✓ No open subjectivities</div>' : ''}
    </div>`;
  }).join('');
}

// ─── PRODUCTION DIARY ─────────────────────────────────────────────────────────

function getTargets(){ const s=gs(); return s.targets||[]; }
function saveTargets(t){ const s=gs(); s.targets=t; ss(s); }

function renderProduction(){
  const targets = getTargets();
  const el = document.getElementById('prod-list');
  if(!el) return;
  if(!targets.length){
    el.innerHTML='<div class="card"><p class="muted">No targets yet. Add producers, cedants, or markets you want to develop.</p></div>';
    return;
  }
  const priBg = {high:'var(--err-bg)',medium:'var(--warn-bg)',low:'var(--ok-bg)'};
  const priCol = {high:'var(--err)',medium:'var(--warn)',low:'var(--ok)'};
  const sorted = [...targets].sort((a,b)=>{
    const order={high:0,medium:1,low:2};
    return (order[a.priority]||1)-(order[b.priority]||1);
  });
  el.innerHTML = `<table>
    <tr><th>Priority</th><th>Name</th><th>Firm</th><th>Location</th><th>Opportunity</th><th>Last contact</th><th></th></tr>
    ${sorted.map(t=>`<tr>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;background:${priBg[t.priority]||priBg.medium};color:${priCol[t.priority]||priCol.medium}">${(t.priority||'medium').toUpperCase()}</span></td>
      <td><strong>${t.name||'—'}</strong>${t.role?`<div class="muted" style="font-size:10px">${t.role}</div>`:''}</td>
      <td>${t.firm||'—'}</td>
      <td>${t.location||'—'}</td>
      <td>${t.opportunity||'—'}</td>
      <td>${t.lastContact||'—'}</td>
      <td><button class="btn sm" onclick="openEditTarget('${t.id}')">Edit</button></td>
    </tr>`).join('')}
  </table>`;
}

function openAddTarget(){
  ['prod-name','prod-firm','prod-role','prod-location','prod-opportunity','prod-notes','prod-last-contact','prod-edit-id'].forEach(id=>{
    document.getElementById(id).value='';
  });
  document.getElementById('prod-priority').value='medium';
  document.getElementById('prod-modal-title').textContent='Add target';
  document.getElementById('prod-delete-btn').style.display='none';
  document.getElementById('prod-modal').style.display='block';
}

function openEditTarget(id){
  const t = getTargets().find(x=>x.id===id);
  if(!t) return;
  document.getElementById('prod-name').value=t.name||'';
  document.getElementById('prod-firm').value=t.firm||'';
  document.getElementById('prod-role').value=t.role||'';
  document.getElementById('prod-location').value=t.location||'';
  document.getElementById('prod-priority').value=t.priority||'medium';
  document.getElementById('prod-opportunity').value=t.opportunity||'';
  document.getElementById('prod-notes').value=t.notes||'';
  document.getElementById('prod-last-contact').value=t.lastContact||'';
  document.getElementById('prod-edit-id').value=id;
  document.getElementById('prod-modal-title').textContent='Edit target';
  document.getElementById('prod-delete-btn').style.display='inline-block';
  document.getElementById('prod-modal').style.display='block';
}

function saveTarget(){
  const name=document.getElementById('prod-name').value.trim();
  if(!name){showNotice('Name required','err');return;}
  const targets=getTargets();
  const editId=document.getElementById('prod-edit-id').value.trim();
  const obj={
    id:editId||'tgt-'+Date.now(),
    name, firm:document.getElementById('prod-firm').value.trim(),
    role:document.getElementById('prod-role').value.trim(),
    location:document.getElementById('prod-location').value.trim(),
    priority:document.getElementById('prod-priority').value,
    opportunity:document.getElementById('prod-opportunity').value.trim(),
    notes:document.getElementById('prod-notes').value.trim(),
    lastContact:document.getElementById('prod-last-contact').value.trim()
  };
  if(editId){
    const idx=targets.findIndex(t=>t.id===editId);
    if(idx>-1) targets[idx]=obj; else targets.push(obj);
  } else {
    targets.push(obj);
  }
  saveTargets(targets);
  document.getElementById('prod-modal').style.display='none';
  renderProduction();
}

function deleteTarget(){
  const id=document.getElementById('prod-edit-id').value;
  if(!id||!confirm('Delete this target?')) return;
  saveTargets(getTargets().filter(t=>t.id!==id));
  document.getElementById('prod-modal').style.display='none';
  renderProduction();
}


// ─── CONTACT UPSERT ──────────────────────────────────────────────────────────

function upsertContacts(contacts, insuredName){
  if(!contacts||!contacts.length) return;
  const s = gs();
  if(!s.contacts) s.contacts = [];
  const today = new Date().toISOString().slice(0,10);
  let added = 0, updated = 0;
  contacts.forEach(c => {
    if(!c.name && !c.email) return;
    const email = (c.email||'').trim().toLowerCase();
    const name = (c.name||'').trim();
    // Skip obviously generic addresses
    if(email && (email.startsWith('noreply') || email.startsWith('no-reply') || email.startsWith('info@'))) return;
    // Match on email first, then name if no email
    let existing = email ? s.contacts.find(x => x.email === email) : null;
    if(!existing && name) existing = s.contacts.find(x => x.name.toLowerCase() === name.toLowerCase());
    if(existing){
      // Update with better data — email beats no email, fill in blanks
      if(email && !existing.email) existing.email = email;
      if(c.phone && !existing.phone) existing.phone = c.phone;
      if(c.firm && !existing.firm) existing.firm = c.firm;
      if(c.role && !existing.role) existing.role = c.role;
      existing.lastSeen = today;
      updated++;
    } else {
      s.contacts.push({
        id: 'con-' + Date.now() + '-' + Math.random().toString(36).slice(2,5),
        name, email,
        phone: c.phone||'', firm: c.firm||'', role: c.role||'',
        notes: insuredName ? 'Re: '+insuredName : '',
        source: 'ingest', lastSeen: today
      });
      added++;
    }
  });
  ss(s);
  if(added||updated) console.log(`Contacts: +${added} added, ${updated} updated from backend`);
}

function dedupeContacts(){
  const s = gs();
  if(!s.contacts||!s.contacts.length) return;
  const before = s.contacts.length;
  const merged = [];
  const seen = {}; // name.toLowerCase() -> index in merged

  s.contacts.forEach(c => {
    const key = (c.name||'').trim().toLowerCase();
    if(!key) { merged.push(c); return; }
    if(seen[key] !== undefined){
      // Merge into existing — keep best data
      const existing = merged[seen[key]];
      if(c.email && !existing.email) existing.email = c.email;
      if(c.phone && !existing.phone) existing.phone = c.phone;
      if(c.firm && !existing.firm) existing.firm = c.firm;
      if(c.role && !existing.role) existing.role = c.role;
      if(c.lastSeen > (existing.lastSeen||'')) existing.lastSeen = c.lastSeen;
    } else {
      seen[key] = merged.length;
      merged.push({...c});
    }
  });

  s.contacts = merged;
  ss(s);
  const removed = before - merged.length;
  showNotice(`✓ Deduplicated: ${removed} duplicates removed, ${merged.length} contacts remaining`, 'ok');
  renderContacts();
}

// ─── CLAUSE LIBRARY ───────────────────────────────────────────────────────────

const CLAUSE_SEED = [{"id":"clause-001","title":"Misappropriation Exclusion","ref":"JC2017/002","date":"01/03/2017","origin":"JC","type":"exclusion","products":["Marine Cargo","STP","Cargo RI"]},{"id":"clause-002","title":"Misuse of Bills of Lading","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"clause-003","title":"Mysterious Disappearance and Stocktaking Losses","ref":"","date":"","origin":"Market","type":"exclusion","products":["Marine Cargo","STP","Stock Only"]},{"id":"clause-004","title":"Non-Admitted Insurance \u2014 Tax Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"clause-005","title":"Institute Cargo Clauses (A)","ref":"CL382","date":"01/01/2009","origin":"JC","type":"operative","products":["Marine Cargo","Cargo RI"]},{"id":"clause-006","title":"Process Exclusion","ref":"","date":"","origin":"Manuscript","type":"exclusion","products":["STP","Stock Only"]},{"id":"clause-007","title":"Cyber Attack Exclusion","ref":"CL380","date":"10/11/2003","origin":"LMA","type":"exclusion","products":["Marine Cargo","STP","Cargo RI","FFL","WHLL / All Risks"]},{"id":"clause-008","title":"Sanctions Exclusion","ref":"LMA3100","date":"17/11/2010","origin":"LMA","type":"exclusion","products":["Marine Cargo","STP","Cargo RI","FFL","WHLL / All Risks","War"]},{"id":"clause-009","title":"Theft Exclusion (Unpacked Goods)","ref":"","date":"","origin":"Manuscript","type":"exclusion","products":["Stock Only","Marine Cargo"]},{"id":"clause-010","title":"Rust Oxidisation Exclusion","ref":"","date":"","origin":"Manuscript","type":"exclusion","products":["Stock Only","Marine Cargo"]},{"id":"clause-011","title":"Mechanical Electrical Derangement Exclusion","ref":"","date":"","origin":"Manuscript","type":"exclusion","products":["Stock Only","Marine Cargo"]},{"id":"clause-012","title":"Commodity Description \u2014 Maple Syrup","ref":"","date":"","origin":"Manuscript","type":"condition","products":["STP"]},{"id":"jefo-001","title":"Five Powers War Clause","ref":"JC2023-024","date":"06/01/2023","origin":"JC","type":"exclusion","products":["Marine Cargo","STP","Cargo RI"]},{"id":"jefo-002","title":"Accumulation Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"jefo-003","title":"Automatic Acquisition Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP"]},{"id":"jefo-004","title":"Certificates Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP"]},{"id":"jefo-005","title":"Civil Authority Clause","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP"]},{"id":"jefo-006","title":"Communicable Disease Exclusion (Cargo)","ref":"JC2020-011","date":"17/04/2020","origin":"JC","type":"exclusion","products":["Marine Cargo","STP","Cargo RI","FFL","WHLL / All Risks"]},{"id":"jefo-007","title":"Concealed Damage Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP"]},{"id":"jefo-008","title":"Container Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP"]},{"id":"jefo-009","title":"Contingent Interest / Difference in Conditions","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP"]},{"id":"jefo-010","title":"Control of Damaged and Branded Goods Clause","ref":"JCC2019/002","date":"","origin":"JC","type":"condition","products":["Marine Cargo","STP"]},{"id":"jefo-011","title":"Debris Removal Clause (Transits Only)","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP"]},{"id":"jefo-012","title":"Duration of Risk","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP"]},{"id":"jefo-013","title":"Errors and Omissions Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"jefo-014","title":"F.O.B./F.A.S. Purchases Extension","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP"]},{"id":"jefo-015","title":"Full Value Reporting","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP"]},{"id":"jefo-016","title":"Marine Cyber Endorsement","ref":"LMA5403","date":"11/11/2019","origin":"LMA","type":"exclusion","products":["Marine Cargo","STP","Cargo RI","FFL","WHLL / All Risks"]},{"id":"jefo-017","title":"On Deck Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP"]},{"id":"jefo-018","title":"Other Insurance Clause","ref":"AIF 2162 (1/97)","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP"]},{"id":"jefo-019","title":"Packing Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP"]},{"id":"jefo-020","title":"Process Exclusion Clause","ref":"JC2019-005","date":"29/07/2019","origin":"JC","type":"exclusion","products":["STP","Stock Only"]},{"id":"jefo-021","title":"Subrogation Waiver","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"jefo-022","title":"Sue and Labour","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"jefo-023","title":"Wilful Misconduct","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP"]},{"id":"jefo-024","title":"Profit Commission","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP"]},{"id":"jefo-025","title":"JCC Flood Definition","ref":"JC2020-020","date":"01/12/2020","origin":"JC","type":"definition","products":["Marine Cargo","STP","Cargo RI","FFL","WHLL / All Risks"]},{"id":"jefo-026","title":"JCC Earthquake Definition","ref":"JC2020-019","date":"01/12/2020","origin":"JC","type":"definition","products":["Marine Cargo","STP","Cargo RI","FFL","WHLL / All Risks"]},{"id":"jefo-027","title":"JCC Windstorm Definition","ref":"JC2020-018","date":"01/12/2020","origin":"JC","type":"definition","products":["Marine Cargo","STP","Cargo RI","FFL","WHLL / All Risks"]},{"id":"jefo-028","title":"War Strikes Riots and Civil Commotions Notice of Cancellation Administration Clause","ref":"JC2024-025","date":"08/01/2024","origin":"JC","type":"condition","products":["Marine Cargo","STP","Cargo RI","War"]},{"id":"jefo-029","title":"Premium Payment Terms (LSW3001)","ref":"LSW3001","date":"30/09/2008","origin":"LMA","type":"condition","products":["Marine Cargo","STP","Cargo RI","FFL","WHLL / All Risks"]},{"id":"jefo-030","title":"Sanction Limitation and Exclusion Clause","ref":"JC2010/014","date":"11/08/2010","origin":"JC","type":"exclusion","products":["Marine Cargo","STP","Cargo RI","FFL","WHLL / All Risks","War"]},{"id":"jefo-031","title":"Forwarding Expenses","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP"]},{"id":"jefo-032","title":"Demurrage Charges","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP"]},{"id":"jefo-033","title":"Testing, Sorting and Segregation","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP"]},{"id":"sunel-001","title":"Classification Clause","ref":"CL354","date":"01/01/2001","origin":"JC","type":"condition","products":["Marine Cargo","STP","STP RI","Cargo RI"]},{"id":"sunel-002","title":"General Average and Salvage Clause","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-003","title":"Payment on Account Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","STP RI","Cargo RI"]},{"id":"sunel-004","title":"Surveys Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","STP RI","Cargo RI"]},{"id":"sunel-005","title":"Recoveries Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","STP RI","Cargo RI"]},{"id":"sunel-006","title":"Released Bill of Lading","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-007","title":"Cessation/Suspension of Underwriting","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","STP RI","Cargo RI","Stock Only","Cargo RI"]},{"id":"sunel-008","title":"Claused Bills of Lading","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-009","title":"Customs and Immigration Authority Inspections","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-010","title":"Extra Expenses Clause","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-011","title":"Fumigation Clause","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-012","title":"Increased Value on Arrival (Including Duty/Surcharges)","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-013","title":"Interruption of Transit of Damaged Goods","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-014","title":"ISM and/or ISPS Provisions","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-015","title":"Labels Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-016","title":"Letters of Credit","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-017","title":"Location Definition","ref":"","date":"","origin":"Market","type":"definition","products":["Marine Cargo","STP","Stock Only","Cargo RI"]},{"id":"sunel-018","title":"Loss Payee","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","STP RI","Stock Only","Cargo RI"]},{"id":"sunel-019","title":"Postal Conveyance Clause","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-020","title":"Repacking Costs Clause","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-021","title":"Replacements by Air Clause","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-022","title":"Returned Shipments Clause","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-023","title":"Salesperson's Samples","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"sunel-024","title":"Shore Clause","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"stp-001","title":"JCC Wildfire Definition","ref":"JC2020-017","date":"01/12/2020","origin":"JC","type":"definition","products":["Marine Cargo","STP","STP RI","Stock Only","Cargo RI"]},{"id":"stp-002","title":"Prohibited Labour Clause","ref":"JC2019-008","date":"2019","origin":"JC","type":"condition","products":["Marine Cargo","STP","STP RI","Cargo RI"]},{"id":"stp-003","title":"Basis of Valuation \u2014 Selling Price","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"stp-004","title":"Own Vehicle / Unattended Vehicle Security Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"stp-005","title":"Pairs and Sets Clause","ref":"","date":"","origin":"Market","type":"condition","products":["Marine Cargo","STP","Cargo RI"]},{"id":"stp-006","title":"Contracts (Rights of Third Parties) Act 1999 Exclusion","ref":"JC2000/002","date":"2000","origin":"JC","type":"condition","products":["Marine Cargo","STP","STP RI","Stock Only","Cargo RI"]},{"id":"stp-007","title":"Lloyd's General Average and Salvage Leader Clause","ref":"JC2019-006","date":"2019","origin":"JC","type":"condition","products":["Marine Cargo","STP","STP RI","Cargo RI"]},{"id":"stp-008","title":"Temperature / Reefer Breakdown Extension","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"stp-009","title":"Market Loss / Rejection Clause","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"stp-010","title":"Automatic Acquisition Clause","ref":"","date":"","origin":"Market","type":"operative","products":["Marine Cargo","STP","Cargo RI"]},{"id":"stp-011","title":"JCC Conditions Clause","ref":"JC2020-016","date":"2020","origin":"JC","type":"condition","products":["Marine Cargo","STP","STP RI","Stock Only","Cargo RI"]},{"id":"stp-012","title":"Five Powers War Clause","ref":"JC2023-024","date":"06/01/2023","origin":"JC","type":"exclusion","products":["Marine Cargo","STP","STP RI","Cargo RI"]},{"id":"cl391","ref":"CL391","title":"Institute Bulk Oil Clauses","date":"01/05/2016","origin":"Institute","type":"cargo","products":["bulk oil","liquid cargo","petroleum","chemicals","liquid bulk"]},{"id":"cl392","ref":"CL392","title":"Institute Strikes Clauses (Bulk Oil)","date":"01/05/2016","origin":"Institute","type":"strikes","products":["bulk oil","liquid cargo","petroleum","chemicals"]},{"id":"cl393","ref":"CL393","title":"Institute Coal Clauses","date":"01/05/2016","origin":"Institute","type":"cargo","products":["coal","bulk dry cargo","dry bulk"]},{"id":"cl394","ref":"CL394","title":"Institute Strikes Clauses (Coal)","date":"25/05/2016","origin":"Institute","type":"strikes","products":["coal","bulk dry cargo","dry bulk"]},{"id":"cl395","ref":"CL395","title":"Institute Location Clause","date":"01/05/2016","origin":"Institute","type":"limitation","products":["all cargo","general cargo","bulk","stock throughput"]},{"id":"cl397","ref":"CL397","title":"Institute War and Strikes Clauses \u2014 Cargo Stored Afloat","date":"01/05/2016","origin":"Institute","type":"war","products":["bulk oil","liquid cargo","storage afloat","floating storage"]}];

function getClauses(){
  const s = gs();
  if(!s.clauses || !s.clauses.length){
    s.clauses = JSON.parse(JSON.stringify(CLAUSE_SEED));
    ss(s);
  }
  return s.clauses;
}
function saveClauses(cl){ const s=gs(); s.clauses=cl; ss(s); }

let _clauseSet = []; // ids of selected clauses for conflict check

function renderClauseLib(){
  const clauses = getClauses();
  const typeF = (document.getElementById('clause-type-filter')||{}).value||'';
  const originF = (document.getElementById('clause-origin-filter')||{}).value||'';
  const q = ((document.getElementById('clause-search')||{}).value||'').toLowerCase();

  let filtered = clauses;
  if(typeF) filtered = filtered.filter(c=>c.type===typeF);
  if(originF) filtered = filtered.filter(c=>c.origin===originF);
  if(q) filtered = filtered.filter(c=>
    (c.title||'').toLowerCase().includes(q) ||
    (c.text||'').toLowerCase().includes(q) ||
    (c.ref||'').toLowerCase().includes(q) ||
    (c.notes||'').toLowerCase().includes(q) ||
    (c.tags||[]).some(t=>t.toLowerCase().includes(q))
  );

  const countEl = document.getElementById('clause-count');
  if(countEl) countEl.textContent = filtered.length + ' of ' + clauses.length + ' clauses';

  // Update clause set bar
  const setBar = document.getElementById('clause-set-bar');
  const setCount = document.getElementById('clause-set-count');
  const checkBtn = document.getElementById('check-btn');
  if(setBar) setBar.style.display = _clauseSet.length ? 'flex' : 'none';
  if(setCount) setCount.textContent = _clauseSet.length;
  if(checkBtn) checkBtn.style.display = _clauseSet.length >= 2 ? 'inline-block' : 'none';

  // Render pills
  const pillsEl = document.getElementById('clause-set-pills');
  if(pillsEl){
    pillsEl.innerHTML = _clauseSet.map(id=>{
      const cl = clauses.find(c=>c.id===id);
      return cl ? `<span style="background:var(--acc);color:#fff;font-size:10px;padding:2px 8px;border-radius:10px;cursor:pointer" onclick="removeFromSet('${id}')">${cl.title} ✕</span>` : '';
    }).join('');
  }

  const TYPE_COLOURS = {
    'operative':'#185FA5','exclusion':'#A32D2D','condition':'#854F0B',
    'warranty':'#534AB7','definition':'#1D9E75'
  };
  const ORIGIN_BADGES = {
    'JC':'#185FA5','LMA':'#534AB7','IUA':'#1D9E75','Market':'#854F0B','Manuscript':'#A32D2D'
  };

  const list = document.getElementById('clause-list');
  if(!list) return;

  if(!filtered.length){
    list.innerHTML = '<div class="card"><p class="muted">No clauses found. Add clauses to build your library.</p></div>';
    return;
  }

  list.innerHTML = filtered.map(cl => {
    const tc = TYPE_COLOURS[cl.type]||'#888780';
    const oc = ORIGIN_BADGES[cl.origin]||'#888780';
    const inSet = _clauseSet.includes(cl.id);
    const tags = (cl.tags||[]).map(t=>`<span style="font-size:9px;padding:1px 6px;border-radius:8px;background:var(--bg);border:0.5px solid var(--border);color:var(--text2)">${t}</span>`).join(' ');
    return `<div class="card" style="margin-bottom:8px;border-left:3px solid ${tc};${inSet?'background:var(--acc-bg);':''}" >
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
            <span style="font-size:13px;font-weight:600">${cl.title}</span>
            <span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;background:${tc}18;color:${tc};text-transform:uppercase">${cl.type}</span>
            <span style="font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px;background:${oc}18;color:${oc}">${cl.origin}</span>
            ${cl.ref?`<span style="font-size:10px;font-family:monospace;color:var(--text2)">${cl.ref}</span>`:''}
            ${cl.date?`<span class="muted" style="font-size:10px">${cl.date}</span>`:''}
          </div>
          <div style="font-size:11px;color:var(--text2);line-height:1.6;margin-bottom:6px;max-height:60px;overflow:hidden">${(cl.text||'').slice(0,200)}${cl.text&&cl.text.length>200?'…':''}</div>
          ${cl.notes?`<div style="font-size:11px;color:var(--acc);font-style:italic;margin-bottom:4px">ⓘ ${cl.notes.slice(0,120)}${cl.notes.length>120?'…':''}</div>`:''}`+
          `<div style="display:flex;gap:4px;flex-wrap:wrap">${tags}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;flex-shrink:0">
          <button class="btn sm ${inSet?'primary':''}" onclick="toggleClauseSet('${cl.id}')">${inSet?'✓ In set':'+ Add to set'}</button>
          <div style="display:flex;gap:4px">
            <button class="btn sm" onclick="viewClause('${cl.id}')">View</button>
            <button class="btn sm" onclick="openEditClause('${cl.id}')">Edit</button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function toggleClauseSet(id){
  if(_clauseSet.includes(id)) _clauseSet = _clauseSet.filter(x=>x!==id);
  else _clauseSet.push(id);
  renderClauseLib();
}

function removeFromSet(id){
  _clauseSet = _clauseSet.filter(x=>x!==id);
  renderClauseLib();
}

function clearClauseSet(){
  _clauseSet = [];
  renderClauseLib();
}

function viewClause(id){
  const cl = getClauses().find(c=>c.id===id);
  if(!cl) return;
  const TYPE_COLOURS = {
    'operative':'#185FA5','exclusion':'#A32D2D','condition':'#854F0B',
    'warranty':'#534AB7','definition':'#1D9E75'
  };
  const tc = TYPE_COLOURS[cl.type]||'#888780';
  const tags = (cl.tags||[]).map(t=>`<span style="font-size:10px;padding:2px 8px;border-radius:10px;background:var(--bg);border:0.5px solid var(--border)">${t}</span>`).join(' ');

  // Use clause modal for view too
  const modal = document.getElementById('clause-modal');
  document.getElementById('clause-modal-title').innerHTML = `
    <div style="font-size:16px;font-weight:600;margin-bottom:4px">${cl.title}</div>
    <div style="display:flex;gap:8px;align-items:center;font-size:11px;margin-bottom:12px">
      <span style="font-weight:700;color:${tc};text-transform:uppercase">${cl.type}</span>
      <span class="muted">${cl.origin}</span>
      ${cl.ref?`<span style="font-family:monospace;color:var(--text2)">${cl.ref}</span>`:''}
      ${cl.date?`<span class="muted">${cl.date}</span>`:''}
    </div>`;

  document.getElementById('cl-title').value = '';
  document.getElementById('cl-edit-id').value = '';

  // Show wording in a read-only view
  const inner = `
    <div style="background:var(--bg);border-radius:8px;padding:14px;margin-bottom:12px;font-size:12px;line-height:1.9;white-space:pre-wrap;font-family:Georgia,serif;border-left:3px solid ${tc}">${cl.text||''}</div>
    ${cl.notes?`<div style="padding:10px 12px;background:#FFF8E7;border-radius:6px;border-left:3px solid #C97800;font-size:11px;line-height:1.7;margin-bottom:10px"><span style="font-weight:600;color:#C97800">Market intelligence</span><br>${cl.notes}</div>`:''}`+
    `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${tags}</div>
    <div style="display:flex;gap:8px">
      <button class="btn primary" onclick="toggleClauseSet('${cl.id}');document.getElementById('clause-modal').style.display='none';renderClauseLib()">${_clauseSet.includes(cl.id)?'✓ Remove from set':'+ Add to set'}</button>
      <button class="btn" onclick="openEditClause('${cl.id}')">Edit</button>
      <button class="btn" onclick="document.getElementById('clause-modal').style.display='none'" style="margin-left:auto">Close</button>
    </div>`;

  // Temporarily replace modal content for view mode
  modal.querySelector('.sh').style.display='none';
  const formEls = ['cl-title','cl-ref','cl-date','cl-origin','cl-type','cl-text','cl-notes','cl-tags','cl-edit-id'];
  formEls.forEach(id=>{ const el=document.getElementById(id); if(el&&el.closest) el.closest('.fg,.row') && (el.closest('.fg')||el.closest('.row')).style && (el.closest('.fg')||el.closest('.row')).style && null; });

  // Simplest approach: just show in a basic alert-style modal
  const viewDiv = document.createElement('div');
  viewDiv.id='clause-view-overlay';
  viewDiv.style='position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:300;overflow-y:auto;padding:24px 16px';
  viewDiv.innerHTML=`<div style="max-width:640px;margin:0 auto;background:var(--surface);border-radius:var(--radius);box-shadow:0 8px 32px rgba(0,0,0,0.18);padding:24px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
      <div>
        <div style="font-size:16px;font-weight:600">${cl.title}</div>
        <div style="font-size:11px;color:var(--text2);margin-top:3px">${cl.origin} ${cl.ref||''} ${cl.date||''}</div>
      </div>
      <button class="btn sm" onclick="document.getElementById('clause-view-overlay').remove()">✕ Close</button>
    </div>
    ${inner}
  </div>`;
  document.body.appendChild(viewDiv);
}

function openAddClause(){
  ['cl-title','cl-ref','cl-date','cl-text','cl-notes','cl-tags','cl-edit-id'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('clause-modal-title').textContent='Add clause';
  document.getElementById('cl-delete-btn').style.display='none';
  document.getElementById('clause-modal').style.display='block';
}

function openEditClause(id){
  const cl=getClauses().find(c=>c.id===id);
  if(!cl) return;
  document.getElementById('cl-title').value=cl.title||'';
  document.getElementById('cl-ref').value=cl.ref||'';
  document.getElementById('cl-date').value=cl.date||'';
  document.getElementById('cl-origin').value=cl.origin||'Market';
  document.getElementById('cl-type').value=cl.type||'condition';
  document.getElementById('cl-text').value=cl.text||'';
  document.getElementById('cl-notes').value=cl.notes||'';
  document.getElementById('cl-tags').value=(cl.tags||[]).join(', ');
  document.getElementById('cl-edit-id').value=id;
  document.getElementById('clause-modal-title').textContent='Edit clause';
  document.getElementById('cl-delete-btn').style.display='inline-block';
  document.getElementById('clause-modal').style.display='block';
}

function saveClause(){
  const title=(document.getElementById('cl-title').value||'').trim();
  if(!title){showNotice('Clause title required','err');return;}
  const clauses=getClauses();
  const editId=document.getElementById('cl-edit-id').value.trim();
  const tagsRaw=document.getElementById('cl-tags').value;
  const obj={
    id:editId||'clause-'+Date.now(),
    title,
    ref:document.getElementById('cl-ref').value.trim(),
    date:document.getElementById('cl-date').value.trim(),
    origin:document.getElementById('cl-origin').value,
    type:document.getElementById('cl-type').value,
    text:document.getElementById('cl-text').value.trim(),
    notes:document.getElementById('cl-notes').value.trim(),
    tags:tagsRaw?tagsRaw.split(',').map(t=>t.trim()).filter(Boolean):[],
    products:[]
  };
  if(editId){
    const idx=clauses.findIndex(c=>c.id===editId);
    if(idx>-1) clauses[idx]=obj; else clauses.push(obj);
  } else clauses.push(obj);
  saveClauses(clauses);
  document.getElementById('clause-modal').style.display='none';
  renderClauseLib();
  showNotice('✓ Clause saved','ok');
}

function deleteClause(){
  const id=document.getElementById('cl-edit-id').value;
  if(!id||!confirm('Delete this clause from the library?')) return;
  saveClauses(getClauses().filter(c=>c.id!==id));
  document.getElementById('clause-modal').style.display='none';
  renderClauseLib();
}

async function checkClauseConflicts(){
  const key=getKey();
  if(!key){showNotice('API key required','err');return;}
  if(_clauseSet.length<2){showNotice('Select at least 2 clauses to check','err');return;}

  const clauses=getClauses();
  const selected=_clauseSet.map(id=>clauses.find(c=>c.id===id)).filter(Boolean);

  const resultEl=document.getElementById('clause-conflict-result');
  const textEl=document.getElementById('clause-conflict-text');
  resultEl.style.display='block';
  textEl.textContent='Analysing clauses...';
  resultEl.scrollIntoView({behavior:'smooth',block:'nearest'});

  const clauseText=selected.map((c,i)=>
    `CLAUSE ${i+1}: ${c.title} (${c.type.toUpperCase()})${c.ref?' ['+c.ref+']':''}\n${c.text}`
  ).join('\n\n---\n\n');

  try{
    const text = await aiText({
      model:'claude-haiku-4-5-20251001',
      max_tokens:1000,
      system:`You are a senior Lloyd's of London marine cargo insurance specialist reviewing a set of slip clauses.
Analyse the provided clauses for:
1. CONFLICTS — clauses that directly contradict each other or create irreconcilable obligations
2. OVERLAPS — clauses that provide duplicate or redundant coverage
3. GAPS — areas where the clauses together leave coverage uncertain or unintended gaps
4. INTERACTIONS — clauses that interact in ways that may not be immediately obvious

Be specific. Reference clause numbers and exact wording. Flag severity: HIGH / MEDIUM / LOW.
If no issues found, say so clearly.`,
      user:`Please review these ${selected.length} clauses for conflicts, overlaps, and gaps:

${clauseText}`
    });
    textEl.textContent=text||'No response received.';
  }catch(e){
    textEl.textContent='Analysis failed: '+e.message;
  }
}


// ─── SLIP LIBRARY ─────────────────────────────────────────────────────────────

function getSlips(){ const s=gs(); return s.slips||[]; }
function saveSlips(sl){ const s=gs(); s.slips=sl; ss(s); }


// ── Bulk STP RI knowledge base seed ─────────────────────────────────────────
const BULK_STP_RI_SEED_ID = 'bulk-stp-ri-knowledge-base-v1';

function ensureBulkSTPRISeed(){
  const bulkSlips = getSlips();
  if(bulkSlips.find(s=>s.id===BULK_STP_RI_SEED_ID)) return;

  const kb = {
    id: BULK_STP_RI_SEED_ID,
    insured: 'Bulk STP RI — OG Broking Knowledge Base',
    product: 'Bulk STP RI',
    market: "Lloyd's (multiple syndicates)",
    territory: 'Worldwide (Turkey / Black Sea focus)',
    date: 'April 2026',
    umr: '[To be assigned at placement]',
    premium: '[Full premium, quarterly instalments]',
    added: '2026-04-12'
  };

  bulkSlips.push(kb);
  saveSlips(bulkSlips);
}

// ── Standard STP MRC Template seed ──────────────────────────────────────────
const STANDARD_STP_SEED_ID = 'standard-stp-mrc-template-v1';

function ensureStandardSTPSeed(){
  const stdSlips = getSlips();
  if(stdSlips.find(s=>s.id===STANDARD_STP_SEED_ID)) return;
  const template = {
    id: STANDARD_STP_SEED_ID,
    insured: 'Standard STP — OG Broking MRC Template',
    product: 'Standard STP',
    market: "Lloyd's (multiple syndicates)",
    territory: 'Worldwide',
    date: 'April 2026',
    umr: '[To be assigned at placement]',
    premium: '[Adjustable on turnover/values]',
    added: '2026-04-12'
  };
  stdSlips.splice(1, 0, template); // Insert after Pharma STP (index 0)
  saveSlips(stdSlips);
}

// ── Pharma STP MRC Template seed ────────────────────────────────────────────
const PHARMA_STP_SEED_ID = 'pharma-stp-mrc-template-v1';

function ensurePharmaSTPSeed(){
  const pharmaSlips = getSlips();
  if(pharmaSlips.find(s=>s.id===PHARMA_STP_SEED_ID)) return;
  const template = {
    id: PHARMA_STP_SEED_ID,
    insured: 'Pharmaceutical STP — OG Broking MRC Template',
    product: 'Pharma STP',
    market: 'Lloyd\'s (multiple syndicates)',
    territory: 'Worldwide',
    date: 'April 2026',
    umr: '[To be assigned at placement]',
    premium: '[Adjustable on turnover]',
    added: '2026-04-12'
  };
  pharmaSlips.unshift(template);
  saveSlips(pharmaSlips);
}



function renderSlipLib(){
  const slips = getSlips();
  const product = (document.getElementById('sliplib-product')||{}).value||'';
  const market = (document.getElementById('sliplib-market')||{}).value||'';
  const q = ((document.getElementById('sliplib-search')||{}).value||'').toLowerCase();

  let filtered = slips;
  if(product) filtered = filtered.filter(s=>s.product===product);
  if(market) filtered = filtered.filter(s=>(s.market||'').includes(market));
  if(q) filtered = filtered.filter(s=>
    (s.insured||'').toLowerCase().includes(q) ||
    (s.territory||'').toLowerCase().includes(q) ||
    (s.wording||'').toLowerCase().includes(q) ||
    (s.content||'').toLowerCase().includes(q)
  );

  const countEl = document.getElementById('sliplib-count');
  if(countEl) countEl.textContent = filtered.length + ' of ' + slips.length + ' slips';

  const list = document.getElementById('sliplib-list');
  if(!list) return;

  if(!filtered.length){
    list.innerHTML = `<div class="card"><p class="muted">No slips in library yet. Upload a past agreed slip or add one manually to build the precedent library.</p></div>`;
    return;
  }

  const PRODUCT_COLOURS = {
    'Bulk STP RI':'#854F0B','Standard STP':'#185FA5','Pharma STP':'#534AB7','STP':'#185FA5','STP RI':'#185FA5','Marine Cargo':'#1D9E75','Cargo RI':'#1D9E75',
    'WHLL / All Risks':'#854F0B','FFL':'#534AB7','Stock Only':'#A32D2D','War':'#444441','Other':'#888780'
  };

  list.innerHTML = filtered.map(sl => {
    const col = PRODUCT_COLOURS[sl.product]||'#888780';
    return `<div class="card" style="margin-bottom:10px;border-left:3px solid ${col}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <div style="font-size:13px;font-weight:600">${sl.insured||'Unnamed slip'}</div>
          <div class="muted" style="font-size:11px;margin-top:2px">
            <span style="color:${col};font-weight:600">${sl.product||'—'}</span>
            · ${sl.market||'—'} · ${sl.territory||'—'} · ${sl.date||'—'}
            ${sl.umr ? `· <span style="font-family:monospace">${sl.umr}</span>` : ''}
            ${sl.premium ? `· ${sl.premium}` : ''}
          </div>
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn sm" onclick="viewSlip('${sl.id}')">View</button>
          <button class="btn sm" onclick="useSlipAsPrecedent('${sl.id}')">Use as precedent ↗</button>
          <button class="btn sm" onclick="openEditSlip('${sl.id}')" style="color:var(--text2)">Edit</button>
        </div>
      </div>
      ${sl.wording ? `<div style="margin-top:8px;font-size:11px;color:var(--text2)"><span style="font-weight:600">Wording:</span> ${sl.wording.slice(0,120)}${sl.wording.length>120?'…':''}</div>` : ''}
      ${sl.conditions ? `<div style="margin-top:4px;font-size:11px;color:var(--text2)"><span style="font-weight:600">Conditions:</span> ${sl.conditions.slice(0,100)}${sl.conditions.length>100?'…':''}</div>` : ''}
    </div>`;
  }).join('');
}

function openAddSlipManual(){
  ['sl-insured','sl-umr','sl-premium','sl-wording','sl-conditions','sl-content','sl-notes','sl-edit-id','sl-territory','sl-date','sl-market'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  document.getElementById('sliplib-edit-title').textContent='Add slip';
  document.getElementById('sl-delete-btn').style.display='none';
  document.getElementById('sliplib-edit-modal').style.display='block';
}

function openEditSlip(id){
  const sl = getSlips().find(s=>s.id===id);
  if(!sl) return;
  document.getElementById('sl-insured').value=sl.insured||'';
  document.getElementById('sl-product').value=sl.product||'STP';
  document.getElementById('sl-market').value=sl.market||'';
  document.getElementById('sl-territory').value=sl.territory||'';
  document.getElementById('sl-date').value=sl.date||'';
  document.getElementById('sl-umr').value=sl.umr||'';
  document.getElementById('sl-premium').value=sl.premium||'';
  document.getElementById('sl-wording').value=sl.wording||'';
  document.getElementById('sl-conditions').value=sl.conditions||'';
  document.getElementById('sl-content').value=sl.content||'';
  document.getElementById('sl-notes').value=sl.notes||'';
  document.getElementById('sl-edit-id').value=id;
  document.getElementById('sliplib-edit-title').textContent='Edit slip';
  document.getElementById('sl-delete-btn').style.display='inline-block';
  document.getElementById('sliplib-edit-modal').style.display='block';
}

function saveSlip(){
  const insured=document.getElementById('sl-insured').value.trim();
  if(!insured){showNotice('Insured name required','err');return;}
  const slips=getSlips();
  const editId=document.getElementById('sl-edit-id').value.trim();
  const obj={
    id:editId||'slip-'+Date.now(),
    insured,
    product:document.getElementById('sl-product').value,
    market:document.getElementById('sl-market').value.trim(),
    territory:document.getElementById('sl-territory').value.trim(),
    date:document.getElementById('sl-date').value.trim(),
    umr:document.getElementById('sl-umr').value.trim(),
    premium:document.getElementById('sl-premium').value.trim(),
    wording:document.getElementById('sl-wording').value.trim(),
    conditions:document.getElementById('sl-conditions').value.trim(),
    content:document.getElementById('sl-content').value.trim(),
    notes:document.getElementById('sl-notes').value.trim(),
    added:new Date().toISOString().slice(0,10)
  };
  if(editId){
    const idx=slips.findIndex(s=>s.id===editId);
    if(idx>-1) slips[idx]=obj; else slips.push(obj);
  } else {
    slips.push(obj);
  }
  saveSlips(slips);
  document.getElementById('sliplib-edit-modal').style.display='none';
  renderSlipLib();
  showNotice('✓ Slip saved to library','ok');
}

function deleteSlip(){
  const id=document.getElementById('sl-edit-id').value;
  if(!id||!confirm('Delete this slip from the library?')) return;
  saveSlips(getSlips().filter(s=>s.id!==id));
  document.getElementById('sliplib-edit-modal').style.display='none';
  renderSlipLib();
}

function viewSlip(id){
  const sl=getSlips().find(s=>s.id===id);
  if(!sl) return;
  const modal=document.getElementById('sliplib-modal');
  document.getElementById('sliplib-modal-inner').innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px">
      <div>
        <div style="font-size:16px;font-weight:600">${sl.insured}</div>
        <div class="muted" style="font-size:12px;margin-top:3px">${sl.product} · ${sl.market||'—'} · ${sl.territory||'—'} · ${sl.date||'—'}</div>
      </div>
      <button class="btn" onclick="document.getElementById('sliplib-modal').style.display='none'">✕ Close</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;margin-bottom:14px;font-size:12px">
      ${sl.umr?`<div><div class="muted" style="font-size:10px">UMR / POLICY REF</div><div style="font-family:monospace">${sl.umr}</div></div>`:''}
      ${sl.premium?`<div><div class="muted" style="font-size:10px">PREMIUM</div><div>${sl.premium}</div></div>`:''}
      ${sl.wording?`<div style="grid-column:1/-1"><div class="muted" style="font-size:10px">WORDING</div><div>${sl.wording}</div></div>`:''}
      ${sl.conditions?`<div style="grid-column:1/-1"><div class="muted" style="font-size:10px">CONDITIONS</div><div>${sl.conditions}</div></div>`:''}
      ${sl.notes?`<div style="grid-column:1/-1"><div class="muted" style="font-size:10px">NOTES</div><div>${sl.notes}</div></div>`:''}
    </div>
    ${sl.content?`<div style="margin-top:12px"><div class="muted" style="font-size:10px;margin-bottom:6px">FULL SLIP TEXT</div>
      <div style="background:var(--bg);border-radius:6px;padding:12px;font-size:11px;line-height:1.8;white-space:pre-wrap;max-height:400px;overflow-y:auto;font-family:monospace">${sl.content}</div></div>`:''}
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn primary" onclick="useSlipAsPrecedent('${sl.id}');document.getElementById('sliplib-modal').style.display='none'">Use as precedent ↗</button>
      <button class="btn" onclick="openEditSlip('${sl.id}');document.getElementById('sliplib-modal').style.display='none'">Edit</button>
    </div>`;
  modal.style.display='block';
}

async function uploadSlip(input){
  const file=input.files[0];
  if(!file) return;
  const key=getKey();
  if(!key){showNotice('API key required to extract slip content','err');return;}

  showNotice('Reading slip...','info');

  const reader=new FileReader();
  reader.onload=async function(e){
    const text=e.target.result;
    try{
      const raw = await aiText({
        model:'claude-haiku-4-5-20251001',
        max_tokens:1200,
        system:`You are a Lloyd's wholesale broker reading a marine insurance slip. Extract the key fields and return ONLY valid JSON:
{
  "insured": "insured/assured name",
  "product": "one of: Marine Cargo / STP / STP RI / WHLL / All Risks / FFL / Stock Only / Cargo RI / War / Other",
  "market": "lead underwriter or market",
  "territory": "country or region of risk",
  "date": "date of slip DD/MM/YYYY",
  "umr": "UMR or policy reference",
  "premium": "premium figure with currency",
  "wording": "key clauses and wording bases",
  "conditions": "key conditions and subjectivities"
}`,
        user:`Extract slip fields from this document:

${text.slice(0,8000)}`
      });
      const clean=raw.replace(/```json|```/g,'').trim();
      let extracted={};
      try{ extracted=JSON.parse(clean); }catch(e){}

      // Pre-fill the manual form with extracted data
      openAddSlipManual();
      if(extracted.insured) document.getElementById('sl-insured').value=extracted.insured;
      if(extracted.product) document.getElementById('sl-product').value=extracted.product;
      if(extracted.market) document.getElementById('sl-market').value=extracted.market;
      if(extracted.territory) document.getElementById('sl-territory').value=extracted.territory;
      if(extracted.date) document.getElementById('sl-date').value=extracted.date;
      if(extracted.umr) document.getElementById('sl-umr').value=extracted.umr;
      if(extracted.premium) document.getElementById('sl-premium').value=extracted.premium;
      if(extracted.wording) document.getElementById('sl-wording').value=extracted.wording;
      if(extracted.conditions) document.getElementById('sl-conditions').value=extracted.conditions;
      document.getElementById('sl-content').value=text.slice(0,10000);
      showNotice('✓ Slip extracted — review and save','ok');
    }catch(ex){
      showNotice('Extraction failed: '+ex.message,'err');
    }
  };
  reader.readAsText(file);
  input.value='';
}

function useSlipAsPrecedent(id){
  const sl=getSlips().find(s=>s.id===id);
  if(!sl) return;
  // Navigate to quote slips tab with this slip pre-loaded as context
  tab('slips');
  const ctxEl=document.getElementById('slip-ctx');
  if(ctxEl) ctxEl.value=`Use the following agreed slip as the basis and precedent for this new slip. Maintain the same structure, wording style, and clause references where applicable:\n\nPRECEDENT: ${sl.insured} (${sl.product}, ${sl.date})\n${sl.wording?'Wording: '+sl.wording+'\n':''}${sl.conditions?'Conditions: '+sl.conditions+'\n':''}${sl.content?'\nFull slip text:\n'+sl.content.slice(0,2000):''}`;
  showNotice('✓ Precedent loaded into quote slip generator','ok');
}


// ─── DELETE FUNCTIONS ─────────────────────────────────────────────────────────

function deleteInsured(insId){
  const ent = entGetState();
  const ins = (ent.insureds||[]).find(i=>i.id===insId);
  if(!ins) { handleMissingLocalInsured(insId, 'delete account'); return; }
  if(!confirm(`Delete ${ins.name} and all associated notes and documents? This cannot be undone.`)) return;
  ent.insureds = ent.insureds.filter(i=>i.id!==insId);
  entSave(ent);
  entCloseCard();
  renderEntities();
  showNotice('✓ ' + ins.name + ' deleted', 'ok');
}

function deleteNote(insId, noteId){
  const ent = entGetState();
  const ins = (ent.insureds||[]).find(i=>i.id===insId);
  if(!ins) { handleMissingLocalInsured(insId, 'delete note'); return; }
  if(!confirm('Delete this note? This cannot be undone.')) return;
  ins.notes = (ins.notes||[]).filter(n=>n.id!==noteId);
  entSave(ent);
  entCard(insId);
  showNotice('✓ Note deleted', 'ok');
}


// ─── COMPANY RESEARCH ─────────────────────────────────────────────────────────

async function researchCompany(insId){
  const key = getKey();
  if(!key){ showNotice('API key required for company research','err'); return; }

  const ent = entGetState();
  const ins = (ent.insureds||[]).find(i=>i.id===insId);
  if(!ins) { handleMissingLocalInsured(insId, 'research company'); return; }

  const btn = document.getElementById('research-btn-'+insId);
  if(btn){ btn.textContent = '⟳ Researching...'; btn.disabled = true; }

  const query = ins.name + (ins.region ? ' ' + ins.region : '');

  try{
    const text = await aiText({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      system: `You are a Lloyd's wholesale broker doing background research on a potential insured.
Search for information about the company and return a concise intelligence report covering:
1. What the company does (industry, products, operations)
2. Size and scale (employees, revenue, locations if available)
3. Key facts relevant to insurance (cargo volumes, storage, transport, commodities)
4. Any red flags (sanctions, adverse news, financial distress)
5. Registered country/jurisdiction

Be factual and concise. Flag anything that would be relevant to underwriting.
Return plain text, no markdown headers.`,
      user: `Research this company for Lloyd's insurance underwriting purposes: ${query}`
    });

    if(!text){ throw new Error('No research results returned'); }

    // Save as a background note on the insured
    if(!ins.notes) ins.notes = [];
    ins.notes.push({
      id: 'note-research-'+Date.now(),
      date: new Date().toLocaleDateString('en-GB').replace(/\//g,'/'),
      handler: 'AI',
      parties: 'Web research',
      summary: text.slice(0, 400),
      actions: [],
      statusChange: '',
      docType: 'general-correspondence',
      terms: {},
      source: 'company-research',
      fullText: text
    });

    // Also store as structured background field
    ins.companyBackground = {
      text,
      researched: new Date().toISOString().slice(0,10),
      query
    };

    entSave(ent);

    // Re-render the card to show the research
    entCard(insId);
    showNotice('✓ Company research saved to account file', 'ok');

  } catch(e) {
    showNotice('Research failed: ' + e.message, 'err');
    if(btn){ btn.textContent = '🔍 Research company'; btn.disabled = false; }
  }
}


// ─── CHAIN STRIPPING ─────────────────────────────────────────────────────────

function stripEmailChain(body){
  if(!body) return '';
  // Split on the first occurrence of common reply delimiters
  const delimiters = [
    /^-{3,}[\s\S]*?original message/im,
    /^_{5,}/m,
    /^from:.*?sent:.*?to:/ims,
    /^on .{5,80}wrote:/im,
    /^>{1,}/m,
    /^-{3,}\s*forwarded/im,
  ];
  let earliest = body.length;
  for(const re of delimiters){
    const m = body.search(re);
    if(m > 0 && m < earliest) earliest = m;
  }
  return body.slice(0, earliest).trim();
}

// ─── BATCH INGEST ─────────────────────────────────────────────────────────────

let _batchFiles = [];
let _batchRunning = false;
let _batchStop = false;
let _batchQueue = []; // items needing manual review
let _batchStats = {saved:0, queue:0, failed:0, skipped:0};
let _reviewIdx = 0;

function batchLoad(files){
  _batchFiles = Array.from(files);
  const label = document.getElementById('dz-batch-label');
  const fileList = document.getElementById('batch-file-list');
  label.textContent = _batchFiles.length + ' file' + (_batchFiles.length===1?'':'s') + ' selected';
  fileList.innerHTML = _batchFiles.slice(0,10).map(f=>`<div style="padding:2px 0">📄 ${f.name}</div>`).join('')
    + (_batchFiles.length>10 ? `<div class="muted">...and ${_batchFiles.length-10} more</div>` : '');
  document.getElementById('batch-start-btn').style.display = 'inline-block';
  document.getElementById('batch-clear-btn').style.display = 'inline-block';
}

function batchClear(){
  _batchFiles = [];
  _batchQueue = [];
  _batchStats = {saved:0, queue:0, failed:0, skipped:0};
  _batchRunning = false;
  _batchStop = false;
  _reviewIdx = 0;
  document.getElementById('dz-batch-label').textContent = 'Drop .msg files here';
  document.getElementById('batch-file-list').innerHTML = '';
  document.getElementById('batch-start-btn').style.display = 'none';
  document.getElementById('batch-clear-btn').style.display = 'none';
  document.getElementById('batch-progress-card').style.display = 'none';
  document.getElementById('batch-review-card').style.display = 'none';
  document.getElementById('batch-summary-card').style.display = 'none';
  document.getElementById('fi-batch').value = '';
}

function batchStop(){
  _batchStop = true;
  document.getElementById('batch-stop-btn').textContent = 'Stopping...';
}

function batchUpdateStats(){
  document.getElementById('b-saved').textContent = _batchStats.saved;
  document.getElementById('b-queue').textContent = _batchStats.queue;
  document.getElementById('b-failed').textContent = _batchStats.failed;
  document.getElementById('b-skipped').textContent = _batchStats.skipped;
}

async function batchStart(){
  if(!_batchFiles.length){showNotice('No files loaded','err');return;}
  if(_batchRunning){showNotice('Already running','err');return;}
  _batchRunning = true;
  _batchStop = false;
  _batchQueue = [];
  _batchStats = {saved:0, queue:0, failed:0, skipped:0};
  _reviewIdx = 0;

  document.getElementById('batch-progress-card').style.display = 'block';
  document.getElementById('batch-review-card').style.display = 'none';
  document.getElementById('batch-summary-card').style.display = 'none';
  document.getElementById('batch-stop-btn').textContent = 'Stop';

  const delay = parseInt(document.getElementById('batch-delay').value)||1000;
  const total = _batchFiles.length;
  const ent = entGetState();
  const insuredList = ent.insureds.map(i=>({id:i.id,name:i.name}));

  for(let i=0; i<total; i++){
    if(_batchStop) break;
    const file = _batchFiles[i];
    const pct = Math.round((i/total)*100);
    document.getElementById('batch-progress-bar').style.width = pct+'%';
    document.getElementById('batch-progress-label').textContent =
      `[${i+1}/${total}] ${file.name}`;

    try{
      const fd = new FormData();
      fd.append('file', file);
      fd.append('insureds', JSON.stringify(insuredList));
      const res = await fetch(BACKEND+'/ingest-email',{method:'POST',body:fd, headers: authHeaders()});
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      if(data.error) throw new Error(data.error);

      const note = data.note||{};
      const match = data.match||{};
      const emailData = {from:data.from||'',to:data.to||'',body:stripEmailChain(data.body||'')};

      // Save contacts returned directly from backend
      if(data.contacts && data.contacts.length) upsertContacts(data.contacts, match.matched_name||'');

      if(match.confidence==='high' && match.matched_id){
        // Auto-save
        batchAutoSave(note, match, ent);
        _batchStats.saved++;
      } else {
        // Queue for review
        _batchQueue.push({file:file.name, note, match, emailData, insuredList:[...ent.insureds].sort((a,b)=>a.name.localeCompare(b.name))});
        _batchStats.queue++;
      }
    } catch(e){
      if(e.message.includes('Failed to fetch')||e.message.includes('NetworkError')){
        _batchStats.failed++;
      } else {
        _batchStats.skipped++;
        console.warn('Batch skip:', file.name, e.message);
      }
    }

    batchUpdateStats();
    if(i < total-1) await new Promise(r=>setTimeout(r,delay));
  }

  _batchRunning = false;
  document.getElementById('batch-progress-bar').style.width = '100%';
  document.getElementById('batch-progress-label').textContent = _batchStop ? 'Stopped.' : 'Complete.';

  // Show review queue if any
  if(_batchQueue.length){
    document.getElementById('batch-review-card').style.display = 'block';
    document.getElementById('review-count').textContent = _batchQueue.length;
    renderReviewItem();
  } else {
    showBatchSummary();
  }
}

function isDuplicateNote(ins, note){
  // Check if a note with same date and same parties already exists
  const d = (note.date||'').trim();
  const p = (note.parties||'').trim().toLowerCase().slice(0,40);
  return (ins.notes||[]).some(n =>
    (n.date||'').trim() === d &&
    (n.parties||'').trim().toLowerCase().slice(0,40) === p
  );
}

function batchAutoSave(note, match, ent){
  const ins = ent.insureds.find(i=>i.id===match.matched_id);
  if(!ins) { handleMissingLocalInsured(match.matched_id, 'batch auto-save'); return; }
  if(!ins.notes) ins.notes=[];
  // Skip if duplicate
  if(isDuplicateNote(ins, note)){
    _batchStats.skipped++;
    return;
  }
  const noteObj = {
    id:'note-'+Date.now()+'-'+Math.random().toString(36).slice(2,5),
    date:note.date||'',
    handler:note.handler||'',
    parties:note.parties||'',
    summary:note.summary||'',
    actions:note.actions||[],
    statusChange:note.statusChange||'',
    docType:note.docType||'general-correspondence',
    terms:note.terms||{},
    enquiryId:'',
    source:'batch-auto'
  };
  ins.notes.push(noteObj);
  // Save document if present
  if(note.document && note.document.content){
    if(!ins.documents) ins.documents=[];
    ins.documents.push({
      id:'doc-'+Date.now()+'-'+Math.random().toString(36).slice(2,5),
      date:note.date||'',
      type:note.document.type||'',
      title:note.document.title||'',
      content:note.document.content||'',
      source:'batch-auto'
    });
  }
  // Save loss record entries if present
  if(note.lossRecord && note.lossRecord.length){
    if(!ins.lossRecord) ins.lossRecord=[];
    note.lossRecord.forEach(lr=>{
      const exists = ins.lossRecord.some(x=>x.year===lr.year);
      if(!exists) ins.lossRecord.push(lr);
    });
  }
  entSave(ent);
}

function renderReviewItem(){
  const remaining = _batchQueue.slice(_reviewIdx);
  document.getElementById('review-count').textContent = remaining.length + ' remaining';
  if(!remaining.length){
    document.getElementById('batch-review-card').style.display = 'none';
    showBatchSummary();
    return;
  }
  const item = remaining[0];
  const note = item.note||{};
  const match = item.match||{};
  const confColour = {high:'var(--ok)',medium:'var(--warn)',low:'var(--err)'}[match.confidence]||'var(--text2)';
  const currentEnt = entGetState();
  const freshList = [...(currentEnt.insureds||[])].sort((a,b)=>a.name.localeCompare(b.name));
  const insuredOpts = freshList.map(i=>`<option value="${i.id}" ${i.id===match.matched_id?'selected':''}>${i.name}</option>`).join('');
  const aiInsuredName = (item.note && item.note.insuredName) || '';
  const fileBaseName = item.file ? item.file.replace(/RE_|FW_|re_|fw_/gi,'').replace(/_/g,' ').replace(/\.(msg|eml|txt)$/i,'').split(' - ')[0].trim() : '';
  const suggestedInsuredName = aiInsuredName || match.matched_name || fileBaseName || '';
  const currentYear = new Date().getFullYear();
  const actionLines = Array.isArray(note.actions) ? note.actions.filter(Boolean) : [];

  document.getElementById('review-item').innerHTML = `
    <div style="font-size:11px;color:var(--text2);margin-bottom:8px">📄 ${item.file}</div>
    <div style="padding:8px 12px;border-radius:6px;background:var(--bg);border:1px solid var(--border);font-size:12px;margin-bottom:12px">
      <span style="color:${confColour};font-weight:600">${match.confidence||'?'} confidence</span>
      ${match.matched_name ? ` — suggested: <strong>${match.matched_name}</strong>` : ' — no match found'}
      ${match.reason ? `<br><span class="muted">${match.reason}</span>` : ''}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-bottom:12px;font-size:12px">
      <div><div class="muted" style="font-size:10px">DATE</div><div>${note.date||'—'}</div></div>
      <div><div class="muted" style="font-size:10px">HANDLER</div><div>${note.handler||'—'}</div></div>
      <div style="grid-column:1/-1"><div class="muted" style="font-size:10px">PARTIES</div><div>${note.parties||'—'}</div></div>
      <div style="grid-column:1/-1"><div class="muted" style="font-size:10px">SUMMARY</div><div style="line-height:1.5">${note.summary||'—'}</div></div>
      ${actionLines.length ? `<div style="grid-column:1/-1"><div class="muted" style="font-size:10px">ACTIONS</div><div>${actionLines.join('<br>')}</div></div>` : ''}
    </div>

    <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:6px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="sh" style="font-size:12px;margin:0">Batch risk draft</div>
        <button class="btn sm" onclick="generateBatchRiskDraft()" id="batch-risk-generate-btn">Generate draft ↗</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;margin-bottom:10px">
        <div><label style="font-size:10px;display:block;margin-bottom:3px">ASSURED</label><input id="batch-risk-assured" type="text" value="${suggestedInsuredName}"></div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">STATUS</label>
          <select id="batch-risk-status">
            <option value="submission">Submission</option>
            <option value="in_market">In market</option>
            <option value="quoted">Quoted</option>
            <option value="firm_order">Firm order</option>
            <option value="bound">Bound</option>
            <option value="renewal_pending">Renewal pending</option>
          </select>
        </div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">PRODUCT</label><input id="batch-risk-product" type="text"></div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">YEAR</label><input id="batch-risk-year" type="number" value="${currentYear}"></div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">INCEPTION</label><input id="batch-risk-inception" type="date"></div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">EXPIRY</label><input id="batch-risk-expiry" type="date"></div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">CCY</label><input id="batch-risk-ccy" type="text" value="USD"></div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">PREMIUM</label><input id="batch-risk-premium" type="number" step="0.01"></div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">BROKERAGE %</label><input id="batch-risk-brokerage" type="number" step="0.01"></div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">RETAINED %</label><input id="batch-risk-retained" type="number" step="0.01" value="100"></div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">EST. GBP COMM</label><input id="batch-risk-comm" type="number" step="0.01"></div>
        <div style="grid-column:1/-1"><label style="font-size:10px;display:block;margin-bottom:3px">NOTES</label><textarea id="batch-risk-notes" rows="2">${(note.summary||'').replace(/</g,'&lt;')}</textarea></div>
      </div>
      <div id="batch-risk-msg" class="muted" style="font-size:11px;margin-bottom:8px"></div>
    </div>

    <div style="border-top:1px solid var(--border);padding-top:12px;margin-top:6px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div class="sh" style="font-size:12px;margin:0">Batch task drafts</div>
        <button class="btn sm" onclick="generateBatchTaskDrafts()" id="batch-task-generate-btn">Generate tasks ↗</button>
      </div>
      <div id="batch-task-list"></div>
      <div id="batch-task-msg" class="muted" style="font-size:11px;margin-top:6px"></div>
    </div>

    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn primary" onclick="reviewSave()" id="batch-review-save-btn">Save risk + tasks &amp; next →</button>
      <button class="btn" onclick="reviewSkip()">Skip →</button>
    </div>`;

  var defaultStatus = inferRiskStatusFromText(note.statusChange || note.summary || '');
  if(document.getElementById('batch-risk-status')) document.getElementById('batch-risk-status').value = defaultStatus || 'submission';
  generateBatchTaskDrafts();
}

function fillBatchRiskDraft(fields){
  fields = fields || {};
  var assured = fields.assured_name || fields.display_name || document.getElementById('batch-risk-assured').value || '';
  document.getElementById('batch-risk-assured').value = assured;
  document.getElementById('batch-risk-product').value = fields.product || document.getElementById('batch-risk-product').value || '';
  document.getElementById('batch-risk-status').value = fields.status || document.getElementById('batch-risk-status').value || 'submission';
  document.getElementById('batch-risk-year').value = fields.accounting_year || document.getElementById('batch-risk-year').value || new Date().getFullYear();
  document.getElementById('batch-risk-ccy').value = fields.currency || document.getElementById('batch-risk-ccy').value || 'USD';
  document.getElementById('batch-risk-inception').value = fields.inception_date || document.getElementById('batch-risk-inception').value || '';
  document.getElementById('batch-risk-expiry').value = fields.expiry_date || document.getElementById('batch-risk-expiry').value || '';
  document.getElementById('batch-risk-premium').value = fields.gross_premium || document.getElementById('batch-risk-premium').value || '';
  document.getElementById('batch-risk-brokerage').value = fields.brokerage_pct || document.getElementById('batch-risk-brokerage').value || '';
  document.getElementById('batch-risk-retained').value = (fields.retained_pct != null ? fields.retained_pct : (document.getElementById('batch-risk-retained').value || 100));
  document.getElementById('batch-risk-comm').value = fields.estimated_gbp_commission || document.getElementById('batch-risk-comm').value || '';
  document.getElementById('batch-risk-notes').value = fields.notes || document.getElementById('batch-risk-notes').value || '';
}

async function generateBatchRiskDraft(){
  var item = _batchQueue[_reviewIdx];
  if(!item) return;
  var btn = document.getElementById('batch-risk-generate-btn');
  var msg = document.getElementById('batch-risk-msg');
  try {
    if(btn){ btn.disabled = true; btn.textContent = 'Generating...'; }
    if(msg) msg.textContent = 'Generating risk draft...';
    var user = JSON.stringify({
      file: item.file,
      note: item.note || {},
      match: item.match || {},
      email_meta: item.emailData || {}
    });
    var text = await aiText({
      model:'claude-sonnet-4-20250514',
      max_tokens:700,
      system:`You are extracting a Lloyd's broker batch review risk draft from an ingested email. Return JSON only with these keys: assured_name, product, status, accounting_year, inception_date, expiry_date, currency, gross_premium, brokerage_pct, retained_pct, estimated_gbp_commission, notes, needs_review, review_reason. Do not invent numbers. Leave unknown values null or empty. status must be one of submission, in_market, quoted, firm_order, bound, renewal_pending. dates must be YYYY-MM-DD when known.`,
      user:user
    });
    var fields = {};
    try { fields = JSON.parse(text); } catch(e) { var m = text && text.match(/\{[\s\S]*\}/); if(m) fields = JSON.parse(m[0]); }
    fillBatchRiskDraft(fields || {});
    window._lastBatchRiskDraft = fields || {};
    if(msg) msg.textContent = 'Draft generated. Review and save.' + ((fields && fields.review_reason) ? ' ' + fields.review_reason : '');
  } catch(e) {
    console.error(e);
    if(msg) msg.textContent = 'Draft generation failed: ' + e.message;
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = 'Generate draft ↗'; }
  }
}

function renderBatchTaskDrafts(tasks){
  window._lastBatchTaskDrafts = tasks || [];
  var wrap = document.getElementById('batch-task-list');
  if(!wrap) return;
  if(!tasks || !tasks.length){
    wrap.innerHTML = '<div class="muted" style="font-size:11px">No task drafts.</div>';
    return;
  }
  wrap.innerHTML = tasks.map(function(t, idx){
    return `<div style="border:1px solid var(--border);border-radius:8px;padding:8px;margin-bottom:8px;background:var(--bg)">
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:8px;align-items:end">
        <div><label style="font-size:10px;display:block;margin-bottom:3px">TITLE</label><input data-btask="title" data-idx="${idx}" type="text" value="${(t.title||'').replace(/"/g,'&quot;')}"></div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">OWNER</label><input data-btask="owner" data-idx="${idx}" type="text" value="${(t.owner||'').replace(/"/g,'&quot;')}"></div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">PRIORITY</label>
          <select data-btask="priority" data-idx="${idx}">
            <option value="low" ${t.priority==='low'?'selected':''}>Low</option>
            <option value="normal" ${(!t.priority||t.priority==='normal')?'selected':''}>Normal</option>
            <option value="high" ${t.priority==='high'?'selected':''}>High</option>
            <option value="urgent" ${t.priority==='urgent'?'selected':''}>Urgent</option>
          </select>
        </div>
        <div><label style="font-size:10px;display:block;margin-bottom:3px">DUE</label><input data-btask="due_date" data-idx="${idx}" type="date" value="${t.due_date||''}"></div>
      </div>
      <div style="margin-top:8px"><label style="font-size:10px;display:block;margin-bottom:3px">DESCRIPTION</label><textarea data-btask="description" data-idx="${idx}" rows="2">${t.description||''}</textarea></div>
    </div>`;
  }).join('');
}

function syncBatchTaskDraftInputs(){
  var tasks = window._lastBatchTaskDrafts || [];
  document.querySelectorAll('[data-btask]').forEach(function(el){
    var idx = parseInt(el.getAttribute('data-idx'),10);
    var field = el.getAttribute('data-btask');
    if(tasks[idx]) tasks[idx][field] = el.value;
  });
  window._lastBatchTaskDrafts = tasks;
}

async function generateBatchTaskDrafts(){
  var item = _batchQueue[_reviewIdx];
  if(!item) return;
  var btn = document.getElementById('batch-task-generate-btn');
  var msg = document.getElementById('batch-task-msg');
  try {
    if(btn){ btn.disabled = true; btn.textContent = 'Generating...'; }
    var lines = Array.isArray(item.note && item.note.actions) ? item.note.actions.filter(Boolean) : [];
    var handler = (item.note && item.note.handler) || '';
    var tasks = lines.map(function(line){
      var lower = line.toLowerCase();
      var priority = /urgent|asap|today|immediately/.test(lower) ? 'urgent' : /chase|firm|quoted|bind|renewal|deadline|before/.test(lower) ? 'high' : 'normal';
      return {title: line.length > 120 ? line.slice(0,117)+'...' : line, description: line, owner: handler, priority: priority, due_date:'', status:'open', source:'batch_ingest_ai_actions'};
    });
    renderBatchTaskDrafts(tasks);
    if(msg) msg.textContent = tasks.length ? 'Task drafts generated from AI actions.' : 'No actions found to turn into tasks.';
  } catch(e) {
    console.error(e);
    if(msg) msg.textContent = 'Task draft generation failed: ' + e.message;
  } finally {
    if(btn){ btn.disabled = false; btn.textContent = 'Generate tasks ↗'; }
  }
}

async function saveBatchTaskDrafts(riskId){
  syncBatchTaskDraftInputs();
  var tasks = (window._lastBatchTaskDrafts || []).filter(function(t){ return (t.title||'').trim(); });
  var saved = 0;
  for(var i=0;i<tasks.length;i++){
    var t = tasks[i];
    await apiFetch('/tasks', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        risk_id: riskId,
        title: (t.title||'').trim(),
        description: (t.description||'').trim(),
        owner: (t.owner||'').trim(),
        priority: t.priority || 'normal',
        status: 'open',
        due_date: t.due_date || null,
        source: t.source || 'batch_ingest_ai_actions'
      })
    });
    saved += 1;
  }
  return {saved:saved};
}
function toggleCreateInsured(){
  const form = document.getElementById('review-create-form');
  const btn = document.getElementById('review-create-toggle');
  const visible = form.style.display !== 'none';
  form.style.display = visible ? 'none' : 'block';
  btn.textContent = visible ? '+ New insured' : '✕ Cancel';
  // Clear the existing insured select when creating new
  if(!visible) document.getElementById('review-insured-sel').value = '';
}

function reviewPopEnquiry(){
  const insId = document.getElementById('review-insured-sel').value;
  const wrap = document.getElementById('review-enq-wrap');
  const sel = document.getElementById('review-enquiry-sel');
  if(!insId){wrap.style.display='none';return;}
  wrap.style.display='block';
  const ent = entGetState();
  const ins = ent.insureds.find(i=>i.id===insId);
  sel.innerHTML = '<option value="">— select —</option>';
  if(ins){
    [...ins.enquiries].reverse().forEach(e=>{
      const o=document.createElement('option');
      o.value=e.id;
      o.textContent=(e.inceptionDate||'No date')+' · '+(e.status||'—');
      sel.appendChild(o);
    });
    if(ins.enquiries.length) sel.value=ins.enquiries[ins.enquiries.length-1].id;
  }
}

function reviewSave(){
  const item = _batchQueue[_reviewIdx];
  if(!item){ return; }
  const assured = (document.getElementById('batch-risk-assured').value||'').trim();
  if(!assured){ showNotice('Assured name required','err'); return; }
  const saveBtn = document.getElementById('batch-review-save-btn');
  const msg = document.getElementById('batch-risk-msg');
  const taskMsg = document.getElementById('batch-task-msg');
  const payload = {
    assured_name: assured,
    display_name: assured,
    producer: '',
    handler: ((item.note||{}).handler || '').trim(),
    region: '',
    product: (document.getElementById('batch-risk-product').value||'').trim(),
    layer: '',
    status: document.getElementById('batch-risk-status').value || 'submission',
    accounting_year: parseInt(document.getElementById('batch-risk-year').value || new Date().getFullYear(),10),
    inception_date: document.getElementById('batch-risk-inception').value || null,
    expiry_date: document.getElementById('batch-risk-expiry').value || null,
    currency: document.getElementById('batch-risk-ccy').value || 'USD',
    gross_premium: parseFloat(document.getElementById('batch-risk-premium').value) || null,
    brokerage_pct: parseFloat(document.getElementById('batch-risk-brokerage').value) || null,
    retained_pct: parseFloat(document.getElementById('batch-risk-retained').value) || null,
    estimated_gbp_commission: parseFloat(document.getElementById('batch-risk-comm').value) || null,
    notes: (document.getElementById('batch-risk-notes').value || '').trim(),
    ai_extracted: window._lastBatchRiskDraft || {},
    needs_review: true,
    review_reason: ((window._lastBatchRiskDraft||{}).review_reason || 'Created from batch ingest review')
  };
  (async function(){
    try {
      if(saveBtn){ saveBtn.disabled = true; saveBtn.textContent = 'Saving...'; }
      var row = await apiFetch('/risks', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
      var taskResult = await saveBatchTaskDrafts(row.id);
      _batchStats.saved++;
      _batchStats.queue = Math.max(0,_batchStats.queue-1);
      batchUpdateStats();
      if(msg) msg.textContent = 'Saved to Railway risk ledger' + (taskResult.saved ? ' with ' + taskResult.saved + ' task' + (taskResult.saved===1?'':'s') + '.' : '.');
      if(taskMsg && taskResult.saved) taskMsg.textContent = taskResult.saved + ' task draft' + (taskResult.saved===1?'':'s') + ' saved to WIP.';
      showNotice('✓ Saved ' + (row.assured_name || assured) + (taskResult.saved ? ' · ' + taskResult.saved + ' task' + (taskResult.saved===1?'':'s') + ' created' : ''), 'ok');
      _reviewIdx++;
      renderReviewItem();
    } catch(e) {
      console.error(e);
      if(msg) msg.textContent = 'Save failed: ' + e.message;
      showNotice('Batch risk save failed: ' + e.message, 'err');
    } finally {
      if(saveBtn){ saveBtn.disabled = false; saveBtn.textContent = 'Save risk + tasks & next →'; }
    }
  })();
}

function reviewSkip(){
  _batchStats.queue = Math.max(0,_batchStats.queue-1);
  batchUpdateStats();
  _reviewIdx++;
  renderReviewItem();
}

function reviewNext(){ renderReviewItem(); }

function reviewCreateAndSave(){
  const name = (document.getElementById('review-new-name').value||'').trim();
  if(!name){ showNotice('Insured name required','err'); return; }
  const assuredInput = document.getElementById('batch-risk-assured');
  if(assuredInput) assuredInput.value = name;
  reviewSave();
}

function showBatchSummary(){
  document.getElementById('batch-summary-card').style.display = 'block';
  document.getElementById('batch-summary-text').innerHTML =
    `<strong>${_batchStats.saved}</strong> notes saved · ` +
    `<strong>${_batchStats.failed}</strong> failed · ` +
    `<strong>${_batchStats.skipped}</strong> skipped<br>` +
    `<span class="muted" style="font-size:12px">Contacts address book updated from all successfully parsed emails.</span>`;
}


// ─── CONTACTS ────────────────────────────────────────────────────────────────

function renderContacts(){
  const s = gs();
  const q = (document.getElementById('con-search')||{}).value||'';
  const lq = q.toLowerCase();
  const all = s.contacts||[];
  const filtered = lq ? all.filter(c =>
    (c.name||'').toLowerCase().includes(lq) ||
    (c.email||'').toLowerCase().includes(lq) ||
    (c.firm||'').toLowerCase().includes(lq) ||
    (c.phone||'').toLowerCase().includes(lq)
  ) : all;
  const sorted = [...filtered].sort((a,b)=>(a.name||'').localeCompare(b.name||''));
  document.getElementById('con-count').textContent = filtered.length+' of '+all.length+' contacts';
  const list = document.getElementById('con-list');
  if(!sorted.length){
    list.innerHTML='<p class="muted">No contacts yet. Add manually or ingest emails to build the address book automatically.</p>';
    return;
  }
  list.innerHTML = `<table style="width:100%">
    <tr><th>Name</th><th>Email</th><th>Phone</th><th>Firm</th><th>Role</th><th>Last seen</th><th></th></tr>
    ${sorted.map(c=>`<tr>
      <td><strong>${c.name||'—'}</strong></td>
      <td>${c.email ? `<a href="mailto:${c.email}" style="color:var(--accent)">${c.email}</a>` : '—'}</td>
      <td>${c.phone||'—'}</td>
      <td>${c.firm||'—'}</td>
      <td><span class="muted" style="font-size:11px">${c.role||'—'}</span></td>
      <td><span class="muted" style="font-size:11px">${c.lastSeen||c.source||'—'}</span></td>
      <td style="white-space:nowrap">
        <button class="btn sm" onclick="openEditContact('${c.id}')">Edit</button>
        <button class="btn sm" onclick="deleteContact('${c.id}')" style="color:var(--err);border-color:var(--err)40;margin-left:4px">✕</button>
      </td>
    </tr>`).join('')}
  </table>`;
}

function openAddContact(){
  ['con-name','con-email','con-phone','con-firm','con-role','con-notes','con-edit-id'].forEach(id=>{
    document.getElementById(id).value='';
  });
  document.getElementById('con-modal-title').textContent='Add contact';
  document.getElementById('con-delete-btn').style.display='none';
  document.getElementById('con-modal').style.display='block';
}

function openEditContact(id){
  const s=gs();
  const c=(s.contacts||[]).find(x=>x.id===id);
  if(!c) return;
  document.getElementById('con-name').value=c.name||'';
  document.getElementById('con-email').value=c.email||'';
  document.getElementById('con-phone').value=c.phone||'';
  document.getElementById('con-firm').value=c.firm||'';
  document.getElementById('con-role').value=c.role||'';
  document.getElementById('con-notes').value=c.notes||'';
  document.getElementById('con-edit-id').value=id;
  document.getElementById('con-modal-title').textContent='Edit contact';
  document.getElementById('con-delete-btn').style.display='inline-block';
  document.getElementById('con-modal').style.display='block';
}

function saveContact(){
  const s=gs();
  if(!s.contacts) s.contacts=[];
  const editId=document.getElementById('con-edit-id').value.trim();
  const name=document.getElementById('con-name').value.trim();
  const email=document.getElementById('con-email').value.trim().toLowerCase();
  if(!name&&!email){showNotice('Name or email required','err');return;}
  if(editId){
    const idx=s.contacts.findIndex(c=>c.id===editId);
    if(idx>-1){
      s.contacts[idx]={...s.contacts[idx],name,email,
        phone:document.getElementById('con-phone').value.trim(),
        firm:document.getElementById('con-firm').value.trim(),
        role:document.getElementById('con-role').value.trim(),
        notes:document.getElementById('con-notes').value.trim()};
    }
  } else {
    // Check for duplicate email
    const exists=email&&s.contacts.find(c=>c.email===email);
    if(exists){showNotice('Contact with this email already exists','err');return;}
    s.contacts.push({
      id:'con-'+Date.now(),
      name, email,
      phone:document.getElementById('con-phone').value.trim(),
      firm:document.getElementById('con-firm').value.trim(),
      role:document.getElementById('con-role').value.trim(),
      notes:document.getElementById('con-notes').value.trim(),
      source:'manual',
      lastSeen:new Date().toISOString().slice(0,10)
    });
  }
  ss(s);
  document.getElementById('con-modal').style.display='none';
  renderContacts();
}

function deleteContact(id){
  const targetId = id || document.getElementById('con-edit-id').value;
  if(!targetId) return;
  if(!confirm('Delete this contact?')) return;
  const s=gs();
  s.contacts=(s.contacts||[]).filter(c=>c.id!==targetId);
  ss(s);
  const modal=document.getElementById('con-modal');
  if(modal) modal.style.display='none';
  renderContacts();
}

// Upsert contacts extracted from email ingest
// Called with raw email data (from, to, body) and optionally insured name
async function extractAndUpsertContacts(emailData, insuredName){
  const key = getKey();
  if(!key) return; // no API key, skip silently
  try{
    const sys = `You are an assistant extracting contact information from emails.
Extract all people mentioned in the From, To, CC fields and email signature.
For each person return: name, email, phone (if present in signature), firm/company, role/title (if present).
Phone numbers may appear as Tel:, Ph:, T:, Mobile:, M: etc.
Return ONLY valid JSON array, no markdown, no preamble:
[{"name":"","email":"","phone":"","firm":"","role":""}]
If no contacts found return [].`;
    const user = `Email data:
From: ${emailData.from||''}
To: ${emailData.to||''}
Body:
${(emailData.body||'').slice(0,3000)}`;
    const raw = await aiText({
      model:'claude-sonnet-4-20250514',
      max_tokens:600,
      system:sys,
      user:user
    });
    const clean = raw.replace(/```json|```/g,'').trim();
    const extracted = JSON.parse(clean);
    if(!Array.isArray(extracted)||!extracted.length) return;
    const s = gs();
    if(!s.contacts) s.contacts=[];
    const today = new Date().toISOString().slice(0,10);
    let added=0, updated=0;
    extracted.forEach(c=>{
      if(!c.name&&!c.email) return;
      const email=(c.email||'').trim().toLowerCase();
      const existing = email ? s.contacts.find(x=>x.email===email) : null;
      if(existing){
        // Upsert — update fields if we have better data
        if(c.name&&!existing.name) existing.name=c.name;
        if(c.phone&&!existing.phone) existing.phone=c.phone;
        if(c.firm&&!existing.firm) existing.firm=c.firm;
        if(c.role&&!existing.role) existing.role=c.role;
        existing.lastSeen=today;
        updated++;
      } else {
        s.contacts.push({
          id:'con-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),
          name:c.name||'', email,
          phone:c.phone||'', firm:c.firm||'', role:c.role||'',
          notes: insuredName ? 'Re: '+insuredName : '',
          source:'ingest', lastSeen:today
        });
        added++;
      }
    });
    ss(s);
    if(added||updated) console.log(`Contacts: +${added} added, ${updated} updated`);
  } catch(e){
    console.warn('Contact extraction failed silently:', e.message);
  }
}


// ─── BOOK REGISTER ───────────────────────────────────────────────────────────

const BOOK_ROWS_SEED = [
  {"id":"seed-2024-fg-ship-bunkers","assured":"FG Ship Bunkers","displayName":"FG Ship Bunkers","producer":"AIB","ccy":"USD","inception":"01/01/2024","expiry":"31/12/2024","accountingYear":"2024","premium":50000,"order":100,"brokerage":25,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Renewed","layer":"","adjustable":false,"pc":false,"notes":"Approx USD ~12,500 GBP comm"},
  {"id":"seed-2024-ekol-lojistik","assured":"Ekol Lojistik AS","displayName":"Ekol Lojistik AS","producer":"Integra","ccy":"EUR","inception":"15/02/2024","expiry":"30/06/2025","accountingYear":"2024","premium":281384,"order":100,"brokerage":20,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Renewed","layer":"","adjustable":false,"pc":false,"notes":"Approx EUR ~56,277 GBP comm"},
  {"id":"seed-2024-gefco","assured":"Gefco Tasimacilik Ve Lojistik AS","displayName":"Gefco Tasimacilik Ve Lojistik AS","producer":"Integra","ccy":"EUR","inception":"29/03/2024","expiry":"28/03/2025","accountingYear":"2024","premium":390000,"order":100,"brokerage":20,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Lapsed","layer":"","adjustable":false,"pc":false,"notes":"Approx EUR ~78,000 GBP comm"},
  {"id":"seed-2024-semillas-batlle","assured":"Semillas Batlle","displayName":"Semillas Batlle","producer":"ARB International / ARB Europe","ccy":"EUR","inception":"01/06/2024","expiry":"31/05/2025","accountingYear":"2024","premium":52500,"order":100,"brokerage":7.5,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Lapsed","layer":"","adjustable":false,"pc":false,"notes":"Approx EUR ~3,938 GBP comm"},
  {"id":"seed-2024-herb-pharm","assured":"Herb Pharm LLC","displayName":"Herb Pharm LLC","producer":"Hull & Co","ccy":"USD","inception":"06/06/2024","expiry":"05/06/2025","accountingYear":"2024","premium":60000,"order":100,"brokerage":27.5,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Lapsed","layer":"","adjustable":false,"pc":false,"notes":"Approx USD ~16,500 GBP comm"},
  {"id":"seed-2024-hakan-gida","assured":"Hakan Gida","displayName":"Hakan Gida","producer":"Integra","ccy":"USD","inception":"08/08/2024","expiry":"07/08/2025","accountingYear":"2024","premium":350000,"order":100,"brokerage":20,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Lapsed","layer":"","adjustable":false,"pc":false,"notes":"Approx USD ~70,000 GBP comm"},
  {"id":"seed-2024-brimich","assured":"Brimich Logistics and Packaging Inc","displayName":"Brimich Logistics and Packaging Inc","producer":"JonasRe Ltd","ccy":"CAD","inception":"20/08/2024","expiry":"19/08/2025","accountingYear":"2024","premium":30000,"order":100,"brokerage":20,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Lapsed","layer":"","adjustable":false,"pc":false,"notes":"Approx CAD ~6,000 GBP comm"},
  {"id":"seed-2024-sunel-tobacco","assured":"Sunel Tobacco","displayName":"Sunel Tobacco","producer":"Integra","ccy":"USD","inception":"02/09/2024","expiry":"01/09/2025","accountingYear":"2024","premium":260000,"order":100,"brokerage":14,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Lapsed","layer":"","adjustable":false,"pc":false,"notes":"Approx USD ~36,450 GBP comm"},
  {"id":"seed-2024-gny-global","assured":"GNY Global Lojistik Depolama Tasimacilik Ticaret AS","displayName":"GNY Global Lojistik Depolama Tasimacilik Ticaret AS","producer":"Integra","ccy":"USD","inception":"26/10/2024","expiry":"25/10/2025","accountingYear":"2024","premium":35000,"order":100,"brokerage":20,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Lapsed","layer":"","adjustable":false,"pc":false,"notes":"Approx USD ~7,000 GBP comm"},
  {"id":"seed-2024-asbas-marine","assured":"Asbas Marine","displayName":"Asbas Marine","producer":"Integra","ccy":"USD","inception":"02/11/2024","expiry":"01/11/2025","accountingYear":"2024","premium":22035,"order":100,"brokerage":22.5,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Lapsed","layer":"","adjustable":false,"pc":false,"notes":"Approx USD ~4,958 GBP comm"},
  {"id":"seed-2024-sunset-converting","assured":"Sunset Converting Corp","displayName":"Sunset Converting Corp","producer":"Langelier","ccy":"USD","inception":"22/12/2024","expiry":"05/03/2026","accountingYear":"2024","premium":24655,"order":100,"brokerage":27.5,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Renewed","layer":"","adjustable":false,"pc":false,"notes":"Approx USD ~6,780 GBP comm. Extended to 05/03/2026 via EN1."}
  ,{"id":"seed-2026-ppaq","assured":"PPAQ — Producteurs et Productrices Acericoles du Quebec","displayName":"PPAQ (Maple Syrup STP)","producer":"Langelier","ccy":"CAD","inception":"22/12/2025","expiry":"21/12/2026","accountingYear":"2026","premium":355279,"order":100,"brokerage":27.5,"retainedPct":100,"gbpComm":56667,"retainedComm":56667,"status":"Bound","layer":"Primary + XS","adjustable":false,"pc":true,"notes":"CAD 75M primary (Aviva lead) + CAD 100M xs 75M (Talbot lead). CAD 97,702 comm @ 0.58"}
  ,{"id":"seed-2026-ceva","assured":"CEVA Lojistik / Borusan Vehicle Logistics","displayName":"CEVA / Borusan (Marine Cargo RI)","producer":"Integra","ccy":"EUR","inception":"29/03/2026","expiry":"28/03/2027","accountingYear":"2026","premium":565000,"order":100,"brokerage":13.72,"retainedPct":100,"gbpComm":65257,"retainedComm":65257,"status":"Bound","layer":"","adjustable":true,"pc":true,"notes":"MDP EUR 565k adjustable. Landmark 100% line to stand. EUR 77,687 comm @ 0.84"}
  ,{"id":"seed-2026-strides","assured":"Strides Pharma Inc","displayName":"Strides Pharma Inc","producer":"Prudent Insurance Brokers","ccy":"USD","inception":"01/02/2026","expiry":"31/01/2027","accountingYear":"2026","premium":null,"order":100,"brokerage":null,"retainedPct":100,"gbpComm":24279,"retainedComm":24279,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"Feb 2026 GBP income £24,279"}
  ,{"id":"seed-2026-ink","assured":"Ink Consulting SARL","displayName":"Ink Consulting SARL","producer":"Ink Consulting SARL","ccy":"USD","inception":"01/04/2026","expiry":"31/03/2027","accountingYear":"2026","premium":null,"order":100,"brokerage":null,"retainedPct":100,"gbpComm":10484,"retainedComm":10484,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"Apr 2026 GBP income £10,484"}
  ,{"id":"seed-2026-yaafar","assured":"YAAFAR INTERNACIONAL S.A.","displayName":"Yaafar Internacional","producer":"Latam Re","ccy":"USD","inception":"01/04/2026","expiry":"31/03/2027","accountingYear":"2026","premium":null,"order":100,"brokerage":null,"retainedPct":100,"gbpComm":8562,"retainedComm":8562,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"Apr 2026 GBP income £8,562"}
  ,{"id":"seed-2026-cobantur","assured":"Cobantur Logistics","displayName":"Cobantur Logistics","producer":"Integra","ccy":"EUR","inception":"01/02/2026","expiry":"31/01/2027","accountingYear":"2026","premium":null,"order":100,"brokerage":null,"retainedPct":100,"gbpComm":6005,"retainedComm":6005,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"Feb 2026 GBP income £6,005"}
  ,{"id":"seed-2026-sasa","assured":"SASA Polyester","displayName":"SASA Polyester","producer":"Integra","ccy":"USD","inception":"01/02/2026","expiry":"31/01/2027","accountingYear":"2026","premium":null,"order":100,"brokerage":null,"retainedPct":100,"gbpComm":4625,"retainedComm":4625,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"Feb 2026 GBP income £4,625"}
  ,{"id":"seed-2026-fg-jan","assured":"FG Ship Bunkers","displayName":"FG Ship Bunkers (Jan)","producer":"AIB","ccy":"USD","inception":"01/01/2026","expiry":"31/01/2026","accountingYear":"2026","premium":50000,"order":100,"brokerage":10,"retainedPct":100,"gbpComm":3950,"retainedComm":3950,"status":"Bound","layer":"Jan renewal","adjustable":false,"pc":false,"notes":"USD 5,000 comm @ 0.79"}
  ,{"id":"seed-2026-fg-feb","assured":"FG Ship Bunkers","displayName":"FG Ship Bunkers (Feb renewal)","producer":"AIB","ccy":"USD","inception":"01/02/2026","expiry":"31/12/2026","accountingYear":"2026","premium":30000,"order":100,"brokerage":16.67,"retainedPct":100,"gbpComm":3950,"retainedComm":3950,"status":"Bound","layer":"Feb renewal","adjustable":false,"pc":false,"notes":"USD 5,000 comm @ 0.79"}
  ,{"id":"seed-2026-pars","assured":"PARS Demiryolu","displayName":"PARS Demiryolu İşletmeciliği","producer":"Integra","ccy":"EUR","inception":"07/04/2026","expiry":"06/04/2027","accountingYear":"2026","premium":19500,"order":100,"brokerage":20,"retainedPct":100,"gbpComm":3276,"retainedComm":3276,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"EUR 3,900 comm @ 0.84"}
  ,{"id":"seed-2026-mote","assured":"Mote Marine Laboratory Inc","displayName":"Mote Marine Laboratory Inc","producer":"RT Specialty","ccy":"USD","inception":"01/01/2026","expiry":"31/12/2026","accountingYear":"2026","premium":null,"order":100,"brokerage":null,"retainedPct":100,"gbpComm":1855,"retainedComm":1855,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"Jan 2026 GBP income £1,855"}
  ,{"id":"seed-2026-tech-enerji","assured":"Tech Enerji Danismanlik Ltd STI","displayName":"Tech Enerji Danismanlik","producer":"Integra","ccy":"EUR","inception":"01/04/2026","expiry":"31/03/2027","accountingYear":"2026","premium":null,"order":100,"brokerage":null,"retainedPct":100,"gbpComm":1213,"retainedComm":1213,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"Apr 2026 GBP income £1,213"}
  ,{"id":"seed-2026-sunset","assured":"Sunset Converting Corp","displayName":"Sunset Converting Corp","producer":"Langelier","ccy":"USD","inception":"05/03/2026","expiry":"04/03/2027","accountingYear":"2026","premium":20000,"order":100,"brokerage":10,"retainedPct":100,"gbpComm":1580,"retainedComm":1580,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"USD 2,000 comm @ 0.79"}
  ,{"id":"seed-2026-semex-ca","assured":"Semex Canada","displayName":"Semex Canada","producer":"Langelier","ccy":"CAD","inception":"01/01/2026","expiry":"31/12/2026","accountingYear":"2026","premium":null,"order":100,"brokerage":null,"retainedPct":100,"gbpComm":464,"retainedComm":464,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"Jan 2026 GBP income £464"}
  ,{"id":"seed-2026-semex-inc","assured":"Semex Inc","displayName":"Semex Inc","producer":"Langelier","ccy":"USD","inception":"01/02/2026","expiry":"31/01/2027","accountingYear":"2026","premium":null,"order":100,"brokerage":null,"retainedPct":100,"gbpComm":368,"retainedComm":368,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"Feb 2026 GBP income £368"}
  ,{"id":"seed-2026-distribeaute","assured":"Distribeaute SA","displayName":"Distribeaute SA","producer":"Latam Re","ccy":"USD","inception":"01/02/2026","expiry":"31/01/2027","accountingYear":"2026","premium":null,"order":100,"brokerage":null,"retainedPct":100,"gbpComm":184,"retainedComm":184,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"Feb 2026 net: £1,839 - £1,655 reversal = £184"}
  ,{"id":"seed-2026-merits","assured":"Merits Health Products Inc","displayName":"Merits Health Products Inc","producer":"RT Specialty","ccy":"USD","inception":"01/01/2026","expiry":"31/12/2026","accountingYear":"2026","premium":null,"order":100,"brokerage":null,"retainedPct":100,"gbpComm":103,"retainedComm":103,"status":"Bound","layer":"","adjustable":false,"pc":false,"notes":"Jan 2026 GBP income £103"}
  ,{"id":"seed-2026-ekol","assured":"Ekol Lojistik AS","displayName":"Ekol Lojistik AS (WHLL)","producer":"Integra","ccy":"EUR","inception":"01/07/2026","expiry":"30/06/2027","accountingYear":"2026","premium":1013000,"order":100,"brokerage":21,"retainedPct":100,"gbpComm":null,"retainedComm":null,"status":"Bound","layer":"4-layer WHLL programme","adjustable":false,"pc":false,"notes":"EUR 1,013,000 gross. gbpComm TBC from accounting — approx £179k expected"}
]

function getBookState(){
  const s = gs();
  if(!s.bookRows || !s.bookRows.length){
    s.bookRows = JSON.parse(JSON.stringify(BOOK_ROWS_SEED));
    ss(s);
  }
  return s;
}

function isoToUk(iso){
  if(!iso) return '—';
  var s = String(iso).slice(0,10);
  var p = s.split('-');
  if(p.length !== 3) return s;
  return p[2] + '/' + p[1] + '/' + p[0];
}

function mapBackendRiskToBookRow(r){
  var comm = r.locked_gbp_commission != null && r.locked_gbp_commission !== 0 ? r.locked_gbp_commission : r.estimated_gbp_commission;
  return {
    id: String(r.id),
    assured: r.assured_name,
    displayName: r.display_name || r.assured_name,
    producer: r.producer || '',
    ccy: r.currency || 'USD',
    inception: isoToUk(r.inception_date),
    expiry: isoToUk(r.expiry_date),
    accountingYear: String(r.accounting_year || ''),
    premium: r.gross_premium,
    order: r.order_pct,
    brokerage: r.brokerage_pct,
    retainedPct: r.retained_pct,
    gbpComm: comm,
    retainedComm: null,
    status: r.status_label || riskStatusLabel(r.status),
    layer: r.layer || '',
    adjustable: !!r.adjustable,
    pc: !!r.profit_commission_expected,
    notes: r.notes || '',
    ledger: [],
    _backend: true,
    _estimatedGbp: r.estimated_gbp_commission,
    _lockedGbp: r.locked_gbp_commission,
    _raw: r
  };
}

async function fetchPortfolioRows(year, q, statusF){
  var qs = new URLSearchParams({ year: String(year) });
  if(q) qs.set('q', q);
  if(statusF) qs.set('status', statusF);
  var data = await apiFetch('/portfolio-by-year?' + qs.toString());
  return {
    items: (data.items || []).map(mapBackendRiskToBookRow),
    totals: data.totals || {}
  };
}

function entView(view){
  document.getElementById('ent-accounts-view').style.display = view==='accounts' ? 'block' : 'none';
  document.getElementById('ent-book-view').style.display = view==='book' ? 'block' : 'none';
  var dashEl=document.getElementById('ent-dashboard-view');if(dashEl)dashEl.style.display=view==='dashboard'?'block':'none';
  document.getElementById('ent-tab-accounts').classList.toggle('active', view==='accounts');
  document.getElementById('ent-tab-book').classList.toggle('active', view==='book');
  var dashBtn=document.getElementById('ent-tab-dashboard');if(dashBtn)dashBtn.classList.toggle('active',view==='dashboard');
  if(view==='book') renderBook();
  if(view==='dashboard') renderDashboard();
}



function openRiskModal(){
  var yearEl=document.getElementById('book-year');
  document.getElementById('risk-year').value=(yearEl&&yearEl.value)||new Date().getFullYear();
  document.getElementById('risk-status').value='bound';
  ['risk-assured','risk-display','risk-producer','risk-handler','risk-region','risk-product','risk-layer','risk-inception','risk-expiry','risk-premium','risk-order','risk-brokerage','risk-retained','risk-est-gbp','risk-locked-gbp','risk-notes'].forEach(function(id){ var el=document.getElementById(id); if(el) el.value=''; });
  document.getElementById('risk-currency').value='USD';
  document.getElementById('risk-adjustable').checked=false;
  document.getElementById('risk-pc').checked=false;
  document.getElementById('risk-modal').style.display='block';
}

function closeRiskModal(){
  var el=document.getElementById('risk-modal');
  if(el) el.style.display='none';
}

async function saveRiskModal(){
  var assured=(document.getElementById('risk-assured').value||'').trim();
  if(!assured){ showNotice('Assured name required','err'); return; }
  var spin=document.getElementById('risk-modal-spin');
  if(spin) spin.style.display='inline';
  try {
    var payload={
      assured_name: assured,
      display_name: (document.getElementById('risk-display').value||'').trim() || null,
      producer: (document.getElementById('risk-producer').value||'').trim() || null,
      handler: document.getElementById('risk-handler').value || null,
      region: (document.getElementById('risk-region').value||'').trim() || null,
      product: (document.getElementById('risk-product').value||'').trim() || null,
      layer: (document.getElementById('risk-layer').value||'').trim() || null,
      status: document.getElementById('risk-status').value,
      accounting_year: parseInt(document.getElementById('risk-year').value,10),
      inception_date: document.getElementById('risk-inception').value || null,
      expiry_date: document.getElementById('risk-expiry').value || null,
      currency: document.getElementById('risk-currency').value || 'USD',
      gross_premium: document.getElementById('risk-premium').value ? parseFloat(document.getElementById('risk-premium').value) : null,
      order_pct: document.getElementById('risk-order').value ? parseFloat(document.getElementById('risk-order').value) : null,
      brokerage_pct: document.getElementById('risk-brokerage').value ? parseFloat(document.getElementById('risk-brokerage').value) : null,
      retained_pct: document.getElementById('risk-retained').value ? parseFloat(document.getElementById('risk-retained').value) : null,
      estimated_gbp_commission: document.getElementById('risk-est-gbp').value ? parseFloat(document.getElementById('risk-est-gbp').value) : null,
      locked_gbp_commission: document.getElementById('risk-locked-gbp').value ? parseFloat(document.getElementById('risk-locked-gbp').value) : null,
      adjustable: document.getElementById('risk-adjustable').checked,
      profit_commission_expected: document.getElementById('risk-pc').checked,
      notes: (document.getElementById('risk-notes').value||'').trim() || null
    };
    if(!payload.accounting_year || Number.isNaN(payload.accounting_year)) throw new Error('Accounting year required');
    await apiFetch('/risks', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
    closeRiskModal();
    showNotice('✓ Risk created','ok');
    renderBook();
  } catch(e){
    showNotice('Create risk failed: '+e.message,'err');
  } finally {
    if(spin) spin.style.display='none';
  }
}

async function renderBook(){
  const year = document.getElementById('book-year').value;
  const q = (document.getElementById('book-search').value || '').trim().toLowerCase();
  const statusF = document.getElementById('book-status').value;
  const showMkt = window._bookShowMarket || false;
  const tbody = document.getElementById('book-tbody');
  const tfoot = document.getElementById('book-tfoot');
  const thead = document.querySelector('#book-table thead tr');

  const is2026 = year === '2026';
  if(thead){
    thead.innerHTML = `
      <th style="min-width:160px">Assured</th>
      <th>Producer</th>
      <th>Inception</th>
      <th>Expiry</th>
      <th>CCY</th>
      ${is2026 ? '<th style="text-align:right;color:var(--text3)">Expiring prem</th>' : ''}
      <th style="text-align:right">${is2026 ? 'New premium' : 'Premium'}</th>
      <th style="text-align:right">Order</th>
      <th style="text-align:right">Ret%</th>
      ${is2026 ? '<th style="text-align:right;color:var(--text3)">Expiring GBP</th>' : ''}
      <th style="text-align:right">Comm</th>
      <th style="text-align:right">${is2026 ? 'New GBP comm' : 'GBP comm'}</th>
      <th>Adj</th><th>PC</th>
      <th style="min-width:130px">Status</th>
      ${showMkt ? '<th>Market</th>' : ''}
    `;
  }

  tbody.innerHTML = '<tr><td colspan="16" class="muted" style="text-align:center;padding:20px">Loading...</td></tr>';
  tfoot.innerHTML = '';

  try {
    const result = await fetchPortfolioRows(year, q, statusF);
    let rows = result.items || [];

    if(!rows.length){
      tbody.innerHTML = '<tr><td colspan="16" class="muted" style="text-align:center;padding:20px">No backend portfolio rows found for this year</td></tr>';
      document.getElementById('book-totals').textContent = '0 records';
      return;
    }

    rows.sort((a,b) => parseUkDateLoose(a.inception || a.inceptionDate) - parseUkDateLoose(b.inception || b.inceptionDate));

    const fmtN = v => v != null ? Number(v).toLocaleString() : '—';
    const fmtPct = v => v != null ? v + '%' : '—';
    const ent = entGetState();
    const bookStatusOptions = ['bound','renewal_pending','in_market','quoted','firm_order','submission','closed_ntu','expired_review'];

    tbody.innerHTML = rows.map(r => {
      const statusCode = canonicalRiskStatus(r.status);
      const statusMeta = riskStatusMeta(statusCode);
      const sc = statusMeta.fg;
      const sb = statusMeta.bg;

      let mktHtml = '';
      if(showMkt){
        const ins = (ent.insureds || []).find(i =>
          i.name.toLowerCase().includes((r.assured || '').toLowerCase().slice(0,8)) ||
          (r.assured || '').toLowerCase().includes(i.name.toLowerCase().slice(0,8))
        );
        const placement = ins && ins.enquiries && ins.enquiries.find(e => e.placement && e.placement.layers);
        if(placement){
          const pl = placement.placement;
          const layer = r.layer ? pl.layers.find(l => (l.description || '').toLowerCase().includes(r.layer.toLowerCase().split(' ')[0])) : pl.layers[0];
          if(layer && layer.markets){
            mktHtml = layer.markets.map(m =>
              `<div style="font-size:10px;color:var(--text2)">${m.name} <span style="color:var(--acc);font-weight:600">${m.writtenLine || m.signedLine || ''}%</span>${m.role === 'lead' ? ' <span style="font-size:9px;color:var(--ok)">[lead]</span>' : ''}</div>`
            ).join('');
          }
        }
        if(!mktHtml) mktHtml = '<span class="muted" style="font-size:10px">No market data</span>';
      }

      const premCell = is2026
        ? `<td style="text-align:right;color:var(--text3);font-size:10px">—</td>
           <td style="text-align:right;color:${r.premium != null ? 'var(--text)' : 'var(--text3)'}">${r.premium != null ? fmtN(r.premium) : '—'}</td>`
        : `<td style="text-align:right">${fmtN(r.premium)}</td>`;

      const commCell = is2026
        ? `<td style="text-align:right;color:var(--text3);font-size:10px">—</td>
           <td style="text-align:right;font-weight:600;color:${r.gbpComm != null ? 'var(--text)' : 'var(--text3)'}">${r.gbpComm != null ? '£' + fmtN(r.gbpComm) : '—'}</td>`
        : `<td style="text-align:right;font-weight:600">${r.gbpComm != null ? '£' + fmtN(r.gbpComm) : '—'}</td>`;

      const nativeComm = r.retainedComm != null ? r.retainedComm
        : (r.premium != null && r.brokerage != null)
          ? Math.round(r.premium * (r.brokerage / 100) * ((r.retainedPct || 100) / 100))
          : null;
      const nativeCommCell = `<td style="text-align:right;color:var(--text2)">${nativeComm != null ? r.ccy + ' ' + fmtN(nativeComm) : '—'}</td>`;

      return `<tr style="vertical-align:middle">
        <td style="font-weight:500">${r.displayName || r.assured}</td>
        <td class="muted">${r.producer}</td>
        <td>${r.inception}</td>
        <td>${r.expiry}</td>
        <td>${r.ccy}</td>
        ${premCell}
        <td style="text-align:right">${r.order === 100 ? '100%' : (r.order != null ? r.order + '%' : '—')}</td>
        <td style="text-align:right">${fmtPct(r.retainedPct)}</td>
        ${nativeCommCell}
        ${commCell}
        <td style="text-align:center">${r.adjustable ? '✓' : ''}</td>
        <td style="text-align:center">${r.pc ? '✓' : ''}</td>
        <td>
          <select onchange="updateBookStatus('${r.id}',this.value)" style="font-size:10px;padding:2px 4px;border-radius:4px;background:${sb};color:${sc};border:1px solid ${sc}40;font-weight:600;cursor:pointer;font-family:inherit">
            ${bookStatusOptions.map(function(code){
              return `<option value="${code}" ${statusCode === code ? 'selected' : ''}>${riskStatusLabel(code)}</option>`;
            }).join('')}
          </select>
        </td>
        <td style="text-align:center">
          <button onclick="toggleLedger('${r.id}',event)" style="border:none;background:none;cursor:pointer;font-size:10px;color:var(--acc);font-weight:600;padding:2px 6px;border-radius:4px;border:1px solid var(--acc)40" title="AP/RP Ledger">£</button>
        </td>
        ${showMkt ? `<td style="min-width:140px">${mktHtml}</td>` : ''}
      </tr>
      <tr id="ledger-row-${r.id}" style="display:none;background:var(--bg)">
        <td colspan="${showMkt ? 16 : 15}" style="padding:8px 16px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:11px;font-weight:600;color:var(--text2)">Ledger — ${r.displayName || r.assured}</span>
            <button onclick="openAddLedgerEntry('${r.id}')" style="border:none;background:var(--acc);color:#fff;cursor:pointer;font-size:10px;font-weight:600;padding:3px 10px;border-radius:4px">+ Add entry</button>
          </div>
          <div id="ledger-entries-${r.id}"><div class="muted" style="font-size:11px;padding:4px 0">No entries loaded yet.</div></div>
        </td>
      </tr>`;
    }).join('');

    const totals = result.totals || {};
    const totalGbp = Number(totals.locked_gbp_commission || totals.estimated_gbp_commission || 0) || rows.reduce((s,r)=>s+(r.gbpComm||0),0);
    const totalByStatus = {};
    rows.forEach(r => {
      const label = riskStatusLabel(r.status);
      totalByStatus[label] = (totalByStatus[label] || 0) + 1;
    });

    tfoot.innerHTML = `<tr style="background:var(--bg);font-weight:600;font-size:11px">
      <td colspan="${is2026 ? 6 : 5}" style="padding:7px 10px">${rows.length} accounts</td>
      ${is2026 ? `<td style="text-align:right;padding:7px 10px;color:var(--text3);font-size:10px">—</td>` : ''}
      <td colspan="4" style="text-align:right;padding:7px 10px">£${Number(totalGbp).toLocaleString()}</td>
      <td colspan="${is2026 ? 5 : 4}" style="padding:7px 10px;font-size:10px;color:var(--text2)">
        ${Object.entries(totalByStatus).map(([k,v]) => v + ' ' + k).join(' · ')}
      </td>
    </tr>`;

    document.getElementById('book-totals').textContent = rows.length + ' accounts · £' + Number(totalGbp).toLocaleString() + ' GBP comm';
    renderFxPanel();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="16" class="muted" style="text-align:center;padding:20px">Failed to load backend portfolio: ' + (e.message || e) + '</td></tr>';
    tfoot.innerHTML = '';
    document.getElementById('book-totals').textContent = 'Error loading portfolio';
  }
}

async function updateBookStatus(rowId, newStatus){
  try {
    await apiFetch('/risks/' + rowId, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: newStatus })
    });
    renderBook();
  } catch (e) {
    showNotice('Status update failed: ' + e.message, 'err');
  }
}

var _bookLedgerCache = {};

function renderLedgerEntries(row){
  var entries = row.ledger || [];
  if(!entries.length) return '<div class="muted" style="font-size:11px;padding:4px 0">No entries yet. Click + Add entry.</div>';
  function fG(n){return n!=null?'£'+Math.round(n).toLocaleString():'—';}
  var bal=0;
  var sorted=entries.slice().sort(function(a,b){return (a.invoiceDate||'').localeCompare(b.invoiceDate||'');});
  var h='<table style="width:100%;font-size:11px;border-collapse:collapse"><tr style="background:var(--surface)"><th style="padding:4px 8px;text-align:left">Date</th><th>Type</th><th>Ref</th><th style="text-align:right">GBP comm</th><th style="text-align:right">Balance</th></tr>';
  sorted.forEach(function(e){var isRP=e.type==='rp';var gbp=parseFloat(e.gbpComm)||0;bal+=isRP?-gbp:gbp;var t=LEDGER_TYPES_NEW[e.type]||LEDGER_TYPES_NEW.original;h+='<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:4px 8px">'+(e.invoiceDate||'—')+'</td><td style="padding:4px 8px"><span style="background:'+t.bg+';color:'+t.col+';font-size:9px;font-weight:700;padding:1px 7px;border-radius:8px">'+t.label+'</span></td><td style="padding:4px 8px;color:var(--text2)">'+(e.ref||e.notes||'—')+'</td><td style="padding:4px 8px;text-align:right;font-weight:600;color:'+(isRP?'var(--err)':'var(--ok)')+'">'+( isRP?'('+fG(gbp)+')':fG(gbp))+'</td><td style="padding:4px 8px;text-align:right;font-weight:700;color:'+(bal>=0?'var(--ok)':'var(--err)')+'">'+fG(bal)+'</td></tr>';});
  var tot=sorted.reduce(function(s,e){return s+(e.type==='rp'?-(parseFloat(e.gbpComm)||0):(parseFloat(e.gbpComm)||0));},0);h+='<tr style="background:var(--bg);font-weight:700;border-top:1px solid var(--border)"><td colspan="3" style="padding:5px 8px">Total</td><td style="padding:5px 8px;text-align:right;color:'+(tot>=0?'var(--ok)':'var(--err)')+'">'+fG(tot)+'</td><td></td></tr>';return h+'</table>';
}

async function toggleLedger(rowId,evt){
  if(evt)evt.stopPropagation();
  var row=document.getElementById('ledger-row-'+rowId);if(!row)return;
  var vis=row.style.display!=='none';
  document.querySelectorAll('[id^="ledger-row-"]').forEach(function(r){r.style.display='none';});
  if(vis)return;
  row.style.display='table-row';
  var host=document.getElementById('ledger-entries-'+rowId);
  host.innerHTML='<div class="muted" style="font-size:11px;padding:4px 0">Loading...</div>';
  try {
    var data = await apiFetch('/risks/' + rowId + '/ledger');
    var riskRow = { id: rowId, ledger: (data.items || []).map(function(e){
      return {
        id: e.id,
        type: e.entry_type,
        invoiceDate: e.entry_date,
        ccy: e.currency,
        nativeAmount: e.original_amount,
        gbpComm: e.gbp_amount,
        ref: e.description || '',
        notes: e.description || ''
      };
    })};
    _bookLedgerCache[rowId] = riskRow.ledger;
    host.innerHTML = renderLedgerEntries(riskRow);
  } catch (e) {
    host.innerHTML='<div class="muted" style="font-size:11px;padding:4px 0">Failed to load ledger: ' + e.message + '</div>';
  }
}

function openAddLedgerEntry(rowId){_lRowId=rowId;_lEntId=null;document.getElementById('le-type').value='original';document.getElementById('le-date').value=new Date().toISOString().slice(0,10);document.getElementById('le-ccy').value='GBP';['le-native','le-gbp','le-rate','le-ref','le-notes'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});document.getElementById('le-modal-title').textContent='Add entry';document.getElementById('le-delete-btn').style.display='none';document.getElementById('le-modal').style.display='block';}
function openEditLedgerEntry(rowId,entryId){showNotice('Editing existing backend ledger entries is not wired yet','warn');}
async function saveLedgerEntry(){var gbp=parseFloat((document.getElementById('le-gbp').value||'').replace(/[^0-9.-]/g,''))||0;if(!gbp){showNotice('GBP amount required','err');return;}try{await apiFetch('/risks/'+_lRowId+'/ledger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({entry_type:document.getElementById('le-type').value,entry_date:document.getElementById('le-date').value,accounting_year:parseInt((document.getElementById('book-year')||{value:'2026'}).value,10),currency:document.getElementById('le-ccy').value||'GBP',original_amount:parseFloat(document.getElementById('le-native').value)||null,gbp_amount:gbp,description:(document.getElementById('le-ref').value||document.getElementById('le-notes').value||'').trim(),source:'manual'})});document.getElementById('le-modal').style.display='none';showNotice('✓ Saved','ok');toggleLedger(_lRowId);}catch(e){showNotice('Save failed: '+e.message,'err');}}
function deleteLedgerEntry(){showNotice('Delete for backend ledger entries is not wired yet','warn');}

function openAddLedgerEntry(rowId){_lRowId=rowId;_lEntId=null;var s=getBookState(),row=(s.bookRows||[]).find(function(r){return r.id===rowId;});document.getElementById('le-type').value='original';document.getElementById('le-date').value=new Date().toLocaleDateString('en-GB');document.getElementById('le-ccy').value=row?(row.ccy||'USD'):'USD';['le-native','le-gbp','le-rate','le-ref','le-notes'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});document.getElementById('le-modal-title').textContent='Add entry — '+(row?row.displayName||row.assured:'');document.getElementById('le-delete-btn').style.display='none';document.getElementById('le-modal').style.display='block';}
function openEditLedgerEntry(rowId,entryId){_lRowId=rowId;_lEntId=entryId;var s=getBookState(),row=(s.bookRows||[]).find(function(r){return r.id===rowId;}),e=(row&&row.ledger||[]).find(function(e){return e.id===entryId;});if(!e)return;document.getElementById('le-type').value=e.type||'original';document.getElementById('le-date').value=e.invoiceDate||'';document.getElementById('le-ccy').value=e.ccy||'USD';document.getElementById('le-native').value=e.nativeAmount||'';document.getElementById('le-gbp').value=e.gbpComm||'';document.getElementById('le-rate').value=e.fxRate||'';document.getElementById('le-ref').value=e.ref||'';document.getElementById('le-notes').value=e.notes||'';document.getElementById('le-modal-title').textContent='Edit entry — '+(row?row.displayName||row.assured:'');document.getElementById('le-delete-btn').style.display='inline-block';document.getElementById('le-modal').style.display='block';}
function saveLedgerEntry(){var s=getBookState(),row=(s.bookRows||[]).find(function(r){return r.id===_lRowId;});if(!row){showNotice('Row not found','err');return;}if(!row.ledger)row.ledger=[];var gbp=parseFloat((document.getElementById('le-gbp').value||'').replace(/[^0-9.-]/g,''))||0;if(!gbp){showNotice('GBP amount required','err');return;}var entry={id:_lEntId||'le-'+Date.now(),type:document.getElementById('le-type').value,invoiceDate:document.getElementById('le-date').value,ccy:document.getElementById('le-ccy').value,nativeAmount:parseFloat(document.getElementById('le-native').value)||null,gbpComm:gbp,fxRate:document.getElementById('le-rate').value||null,ref:document.getElementById('le-ref').value,notes:document.getElementById('le-notes').value};if(_lEntId){var i=row.ledger.findIndex(function(e){return e.id===_lEntId;});if(i>-1)row.ledger[i]=entry;else row.ledger.push(entry);}else row.ledger.push(entry);var lt=new Set(['original','ap','rp','adj']);row.gbpComm=Math.round(row.ledger.filter(function(e){return lt.has(e.type);}).reduce(function(s,e){return s+(e.type==='rp'?-(parseFloat(e.gbpComm)||0):(parseFloat(e.gbpComm)||0));},0));ss(s);document.getElementById('le-modal').style.display='none';var el=document.getElementById('ledger-entries-'+_lRowId);if(el)el.innerHTML=renderLedgerEntries(row);showNotice('✓ Saved','ok');}
function deleteLedgerEntry(){if(!confirm('Delete?'))return;var s=getBookState(),row=(s.bookRows||[]).find(function(r){return r.id===_lRowId;});if(!row)return;row.ledger=(row.ledger||[]).filter(function(e){return e.id!==_lEntId;});var lt=new Set(['original','ap','rp','adj']);row.gbpComm=row.ledger.length?Math.round(row.ledger.filter(function(e){return lt.has(e.type);}).reduce(function(s,e){return s+(e.type==='rp'?-(parseFloat(e.gbpComm)||0):(parseFloat(e.gbpComm)||0));},0)):null;ss(s);document.getElementById('le-modal').style.display='none';showNotice('Deleted','ok');}
function leCalcGbp(){var n=parseFloat(document.getElementById('le-native').value)||0,r=parseFloat(document.getElementById('le-rate').value)||0,c=document.getElementById('le-ccy').value;if(n&&r&&c!=='GBP')document.getElementById('le-gbp').value=Math.round(n/r);else if(n&&c==='GBP')document.getElementById('le-gbp').value=Math.round(n);}

// FX entity synthesis
function fxGetFilteredRows(){var s=getBookState(),year=(document.getElementById('book-year')||{value:'2026'}).value;var rows=(s.bookRows||[]).filter(function(r){return r.accountingYear===year;});var ent=entGetState(),keys=new Set(rows.map(function(r){return (r.displayName||r.assured||'').toLowerCase().slice(0,14);}));(ent.insureds||[]).forEach(function(ins){var prod=(ent.producers||[]).find(function(p){return p.id===ins.producerId;});(ins.enquiries||[]).forEach(function(enq){if((enq.status||'').toLowerCase()!=='bound')return;var p=(enq.inceptionDate||'').split('/');if(p.length!==3||p[2].trim()!==String(year))return;var k=ins.name.toLowerCase().slice(0,14);if(keys.has(k))return;var gp=null,brok=null,ret=100,rc=null;if(enq.placement&&enq.placement.layers&&enq.placement.layers.length){var l=enq.placement.layers[0];gp=parseFloat(l.grossPremium)||null;brok=parseFloat(l.brokerage)||null;ret=parseFloat(l.ogbRetainPct)||100;if(gp&&brok)rc=Math.round(gp*(brok/100)*(ret/100));}if(!gp)gp=parseFloat(enq.premium)||null;if(!rc&&enq.commission)rc=parseFloat(enq.commission)||null;rows.push({id:'fx-synth-'+enq.id,assured:ins.name,displayName:ins.name,producer:prod?prod.name:'',ccy:enq.currency||'USD',status:'Bound',premium:gp,order:100,brokerage:brok||0,retainedPct:ret,gbpComm:null,retainedComm:rc,accountingYear:year,_fromEntities:true});keys.add(k);});});return rows;}

// Rate suggestion
var RATE_CAT_NEW = new Set(['turkey','japan','chile','philippines','indonesia','mexico','peru','colombia','taiwan','iran','pakistan','florida','bangladesh','netherlands','vietnam','thailand','myanmar','india','nigeria']);
function suggestRates(){var c=(document.getElementById('pi-country')||{value:''}).value.toLowerCase();var isPanama=/panama/i.test(c);var isCat=RATE_CAT_NEW.has(c)||Array.from(RATE_CAT_NEW).some(function(x){return c.indexOf(x)>-1;});function sv(id,v){var el=document.getElementById(id);if(el)el.value=v;}sv('pt-im-pr',0.005);sv('pt-im-cr',+(0.005/3).toFixed(6));sv('pt-ex-pr',0.005);sv('pt-ex-cr',+(0.005/3).toFixed(6));sv('pt-do-pr',0.0002);sv('ps-rate',isPanama?0.005:0.0015);var catEl=document.getElementById('ps-cat-apply');if(catEl){catEl.checked=isCat;if(isCat)sv('ps-cat-rate',0.0015);}calcPremium();showNotice('⚡ Rates applied','ok');}

// CW Lineslip
var CW_LINESLIP_ROW_ID_NEW = 'book-cw-lineslip-2026';
var CW_BROKERAGE_PCT_NEW = 15;
function ensureCwLineslipRow(){var s=getBookState();if(!s.bookRows)s.bookRows=[];var row=s.bookRows.find(function(r){return r.id===CW_LINESLIP_ROW_ID_NEW;});if(!row){row={id:CW_LINESLIP_ROW_ID_NEW,assured:'Cargo War Lineslip',displayName:'Cargo War Lineslip (Various)',producer:'Integra/Direct',ccy:'USD',inception:'01/01/2026',expiry:'31/12/2026',accountingYear:'2026',premium:null,order:100,brokerage:CW_BROKERAGE_PCT_NEW,retainedPct:100,gbpComm:null,status:'Bound',ledger:[],_isCwLineslip:true};s.bookRows.push(row);ss(s);}return row;}
function syncCwLineslip(){var risks=cwGetRisks().filter(function(r){return r.status==='bound';});if(!risks.length){showNotice('No bound war risks','err');return;}var s=getBookState(),row=ensureCwLineslipRow();if(!row.ledger)row.ledger=[];var added=0,skipped=0;risks.forEach(function(r){if(row.ledger.find(function(e){return e.ref===r.id;})){skipped++;return;}var tsi=parseFloat(r.tsi)||0,rate=parseFloat(r.quotedRate)||0,minP=parseFloat(r.minPremium)||0,gp=rate>0?Math.round(tsi*rate):minP;if(!gp){skipped++;return;}row.ledger.push({id:'le-cw-'+Date.now(),type:'original',invoiceDate:r.loadingDate||new Date().toLocaleDateString('en-GB'),ccy:'USD',nativeAmount:gp,gbpComm:null,_needsGbp:true,ref:r.id,notes:(r.vessel||'')+(r.loadingPort?' '+r.loadingPort+'→'+(r.dischargePort||''):'')});added++;});row.premium=row.ledger.reduce(function(s,e){return s+(parseFloat(e.nativeAmount)||0);},0);ss(s);renderBook();showNotice(added?'✓ '+added+' risks synced':'All already synced',added?'ok':'warn');}

// War cert
window._lastCwCert='';
function cwOpenCert(){var risks=cwGetRisks().filter(function(r){return r.vessel;});document.getElementById('cert-risk-sel').innerHTML='<option value="">— fill manually —</option>'+risks.map(function(r){return '<option value="'+r.id+'">'+r.vessel+' — '+(r.loadingPort||'')+'→'+(r.dischargePort||'')+'</option>';}).join('');if(!document.getElementById('cert-date').value)document.getElementById('cert-date').value=new Date().toLocaleDateString('en-GB');document.getElementById('cw-cert-modal').style.display='block';}
function certPopulateFromRisk(id){if(!id)return;var r=cwGetRisks().find(function(r){return r.id===id;});if(!r)return;function g(fid,v){var el=document.getElementById(fid);if(el)el.value=v||'';}g('cert-vessel',r.vessel);g('cert-imo',r.imo);g('cert-insured',r.insured||r.cedant);g('cert-cedant',r.cedant);g('cert-goods',r.goods);g('cert-tsi',r.tsi);g('cert-from',r.loadingPort);g('cert-to',r.dischargePort);}
async function cwGenerateCert(){function g(id){return (document.getElementById(id)||{value:''}).value||'';}var vessel=g('cert-vessel');if(!vessel){showNotice('Vessel required','err');return;}var card=document.getElementById('cw-cert-out-card'),out=document.getElementById('cw-cert-out'),spin=document.getElementById('cw-cert-spin');card.style.display='block';spin.style.display='inline';out.textContent='Generating...';var tsi=parseFloat(g('cert-tsi'))||0,rate=parseFloat(g('cert-rate'))||0,prem=parseFloat(g('cert-prem'))||(tsi&&rate?Math.round(tsi*rate/100):0);var cert='CERTIFICATE OF INSURANCE — MARINE WAR RISKS\n'+'━'.repeat(48)+'\nOG BROKING LIMITED | LLOYD\'S BROKER\n\nCERT NO: '+(g('cert-ref')||'OGB-CW-'+Date.now().toString().slice(-4))+'\nDATE: '+g('cert-date')+'\n'+'━'.repeat(48)+'\nASSURED: '+(g('cert-insured')||'[As per binder]')+'\nCEDANT: '+(g('cert-cedant')||'[As per binder]')+'\n\nVESSEL: '+vessel+(g('cert-imo')?' (IMO '+g('cert-imo')+')':'')+'\nCARGO: '+(g('cert-goods')||'[TBC]')+'\n\nLOADING: '+(g('cert-from')||'[TBC]')+'\nDISCHARGE: '+(g('cert-to')||'[TBC]')+'\nON/ABOUT: '+(g('cert-loaddate')||'[TBC]')+'\n\nSUM INSURED: USD '+(tsi?tsi.toLocaleString():'[TBC]')+'\nRATE: '+(rate?rate.toFixed(3)+'%':'[TBC]')+'\nPREMIUM: USD '+(prem?prem.toLocaleString():'[TBC]')+'\n\nCONDITIONS:\nInstitute War Clauses (Cargo) CL385\nFive Powers War Clause JC2023-024\nSanctions Exclusion LMA3100A\n\nSECURITY: '+(g('cert-binder')||'OG Broking Cargo War Lineslip')+'. 100% Lloyd\'s.\n\nSigned: OG Broking Limited | '+g('cert-date');window._lastCwCert=cert;out.textContent=cert;spin.style.display='none';}
function cwCopyCert(){if(!window._lastCwCert){showNotice('Generate first','err');return;}navigator.clipboard.writeText(window._lastCwCert).then(function(){showNotice('Copied','ok');});}
function cwClearCert(){['cert-vessel','cert-imo','cert-insured','cert-cedant','cert-goods','cert-tsi','cert-from','cert-to','cert-loaddate','cert-rate','cert-prem','cert-conditions','cert-binder'].forEach(function(id){var el=document.getElementById(id);if(el)el.value='';});document.getElementById('cw-cert-out-card').style.display='none';window._lastCwCert='';}

// Data export/import
function openDataModal(){var s=gs(),ent=entGetState();document.getElementById('data-summary').innerHTML=(ent.insureds||[]).length+' insureds · '+(s.bookRows||[]).length+' book rows';document.getElementById('export-notice').style.display='none';document.getElementById('import-notice').style.display='none';document.getElementById('data-modal').style.display='block';}
function exportAllData(){var t=JSON.stringify({_at:new Date().toISOString(),ogb_state:gs(),ogb_entities:entGetState()},null,2);navigator.clipboard.writeText(t).then(function(){var el=document.getElementById('export-notice');el.textContent='✓ Copied ('+Math.round(t.length/1024)+'KB)';el.style.display='block';el.style.color='var(--ok)';});}
function exportEntitiesOnly(){navigator.clipboard.writeText(JSON.stringify(entGetState(),null,2)).then(function(){showNotice('Entities copied','ok');});}
function exportBookOnly(){navigator.clipboard.writeText(JSON.stringify(gs().bookRows||[],null,2)).then(function(){showNotice('Book copied','ok');});}
function downloadDataJson(){var b=new Blob([JSON.stringify({_at:new Date().toISOString(),ogb_state:gs(),ogb_entities:entGetState()},null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='ogb-'+new Date().toISOString().slice(0,10)+'.json';a.click();}
function importData(){var raw=(document.getElementById('import-json').value||'').trim();var el=document.getElementById('import-notice');el.style.display='block';if(!raw){el.textContent='Paste JSON first';el.style.color='var(--err)';return;}var p;try{p=JSON.parse(raw);}catch(e){el.textContent='Invalid JSON: '+e.message;el.style.color='var(--err)';return;}var imported=[];if(p.ogb_state){var ex=gs(),inc=p.ogb_state;if(inc.bookRows){if(!ex.bookRows)ex.bookRows=[];var ids=new Set(ex.bookRows.map(function(r){return r.id;}));var nr=inc.bookRows.filter(function(r){return !ids.has(r.id);});ex.bookRows=ex.bookRows.concat(nr);if(nr.length)imported.push(nr.length+' rows');}ss(ex);}if(p.ogb_entities){var exE=entGetState(),incE=p.ogb_entities;var ii=new Set((exE.insureds||[]).map(function(i){return i.id;}));var ni=(incE.insureds||[]).filter(function(i){return !ii.has(i.id);});exE.insureds=(exE.insureds||[]).concat(ni);entSave(exE);if(ni.length)imported.push(ni.length+' insureds');}el.textContent=imported.length?'✓ Imported: '+imported.join(', '):'Nothing new to import';el.style.color=imported.length?'var(--ok)':'var(--warn)';}
function clearAllData(){if(!confirm('Clear ALL data?'))return;if(!confirm('Sure?'))return;localStorage.removeItem('og_state_v4');showNotice('Cleared — reload','warn');setTimeout(function(){location.reload();},1500);}

// Draft & Renewal
function draftMode(m){var c=document.getElementById('draft-comms-mode'),r=document.getElementById('draft-renewal-mode');if(c)c.style.display=m==='comms'?'block':'none';if(r)r.style.display=m==='renewal'?'block':'none';var tc=document.getElementById('draft-tab-comms'),tr=document.getElementById('draft-tab-renewal');if(tc)tc.classList.toggle('active',m==='comms');if(tr)tr.classList.toggle('active',m==='renewal');if(m==='renewal')populateRenewalRefs();}
function populateRenewalRefs(){var ent=entGetState(),sel=document.getElementById('renewal-ref');if(!sel)return;var opts=[];(ent.insureds||[]).forEach(function(ins){(ins.enquiries||[]).filter(function(e){return e.status==='Bound';}).forEach(function(enq){var p=(ent.producers||[]).find(function(p){return p.id===ins.producerId;});opts.push({v:ins.id+'::'+enq.id,l:ins.name+' · '+(enq.inceptionDate||'?')+' · '+(p?p.name:'')});});});opts.sort(function(a,b){return a.l.localeCompare(b.l);});sel.innerHTML='<option value="">Select bound account...</option>'+opts.map(function(o){return '<option value="'+o.v+'">'+o.l+'</option>';}).join('');}
var _rpDocs_new={mrc:'',sub:'',client:''};
function rpTab(t){['mrc','sub','client'].forEach(function(x){var btn=document.getElementById('rp-tab-'+x);if(btn)btn.classList.toggle('active',x===t);});var lbl=document.getElementById('rp-active-label');if(lbl)lbl.textContent={mrc:'MRC summary',sub:'Market submission',client:'Client covering note'}[t]||'';var out=document.getElementById('rp-out');if(out)out.textContent=_rpDocs_new[t]||'(not generated)';}
function copyRpDoc(){var t=['mrc','sub','client'].find(function(x){var btn=document.getElementById('rp-tab-'+x);return btn&&btn.classList.contains('active');});if(t&&_rpDocs_new[t])navigator.clipboard.writeText(_rpDocs_new[t]).then(function(){showNotice('Copied','ok');});}
async function generateRenewalPack(){var ref=document.getElementById('renewal-ref').value;if(!ref){showNotice('Select an account first','err');return;}var parts=ref.split('::'),insId=parts[0],enqId=parts[1];var ent=entGetState(),ins=(ent.insureds||[]).find(function(i){return i.id===insId;}),enq=ins&&(ins.enquiries||[]).find(function(e){return e.id===enqId;});if(!ins||!enq){showNotice('Account not found','err');return;}var key=getKey();if(!key){showNotice('API key required','err');return;}var spEl=document.getElementById('renewal-spin'),oc=document.getElementById('renewal-out-card');if(spEl)spEl.style.display='inline';if(oc)oc.style.display='none';_rpDocs_new={mrc:'',sub:'',client:''};var prod=(ent.producers||[]).find(function(p){return p.id===ins.producerId;});var ctx='Insured: '+ins.name+'\nProducer: '+(prod?prod.name:'—')+'\nInception: '+(enq.inceptionDate||'—')+'\nExpiry: '+(enq.expiryDate||'—')+'\nRenewal inception: '+((document.getElementById('renewal-date')||{value:'TBC'}).value||'TBC')+'\nProduct: '+(enq.product||'Marine Cargo/STP')+'\nCurrency: '+(enq.currency||'USD')+'\nPremium: '+(enq.premium||'—')+'\nChanges: '+((document.getElementById('renewal-ctx')||{value:''}).value||'none specified');var MRC_SYS='You are a senior Lloyd\'s wholesale broker at OG Broking. Write an MRC renewal summary slip in plain text with ALL CAPS headers. Include: RENEWAL, INSURED, CEDANT, PERIOD, INTEREST, CONDITIONS, SUM INSURED, PREMIUM, BROKERAGE, CHANGES FROM EXPIRING, SUBJECTIVITIES.';var SUB_SYS='You are a senior Lloyd\'s wholesale broker at OG Broking writing a renewal market submission email. Story-first, reference the relationship and loss record. Plain text, Subject: line first, no markdown.';var CLT_SYS='You are a senior Lloyd\'s wholesale broker at OG Broking writing a renewal covering note to the producer or client. Professional and warm. Plain text only.';var results=await Promise.all([callAI(MRC_SYS,ctx,1200),callAI(SUB_SYS,ctx,1000),callAI(CLT_SYS,ctx,800)]);_rpDocs_new.mrc=results[0]||'(failed)';_rpDocs_new.sub=results[1]||'(failed)';_rpDocs_new.client=results[2]||'(failed)';if(spEl)spEl.style.display='none';if(oc)oc.style.display='block';rpTab('mrc');showNotice('✓ Renewal pack generated','ok');}

// Market Intel tabs
function intelMode(m){['suggest','feedback','lessons','lostdeals'].forEach(function(x){var el=document.getElementById('intel-'+x+'-mode');if(el)el.style.display=x===m?'block':'none';var btn=document.getElementById('intel-tab-'+x);if(btn)btn.classList.toggle('active',x===m);});if(m==='feedback')renderFeedback();if(m==='lessons')renderLessons();if(m==='lostdeals')renderLostDeals();}

// Producer Dashboard
var ANNUAL_TARGETS_NEW = {2024:916000,2025:804000,2026:850000};
var KNOWN_INCOME_NEW = {'integra':{2024:851000,2025:716000,2026:163000},'arb-international':{2024:32000,2025:38000,2026:18000},'hull-co':{2024:22000,2025:0,2026:0},'jonasre':{2024:4000,2025:-4400,2026:0},'prudent':{2024:0,2025:14000,2026:24000},'ink-consulting':{2024:0,2025:0,2026:10000},'latam-re':{2024:0,2025:0,2026:10000},'_cargo_war':{2024:494000,2025:306000,2026:77000}};
function renderDashboard(){function fG(n){return (Math.abs(n)>=1000?(n<0?'−':'')+'£'+Math.round(Math.abs(n)/1000)+'k':(n<0?'−':'')+'£'+Math.abs(Math.round(n)).toLocaleString());}var YEARS=['2024','2025','2026'];var tot={};YEARS.forEach(function(y){tot[y]=Object.values(KNOWN_INCOME_NEW).reduce(function(s,d){return s+(d[parseInt(y)]||0);},0);});var target=ANNUAL_TARGETS_NEW[2026],ytd=tot['2026']||0,pct=Math.min(100,Math.round(ytd/target*100));var rows=Object.entries(KNOWN_INCOME_NEW).map(function(entry){var pid=entry[0],yrs=entry[1];var n=pid==='_cargo_war'?'Cargo War':pid;var y24=yrs[2024]||0,y25=yrs[2025]||0,y26=yrs[2026]||0;var yoy=y25>0?Math.round((y26-y25)/y25*100):null;return{n:n,y24:y24,y25:y25,y26:y26,trend:yoy===null?'—':(yoy>=0?'+':'')+yoy+'%',tc:yoy===null?'var(--text3)':yoy>=0?'var(--ok)':'var(--err)'};}).filter(function(r){return r.y24||r.y25||r.y26;}).sort(function(a,b){return b.y26-a.y26;});var el=document.getElementById('dashboard-content');if(!el)return;el.innerHTML='<div class="card" style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px"><div><div class="sh" style="margin:0">2026 YTD Performance</div><div class="muted" style="font-size:11px">Jan–Apr · Target: '+fG(target)+'</div></div><div style="text-align:right"><div style="font-size:22px;font-weight:700;color:var(--acc)">'+fG(ytd)+'</div><div style="font-size:11px;color:var(--text2)">'+pct+'% of target</div></div></div><div style="height:8px;background:var(--border);border-radius:4px;overflow:hidden"><div style="height:100%;width:'+pct+'%;background:'+(pct>=80?'var(--ok)':pct>=50?'var(--acc)':'var(--warn)')+';border-radius:4px"></div></div></div><div class="card"><div class="sh" style="margin-bottom:12px">Income by producer</div><table style="width:100%;font-size:12px"><thead><tr style="border-bottom:2px solid var(--border)"><th style="text-align:left;padding:5px 8px">Producer</th><th style="text-align:right;padding:5px 8px">2024</th><th style="text-align:right;padding:5px 8px">2025</th><th style="text-align:right;padding:5px 8px">2026 YTD</th><th style="text-align:right;padding:5px 8px">YoY</th></tr></thead><tbody>'+rows.map(function(r){return '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:6px 8px;font-weight:500">'+r.n+'</td><td style="padding:6px 8px;text-align:right;color:var(--text2)">'+(r.y24?fG(r.y24):'—')+'</td><td style="padding:6px 8px;text-align:right;color:var(--text2)">'+(r.y25?fG(r.y25):r.y25<0?fG(r.y25):'—')+'</td><td style="padding:6px 8px;text-align:right;font-weight:600">'+(r.y26?fG(r.y26):'—')+'</td><td style="padding:6px 8px;text-align:right;font-weight:600;color:'+r.tc+'">'+r.trend+'</td></tr>';}).join('')+'<tr style="background:var(--bg);font-weight:700;border-top:2px solid var(--border)"><td style="padding:6px 8px">Total</td><td style="padding:6px 8px;text-align:right">'+fG(tot['2024'])+'</td><td style="padding:6px 8px;text-align:right">'+fG(tot['2025'])+'</td><td style="padding:6px 8px;text-align:right">'+fG(tot['2026'])+'</td><td></td></tr></tbody></table></div>';}

// New Global Ask AI
var _aiOpenNew=false,_aiHistoryNew=[];
function toggleGlobalAI(evt){if(evt)evt.stopPropagation();_aiOpenNew=!_aiOpenNew;var panel=document.getElementById('global-ai-panel'),fab=document.getElementById('global-ai-fab');if(panel&&fab){if(_aiOpenNew){panel.style.display='flex';fab.style.display='none';setTimeout(function(){var inp=document.getElementById('global-ai-input');if(inp)inp.focus();},100);}else{panel.style.display='none';fab.style.display='flex';}}}
function minimiseGlobalAI(evt){if(evt)evt.stopPropagation();var b=document.getElementById('global-ai-body');if(b){var min=b.style.display==='none';b.style.display=min?'flex':'none';var btn=document.getElementById('global-ai-min-btn');if(btn)btn.textContent=min?'—':'▲';}}
function addAIMsg_new(role,text){var el=document.getElementById('global-ai-messages');if(!el)return;var isU=role==='user';var d=document.createElement('div');d.style.cssText='display:flex;'+(isU?'justify-content:flex-end':'');d.innerHTML='<div style="max-width:85%;padding:7px 10px;border-radius:'+(isU?'10px 10px 2px 10px':'10px 10px 10px 2px')+';background:'+(isU?'var(--acc)':'var(--bg)')+';color:'+(isU?'#fff':'var(--text)')+';font-size:12px;line-height:1.6;white-space:pre-wrap;border:'+(isU?'none':'1px solid var(--border)')+'">'+String(text).replace(/</g,'&lt;')+'</div>';el.appendChild(d);el.scrollTop=el.scrollHeight;}
async function sendGlobalAI(){
  var inp=document.getElementById('global-ai-input'),text=inp?(inp.value||'').trim():'';
  if(!text) return;
  if(inp) inp.value='';
  addAIMsg_new('user',text);
  _aiHistoryNew.push({role:'user',content:text});
  var spin=document.getElementById('global-ai-spin');
  if(spin) spin.style.display='inline';
  try{
    var data = await aiRequest({
      model:'claude-sonnet-4-20250514',
      max_tokens:1200,
      system:"You are an AI assistant for OG Broking, a Lloyd's wholesale broker.",
      messages:_aiHistoryNew.slice(-10)
    });
    if(data.error) throw new Error(data.error.message);
    var reply=extractAIText(data);
    _aiHistoryNew.push({role:'assistant',content:reply});
    addAIMsg_new('assistant',reply);
  }catch(e){
    addAIMsg_new('assistant','⚠ '+e.message);
  }
  if(spin) spin.style.display='none';
}
function refreshFxRates(){try{localStorage.removeItem('og_fx_rates_v1');}catch(e){}renderFxPanel();}



async function renderFxPanel(){
  const panel = document.getElementById('book-fx-panel');
  const errEl = document.getElementById('fx-error');
  if(!panel) return;

  const rows = fxGetFilteredRows();

  // Split: locked = has gbpComm, estimated = has premium but no gbpComm
  const locked = rows.filter(r => r.gbpComm != null);
  const estimated = rows.filter(r => r.gbpComm == null && r.premium != null && r.ccy);

  if(!locked.length && !estimated.length){ panel.style.display='none'; return; }
  panel.style.display='block';
  if(errEl) errEl.style.display='none';

  const fmtGbp = n => '£' + Math.round(n).toLocaleString('en-GB');
  const fmtCcy = (n,ccy) => {
    try{ return new Intl.NumberFormat('en-GB',{style:'currency',currency:ccy,maximumFractionDigits:0}).format(n); }
    catch{ return ccy+' '+Math.round(n).toLocaleString(); }
  };

  // ── LOCKED SECTION ──────────────────────────────────────────
  // Group by CCY for display — sum gbpComm directly (already locked)
  const lockedByCcy = {};
  locked.forEach(r=>{
    const ccy=(r.ccy||'USD').toUpperCase();
    if(!lockedByCcy[ccy]) lockedByCcy[ccy]={gbp:0,nativePrem:0,count:0};
    lockedByCcy[ccy].gbp += r.gbpComm;
    lockedByCcy[ccy].nativePrem += (r.premium||0)*(r.order!=null?r.order/100:1);
    lockedByCcy[ccy].count++;
  });

  const totalLocked = Object.values(lockedByCcy).reduce((s,v)=>s+v.gbp,0);

  const lockedRowsHtml = Object.entries(lockedByCcy)
    .sort((a,b)=>b[1].gbp-a[1].gbp)
    .map(([ccy,{gbp,nativePrem,count}])=>`
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:1px solid var(--border)">
        <div>
          <span style="font-weight:600;color:var(--text);min-width:40px;display:inline-block">${ccy}</span>
          <span class="muted" style="font-size:10px;margin-left:6px">${count} acct${count!==1?'s':''}</span>
          ${nativePrem>0?`<span class="muted" style="font-size:10px;margin-left:6px">${fmtCcy(nativePrem,ccy)} gross</span>`:''}
        </div>
        <div style="font-weight:600;color:var(--ok)">${fmtGbp(gbp)}</div>
      </div>`).join('');

  document.getElementById('fx-locked-rows').innerHTML = lockedRowsHtml ||
    '<div class="muted" style="padding:8px 0">No locked records in current filter</div>';
  document.querySelector('#fx-locked-total span:last-child').textContent = fmtGbp(totalLocked);

  // ── ESTIMATED SECTION ────────────────────────────────────────
  if(!estimated.length){
    document.getElementById('fx-est-rows').innerHTML =
      '<div class="muted" style="padding:8px 0">No unprocessed accounts</div>';
    document.querySelector('#fx-est-total span:last-child').textContent = '—';
    document.getElementById('fx-grand-total').textContent = fmtGbp(totalLocked);
    document.getElementById('fx-composition').textContent =
      `${locked.length} locked · 0 estimated`;
    // Gross premium for locked-only (no rate available yet, use brokerage back-calc)
    let totalGrossPremNoEst = 0;
    locked.forEach(r => {
      const brok = (r.brokerage||0)/100;
      if(brok > 0 && r.gbpComm != null) totalGrossPremNoEst += r.gbpComm / brok;
    });
    const hasApprox = locked.some(r => !(r.brokerage > 0 && r.gbpComm != null));
    document.getElementById('fx-grand-premium').textContent = (hasApprox?'~':'') + fmtGbp(totalGrossPremNoEst);
    document.getElementById('fx-prem-composition').textContent = 'Back-calculated from locked commission ÷ brokerage%';
    return;
  }

  const base = (document.getElementById('fx-base-ccy')||{}).value||'GBP';
  let rateData;
  try{
    rateData = await ensureFxRates(base);
  } catch(err){
    rateData = getFxCache();
    if(errEl){
      errEl.textContent = 'Could not fetch live rates — using cached rates. '+( err.message||'');
      errEl.style.display='block';
    }
    if(!rateData){
      document.getElementById('fx-est-rows').innerHTML =
        '<div style="color:var(--err);font-size:11px;padding:8px 0">No FX rates available — click ↻ Rates to retry</div>';
      document.querySelector('#fx-est-total span:last-child').textContent = '—';
      document.getElementById('fx-grand-total').textContent = fmtGbp(totalLocked)+' *';
      document.getElementById('fx-composition').textContent =
        `${locked.length} locked · ${estimated.length} estimated (rates unavailable)`;
      document.getElementById('fx-grand-premium').textContent = '—';
      document.getElementById('fx-prem-composition').textContent = 'FX rates unavailable';
      return;
    }
  }

  // Update rates date label
  const dateEl = document.getElementById('fx-rates-date');
  if(dateEl && rateData.ts){
    const d = new Date(rateData.ts);
    dateEl.textContent = d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
  }

  const rates = rateData.rates;
  // Convert FROM ccy TO base: amount / rates[ccy]
  // (rates[ccy] = how many ccy per 1 base unit)

  // Group estimated by CCY
  const estByCcy = {};
  estimated.forEach(r=>{
    const ccy=(r.ccy||'USD').toUpperCase();
    if(!estByCcy[ccy]) estByCcy[ccy]={nativePrem:0,nativeComm:0,count:0};
    const prem = (r.premium||0)*(r.order!=null?r.order/100:1);
    const brok = (r.brokerage||0)/100;
    estByCcy[ccy].nativePrem += prem;
    estByCcy[ccy].nativeComm += prem*brok;
    estByCcy[ccy].count++;
  });

  let totalEst = 0;
  const estRowsHtml = Object.entries(estByCcy)
    .sort((a,b)=>b[1].nativeComm-a[1].nativeComm)
    .map(([ccy,{nativePrem,nativeComm,count}])=>{
      const rate = ccy===base ? 1 : (rates[ccy] ? 1/rates[ccy] : null);
      const estGbp = rate!=null ? nativeComm*rate : null;
      if(estGbp!=null) totalEst += estGbp;
      const rateStr = ccy===base ? 'base' :
        rate!=null ? `@${(1/rate).toFixed(4)}` : 'n/a';
      return `
        <div style="display:flex;justify-content:space-between;align-items:baseline;padding:5px 0;border-bottom:1px solid var(--border)">
          <div>
            <span style="font-weight:600;color:var(--text);min-width:40px;display:inline-block">${ccy}</span>
            <span class="muted" style="font-size:10px;margin-left:6px">${count} acct${count!==1?'s':''}</span>
            <span class="muted" style="font-size:10px;margin-left:6px">${fmtCcy(nativePrem,ccy)} gross · ${rateStr}</span>
          </div>
          <div style="font-weight:600;color:var(--warn)">${estGbp!=null?'~'+fmtGbp(estGbp):'—'}</div>
        </div>`;
    }).join('');

  document.getElementById('fx-est-rows').innerHTML = estRowsHtml;
  document.querySelector('#fx-est-total span:last-child').textContent =
    totalEst>0 ? '~'+fmtGbp(totalEst) : '—';

  // ── Gross premium total (all rows, locked + estimated, converted to base) ───
  // For locked rows: derive from gbpComm / brokerage where possible,
  // else use nativePrem converted at today's rate (less accurate but best available)
  let totalGrossPrem = 0;
  let premLocked = 0, premEst = 0;

  // Locked: try gbpComm / brokeragePct → gross GBP = gbpComm / brok%
  locked.forEach(r => {
    const brok = (r.brokerage||0)/100;
    if(brok > 0 && r.gbpComm != null) {
      // Back-calculate gross from locked comm — most accurate
      premLocked += r.gbpComm / brok;
    } else if(r.premium != null && r.ccy) {
      // Fall back: convert native premium at today's rate
      const ccy = (r.ccy||'USD').toUpperCase();
      const rate = ccy===base ? 1 : (rates[ccy] ? 1/rates[ccy] : null);
      if(rate != null) premLocked += (r.premium||0)*(r.order!=null?r.order/100:1)*rate;
    }
  });

  // Estimated: convert nativePrem at today's rate
  Object.entries(estByCcy).forEach(([ccy,{nativePrem}]) => {
    const rate = ccy===base ? 1 : (rates[ccy] ? 1/rates[ccy] : null);
    if(rate != null) premEst += nativePrem * rate;
  });

  totalGrossPrem = premLocked + premEst;

  const premLockedFlag = locked.some(r => !(r.brokerage > 0 && r.gbpComm != null));

  // Grand total commission
  const grandTotal = totalLocked + totalEst;
  document.getElementById('fx-grand-total').textContent = fmtGbp(grandTotal);
  document.getElementById('fx-composition').textContent =
    `${fmtGbp(totalLocked)} locked · ${totalEst>0?'~'+fmtGbp(totalEst)+' estimated':'no unprocessed accounts'}`;

  // Grand total gross premium
  const baseSym = base==='GBP'?'£':base==='USD'?'$':'€';
  document.getElementById('fx-grand-premium').textContent =
    (premEst>0||premLockedFlag?'~':'')+fmtGbp(totalGrossPrem).replace('£',baseSym);
  document.getElementById('fx-prem-composition').textContent =
    `All accounts converted to ${base}` +
    (premLockedFlag?' · some locked rows estimated from today\'s rate':'') +
    (premEst>0?' · '+estimated.length+' unprocessed at live rate':'');
}
function runRecon(){
  const raw = (document.getElementById('recon-paste')||{value:''}).value.trim();
  if(!raw){ clearRecon(); return; }

  const lines = raw.split('\n').map(l=>l.trim()).filter(Boolean);

  // Detect and skip header row
  const isHeader = l => /period|insured|client|currency|revenue/i.test(l.split('\t')[0]);
  const dataLines = lines.filter(l => !isHeader(l));

  // Parse rows: Period · Client · Insured · Dept · CCY · RevCCY · RevGBP
  const parseMonth = s => {
    if(!s) return null;
    const m = s.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[^0-9]*(\d{4})/i);
    if(m) return { month: m[1].toLowerCase(), year: parseInt(m[2]) };
    const m2 = s.match(/(\d{4})/);
    return m2 ? { month: null, year: parseInt(m2[1]) } : null;
  };

  // Group by insured+year, summing revenue
  const groups = {};
  for(const line of dataLines){
    const cols = line.split('\t');
    if(cols.length < 6) continue;
    const [period, client, insured, dept, ccy, revCcy, revGbp] = cols;
    const parsed = parseMonth(period);
    if(!parsed || !insured.trim()) continue;
    const key = insured.trim() + '|' + parsed.year + '|' + (ccy||'').trim().toUpperCase();
    if(!groups[key]) groups[key] = { insured: insured.trim(), year: parsed.year, ccy: (ccy||'').trim().toUpperCase(), revCcy: 0, revGbp: 0, periods: [] };
    groups[key].revCcy += parseFloat((revCcy||'0').replace(/,/g,'')) || 0;
    groups[key].revGbp += parseFloat((revGbp||'0').replace(/,/g,'')) || 0;
    groups[key].periods.push(period.trim());
  }

  // Get all entities to match against
  const ent = entGetState();
  const allEnquiries = [];
  for(const ins of ent.insureds){
    for(const enq of (ins.enquiries||[])){
      if((enq.status||'').toLowerCase() !== 'bound') continue;
      const incYear = (() => {
        const p = (enq.inceptionDate||'').split('/');
        return p.length === 3 ? parseInt(p[2]) : null;
      })();
      if(!incYear) continue;
      // Calculate commission from placement if available, else use commission field
      let toolCalc = null;
      let calcNote = '';
      if(enq.placement && enq.placement.layers && enq.placement.layers.length){
        let total = 0;
        for(const layer of enq.placement.layers){
          const gp = parseFloat(layer.grossPremium) || 0;
          const brok = parseFloat(layer.brokerage) || 0;
          // retainedPct: check layer, then bookRows
          let ret = parseFloat(layer.ogbRetainPct) || null;
          if(!ret){
            // check book rows for retainedPct
            const bs = getBookState();
            const matchRow = (bs.bookRows||[]).find(r => {
              const rYear = (() => { const p2=(r.inceptionDate||'').split('/'); return p2.length===3?parseInt(p2[2]):null; })();
              return rYear===incYear && (r.assured||'').toLowerCase().includes(ins.name.toLowerCase().substring(0,8));
            });
            ret = matchRow ? (parseFloat(matchRow.retainedPct)||null) : null;
          }
          if(ret != null){
            total += gp * (brok/100) * (ret/100);
            calcNote = `GP ${gp.toLocaleString()} × ${brok}% brok × ${ret}% retain`;
          } else if(brok){
            total += gp * (brok/100);
            calcNote = `GP ${gp.toLocaleString()} × ${brok}% brok (retain% unknown)`;
          }
        }
        toolCalc = total > 0 ? Math.round(total) : null;
      }
      if(toolCalc == null && enq.commission){
        toolCalc = parseFloat(enq.commission) || null;
        calcNote = 'From commission field';
      }
      allEnquiries.push({ ins, enq, incYear, toolCalc, calcNote, ccy: (enq.currency||'USD').toUpperCase() });
    }
  }

  // Match and compare
  const TOLERANCE = 0.05;
  const rows = [];
  for(const key of Object.keys(groups)){
    const g = groups[key];
    // Find matching enquiry: insured name contains or matches, year matches, ccy matches
    const nameNorm = s => s.toLowerCase().replace(/limited|ltd|llc|inc|s\.a\.|plc|gmbh|\.|,/gi,'').trim();
    const matches = allEnquiries.filter(e =>
      e.incYear === g.year &&
      e.ccy === g.ccy &&
      (nameNorm(e.ins.name).includes(nameNorm(g.insured)) || nameNorm(g.insured).includes(nameNorm(e.ins.name)))
    );
    if(!matches.length){
      rows.push({ ...g, toolCalc: null, calcNote: '', status: 'unmatched', diff: null, diffPct: null });
    } else {
      const best = matches[0];
      const toolCalc = best.toolCalc;
      const diff = toolCalc != null ? Math.round(g.revCcy - toolCalc) : null;
      const diffPct = (toolCalc && toolCalc !== 0) ? (diff / toolCalc) : null;
      const status = toolCalc == null ? 'no-calc' :
                     Math.abs(diffPct) <= TOLERANCE ? 'match' : 'diff';
      rows.push({ ...g, toolCalc, calcNote: best.calcNote, status, diff, diffPct, insuredTool: best.ins.name });
    }
  }

  // Render
  const tbody = document.getElementById('recon-tbody');
  if(!tbody) return;

  let nMatch=0, nDiff=0, nUnmatched=0;

  tbody.innerHTML = rows.map(r => {
    const statusInfo = {
      match:     { label: '✓ Match',     color: 'var(--ok)' },
      diff:      { label: '⚠ Diff',      color: 'var(--warn)' },
      unmatched: { label: '✗ Unmatched', color: 'var(--err)' },
      'no-calc': { label: '? No calc',   color: 'var(--text3)' }
    }[r.status] || { label: r.status, color: 'var(--text3)' };

    if(r.status==='match') nMatch++;
    else if(r.status==='diff') nDiff++;
    else if(r.status==='unmatched') nUnmatched++;

    const fmt = n => n != null ? Math.round(n).toLocaleString() : '—';
    const fmtPct = n => n != null ? (n >= 0 ? '+' : '') + (n*100).toFixed(1)+'%' : '—';
    const diffColor = r.status==='match' ? 'var(--ok)' : r.status==='diff' ? 'var(--warn)' : '';
    const note = r.status==='unmatched' ? 'Not found in tool — check insured name spelling' :
                 r.calcNote || (r.status==='no-calc' ? 'No placement data or commission field' : '');

    return `<tr>
      <td>${r.insuredTool||r.insured}</td>
      <td>${r.year}</td>
      <td>${r.ccy}</td>
      <td style="text-align:right">${fmt(r.revCcy)}</td>
      <td style="text-align:right">${fmt(r.toolCalc)}</td>
      <td style="text-align:right;color:${diffColor}">${r.diff!=null?(r.diff>=0?'+':'')+fmt(r.diff):'—'}</td>
      <td style="text-align:right;color:${diffColor}">${fmtPct(r.diffPct)}</td>
      <td><span style="font-size:10px;font-weight:600;color:${statusInfo.color}">${statusInfo.label}</span></td>
      <td class="muted" style="font-size:10px;max-width:200px">${note}</td>
    </tr>`;
  }).join('');

  document.getElementById('recon-results').style.display = 'block';

  // Badge
  const badge = document.getElementById('recon-badge');
  if(badge){
    if(nDiff || nUnmatched){
      badge.textContent = `${nDiff+nUnmatched} issue${(nDiff+nUnmatched)!==1?'s':''}`;
      badge.style.background = 'var(--err-bg)';
      badge.style.color = 'var(--err)';
    } else {
      badge.textContent = `${nMatch} match${nMatch!==1?'es':''}`;
      badge.style.background = 'var(--ok-bg)';
      badge.style.color = 'var(--ok)';
    }
    badge.style.display = 'inline';
  }
}
function clearRecon(){
  const ta = document.getElementById('recon-paste');
  if(ta) ta.value = '';
  const res = document.getElementById('recon-results');
  if(res) res.style.display = 'none';
  const badge = document.getElementById('recon-badge');
  if(badge) badge.style.display = 'none';
}

const NYANZA_SLIP_SEED_ID = 'nyanza-light-metals-pci-dsu-2025';

function ensureNyanzaSeed(){
  const slips = getSlips();
  if(slips.find(s=>s.id===NYANZA_SLIP_SEED_ID)) return;
  const slip = {
    id: NYANZA_SLIP_SEED_ID,
    insured: 'Nyanza Light Metals Project',
    product: 'Project Cargo',
    market: "Lloyd's (Oneglobal / Maksure Financial Holdings)",
    territory: 'Worldwide excl. Cuba, Iran, Syria, N Korea, Venezuela, Russia, Belarus, Ukraine, Afghanistan, Myanmar, Crimea, Zaporizhzhia, Kherson, Donetsk, Luhansk',
    date: 'January 2025',
    umr: 'B1743ONEMA',
    premium: '27.50% brokerage. War/Strikes inclusive.',
    added: '2026-04-13',
    notes: `PLACED SLIP — Nyanza Light Metals Project, Richards Bay Industrial Development Zone, Richards Bay 3900, South Africa.
Reference: B1743ONEMA / ONE1743. Overseas broker: Maksure Risk Solutions (Pty) Ltd (previously Maksure Financial Holdings), Waterfall, Midrand. FSP No: 44889.
Security: Lloyd's 99% (lead) + Old Mutual Insurance Company 1%. GUA v2.0 Feb 2014 with Marine Cargo Schedule April 2013.

ACTUAL FINANCIALS (from lenders version):
Section 1 Total Sum Insured: USD 225,000,000 replacement cost basis.
Per conveyance/vessel/aircraft limit: USD 45,000,000 (first loss basis — average waived).
Section 2 DSU limit: USD 264,486,531.36.
Agreed premium: USD 1,400,000 inclusive of risk management fees.
S1 Deductible: 10% of loss, minimum USD 15,000 each and every claim. ICC(C), War, Strikes, GA and S&L payable in full.
S2 Deductible: 30 days aggregate.
Inception: Notice to Proceed 1 January 2025.
LCOD: [insert] — DSU section runs from LCOD to end of indemnity period. Max 48 months total.

SECTION 1 — PROJECT CARGO
Conditions: ICC(A) CL382, ICC(Air) CL387, IWC CL385, IWC(Air) CL388, IWC Post CL390, ISC CL386, ISC(Air) CL389. Classification CL354. CL370 RACCBE paramount.
Attachment: Supplier/manufacturer premises (incl packing yard) → completion of unloading at site. Includes Offsite Storage Facility → Site movements. Excludes: final positioning (unless agreed); modularisation/fabrication yards (transit accepted); permanent storage has separate deductible.
Valuation: Invoice + all charges + prepaid/advanced/guaranteed freight + 10%.
50/50 Clause: If origin of damage (transit vs site) cannot be established, cargo pays 50% and CAR policy pays 50%. Cargo underwriters can exclude themselves if they prove loss is not cargo.
Deferred Unpacking: 90 days from arrival deemed transit loss unless contrary proven. 50/50 applies thereafter.
Key bespoke clauses: Civil Authority; Customs/Immigration Inspection (notwithstanding war exclusion); Cutting Clause; Deliberate Damage Pollution Hazard; Demurrage/Late Return Charges; Difference in Limit/Conditions; Fraudulent Documents (covers both fraudulent docs AND use of legitimate docs without authorisation); Items Sent for Repair; Non-Delivery (60 days sea, 30 days air, 60 days land); On-Deck Shipments (covered incl. jettison/washing overboard); Partial Loss; 75% Payment on Account; Process Clause; Removal of Debris (max 10%); Replacements by Air; Segregation; Termination of Transit (Terrorism) JC2009/056; Vermin Damage; Wilful Misconduct (extended — misconduct without privity of directors/officers not excluded).
Sanctions: JC2010/014 (not LMA3100A).
Cyber: LMA5403.
Communicable Disease: Both JC2020-011 (cargo transit) and JC2020-012 (STP/property). The JC2020-012 sub-limited writeback applies — charges to complete a marine transit are recoverable up to a sub-limit.
Five Powers War Exclusion: UK, USA, France, Russia, China. Paramount War Clause in any reinsurance.
Geographic exclusions: Black Sea/Sea of Azov — WSRCC excluded unless specifically agreed. Red Sea/Gulf of Aden — WSRCC excluded unless specifically agreed.
Accumulation: Up to 2× transit limit if accumulation beyond control of insured.
Policy: Non-cancellable by insurers except: 7 days War/SRCC (48hrs for SRCC to/from USA); 30 days non-payment; JC025-2024 Notice of Administration.
Critical Item Separation (9.16): Named critical items from separate production lines may not be shipped on same conveyance unless agreed by lead underwriter.

SECTION 2 — DELAY IN START UP
Inception: From Latest Agreed Commercial Operation Date (LCOD) — [INSERT].
Period: From LCOD to end of indemnity period. Max 48 months total policy. Extensions require additional premium based on risk exposure.
Triggers (1.1–1.4): Cargo loss/damage under S1 (or but-for deductible); H&M/machinery breakdown per CL285/CL295/AVN16/LSW555D; motor/rail vehicle loss/breakdown; GA/salvage/lifesaving.
Basis: Gross Profit (Rate × Turnover shortfall) OR Fixed Costs + Debt Service. Always + ICW. Insured selects at inception; wording must be aligned to selection.
Attachment/termination: Cargo-linked DSU ceases at project laydown area or per S1 termination (whichever sooner). H&M/vehicle DSU attaches when vessel/conveyance comes alongside berth for loading. Onsite/offsite storage subject to agreement.
Deductible: XX days aggregate (proportional calculation — total indemnity ÷ actual days × deductible days).
Key exclusions: Physical loss recoverable under S1; LDs/penalties/punitive damages (unless included); post-damage improvements; import licence lapse (unless caused by insured peril); government commandeering (unless CL295/S1); Final Positioning; contractor's own materials; public authority restrictions; non-availability of funds.
Special conditions: S2 CONDITION PRECEDENT — Project Cargo must be insured for Marine + War + Strikes. CL354 compliance for Critical Items. Insurer rate review right on Critical Item shipping date revisions.
Critical Items definition (from Survey Warranty): Cannot be repaired/replaced in time for SCOD; OR unit price >USD 5,000,000 break-bulk; OR dimensions >12m × 2.5m × 2.5m; OR weight >50MT; OR ocean barge shipments.
Survey Warranty: Named Surveyor [blank at draft stage]. Breach → ICC(B) without Cl.1.3 (plus Cl.1.1.3 deleted if road vehicle not approved). On-deck/barge breach → ICC(C). 72-hour notification rule. Surveyor breach of warranty note: does not void policy — individual shipment only. Survey warranty paramount notwithstanding E&O clause and Multiple Insureds clause.

MULTIPLE INSUREDS: Separate insurable interests treated as individual policies. Vitiating act by one insured does not prejudice others. Subrogation waived against all insureds except those committing vitiating acts.

CLAIMS: USD 25,000 survey threshold. 75% payment on account where only quantum in dispute. Subrogation: Insurers may not sue in Insured's name without prior permission.

BROKING NOTES: Brokerage 27.50%. Country of origin: South Africa. Risk location: South Africa. Regulatory classification: Large Commercial. Non-US risk. Oneglobal presenting to market; Maksure as overseas broker.`
  };
  slips.push(slip);
  saveSlips(slips);
}


const WW_LENDERS_SEED_ID = 'ww-lenders-insurance-schedule-2025';

function ensureWWLendersSeed(){
  const slips = getSlips();
  if(slips.find(s=>s.id===WW_LENDERS_SEED_ID)) return;
  const slip = {
    id: WW_LENDERS_SEED_ID,
    insured: 'Lenders Minimum Insurance Requirements — Project Finance Template (WW Sample)',
    product: 'Project Cargo',
    market: 'Reference Document (not a placed slip)',
    territory: 'South Africa / Worldwide',
    date: 'February 2025',
    umr: 'N/A — Reference template',
    premium: 'N/A',
    added: '2026-04-13',
    notes: `LENDERS' MINIMUM INSURANCE REQUIREMENTS — PROJECT FINANCE TEMPLATE
Source: Insurance Schedule (WW Sample), Common Terms Agreement Schedule 7. This is the insurance annex that lenders require as a condition of project financing. It specifies minimum requirements across all required policies for the project — not the terms the market actually places.

PURPOSE: When underwriting project cargo for a project-financed asset, this document type is what the lenders' technical advisors (LTA) will send you or the broker as the specification. The placed slip must comply with or exceed these requirements. Items highlighted by lenders as "not met" become subjectivities or endorsements.

EMPLOYER-CONTROLLED INSURANCES (Employer buys and maintains):

1. CONSTRUCTION ALL RISKS (CAR)
Insured: Joint names — Contractor + Employer + subcontractors (all tiers) + Lenders + Buyer + technical advisers + O&M Contractor (site activities only).
Sum insured: Full reinstatement/replacement value + 10% escalation. NatCat sub-limits based on EML or market max.
Scope: All risks physical loss/damage including testing, commissioning and Defects Liability Period. Property substituted during maintenance period also covered.
Key clauses required: Transit within SA; LEG2/96 defects; professional fees; removal of debris; 10% escalation; 50/50 clause; expediting expenses; cessation of works; 72-hour clause (storm/allied perils); automatic reinstatement; fire brigade; temporary repairs; leased equipment; local/civil/military authorities; early production/beneficial occupation; preventative measures; pollutant cleanup; operational testing; demolition/ICC; off-site fabrication/storage; preservation of warranties; claims preparation; interim payments on account; Lenders endorsement per Schedule 7 Part 4 Common Terms Agreement.
Non-cancellation by insurers except non-payment.

2. THIRD PARTY LIABILITY
Scope: Legal liability for property damage, personal injury/death, trespass/nuisance arising from project execution. Pollution if sudden/accidental.
Limit: ZAR [●] each claim, unlimited aggregate (except products liability which has aggregate).
Key clauses: Cross-liability; sudden/accidental seepage/pollution; multiple insureds; spread of fire; prevention of access; trespass and nuisance.

3. MARINE CARGO (must meet or exceed lenders' specification)
Sum insured: Max replacement value any one consignment including insurance and freight.
Cover: ICC(A) + War + SRCC + piracy. All risks conditions.
Attachment: Supplier premises → site delivery including return shipments.
Incoterms note: Cover requirements PREVAIL over any incoterm agreed — client cannot argue CIF/FOB affects the coverage obligation.
Required clauses: 50/50 clause; intermediate storage; concealed damage; airfreight replacement; S&L/minimisation; packing insufficiency waiver (key components only); returned/refused shipments (automatic); special piracy clause (total loss declared after seizure date — regardless of whether damage has occurred); DIC clause; missing goods clause (subject to underwriter confirmation); claims preparation costs; disposal of salvage; on-deck shipments; interim payments/payments on account; Lenders endorsement per CTA Schedule 7 Part 4.
Survey warranty: Applies to Critical Components as defined in Contract.
Deductible: ZAR [●] — not applicable to GA Contributions and Salvage Charges.

4. SASRIA — CONTRACT WORKS AND INLAND TRANSIT (South Africa specific)
SASRIA = South African Special Risks Insurance Association. Mandatory government-backed insurer for political/civil/social risks in South Africa. Standard commercial market CANNOT cover these perils in SA — only SASRIA can.
Covers: Acts by any organisation to overthrow government; acts for political aim or social/economic change; riots, strikes, lock-outs, labour disturbances, public disorder, civil commotion.
Limit: SASRIA maximum per occurrence and aggregate [subject to SASRIA's current limits].
Required for: Both CAR (contract works) and inland transit. Any SA project cargo placement must address SASRIA — the marine policy covers international transit (SRCC via CL386) but inland SA legs need separate SASRIA cover.
Key extensions: 10% escalation; claims preparation; demolition/clearance; debris removal; municipal plan fees; public authorities; fire extinguishing; security costs; expediting.

5. RIOT WRAP / SASRIA DIFFERENCE IN LIMITS
Covers the gap between SASRIA limits and full reinstatement value. Also covers sabotage, insurrection, rebellion, revolution, mutiny, coup d'état, looting and malicious damage not recoverable under SASRIA.
Basis: EML per event and in aggregate.

CONTRACTOR-CONTROLLED INSURANCES:
COIDA/Workers Comp; Contingent Employer's Liability; Motor Vehicle Liability; Project Specific Professional Indemnity (PI — project specific, retroactive date max 36 months pre-signature, 36-month extended reporting post handover, LEG2-equivalent); Contractor's Equipment (all risks incl. SASRIA).

GENERAL REQUIREMENTS:
Parties must not void policies. Employer's insurance is primary and non-contributory. All parties must co-operate on claims. Subrogation waived between insureds (except fraud/wilful acts/vitiating acts). Lenders must be noted under all policies.

KEY INSIGHT FOR MARINE CARGO UNDERWRITERS: The lenders' insurance schedule is the authoritative specification. When placing marine cargo for a project-financed asset, obtain the insurance schedule from the lenders' technical advisor early. Items the broker asks you to include that seem unusual (piracy total loss declaration, missing goods sub-limit, claims preparation costs) often trace back to specific requirements in this document. The 50/50 clause between cargo and CAR is specifically required by lenders. The packing waiver is limited to key components — not blanket. The SASRIA gap for SA inland transits needs to be addressed separately from the Lloyd's placement.`
  };
  slips.push(slip);
  saveSlips(slips);
}
// FX cache key — storage location for cached exchange rates
var FX_CACHE_KEY = 'og_fx_rates_v1';
function getFxCache(){ try{ return JSON.parse(localStorage.getItem(FX_CACHE_KEY)||'null'); }catch{ return null; } }
function saveFxCache(rates,base){ localStorage.setItem(FX_CACHE_KEY,JSON.stringify({rates,base,ts:Date.now()})); }
async function fetchFxRates(base){
  const resp = await fetch(`https://api.exchangerate-api.com/v4/latest/${base}`);
  if(!resp.ok) throw new Error('HTTP '+resp.status);
  const data = await resp.json();
  return data.rates;
}
// ensureFxRates — fetches fresh rates if cache is stale or missing, returns cache on network failure.
// Returns { rates, base, ts } or null if nothing available at all.
async function ensureFxRates(base){
  base = (base || 'GBP').toUpperCase();
  var CACHE_TTL_MS = 24 * 60 * 60 * 1000;  // 24 hours
  var cached = getFxCache();
  if (cached && cached.base === base && cached.ts && (Date.now() - cached.ts) < CACHE_TTL_MS) {
    return cached;
  }
  try {
    var rates = await fetchFxRates(base);
    if (rates) {
      saveFxCache(rates, base);
      return { rates: rates, base: base, ts: Date.now() };
    }
  } catch(e) {
    console.warn('[ensureFxRates] live fetch failed:', e.message);
  }
  if (cached && cached.rates) return cached;
  return null;
}


// ─── MISSING FUNCTION STUBS (ChatGPT build gaps) ──────────────────────────────

function calcChurnRisk(ins, enq) {
  var flags = [];
  var level = 'LOW';
  var now = new Date();

  // Days to renewal
  var inception = enq.inceptionDate ? new Date(enq.inceptionDate.split('/').reverse().join('-')) : null;
  var daysToRenewal = inception ? Math.round((inception - now) / 86400000) : 999;
  if (daysToRenewal < 30 && (enq.status || '').toLowerCase() !== 'bound') {
    flags.push('Renewal <30d, not bound');
    level = 'HIGH';
  } else if (daysToRenewal < 60) {
    flags.push('Renewal <60d');
    if (level !== 'HIGH') level = 'MEDIUM';
  }

  // Last contact
  var notes = ins.notes || [];
  if (notes.length) {
    var lastNote = notes[notes.length - 1];
    var lastDate = lastNote.date ? new Date(lastNote.date.split('/').reverse().join('-')) : null;
    if (lastDate) {
      var daysSinceContact = Math.round((now - lastDate) / 86400000);
      if (daysSinceContact > 90) { flags.push('No contact >90d'); level = 'HIGH'; }
      else if (daysSinceContact > 45) { flags.push('No contact >45d'); if (level !== 'HIGH') level = 'MEDIUM'; }
    }
  } else {
    flags.push('No correspondence on file');
    if (level !== 'HIGH') level = 'MEDIUM';
  }

  if (!flags.length) flags.push('On track');
  var colors = { HIGH: { bg: '#FDEAEA', col: '#C0392B' }, MEDIUM: { bg: '#FFF4E5', col: '#E67E22' }, LOW: { bg: '#E8F5E9', col: '#27AE60' } };
  var c = colors[level] || colors.LOW;
  return { level: level, flags: flags, bg: c.bg, col: c.col };
}

function cwInit() {
  // CW panel uses HTML onclick handlers directly (cwRenderBlotter etc.)
  // This stub prevents the tab() dispatcher from throwing
  try {
    if (typeof cwRenderBlotter === 'function') cwRenderBlotter();
  } catch(e) {}
}

function renderLostDeals() {
  var el = document.getElementById('intel-lostdeals-mode');
  if (!el) return;
  var s = gs();
  var placements = s.placements || {};
  var lost = Object.values(placements).filter(function(p) { return (p.status || '').toLowerCase() === 'ntu' || (p.status || '').toLowerCase() === 'dead'; });

  if (!lost.length) {
    el.innerHTML = '<div class="muted" style="padding:16px">No lost deals recorded.</div>';
    return;
  }

  var rows = lost.map(function(p) {
    return '<tr>' +
      '<td style="font-weight:500">' + (p.insured || p.assured || '—') + '</td>' +
      '<td>' + (p.producer || '—') + '</td>' +
      '<td>' + (p.ntuReason || '—') + '</td>' +
      '<td>' + (p.ntuDate || '—') + '</td>' +
      '<td style="text-align:right">' + (p.premium ? Number(p.premium).toLocaleString() : '—') + '</td>' +
      '<td>' + (p.notes || '—') + '</td>' +
      '</tr>';
  }).join('');

  el.innerHTML = '<div style="overflow-x:auto"><table style="width:100%;font-size:12px">' +
    '<tr><th>Insured</th><th>Producer</th><th>Reason</th><th>Date</th><th style="text-align:right">Premium</th><th>Notes</th></tr>' +
    rows + '</table></div>';
}

// ─── CW PANEL STUBS (HTML references these but they were never implemented in v15) ──

function cwRenderBlotter() {
  // Cargo war blotter renders via the extensions.js overrides
}

function cwCopyEmail() {
  var el = document.getElementById('cw-email-out');
  if (el && el.textContent) navigator.clipboard.writeText(el.textContent).then(function(){ showNotice('Copied','ok'); });
}

function cwExportBordereau() {
  showNotice('Bordereau export — use the BDX button in the cargo war panel','warn');
}

function cwHandleFileInput(input) {
  if (input && input.files) cwHandleDrop({ dataTransfer: { files: input.files }, preventDefault: function(){} });
}

function cwHandleDrop(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (typeof handleEmailFile === 'function' && e && e.dataTransfer && e.dataTransfer.files) {
    handleEmailFile(e.dataTransfer.files);
  }
}

function cwSetView(view) {
  var simple = document.getElementById('cw-simple-view');
  var complex = document.getElementById('cw-complex-view');
  if (simple) simple.style.display = view === 'simple' ? 'block' : 'none';
  if (complex) complex.style.display = view === 'complex' ? 'block' : 'none';
}

function cwShowEmailPanel() {
  var el = document.getElementById('cw-email-panel');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function cwSetCompliance(riskId, status) {
  var risks = typeof cwGetRisks === 'function' ? cwGetRisks() : [];
  var r = risks.find(function(x) { return x.id === riskId; });
  if (r) {
    r.compliance = status;
    if (typeof cwSaveRisks === 'function') cwSaveRisks(risks);
    if (typeof cwRenderBlotter === 'function') cwRenderBlotter();
    showNotice('Compliance: ' + status, 'ok');
  }
}

function cwRunAIScreen(riskId) {
  showNotice('AI compliance screen — open via the ⚖ button on individual risks', 'warn');
}

function cwGenerateEmail() {
  showNotice('Generate email — use the email button in the cargo war panel', 'warn');
}

function importBookSpreadsheet() {
  showNotice('Book spreadsheet import is not yet implemented', 'warn');
}


function toggleBookMarket() {
  var el = document.getElementById('book-market-view');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}
