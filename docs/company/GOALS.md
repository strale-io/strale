# Strale Goals — the document every agent reads first

**Reviewed:** 2026-08-15 · next review at each Sunday synthesis · quarterly deep review.

## Mission

The data layer for AI agents: independently tested, audit-logged data sources,
purchasable by agents without human ceremony. Vertical-agnostic; sell what
buyers demonstrate they want.

## The goal that ranks everything

**$2,000/week gross revenue (medium-term).**

**Baseline, measured 2026-08-15 with the canonical external filter:**
**€45.58/week** (last 7d, 641 calls) · €30.02/week (30d average, €128.66 total).
In USD ≈ **$50/week**. The goal is therefore **~40×**, and M1 is **~5×**, not 2.2×.

> An earlier draft of this file said "$115/week". That was a 30-day figure
> relabelled as weekly — caught by cross-provider review 2026-08-15 and
> re-measured against production. Every milestone below is denominated in EUR
> to match the ledger; USD conversion is display-only.

| milestone | proves | bar |
|---|---|---|
| **M1 · €230/wk** | conversion works | two consecutive weeks, **≥5 distinct external payers**, no single payer >60% |
| **M2 · €550/wk** | repeat usage + mix | ≥30% revenue from repeat payers |
| **M3 · €1,100/wk** | scale | new experiments cost < 1 session each |
| **M4 · €1,850/wk** (≈$2,000) | the goal | — |

A revenue number alone never clears a milestone — concentration and repeat
matter more than the total at this size. One wallet buying more is not
conversion.

## What we currently know (update as evidence lands)

- **176 agents/week reach MCP; ~0 converted.** The wall was a web signup form;
  fixed 2026-08-15 (#249) — x402 pay-per-call is now advertised at the point of
  refusal. Measure whether it moves.
- **x402 buyers buy utility primitives** (google-search, email-validate,
  keyword-suggest, translate), not the KYB wedge. Follow the money.
- **Distinct-payer count is not yet measurable.** `x402_payer_hash` shipped
  2026-08-15; as of that date it holds **1 hash / 2 calls / €0.06** — that is
  the age of the instrument, not the size of the customer base. Any dashboard
  reading of "1 payer" before ~2026-08-22 is an artifact. Do not plan on it.
- **`failed_requests` is a partial demand signal.** Verified 2026-08-15: it is
  written only by `/v1/do` (four call sites in `routes/do.ts`), never by the
  x402 route — which is where nearly all revenue is. Catalog work must read
  x402 refusals too, or it will mine demand from the rail nobody pays on.
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
