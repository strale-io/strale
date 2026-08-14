# Correction to the disposition table — 2026-08-14

**Status:** supersedes the failure-rate column in `disposition-v1-2026-08-12.md` and
`disposition-generated-2026-08-12.md`. The dispositions themselves (quarantine /
promote / investigate) were not all wrong, but the number they were ranked by was.

## The measurement was wrong

The disposition table ranked capabilities by the share of `transactions` rows with
`status = 'failed'`. That measure conflates three unrelated things:

1. Real defects hitting real callers.
2. Our own test harness executing `negative`, `known_bad`, and `edge_case` suites.
   These deliberately send invalid input. The capability correctly rejects it, the
   **test passes**, and the execution is still written as `status = 'failed'`.
3. Internal traffic generally, which is not customer-visible at all.

Category 2 dominates. Counting it as failure inverts the signal: a capability with
thorough negative-path coverage looks worse than one with none.

## Scale of the contamination

Platform traffic, 7 days to 2026-08-14:

| Source | Calls | "Failed" |
|---|---|---|
| Internal test harness (`system@strale.internal`) | 71,070 | 33,291 |
| Anonymous x402 (real) | 874 | 70 |
| Authenticated users (real) | 474 | 56 |

**98.1% of all platform traffic is our own test harness.** Any figure computed over
`transactions` without excluding it is a statement about our test suite, not about
the product.

## Worked example — brazilian-company-data

Reported on 2026-08-12 as failing 58–59%, described as a live revenue leak, and used
to justify scoping a Receita Federal bulk-ingest build.

Actual state, same database:

- `test_results`, 7 days: **500 of 500 tests passing.** dependency_health 83/83,
  edge_case 81/81, known_answer 85/85, known_bad 81/81, negative 85/85,
  piggyback 1/1, schema_check 84/84. Zero failing tests.
- Real callers, 90 days: 30 calls, 12 failures — **11 × HTTP 429, 1 × HTTP 404.**
- Lifetime revenue: €1.00.

The capability is healthy. The 58% was our negative tests working as designed.

A second claim I reported — that agents "arrive holding a company name" and Brazil
was refusing them — is also unsupported. Over 120 days the only input key ever
passed by a real caller is `cnpj` (32 times). No caller has ever sent a name.

## Use `test_results`, not `transactions`

`test_results` records whether a test **passed**, which is the health question.
`transactions` records whether an execution **succeeded**, which is a different
question and is dominated by intentional failures.

For customer-facing health, query `transactions` with
`u.email <> 'system@strale.internal'` (and include `user_id IS NULL` for x402).

## Corrected real-defect list

Non-internal traffic only, 30 days to 2026-08-14, capabilities with any failure:

| Capability | Failed / total |
|---|---|
| product-reviews-extract | 38 / 43 |
| tech-stack-detect | 45 / 215 |
| screenshot-url | 22 / 54 |
| url-to-markdown | 16 / 54 |
| us-company-data | 14 / 23 |
| brazilian-company-data | 12 / 30 |
| url-to-text | 11 / 20 |
| image-to-text | 11 / 28 |
| eu-regulation-search | 8 / 8 |
| llm-cost-calculate | 7 / 8 |
| price-compare | 6 / 11 |
| web-extract | 6 / 11 |

This is the list worth working from. `product-reviews-extract` (88% failing) and
`llm-cost-calculate` (88%) are the sharpest, and neither appeared near the top of
the original ranking.

## Two claims checked and rejected

Both came out of the Receita Federal design work and both sounded right.

**"198 capabilities declare a real cost the scheduler ignores."** 198 capabilities do
have `estimated_cost_cents > 0` while `external_cost_cents = 0`, but
`estimated_cost_cents` is set from `cap.priceCents`
(`apps/api/src/db/generate-schema-tests.ts:151`) — it is our **selling price**, not
an upstream cost. A free public registry correctly has `external_cost_cents = 0`.
There is no defect and no column to update. Measured external test spend is
**€3.64/week**, far under the €25 cap in DEC-20260812-A.

**"Our test harness causes the ReceitaWS 429s hitting customers."** Disproved as
stated. Brazil's tests ran 36 calls across 36 distinct minutes in 12 hours — never
more than one per minute, against a limit of roughly three per minute. The harness
cannot exhaust a per-minute limit at that rate, and it is not bursty.

The customer-facing 429s are real (11 of 12 real failures) but the mechanism is
unexplained. A shared daily quota is the remaining hypothesis and is unverified —
ReceitaWS does not publish one. Worth a look before anyone changes test scheduling
on the strength of the earlier claim.

## What this does not change

The Receita Federal recommendation still stands as **do not build**, and on stronger
ground than before: 31 real calls in 120 days, €1.00 lifetime revenue, no caller has
ever sent a name, and the licence blocker (CC BY-**ND** with no dataset-level grant)
is independent of demand.
