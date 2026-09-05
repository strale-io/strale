Intent: answer three founder questions about the largest x402 buyer — how much it topped up, whether yesterday's eight capabilities can be activated now, and how the buyer learns they exist — then ship the activation.

## What the buyer did

Topped up **$229.998874 USDC** on Base at 2026-09-05T01:57:47Z (tx
`0xf6018dfbc8949b4e05e0eed1f1b49203839abaf9d17018b20341b22d90cad972`), from
`0x1887fa9e…c3cdd` — the Robinhood hot wallet it has always funded from, its
sixth top-up. It had drained to $0.001 on 09-03 and stopped calling; it resumed
three minutes after the money landed. Balance at 08:35Z was $227.00.

**Not a full recovery yet.** 18 calls / €0.61 in the first seven hours, against a
prior baseline of 150–314 calls and €6–16 per day. Too early to call a trend, but
worth watching: at its historical ~$15/day burn across all its suppliers, $230 is
roughly 15 days of runway.

## Why the eight could not activate themselves

The PR #518 capabilities were onboarded as rows on 2026-09-04 and left dark to
age into `capability-promotion`'s automatic green week. Measured against
production, that was unreachable for two independent reasons:

1. **A fabricated fixture assertion.** Six carry a generated `dependency_health`
   rule asserting a `status` field their output does not contain — the
   "non-null on an optional field" trap. Four of five suites pass, so each sat
   at a permanent **80%** against a 95% bar. It is classified `upstream_changed`
   with medium confidence, which reads like a vendor problem and is not.
   `cve-details` genuinely returns `status` (NVD "Analyzed") so its identical
   check is correct; `usgs-earthquake-search` had already been auto-remediated
   to an empty check list after its **second** failure — the platform self-heals
   this, but only on the second failure, and the other six run once per 24h.
2. **Cadence, not the bar.** Seven are `cost_class = 'free_quota'`, which forces
   a 24h per-suite floor (72h tier C) — ~4.3 results/day against `minTests = 40`,
   so ~10 days, not a week. Two failures at 40 results is exactly 95.0%, on the
   boundary, so one transient blip restarts the wait.

Earliest natural listing was ~09-14 — the end of the buyer's funding window.

## What shipped

`135e556d` (PR #564) — startup-migration block 0112. Clears the fabricated rule
on the six, and lists all eight by moving `lifecycle_state`, `visible` and
`x402_enabled` together. Ledger-guarded, fires once; a later quarantine on real
traffic stands.

**`lifecycle_state` is the load-bearing part.** `/x402/*` filters
`lifecycle_state IN ('active','probation')` and `/v1/capabilities` on
`('active','degraded')`. These rows were `'validating'`, so flipping the two
flags alone would have listed nothing while reporting success. Mutation-tested:
remove that line and the test fails.

Evidence for overriding the gate rather than ignoring it: all eight executors
were run against their live upstreams at 08:35Z — correct data in 273ms–2.0s
with provenance intact (OpenAlex, arXiv, NCBI, Algolia HN, SEC EDGAR, NIST NVD,
USGS). `known_answer` green on all eight. Every upstream free, keyless, official.

Independent read-only review returned PASS with three findings, all fixed before
merge in `7eec1f46`: an untested `deactivation_reason IS NULL` interlock (the
reviewer deleted the clause and the whole suite stayed green — now covered and
mutation-verified), `M055` missing from eleven pre-existing `known_overlaps`
entries (the checker allowlists by column name and never verifies the blocks
list, so an extra writer of an already-flagged column is invisible to it), and a
`rows_affected` mismatch between the BlockResult and the ledger table.

Recorded as **CX-32** on the Codex re-review backlog.

## How the buyer finds out

There is no one to tell — an anonymous wallet running a Deno agent, and the
charter forbids outreach derived from transaction evidence regardless. The only
channel is machine discovery, already wired: once `x402_enabled`, each
capability appears in `/x402/catalog` and `/.well-known/x402.json` and emits an
`extensions.bazaar` block on every 402 challenge. Settlement routes through the
CDP facilitator, so the catalog self-indexes into the CDP Bazaar off organic
traffic. **Activating them is the notification.**

## Pricing — open, deliberately

The eight are at 2–3¢. The platform's modal price for free-upstream
capabilities is 5¢ (85 of them); this buyer's realised average over 3,245 calls
in 30 days is **5.39¢**, and it buys 30¢ and 50¢ items readily. So they are
priced at roughly 40% of what the same buyer already pays for comparable
lookups, on zero marginal cost.

Held low on purpose: cheapest-on-the-rail is a discovery advantage while
displacing an incumbent this wallet already pays for exactly HN and scholarly
lookups ($136 to kadec0). The gap is worth under €1.50/day, underpricing is
reversible and losing the trial is not. **Next session: after ~two weeks of real
traffic, move the ones showing demand to 5¢** (inside the €0.02–€1.00 band, so
platform-acts-alone) and rationalise the arbitrary 2¢/3¢ split within the set.

## Verify next

Block 0112 runs at boot, so the listing takes effect on the next Railway deploy
of `135e556d`. Confirm with `GET /health` for the deployed commit, then that
`/x402/catalog` contains all eight — a clean deploy log is not evidence
(DEC-20260504-C), and Railway failed deploys do not cut over.

## Tooling note

`jq` is not installed on this machine. Two `Monitor` watches piped through it,
emitted nothing and exited 0 — indistinguishable from "still running" — and cost
two 25-minute windows while CI had in fact gone green. Use `gh --jq` (gh embeds
its own) or `node -e`. Silence from a watch is never evidence of state.
