// ─── PRE-BIND COMPLIANCE ───────────────────────────────────────────────────────

var _pbInsId = null;
var _pbEnqId = null;

var PB_SANCTIONED_HARD = ['Iran','Syria','North Korea','Cuba','Myanmar','Sudan','South Sudan','Somalia'];
var PB_SANCTIONED_REVIEW = ['Russia','Belarus','Venezuela','Nicaragua','Zimbabwe','Mali','Central African Republic','Libya','Yemen','Haiti'];
var PB_SANCTIONED_NOTES = {
  'Russia': 'Extensive US/UK/EU sectoral sanctions. Screen all entities carefully.',
  'Venezuela': 'Sanctions partially eased (OFAC GL46/46A Jan 2026) for oil sector only. General blocking sanctions remain. Individual SDNs still designated.',
  'Cuba': 'Comprehensive US sanctions. Lloyds may cover Cuban interests under UK/EU rules — confirm applicable law.',
  'Belarus': 'Significant US/UK/EU sanctions post-2021. Screen entities.',
  'Myanmar': 'UK/EU/US targeted sanctions on military and connected entities.'
};

var PB_CHECKLIST_ITEMS = [
  { id:'kyc',      label:'KYC/AML completed — insured identity verified', required:true },
  { id:'sanction', label:'Sanctions screening run — no SDN/OFAC/HMT/UN/EU matches', required:true },
  { id:'pep',      label:'PEP check — no politically exposed persons identified', required:true },
  { id:'adverse',  label:'Adverse news search — no material adverse findings', required:false },
  { id:'authority',label:'Binding authority confirmed — risk within facility scope and limits', required:true }
];

function pbOpenCompliance(insId, enqId){
  _pbInsId = insId; _pbEnqId = enqId;
  var ent = entGetState();
  var ins = (ent.insureds||[]).find(function(i){ return i.id===insId; });
  if(!ins) { handleMissingLocalInsured(insId, 'open compliance screen'); return; }
  var enq = (ins.enquiries||[]).find(function(e){ return e.id===enqId; });
  if(!enq) return;
  var prod = (ent.producers||[]).find(function(p){ return p.id===ins.producerId; });

  document.getElementById('pb-comp-insured').textContent = ins.name;
  document.getElementById('pb-comp-sub').textContent = [
    prod ? prod.name : '',
    enq.cedant ? 'Cedant: '+enq.cedant : '',
    enq.inceptionDate ? 'Inception: '+enq.inceptionDate : '',
    enq.handler ? 'Handler: '+enq.handler : ''
  ].filter(Boolean).join('  ·  ');

  pbUpdateBadge(enq.compliance ? enq.compliance.result : null);
  pbRunTerritoryCheck(ins, enq);

  var aiEl = document.getElementById('pb-ai-result');
  if(enq.compliance && enq.compliance.aiResult){
    aiEl.innerHTML = enq.compliance.aiResult;
  } else {
    aiEl.textContent = 'Click "Run AI screen" to check entity names against OFAC/HMT/UN/EU and screen for adverse news.';
  }

  var saved = (enq.compliance && enq.compliance.checklist) || {};
  document.getElementById('pb-checklist').innerHTML = PB_CHECKLIST_ITEMS.map(function(item){
    var checked = !!saved[item.id];
    return '<label style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;border-radius:6px;cursor:pointer;border:1px solid '+(checked?'var(--ok)30':'var(--border)')+';background:'+(checked?'var(--ok-bg)':'var(--surface)')+'">'
      +'<input type="checkbox" id="pb-chk-'+item.id+'" '+(checked?'checked':'')+' style="margin-top:2px;flex-shrink:0">'
      +'<span style="font-size:12px">'
      +(item.required ? '<span style="color:var(--err);font-weight:700;font-size:10px;margin-right:4px">REQUIRED</span>' : '')
      +item.label+'</span></label>';
  }).join('');

  document.getElementById('pb-comp-notes').value = (enq.compliance && enq.compliance.notes) || '';
  document.getElementById('pb-comp-modal').style.display = 'block';
}

function pbRunTerritoryCheck(ins, enq){
  var el = document.getElementById('pb-territory-result');
  var combined = (ins.region||'')+' '+(enq.region||'')+' '+(enq.notes||'');
  var cLow = combined.toLowerCase();
  var flags = PB_SANCTIONED_HARD.filter(function(c){ return cLow.indexOf(c.toLowerCase())>-1; });
  var reviews = PB_SANCTIONED_REVIEW.filter(function(c){ return cLow.indexOf(c.toLowerCase())>-1; });
  var html = '';

  if(flags.length){
    html += '<div style="padding:8px 10px;background:var(--err-bg);border-radius:6px;margin-bottom:6px">'
      +'<span style="color:var(--err);font-weight:700">✕ SANCTIONED TERRITORY: '+flags.join(', ')+'</span>'
      +'<div style="font-size:11px;color:var(--err);margin-top:3px">Comprehensive sanctions apply. Senior broker review required before any placement.</div>'
      +'</div>';
  }
  if(reviews.length){
    html += '<div style="padding:8px 10px;background:var(--warn-bg);border-radius:6px;margin-bottom:6px">'
      +'<span style="color:var(--warn);font-weight:700">⚠ HIGH-RISK JURISDICTION: '+reviews.join(', ')+'</span>';
    reviews.forEach(function(c){ if(PB_SANCTIONED_NOTES[c]) html += '<div style="font-size:11px;color:var(--warn);margin-top:2px">'+c+': '+PB_SANCTIONED_NOTES[c]+'</div>'; });
    html += '</div>';
  }
  if(!flags.length && !reviews.length){
    html = '<span style="color:var(--ok);font-weight:600">✓ No sanctioned or high-risk territories detected</span>'
      +'<div style="font-size:11px;color:var(--text3);margin-top:3px">Based on insured region ('+( ins.region||'not set')+'), enquiry region ('+( enq.region||'not set')+'). Verify trade routes manually.</div>';
  }
  html += '<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">'
    +'<a href="https://sanctionssearch.ofac.treas.gov/" target="_blank" class="btn sm" style="font-size:11px;text-decoration:none">OFAC SDN ↗</a>'
    +'<a href="https://www.gov.uk/government/publications/financial-sanctions-consolidated-list-of-targets" target="_blank" class="btn sm" style="font-size:11px;text-decoration:none">HMT List ↗</a>'
    +'<a href="https://www.un.org/securitycouncil/content/un-sc-consolidated-list" target="_blank" class="btn sm" style="font-size:11px;text-decoration:none">UN SC ↗</a>'
    +'<a href="https://eeas.europa.eu/topics/sanctions-policy/8442/consolidated-list-sanctions_en" target="_blank" class="btn sm" style="font-size:11px;text-decoration:none">EU List ↗</a>'
    +'</div>';
  el.innerHTML = html;
}

async function pbRunAIScreen(){
  var ent = entGetState();
  var ins = (ent.insureds||[]).find(function(i){ return i.id===_pbInsId; });
  var enq = ins && (ins.enquiries||[]).find(function(e){ return e.id===_pbEnqId; });
  if(!ins||!enq) return;
  var prod = (ent.producers||[]).find(function(p){ return p.id===ins.producerId; });
  var key = getKey();
  if(!key){ showNotice('API key required for AI screening','err'); return; }

  var spin = document.getElementById('pb-ai-spin');
  var out = document.getElementById('pb-ai-result');
  spin.style.display = 'inline';
  out.textContent = 'Screening entities...';

  var sys = 'You are a Lloyds marine cargo compliance officer at OG Broking. Screen these placement entities for: (1) OFAC/HMT/UN/EU sanctions list matches, (2) adverse news - financial crime, money laundering, corruption, terrorism, (3) PEP indicators. Sanctions context Apr 2026: Iran/Syria/North Korea/Cuba/Myanmar/Sudan = comprehensive. Russia/Belarus = extensive sectoral. Venezuela = partially eased oil sector only (OFAC GL46A), general blocking remains, SDNs still designated. For each entity: Name: CLEAR / FLAG / UNKNOWN + brief reason. End with OVERALL: CLEAR / REVIEW / DECLINE. Format as short HTML. CLEAR = green. FLAG/DECLINE = red. UNKNOWN/REVIEW = amber.';

  var data = { insured: ins.name, insuredRegion: ins.region||'', cedant: enq.cedant||'', producer: prod?prod.name:'', quoteLeader: enq.quoteLeader||'', country: enq.region||ins.region||'', notes: (enq.notes||'').slice(0,300) };

  try {
    var resp = await callAI(sys, 'Screen this placement:\n'+JSON.stringify(data,null,2), 800);
    out.innerHTML = resp || 'No response';
    var ent2 = entGetState();
    var ins2 = (ent2.insureds||[]).find(function(i){ return i.id===_pbInsId; });
    var enq2 = ins2 && (ins2.enquiries||[]).find(function(e){ return e.id===_pbEnqId; });
    if(enq2){ if(!enq2.compliance) enq2.compliance={}; enq2.compliance.aiResult=resp; entSave(ent2); }
  } catch(e){ out.textContent = 'Error: '+e.message; }
  spin.style.display = 'none';
}

function pbUpdateBadge(result){
  var el = document.getElementById('pb-comp-badge');
  if(!result||!el){ if(el) el.style.display='none'; return; }
  var map = { pass:{bg:'var(--ok-bg)',col:'var(--ok)',text:'✓ PASS'}, review:{bg:'var(--warn-bg)',col:'var(--warn)',text:'⚠ REVIEW'}, decline:{bg:'var(--err-bg)',col:'var(--err)',text:'✕ DECLINE'} };
  var m = map[result]; if(!m){ el.style.display='none'; return; }
  el.style.display='inline-block'; el.style.background=m.bg; el.style.color=m.col; el.textContent=m.text;
}

function pbSaveResult(result){
  var ent = entGetState();
  var ins = (ent.insureds||[]).find(function(i){ return i.id===_pbInsId; });
  var enq = ins && (ins.enquiries||[]).find(function(e){ return e.id===_pbEnqId; });
  if(!ins||!enq) return;

  var checklist = {};
  PB_CHECKLIST_ITEMS.forEach(function(item){
    var el = document.getElementById('pb-chk-'+item.id);
    checklist[item.id] = el ? el.checked : false;
  });

  if(result==='pass'){
    var missing = PB_CHECKLIST_ITEMS.filter(function(item){ return item.required && !checklist[item.id]; });
    if(missing.length){ showNotice('Complete all REQUIRED checklist items before marking PASS','err'); return; }
  }

  if(!enq.compliance) enq.compliance = {};
  enq.compliance.result = result;
  enq.compliance.checklist = checklist;
  enq.compliance.notes = document.getElementById('pb-comp-notes').value.trim();
  enq.compliance.date = new Date().toISOString().slice(0,10);
  enq.compliance.handler = enq.handler||'';

  entSave(ent);
  pbUpdateBadge(result);
  showNotice('Compliance '+result.toUpperCase()+' saved for '+ins.name, result==='pass'?'ok':result==='review'?'warn':'err');
  setTimeout(function(){ entOpenCard(_pbInsId); }, 300);
  document.getElementById('pb-comp-modal').style.display='none';
}
