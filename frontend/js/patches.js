// ── AP/RP SUMMARY (Chat 14) ───────────────────────────────────────────────────
(function patchEntViewAprt() {
  var origEntView = window.entView;
  window.entView = function(view) {
    origEntView(view);
    var aprtEl = document.getElementById('ent-aprt-view');
    if (aprtEl) aprtEl.style.display = view === 'aprt' ? 'block' : 'none';
    var aprtBtn = document.getElementById('ent-tab-aprt');
    if (aprtBtn) aprtBtn.classList.toggle('active', view === 'aprt');
    if (view === 'aprt') {
      ['accounts','book','dashboard'].forEach(function(t) {
        var btn = document.getElementById('ent-tab-' + t);
        if (btn) btn.classList.remove('active');
      });
      renderAprt();
    }
  };
})();

function renderAprt() {
  var el = document.getElementById('aprt-content');
  if (!el) return;

  var s = getBookState();
  var rows = s.bookRows || [];

  function fG(n) {
    if (n == null || n === 0) return '—';
    var abs = Math.abs(Math.round(n));
    var str = abs >= 1000 ? '£' + (abs/1000).toFixed(1) + 'k' : '£' + abs.toLocaleString();
    return n < 0 ? '(' + str + ')' : str;
  }

  var aprtRows = [];
  var totOriginal = 0, totAP = 0, totRP = 0, totPC = 0, totAdj = 0;

  rows.forEach(function(row) {
    if (!row.ledger || !row.ledger.length) return;
    var ap = 0, rp = 0, original = 0, pc = 0, adj = 0;
    row.ledger.forEach(function(e) {
      var gbp = parseFloat(e.gbpComm) || 0;
      if      (e.type === 'ap')       ap       += gbp;
      else if (e.type === 'rp')       rp       += gbp;
      else if (e.type === 'original') original += gbp;
      else if (e.type === 'pc')       pc       += gbp;
      else if (e.type === 'adj')      adj      += gbp;
    });
    var net = original + pc + adj - rp - ap;
    aprtRows.push({ id:row.id, name:row.displayName||row.assured, producer:row.producer||'—',
      year:row.accountingYear||'—', status:row.status||'—',
      original:original, ap:ap, rp:rp, pc:pc, adj:adj, net:net,
      entryCount:row.ledger.length });
    totOriginal += original; totAP += ap; totRP += rp; totPC += pc; totAdj += adj;
  });

  var totNet = totOriginal + totPC + totAdj - totRP - totAP;

  if (!aprtRows.length) {
    el.innerHTML = '<div class="card" style="padding:20px 24px"><p class="muted">No ledger entries yet. Open <strong>Portfolio by Year</strong> and click <strong>£ +</strong> on any row to add entries.</p></div>';
    return;
  }

  var yearFilter = (document.getElementById('aprt-year-filter') || {value:'all'}).value || 'all';
  var filtered = yearFilter === 'all' ? aprtRows.slice() : aprtRows.filter(function(r){ return r.year === yearFilter; });
  filtered.sort(function(a,b){ return Math.abs(b.net) - Math.abs(a.net); });

  function card(label, val, col) {
    var disp = (val === 0) ? '—' : fG(val);
    return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;min-width:110px;flex:1">'
      + '<div style="font-size:20px;font-weight:700;color:' + col + ';line-height:1.2">' + disp + '</div>'
      + '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-top:3px;font-weight:500">' + label + '</div>'
      + '</div>';
  }

  var sumHtml = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">'
    + card('Invoiced', totOriginal, 'var(--ok)')
    + card('AP payable', totAP, '#185FA5')
    + card('RP receivable', totRP, '#A32D2D')
    + card('Profit comm', totPC, '#854F0B')
    + card('Net position', totNet, totNet >= 0 ? 'var(--ok)' : 'var(--err)')
    + '</div>';

  var years = [];
  aprtRows.forEach(function(r){ if (years.indexOf(r.year) === -1) years.push(r.year); });
  years.sort().reverse();

  var filterHtml = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">'
    + '<span style="font-size:11px;color:var(--text2);font-weight:500">Year:</span>'
    + '<select id="aprt-year-filter" onchange="renderAprt()" style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--border)">'
    + '<option value="all"' + (yearFilter==='all'?' selected':'') + '>All</option>'
    + years.map(function(y){ return '<option value="' + y + '"' + (yearFilter===y?' selected':'') + '>' + y + '</option>'; }).join('')
    + '</select>'
    + '<span style="font-size:11px;color:var(--text3);margin-left:auto">' + filtered.length + ' rows with ledger entries</span>'
    + '</div>';

  var th = '<th style="padding:6px 8px;text-align:';
  var tableHtml = '<div style="overflow-x:auto"><table style="width:100%;font-size:11px;border-collapse:collapse">'
    + '<thead><tr style="background:var(--surface)">'
    + th + 'left;border-bottom:2px solid var(--border)">Assured</th>'
    + th + 'left;border-bottom:2px solid var(--border)">Producer</th>'
    + th + 'center;border-bottom:2px solid var(--border)">Year</th>'
    + th + 'right;border-bottom:2px solid var(--border)">Invoiced</th>'
    + th + 'right;border-bottom:2px solid var(--border)">AP</th>'
    + th + 'right;border-bottom:2px solid var(--border)">RP</th>'
    + th + 'right;border-bottom:2px solid var(--border)">PC</th>'
    + th + 'right;border-bottom:2px solid var(--border)">Net</th>'
    + th + 'center;border-bottom:2px solid var(--border)">#</th>'
    + '<th style="border-bottom:2px solid var(--border)"></th>'
    + '</tr></thead><tbody>';

  filtered.forEach(function(r) {
    var nc = r.net > 0 ? 'var(--ok)' : r.net < 0 ? 'var(--err)' : 'var(--text3)';
    var apCol = r.ap ? ';color:#185FA5;font-weight:600' : ';color:var(--text3)';
    var rpCol = r.rp ? ';color:#A32D2D;font-weight:600' : ';color:var(--text3)';
    var pcCol = r.pc ? ';color:#854F0B' : ';color:var(--text3)';
    tableHtml += '<tr style="border-bottom:0.5px solid var(--border)">'
      + '<td style="padding:6px 10px;font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + r.name + '">' + r.name + '</td>'
      + '<td style="padding:6px 8px;color:var(--text2);font-size:10px;white-space:nowrap">' + r.producer + '</td>'
      + '<td style="padding:6px 8px;text-align:center;color:var(--text3);font-size:10px">' + r.year + '</td>'
      + '<td style="padding:6px 8px;text-align:right">' + (r.original ? fG(r.original) : '—') + '</td>'
      + '<td style="padding:6px 8px;text-align:right' + apCol + '">' + (r.ap ? fG(r.ap) : '—') + '</td>'
      + '<td style="padding:6px 8px;text-align:right' + rpCol + '">' + (r.rp ? fG(r.rp) : '—') + '</td>'
      + '<td style="padding:6px 8px;text-align:right' + pcCol + '">' + (r.pc ? fG(r.pc) : '—') + '</td>'
      + '<td style="padding:6px 8px;text-align:right;font-weight:700;color:' + nc + '">' + fG(r.net) + '</td>'
      + '<td style="padding:6px 8px;text-align:center;color:var(--text3)">' + r.entryCount + '</td>'
      + '<td style="padding:4px 6px"><button data-rid="' + r.id + '" onclick="(function(b){var rid=b.getAttribute(\'data-rid\');entView(\'book\');setTimeout(function(){renderBook();setTimeout(function(){toggleLedger(rid);},150);},150);})(this)" style="border:1px solid var(--acc)40;background:none;cursor:pointer;font-size:10px;color:var(--acc);padding:2px 7px;border-radius:4px;font-weight:600">Open</button></td>'
      + '</tr>';
  });

  var fOrig = filtered.reduce(function(s,r){return s+r.original;},0);
  var fAP   = filtered.reduce(function(s,r){return s+r.ap;},0);
  var fRP   = filtered.reduce(function(s,r){return s+r.rp;},0);
  var fPC   = filtered.reduce(function(s,r){return s+r.pc;},0);
  var fNet  = filtered.reduce(function(s,r){return s+r.net;},0);
  var fnc   = fNet >= 0 ? 'var(--ok)' : 'var(--err)';

  tableHtml += '<tr style="background:var(--bg);font-weight:700;border-top:2px solid var(--border)">'
    + '<td colspan="3" style="padding:7px 10px">Total — ' + filtered.length + ' rows</td>'
    + '<td style="padding:7px 8px;text-align:right">' + fG(fOrig) + '</td>'
    + '<td style="padding:7px 8px;text-align:right;color:#185FA5">' + (fAP ? fG(fAP) : '—') + '</td>'
    + '<td style="padding:7px 8px;text-align:right;color:#A32D2D">' + (fRP ? fG(fRP) : '—') + '</td>'
    + '<td style="padding:7px 8px;text-align:right;color:#854F0B">' + (fPC ? fG(fPC) : '—') + '</td>'
    + '<td style="padding:7px 8px;text-align:right;color:' + fnc + ';font-size:12px">' + fG(fNet) + '</td>'
    + '<td colspan="2"></td></tr>'
    + '</tbody></table></div>';

  el.innerHTML = '<div style="padding:20px 24px">'
    + '<div style="margin-bottom:16px"><div class="sh" style="margin:0">AP / RP Summary</div>'
    + '<div class="muted" style="font-size:11px;margin-top:3px">Net position across all book rows with ledger entries</div></div>'
    + sumHtml + filterHtml + tableHtml
    + '<div class="muted" style="font-size:10px;margin-top:10px">AP = return premiums OGB owes market &nbsp;·&nbsp; RP = additional premiums market owes OGB &nbsp;·&nbsp; Net = Invoiced + PC + Adj − AP − RP</div>'
    + '</div>';
}

console.log('[OG Tool v14.0] AP/RP Summary loaded');

