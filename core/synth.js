/*
 * Seeded synthetic plans for the demo (shared by the page, the tests and data/generate.js).
 * Day 0 of the forecast is the 13th of 26 biweekly payrolls (pay date 06/26/2026).
 */
(function (root) {
  'use strict';
  var F = (typeof module !== 'undefined' && module.exports) ? require('./forecast.js') : root.TestingForecast;

  var POP = {               // population assumptions the forecaster uses (book-of-business averages)
    periodsPerYear: 26, periodsLeft: 13,
    pTermNhce: 0.14, pTermHce: 0.04,
    pChangeNhce: 0.10, pChangeHce: 0.12, pStopGivenChange: 0.35,
    pEnrollNew: 0.30, newEnrollRates: [0.03, 0.04, 0.05, 0.06],
    matchRate: 0.5, matchCapPct: 0.06
  };

  var FIRST = ['Ava', 'Ben', 'Carla', 'Diego', 'Elena', 'Femi', 'Grace', 'Hiro', 'Imani', 'Jonah', 'Kara', 'Luis', 'Maya', 'Noor', 'Owen', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tara', 'Uma', 'Victor', 'Wen', 'Xavier', 'Yara', 'Zane', 'Alma', 'Brooks', 'Cyrus', 'Dana', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ivan', 'Jade', 'Kofi', 'Lena', 'Milo', 'Nina', 'Omar', 'Pia', 'Reed', 'Sofia', 'Theo', 'Vera', 'Wade', 'Zoe', 'Ari', 'Bea', 'Cole', 'Drew', 'Esme', 'Finn', 'Gia', 'Hugo', 'Iris', 'Jude', 'Kai', 'Lila'];
  var LAST = ['Alvarez', 'Brooks', 'Chen', 'Dawson', 'Ellis', 'Foster', 'Garcia', 'Hayes', 'Ibarra', 'Jensen', 'Kim', 'Lopez', 'Moreno', 'Nguyen', 'Okafor', 'Patel', 'Quintero', 'Reyes', 'Shah', 'Torres', 'Underwood', 'Vasquez', 'Walsh', 'Xu', 'Young', 'Zimmerman', 'Abbott', 'Bishop', 'Cruz', 'Diaz', 'Evans', 'Flores', 'Grant', 'Hughes', 'Ito', 'James', 'Khan', 'Lewis', 'Mills', 'Nash', 'Ortiz', 'Price', 'Ross', 'Singh', 'Tran', 'Vega', 'Ward', 'Yates', 'Zhou', 'Baker', 'Cole', 'Dunn', 'Ford', 'Gray', 'Hart', 'Irwin', 'Jordan', 'Kerr', 'Lane', 'Moss'];

  function pick(R, arr) { return arr[Math.floor(R() * arr.length)]; }
  function round2(x) { return Math.round(x * 100) / 100; }

  // Build one plan. `k` controls size and behaviour so the backtest book is heterogeneous.
  function makePlan(seed, k) {
    var R = F.rng(seed);
    k = k || {};
    var nH = k.nH != null ? k.nH : 6 + Math.floor(R() * 6);
    var nN = k.nN != null ? k.nN : 30 + Math.floor(R() * 50);
    var nNew = k.nNew != null ? k.nNew : Math.floor(R() * 7);
    var zeroShare = k.zeroShare != null ? k.zeroShare : 0.12 + R() * 0.25;
    var hceRate = k.hceRate != null ? k.hceRate : 0.035 + R() * 0.06;
    var bonusShare = k.bonusShare != null ? k.bonusShare : R() * 0.6;
    var emps = [], used = {};
    function name() { var nm; do { nm = pick(R, LAST) + ', ' + pick(R, FIRST); } while (used[nm]); used[nm] = 1; return nm; }
    function ytd(e) {
      var per = e.salary / POP.periodsPerYear, def = 0, match = 0;
      for (var p = 0; p < 13; p++) {
        var d = Math.min(per * e.rate, Math.max(0, F.LIM.g402 + F.catchUpFor(e.age) - def));
        def += d; match += POP.matchRate * Math.min(e.rate, POP.matchCapPct) * per;
      }
      e.ytdComp = round2(per * 13); e.ytdDef = round2(def); e.ytdMatch = round2(match);
    }
    for (var i = 0; i < nH; i++) {
      var e = { name: name(), hce: true, age: 34 + Math.floor(R() * 30), salary: Math.round((165000 + R() * 170000) / 500) * 500,
        rate: Math.min(0.30, Math.max(0.04, hceRate + (R() - 0.5) * 0.08)), eligibleNow: true, eligibleInPeriods: 0,
        bonusPct: R() < bonusShare ? round2(0.10 + R() * 0.20) : 0 };
      e.rate = Math.round(e.rate * 100) / 100;
      ytd(e); emps.push(e);
    }
    for (var j = 0; j < nN; j++) {
      var s = Math.round((36000 + Math.pow(R(), 1.4) * 70000) / 250) * 250;
      var rate = R() < zeroShare ? 0 : Math.round((0.02 + R() * 0.08) * 100) / 100;
      var n = { name: name(), hce: false, age: 22 + Math.floor(R() * 40), salary: s, rate: rate, eligibleNow: true, eligibleInPeriods: 0, bonusPct: R() < 0.1 ? 0.03 : 0 };
      ytd(n); emps.push(n);
    }
    for (var q = 0; q < nNew; q++) {
      var ns = Math.round((36000 + R() * 34000) / 250) * 250;
      var ne = { name: name(), hce: false, age: 21 + Math.floor(R() * 25), salary: ns, rate: 0, eligibleNow: false, eligibleInPeriods: 1 + Math.floor(R() * 8), bonusPct: 0, ytdComp: 0, ytdDef: 0, ytdMatch: 0 };
      emps.push(ne);
    }
    emps.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    return { name: k.name || ('Plan ' + seed), seed: seed, asOf: '06/26/2026', assumptions: JSON.parse(JSON.stringify(POP)), employees: emps };
  }

  // A plan's true behaviour deviates from the population assumptions.
  function trueAssumptions(R) {
    var A = JSON.parse(JSON.stringify(POP));
    var f = function (x, s) { return Math.max(0, Math.min(0.9, x * Math.exp((R() - 0.5) * s))); };
    A.pTermNhce = f(A.pTermNhce, 1.2); A.pTermHce = f(A.pTermHce, 1.2);
    A.pChangeNhce = f(A.pChangeNhce, 1.2); A.pChangeHce = f(A.pChangeHce, 1.2);
    A.pEnrollNew = f(A.pEnrollNew, 1.0); A.pStopGivenChange = f(A.pStopGivenChange, 0.8);
    return A;
  }

  // Simulate the realised year-end once under the plan's true behaviour.
  function realise(plan, A, seed) {
    var R = F.rng(seed), u = new Array(8), rows = [];
    plan.employees.forEach(function (e) {
      for (var k = 0; k < 8; k++) u[k] = R();
      var s = F.simEmployee(e, A, u, null);
      if (!s.eligible || s.comp <= 0) return;
      rows.push({ hce: e.hce, comp: s.comp, adpDef: Math.min(s.def, F.LIM.g402), acpMatch: s.match, age: e.age, catchUpUsed: Math.max(0, s.def - F.LIM.g402) });
    });
    return F.runTests(rows, 0);
  }

  function makeBook(n, seed0) {
    var book = [];
    for (var i = 0; i < n; i++) {
      var plan = makePlan(seed0 + i);
      var R = F.rng(seed0 * 7 + i);
      var A = trueAssumptions(R);
      var real = realise(plan, A, seed0 * 13 + i);
      book.push({ plan: plan, actualFail: !real.adpPass });
    }
    return book;
  }

  var api = { POP: POP, makePlan: makePlan, makeBook: makeBook, realise: realise, trueAssumptions: trueAssumptions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TestingSynth = api;
})(typeof window !== 'undefined' ? window : this);
