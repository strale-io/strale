# Post-deploy verification of the close-out review

**Intent:** run the four post-deploy checks the close-out review left open, and
act on whatever they showed.

Companion to `2026-08-16-go-review-closeout.md`, which listed these four as
outstanding. They have now run against production.

## The four checks passed

Verified against `9782fa7`, which contains `b19e4a0` (PR #296).

| check | result |
|---|---|
| advertised endpoints answer, not 404 | **13/13 sampled return a 402 payment challenge** — 8 capabilities, 5 solutions. The card advertises 328 payable endpoints and marks 69 paid entries API-key-only. **0 solution endpoints on the wrong path**; all 98 were wrong before. |
| no row still hidden by the content sweep | **0.** Migration 0087 ran. The single genuine right-to-erasure row is correctly still hidden. |
| redacted rows visible and emptied | **242,037 redacted · 242,037 visible to their owner · 0 with payload remaining · skeleton intact on all · 204,086 chain-hashed.** |
| chain verifies across redactions | live `GET /v1/verify/{id}`: `verified: true`, `redacted: true`, **`broken_links: 0`**, 19 redacted links all bucketed as retention rather than "other". |

## And then production contradicted the code three times — PR #299

**The demand table was still filling with things we already sell.** 202 misses
in 24 hours, and every missed slug was a real capability or solution of ours.
The callers are third-party discovery crawlers — `hermes-contact-discovery`,
`402explorer`, `x402-observer`, `vale-census-probe`, `entropy-daemon-trust-oracle`
— walking our public catalogue, which lists everything regardless of payment
rail, and probing each slug on x402. Filed as `x402_unknown_slug`, that reads as
overwhelming demand for capabilities we already sell, and a build queue reading
the table would have been steered by a crawler's enumeration order.

Fixing the agent card removed *our* contribution to that table and exposed a
larger one underneath. New kind `x402_not_on_rail` — we sell it, just not for
USDC. A pricing signal, not a build request. The lookup is cached (this is an
unauthenticated route crawlers hammer) and fails toward "probably known",
because a misfiled miss is the harm being fixed.

**A public integrity endpoint was contradicting itself.** Renaming the 90-day
sweep's reason in #296 updated the structured tally and left the prose mapper
behind, so a live `/v1/verify` response carried
`deletion_reason: "content_retention_purge"` beside *"deletion_reason unknown —
flagged for operator review"*.

**The DEC-20260504-B audit was wrong by sixtyfold.** It predicted 3,032 rows;
the first sweep after the `.count` fix redacted **173,000** in a day, with
~8,000 still queued. The contradiction was visible before merge — the
*narrower* selector had been audited at 57,345, and a widened selector is a
strict superset — and the review flagged it. It went through because the
smaller number was the convenient one. `MAX_BATCHES_PER_RUN` is the only reason
it was survivable. The docstring now records what happened rather than what was
predicted.

## Verified after #299 deployed (`f6413ba`)

Measured from the first `x402_not_on_rail` row (13:30:31Z) so pre-deploy rows
cannot contaminate the result:

```
misses since the marker:   x402_not_on_rail  2  (kyb-essentials-at)
                           x402_unknown_slug 0
unknown-slug rows naming something we sell:  0   (previously: all of them)
```

**Read this honestly: two rows over a few minutes.** The mechanism is confirmed
live and classifying correctly. It is not yet a measurement that the 202/day
problem is solved — crawler traffic arrives in bursts of ~40 per quarter-hour,
so the morning check-in is the first read with enough data to mean anything.

Retention backlog 8,105, up marginally from 8,033. Expected: rows cross the
90-day boundary continuously and the sweep is weekly. Draining, not
accumulating.

## Open

- **Confirm the demand split over a full day** at the next check-in. Anything
  still filed as `x402_unknown_slug` after that is a genuine catalogue gap and
  worth reading as real demand — which is the whole point of the table.
- Everything else from the close-out review's "left open" list stands
  unchanged: 127 pre-existing type errors elsewhere in `scripts/`, the
  unauthenticated write path into `failed_requests`, `resolveActor()` with no
  production consumers, migration 0085's `CONCURRENTLY` docstring.
- Repo hygiene, pre-existing and not from this session: ~40 stale local
  branches carrying commits not on `main`. Worth one sweep to work out which
  are abandoned.

## The learning worth keeping

**Every one of these bugs was invisible to the gate meant to catch it.**
Typecheck passed because the dashboard was outside the config's glob. The
retention audit passed because the convenient number was chosen over the
contradictory one. The card looked right because nothing compared it against
the gateway that serves it. The demand table looked like a signal because
nothing asked who was writing to it.

The post-deploy checks found three real defects *after* a clean merge with a
green suite and a mutation-verified test batch. **The merge is the middle of
the verification, not the end of it.** Run the checks even when — especially
when — everything upstream of them was green.
