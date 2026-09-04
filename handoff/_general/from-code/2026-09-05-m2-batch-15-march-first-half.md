Intent: land T10 (M2 exit-gap closure) batch 15, fourteen March 2026
launch-month Decision rows (2026-03-02 through 2026-03-14: homepage
solutions-first positioning, external source dependency tracking, ranking
transparency, the web-provider abstraction layer, the full test suite
audit, the SQS design spec and its cost-optimization follow-up, the
detail-page section-order restructure, the platform-wide legal
disclaimer, the data-completeness rule expansion, the Trust navbar link,
the March 24 communication gate, Dev.to-first blog sequencing, and
continuous multi-LLM evaluation) as active formal candidate records,
contradiction-checked against the live capability manifests, the
frontend page components (sibling `strale-frontend` checkout, read-only),
the routes and lib code, CLAUDE.md, and the SQS-deletion decision
(DEC-20260503-B), with the register's counts and digests (including the
recomputed scope/date digest) made true again against the private
archive.

## What this batch is

Fourteen rows resolved from the private projection at
`docs/project/m2-closure-register.yaml`'s `private_rows.commit`
(`589d0bfecf7af9dcd1362d0c906638d9e5ff2c3f`, unchanged from `origin/main`
batch 14). All fourteen matched exactly on `id` in the private file:
`historical_status: active`, `historical_scope: global`,
`disposition: not_yet_reconciled`, `decided_at` 2026-03-02 (two rows),
2026-03-03 (one row), 2026-03-05 (two rows), 2026-03-06 (one row),
2026-03-07 (one row), 2026-03-09 (one row), 2026-03-10 (two rows),
2026-03-13 (one row), or 2026-03-14 (three rows), and page ids matching
the brief's table exactly. None collided
(`docs/decisions/id-collisions.yaml` has no entry for any of the fourteen
ids), none was a Git-native protocol label, none had an existing record
before this batch (checked with `test -f docs/decisions/records/<id>.md`
for each: none existed). Each is now a formal candidate record under
`docs/decisions/records/`, five protected sections (Decision, Context,
Rationale, Consequences, Reversal conditions), scope `product` for
0302-C, 0303-C, 0306-H, 0309-H, 0313-E, 0314-A, 0314-B and scope
`technical` for 0302-D, 0305-E, 0305-F, 0306-G, 0310-E, 0310-F, 0314-C,
per the brief. `owner: petter`, `authority_scope: none`,
`authority_active: false`, `migration_status: candidate`, `phase: M2`.

Full Notion content (`Decision`, `Rationale`, `Outcome` where present)
was read read-only from a locally cached copy of the archive export
(`decisions-export-raw.txt` in the session scratchpad, already fetched
by an earlier batch's session from `strale-io/strale-context-archive`),
located per-row by the escaped `userDefined:ID` key. Each row's
`title_sha256` was taken directly from the current private projection
file (`2026-09-02-m2-closure-private-rows.batch14.yaml` in the
scratchpad, itself an exact match for the register's current 62-row
private set, verified by disposition-counter cross-check before use).

## Verification performed (per record)

Every code claim in each record's Consequences section was verified by
reading the file or tracing callers, never taken from a comment or
CLAUDE.md alone:

- **DEC-20260302-C** (homepage order): read `strale-frontend/src/pages/Index.tsx`
  in full; confirmed the rendered section order (Hero, SolutionsShowcase,
  FreeTierShowcase, ProblemSection, QualityScoringSection,
  AuditTrailSection, then framework integrations, three-steps, and
  StatsStrip further down) rather than trusting the row's own claim.
- **DEC-20260302-D** (dependency tracking): confirmed
  `apps/api/src/lib/dependency-manifest.ts` and
  `apps/api/src/jobs/daily-digest.ts` exist; found no "Reputation Layer"
  module anywhere under `apps/api/src`.
- **DEC-20260303-C** (ranking transparency): confirmed no
  `/how-ranking-works` route exists in `strale-frontend/src/App.tsx`;
  read `Methodology.tsx`'s own header comment describing its post-SQS
  rewrite; confirmed `apps/api/src/lib/seller-rank.ts` (revenue-ordering,
  a different mechanism) and `apps/api/src/lib/suggest.ts` (Voyage +
  Haiku re-ranking, DEC-20260303-E, also a different mechanism) exist;
  found no "does not accept payment for ranking position" string
  anywhere checked.
- **DEC-20260305-E** (web-provider abstraction): confirmed
  `apps/api/src/capabilities/lib/web-provider.ts` exists and is
  re-exported through `browserless-extract.ts`; counted importers
  (`grep -rl "browserless-extract" apps/api/src/capabilities`, excluding
  tests: 36, not 47); confirmed the Browserless v1/v2 split comment in
  `browserless-extract.ts`.
- **DEC-20260305-F** (test suite audit): confirmed the five-test-type
  taxonomy (`known_answer`/`schema_check`/`negative`/`edge_case`/
  `dependency_health`) survives via CLAUDE.md and `apps/api/scripts/onboard.ts`;
  counted 342 manifests today (`ls manifests/*.yaml | wc -l`), a
  different population from the row's 98.
- **DEC-20260306-G** (SQS design spec): confirmed no `/v1/quality/:slug`
  or `v1/quality` route exists anywhere under `apps/api/src/routes`
  (grep, zero hits); confirmed `capability_health` (circuit breaker)
  survives in `apps/api/src/db/schema.ts` line 964-966. **Corrected the
  brief's conditional assumption**: read `docs/decisions/records/DEC-20260308-1.md`'s
  actual title ("Platform pricing currency: EUR (not USD)") and found it
  is NOT the "SQS Constitution" the row's title names; CLAUDE.md instead
  names `DEC-20260307` as the SQS Constitution, which has no formal
  record on this PR head, so no `related_to` edge was created to either
  id.
- **DEC-20260306-H** (detail-page order): read
  `strale-frontend/src/pages/CapabilityDetail.tsx` in full, including its
  own header comments explicitly stating the former SQS tabs and
  quality-profile display were removed (citing DEC-20260503-B by name in
  the source code itself).
- **DEC-20260309-H** (legal disclaimer): checked all eight named finance
  capability slugs against `manifests/*.yaml` (none exist); checked their
  closest successors (`aml-risk-score`, `ip-risk-score`,
  `wallet-risk-score`, `risk-narrative-generate`, none carry a
  `disclaimer` field); grepped all manifests for `disclaimer` (4 matches,
  none finance-predictive); confirmed `strale-frontend/src/pages/Terms.tsx`
  exists, is routed at `/terms`, and carries warranty/liability language
  (quoted); grepped `docs/company/claims.yaml` for "advisory",
  "financial", "disclaimer" (zero matches).
- **DEC-20260310-E** (SQS cost-optimization spec): confirmed none of the
  ten named enhancements exist as an SQS-specific mechanism (the engine
  itself is gone); noted "piggyback traffic" (C4) has a same-named but
  unrelated live analogue in the general test-infrastructure piggyback
  mechanism CLAUDE.md documents.
- **DEC-20260310-F** (data-completeness rule expansion): confirmed the
  requirement structure survives via CLAUDE.md's onboarding pipeline
  section and `apps/api/scripts/onboard.ts`; searched
  `docs/decisions/records/DEC-20260305-*.md` and `DEC-20260306-*.md` for
  a "data completeness rule" predecessor (none found, so no `amends` edge
  was created).
- **DEC-20260313-E** (Trust navbar): confirmed
  `strale-frontend/src/components/Header.tsx` line 10 and the `/trust` +
  `/trust/methodology` routes in `App.tsx`.
- **DEC-20260314-A/B/C** (communication gate, blog sequencing, multi-LLM
  evaluation): confirmed no `/blog` route exists in `strale-frontend`;
  confirmed no scheduled multi-model evaluation job exists anywhere in
  the repo (grepped for "multi-llm"/"multi_llm"/"multiLLM"/"ChatGPT
  evaluation", zero hits); found draft/planning evidence for Dev.to posts
  in `archive/growth-ops/tweets-v2.md` and `archive/README.md`, but did
  not confirm publication. `DEC-20260402-C` (an `unclear`-disposition row
  outside this batch, reported by the brief to state a Dev.to post
  shipped) was **not found** in the raw export snapshot available this
  session; this is stated plainly in DEC-20260314-B's Consequences
  rather than fabricated.

## Relations created

Only one relation edge was created, because the source text of every
other candidate pairing did not explicitly name its target (per this
batch's rule: source-stated only, quoting the sentence):

- `DEC-20260314-A` `related_to` `DEC-20260314-B`: 0314-A's own Rationale
  states "Blog Post #1 must be ready so launch day isn't just tweets into
  the void," naming the same blog-launch subject 0314-B sequences
  (Dev.to first).

No edge was created for: 0306-G to any SQS-Constitution record (the
correct target, `DEC-20260307`, has no formal record); 0310-E to
`DEC-20260308-1` or `DEC-20260306-G` (source text names neither by ID);
0313-E to `DEC-20260303-C` or `DEC-20260313-C` (source text names
neither); 0310-F's `amends` to an earlier data-completeness record (none
exists on the PR head).

## Register changes

- `formal_records.record_count`: 115 -> 129.
- `digests.public_rows.count`: 256 -> 270; `digest` and
  `scope_date_digest` both recomputed (the scope/date digest via `gh api`
  against the archive export at `sources.decision_archive.commit`,
  `24713c48`, binding all 270 public rows, the CI-invisible check this
  batch's brief and batch 13's lesson both require).
- `digests.all_rows.count`: unchanged at 318; `digest` recomputed (moving
  14 rows from private to public changes their `disposition` field, which
  the canonical row format includes, so the digest changes even though
  the row count and set membership do not).
- `counts.decision_rows.formally_migrated`: 108 -> 122;
  `not_yet_reconciled`: 51 -> 37.
- 14 new `formal_records` entries (`source_kind: notion-row`) and 14 new
  `decision_rows` entries (`disposition: formally_migrated`,
  `record_key` set, evidence pointing at the new record file), both
  appended in place, matching batch 14's pattern.
- `private_rows.count`: 62 -> 48; `digest` recomputed;
  `counts_by_disposition.not_yet_reconciled`: 51 -> 37 (unchanged:
  `obsolete_or_superseded: 6`, `unclear: 5`). `private_rows.commit` left
  unchanged at `589d0bfecf7af9dcd1362d0c906638d9e5ff2c3f`, per protocol;
  the archive repository itself is not touched by this batch.
- G1 gap text updated: "51 preserved Decision rows (50 global, 1
  temporary)" -> "37 preserved Decision rows (36 global, 1 temporary)",
  with a new sentence naming this batch's fourteen ids; G1 `evidence`
  gained the fourteen new record paths.

## Checks run (all pass unless noted)

- `node --test scripts/decision-records.test.mjs`, every test passed,
  including the full repository-candidate and merge-base-immutability
  check.
- `npm run archive:index` (before `context:generate`, per the brief).
- `npm run context:generate` run twice with a `git add -A` staged between,
  per the inventory-regenerate lesson; both runs produced identical
  output on the second pass.
- `npm run context:check`, "warning-only... no warnings."
- `npm run context:test`, every test passed, including "the checked-in
  repository context is warning-clean" and "the repository decision
  candidates and merge-base immutability checks pass" against the live
  edited register and the fourteen new record files.
- `node apps/api/scripts/check-pii.mjs --strict`, clean.
- `node apps/api/scripts/check-no-committed-secrets.mjs`, clean (2709
  tracked files scanned).
- `npm run receipts:check`, `ok receipts contract` (after correcting six
  records' frontend evidence entries from a bare `strale-frontend/<path>`
  form, which the checker's `DANGLING_EVIDENCE` rule does not resolve, to
  the cross-repo form `strale-io/strale-frontend@<sha>:<path>` the
  checker's `CROSS_REPO_REF` pattern accepts, matching the convention
  batch 8's `DEC-20260820-*-WEBSITE-*` records already use). The 7 warn
  lines about bare test counts in unrelated 2026-09-02/03 handoffs
  predate this batch and are not touched by it.
- `npm run codex:check`, `ok codex re-review backlog` (21 rows, all
  pre-existing; this batch adds no new row, since `docs/programs/**` is
  out of scope for this batch per its own constraints, a codex-backlog
  entry for this PR, if one is required per DEC-20260903-A, is a
  separate session's job, consistent with batch 14 also not having one).
- `npm run programs:check`, `ok docs/programs/cto-readiness/tracks.yaml`.
- Local `validatePrivateProjection` (imported from
  `scripts/m2-closure-register-lib.mjs`) run against the register on this
  branch plus the new `batch15.yaml` private file: **0 findings**.
- `node scripts/m2-closure-verify-private-rows.mjs` (the operator
  verifier, which fetches the private file at the register's
  `private_rows.commit` over `gh api` rather than from this batch's
  scratchpad output): **91 failures, all in the expected classes** , 
  `PRIVATE_ROW_ALSO_PUBLIC`, `PRIVATE_ROW_ALREADY_PUBLIC`,
  `PRIVATE_ROW_MUST_BE_PUBLIC`, `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID`
  (14 each, one per migrated row, because the archive commit still lists
  them as `not_yet_reconciled`), plus `PRIVATE_COUNT_MISMATCH` (x2),
  `PRIVATE_DIGEST_MISMATCH`, and `ALL_ROWS_DIGEST_MISMATCH`, the exact
  "private count/digest classes" the brief anticipates, and none of them
  a scope/date-digest failure. This resolves only when the archive
  repository's private file is updated out-of-band to remove the
  fourteen migrated rows, which is not this batch's job (`private_rows.commit`
  stays as on `main`).

## Not verified / could not verify

- Whether `DEC-20260402-C` actually states a Dev.to post shipped: that
  row was not present in the raw export snapshot this session had access
  to; reported as unverifiable in `DEC-20260314-B`'s Consequences rather
  than assumed either way.
- Whether the March 24 communication gate (`DEC-20260314-A`) was actually
  met on schedule: no evidence either way was found; not claimed.
- Whether a `codex-review-backlog.yaml` row is owed for this PR under
  DEC-20260903-A: `docs/programs/**` is explicitly out of scope for this
  batch's constraints, so this is left for a separate session.

## Next

G1 now stands at 37 preserved rows (36 global, 1 temporary) still
`not_yet_reconciled`. The next T10 batch continues the same 14-row cadence
against the remaining March 2026 rows (roughly the second half of the
month) per the program's usual selection order.

## Orchestrator addendum (after this handoff was written)

The private half (48 rows) was committed to the archive repository at
`201b0c4009e01572829ce8ebe21d15849734f9ea` and `private_rows.commit` in
the register was bumped to it in this same PR, per the loop change of
2026-09-04 (private half committed and register pinned before the
independent review). The statements above that the pin was left at
`589d0bfe...` and that the operator verifier reported failures in the
private count and digest classes describe the worker's state before
that step; at the PR head the verifier prints `ok`.
