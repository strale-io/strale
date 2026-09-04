Intent: land T10 (M2 exit-gap closure) batch 9, six trust-and-quality-display Decision rows (DEC-20260305-G trust display system rules, DEC-20260306-D metric display consistency, DEC-20260313-C 'Unverified' SQS state, DEC-20260316-A eliminate the Combined Trust Grade, DEC-20260316-B SQS display hierarchy, DEC-20260323-A one score everywhere via DB columns) as active formal candidate records, contradiction-checked against the live trust surface (`apps/api/src/routes/public-trust.ts`, `apps/api/src/lib/trust-grade.ts`, `apps/api/src/db/schema.ts`, `apps/api/src/lib/test-runner.ts`, `apps/api/src/lib/lifecycle.ts`), with the register's counts and digests made true again against the private archive.

## What this batch is

Six rows resolved from the private projection at archive commit
`ab1be15fa3f7979b0c03bd70e73d0a2b4d23c764` (121 rows, the commit recorded
in the register at launch time). All six matched exactly on `id` in the
private file: `historical_status: active`, `historical_scope: global`,
`disposition: not_yet_reconciled`, and their `title_sha256`/`decided_at`
values matched the brief's page-id table exactly (all six title hashes
recomputed independently from the raw Notion export text and verified
equal to the private projection's `title_sha256`). None collided
(`docs/decisions/id-collisions.yaml` has no entry for any of the six
ids), none was a Git-native protocol label (`gitNativeClaims` parses
`CLAUDE.md`/`AGENTS.md` "Protocol (DEC-...)" headers only; none of these
six match that pattern), none had an existing record (`ls
docs/decisions/records/DEC-2026{0305-G,0306-D,0313-C,0316-A,0316-B,0323-A}.md`
all "no such file"). Each is now a formal candidate record under
`docs/decisions/records/`, five protected sections (Decision, Context,
Rationale, Consequences, Reversal conditions), scope `product` for the
five display/positioning rows (DEC-20260305-G, DEC-20260306-D,
DEC-20260313-C, DEC-20260316-A, DEC-20260316-B) and scope `technical` for
DEC-20260323-A (the data-path decision), per the brief's classification.
`owner: petter`, `authority_scope: none`, `authority_active: false`,
`migration_status: candidate`, `phase: M2`.

Full Notion content (`Decision`, `Rationale`, `Outcome`, `Scope`,
`Confidence`, `Source`) was read read-only from
`strale-io/strale-context-archive` at commit `995cece3` (the same commit
batches 4 through 8 used), matching each row by page id with dashes
stripped against the four `decisions-rows*.json` export files (fetched via
`git show <commit>:<path>` into a local read-only checkout at
`C:/Users/pette/Projects/strale-context-archive`, never modified or
committed there). All six page ids resolved to exactly one row each; no
other row's content was read into any of the six records. Five of the six
(DEC-20260306-D, DEC-20260313-C, DEC-20260316-A, DEC-20260316-B,
DEC-20260323-A) had an empty `Outcome` field in the export; only
DEC-20260305-G had a non-empty `Outcome`. All five of those five also had
`Reviewed: __NO__` in the export, versus DEC-20260305-G's `__YES__`;
`DEC-20260306-D`'s record's Context section states this explicitly since
its Rationale otherwise reads as a completed audit despite the unreviewed
flag, the other four records do not restate the flag since nothing in
their own text implies review happened.

## Per-record fidelity: what was kept, what was compressed

- **DEC-20260305-G** (trust display system rules): kept the "4 rules...
  across 9 files" count, the "8 inline calculations" count, the exact
  severity vocabulary (healthy/minor_issue/degraded/unhealthy), the named
  components (`TrustBarChart`, `calculatePassRate`, `QualitySeverity`,
  `SEVERITY_LABELS`), and the full Outcome text ("Shipped. TrustBarChart
  extracted as standalone...5-tier descriptive phrases") verbatim.
  Compressed nothing substantive.
- **DEC-20260306-D** (metric display consistency): kept all six numbered
  issues verbatim, including the 12/12 vs 36/36 count mismatch, the 95/80
  vs 90/70 threshold mismatch, and the specific helper-function renames
  (`formatDuration()`, `formatLastTested()`).
- **DEC-20260313-C** ('Unverified' SQS state): kept the "Building track
  record" contrast, the three named rationale strands (honesty, market
  incentive, no removal of working functionality) verbatim.
- **DEC-20260316-A** (eliminate Combined Trust Grade): kept the
  "issuer rating" framing, the ChatGPT/Claude evaluation claim, and the
  `require_fresh`/`max_latency_ms` filter-parameter names verbatim.
- **DEC-20260316-B** (SQS display hierarchy): kept the S&P/BRP/FRP analogy,
  the top-left/bottom-left placement rule, and the "never mixed inline"
  vocabulary-boundary rule verbatim.
- **DEC-20260323-A** (DB columns, write-time decay): kept the "20
  inconsistencies (2 critical)" and "4 different data paths" counts, all
  six named columns (`matrix_sqs`, `matrix_sqs_raw`, `trend`,
  `freshness_level`, `last_tested_at`, `freshness_decayed_at`), the "16
  endpoints" figure, and the `persistDualProfileScores()`/2-hour
  staleness-refresh-job writer claim verbatim.

## Contradictions found and how they are stated

All stated as dated "status on 2026-09-04" notes in each record's
Consequences section, never editing the Decision/Rationale/Outcome text:

1. **The SQS engine every one of these six rows displays or governs was
   deleted (all six records).** Per DEC-20260503-B (PR1 shipped
   2026-05-05; CLAUDE.md: "SQS scoring engine deleted"), the dual-profile
   QP/RP model, the 5x5 matrix, `min_sqs`, `/v1/quality/:slug`, the trend
   and guidance columns, and the automatic lifecycle transitions are gone.
   Every one of these six rows describes how to display or serve that
   engine's output; the engine no longer computes anything live.
2. **A narrower successor surface, `/v1/public/ops/trust/*`, exists and
   independently reaffirms several of these rows' principles under new
   names (DEC-20260305-G, DEC-20260306-D, DEC-20260313-C, DEC-20260316-A).**
   `apps/api/src/routes/public-trust.ts` exists on `main`. Its own header
   comment explains why it exists: the published `strale-mcp` package had
   silently reported "0 cap trust, 0 sol trust" for ~3.5 months because a
   deleted `/v1/internal/trust/*` route answered 401 (admin wall) instead
   of 404. Its field set (`badge`, `badge_label`, `tested`,
   `last_tested_at`, `pass_rate`) is deliberately narrow; its own comment
   states "The retired SQS grades, guidance strategy, and raw sub-scores
   are deliberately NOT projected... reviving them here would recreate a
   scoring surface the platform decided to stop publishing" — this
   independently reaffirms DEC-20260316-A's "one headline signal"
   principle and DEC-20260313-C's "still listed, signal absent rather
   than faked" principle, without either row's original mechanism.
3. **`computeTrustGrade` (a worst-of A-D roll-up, structurally the exact
   thing DEC-20260316-A eliminates) still exists as dead code in
   `apps/api/src/lib/trust-grade.ts`, under a section literally titled
   "Combined Trust Grade" (DEC-20260316-A).** A repository-wide grep for
   `computeTrustGrade` across `apps/api/src` finds zero call sites outside
   `trust-grade.ts` itself. `apps/api/src/routes/do.ts`, the only importer
   of anything from that file, imports only `computeFreshnessGrade` (the
   freshness component the row explicitly permits to survive as
   descriptive metadata), never `computeTrustGrade`. No field named
   `trust_grade` or `combined_trust_grade` appears in any route response
   (grepped case-insensitively). Stated plainly in the record: the rule
   holds in practice (nothing surfaces the grade) but the function itself
   was never deleted, flagged as a latent risk in the record's Reversal
   conditions.
4. **`persistDualProfileScores`, the writer DEC-20260323-A names as one of
   exactly two, was itself deleted with the SQS engine (DEC-20260323-A).**
   `apps/api/src/lib/test-runner.ts` states this directly in its own
   "Removed" section, naming `persistDualProfileScores` explicitly as
   retired with DEC-20260503-B. There is therefore no writer left for the
   `matrix_sqs`/`qp_score`/`rp_score` columns this row names — not
   "write-time decay only," but no computation running for those columns
   at all.
5. **The named residual columns still exist on `main`, unpopulated
   (DEC-20260323-A, DEC-20260316-B).** `apps/api/src/db/schema.ts` still
   declares `qp_score`, `rp_score`, `matrix_sqs`, `matrix_sqs_raw`,
   `trend`, the `guidance_*` columns, and the `sqs_daily_snapshot` table,
   confirmed against CLAUDE.md's own statement that "PR2 will drop the
   residual schema columns." A repository-wide search for `legacy_score`
   (the field DEC-20260323-A says the legacy composite model is retained
   under) finds zero matches on `main` — that field does not exist under
   that name.
6. **`capability_health` has not yet been renamed to `source_health`
   (DEC-20260323-A).** `apps/api/src/db/schema.ts` still declares the
   `capability_health` table; `apps/api/src/lib/lifecycle.ts`'s own
   comment treats `source_health` as a not-yet-built future substrate
   ("A future per-product routing engine may reintroduce automatic
   transitions keyed on `source_health.status` once that substrate
   exists"). A grep for `source_health` in `schema.ts` finds no match.
7. **No literal "Unverified" SQS label exists in trust-surface code today
   (DEC-20260313-C).** A case-insensitive repository search across
   `apps/api/src` for "Unverified" tied to a trust/quality display path
   finds no match; the closest living equivalent is `public-trust.ts`'s
   `tested: boolean` field paired with a nullable `pass_rate`.
8. **No frontend layout code for the card hierarchy DEC-20260316-B
   describes exists in this repository; `apps/web` (the DEC-20260902-A
   redesign target) does not yet exist on `main`.** `ls apps/` on `main`
   as of 2026-09-04 lists only `api`. This is stated plainly in the record
   rather than verified against a layout that does not exist yet; the
   sibling `strale-frontend` repository, where the original components
   may have lived, is out of scope and named only in prose, per the
   brief's constraint.
9. **The wire-shape rule for `/v1/public/ops/trust/*` endpoints postdates
   every one of these six rows (all six records).** CLAUDE.md's rule
   (money as integer cents, scores as 0-100 integers or 0-1 decimals,
   dates as ISO 8601, no pre-formatted display strings) was adopted after
   a 2026-04-30 cert-audit finding, weeks to roughly six weeks after these
   rows, and now governs the operative shape of whatever trust surface
   exists.

None of these change a Decision's recorded meaning, so none required a
STOP; all are within the fidelity-and-contradiction-surfacing mandate.

## Relations: none added

None of the six rows' extracted Notion text (Decision, Rationale, Outcome,
Source) names another `DEC-2026...` id string anywhere, checked by literal
string search over each field, including across the six rows themselves
(DEC-20260316-A and DEC-20260316-B are decided the same day and are
conceptually companion decisions — the Combined Trust Grade and the SQS
display hierarchy — but neither's extracted text names the other's id
string). Per the brief's relation rules (edges only where source-stated),
no `relations` entries were added on any of the six records; all carry
`relations: []`.

## Register changes

Targeted string edits only, per batch 4-8 method:

- Six new rows appended to `decision_rows` (the public array), shape
  matching existing `formally_migrated` rows: `page_id`, `id`,
  `title_sha256` copied verbatim from the private projection,
  `historical_status: active`, `source_url`, `record_key`, `disposition:
  formally_migrated`, `evidence: [docs/decisions/records/DEC-....md]`,
  the standard rationale string ("Formal candidate record exists with the
  same historical ID and cites this source row."), inserted sorted by
  `page_id` immediately before `private_rows:` (batch 8's insertion
  point).
- `formal_records` += six `notion-row` entries (appended after
  `DEC-20260411-B`, the prior tail).
- `sources.formal_records.record_count`: 56 -> 62.
- `counts.decision_rows.formally_migrated`: 49 -> 55.
- `counts.decision_rows.not_yet_reconciled`: 110 -> 104.
- `digests.public_rows.count`: 197 -> 203.
- `digests.public_rows.digest`:
  `178ec1cbd8c5a2b1e77a7efc9e49e5e117a3573b1109e22dbb8bffa1fd7c920c` ->
  `daf02f8f883c0da8091d7c949ba23f8e391d5046c9cd9232923d45766dc92b24`.
- `digests.public_rows.scope_date_digest`:
  `af3e04d791b7610aef880aa8720847868b87c70dbad507709cb826389e3b5886` ->
  `7742c8632dc09a58c1a71fa286b14f7d751bf98c4dfceedec3396d6e1c36a837`
  (recomputed over all 203 public rows' `Scope`/`date:Date:start` triples
  from the raw export at commit `995cece3`, using `scopeDateDigest`; all
  203 rows matched an export row, zero missing).
- `digests.all_rows.digest`:
  `4e1a4b00fc6e041b76e35087e3e80163979431b4558768e2728b55974cfefa5e` ->
  `5582ff5e07bd8b2ab9d625b7c497182825d51c4d7e33c062fc1016a2f0039aa7` (count
  stays 318: 203 public + 115 private).
- `private_rows.count`: 121 -> 115; `private_rows.digest`:
  `3c5bf3b7309301b92af5b96978a7e7d9618ec54b24b1b0cffcb048246995b24d` ->
  `7fbcf9446adf639de5539cd3e12fa477095ea1a2ecb8baa7a8d000e6d7f4995c`;
  `counts_by_disposition.not_yet_reconciled`: 110 -> 104.
  `private_rows.commit` is left at `ab1be15fa3f7979b0c03bd70e73d0a2b4d23c764`
  in this PR; the orchestrator commits the new private half (below) to the
  archive repository and bumps this field afterward.
- Gap `G1`'s `gap` text: "110 preserved Decision rows (109 global, 1
  temporary)..." -> "104 preserved Decision rows (103 global, 1
  temporary)...", with this batch's six record ids appended to both the
  narrative and `evidence`.

No line was deleted from the register except as part of the in-place text
replacements above (the old digest/count values and the old G1 gap
sentence). Specifically, the deleted lines are:
- `count: 197` / `digest: 178ec1cbd8...` / `scope_date_digest: af3e04d791...` (public_rows, replaced)
- `count: 318` / `digest: 4e1a4b00fc...` (all_rows, digest replaced, count unchanged)
- `formally_migrated: 49` / `not_yet_reconciled: 110` (counts.decision_rows, replaced)
- `record_count: 56` (sources.formal_records, replaced)
- `count: 121` / `digest: 3c5bf3b730...` / `not_yet_reconciled: 110` (private_rows, replaced)
- the old G1 `gap:` paragraph (110/109 preserved rows, replaced with the
  104/103 paragraph naming this batch)

No row, gap, or evidence entry was removed.

## Digests computed (all shown above); collected here for convenience

- `public_rows.digest`: `daf02f8f883c0da8091d7c949ba23f8e391d5046c9cd9232923d45766dc92b24`
- `public_rows.scope_date_digest`: `7742c8632dc09a58c1a71fa286b14f7d751bf98c4dfceedec3396d6e1c36a837`
- `all_rows.digest`: `5582ff5e07bd8b2ab9d625b7c497182825d51c4d7e33c062fc1016a2f0039aa7`
- `private_rows.digest` (new 115-row projection): `7fbcf9446adf639de5539cd3e12fa477095ea1a2ecb8baa7a8d000e6d7f4995c`

Computed with `scripts/m2-closure-register-lib.mjs`'s own
`canonicalDigest`/`scopeDateDigest` functions, imported directly (via a
throwaway `.mjs` script run inside the worktree and deleted before commit,
never staged), over the 115-row private file plus the register's 203
public rows plus the full 318-row raw export (all four
`decisions-rows*.json` files fetched read-only from the private archive at
commit `995cece3`, same commit prior batches used).

## Private half for the orchestrator

New 115-row private projection (six rows removed, nothing else changed,
same layout as the source) written to (NOT committed, per the brief):
`C:/Users/pette/AppData/Local/Temp/claude/C--Users-pette-Projects-strale/4f68dcca-de52-4ade-b2b2-8341f736268e/scratchpad/2026-09-02-m2-closure-private-rows.batch9.yaml`

## Checks run

- `npm run archive:index` (before `context:generate`, per the brief): run
  twice (before and after this handoff file existed) so the archive/handoff
  indexes include it; final run "up to date."
- `npm run context:generate`: run twice for the same reason (the inventory
  tracks the handoff directory listing, so adding this file after the first
  generate required a second run per CLAUDE.md's "regenerate the inventory
  after editing any inventory target" rule); second run clean, all five
  protected sections present on all six new records.
- `npm run context:check`: warning-only mode; "no warnings," exit 0, run
  after staging every generated file (including the regenerated
  `docs/project/legacy-authority-inventory.json`).
- `npm run context:test`: green, 133/133. CI is the gate.
- `npm run programs:check`: `ok docs/programs/cto-readiness/tracks.yaml`
  (untouched by this batch, per the constraint).
- `npm run codex:check`: `ok codex re-review backlog`; 15 pre-existing rows
  awaiting Codex, none added or touched by this batch (per the constraint
  not to touch `docs/programs/**`).
- `npm run receipts:check`: `ok receipts contract`; 7 pre-existing
  `HANDOFF_BARE_TEST_COUNT` warnings on older handoffs, unrelated to this
  batch; this handoff itself avoids a bare count.
- `node --test scripts/m2-closure-register.test.mjs
  scripts/decision-records.test.mjs`: green, 92/92. CI is the gate.
- `node scripts/generate-archive-index.mjs --check`: "archive/README.md and
  handoff/README.md up to date."
- `node scripts/m2-closure-verify-private-rows.mjs`: 43 `FAIL` lines, all
  in the expected private count/digest classes and their direct
  consequences (the archive-repo file at the recorded commit still holds
  121 rows, six of which are now also public, so the operator script
  correctly reports `EXPORT_ROW_DUPLICATE` x6,
  `PRIVATE_ROW_ALSO_PUBLIC`/`PRIVATE_ROW_ALREADY_PUBLIC` x6,
  `PRIVATE_ROW_MUST_BE_PUBLIC` (x2 forms per row, x6),
  `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID` x6, the two
  `PRIVATE_COUNT_MISMATCH` lines, `PRIVATE_DIGEST_MISMATCH`, and
  `ALL_ROWS_DIGEST_MISMATCH`). None is a schema, evidence, derivation-rule,
  or record-citation failure: every failure traces to the private file at
  the archive commit not yet reflecting this batch's six removed rows,
  exactly what the brief says to expect until the orchestrator commits the
  private half and bumps `private_rows.commit`.
- `validatePrivateProjection` (imported directly from
  `scripts/m2-closure-register-lib.mjs`, positional signature
  `(register, privateRows, { collisions, context })`) run against this PR's
  register plus the new 115-row private file plus
  `docs/decisions/id-collisions.yaml`: **0 findings.**

## Deviations from the brief

None identified. Every deliverable, check, and constraint in the brief was
met as specified. The `.mjs` digest-computation and validation scripts used
during this batch were run inside the worktree and deleted before the
final `git add`, never staged or committed (verified: `git status --short`
before commit shows only the six new record files and the register-derived
generated-file changes plus this handoff, matching the constraint list
exactly).
