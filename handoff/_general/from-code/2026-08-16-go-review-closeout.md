# Close-out review of the 2026-08-16 session

**Intent:** run `/go` over everything this session merged to `main`, fix what it
found, and leave nothing half-open.

## What the review was looking at

Roughly twenty PRs landed today: the metrics module, the identity spine, the
retention widening, x402 demand capture, budget-alert rate limiting, the agent
card as a storefront, seller ranking, attribution derivation, and the revenue
heartbeat. All already on `main`. The review ran against a detached worktree at
`C:\tmp\wtgo` so nothing touched the shared checkout.

Two independent passes: a product/UX/founder pass and a technical
(correctness / security / architecture / CTO) pass, run concurrently.

**Result: 5 HIGH, 10 MEDIUM.** All five HIGH fixed, plus six of the MEDIUMs,
in [PR #296](https://github.com/strale-io/strale/pull/296) — merged as
`b19e4a0`.

## The two that mattered

**The storefront was advertising doors that 404.** The agent card listed
anything active and marketplace-eligible. The x402 gateway serves only what is
`x402_enabled` with an active or probation lifecycle — it deliberately refuses
to take money for a service it knows is degraded. Measured against production:
307 capabilities and 98 solutions on the card, 249 and 79 servable. Sixty-six
advertised endpoints returned 404. Separately, every solution was advertised at
the capability path rather than `/x402/v2/solutions/{slug}`, so all 98 would
have 404'd regardless of the first bug.

The second-order effect is the one worth remembering. Every one of those 404s
was written into `failed_requests` as `x402_unknown_slug` — the unmet-demand
signal added this morning. So the card was generating "an agent wanted
something we don't sell" records for services we *do* sell, and a build queue
fed from that table would have been a build queue fed by our own bug.

**Every customer would have lost their history and every audit record at 90
days.** The 90-day sweep is supposed to zero customer payload and keep the
Art. 30 skeleton readable for three years. It set `deleted_at` as well as
`redacted_at` — and `deleted_at` means "the row is logically gone", filtered by
the transaction list, transaction detail, the A2A task lookup, and the
audit-record endpoint behind every shareable audit URL. Under the old selector
that only hit personal-data capabilities. Widening it to every transaction
yesterday made it universal. Audit Trail is a product we sell.

The docstring's claim that the skeleton "survives for the full 1095 days" was
true in the table and false through the API — the only place a customer can
look.

## Why that is a repair and not an incident

A third bug capped the damage. Every drain loop in `data-retention.ts` read
`.rowCount`, a field the postgres-js driver never sets — it reports `.count`.
So the value was always 0, `if (count < BATCH_SIZE) break` fired on the first
iteration, each sweep processed at most one batch, and every counter in the
summary log reported 0 forever. That is precisely the silent-failure shape
DEC-20260504-A was written about, in the file whose own comments cite it.

Fixing `.rowCount` without fixing `deleted_at` would have detonated the second
finding across the whole table. They shipped together.

Migration 0087 clears the flag on rows already hidden. Narrow by construction —
it matches only this sweep's exact signature and cannot touch a user-requested
erasure or the 1095-day hard purge — and it un-hides without un-redacting: no
payload column is written, and a test asserts it.

## The rest

- **The dashboard reported a one-day-old instrument as a 28-day fact** and
  zero-filled unavailable measurements. That is the 2026-08-15 "one paying
  customer" error, reproduced inside the module built to prevent it, in the
  module's only consumer. `payingActors` is now `estimated` while the wallet
  instrument is younger than the window, `returning` is `null` rather than a
  structural zero, and `topShare` divides by *all* external revenue instead of
  the attributed slice — which had been turning "one wallet, plus a lot we
  cannot see" into a confident 100%.
- **The revenue heartbeat could not detect the outage it was built for.** Its
  cadence estimate divided the window by *distinct active days*, which cannot
  return less than ~24 hours, so the alert threshold could never drop below
  ~72. The 21-hour settlement outage named in its own docstring would have
  passed unnoticed, and the 24-hour floor was unreachable dead code. Cadence is
  now the mean gap between calls (~0.5h for the real wallet) and the floor is 6.
- **`scripts/` was never type-checked.** `tsconfig.json` is scoped to `src/**`,
  so every "typecheck clean" reported for the CEO dashboard had examined
  nothing. `tsconfig.scripts.json` now covers the maintained scripts.
- Smaller: the card carried a private un-cached, non-fail-open copy of the
  shared ranker; the ranker claimed to rank solutions but only joined
  capabilities; `customerContentMatches` returned an unparenthesised OR chain
  that inverts any caller's `WHERE`; budget emails were written in raw enum
  values; the heartbeat derived a second incompatible actor-key format; the
  Web3 Assurance card entry was a 300-word description with no callable target.

## Verification

- `tsc` clean on both projects.
- Full suite **1,694 passed / 0 failed**; baseline on `main` was 1,688 / 0.
- Each new regression test was **mutation-checked**: the fix reverted, the test
  confirmed failing, the file restored. 7/7 caught. A test that passes either
  way is not a regression test, and one of them wasn't until it was tightened.
- Six full-suite failures appeared mid-work and were *mine*: the new test file
  imported a route module into a lib test, dragging its module-level state into
  the shared vitest worker. Moved those two cases beside the module they
  exercise. Worth remembering — the failures looked environmental and were not.

## Left open, on purpose

- **127 pre-existing type errors elsewhere in `scripts/`** — dead archive
  scripts, drifted imports, duplicate declarations. Recorded in the new config
  rather than hidden. Widening the glob before fixing them would produce a gate
  that is red on arrival and therefore ignored.
- `recordX402Miss` fires on an unauthenticated, unrate-limited route, so the
  demand signal is writable by anyone. Bounded by the 90-day rule, but it feeds
  build prioritisation.
- `resolveActor()` still has no production consumers — only the SQL half runs.
- Migration 0085's docstring claims a `CONCURRENTLY` index the code does not
  create.

## Post-deploy checks still to run

1. `GET /.well-known/agent-card.json`, POST a paid skill's `x402_endpoint` →
   402 challenge, not 404.
2. `deleted_at IS NOT NULL AND redacted_at IS NOT NULL AND deletion_reason LIKE
   '%retention_purge'` → 0 rows.
3. A customer transaction list returning rows older than 90 days with empty
   payload fields.
4. `GET /v1/verify/{id}` on such a row → `redacted: true`, `broken_links: 0`.
