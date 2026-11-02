Intent: deliver the Serper renewal report the archived `fix-serper-goto-links-br` lane owed by 2026-11-06, now owned by the orchestrator.

# Serper renewal: cost at observed volume, need past 11-08, and /resolve

Petter assigned this to the orchestrator on 2026-11-01. The decision itself is
**DQ-44** in `docs/company/DECISION-QUEUE.md`, updated in this change.

## Numbers (confidence in brackets)

- **Price:** $50 ex VAT for 50,000 credits, the smallest tier; every tier
  expires after six months (serper.dev, read 2026-10-31). The 2026-05-08
  purchase was charged $62.50 through Paddle = $50 + 25 % VAT. So renewal is
  **about $62.50, ~$10.40 a month** (high).
- **Burn:** 47,497 of 50,000 left on 2026-10-31 (Serper account endpoint, per
  DQ-44), so ~2,500 credits in ~176 days, **~430 a month, ~5 % of a pack**
  (high). Recorded served calls in the same window were 4,756, more than the
  credits used, which fits harness calls on fixtures and unbilled failures; it
  does not contradict `call-cost.ts`'s one-credit-per-call assumption
  (moderate). The repair handoff's "10× under-costing" inference was already
  retracted in DQ-44.
- **Volume:** 235 recorded calls in October across the eight tools, 16 of them
  from outside buyers (from the 10-31 handoff; not refreshed — this session's
  production read was refused by its permission classifier).

## Past 8 November

Seven listed tools stop entirely without the key; `adverse-media-check` loses
its fallback behind Dilisense. Nothing else in the code reads
`SERPER_API_KEY` beyond health/credential plumbing. If it lapses, the seven
should be taken off sale on 11-08 rather than left to fail.

Recommendation stands: renew. Longer term: DataForSEO's $50 balance never
expires (docs/research/2026-10-26-serp-vendor-replacement.md) and would last
years at this volume, but its resale permission is unasked.

The `serper-credit-rollover` OUTBOX row is still `draft`: only the local
inbox session can send it, and it must go before 11-06 to matter.

## /resolve and a funded verification key — kept out of DQ-44

What is verified: the domain repair (live, via `displayedLink`), and the
`/resolve` contract (four direct calls to Serper, 0 credits). What is not:
Strale's own production call to `/resolve`. Worst case if it is broken, the
URL-returning tools return `url: null` with a flag — honest, not wrong — so
the renewal choice does not depend on it.

A funded verification key does not belong in DQ-44: it is a platform-wide
question (end-to-end checks of any paid tool), and a spending production key
does not fit DEC-20261027-C's read- or test-tier rule for Bitwarden.

Zero-spend route, preferred: today `/resolve` leaves **no persistent trace** —
`recordVendorCost` returns early on 0 units (`call-cost.ts`) and
`recordVendorUsage` ignores units ≤ 0. Recording its outcome (success/failure,
counts only, no content) somewhere `strale_verify` can read would let real
traffic (google-search: 183 calls in October) prove the path for free.
That is the orchestrator's next technical task.
