# Year-End Testing Forecast for Vestwell (concept)

**Live demo:** https://mohith26.github.io/vestwell-testing-forecast/

An unofficial concept feature for Vestwell's employer portal (My Plan > Annual Testing). Vestwell's
Mid-Year Estimated Testing runs the ADP/ACP tests on year-to-date payroll data and returns a point
estimate. This feature asks the next question a sponsor has: *how likely is the plan to actually fail
at year-end, what would the refund be, and what is the cheapest thing I can do about it before
December?*

Built by Mohith Gajjela. Not affiliated with Vestwell. All data is synthetic.

## What it shows (demo plan, data through 06/26/2026)

* **Mid-year estimate:** NHCE ADP 5.00%, HCE ADP 6.50%, limit 7.00%, so "Estimated: Pass".
* **Forecast:** a **38% chance of failing ADP** by year-end (ACP 0%), expected HCE refund $762,
  1-in-10 refund $2,746 or more.
* **Fix it before year-end** (target risk 5%, all options replayed on the same 2,000 simulated years):

| Option | Risk of failing | Cost |
|---|---|---|
| Do nothing | 38% | expected refund $762 to HCEs |
| Cap HCE deferrals at 7.00% from the 07/10/2026 payroll | 4% | $0 employer cost (~$3,549 of HCE deferrals become taxable pay) |
| QNEC of 0.4% of pay to eligible NHCEs | 3% | $12,375 |
| 3% nonelective safe harbor amendment | 0% | $149,875 |

* **What moves the result:** switching off one source of uncertainty at a time (election changes,
  employees who become eligible later in the year, bonuses, terminations).
* **Backtest:** on 200 simulated plans whose true behaviour differs from the forecaster's
  assumptions, the mid-year estimate said "pass" for 99; 8 of those failed at year-end, and the
  forecast had given 7 of the 8 at least a 25% risk. Brier score 0.016 vs 0.055 for the pass/fail
  estimate.

Every number on the page is computed in the browser from `data/plan.js` with `core/forecast.js`.

## How it works

1. **Tests.** Current-year ADP and ACP with the statutory limit (2x / +2 points / 1.25x tiers),
   401(a)(17) comp cap, 402(g) limit with deferrals above it treated as catch-up (age 50+, and the higher SECURE 2.0 limit
   for ages 60-63).
2. **Monte Carlo of the remaining 13 payrolls**, per employee: termination (and when), a deferral
   election change (HCEs tend to increase, some NHCEs stop), a December bonus for some HCEs,
   employees who become eligible later in the year and may or may not enrol, the 402(g) cap, and the
   match formula (50% of the first 6%) for ACP.
3. **Corrections.** A failed ADP test is corrected the way the regulations describe: ADR leveling to
   find the total excess, then dollar leveling to allocate it to the HCEs with the largest deferrals,
   net of catch-up recharacterization room for HCEs aged 50+.
4. **Fixes on common random numbers.** Every option is evaluated on the same simulated years, so
   risk is monotone in the HCE cap and in the QNEC; bisection finds the least disruptive cap and the
   smallest QNEC that meet the target, and the safe-harbor option is priced at 3% of eligible pay.
5. **Backtest.** A book of synthetic plans is generated with plan-specific "true" behaviour that
   deviates from the population assumptions the forecaster uses; each plan's realised year-end is
   simulated once, and the forecast and the point estimate are scored against it.

## Tests

```
node --test tests/forecast.test.cjs
```

12 tests: catch-up limits by age; committed data equals the seeded generator; the three limit tiers; ratio leveling lands
exactly on the limit; dollar leveling takes from the largest deferrals first; a hand-computed census
($4,000 refund); catch-up room absorbs a 50+ HCE's excess; the point estimate ignores not-yet-eligible
employees; 402(g), eligibility timing and the HCE cap hold in simulation; risk is monotone in the cap
and the QNEC; optimizer options meet the target; the forecast beats the point estimate on Brier score
on a heterogeneous book.

Regenerate data with `node data/generate.js`.

## Honest limitations

* Behavioural rates (termination, election-change and enrolment probabilities, bonus incidence) are
  my assumptions, standing in for rates Vestwell could estimate from its own book. The backtest
  perturbs them per plan, but it is still synthetic, so the calibration result shows the method
  works when the assumptions are roughly right, not that these numbers are right.
* Current-year testing only (no prior-year method), no top-heavy or coverage forecast, no
  controlled-group or multiple-pay-group logic, no Roth/after-tax split, and new hires after the
  as-of date are not simulated.
* The HCE cap assumes the payroll provider can enforce a per-HCE election ceiling from the next
  payroll; the QNEC is a uniform percentage rather than a targeted bottom-up QNEC.
* Nothing here is tax or legal advice; the safe-harbor deadline shown is the SECURE Act 30-day rule
  for a 3% nonelective amendment.

## Novelty note

Vestwell already offers Mid-Year Estimated Testing (a point estimate from YTD data with general fix
guidance: reduce HCE contributions, expect a refund, consider safe harbor next year), and the
Guideline-heritage dashboard shows projected test results. The closest competitor is Human
Interest's Predictive Compliance Monitoring (announced Aug 2026): monthly ADP/ACP/top-heavy
projections, a top-heavy cost calculator and design guidance. What I did not find at Vestwell or
Human Interest is a calibrated probability of failing with a refund distribution, plus a priced,
risk-targeted in-year fix (the exact HCE cap, QNEC or safe harbor) evaluated on the same simulated
futures.

## Files

* `core/forecast.js` - tests, leveling, simulation, optimizer, backtest (browser + Node)
* `core/synth.js` - seeded synthetic plans and the backtest book; `data/generate.js` writes `data/plan.{json,js}`
* `index.html`, `styles.css`, `app.js` - the page, styled after Vestwell's employer portal
* `tests/forecast.test.cjs` - unit tests
