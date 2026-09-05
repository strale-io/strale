Intent: land T10 (M2 exit-gap closure) batch 4 — the first global-scope-row batch — three engineering-convention Decision rows (DEC-20260419-A structured logging, DEC-20260420-A hand-write Drizzle migrations, DEC-20260511-C in-TS startup-migrations convention) as inactive formal candidate records, with the register's counts and digests made true again against the private archive.

## What this batch is

Three `not_yet_reconciled`, `historical_status: active`, `historical_scope: global`
rows from the private archive projection, named explicitly by the
orchestrator's brief rather than selected by a rule. None collided (checked
against `docs/decisions/id-collisions.yaml`), none was a Git-native protocol
label, none had an existing record. Each is now a formal candidate record
under `docs/decisions/records/`, five protected sections, `scope: technical`
(the Notion `Scope` field was `global` under the old workspace vocabulary;
noted in each record's Context), `authority_scope: none`,
`authority_active: false`, `migration_status: candidate`, `phase: M2`.

Implemented by a Sonnet agent from a written brief that carried every source
verbatim (fetched via `gh api` against the private archive repo, read-only,
never cloned into the shared checkout); the agent verified every
`title_sha256` in the private projection against the fetched Notion titles
before writing anything.

## Contradiction found and how it is stated

`DEC-20260511-C`'s Outcome (dated 2026-05-13) asserts `apps/api/drizzle.config.ts`
absent and no `drizzle-kit` devDependency, as PR #89's verification. On `main`
today (2026-09-04) both are back: `drizzle.config.ts` exists and `drizzle-kit`
is a devDependency again — but only to bootstrap the ephemeral integration-test
database in CI (`.github/workflows/ci.yml` runs `drizzle-kit push --force` in
the integration-db lane). Production schema changes still go exclusively
through the ledgered in-TS blocks in `apps/api/src/lib/startup-migrations.ts`
(`npm run migrations:check`, T15). The Decision/Outcome sections were kept
verbatim; the contradiction is stated as a dated status note in Consequences,
not silently fixed or hidden.

`DEC-20260420-A`'s own concrete mechanism (hand-written SQL migration files
under `apps/api/drizzle/`) was itself later superseded by `DEC-20260511-C`
five weeks after adoption. Recorded in DEC-20260420-A's Consequences section,
which also notes `DEC-20260511-C`'s Rationale explicitly preserves this
record's no-auto-generation discipline ("just in TS, not SQL files").

## Relation edges added

One: `DEC-20260511-C` → `{type: affirms, target: DEC-20260420-A}`, exactly
what the source row's Rationale states ("DEC-20260420-A's no-auto-generation
/ hand-written discipline is preserved"). `DEC-20260511-C`'s Rationale also
mentions `DEC-20260420-B` (a different id, schema.ts sync rule preserved) but
no edge was added for it — no record with that exact key exists on `main`
(that page id was instead classified evidence-only under the unrelated G1
pre-readiness rule, `DEC-20260904-A`, coincidentally sharing the same source
row that carries the display id `DEC-20260420-B`); the id is named in prose
only, per the brief's instruction not to fabricate edges to non-existent
records.

## Register changes

`docs/project/m2-closure-register.yaml`, targeted string edits only:
- `formal_records` +3 (`DEC-20260419-A`, `DEC-20260420-A`, `DEC-20260511-C`,
  each `source_kind: notion-row` with the matching source page id).
- Three new `decision_rows` public rows, `disposition: formally_migrated`,
  inserted before the `private_rows:` key (canonical digest sorts
  internally, so physical placement in the file does not affect the digest).
- `sources.formal_records.record_count`: 37 -> 40.
- `counts.decision_rows.formally_migrated`: 30 -> 33;
  `not_yet_reconciled`: 129 -> 126.
- `digests.public_rows`: count 178 -> 181, digest and `scope_date_digest`
  recomputed from the raw archive export (all 181 public rows, not just the
  3 new ones).
- `digests.all_rows`: count unchanged at 318 (rows moved from private to
  public, total is conserved), digest recomputed.
- `private_rows.count`: 140 -> 137; `private_rows.digest` recomputed;
  `private_rows.counts_by_disposition.not_yet_reconciled`: 129 -> 126.
  `private_rows.commit` left at `db6634c6c9a403384e0eb0e15438b035b96732d2` —
  the orchestrator commits the new private projection to the archive
  repository and bumps this field afterwards, per the brief.
- `exit_gaps` G1: gap text updated to 126 rows (125 global, 1 temporary),
  batch named; evidence += the three new record paths.

## Private half (not committed here)

The new 137-row private projection (same layout, the three migrated rows
removed, nothing else changed) was written to the orchestrator's scratchpad
at `2026-09-02-m2-closure-private-rows.batch4.yaml`, never committed by this
session.

## Checks

`npm run archive:index` (before `context:generate`, per the brief),
`npm run context:generate` (staged), `npm run context:check`,
`npm run context:test`, `npm run programs:check`, `npm run codex:check`,
`npm run receipts:check`,
`node --test scripts/m2-closure-register.test.mjs scripts/decision-records.test.mjs`,
`node scripts/generate-archive-index.mjs --check` — see the PR body and the
final session report for exit codes.
`node scripts/m2-closure-verify-private-rows.mjs` is expected to fail only on
private count/digest classes until the orchestrator commits the private half
and bumps `private_rows.commit`.

## Deviations from the brief

None known; see the session's final report for the full list (empty unless
noted there).
