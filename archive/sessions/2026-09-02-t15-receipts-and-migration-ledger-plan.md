---
doc_type: session-plan
authority_scope: none
status: planned
complete: false
phase: M2
authority_active: false
created_at: 2026-09-02
owners:
  - claude-code
review_route: cheaper-model implementation, fresh independent review, orchestrator verification
---

# T15 — Second wave: test receipts and the schema-migration ledger

> Survey ranks 5 and 10 (2026-09-02). Execution record, not project truth.

## A. Test evidence and quality receipts (rank 5)

**Found:** 212 handoffs, 29 citing bare test counts linked to no run;
remediation packages (`docs/remediation/WP*.yaml`) embed evidence as free
text; decision records cite `archive/sessions/audit-output/*` that another
document calls stale; LESSONS F5 has nine incidents of gates that pass on
empty input.

**Structure:** receipts are files, never prose. `archive/receipts/` holds
one JSON file per receipt, `YYYY-MM-DD-<kind>-<topic>.json`, written by the
tool that produced the evidence and never edited: `kind` (test-run |
sweep | audit | check), `produced_by` (script path and commit), `at`,
`inputs` (what was run against), `summary` (counts as numbers), `raw`
(optional path or inline). `scripts/receipts-lib.mjs` +
`scripts/check-receipts.mjs` (`npm run receipts:check`, tests, CI):
schema-validates every receipt; fails when a tracked receipt's blob differs
from the blob at the commit that introduced it (`git log --diff-filter=A`
+ `git rev-parse <sha>:<path>`; immutability is a git fact); fails when an
`evidence:` entry in a decision record, a program track, or a remediation
package names a path that does not exist; warns on handoffs since
2026-09-02 that state a test count with no receipt link (pattern
`\b\d+ tests?\b` without `archive/receipts/`). A writer helper
`scripts/write-receipt.mjs` produces a receipt from a command's JSON
output so the next test run, sweep or check can emit one; the existing
handoff gate's `--json` output becomes the first receipt producer
(`handoff-check` receipts are written only on demand, not per Stop).

**Migration:** no rewriting of history; existing prose evidence stays as
prose. The 29 handoffs are listed in the handoff with their bare counts so a
reader knows they are unbacked.

## B. Data schema and migrations (rank 10)

**Found:** one authority (`apps/api/src/db/schema.ts`) plus boot-time
migration blocks in `apps/api/src/lib/startup-migrations.ts` (5,023 lines,
no block ids); the 2026-08-21 incident: two blocks derived one column and
fought every boot, poisoning 12 fixture baselines per deploy.

**Structure:** a ledger, not a rewrite. `apps/api/src/lib/startup-migrations.ledger.json`
lists every migration block: `id` (stable, assigned now in file order),
`title`, `added` (date from git blame of the block's first line),
`columns_written` (table.column list, extracted where the block's SQL is
a literal; `unknown` otherwise, listed), `sha256` of the block's source
text. A block boundary is the existing function/step delimiter the file
uses (the implementer reads the file and records the delimiter chosen).
`scripts/check-migration-ledger.mjs` (`npm run migrations:check`, tests,
CI): fails when a block's current hash differs from the ledger (append-only:
an edited block needs a new block, not an edit), when a block exists
without a ledger row, when two blocks list the same `columns_written`
(the 2026-08-21 class), and when the ledger names a block that is gone.
`--update` appends rows for new blocks only; it never rewrites an existing
row.

## Shared

Identical paragraph in CLAUDE.md and AGENTS.md (receipts are files under
`archive/receipts/`, cited by path; migration blocks are append-only and
ledgered); inventory regenerated; handoff with counts and every judgement
call (block delimiter choice, blocks with `unknown` columns).

## Exit

- `receipts:check` and `migrations:check` pass on `main` and each planted
  failure mode (edited receipt, dangling evidence path, edited migration
  block, duplicate column writers) fails with a one-line fix.
- The ledger covers every block; the first receipt exists (this batch's own
  test run).

## Out of scope

Re-running old audits to produce receipts; changing any migration; touching
the database.
