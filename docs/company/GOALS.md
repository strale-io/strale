# Strale Goals — the document every agent reads first

**Reviewed:** 2026-08-15 · next review at each Sunday synthesis · quarterly deep review.

## Mission

The data layer for AI agents: independently tested, audit-logged data sources,
purchasable by agents without human ceremony. Vertical-agnostic; sell what
buyers demonstrate they want.

## The goal that ranks everything

**$2,000/week gross revenue (medium-term).** Baseline 2026-08-15: ~$115/week.

| milestone | proves | status |
|---|---|---|
| **M1 · $250/wk** | conversion works: arriving agents become paying callers | ACTIVE |
| **M2 · $600/wk** | repeat usage + mix: buyers come back; we sell what they buy | — |
| **M3 · $1,200/wk** | scale: the experiment factory makes new bets cheap | — |
| **M4 · $2,000/wk** | the goal | — |

## What we currently know (update as evidence lands)

- **176 agents/week reach MCP; ~0 converted.** The wall was a web signup form;
  fixed 2026-08-15 (#249) — x402 pay-per-call is now advertised at the point of
  refusal. Measure whether it moves.
- **x402 buyers buy utility primitives** (google-search, email-validate,
  keyword-suggest, translate), not the KYB wedge. Follow the money.
- **Distinct-payer count is the deciding datum** — collecting since 2026-08-15
  (`x402_payer_hash`). One payer = concentration risk; many = conversion focus.
- ~98% of traffic is our own test harness. Every revenue/usage number must use
  the canonical internal-account filter.

## Active experiments (M1)

| id | bet | measure | kill criterion |
|---|---|---|---|
| E1 | Advertising x402 at MCP refusal converts arrivals | refusal→x402-call rate, distinct payers | no lift after 14d |
| E2 | Funnel instrumentation reveals the biggest drop | step ratios in weekly rollup | n/a (measurement) |

New experiments enter here with a kill criterion or they don't run.

## Standing constraints

Lawful only, no grey zones (scraping doctrine DEC-20260428-A/DEC-20260813-A).
€50/week external spend. Quality floor and refusal semantics are not trading
material — trust is the product.
