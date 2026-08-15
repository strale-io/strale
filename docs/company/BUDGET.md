# Budget Ledger — CFO

**Envelope: €50/week external spend** (vendor APIs, settlement fees, anything
that invoices). Set by Petter 2026-08-15. Compute rides the Claude plan and is
optimized, not billed here.

## Week of 2026-08-11 → 2026-08-17

| line | committed/spent | source of truth | note |
|---|---|---|---|
| Test-harness external API spend | ~€3.64 | `test_suites.external_cost_cents` × runs | measured 2026-08-14 |
| CDP settlement fees | ~$0.65 est. | settlements past 1,000/mo free tier × $0.001 | ~650 settlements/wk |
| Vendor API overage | €0 | — | free tiers, quota-guarded |
| **Total vs envelope** | **≈ €4.30 / €50** | | comfortable |

## Standing rules (CFO enforces)

1. Cheapest capable model per task; top tier only for judgment/verification.
2. Kill any recurring job whose output nobody read for 2 weeks.
3. Any new external-cost source gets a line here BEFORE it runs.
4. Report at Sunday synthesis: spend vs envelope, cost per merged PR
   (approx. from session telemetry), cost per € of revenue.
5. The €25 full-catalog-sweep cap (DEC-20260812-A) lives inside this envelope.

## Known gaps (honest)

- Compute cost per PR is approximate (subagent token counts from task
  telemetry; no exact per-PR attribution yet).
- External API spend is derived from test-suite cost columns + known fee
  schedules, not from invoices. Reconcile monthly against actual bills.
