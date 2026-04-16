// ─── FEATURES #6 + #5 (Chat 12 · v11.16) ────────────────────────────────────

// ── #6: AUTO-TICK POST-BIND CHECKLIST ────────────────────────────────────────
var POSTBIND_DOCTYPE_MAP = {
  'closing-docs':          ['eoc'],
  'binding-confirmation':  ['eoc'],
  'firm-order':            ['eclipse'],
  'commission-advice':     ['invoiced'],
  'debit-note':            ['invoiced']
};

function autoTickPostBind(ent, ins, note) {
  if(!ins || !note) return;
  var docType = note.docType || 'general-correspondence';
  var fields = POSTBIND_DOCTYPE_MAP[docType];
  if(!fields || !fields.length) return;
  var enqId = note.enquiryId;
  var enq = enqId ? (ins.enquiries||[]).find(function(e){ return e.id===enqId; }) : null;
  if(!enq) enq = (ins.enquiries||[]).filter(function(e){ return e.status==='Bound'; }).slice(-1)[0];
  if(!enq) return;
  if(!enq.postBind) enq.postBind = {eoc:'',openingMemo:'',imageRight:'',eclipse:'',invoiced:'',sharepoint:'',gfr:''};
  var ticked = [];
  fields.forEach(function(f) {
    if(!enq.postBind[f]) { enq.postBind[f] = new Date().toLocaleDateString('en-GB'); ticked.push(f); }
  });
  if(ticked.length) {
    var labels = {eoc:'EOC',openingMemo:'Opening Memo',imageRight:'ImageRight',eclipse:'Eclipse',invoiced:'Invoiced',sharepoint:'SharePoint',gfr:'GFR'};
    var tickedLabels = ticked.map(function(f){ return labels[f]||f; }).join(', ');
    setTimeout(function(){ showNotice('+ Post-bind: ' + tickedLabels + ' auto-ticked for ' + ins.name, 'ok'); }, 800);
  }
}

// ── #5: RENEWAL DRAFT TASKS ───────────────────────────────────────────────────
var _origRenderHomeTasks = null;

function _patchRenderHomeTasks() {
  if(_origRenderHomeTasks) return;
  _origRenderHomeTasks = window.renderHomeTasks;
  window.renderHomeTasks = function() {
    _origRenderHomeTasks();
    _appendRenewalDraftTasks();
  };
}

function _appendRenewalDraftTasks() {
  var el = document.getElementById('home-tasks-inner');
  if(!el) return;
  var ent = entGetState();
  var today = new Date(); today.setHours(0,0,0,0);

  (ent.insureds||[]).forEach(function(ins) {
    var prod = (ent.producers||[]).find(function(p){ return p.id===ins.producerId; });
    var prodName = prod ? prod.name : '';

    (ins.enquiries||[]).forEach(function(enq) {
      if(enq.status !== 'Bound') return;
      var p = (enq.inceptionDate||'').split('/');
      if(p.length!==3) return;
      var incDate = new Date(+p[2],+p[1]-1,+p[0]);
      var daysUntil = Math.round((incDate - today) / 86400000);
      if(daysUntil < 0 || daysUntil > 60) return;

      var notes = ins.notes || [];
      var lastNote = null;
      notes.forEach(function(n){
        var dp = (n.date||'').split('/');
        var d = dp.length===3 ? new Date(+dp[2],+dp[1]-1,+dp[0]) : null;
        if(d && (!lastNote || d > lastNote)) lastNote = d;
      });
      var daysSince = lastNote ? Math.round((today - lastNote) / 86400000) : 999;
      if(daysSince < 30) return;

      var urgency = daysUntil <= 14 ? 'err' : 'warn';
      var col = urgency === 'err' ? 'var(--err)' : 'var(--warn)';
      var contactNote = daysSince >= 999 ? 'no contact on file' : daysSince + 'd since last contact';
      var taskId = 'renewal-draft-task-' + ins.id + '-' + enq.id;
      if(document.getElementById(taskId)) return;

      var div = document.createElement('div');
      div.id = taskId;
      div.style.cssText = 'cursor:default;padding:10px 12px;background:var(--surface);border:1px solid '+col+'30;border-left:3px solid '+col+';border-radius:var(--radius);display:flex;gap:10px;align-items:flex-start;box-shadow:var(--shadow-sm)';
      div.innerHTML = '<span style="font-size:14px;flex-shrink:0;margin-top:1px">&#x1F4DD;</span>'
        + '<div style="flex:1">'
        + '<div style="font-size:12px;font-weight:600;color:'+col+'">Draft renewal approach &mdash; '+daysUntil+'d to renewal</div>'
        + '<div style="font-size:11px;color:var(--text2);margin-top:2px">'+ins.name+' &middot; '+prodName+' &middot; '+contactNote+'</div>'
        + '</div>';

      var btn = document.createElement('button');
      btn.className = 'btn sm primary';
      btn.style.cssText = 'font-size:10px;flex-shrink:0;align-self:center';
      btn.textContent = 'Draft';
      (function(iid, eid){ btn.onclick = function(e){ e.stopPropagation(); draftRenewalApproach(iid, eid); }; })(ins.id, enq.id);
      div.appendChild(btn);

      var clearMsg = el.querySelector('div[style*="var(--ok)"]');
      if(clearMsg && clearMsg.textContent && clearMsg.textContent.indexOf('No suggested tasks') > -1) clearMsg.remove();
      el.appendChild(div);
    });
  });
}

async function draftRenewalApproach(insId, enqId) {
  var key = getKey();
  if(!key) { showNotice('API key required','err'); return; }
  var ent = entGetState();
  var ins = (ent.insureds||[]).find(function(i){ return i.id===insId; });
  var enq = ins && (ins.enquiries||[]).find(function(e){ return e.id===enqId; });
  if(!ins || !enq) return;
  var prod = (ent.producers||[]).find(function(p){ return p.id===ins.producerId; });
  var prodName = prod ? prod.name : 'producer';

  _aiOpenNew = true;
  var panel = document.getElementById('global-ai-panel');
  var fab = document.getElementById('global-ai-fab');
  if(panel) panel.style.display = 'flex';
  if(fab)   fab.style.display   = 'none';

  addAIMsg_new('assistant', 'Drafting renewal approach for ' + ins.name + '...');

  var lastNotes = (ins.notes||[]).slice(-3).map(function(n){ return (n.date||'')+': '+((n.summary||'').slice(0,80)); }).join(' | ');
  var lossInfo = ins.lossRecord && ins.lossRecord.length ? ins.lossRecord.map(function(l){ return l.year+': '+(l.description||''); }).join('; ') : 'No loss record';

  var sys = "You are a senior Lloyd's wholesale broker at OG Broking. Write a short warm renewal approach email to the overseas producer. Professional but personal, 3-4 short paragraphs. No markdown. Start with Subject: line.";
  var user = 'Renewal approach for: ' + ins.name + ' | Producer: ' + prodName + ' | Inception: ' + (enq.inceptionDate||'upcoming') + ' | Premium: ' + (enq.currency||'') + ' ' + (enq.premium||'TBC') + ' | Handler: ' + (enq.handler||'OG Broking') + ' | Notes: ' + (lastNotes||'none') + ' | Loss record: ' + lossInfo + '. Ask for any changes, confirm we are preparing terms.';

  try {
    var text = await aiText({
      model:'claude-haiku-4-5-20251001',
      max_tokens:800,
      system:sys,
      user:user
    });
    var msgs = document.getElementById('global-ai-messages');
    if(msgs && msgs.lastChild) msgs.removeChild(msgs.lastChild);
    addAIMsg_new('assistant', 'Renewal approach draft for ' + ins.name + ':\n\n' + (text||'No response'));
    _aiHistoryNew.push({role:'assistant', content: text||''});
    var inp = document.getElementById('global-ai-input');
    if(inp) inp.placeholder = 'Ask AI to adjust tone, shorten, or add specific terms...';
  } catch(e) {
    addAIMsg_new('assistant', 'Draft failed: ' + e.message);
  }
}

(function(){ setTimeout(function(){ _patchRenderHomeTasks(); }, 150); })();

