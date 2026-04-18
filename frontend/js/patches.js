// ── AP/RP SUMMARY — P22: Rewritten to use PG risk_ledger_entries ──────────────
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

var _aprtYearFilter = 'all';

async function renderAprt() {
  var el = document.getElementById('aprt-content');
  if (!el) return;

  el.innerHTML = '<div style="padding:20px 24px"><div class="muted">Loading ledger data...</div></div>';

  try {
    var url = '/mi/ledger-summary';
    if (_aprtYearFilter && _aprtYearFilter !== 'all') url += '?year=' + _aprtYearFilter;
    var data = await apiFetch(url);
    var rows = data.rows || [];
    var totals = data.totals || {};
    var years = data.years || [];

    if (!rows.length) {
      el.innerHTML = '<div style="padding:20px 24px"><div class="card" style="padding:20px 24px">'
        + '<p class="muted">No ledger entries yet. Open a risk card and use the <strong>+ Entry</strong> button in the Ledger section to add AP, RP, or invoiced amounts.</p>'
        + '</div></div>';
      return;
    }

    function fG(n) {
      if (n == null || n === 0) return '\u2014';
      var abs = Math.abs(Math.round(n));
      var str = abs >= 1000 ? '\u00a3' + (abs/1000).toFixed(1) + 'k' : '\u00a3' + abs.toLocaleString();
      return n < 0 ? '(' + str + ')' : str;
    }

    function card(label, val, col) {
      var disp = (val === 0) ? '\u2014' : fG(val);
      return '<div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px 16px;min-width:110px;flex:1">'
        + '<div style="font-size:20px;font-weight:700;color:' + col + ';line-height:1.2">' + disp + '</div>'
        + '<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:0.06em;margin-top:3px;font-weight:500">' + label + '</div>'
        + '</div>';
    }

    var nc = (totals.net||0) >= 0 ? 'var(--ok)' : 'var(--err)';
    var sumHtml = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">'
      + card('Invoiced', totals.original||0, 'var(--ok)')
      + card('AP payable', totals.ap||0, '#185FA5')
      + card('RP receivable', totals.rp||0, '#A32D2D')
      + card('Profit comm', totals.pc||0, '#854F0B')
      + card('Net position', totals.net||0, nc)
      + '</div>';

    var filterHtml = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">'
      + '<span style="font-size:11px;color:var(--text2);font-weight:500">Year:</span>'
      + '<select id="aprt-year-filter" onchange="_aprtYearFilter=this.value;renderAprt()" style="font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--border)">'
      + '<option value="all"' + (_aprtYearFilter==='all'?' selected':'') + '>All</option>'
      + years.map(function(y){ return '<option value="' + y + '"' + (_aprtYearFilter==String(y)?' selected':'') + '>' + y + '</option>'; }).join('')
      + '</select>'
      + '<span style="font-size:11px;color:var(--text3);margin-left:auto">' + rows.length + ' risks with ledger entries</span>'
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

    rows.sort(function(a,b){ return Math.abs(b.net) - Math.abs(a.net); });

    rows.forEach(function(r) {
      var rnc = r.net > 0 ? 'var(--ok)' : r.net < 0 ? 'var(--err)' : 'var(--text3)';
      var apCol = r.ap ? ';color:#185FA5;font-weight:600' : ';color:var(--text3)';
      var rpCol = r.rp ? ';color:#A32D2D;font-weight:600' : ';color:var(--text3)';
      var pcCol = r.pc ? ';color:#854F0B' : ';color:var(--text3)';
      tableHtml += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:6px 10px;font-weight:500;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + r.name + '">' + r.name + '</td>'
        + '<td style="padding:6px 8px;color:var(--text2);font-size:10px;white-space:nowrap">' + r.producer + '</td>'
        + '<td style="padding:6px 8px;text-align:center;color:var(--text3);font-size:10px">' + (r.year||'\u2014') + '</td>'
        + '<td style="padding:6px 8px;text-align:right">' + (r.original ? fG(r.original) : '\u2014') + '</td>'
        + '<td style="padding:6px 8px;text-align:right' + apCol + '">' + (r.ap ? fG(r.ap) : '\u2014') + '</td>'
        + '<td style="padding:6px 8px;text-align:right' + rpCol + '">' + (r.rp ? fG(r.rp) : '\u2014') + '</td>'
        + '<td style="padding:6px 8px;text-align:right' + pcCol + '">' + (r.pc ? fG(r.pc) : '\u2014') + '</td>'
        + '<td style="padding:6px 8px;text-align:right;font-weight:700;color:' + rnc + '">' + fG(r.net) + '</td>'
        + '<td style="padding:6px 8px;text-align:center;color:var(--text3)">' + r.entry_count + '</td>'
        + '<td style="padding:4px 6px"><button onclick="openBackendRiskCard(' + r.risk_id + ')" style="border:1px solid var(--acc)40;background:none;cursor:pointer;font-size:10px;color:var(--acc);padding:2px 7px;border-radius:4px;font-weight:600">Open</button></td>'
        + '</tr>';
    });

    var fnc = (totals.net||0) >= 0 ? 'var(--ok)' : 'var(--err)';
    tableHtml += '<tr style="background:var(--bg);font-weight:700;border-top:2px solid var(--border)">'
      + '<td colspan="3" style="padding:7px 10px">Total \u2014 ' + rows.length + ' risks</td>'
      + '<td style="padding:7px 8px;text-align:right">' + fG(totals.original||0) + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:#185FA5">' + (totals.ap ? fG(totals.ap) : '\u2014') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:#A32D2D">' + (totals.rp ? fG(totals.rp) : '\u2014') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:#854F0B">' + (totals.pc ? fG(totals.pc) : '\u2014') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + fnc + ';font-size:12px">' + fG(totals.net||0) + '</td>'
      + '<td colspan="2"></td></tr>'
      + '</tbody></table></div>';

    el.innerHTML = '<div style="padding:20px 24px">'
      + '<div style="margin-bottom:16px"><div class="sh" style="margin:0">AP / RP Summary</div>'
      + '<div class="muted" style="font-size:11px;margin-top:3px">Net position across all risks with ledger entries</div></div>'
      + sumHtml + filterHtml + tableHtml
      + '<div class="muted" style="font-size:10px;margin-top:10px">AP = return premiums OGB owes market \u00b7 RP = additional premiums market owes OGB \u00b7 Net = Invoiced + PC + Adj \u2212 AP \u2212 RP</div>'
      + '</div>';

  } catch(e) {
    el.innerHTML = '<div style="padding:20px 24px"><div class="notice err">Could not load ledger data: ' + e.message + '</div></div>';
  }
}

console.log('[OG Tool v22.0] AP/RP Summary loaded (PG-backed)');
