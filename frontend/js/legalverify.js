// ─── LEGAL NAME VERIFICATION (Chat 12 · v11.16) ──────────────────────────────
// Searches online for the company's official registered legal name and compares
// it with the stored name. Shows a diff panel on the entity card for human review.
// Never auto-applies — always requires explicit confirmation.

async function verifyLegalName(insId) {
  var key = getKey();
  if(!key) { showNotice('API key required for name verification','err'); return; }

  var ent = entGetState();
  var ins = (ent.insureds||[]).find(function(i){ return i.id===insId; });
  if(!ins) { handleMissingLocalInsured(insId, 'verify legal name'); return; }

  var btn = document.getElementById('verify-name-btn-'+insId);
  var panel = document.getElementById('name-verify-panel-'+insId);
  if(btn) { btn.textContent = '⟳ Verifying...'; btn.disabled = true; }
  if(panel) { panel.style.display='none'; }

  var prod = (ent.producers||[]).find(function(p){ return p.id===ins.producerId; });
  var region = ins.region || (prod ? prod.region : '') || '';

  var sys = "You are a Lloyds insurance compliance researcher. Find the official registered legal name of a company using web search. Return ONLY valid JSON with these fields: legalName (full official registered name), jurisdiction (country of registration), registrationNumber (company reg number if found, else null), confidence (high/medium/low), nameMatch (exact/close/different/unknown), notes (brief explanation), suggestedCorrection (corrected name for a Lloyds slip, or null if current name is fine). Only suggest a correction if the legal name materially differs from what you were given. Return only the JSON object.";

  var userMsg = 'Name to verify: ' + ins.name + ' | Country: ' + (region||'unknown') + ' | Producer: ' + (prod?prod.name:'unknown') + '. Search for this company and return its official registered legal name as JSON.';

  try {
    var data = await aiRequest({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      tools: [{"type":"web_search_20250305","name":"web_search"}],
      system: sys,
      messages: [{ role:'user', content: userMsg }]
    });

    var raw = extractAIText(data);
    var clean = raw.replace(/```json|```/g,'').trim();

    var result;
    try { result = JSON.parse(clean); } catch(e) {
      // Try to extract JSON from within the text
      var m = clean.match(/\{[\s\S]*\}/);
      if(m) { try { result = JSON.parse(m[0]); } catch(e2) { result = null; } }
    }

    if(!result || !result.legalName) {
      if(panel) {
        panel.style.background = 'var(--warn-bg)';
        panel.style.display = 'block';
        panel.innerHTML = '<span style="color:var(--warn);font-weight:600;font-size:12px">⚠ Could not parse result</span><div style="font-size:11px;color:var(--text2);margin-top:4px">' + (raw.slice(0,200)||'No response received') + '</div>';
      }
      if(btn) { btn.textContent = '⚖ Verify legal name'; btn.disabled = false; }
      return;
    }

    // Store the verification result on the insured
    var ent2 = entGetState();
    var ins2 = (ent2.insureds||[]).find(function(i){ return i.id===insId; });
    if(ins2) {
      ins2.legalNameVerification = {
        legalName: result.legalName,
        jurisdiction: result.jurisdiction||'',
        registrationNumber: result.registrationNumber||null,
        confidence: result.confidence||'low',
        nameMatch: result.nameMatch||'unknown',
        notes: result.notes||'',
        suggestedCorrection: result.suggestedCorrection||null,
        verifiedDate: new Date().toLocaleDateString('en-GB'),
        currentName: ins2.name
      };
      if(result.nameMatch === 'exact' && !result.suggestedCorrection) {
        ins2.legalNameVerified = true;
      }
      entSave(ent2);
    }

    // Render the result panel
    if(panel) {
      var isMatch = result.nameMatch === 'exact';
      var isClose = result.nameMatch === 'close';
      var isDiff  = result.nameMatch === 'different';
      var isUnknown = result.nameMatch === 'unknown';

      var bgCol  = isMatch ? 'var(--ok-bg)'   : isClose ? 'var(--warn-bg)' : isDiff ? 'var(--err-bg)' : 'var(--bg)';
      var txtCol = isMatch ? 'var(--ok)'      : isClose ? 'var(--warn)'    : isDiff ? 'var(--err)'    : 'var(--text2)';
      var icon   = isMatch ? '✓' : isClose ? '~' : isDiff ? '✕' : '?';

      var confBadge = '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:' + (result.confidence==='high'?'var(--ok-bg)':result.confidence==='medium'?'var(--warn-bg)':'var(--err-bg)') + ';color:' + (result.confidence==='high'?'var(--ok)':result.confidence==='medium'?'var(--warn)':'var(--err)') + ';margin-left:6px">' + (result.confidence||'?') + ' confidence</span>';

      var html = '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">'
        + '<div>'
        + '<div style="font-size:12px;font-weight:700;color:' + txtCol + '">' + icon + ' Legal name check' + confBadge + '</div>'
        + '<div style="margin-top:6px;font-size:12px">'
        + '<div style="color:var(--text3);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Current name in tool</div>'
        + '<div style="font-weight:600;color:var(--text)">' + ins.name + '</div>'
        + '</div>'
        + (result.legalName !== ins.name ? '<div style="margin-top:6px;font-size:12px">'
        + '<div style="color:var(--text3);font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Verified legal name</div>'
        + '<div style="font-weight:600;color:' + txtCol + '">' + result.legalName + '</div>'
        + (result.jurisdiction ? '<div style="font-size:11px;color:var(--text2)">Registered in: ' + result.jurisdiction + (result.registrationNumber?' · Reg: '+result.registrationNumber:'') + '</div>' : '')
        + '</div>' : '')
        + (result.notes ? '<div style="margin-top:5px;font-size:11px;color:var(--text2)">' + result.notes + '</div>' : '')
        + '</div>';

      // Action buttons — store pending name in global, use simple onclick refs
      // Action buttons — use DOM event listeners after innerHTML set (no onclick quoting issues)
      window._vnPending = window._vnPending || {};
      var pendingName = result.suggestedCorrection && result.suggestedCorrection !== ins.name ? result.suggestedCorrection : (result.nameMatch !== 'exact' && result.legalName && result.legalName !== ins.name ? result.legalName : null);
      if(pendingName) { window._vnPending[insId] = pendingName; }
      html += '<div id="vn-btn-zone-' + insId + '" style="display:flex;flex-direction:column;gap:6px;flex-shrink:0"></div>';
      html += '</div>';

      panel.style.background = bgCol;
      panel.innerHTML = html;
      panel.style.display = 'block';
      // Wire up action buttons via DOM (avoids onclick quoting issues)
      var btnZone = document.getElementById('vn-btn-zone-' + insId);
      if(btnZone) {
        btnZone.innerHTML = '';
        var hasPending = !!(window._vnPending && window._vnPending[insId]);
        if(hasPending) {
          var applyBtn = document.createElement('button');
          applyBtn.className = 'btn primary';
          applyBtn.style.cssText = 'font-size:11px;white-space:nowrap';
          applyBtn.textContent = pendingName === result.suggestedCorrection ? 'Apply correction' : 'Use legal name';
          applyBtn.addEventListener('click', function(){ vnApply(insId); });
          btnZone.appendChild(applyBtn);
        }
        var dismissBtn = document.createElement('button');
        dismissBtn.className = 'btn';
        dismissBtn.style.fontSize = '11px';
        dismissBtn.textContent = hasPending ? 'Keep current' : 'Dismiss';
        dismissBtn.addEventListener('click', function(){ panel.style.display='none'; });
        btnZone.appendChild(dismissBtn);
      }
    }

    if(btn) {
      btn.textContent = result.nameMatch==='exact' ? '✓ Name verified' : '⚖ Re-verify';
      btn.disabled = false;
    }

  } catch(e) {
    showNotice('Name verification failed: '+e.message,'err');
    if(btn) { btn.textContent = '⚖ Verify legal name'; btn.disabled = false; }
  }
}

function applyNameCorrection(insId, newName) {
  if(!newName || !newName.trim()) { showNotice('No name provided','err'); return; }
  newName = newName.trim();

  if(!confirm('Apply name correction? ' + newName)) return;

  var ent = entGetState();
  var ins = (ent.insureds||[]).find(function(i){ return i.id===insId; });
  if(!ins) { handleMissingLocalInsured(insId, 'apply name correction'); return; }

  var oldName = ins.name;

  // Update insured name
  ins.name = newName;
  if(ins.legalNameVerification) ins.legalNameVerification.correctionApplied = true;
  ins.legalNameVerified = true;

  // Save a note recording the correction
  if(!ins.notes) ins.notes = [];
  ins.notes.push({
    id: 'note-namefix-'+Date.now(),
    date: new Date().toLocaleDateString('en-GB'),
    handler: 'SYSTEM',
    parties: 'Legal name verification',
    summary: 'Name corrected from "' + oldName + '" to "' + newName + '" following online verification of registered legal name.',
    actions: [],
    statusChange: '',
    docType: 'general-correspondence',
    terms: {},
    source: 'legal-name-verify'
  });

  entSave(ent);

  // Update any matching book rows (displayName / assured)
  var s = gs();
  var updated = 0;
  (s.bookRows||[]).forEach(function(r) {
    // Match on first 10 chars of old name (fuzzy match to catch abbreviated versions)
    var oldNorm = oldName.toLowerCase().slice(0,10);
    var rowNorm = (r.assured||'').toLowerCase().slice(0,10);
    if(oldNorm === rowNorm || (r.assured||'').toLowerCase() === oldName.toLowerCase()) {
      r.assured = newName;
      r.displayName = newName;
      updated++;
    }
  });
  if(updated) ss(s);

  showNotice('✓ Name updated to "' + newName + '"' + (updated?' · '+updated+' book row'+(updated>1?'s':'')+' also updated':''), 'ok');

  // Re-render the entity card
  setTimeout(function(){ entOpenCard(insId); }, 200);
}

function vnApply(insId) {
  var pending = window._vnPending && window._vnPending[insId];
  if(!pending) { showNotice('No pending correction','err'); return; }
  applyNameCorrection(insId, pending);
  delete window._vnPending[insId];
}
