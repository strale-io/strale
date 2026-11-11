Intent: Strale master checkpoint (account 1fg), 2026-11-11 about 02:00 Swedish time, written before the fleet's 300k auto-compact window takes effect (wow-core#288).

Session: session_01RFNL6WAcqYWJKtyJRfBGCw (the Strale master, launched by the wow-core takeover session_01RFNL6TsX8ERmFj7FDhHjAF). Codex dispatcher: session_01RFNL6Woeo8gui2dFw3uKci; send it the bare slug only. No Codex slug is in flight.

After a compaction: re-read this file and the `Resume here` lines of the open PRs below before acting.

## Shipped and verified live since the 2026-11-09 checkpoint

| PR | Change |
|---|---|
| #983 | backfill with discover on keeps the reviewed manifest fields (6797b681) |
| #984 | 2026-11-09 checkpoint |
| #1001 | robustness T1: url-to-markdown exit receipt and jsdom bounds sweep (f99becfb) |

image-resize backfill: done; Petter's rerun with discover off succeeded.

## In flight

- **#1002**, production-watch known failures (`scripts/production-watch/known-failures.json`, entry `ingest-ee-directors` until 2026-12-11, issue #856).
  - **State:** in the merge queue at head 4cf14e3c, CI green, independent review GO.
  - **Resume:** confirm `/health` shows its merge commit and that the next scheduled production-watch run is green; then `git worktree remove /home/user/strale-wt-pw` and delete the local branch `codex/production-watch-known-failures`.
- **#1003**, NTA XML shape bound before jsdom (`apps/api/src/lib/nta-corporate.ts`: depth 8, elements 5000, nodes 5000, attributes 64).
  - **State:** in the merge queue at head dbe0fe40, CI green, independent review GO after the attribute and node caps were added.
  - **Resume:** confirm `/health` shows its merge commit; remove `/home/user/strale-wt-nta` and the local branch `codex/nta-xml-shape-bound`; then update robustness T1 `next_action` in `docs/programs/robustness/tracks.yaml` with the after-timings from `docs/lanes/codex/nta-xml-shape-bound-report.md`. That closes T1's jsdom exit condition.
- **Safety-net check-in:** `trig_01RJqdRjVQZ8cWuEZgkg8UEY`, 02:39 Swedish time. It starts with the lease check. Delete it once both PRs are verified live.

## Next

1. **Robustness T1 remainder:** per-caller converter fairness.
2. **image-resize:** add `format: guaranteed` to `manifests/image-resize.yaml` and its `output_schema`, then sync from the PC with `sync-manifest-canonical-to-db.ts image-resize --fields output_field_reliability,output_schema` (needs production database access).
3. **T3** items (1), (2) and (4).
4. **T4:** container-track (delist or Petter registers for the official APIs, decided from the 30-day paid volume); DQ-41 invoice-counterparty-check promotion (Petter); DQ-48 customs-duty-lookup A2M terms.

## Waiting on Petter at the PC

- Haiku 5.5 model comparison.
- Database-backed validate and smoke runs for domain-age-check, exchange-rate, currency-convert, forex-history and image-to-text.
- The npm, PyPI, directory and Zapier asks.
- Better Stack sign-up and variables.

## Out of scope for this session

Revenue, website and customs-duty work belong to Petter's PC Codex lane.
