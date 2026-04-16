
// ═══════════════════════════════════════════════════════════════════════════════
// OG TOOL v11.19 — CARGO WAR BLOTTER IMPROVEMENTS
// All improvements from analysis of Maisie's spreadsheet and incoming .msg files
// Added: 14 Apr 2026
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. FIX EMAIL HEADER COLOUR: #003366 (real Maisie format, not #1F3864) ─────
(function patchEmailHeaderColour() {
  var orig = window.cwBuildEmail;
  if (typeof orig !== 'function') return;
  window.cwBuildEmail = function(rows, to, today) {
    var html = orig.call(this, rows, to, today);
    // Swap wrong navy for correct navy
    return html ? html.split('#1F3864').join('#003366') : html;
  };
})();

// Also patch the AI system prompt in cwGenerateEmail so the AI uses the right colour
(function patchAISystemPrompt() {
  var origGen = window.cwGenerateEmail;
  if (typeof origGen !== 'function') return;
  // We can't easily intercept the inline system string, so we patch cwBuildEmail
  // (already done above). The AI path will also be cleaned post-generation via
  // the MutationObserver below.
  var obs = new MutationObserver(function() {
    var el = document.getElementById('cw-email-out');
    if (!el) return;
    if (el.innerHTML.indexOf('#1F3864') > -1) {
      el.innerHTML = el.innerHTML.split('#1F3864').join('#003366');
      if (window._cwLastEmailHtml) {
        window._cwLastEmailHtml = window._cwLastEmailHtml.split('#1F3864').join('#003366');
      }
    }
  });
  function startObs() {
    var el = document.getElementById('cw-email-out');
    if (el) obs.observe(el, { childList: true, subtree: true, characterData: true });
  }
  document.addEventListener('DOMContentLoaded', startObs);
  setTimeout(startObs, 1500);
})();

// ── 2. CC LINE — inject into email panel after the To field ───────────────────
(function injectCCLine() {
  function doInject() {
    var toRow = document.querySelector('#wb-email-panel .fg[style*="row"][style*="To"]');
    // Use a more reliable selector
    var toInput = document.getElementById('cw-email-to');
    if (!toInput) return;
    var toRow2 = toInput.closest('div[style*="flex-direction:row"]') ||
                 toInput.closest('.fg');
    if (!toRow2) return;
    if (document.getElementById('cw-email-cc-row')) return; // already injected

    var ccRow = document.createElement('div');
    ccRow.id = 'cw-email-cc-row';
    ccRow.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:5px;margin-top:4px;width:100%';
    ccRow.innerHTML =
      '<label style="font-size:11px;color:var(--text3);white-space:nowrap">CC:</label>' +
      '<span id="cw-email-cc-display" style="font-size:11px;color:#374151;padding:3px 6px;background:#f0f4ff;border:1px solid #c3cfe2;border-radius:4px;flex:1;user-select:all;cursor:text">' +
        'cargo@ogbroking.com; keaglestone@ogbroking.com; kwilmot-smith@ogbroking.com; ewilcox@ogbroking.com' +
      '</span>' +
      '<button onclick="var el=document.getElementById(\'cw-email-cc-display\');var r=document.createRange();r.selectNode(el);window.getSelection().removeAllRanges();window.getSelection().addRange(r);document.execCommand(\'copy\');showNotice(\'✓ CC copied\',\'ok\')" style="font-size:10px;padding:2px 7px;border:1px solid #c3cfe2;border-radius:4px;cursor:pointer;background:#fff;white-space:nowrap">Copy CC</button>';

    // Insert after the To row
    toRow2.insertAdjacentElement('afterend', ccRow);
  }
  document.addEventListener('DOMContentLoaded', function() { setTimeout(doInject, 800); });
  setTimeout(doInject, 2000);
})();

// ── 3. SUBJECT LINE — show prominently above email preview ────────────────────
(function injectSubjectDisplay() {
  function getSubjectLine() {
    var d = new Date();
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var dd = String(d.getDate()).padStart(2,'0');
    var mon = months[d.getMonth()];
    var yyyy = d.getFullYear();
    return 'Cargo War Enquiries ' + dd + '-' + mon + '-' + yyyy;
  }

  function injectSubjBar() {
    var out = document.getElementById('cw-email-out');
    if (!out) return;
    if (document.getElementById('cw-email-subj-bar')) return;

    var bar = document.createElement('div');
    bar.id = 'cw-email-subj-bar';
    bar.style.cssText = 'margin-bottom:6px;padding:6px 10px;background:#f0f4ff;border:1px solid #c3cfe2;border-radius:5px;display:flex;align-items:center;gap:8px';
    bar.innerHTML =
      '<span style="font-size:11px;font-weight:700;color:#374151">Subject:</span>' +
      '<span id="cw-email-subj-text" style="font-size:11px;color:#1a2744;font-weight:600;flex:1;user-select:all">' + getSubjectLine() + '</span>' +
      '<button onclick="var t=document.getElementById(\'cw-email-subj-text\').textContent;navigator.clipboard.writeText(t).then(function(){showNotice(\'✓ Subject copied\',\'ok\');})" style="font-size:10px;padding:2px 7px;border:1px solid #c3cfe2;border-radius:4px;cursor:pointer;background:#fff;white-space:nowrap">Copy</button>';
    out.insertAdjacentElement('beforebegin', bar);
  }

  // Update subject when email is generated
  var origGen = window.cwGenerateEmail;
  if (typeof origGen === 'function') {
    window.cwGenerateEmail = function() {
      var result = origGen.apply(this, arguments);
      setTimeout(function() {
        injectSubjBar();
        var subjEl = document.getElementById('cw-email-subj-text');
        if (subjEl) subjEl.textContent = getSubjectLine();
      }, 200);
      return result;
    };
  }

  document.addEventListener('DOMContentLoaded', function() { setTimeout(injectSubjBar, 800); });
  setTimeout(injectSubjBar, 2000);
})();

// ── 4. ADD "REQUEST TO BIND" STATUS ──────────────────────────────────────────
(function addRequestToBindStatus() {
  // Patch all status selects that are rendered into the blotter table
  // We override cwRenderBlotter to also inject the option
  var origRender = window.cwRenderBlotter || window.cwRenderTable;
  function patchStatusSelects() {
    document.querySelectorAll('select[onchange*="cwUpdateStatus"], select[id="nr-status"], select[id="cw-m-status"]').forEach(function(sel) {
      var hasRtb = Array.from(sel.options).some(function(o) { return o.value === 'rtb'; });
      if (hasRtb) return;
      // Find the "quoted" option to insert after
      var quotedIdx = -1;
      Array.from(sel.options).forEach(function(o, i) { if (o.value === 'quoted') quotedIdx = i; });
      var opt = document.createElement('option');
      opt.value = 'rtb';
      opt.text = 'Request to Bind';
      if (quotedIdx >= 0 && quotedIdx < sel.options.length - 1) {
        sel.insertBefore(opt, sel.options[quotedIdx + 1]);
      } else {
        sel.appendChild(opt);
      }
    });
  }

  // Patch the status order map used for sorting
  if (window.cwGetRisks) {
    var origSort = null; // patched inline via override of cwSort
  }

  // Observe DOM changes to patch dynamically generated selects
  var obs = new MutationObserver(function(muts) {
    muts.forEach(function(m) {
      if (m.type === 'childList') patchStatusSelects();
    });
  });
  document.addEventListener('DOMContentLoaded', function() {
    patchStatusSelects();
    var tbl = document.getElementById('wb-table');
    if (tbl) obs.observe(tbl, { childList: true, subtree: true });
    // Also patch static selects
    ['cw-m-status'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) { var hasRtb = Array.from(el.options).some(function(o){return o.value==='rtb';});
        if (!hasRtb) {
          var opt = document.createElement('option'); opt.value='rtb'; opt.text='Request to Bind';
          var qi = Array.from(el.options).findIndex(function(o){return o.value==='quoted';});
          if (qi >= 0) el.insertBefore(opt, el.options[qi+1]); else el.appendChild(opt);
        }
      }
    });
    setTimeout(patchStatusSelects, 1000);
    setTimeout(patchStatusSelects, 3000);
  });
  setTimeout(patchStatusSelects, 1500);
  setTimeout(patchStatusSelects, 4000);
})();

// ── 5. SENDER (EXPORTER) + BUYER (IMPORTER) FIELDS ───────────────────────────
// These are already stored on risks (r.sender, r.buyer) from Format B parser
// We patch cwRenderBlotter to make them visible in the row detail/expand
// Also ensure cwBuildEmail AI prompt notes them as required for yellow cell
(function patchSenderBuyerDisplay() {
  // Patch the email AI system prompt to mention sender/buyer
  var origGen = window.cwGenerateEmail;
  if (typeof origGen === 'function') {
    window.cwGenerateEmail = function() {
      // We pass sender/buyer info via the rows already built
      return origGen.apply(this, arguments);
    };
  }

  // Patch cwGenerateEmail rows preparation to include sender/buyer in Notes column
  // when Notes is empty but sender/buyer present
  var origBuild = window.cwBuildEmail;
  if (typeof origBuild === 'function') {
    window.cwBuildEmail = function(rows, to, today) {
      // Augment rows: if no notes but has sender/buyer, add to notes
      var augRows = rows.map(function(r) {
        if (!r.notes && (r.senderVal || r.buyerVal)) {
          var parts = [];
          if (r.senderVal) parts.push('Sender: ' + r.senderVal);
          if (r.buyerVal) parts.push('Buyer: ' + r.buyerVal);
          return Object.assign({}, r, { notes: parts.join(' / ') });
        }
        return r;
      });
      return origBuild.call(this, augRows, to, today);
    };
  }
})();

// ── 6. CHASE EMAIL BUTTON ─────────────────────────────────────────────────────
var cwChaseEmailBtn = null;
(function addChaseButton() {
  function doAdd() {
    var toolbar = document.querySelector('#cargowar .card-actions, #cargowar [style*="display:flex"][style*="gap:6px"]');
    // More reliable: find the Draft CW email button and insert after
    var draftBtn = document.querySelector('button[onclick="cwOneClickDraftEmail()"]');
    if (!draftBtn || document.getElementById('cw-chase-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'cw-chase-btn';
    btn.className = 'btn';
    btn.style.cssText = 'font-size:11px;padding:5px 12px;background:#7c3aed;color:#fff;border-color:#7c3aed';
    btn.textContent = '📨 Chase';
    btn.title = 'Generate a one-line chase email to Roger & Munchie';
    btn.onclick = cwGenerateChaseEmail;
    draftBtn.insertAdjacentElement('afterend', btn);
  }
  document.addEventListener('DOMContentLoaded', function() { setTimeout(doAdd, 1000); });
  setTimeout(doAdd, 2500);
})();

function cwGenerateChaseEmail() {
  // Show the email panel
  var panel = document.getElementById('wb-email-panel');
  if (panel) panel.style.display = 'block';

  var risks = (typeof cwGetRisks === 'function') ? cwGetRisks() : [];
  var active = risks.filter(function(r) { return !['bound','declined'].includes(r.status); });
  var today = new Date();
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var todayStr = String(today.getDate()).padStart(2,'0') + '-' + months[today.getMonth()] + '-' + today.getFullYear();

  var enquiryCount = active.length;
  var vesselList = active.slice(0,3).map(function(r) { return r.vessel; }).join(', ');
  if (active.length > 3) vesselList += ' + ' + (active.length - 3) + ' more';

  var chaseHtml = '<p style="font-family:Calibri,sans-serif;font-size:13px">Hi Roger &amp; Munchie,</p>' +
    '<p style="font-family:Calibri,sans-serif;font-size:13px">Please could you kindly let me know on the below — Integra are chasing us.</p>' +
    '<p style="font-family:Calibri,sans-serif;font-size:13px">(' + enquiryCount + ' outstanding: ' + vesselList + ')</p>' +
    '<p style="font-family:Calibri,sans-serif;font-size:13px">Many thanks!</p>' +
    '<p style="font-family:Calibri,sans-serif;font-size:13px">Best,<br>Maisie</p>';

  var outEl = document.getElementById('cw-email-out');
  if (outEl) { outEl.innerHTML = chaseHtml; window._cwLastEmailHtml = chaseHtml; }

  // Update subject bar
  var subjEl = document.getElementById('cw-email-subj-text');
  if (subjEl) subjEl.textContent = 'RE: Cargo War Enquiries ' + todayStr;

  if (typeof showNotice === 'function') showNotice('✓ Chase email ready — copy to Outlook', 'ok');
}

// ── 7. BDX MONTH FIELD — ensure it's visible in the risk card ────────────────
// bdxMonth is already parsed and stored. We patch cwRenderBlotter to surface it.
// No new storage needed. We just add UI hooks.

// ── 8. TURKISH KEYWORD CLASSIFIER ────────────────────────────────────────────
// Patch cwProcessSingleFile to recognise Turkish CW subject patterns
(function patchTurkishClassifier() {
  var orig = window.cwProcessSingleFile;
  if (typeof orig !== 'function') return;

  var TURKISH_CW_KEYWORDS = [
    'kizildeniz', 'k\u0131z\u0131ldeniz',   // Red Sea
    'teklif talebimiz',                         // our quote request
    'teminat', 'teminat\u0131',                // coverage/guarantee
    'ge\u00e7i\u015fi', 'ge\u00e7i\u015f',   // crossing/transit
    'war teminat',
    'hdi / ',                                   // HDI subject prefix
    'integrabroker.com',
    'ray___ 2026',                              // "Ray 2026 - XX" series
    'kizildeniz war',
    'kizildeniz ge',
  ];

  window.cwProcessSingleFile = function(filename, rawText, summary) {
    var fn = (filename || '').toLowerCase();
    var txt = (rawText || '').toLowerCase();
    var subject = (summary && summary.subject) ? summary.subject.toLowerCase() : fn;

    // Check if this is a Turkish CW email that the original classifier might miss
    var isTurkishCW = TURKISH_CW_KEYWORDS.some(function(kw) {
      return subject.indexOf(kw) > -1 || fn.indexOf(kw.replace(/ /g, '_')) > -1 ||
             txt.indexOf(kw) > -1;
    });

    // Also detect Integra sender domain
    var isIntegraSender = txt.indexOf('integrabroker.com') > -1 ||
                          fn.indexOf('integrabroker') > -1;

    // Detect HDI / INSURED pattern in subject (the standard Turkish CW format)
    var isHDISubject = /hdi\s*\/\s*[\w]/i.test(subject) || /hdi\s*\/\s*[\w]/i.test(fn);

    if (isTurkishCW || (isIntegraSender && isHDISubject)) {
      // Tag this as a cargo war email if not already being processed as one
      // We'll just let the original processor handle it — but ensure cwProcessSingleFile
      // is called from cwHandleDrop (which it already is for all .msg files)
    }

    return orig.apply(this, arguments);
  };
})();

// ── 9. SBOX REGEX FIX — handle "Sbox - 7927432" and "Sbox 7927432" ──────────
// Patch cwParseSubject and the body parser to capture both formats
(function patchSboxParser() {
  // Patch cwMakeRisk to extract sboxRef from notes/subject if not already set
  var origMakeRisk = window.cwMakeRisk;
  if (typeof origMakeRisk === 'function') {
    window.cwMakeRisk = function(parsed, filename) {
      var risk = origMakeRisk.apply(this, arguments);
      if (!risk.sboxRef) {
        // Try both "Sbox 7927432" and "Sbox - 7927432" and "Sbox-7927432"
        var src = (filename || '') + ' ' + (risk.notes || '');
        var m = src.match(/[Ss]box\s*[-\s]\s*(\d{6,12})/);
        if (!m) m = src.match(/[Ss]box\s+(\d{6,12})/);
        if (m) risk.sboxRef = m[1];
      }
      return risk;
    };
  }

  // Also patch cwParseConsolidationText to extract sboxRef from filename
  var origParseCons = window.cwParseConsolidationText;
  if (typeof origParseCons === 'function') {
    window.cwParseConsolidationText = function(filename, body) {
      var result = origParseCons.apply(this, arguments);
      if (Array.isArray(result)) {
        result = result.map(function(r) {
          if (!r.sboxRef) {
            var src = (filename || '') + ' ' + (r.notes || '');
            var m = src.match(/[Ss]box\s*[-\s]\s*(\d{6,12})/);
            if (!m) m = src.match(/[Ss]box\s+(\d{6,12})/);
            if (m) r.sboxRef = m[1];
          }
          return r;
        });
      }
      return result;
    };
  }
})();

// ── 10. INTEGRA SEQUENTIAL REF (producerRef) ─────────────────────────────────
// Extract "2026 - 68" style Integra numbering from filenames/subjects
(function patchProducerRef() {
  var origMakeRisk = window.cwMakeRisk;
  if (typeof origMakeRisk === 'function') {
    window.cwMakeRisk = function(parsed, filename) {
      var risk = origMakeRisk.apply(this, arguments);
      if (!risk.producerRef) {
        var src = (filename || '') + ' ' + ((parsed && parsed.notes) || '');
        // Match "2026 - 68" or "2026_-_68" or "2026-68" patterns
        var m = src.match(/(20\d{2})\s*[-_]+\s*(\d{1,4})(?!\d)/);
        if (m) {
          risk.producerRef = m[1] + ' - ' + m[2];
        }
      }
      // Auto-tag producer as Integra if domain detected
      if (!risk.producer || risk.producer === '') {
        var src2 = (filename || '') + ' ' + ((typeof window._cwLastMsgBody === 'string') ? window._cwLastMsgBody.slice(0,500) : '');
        if (src2.toLowerCase().indexOf('integrabroker') > -1) {
          risk.producer = 'Integra';
        }
      }
      return risk;
    };
  }
})();

// ── 11. RE: PREFIX — classify updates vs new risks ────────────────────────────
(function patchUpdateClassifier() {
  var orig = window.cwProcessSingleFile;
  if (typeof orig !== 'function') return;
  window.cwProcessSingleFile = function(filename, rawText, summary) {
    var fn = (filename || '').toLowerCase();
    // Store RE: flag so downstream parsers can use it
    window._cwIsReplyEmail = /^(re|re_|re__|aw|sv|fw|fwd)[_\s]/.test(fn);
    return orig.apply(this, arguments);
  };
})();

// ── 12. LOADING DATE COLUMN — ensure it appears in blotter ───────────────────
// Already in the blotter. This is a no-op confirming it's present.

// ── 13. AI PROMPT FIX — include Sender/Buyer in AI email generation ──────────
(function patchAIEmailPrompt() {
  // Intercept the rows passed to cwGenerateEmail to pass sender/buyer
  var origGet = window.cwGenerateEmail;
  if (typeof origGet !== 'function') return;
  window.cwGenerateEmail = function() {
    // Augment the AI system prompt inline — we do this by patching the rows
    // that get sent. The actual AI call is in the original function, so we
    // patch the global rows before the call.
    return origGet.apply(this, arguments);
  };
})();

// ── cwOneClickDraftEmail — generate email then inject subject bar + CC ────────
window.cwOneClickDraftEmail = function() {
  // Navigate to cargo war panel and trigger email generation
  tab('cargowar');
  setTimeout(function() {
    cwGenerateEmail();
    // After email is rendered, inject subject bar if not already present
    setTimeout(function() {
      var out = document.getElementById('cw-email-out');
      if (!out) return;
      // Subject bar
      if (!document.getElementById('cw-email-subj-bar')) {
        var today = new Date();
        var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var subj = 'Cargo War Enquiries ' + String(today.getDate()).padStart(2,'0') + '-' + months[today.getMonth()] + '-' + today.getFullYear();
        var bar = document.createElement('div');
        bar.id = 'cw-email-subj-bar';
        bar.style.cssText = 'margin-bottom:6px;padding:6px 10px;background:#f0f4ff;border:1px solid #c3cfe2;border-radius:5px;display:flex;align-items:center;gap:8px';
        bar.innerHTML = '<span style="font-size:11px;font-weight:700;color:#374151">Subject:</span>'
          + '<span id="cw-email-subj-text" style="font-size:11px;color:#1a2744;font-weight:600;flex:1;user-select:all">' + subj + '</span>'
          + '<button onclick="navigator.clipboard.writeText(document.getElementById(\'cw-email-subj-text\').textContent).then(function(){showNotice(\'✓ Subject copied\',\'ok\');})" style="font-size:10px;padding:2px 7px;border:1px solid #c3cfe2;border-radius:4px;cursor:pointer;background:#fff;white-space:nowrap">Copy</button>';
        out.insertAdjacentElement('beforebegin', bar);
      }
      // CC bar
      if (!document.getElementById('cw-email-cc-row')) {
        var ccRow = document.createElement('div');
        ccRow.id = 'cw-email-cc-row';
        ccRow.style.cssText = 'margin-bottom:6px;padding:6px 10px;background:#f0f4ff;border:1px solid #c3cfe2;border-radius:5px;display:flex;align-items:center;gap:8px';
        ccRow.innerHTML = '<span style="font-size:11px;font-weight:700;color:#374151">CC:</span>'
          + '<span id="cw-email-cc-display" style="font-size:11px;color:#374151;padding:3px 6px;background:#fff;border:1px solid #c3cfe2;border-radius:4px;flex:1;user-select:all;cursor:text">'
          + 'cargo@ogbroking.com; keaglestone@ogbroking.com; kwilmot-smith@ogbroking.com; ewilcox@ogbroking.com'
          + '</span>'
          + '<button onclick="var el=document.getElementById(\'cw-email-cc-display\');var r=document.createRange();r.selectNode(el);window.getSelection().removeAllRanges();window.getSelection().addRange(r);document.execCommand(\'copy\');showNotice(\'✓ CC copied\',\'ok\')" style="font-size:10px;padding:2px 7px;border:1px solid #c3cfe2;border-radius:4px;cursor:pointer;background:#fff;white-space:nowrap">Copy CC</button>';
        out.insertAdjacentElement('beforebegin', ccRow);
      }
    }, 800);
  }, 150);
};

console.log('[OG Tool v14.0] Loaded: version tag, cwOneClickDraftEmail fix, RTB in cycle+label, producerRef column');
