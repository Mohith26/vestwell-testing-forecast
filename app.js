(function () {
  'use strict';
  var F = window.TestingForecast, S = window.TestingSynth, D = window.VW_DATA;
  var plan = D.plan, DRAWS = 2000, SEED = 11;
  var $ = function (id) { return document.getElementById(id); };
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, a, p) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  function pct(x, d) { return (x * 100).toFixed(d == null ? 2 : d) + '%'; }
  function riskPct(x) { var v = x * 100; return (v < 1 && v > 0 ? v.toFixed(1) : Math.round(v)) + '%'; }
  function usd(x) { return '$' + Math.round(x).toLocaleString('en-US'); }
  function usd2(x) { return '$' + x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pillFor(p) { return '<span class="pill ' + (p <= 0.05 ? 'ok' : p <= 0.2 ? 'warn' : 'bad') + '">' + riskPct(p) + '</span>'; }

  var R = {};
  function computeCore(target) {
    R.pe = F.pointEstimate(plan);
    R.opt = F.optimize(plan, DRAWS, SEED, target);
  }
  function computeDrivers() {
    var variants = [
      ['Employees who become eligible later this year', function (p) { p.employees = p.employees.filter(function (e) { return e.eligibleNow; }); }],
      ['Year-end bonuses', function (p) { p.employees.forEach(function (e) { e.bonusPct = 0; }); }],
      ['Deferral election changes', function (p) { p.assumptions.pChangeHce = 0; p.assumptions.pChangeNhce = 0; }],
      ['Terminations', function (p) { p.assumptions.pTermHce = 0; p.assumptions.pTermNhce = 0; }]
    ];
    R.drivers = variants.map(function (v) {
      var p = JSON.parse(JSON.stringify(plan)); v[1](p);
      return { name: v[0], p: F.forecast(p, DRAWS, SEED, null).pAdpFail };
    });
  }
  function computeCensus() {
    var A = plan.assumptions, U = F.drawUniforms(plan, DRAWS, SEED), m = plan.employees.length, u = new Array(8);
    R.census = plan.employees.map(function (e, i) {
      var adrs = [];
      for (var t = 0; t < DRAWS; t++) {
        for (var k = 0; k < 8; k++) u[k] = U[(t * m + i) * 8 + k];
        var s = F.simEmployee(e, A, u, null);
        if (s.eligible && s.comp > 0) adrs.push(Math.min(s.def, F.LIM.g402) / Math.min(s.comp, F.LIM.compCap));
      }
      adrs.sort(function (a, b) { return a - b; });
      return { e: e, q: adrs.length ? [F.quantile(adrs, 0.1), F.quantile(adrs, 0.5), F.quantile(adrs, 0.9)] : null, mid: e.eligibleNow && e.ytdComp > 0 ? Math.min(e.ytdDef, F.LIM.g402) / e.ytdComp : null };
    });
  }
  function computeBacktest() {
    var book = S.makeBook(D.book.n, D.book.seed0);
    R.bt = F.backtest(book, 400, 77);
  }

  // ---------- render ----------
  function renderHeader() {
    var nElig = plan.employees.filter(function (e) { return e.eligibleNow; }).length;
    var nH = plan.employees.filter(function (e) { return e.hce; }).length;
    $('planLine').textContent = plan.name + ' · Plan year 2026 · Payroll data through ' + plan.asOf;
    $('myLine').textContent = nElig + ' eligible employees (' + nH + ' HCEs) as of ' + plan.asOf + '. Run as often as you like until 11/01/2026.';
    var pe = R.pe;
    $('myTbl').innerHTML = '<tr><th>Test</th><th class="num">NHCE</th><th class="num">HCE</th><th class="num">HCE Limit</th></tr>' +
      '<tr><td>ADP</td><td class="num">' + pct(pe.adpN) + '</td><td class="num">' + pct(pe.adpH) + '</td><td class="num">' + pct(pe.adpLim) + '</td></tr>' +
      '<tr><td>ACP</td><td class="num">' + pct(pe.acpN) + '</td><td class="num">' + pct(pe.acpH) + '</td><td class="num">' + pct(pe.acpLim) + '</td></tr>';
    $('myStatus').innerHTML = '<span class="chk"><i data-lucide="check"></i></span>' + (pe.adpPass && pe.acpPass ? 'Estimated: Pass' : 'Estimated: Fail');
  }
  function renderForecast() {
    var b = R.opt.base;
    $('pAdp').textContent = riskPct(b.pAdpFail);
    $('pAdp').className = 'val' + (b.pAdpFail > 0.2 ? ' risk' : '');
    $('pAcp').textContent = 'ACP: ' + riskPct(b.pAcpFail) + ' chance of failing';
    $('refund').textContent = usd(b.meanRefund);
    $('refundP90').textContent = '1 in 10 years: ' + usd(b.p90Refund) + ' or more';
    $('drawsN').textContent = DRAWS.toLocaleString('en-US');
    // margin histogram
    var svg = $('marginChart'); while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = svg.clientWidth || 600, H = 150; svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var m = { l: 8, r: 8, t: 10, b: 24 }, w = W - m.l - m.r, h = H - m.t - m.b;
    var xs = b.margins.map(function (x) { return x * 100; });
    var peM = (R.pe.adpLim - R.pe.adpH) * 100;
    var lo = Math.floor(Math.min.apply(null, xs) * 10) / 10, hi = Math.ceil(Math.max(peM + 0.15, Math.max.apply(null, xs)) * 10) / 10;
    var bw = 0.05, nb = Math.round((hi - lo) / bw), cnt = new Array(nb).fill(0);
    xs.forEach(function (x) { var k = Math.min(nb - 1, Math.max(0, Math.floor((x - lo) / bw))); cnt[k]++; });
    var mx = Math.max.apply(null, cnt);
    var X = function (v) { return m.l + w * (v - lo) / (hi - lo); };
    for (var k = 0; k < nb; k++) {
      var x0 = lo + k * bw, bh = h * cnt[k] / mx;
      var r = el('rect', { x: X(x0) + 0.5, y: m.t + h - bh, width: Math.max(1, X(x0 + bw) - X(x0) - 1), height: bh, fill: x0 + bw / 2 < 0 ? '#df5e72' : '#3577a9', opacity: 0.85, rx: 1 }, svg);
      r.dataset.tip = (x0 >= 0 ? '+' : '') + x0.toFixed(2) + ' to ' + (x0 + bw).toFixed(2) + ' pts: ' + cnt[k] + ' years';
    }
    el('line', { x1: X(0), x2: X(0), y1: m.t - 4, y2: m.t + h, stroke: '#212121', 'stroke-width': 1.2, 'stroke-dasharray': '3 3' }, svg);
    var t0 = el('text', { x: X(0) + 6, y: m.t + 8, 'font-size': 12, fill: '#212121', 'font-weight': 700 }, svg); t0.textContent = 'Limit';
    var tl = el('text', { x: m.l, y: H - 6, 'font-size': 12, fill: '#b23048', 'font-weight': 700 }, svg); tl.textContent = 'Fails  ' + lo.toFixed(1) + ' pts';
    var tr = el('text', { x: W - m.r, y: H - 6, 'font-size': 12, fill: '#3577a9', 'font-weight': 700, 'text-anchor': 'end' }, svg); tr.textContent = '+' + hi.toFixed(1) + ' pts  Passes';
    el('line', { x1: X(peM), x2: X(peM), y1: m.t - 4, y2: m.t + h, stroke: '#c98a1b', 'stroke-width': 2 }, svg);
    var tp = el('text', { x: X(peM) - 6, y: m.t + 8, 'font-size': 12, fill: '#94620c', 'font-weight': 700, 'text-anchor': 'end' }, svg); tp.textContent = 'Mid-year estimate';
  }
  function renderFix() {
    var o = R.opt, b = o.base, rows = [];
    rows.push({ opt: 'Do nothing', note: 'Refunds to HCEs are taxable and due by 03/15/2027', p: b.pFail, cost: 'Expected refund ' + usd(b.meanRefund), c: Infinity });
    if (o.cap) rows.push({ opt: 'Cap HCE deferrals at ' + pct(o.cap.cap) + ' from the 07/10/2026 payroll', note: 'About ' + usd(o.cap.res.meanHceDefCut) + ' of HCE deferrals shift to taxable pay', p: o.cap.res.pFail, cost: '$0 employer cost', c: 0 });
    if (o.qnec) rows.push({ opt: 'QNEC of ' + pct(o.qnec.qnec, 1) + ' of pay to eligible NHCEs', note: 'Fully vested; ACP risk unchanged', p: o.qnec.res.pFail, cost: usd(o.qnec.cost), c: o.qnec.cost });
    rows.push({ opt: 'Add a 3% nonelective safe harbor (amend by 12/01/2026)', note: 'Deems ADP and, with this match formula, ACP satisfied', p: o.safeHarbor.res.pFail, cost: usd(o.safeHarbor.cost), c: o.safeHarbor.cost });
    var best = null;
    rows.forEach(function (r) { if (r.p <= o.target && (best === null || r.c < best.c)) best = r; });
    var h = '<tr><th>Option</th><th class="num">Risk of failing</th><th class="num">Cost</th><th></th></tr>';
    rows.forEach(function (r) {
      h += '<tr' + (r === best ? ' class="rec"' : '') + '><td class="opt">' + r.opt + '<span class="note">' + r.note + '</span></td><td class="num">' + pillFor(r.p) + '</td><td class="num">' + r.cost + '</td><td class="num">' + (r === best ? '<span class="link">Recommended</span>' : '') + '</td></tr>';
    });
    $('fixTbl').innerHTML = h;
    $('fixLine').textContent = 'Each option is replayed on the same ' + DRAWS.toLocaleString('en-US') + ' simulated years, so the risks are directly comparable. Target: ' + riskPct(o.target) + ' or less.';
  }
  function renderDrivers() {
    var base = R.opt.base.pAdpFail;
    var h = '<tr><th>Switched off</th><th class="num">Risk of failing</th><th class="num">Change</th></tr>';
    h += '<tr><td class="opt">Nothing (full forecast)</td><td class="num">' + pillFor(base) + '</td><td class="num">–</td></tr>';
    var sorted = R.drivers.slice().sort(function (a, b) { return a.p - b.p; });
    sorted.forEach(function (d) {
      var ch = (d.p - base) * 100;
      h += '<tr><td>' + d.name + '</td><td class="num">' + pillFor(d.p) + '</td><td class="num">' + (ch > 0 ? '+' : '') + ch.toFixed(0) + ' pts</td></tr>';
    });
    $('drvTbl').innerHTML = h;
  }
  function renderBacktest() {
    var bt = R.bt;
    $('btLine').innerHTML = 'On ' + bt.n + ' simulated plans whose real behaviour differs from the forecast\u2019s assumptions, the mid-year estimate said “pass” for ' + bt.pointPass + '; ' + bt.missed + ' of those failed at year-end, and the forecast had given ' + bt.flagged + ' of them a 25%+ risk. Brier score ' + bt.brier.toFixed(3) + ' vs ' + bt.brierPoint.toFixed(3) + ' for the pass/fail estimate.';
    var svg = $('relChart'); while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = svg.clientWidth || 480, H = 210; svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var m = { l: 40, r: 10, t: 10, b: 32 }, w = W - m.l - m.r, h = H - m.t - m.b;
    var X = function (v) { return m.l + w * v; }, Y = function (v) { return m.t + h * (1 - v); };
    [0, .25, .5, .75, 1].forEach(function (v) {
      el('line', { x1: m.l, x2: m.l + w, y1: Y(v), y2: Y(v), stroke: '#eeeeee' }, svg);
      var t = el('text', { x: m.l - 6, y: Y(v) + 4, 'font-size': 11, fill: '#7d7d7d', 'text-anchor': 'end' }, svg); t.textContent = Math.round(v * 100) + '%';
      var tx = el('text', { x: X(v), y: H - 14, 'font-size': 11, fill: '#7d7d7d', 'text-anchor': 'middle' }, svg); tx.textContent = Math.round(v * 100) + '%';
    });
    var cap = el('text', { x: m.l + w / 2, y: H - 1, 'font-size': 11, fill: '#4f4f4f', 'text-anchor': 'middle', 'font-weight': 700 }, svg); cap.textContent = 'FORECAST RISK  →  SHARE THAT FAILED';
    el('line', { x1: X(0), y1: Y(0), x2: X(1), y2: Y(1), stroke: '#9a9a9a', 'stroke-dasharray': '4 4' }, svg);
    bt.reliability.forEach(function (r) {
      var c = el('circle', { cx: X(r.pred), cy: Y(r.obs), r: 4 + Math.sqrt(r.n) * 0.9, fill: '#3577a9', 'fill-opacity': 0.75, stroke: '#fff' }, svg);
      c.dataset.tip = r.n + ' plans forecast ' + Math.round(r.lo * 100) + '–' + Math.round(r.hi * 100) + '% (mean ' + Math.round(r.pred * 100) + '%): ' + Math.round(r.obs * 100) + '% failed';
    });
  }
  var showAll = false;
  function renderCensus() {
    var rows = R.census.slice().sort(function (a, b) {
      var ka = a.e.hce ? 0 : (!a.e.eligibleNow ? 1 : 2), kb = b.e.hce ? 0 : (!b.e.eligibleNow ? 1 : 2);
      return ka - kb || (a.e.name < b.e.name ? -1 : 1);
    });
    if (!showAll) rows = rows.slice(0, 16);
    var h = '<tr><th>Employee</th><th class="num">YTD Comp</th><th class="num">YTD Deferral</th><th class="num">Election</th><th class="num">Mid-Year Rate</th><th>Projected Year-End Rate (P10–P90)</th></tr>';
    rows.forEach(function (r) {
      var e = r.e, band = '';
      if (r.q) {
        var sc = function (v) { return Math.min(100, v / 0.12 * 100); };
        band = '<span class="band"><i style="left:' + sc(r.q[0]) + '%;width:' + Math.max(1.5, sc(r.q[2]) - sc(r.q[0])) + '%"></i><b style="left:' + sc(r.q[1]) + '%"></b></span> &nbsp;' + pct(r.q[0], 1) + '–' + pct(r.q[2], 1);
      } else band = '<span class="muted">Not eligible in 2026</span>';
      h += '<tr><td><a href="#">' + e.name + '</a>' + (e.hce ? '<span class="hce">HCE</span>' : '') + (!e.eligibleNow ? '<span class="new">ELIGIBLE IN ' + e.eligibleInPeriods + ' PAYROLLS</span>' : '') + '</td>' +
        '<td class="num">' + (e.eligibleNow ? usd2(e.ytdComp) : '--') + '</td><td class="num">' + (e.eligibleNow ? usd2(e.ytdDef) : '--') + '</td>' +
        '<td class="num">' + (e.eligibleNow ? pct(e.rate, 0) : '--') + '</td><td class="num">' + (r.mid != null ? pct(r.mid) : '--') + '</td><td>' + band + '</td></tr>';
    });
    $('censusTbl').innerHTML = h;
    $('toggleAll').textContent = showAll ? 'Show fewer' : 'Show all ' + R.census.length + ' employees';
  }

  function renderAll() { renderHeader(); renderForecast(); renderFix(); renderDrivers(); renderBacktest(); renderCensus(); if (window.lucide) window.lucide.createIcons(); }

  $('target').addEventListener('change', function () { computeCore(parseFloat(this.value)); renderForecast(); renderFix(); });
  $('toggleAll').addEventListener('click', function (ev) { ev.preventDefault(); showAll = !showAll; renderCensus(); });
  var tip = $('tip');
  document.addEventListener('mousemove', function (e) {
    var t = e.target && e.target.dataset ? e.target.dataset.tip : null;
    if (t) { tip.textContent = t; tip.style.display = 'block'; tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = (e.clientY + 12) + 'px'; } else tip.style.display = 'none';
  });

  computeCore(0.05); computeDrivers(); computeCensus(); computeBacktest();
  renderAll();
})();
