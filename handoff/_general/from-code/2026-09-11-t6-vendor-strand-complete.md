Intent: continue T6 (M3 repo-native workflows) as architect and reviewer, delegating implementation to Sonnet workers; this session finished the vendor-state strand and planned the rest of M3.

# T6: vendor strand complete, M3 remainder planned

**Date:** 2026-09-11
**Track:** T6 in `docs/programs/cto-readiness/tracks.yaml` (status active). Its `next_action` is the resume point; this file is the narrative behind it.

## What landed (all shadow mode, no production write, no authority change)

| PR | What |
|---|---|
| #632 | Vendor-state model designed (`docs/strategy/2026-09-10-m3-vendor-state-model.md`) and the migration checkpoint refreshed to point at the program register |
| #634 | `config/vendors.yaml` register, schema and `vendors:check` / `vendors:test` in CI |
| #635 | Batch 4 rescoped to report-only checks; the dependency-edge premise corrected |
| #636 | Stale, rejected and deferred vendors registered; report of providers the boot-time dependency sync skips |
| #637 | Report-only Notion roster versus register comparison in the weekly drift check, loaded lazily so it cannot break the existing check |
| #638 | Inventory of everything M3 still requires beyond vendor state, with a seven-batch sequence (`archive/sessions/2026-09-11-m3-remaining-scope-inventory.md`) |
| #639 | Vendor strand finished: public vendor list checked against the register, generated inactive agent view `docs/project/VENDORS.md`, inactive vendor-switch step 5 draft |

Every PR had an independent same-provider review in a separate context; each failed at least once, and every finding was fixed before merge. `vendors:check`, `vendors:test`, `context:check`, `programs:check` and `codex:check` exit 0 on `main` after #639.

## Findings the next session needs

- **The digest runs without the repository.** `strale-digest-cron` runs from the API Docker image, which copies only `apps/api`, two packages and `manifests`. Repository documents do not exist at runtime, so the inventory's batch 2 as written (a reader wired into `gatherDigestData()`) would be silently hollow. Decision recorded in T6's `next_action`: M3 digest readers are pure functions over a checkout, shadow-run by a scheduled GitHub Actions job; the production data path is an M4 question.
- **Operational report, not yet acted on.** `vendors:check` warns `DEPENDENCY_SYNC_SKIPPED` for providers whose failure suspends nothing (free-tier providers and three paid ones without a seeded account row: cobalt-intelligence, einsearch, sec-api-io). Changing that is a runtime change and belongs to M4 or a separate decision.
- **Three coverage-matrix rows carry stale provider labels** (ES names Openapi.com; both beneficial-ownership rows name OpenOwnership). A separate task was offered to correct them.
- **Two retired vendors are missing from `STALE_VENDORS`** (publicnode, opensanctions); closing that edits `platform-facts.ts` and waits for M4.

## Process lessons saved to memory

Re-derive a fact register when `main` moves during its review; a surface's label is not evidence of use (check the host the executor calls); a worker notification that says it is waiting is not a finished worker.

## Next

Batch 2 of the inventory's sequence, as corrected in T6's `next_action`.
