/*
 * Year-end ADP/ACP forecast for a 401(k) plan, from mid-year payroll data.
 *
 * - ADP/ACP tests (current-year testing), IRC 401(k)(3)/401(m) limits
 * - Monte Carlo of the remaining payrolls: terminations, deferral election changes,
 *   year-end bonuses, employees who become eligible later in the year, 402(g) cap with
 *   catch-up carve-out for age 50+
 * - corrective distribution for a failed ADP test: ADR leveling to find the excess,
 *   then dollar leveling to allocate it, net of catch-up recharacterization room
 * - in-year fixes evaluated on common random numbers: HCE deferral cap, NHCE QNEC,
 *   3% nonelective safe harbor amendment
 *
 * Works in the browser (window.TestingForecast) and Node (module.exports).
 */
(function (root) {
  'use strict';

  var LIM = { g402: 24500, catchUp: 8000, catchUp6063: 11250, compCap: 360000 }; // 2026 limits (IRS Notice 2025-67)
  // SECURE 2.0: ages 60-63 get the higher catch-up limit.
  function catchUpFor(age) { return age >= 60 && age <= 63 ? LIM.catchUp6063 : age >= 50 ? LIM.catchUp : 0; }

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Maximum permitted HCE average under the ADP/ACP test (current-year testing).
  function testLimit(nhce) {
    var a = nhce * 1.25;
    var b = Math.min(nhce * 2, nhce + 0.02);
    return Math.max(a, b);
  }

  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }

  // ADR leveling (Treas. Reg. 1.401(k)-2(b)(2)(ii)): lower the highest HCE ratios to a common
  // level until the HCE average equals the limit. Returns excess dollars per HCE.
  function levelRatios(ratios, comps, limit) {
    var n = ratios.length;
    var avg = mean(ratios);
    if (avg <= limit + 1e-12) return { excess: ratios.map(function () { return 0; }), level: Infinity };
    var target = limit * n;                       // required sum of ratios
    var sorted = ratios.slice().sort(function (a, b) { return b - a; });
    var sum = sorted.reduce(function (s, x) { return s + x; }, 0);
    // find level L: sum(min(r, L)) = target
    var L = 0, cut = 0;
    for (var k = 1; k <= n; k++) {
      var top = 0;
      for (var j = 0; j < k; j++) top += sorted[j];
      var rest = sum - top;
      L = (target - rest) / k;
      if (k === n || L >= sorted[k]) { cut = k; break; }
    }
    var excess = ratios.map(function (r, i) { return r > L ? (r - L) * comps[i] : 0; });
    return { excess: excess, level: L };
  }

  // Dollar leveling (1.401(k)-2(b)(2)(iii)): allocate the total excess by reducing the
  // largest HCE deferral dollar amounts first.
  function levelDollars(dollars, total) {
    var n = dollars.length;
    var out = dollars.map(function () { return 0; });
    if (total <= 0) return out;
    var idx = dollars.map(function (d, i) { return i; }).sort(function (a, b) { return dollars[b] - dollars[a]; });
    var remaining = total;
    for (var k = 1; k <= n && remaining > 1e-9; k++) {
      var cur = dollars[idx[0]] - out[idx[0]];     // current common top level
      var next = k < n ? dollars[idx[k]] : 0;
      var room = (cur - next) * k;
      var take = Math.min(room, remaining);
      for (var j = 0; j < k; j++) out[idx[j]] += take / k;
      remaining -= take;
    }
    return out;
  }

  // Run both tests on a year-end census snapshot.
  // rows: [{hce, comp, adpDef, acpMatch, age, catchUpUsed}] (eligible employees with comp > 0)
  function runTests(rows, qnecPct) {
    var hR = [], hC = [], hD = [], hAge = [], hCU = [], nR = [], hM = [], nM = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.comp <= 0) continue;
      var c = Math.min(r.comp, LIM.compCap);
      if (r.hce) { hR.push(r.adpDef / c); hC.push(c); hD.push(r.adpDef); hAge.push(r.age); hCU.push(r.catchUpUsed || 0); hM.push(r.acpMatch / c); }
      else { nR.push(r.adpDef / c + (qnecPct || 0)); nM.push(r.acpMatch / c); }
    }
    var adpN = mean(nR), adpH = mean(hR), acpN = mean(nM), acpH = mean(hM);
    var adpLim = testLimit(adpN), acpLim = testLimit(acpN);
    var refund = 0;
    if (adpH > adpLim + 1e-12) {
      var lv = levelRatios(hR, hC, adpLim);
      var total = lv.excess.reduce(function (s, x) { return s + x; }, 0);
      var per = levelDollars(hD, total);
      for (var k = 0; k < per.length; k++) {
        var cuRoom = Math.max(0, catchUpFor(hAge[k]) - hCU[k]);
        refund += Math.max(0, per[k] - cuRoom);   // recharacterize as catch-up first
      }
    }
    var acpExcess = 0;
    if (acpH > acpLim + 1e-12) {
      var lv2 = levelRatios(hM, hC, acpLim);
      acpExcess = lv2.excess.reduce(function (s, x) { return s + x; }, 0);
    }
    return { adpN: adpN, adpH: adpH, adpLim: adpLim, adpPass: adpH <= adpLim + 1e-12, refund: refund,
      acpN: acpN, acpH: acpH, acpLim: acpLim, acpPass: acpH <= acpLim + 1e-12, acpExcess: acpExcess };
  }

  // Mid-year point estimate: today's eligible employees, year-to-date ratios.
  function pointEstimate(plan) {
    var rows = plan.employees.filter(function (e) { return e.eligibleNow && e.ytdComp > 0; }).map(function (e) {
      return { hce: e.hce, comp: e.ytdComp, adpDef: Math.min(e.ytdDef, LIM.g402), acpMatch: e.ytdMatch, age: e.age, catchUpUsed: Math.max(0, e.ytdDef - LIM.g402) };
    });
    return runTests(rows, 0);
  }

  // One simulated year-end for one employee. u: 8 uniforms. action: {hceCap}
  function simEmployee(e, A, u, action) {
    var K = A.periodsLeft;
    var w = e.salary / A.periodsPerYear;
    // termination
    var pT = e.hce ? A.pTermHce : A.pTermNhce;
    var n = u[0] < pT ? Math.floor(u[1] * K) : K;
    // eligibility start (in remaining periods); employees already eligible start at 0
    var start = e.eligibleNow ? 0 : e.eligibleInPeriods;
    if (start >= n) return { comp: e.eligibleNow ? e.ytdComp : 0, def: e.eligibleNow ? e.ytdDef : 0, match: e.ytdMatch, eligible: e.eligibleNow };
    // election (new eligibles may enrol)
    var rate = e.rate;
    if (!e.eligibleNow) rate = u[2] < A.pEnrollNew ? A.newEnrollRates[Math.floor(u[3] * A.newEnrollRates.length)] : 0;
    var changeAt = K + 1, newRate = rate;
    var pC = e.hce ? A.pChangeHce : A.pChangeNhce;
    if (e.eligibleNow && u[4] < pC) {
      changeAt = Math.floor(u[5] * K);
      if (e.hce) newRate = Math.min(0.30, rate + 0.02 + Math.floor(u[6] * 5) * 0.01);
      else newRate = u[6] < A.pStopGivenChange ? 0 : rate + 0.01 * (1 + Math.floor(u[7] * 3));
    }
    var cap = e.hce && action && action.hceCap != null ? action.hceCap : Infinity;
    var comp = 0, def = 0, match = 0;
    var ytdDef = e.eligibleNow ? e.ytdDef : 0;
    var limit = LIM.g402 + catchUpFor(e.age);
    for (var p = start; p < n; p++) {
      var pay = w;
      if (p === K - 1 && n === K && e.bonusPct > 0) pay += e.salary * e.bonusPct; // December bonus
      var r = Math.min(p >= changeAt ? newRate : rate, cap);
      var d = Math.min(pay * r, Math.max(0, limit - ytdDef - def));
      comp += pay; def += d;
      match += A.matchRate * Math.min(r, A.matchCapPct) * pay;
    }
    var totalDef = ytdDef + def;
    return {
      comp: (e.eligibleNow ? e.ytdComp : 0) + comp,
      def: totalDef,
      match: e.ytdMatch + match,
      eligible: true
    };
  }

  // Draw a matrix of uniforms so every action is evaluated on the same futures.
  function drawUniforms(plan, nDraws, seed) {
    var R = rng(seed), m = plan.employees.length, U = new Float64Array(nDraws * m * 8);
    for (var i = 0; i < U.length; i++) U[i] = R();
    return U;
  }

  function forecast(plan, nDraws, seed, action, U) {
    var A = plan.assumptions, emps = plan.employees, m = emps.length;
    U = U || drawUniforms(plan, nDraws, seed);
    var res = { adpFail: 0, acpFail: 0, eitherFail: 0, refunds: [], margins: [], adpN: [], adpH: [], hceDefCut: 0 };
    var u = new Array(8);
    for (var t = 0; t < nDraws; t++) {
      var rows = [];
      var cut = 0;
      for (var i = 0; i < m; i++) {
        for (var k = 0; k < 8; k++) u[k] = U[(t * m + i) * 8 + k];
        var s = simEmployee(emps[i], A, u, action);
        if (!s.eligible || s.comp <= 0) continue;
        if (action && action.hceCap != null && emps[i].hce) {
          var base = simEmployee(emps[i], A, u, null);
          cut += Math.min(base.def, LIM.g402) - Math.min(s.def, LIM.g402);
        }
        rows.push({ hce: emps[i].hce, comp: s.comp, adpDef: Math.min(s.def, LIM.g402), acpMatch: s.match, age: emps[i].age, catchUpUsed: Math.max(0, s.def - LIM.g402) });
      }
      var r = runTests(rows, action && action.qnec ? action.qnec : 0);
      if (action && action.safeHarbor) { r.adpPass = true; r.acpPass = true; r.refund = 0; r.acpExcess = 0; }
      if (!r.adpPass) res.adpFail++;
      if (!r.acpPass) res.acpFail++;
      if (!r.adpPass || !r.acpPass) res.eitherFail++;
      res.refunds.push(r.refund);
      res.margins.push(r.adpLim - r.adpH);
      res.adpN.push(r.adpN); res.adpH.push(r.adpH);
      res.hceDefCut += cut;
    }
    res.pAdpFail = res.adpFail / nDraws;
    res.pAcpFail = res.acpFail / nDraws;
    res.pFail = res.eitherFail / nDraws;
    res.meanRefund = mean(res.refunds);
    res.meanHceDefCut = res.hceDefCut / nDraws;
    var sr = res.refunds.slice().sort(function (a, b) { return a - b; });
    res.p90Refund = quantile(sr, 0.9);
    var sm = res.margins.slice().sort(function (a, b) { return a - b; });
    res.marginQ = [quantile(sm, 0.05), quantile(sm, 0.25), quantile(sm, 0.5), quantile(sm, 0.75), quantile(sm, 0.95)];
    return res;
  }

  function quantile(sorted, q) {
    if (!sorted.length) return NaN;
    var pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }

  // Full-year eligible compensation, used to price the QNEC and safe-harbor options.
  function projectedComp(plan, hceOnly) {
    var A = plan.assumptions, s = 0;
    plan.employees.forEach(function (e) {
      if (hceOnly === true && !e.hce) return;
      if (hceOnly === false && e.hce) return;
      var periods = e.eligibleNow ? A.periodsLeft : Math.max(0, A.periodsLeft - e.eligibleInPeriods);
      s += Math.min(LIM.compCap, (e.eligibleNow ? e.ytdComp : 0) + periods * e.salary / A.periodsPerYear);
    });
    return s;
  }

  // In-year options that bring the risk of failing either test under `target`.
  function optimize(plan, nDraws, seed, target) {
    var U = drawUniforms(plan, nDraws, seed);
    var base = forecast(plan, nDraws, seed, null, U);
    // 1) HCE deferral cap: highest cap (least disruptive) meeting the target. Risk is
    //    monotone non-increasing in the cap on common random numbers, so bisection works.
    var lo = 0, hi = 0.30, capRes = null;
    var atLo = forecast(plan, nDraws, seed, { hceCap: lo }, U);
    if (atLo.pFail <= target) {
      for (var it = 0; it < 22; it++) {
        var mid = (lo + hi) / 2;
        var r = forecast(plan, nDraws, seed, { hceCap: mid }, U);
        if (r.pFail <= target) lo = mid; else hi = mid;
      }
      var capPct = Math.floor(lo * 400) / 400;  // round down to 0.25%
      capRes = { cap: capPct, res: forecast(plan, nDraws, seed, { hceCap: capPct }, U) };
    }
    // 2) QNEC to every eligible NHCE: smallest % meeting the ADP target (ACP unaffected)
    var qlo = 0, qhi = 0.10, qRes = null;
    var atHi = forecast(plan, nDraws, seed, { qnec: qhi }, U);
    if (atHi.pAdpFail <= target) {
      for (var it2 = 0; it2 < 22; it2++) {
        var qm = (qlo + qhi) / 2;
        var r2 = forecast(plan, nDraws, seed, { qnec: qm }, U);
        if (r2.pAdpFail <= target) qhi = qm; else qlo = qm;
      }
      var q = Math.ceil(qhi * 1000) / 1000;      // round up to 0.1%
      qRes = { qnec: q, cost: q * projectedComp(plan, false), res: forecast(plan, nDraws, seed, { qnec: q }, U) };
    }
    // 3) 3% nonelective safe harbor (deems ADP and, with this match formula, ACP satisfied)
    var sh = { cost: 0.03 * projectedComp(plan, null), res: forecast(plan, nDraws, seed, { safeHarbor: true }, U) };
    return { base: base, cap: capRes, qnec: qRes, safeHarbor: sh, target: target };
  }

  // Reliability of the forecast vs the point estimate across a book of plans whose true
  // behaviour differs from the population assumptions the forecaster uses.
  function backtest(book, nDraws, seed) {
    var out = [];
    for (var i = 0; i < book.length; i++) {
      var p = book[i];
      var f = forecast(p.plan, nDraws, seed + i, null);
      var pe = pointEstimate(p.plan);
      out.push({ p: f.pAdpFail, point: pe.adpPass ? 0 : 1, actual: p.actualFail ? 1 : 0 });
    }
    var brier = mean(out.map(function (o) { return (o.p - o.actual) * (o.p - o.actual); }));
    var brierPoint = mean(out.map(function (o) { return (o.point - o.actual) * (o.point - o.actual); }));
    var bins = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1.0001].slice(0);
    var rel = [];
    for (var b = 0; b < bins.length - 1; b++) {
      var inb = out.filter(function (o) { return o.p >= bins[b] && o.p < bins[b + 1]; });
      if (inb.length) rel.push({ lo: bins[b], hi: Math.min(1, bins[b + 1]), n: inb.length, pred: mean(inb.map(function (o) { return o.p; })), obs: mean(inb.map(function (o) { return o.actual; })) });
    }
    var pointPass = out.filter(function (o) { return o.point === 0; });
    var missed = pointPass.filter(function (o) { return o.actual === 1; });
    var flagged = missed.filter(function (o) { return o.p >= 0.25; });
    return { n: out.length, brier: brier, brierPoint: brierPoint, reliability: rel, pointPass: pointPass.length, missed: missed.length, flagged: flagged.length, rows: out };
  }

  var api = { LIM: LIM, catchUpFor: catchUpFor, rng: rng, testLimit: testLimit, levelRatios: levelRatios, levelDollars: levelDollars, runTests: runTests,
    pointEstimate: pointEstimate, simEmployee: simEmployee, drawUniforms: drawUniforms, forecast: forecast, optimize: optimize,
    projectedComp: projectedComp, backtest: backtest, quantile: quantile, mean: mean };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TestingForecast = api;
})(typeof window !== 'undefined' ? window : this);
