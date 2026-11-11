// Seeded generator for the demo plan. Run: node data/generate.js
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('../core/synth.js');
const DEMO = { seed: 55, k: { nH: 8, nN: 48, nNew: 5, name: 'Juniper Ridge Veterinary Partners 401(k) Plan' } };
function build() { return { demo: DEMO, plan: S.makePlan(DEMO.seed, DEMO.k), book: { n: 200, seed0: 5000 } }; }
module.exports = { build, DEMO };
if (require.main === module) {
  const out = build();
  fs.writeFileSync(path.join(__dirname, 'plan.json'), JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(__dirname, 'plan.js'), 'window.VW_DATA = ' + JSON.stringify(out) + ';\n');
  console.log('employees', out.plan.employees.length);
}
