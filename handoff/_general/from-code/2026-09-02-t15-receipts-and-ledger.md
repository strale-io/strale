Intent: Implement T15 — evidence receipts (`archive/receipts/`) and the
schema-migration ledger (`apps/api/src/lib/startup-migrations.ledger.json`)
— per the stored plan
(`archive/sessions/2026-09-02-t15-receipts-and-migration-ledger-plan.md`)
and `docs/programs/cto-readiness/tracks.yaml`'s T15 entry.

## Where this landed

Worktree: `C:\Users\pette\Projects\strale-wt-t15`, branch
`feat/receipts-and-ledger`.

- Part A (receipts): `752c5c0d`
- Part B (ledger): `b5022fcb`
- This docs/handoff commit: see the SHA at the end of this session's report.

## Part A — evidence receipts

`archive/receipts/receipt.schema.json` (kind, `produced_by{script,commit}`,
`at`, `inputs`, `summary`, optional `topic`/`raw`), naming rule
`YYYY-MM-DD-<kind>-<topic>.json`. `scripts/receipts-lib.mjs` +
`scripts/check-receipts.mjs` (`npm run receipts:check`, `--json`):

- Schema/filename validation, plus a `RECEIPT_KIND_MISMATCH` check the plan
  didn't explicitly ask for but the naming rule implies (filename `<kind>`
  vs the JSON body's `kind` field must agree).
- `RECEIPT_MUTATED`: for every tracked receipt, the commit that first added
  it (`git log --diff-filter=A --follow --reverse`) vs `HEAD`, compared by
  blob SHA (`git rev-parse <sha>:<path>`), not content — a git fact, exactly
  as specced. An uncommitted new receipt is untracked and never checked.
- `DANGLING_EVIDENCE`: scans `evidence:` in `docs/decisions/records/*.md`
  front matter and in each `docs/programs/<program>/tracks.yaml` track row,
  and `evidence:` / `production_evidence:` at any depth in
  `docs/remediation/packages/WP*.yaml` (both field names occur in this
  repo — `production_evidence` as a map of prose, `evidence` as a scalar or
  list). **Judgement call:** only a whitespace-free string ("looks like a
  path/reference, not a sentence") is checked — `production_evidence`'s
  prose paragraphs are never scanned for embedded `file.ts:172`-style
  citations, since a general prose scanner risks both false positives on
  ordinary text and false confidence about what it caught. This means a
  citation buried in a paragraph (there are some, e.g. WP9's
  `production_evidence` text literally says "jobs/quality-floor.ts:172")
  is out of scope today. `<sha>:<path>` references are verified via `git
  cat-file -e`; `owner/repo@sha[:path]` cross-repo references (two exist
  today, in `DEC-20260822-A` and `DEC-20260901-A`, pointing at
  `strale-io/strale` and `codex/repo-native-operating-model`) are accepted
  without verification since they name a different repository than this
  checkout — this needed its own regex (`CROSS_REPO_REF`) after the first
  pass mis-flagged both as `MISSING` bare paths.
- Warning only: `HANDOFF_BARE_TEST_COUNT` for a
  `handoff/_general/**/*.md` file dated 2026-09-02 or later stating
  `\d+ tests?\b` or `\d+/\d+ pass` with no `archive/receipts/` link. Four
  fire today (T12/T13/T14/T5 close-out handoffs, all dated 2026-09-02,
  all predate this contract existing) — listed, not fixed; they're
  warnings by design, and back-filling receipts for closed work is out of
  this track's scope.
- `scripts/write-receipt.mjs` (`npm run receipt -- --kind --topic --from`):
  fills `produced_by.commit`/`at` from git and the clock;
  `produced_by.script` defaults to itself (`scripts/write-receipt.mjs`) —
  pass `--script <path>` to name the real upstream producer. `inferSummary`
  reads the repo-wide `{ok, failures[], warnings[], ...counts}` shape every
  `check-*.mjs --json` already emits; anything else needs `--summary`
  explicit.
- First receipt:
  `archive/receipts/2026-09-02-test-run-receipts-lib-t15.json` — this
  batch's own `npm run receipts:test` (25/25 pass). Node's default test
  reporter isn't JSON (the plan anticipated this: "if JSON is awkward,
  capture counts into the summary yourself and say so"), so the counts
  were captured by hand into `--summary` and the full test-name list went
  into `raw` for a human to cross-check against the file.

**Planted failures (all in `scripts/receipts.test.mjs`, 25 tests, shown
failing on the bad input and passing on the fix, per LESSONS.md F5):**
filename not matching the naming rule, filename `<kind>` unrecognized,
filename/body `kind` disagreement, malformed JSON, missing required
schema field, unknown top-level field, non-scalar summary value, a
committed receipt edited in a later commit (`RECEIPT_MUTATED`), an
uncommitted new receipt (must NOT be flagged), a decision-record /
program-track / remediation-package evidence entry naming a path that
doesn't exist (three separate plants, one per source), a
`production_evidence` prose paragraph with embedded path-looking text
(must NOT be flagged — the documented scope limit above), a handoff dated
2026-09-02+ with a bare count and no receipt link (must warn), the same
with a receipt link (must not warn), a handoff dated before the cutoff
(must not warn even with a bare count), the pass-ratio pattern
(`58/58 pass`), and `write-receipt.mjs`'s summary inference on both a
readable and an unreadable shape.

## Part B — schema-migration ledger

**Block delimiter chosen, and why:** `export async function
runMigrationNNNN_name(` — the one boundary every block has. 34 of the 54
blocks also carry a `// ─── Block N: ... ───` banner comment (used for
`title`), but 20 don't, so the banner can't be the delimiter; a step array
doesn't exist (`BLOCKS` at line 3951 is the runtime execution order, not a
declaration boundary — see below). A block's *hashed* source text runs from
its own declaration line through the line before the next top-level
declaration of **any** kind (function, const, let, type, interface),
backing up over blank lines, `//` comments, and `/** ... */` JSDoc blocks.

This needed two real fixes during development, both caught by a mechanical
sanity check (every block's last line must be a bare `}` — verified true
for all 54 before trusting the extraction):

1. **First pass only treated function/interface declarations as
   boundaries.** Shared top-level `const`/`interface` data used across
   blocks (`UNCLASSIFIED_ONLY`, `PHASE_B2_FREE_QUOTA_HIGH_CONF` and five
   siblings, `UNPROTECTED_PURGE_CEILING`, and critically the `BLOCKS`
   registry array at line 3951) got glued onto whichever block preceded
   them — worst case, block 0111 (`vendorControlTower`, now M040) hashed
   429 lines that included the entire `BLOCKS` array and swallowed the
   start of the next real block's banner comment. Fixed by adding
   `const`/`let`/`type`/`interface` to the boundary-marker set (they
   bound blocks apart; they are never themselves ledgered).
2. **The backward walk only skipped `//` lines, not `/** */` JSDoc
   blocks**, so a block ending right before a JSDoc-commented shared
   constant (`UNPROTECTED_PURGE_CEILING`, preceded by a 4-line `/** */`
   block) absorbed the constant's declaration as its own last line. Fixed
   by treating any line starting with `//`, `/*`, or `*` as skippable.

**Column extraction** (`columns_written`): literal `ALTER TABLE ... ADD
COLUMN` / `DROP COLUMN`, `UPDATE ... SET col = ...`, `INSERT INTO
table (cols)`, read out of every `sql\`...\`` / `sql.raw(\`...\`)` chunk.
Two more real bugs found and fixed during development (not planted —
found by reviewing the real file's actual output):

- `INSERT INTO x (...) ... ON CONFLICT (...) DO UPDATE SET col = ...`
  upserts (block 0111, twice) matched `UPDATE` immediately followed by
  `SET`, so the naive regex captured the literal word `"SET"` as the table
  name (`SET.dependency_kind` etc.). Fixed by detecting this shape and
  attributing the SET clause to the chunk's own `INSERT INTO` table.
- A `${...}` interpolation used as a **function-call argument**
  (`jsonb_set(col, '{a}', ${JSON.stringify(x)}::jsonb)`, block 0090) was
  first flagged as a dynamic *column name* because the dynamic-content
  check ran on the raw SET clause instead of the paren-stripped one. Fixed
  by checking only the flattened (parens-removed) text.

**Blocks with `unknown` columns: zero.** Every block's SQL in this file
happens to be literal at the column-name level (dynamic interpolation is
always in a value position: constraint definitions, JSON payloads,
`WHERE`-clause values). `["unknown"]` is implemented and covered by tests
(`apps/api/scripts/migration-ledger.test.mjs`) but never actually fires on
`main` today.

**54 blocks, `M001`–`M054`, assigned in file order** (which is *not* the
same as `runMigrationNNNN` numeric order or chronological order — block
`0081_attribution` sits in the file *after* `0111_vendorControlTower`,
so `M040` (0111, dated 2026-08-25) has a lower id than `M041` (0081, dated
2026-08-13) despite `0081`'s lower migration number implying it's older —
it's a later attribution-tracking addition than the file's numbering
suggests).
Dates (`added`) are the oldest commit's `%cs` from `git log -L
<line>,<line>:<path>` on the block's declaration line — run once during
ledger generation, never in the normal `migrations:check` path (so CI
never shells out to `git log -L`).

**25 real `known_overlaps` found on the first `migrations:check` run
against the real file** (not a fixture — see the raw findings in this
session's tool output; not re-captured as a receipt because it was a
diagnostic step, not a test run or audit in the receipt-contract sense).
Two categories, allowlisted in the ledger with per-column notes:

1. **Append-only tables** (`health_monitor_events.*`, 2 blocks;
   `startup_migration_ledger.*` — an existing runtime DB table used as a
   per-block idempotency marker, unrelated to *this* ledger despite the
   name collision — 4 blocks): every writer is a guarded `INSERT` of a
   *new* row, never an overwrite of another block's row. Verified by
   reading the code (both `health_monitor_events` inserts are behind
   `if (affected > 0)`; every `startup_migration_ledger` insert is
   `ON CONFLICT (block) DO NOTHING` keyed on a unique block string).
   High confidence.
2. **Classification/consolidation columns** (`capabilities.cost_class`
   and 4 siblings, `test_suites.external_cost_cents` and 6 siblings,
   `solutions.*`, `capabilities.visible`/`x402_enabled`/
   `deactivation_reason`): 17 columns total. **Judgement call, not a full
   verification.** Spot-checked a sample (the `0066`/`0069` pair has an
   explicit source comment — "Block 0069 owns every classified
   capability; see UNCLASSIFIED_ONLY's comment for why the two must not
   overlap" — and the block 0111 `INSERT INTO test_suites (...
   scheduled_testing_eligible ...)` fixture rows are `WHERE NOT EXISTS`
   guarded new rows, not updates to 0066/0069's rows) and found every
   sampled writer either `WHERE`-guarded to a disjoint row-set or
   inserting brand-new rows. Did **not** individually verify all 23 columns'
   full writer sets — that's real work worth doing separately, flagged
   here rather than silently assumed. The mechanical extractor also
   cannot distinguish "UPDATE of an existing row" from "INSERT of a new
   row with this column in its VALUES/SELECT list" — both count as
   "written," which is part of why this needs a human pass rather than an
   automated resolution.

**Planted failures (`apps/api/scripts/migration-ledger.test.mjs`, 17
tests):** block-boundary parsing against a synthetic two-block fixture
carrying a shared const glued between the blocks and a trailing helper
function (the exact shape class that broke the first real-file pass);
every extraction SQL shape (`ALTER ADD COLUMN`, `UPDATE SET`,
`INSERT INTO (...)`, the `DO UPDATE SET` upsert attribution, a
function-argument interpolation that must NOT trip `unknown`, a
column-name interpolation that MUST trip `unknown`, and DDL with no
column write at all); and all four `checkLedger` findings
(`LEDGER_MISSING`, `BLOCK_HASH_MISMATCH`, `UNLEDGERED_BLOCK`,
`LEDGER_BLOCK_GONE`, `DUPLICATE_COLUMN_WRITER` with and without a
`known_overlaps` entry, and confirmation that two `["unknown"]` blocks
never collide with each other). The real file itself supplied an
additional non-fixture demonstration: `migrations:check` failed with 25
`DUPLICATE_COLUMN_WRITER` findings before `known_overlaps` was populated,
and passes cleanly after — recorded in this session's transcript rather
than re-run into a receipt (would need a fixture rebuild to reproduce
safely without touching the real ledger file).

`--update` is append-only by construction (only pushes rows for functions
not already in `ledger.blocks`; never touches `known_overlaps`) and
verified idempotent: running it twice on an up-to-date ledger produces a
byte-identical file (`sha256sum` compared before/after).

## Judgement calls, summarized

1. Boundary set extended to `const`/`let`/`type`/`interface`, not just
   functions — required for correctness, found by the "every block ends
   in `}`" sanity check rather than by inspection alone.
2. `DANGLING_EVIDENCE` only checks whitespace-free strings, not prose —
   scope limit documented above and in `archive/receipts/README.md`.
3. `known_overlaps` for the 23 classification/consolidation columns is a
   day-one allowlist from a spot-check, not an exhaustive proof. Recorded
   per-entry in the ledger's `note` field, not just here.
4. `write-receipt.mjs`'s `produced_by.script` defaults to itself rather
   than trying to infer the true upstream producer from `--from`'s path —
   simpler and honest; `--script` is there when it matters.
5. This session's own diagnostic runs (the 25-overlap discovery, the
   git-log timing check) were not turned into receipts — they're
   exploratory steps during implementation, not the kind of "test-run /
   sweep / audit / check" evidence the contract is for. Only the actual
   `receipts:test` run became a receipt, per the plan's explicit
   instruction ("Write the first receipt from this batch's own
   `receipts:test` JSON output").

## Verification run this session

`npm run typecheck` (after building `packages/mcp-server` and
`packages/sdk-typescript`, which had no `dist/` in this fresh worktree —
pre-existing, unrelated to this track; see CLAUDE.md's "Worktree
node_modules Hazard"), `programs:test`, `programs:check`, `context:test`
(`node scripts/check-project-context.mjs --json` → zero findings),
`docs:check`/`docs:test`, `archive:index -- --check`/`archive:index:test`,
`research:check`/`research:test`, `design:check`/`design:test`,
`env:check`/`env:test`, `models:check`/`models:test`,
`claims:check`/`claims:test`, `receipts:check`/`receipts:test`,
`migrations:check`/`migrations:test` — all green.

`node scripts/handoff/handoff-check.mjs --no-fetch` — run after this file
and the final index regeneration; see the session report for the result.

## Not done / explicitly out of scope

No migration was changed (per the plan's "Out of scope"). `tracks.yaml`
was not edited (per this task's instruction) — T15 stays `active` there
for whoever closes it out. The 4 pre-existing `HANDOFF_BARE_TEST_COUNT`
warnings (T12/T13/T14/T5 closeout handoffs) were not back-filled with
receipts.
