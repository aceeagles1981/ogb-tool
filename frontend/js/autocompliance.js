// ─── AUTO COMPLIANCE SCREEN (Chat 12 · v11.16) ───────────────────────────────
// Runs silently after ingest when a high-confidence match exists.
// Territory check is always local (no key needed).
// AI entity screen runs if API key present.
// Stores result on enq.compliance and returns {flagged, html} for caller to surface.

async function autoComplianceScreen(insId, enqId) {
  var ent = entGetState();
  var ins = (ent.insureds||[]).find(function(i){ return i.id===insId; });
  if(!ins) return null;
  var enq = (ins.enquiries||[]).find(function(e){ return e.id===enqId; });
  if(!enq) return null;
  var prod = (ent.producers||[]).find(function(p){ return p.id===ins.producerId; });

  // --- Territory check (always runs, no key needed) ---
  var combined = (ins.region||'')+' '+(enq.region||'')+' '+(enq.notes||'')+' '+(ins.name||'');
  var cLow = combined.toLowerCase();
  var hardFlags = PB_SANCTIONED_HARD.filter(function(c){ return cLow.indexOf(c.toLowerCase())>-1; });
  var reviewFlags = PB_SANCTIONED_REVIEW.filter(function(c){ return cLow.indexOf(c.toLowerCase())>-1; });
  var territoryResult = hardFlags.length ? 'decline' : reviewFlags.length ? 'review' : 'pass';

  // --- AI entity screen (runs if key present) ---
  var aiResult = null;
  var aiOverall = null;
  var key = getKey();
  if(key) {
    var sys = 'You are a Lloyds marine cargo compliance officer at OG Broking. Screen placement entities for: (1) OFAC/HMT/UN/EU sanctions list matches, (2) adverse news - financial crime, money laundering, corruption, terrorism, (3) PEP indicators. Sanctions context Apr 2026: Iran/Syria/North Korea/Cuba/Myanmar/Sudan = comprehensive. Russia/Belarus = extensive sectoral. Venezuela = partially eased oil sector only (OFAC GL46A), general blocking remains. For each entity: Name: CLEAR / FLAG / UNKNOWN + brief reason. End with OVERALL: CLEAR / REVIEW / DECLINE. Format as short HTML. CLEAR=green. FLAG/DECLINE=red. UNKNOWN/REVIEW=amber.';
    var data = { insured: ins.name, insuredRegion: ins.region||'', cedant: enq.cedant||'', producer: prod?prod.name:'', quoteLeader: enq.quoteLeader||'', country: enq.region||ins.region||'', notes: (enq.notes||'').slice(0,300) };
    try {
      aiResult = await callAI(sys, 'Screen this placement:\n'+JSON.stringify(data,null,2), 600);
      if(aiResult) {
        var upper = aiResult.toUpperCase();
        if(upper.indexOf('OVERALL: DECLINE')>-1 || upper.indexOf('OVERALL:DECLINE')>-1) aiOverall = 'decline';
        else if(upper.indexOf('OVERALL: REVIEW')>-1 || upper.indexOf('OVERALL:REVIEW')>-1) aiOverall = 'review';
        else if(upper.indexOf('OVERALL: CLEAR')>-1 || upper.indexOf('OVERALL:CLEAR')>-1) aiOverall = 'pass';
        else aiOverall = 'review';
      }
    } catch(e) {
      aiResult = 'AI screen error: '+e.message;
      aiOverall = 'review';
    }
  }

  // --- Determine combined result ---
  var resultPriority = { decline: 3, review: 2, pass: 1 };
  var finalResult = territoryResult;
  if(aiOverall && (resultPriority[aiOverall]||0) > (resultPriority[finalResult]||0)) finalResult = aiOverall;

  // --- Build summary HTML for banner ---
  var bannerCols = { pass: { bg:'var(--ok-bg)', col:'var(--ok)', icon:'✓' }, review: { bg:'var(--warn-bg)', col:'var(--warn)', icon:'⚠' }, decline: { bg:'var(--err-bg)', col:'var(--err)', icon:'✕' } };
  var bc = bannerCols[finalResult];
  var bannerLines = [];
  if(hardFlags.length) bannerLines.push('Sanctioned territory: '+hardFlags.join(', '));
  if(reviewFlags.length) bannerLines.push('High-risk jurisdiction: '+reviewFlags.join(', '));
  if(aiOverall && aiOverall !== 'pass') bannerLines.push('AI entity screen: '+aiOverall.toUpperCase());
  if(!key) bannerLines.push('AI entity screen skipped — no API key');
  var bannerHtml = '<div style="padding:8px 12px;border-radius:6px;background:'+bc.bg+';border:1px solid '+bc.col+'40;margin-top:8px">'
    +'<span style="color:'+bc.col+';font-weight:700;font-size:12px">'+bc.icon+' Auto compliance: '+(finalResult==='pass'?'CLEAR':finalResult.toUpperCase())+'</span>'
    +(bannerLines.length ? '<div style="font-size:11px;color:'+bc.col+';margin-top:3px">'+bannerLines.join(' · ')+'</div>' : '')
    +(finalResult!=='pass' ? '<div style="font-size:11px;margin-top:4px"><a href="#" onclick="pbOpenCompliance(\''+insId+'\',\''+enqId+'\');return false" style="color:'+bc.col+'">Open compliance screen →</a></div>' : '')
    +'</div>';

  // --- Store result on enquiry ---
  var ent2 = entGetState();
  var ins2 = (ent2.insureds||[]).find(function(i){ return i.id===insId; });
  var enq2 = ins2 && (ins2.enquiries||[]).find(function(e){ return e.id===enqId; });
  if(enq2) {
    if(!enq2.compliance) enq2.compliance = {};
    enq2.compliance.result = finalResult;
    enq2.compliance.date = new Date().toLocaleDateString('en-GB');
    enq2.compliance.handler = 'AUTO';
    enq2.compliance.checklist = {};
    enq2.compliance.notes = 'Auto-screened on ingest. Territory: '+(hardFlags.concat(reviewFlags).join(', ')||'none')+'. AI: '+(aiOverall||'not run')+'.';
    if(aiResult) enq2.compliance.aiResult = aiResult;
    entSave(ent2);
  }

  return { flagged: finalResult !== 'pass', result: finalResult, bannerHtml: bannerHtml };
}
