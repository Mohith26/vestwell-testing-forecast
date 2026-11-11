'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../core/forecast.js');
const S = require('../core/synth.js');
const { build } = require('../data/generate.js');
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/plan.json'), 'utf8'));
const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

test('committed demo plan equals the seeded generator output', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(build())), DATA);
});

test('ADP/ACP limit follows the three statutory tiers', () => {
  assert.ok(close(F.testLimit(0.01), 0.02));    // 2x when NHCE <= 2%
  assert.ok(close(F.testLimit(0.05), 0.07));    // +2 points between 2% and 8%
  assert.ok(close(F.testLimit(0.10), 0.125));   // 1.25x above 8%
});

test('ratio leveling brings the HCE average exactly to the limit', () => {
  const ratios = [0.10, 0.08, 0.04], comps = [200000, 180000, 170000];
  const lv = F.levelRatios(ratios, comps, 0.06);
  const after = ratios.map((r, i) => r - lv.excess[i] / comps[i]);
  assert.ok(close(after.reduce((s, x) => s + x, 0) / 3, 0.06));
  assert.ok(close(lv.excess[2], 0), 'lowest HCE untouched');
  assert.ok(close(after[0], after[1]), 'top two leveled to a common ratio');
});

test('dollar leveling takes from the largest deferrals first', () => {
  const out = F.levelDollars([10000, 8000, 3000], 3000);
  assert.ok(close(out[0], 2500) && close(out[1], 500) && close(out[2], 0));
  const out2 = F.levelDollars([5000, 5000], 1000);
  assert.ok(close(out2[0], 500) && close(out2[1], 500));
});

test('runTests on a hand-computed census', () => {
  const rows = [
    { hce: true, comp: 200000, adpDef: 16000, acpMatch: 6000, age: 40 },   // 8%
    { hce: true, comp: 200000, adpDef: 12000, acpMatch: 6000, age: 40 },   // 6%
    { hce: false, comp: 50000, adpDef: 2500, acpMatch: 1250, age: 30 },    // 5%
    { hce: false, comp: 50000, adpDef: 1500, acpMatch: 750, age: 30 }      // 3%
  ];
  const r = F.runTests(rows, 0);
  assert.ok(close(r.adpN, 0.04) && close(r.adpH, 0.07) && close(r.adpLim, 0.06));
  assert.equal(r.adpPass, false);
  // leveling: min(8%,L)+min(6%,L)=12% gives L=6%, so the excess is 2% of $200k = $4,000
  assert.ok(close(r.refund, 4000, 1e-6));
  assert.ok(close(F.runTests(rows, 0.01).adpN, 0.05), 'QNEC raises NHCE ratios');
});

test('catch-up room absorbs refunds for HCEs aged 50+', () => {
  const rows = [
    { hce: true, comp: 200000, adpDef: 16000, acpMatch: 0, age: 55, catchUpUsed: 0 },
    { hce: true, comp: 200000, adpDef: 12000, acpMatch: 0, age: 40 },
    { hce: false, comp: 50000, adpDef: 2000, acpMatch: 0, age: 30 }
  ];
  const r = F.runTests(rows, 0);
  assert.equal(r.adpPass, false);
  assert.ok(close(r.refund, 0), 'the whole excess fits in the 55-year-old\'s $8,000 catch-up room');
});

test('catch-up limit by age (SECURE 2.0 ages 60-63)', () => {
  assert.equal(F.catchUpFor(49), 0); assert.equal(F.catchUpFor(55), 8000); assert.equal(F.catchUpFor(61), 11250); assert.equal(F.catchUpFor(64), 8000);
});

test('point estimate ignores employees who are not yet eligible', () => {
  const p = DATA.plan;
  const pe = F.pointEstimate(p);
  const p2 = JSON.parse(JSON.stringify(p));
  p2.employees = p2.employees.filter((e) => e.eligibleNow);
  assert.deepEqual(F.pointEstimate(p2), pe);
});

test('simulated employees respect 402(g), eligibility timing and termination', () => {
  const A = DATA.plan.assumptions;
  const R = F.rng(3);
  for (const e of DATA.plan.employees) {
    for (let k = 0; k < 200; k++) {
      const u = Array.from({ length: 8 }, () => R());
      const s = F.simEmployee(e, A, u, null);
      assert.ok(s.def <= F.LIM.g402 + F.catchUpFor(e.age) + 1e-6);
      assert.ok(s.comp >= (e.eligibleNow ? e.ytdComp : 0) - 1e-9);
      if (!e.eligibleNow && s.eligible) assert.ok(s.comp <= (A.periodsLeft - e.eligibleInPeriods) * e.salary / A.periodsPerYear + 1e-6);
      const capped = F.simEmployee(e, A, u, { hceCap: 0.03 });
      if (e.hce) assert.ok(capped.def - e.ytdDef <= 0.03 * (capped.comp - e.ytdComp) + 1e-6);
    }
  }
});

test('risk is monotone in the HCE cap and the QNEC on common random numbers', () => {
  const p = DATA.plan, U = F.drawUniforms(p, 400, 21);
  let prev = -1;
  for (const c of [0.12, 0.09, 0.07, 0.05, 0.03]) { const r = F.forecast(p, 400, 21, { hceCap: c }, U).pAdpFail; assert.ok(prev < 0 || r <= prev + 1e-12); prev = r; }
  prev = 2;
  for (const q of [0, 0.002, 0.004, 0.008]) { const r = F.forecast(p, 400, 21, { qnec: q }, U).pAdpFail; assert.ok(r <= prev + 1e-12); prev = r; }
});

test('optimizer options meet the target risk and the forecast is deterministic', () => {
  const o = F.optimize(DATA.plan, 600, 11, 0.05);
  assert.ok(o.base.pFail > 0.05);
  assert.ok(o.cap && o.cap.res.pFail <= 0.05);
  assert.ok(o.qnec && o.qnec.res.pAdpFail <= 0.05);
  assert.equal(o.safeHarbor.res.pFail, 0);
  const a = F.forecast(DATA.plan, 300, 9, null), b = F.forecast(DATA.plan, 300, 9, null);
  assert.deepEqual(a.refunds, b.refunds);
});

test('on a heterogeneous book the forecast beats the mid-year point estimate (Brier)', () => {
  const book = S.makeBook(80, 5000);
  const bt = F.backtest(book, 200, 77);
  assert.ok(bt.brier < bt.brierPoint, bt.brier + ' vs ' + bt.brierPoint);
});
