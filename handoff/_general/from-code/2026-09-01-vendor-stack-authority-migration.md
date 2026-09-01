Intent: Reconcile the April 2026 vendor-stack decision chain into the inactive repo-native authority system and make separate Codex review the persistent verification route for Codex-authored work.

## Outcome

- Merged [PR #473](https://github.com/strale-io/strale/pull/473) as
  `ffcd1c02f278037d73ecb61d16b902ebad42cc09`.
- Added inactive candidate records for `DEC-20260427-A`,
  `DEC-20260427-B`, `DEC-20260429-A`, and `DEC-20260430-A`.
- Preserved the April source corrections and explicitly documented four
  source defects, including the mistaken `DEC-20260427-A`/`B` identity and
  the unresolved `DEC-20260420-K` collision.
- Separated four kinds of evidence that had been conflated: Decisions and
  rationale, runtime vendor facts, Vendor Control Tower/account usability,
  and historical commercial research.
- Persisted Petter's 2026-09-01 instruction that Codex must not request
  Claude second opinions or reviews. Critical Codex-authored work now uses a
  fresh separate Codex reviewer; the old Claude backlog is retained only as
  historical evidence and marked retired.
- A fresh `gpt-5.6-sol` reviewer independently checked exact commit
  `0c40317c` against live Notion sources and returned PASS with no material
  findings.
- CI passed both required jobs (`check` and `integration-db`). Local context
  verification passed 54/54 tests, produced zero checker findings, and was
  reproducible.

## Open

- M3 should define bounded schemas and refresh rules for current runtime
  vendor facts and operator-only vendor/account state.
- M4 should cut entrypoints over only after those current-state surfaces are
  populated, reviewed, and demonstrably fresher than the dated Vendor Stack
  page.
- `DEC-20260420-K` remains blocked by an unresolved historical ID collision.
  `DEC-20260422-H` remains unique but unmigrated; neither was converted into
  an invented graph edge.
- No founder action is required now. These are roadmap items for subsequent
  repo-native migration batches.

## Non-obvious learnings

- The April Vendor Stack page is useful historical synthesis but is not a
  safe current-state authority because amendments, correction entries,
  runtime facts, and account readiness changed independently.
- `DEC-20260427-A` is the adverse-media disclosure decision;
  `DEC-20260427-B` is the Dilisense/OpenSanctions launch-vendor decision.
  Later Notion text that labels `A` as the OpenSanctions decision is wrong.
- The repository's decision schema intentionally prevents unrelated active
  records from sharing a topic. The launch-vendor choice and later
  self-hosting deferral therefore use distinct topics rather than an
  unsupported relationship.
- The close-check completed with one expected yellow warning because its
  first run occurred on the already-merged implementation branch. It found
  zero red findings.

## Cost

€0 external spend.
