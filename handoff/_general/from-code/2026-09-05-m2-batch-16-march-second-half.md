Intent: land T10 (M2 exit-gap closure) batch 16, twelve March 2026
Decision rows from the second half of that month (2026-03-14 through
2026-03-29: AX as a first-class quality dimension, the hero headline
change, Sprint 9F elevation, code-pattern publishing, the dual-profile
launch decision, the upstream-failures-not-billed rule, the weekly
digest plus interrupt email model, the publication SQS threshold, the
provider known-answer fixture requirement, the provider evidence
weighting rule, the solution batch freshness ordering fix, and the
seven-color accent palette) as active formal candidate records,
contradiction-checked against the live route and lib code, CLAUDE.md,
the SQS-deletion decision (DEC-20260503-B), the quality floor
(DEC-20260812-A), the daily-run reform (DEC-20260822-A), the design
tokens (DEC-20260902-A), and the sibling `strale-frontend` checkout
(read-only), with the register's counts and digests (including the
recomputed scope/date digest) made true again against the private
archive.

## What this batch is

Twelve rows resolved from the private projection at the register's
`private_rows.commit` on `origin/main` at launch time
(`201b0c4009e01572829ce8ebe21d15849734f9ea`), fetched directly from the
private archive repository (`git -C strale-context-archive show
201b0c40...:archive/derived/2026-09-02-m2-closure-private-rows.yaml`).
All twelve matched exactly on `id`: `historical_status: active`,
`historical_scope: global`, `disposition: not_yet_reconciled`,
`decided_at` 2026-03-14 (two rows), 2026-03-15 (four rows), 2026-03-17
(four rows), 2026-03-21 (one row), 2026-03-29 (one row), and page ids
matching the brief's table exactly. None collided
(`docs/decisions/id-collisions.yaml` has no entry for any of the twelve
ids), none was a Git-native protocol label, none had an existing record
before this batch (checked with `test -f docs/decisions/records/<id>.md`
for each: none existed). The brief's list of records that DO already
exist (DEC-20260316-A/B, DEC-20260318-A/B, DEC-20260320-A/B/E/F,
DEC-20260323-A, DEC-20260324-A/C, DEC-20260330-B) was independently
verified present. Each of the twelve is now a formal candidate record
under `docs/decisions/records/`, five protected sections (Decision,
Context, Rationale, Consequences, Reversal conditions). Scope `product`
for DEC-20260314-F, DEC-20260314-G, DEC-20260315-B, DEC-20260315-H,
DEC-20260317-F, DEC-20260329-A; scope `technical` for DEC-20260315-A,
DEC-20260315-I, DEC-20260317-A, DEC-20260317-G, DEC-20260317-H,
DEC-20260321-A, per the brief. `owner: petter`, `authority_scope: none`,
`authority_active: false`, `migration_status: candidate`, `phase: M2`.

Full Notion content (`Decision`, `Rationale`, `Outcome` where present)
was read from a locally cached copy of the archive export
(`decisions-export-pretty.json` in the session scratchpad, a clean
parsed-JSON array of all 318 rows, already fetched by an earlier
session), matched by exact `userDefined:ID`. Each row's `title_sha256`
was taken directly from the private projection I fetched fresh at
`201b0c40` (not an older cached copy), cross-checked against the same
value already committed in the register's history for a prior batch's
row (DEC-20260302-C, hash byte-for-byte identical across the archive
commit before batch 15 and the register after it) before trusting the
mechanism.

## Verification performed (per record)

Every code claim in each record's Consequences section was verified by
reading the file and tracing callers, never taken from a comment or
CLAUDE.md alone:

- **DEC-20260314-F** (AX as a quality dimension): `packages/mcp-server/README.md`
  read in full for the zero-auth tool list; a repo-wide grep for
  `completion_rate`/`autonomous`/`autonomous_completion`/`autonomousCompletion`
  under `apps/api/src` returns nothing, so the third named item
  (autonomous completion rate metric) was never built; `grep -rln
  "Sprint" docs/strategy/*.md` returns nothing.
- **DEC-20260314-G** (hero headline): read
  `strale-io/strale-frontend@04c9fca9:src/pages/Index.tsx` directly; the
  live `<h1>` text is a character-for-character match with the row's
  Decision text, quoted in full in the record.
- **DEC-20260315-A** (Sprint 9F elevated): same zero-auth evidence as
  0314-F; noted the row's own "five capabilities" language against
  CLAUDE.md's current count of 11 free-tier capabilities without
  reconciling the discrepancy.
- **DEC-20260315-B** (code-pattern publishing): the row names
  DEC-20260311-A by id; confirmed no formal record exists for it
  (`test -f` fails), so no relation edge; found `context7.json` and
  `docs/ide-rules/strale-compliance.mdc` /
  `.windsurfrules` as the closest surviving distribution mechanism, and
  the later DEC-20260330-B record (on `main`) cites exactly those files,
  though this row does not name DEC-20260330-B itself, so no relation
  edge to it either.
- **DEC-20260315-H** (dual-profile launch): CLAUDE.md's SQS-deletion
  paragraph quoted directly; `apps/api/src/db/seed-solutions.ts`'s own
  comment on the retired qualification gate quoted directly;
  `apps/api/src/lib/quality-floor.ts` and its test file read to confirm
  the current quarantine/deactivation floor as the successor mechanism.
- **DEC-20260315-I** (upstream failures not billed): read
  `apps/api/src/routes/do.ts` in full around `executeSync` (found the
  literal "DEC-14" comment tag on the sync path) and the async path's
  refund-on-failure comments; read `apps/api/src/lib/x402-gateway.ts`
  for its own "verify -> execute -> settle ordering (DEC-14)" comment and
  the removal of a combined verify-and-settle helper, confirming x402
  does not differ from the wallet path.
- **DEC-20260317-A** (weekly digest + interrupt model): read
  `apps/api/src/lib/digest-sender.ts`,
  `apps/api/src/lib/interrupt-sender.ts`, and
  `apps/api/src/routes/internal-health-monitor.ts` in full; confirmed
  `sendInterruptEmail` (in `interrupt-sender.ts`) has zero callers
  anywhere in `apps/api/src` via `grep -rn "sendInterruptEmail"
  apps/api/src --include=*.ts`, so the dedicated interrupt module is
  built but dead code, while a different module
  (`intelligent-alerts.ts`) sends interrupt-shaped emails through the
  generic `digest-sender.ts` helper instead; looked up the unmigrated
  prose-only row DEC-20260511-F in the raw export and quoted its exact
  text on the digest pipeline's silent rot since 2026-04-14;
  `docs/company/DAILY-RUN.md` read to confirm DEC-20260822-A's daily
  (not weekly) CEO-brief cadence as today's actual monitoring artifact.
- **DEC-20260317-F** (publication SQS >= 60 vs automated >= 50): same
  CLAUDE.md/seed-solutions.ts/quality-floor.ts evidence as 0315-H; the
  four record titles the brief named as possible relation targets for
  "the automated >= 50 gate" were read directly and none matches, so no
  relation edge.
- **DEC-20260317-G** (provider known_answer fixtures): confirmed via
  batch 13's DEC-20260224-P-a1b2 and batch 14's DEC-20260227-P-a1b2
  records (both read in full) that no third-party provider was ever
  onboarded; read `apps/api/scripts/onboard.ts` near the lines the brief
  named (6, 244) and CLAUDE.md's onboarding section to confirm the
  known-answer requirement survives as the pipeline's own universal
  rule.
- **DEC-20260317-H** (0.5x provider evidence weighting): same
  no-third-party-provider evidence as 0317-G; `grep -rn "0\.5"
  apps/api/src/lib --include=*.ts` reviewed by hand, every hit is an
  unrelated CSS letter-spacing value in email templates, confirming no
  weighting mechanism of any kind exists in code; noted the row and
  DEC-20260317-G share a Notion `Source` link (a parent spec page) but
  neither row's own text names the other, so no relation edge despite
  the shared source document.
- **DEC-20260321-A** (solution batch schedule_tier DESC): `grep -n
  "schedule_tier\|scheduleTier\|ORDER BY" apps/api/src/routes/solutions.ts
  apps/api/src/routes/internal-tests.ts` run directly; no `ORDER BY
  schedule_tier` of either direction exists in either file, and
  `schedule_tier` does not appear in `solutions.ts` at all; found
  `worstFreshnessLevel` (from `trust-labels.ts`) as the closest
  surviving mechanism, called at `solutions.ts` line 96.
- **DEC-20260329-A** (7-color palette): checked
  `design/tokens/active.json` directly for all seven named hex codes
  (none present) and both `design/tokens/candidates/*.json` files (none
  present); read
  `strale-io/strale-frontend@04c9fca9:src/index.css` directly and quoted
  its actual `--pink`/`--purple`/`--info`/`--success`/`--warning`/`--teal`/
  `--destructive` HSL variables, none of which uses the row's
  `--color-{name}` naming convention or hex values.

## Contradictions surfaced (Consequences sections, quoted above by record)

(a) 0315-H, 0317-F: the dual-profile model and both SQS thresholds are
gone (DEC-20260503-B); the quality floor (DEC-20260812-A,
quarantine <70%/deactivate <30%/>=10 calls/30d) is the successor, a
different mechanism (pass/fail on production traffic, not a
pre-publication brand bar).
(b) 0317-G, 0317-H: no third-party provider has ever existed
(batch 13/14 evidence); the fixture rule survives as the onboarding
pipeline's universal requirement; the 0.5x weighting has no code
anywhere.
(c) 0315-I: DEC-14 (predating this row) is the code's actual name for
this rule; x402 follows the identical verify-execute-settle ordering, no
difference found.
(d) 0317-A: the "weekly digest" and "interrupt email" halves both exist
in code but under different names than the row implies
(`digest-sender.ts`, `interrupt-sender.ts`), the interrupt module is
dead code (zero callers), the literally-named `daily-digest.ts` job
rotted silently per DEC-20260511-F, and DEC-20260822-A's daily (not
weekly) CEO brief is today's actual monitoring cadence, directly
contradicting this row's stated reasoning that daily is noise at this
scale.
(e) 0314-G: the exact headline text is live today, verbatim, no drift.
(f) 0314-F: two of three AX items exist (zero-auth path for a defined
capability subset, DEC-19 structured errors); the autonomous completion
rate metric has zero code references anywhere.
(g) 0315-A, 0315-B: no sprint-numbering tracking exists in
`docs/strategy/`; DEC-20260330-B (Context7/IDE rules/vibe-coding SEO) is
the closest surviving code-pattern-distribution artifact, though this
row does not name it.
(h) 0321-A: no `ORDER BY schedule_tier` exists in either named route
file today; `solutions.ts`'s `worstFreshnessLevel`-based aggregation is
the closest surviving mechanism.
(i) 0329-A: the seven-color palette is absent from `design/tokens/active.json`,
both design-token candidates, and the surviving `strale-frontend`
stylesheet (which has a different, differently-named partial color set).

## Relations

**Zero relation edges recorded.** A full-text scan of all twelve rows'
`Decision`/`Rationale`/`Outcome` fields for `DEC-[0-9]{8}-[A-Za-z0-9-]+`
patterns found exactly one hit beyond a row naming itself: DEC-20260315-B
names DEC-20260311-A ("DEC-20260311-A (canonical code patterns)
originally deferred to Phase C (Week 3-4). Elevated to Week 1..."). That
id has no formal record on `main` (`test -f
docs/decisions/records/DEC-20260311-A.md` fails) and is not part of this
batch, so per the rule that every edge must target a record that exists
on the PR head, no edge was created; the row's own naming is quoted in
the Context section as prose instead. No other row in this batch names
another Decision ID in its own text.

## Register diff

- `sources.formal_records.record_count`: 129 -> 141.
- `digests.public_rows.count`: 270 -> 282; `digest` and
  `scope_date_digest` both recomputed with the project's own
  `canonicalDigest`/`scopeDateDigest` functions (imported directly from
  `scripts/m2-closure-register-lib.mjs`, not reimplemented), against the
  full 318-row raw archive export
  (`decisions-export-pretty.json`) for the scope/date lookup. New
  values: `digest: 969490ea4145455017884a36fc1a0ac1b0b979aedcf617136a4cb3fdc82109a0`,
  `scope_date_digest: 767ed1de08548e2505d2459a7bcc4f5df658610a3d717dd90ca0e08d2d1d17d8`.
- `digests.all_rows.count`: unchanged at 318; `digest`:
  `419623e5336ceae9d4b99be0682bd7fdf7f9cc0f96945a308a4f7fe2b5dceee5`
  (recomputed over the new public `decision_rows` plus the new 36-row
  private projection; moving a row's `disposition` field changes the
  canonical row format even though total membership is unchanged).
- `counts.decision_rows.formally_migrated`: 122 -> 134;
  `not_yet_reconciled`: 37 -> 25.
- 12 new `formal_records` entries (`source_kind: notion-row`) and 12 new
  `decision_rows` entries (`disposition: formally_migrated`,
  `record_key` set, evidence pointing at the new record file), both
  appended in place after the batch 15 entries.
- `private_rows.count`: 48 -> 36; `digest`:
  `7dc85b8f96d7546a4a3e493243e3f54e70ab1fc89e534a965036f9dc7cbd8cc0`;
  `counts_by_disposition.not_yet_reconciled`: 37 -> 25 (unchanged:
  `obsolete_or_superseded: 6`, `unclear: 5`). **`private_rows.commit`
  left unchanged at `201b0c4009e01572829ce8ebe21d15849734f9ea`, exactly
  per this batch's explicit instruction ("private_rows.commit stays as
  on main in your PR")**, and the archive repository itself is not touched
  by this batch, even though I do have a push-capable checkout of it and
  batch 15's PR did bump the pin in-PR. This batch's brief states the
  opposite explicitly, so I followed the literal written instruction
  over the precedent; flagged below under Deviations.
- G1 gap text updated: "37 preserved Decision rows (36 global, 1
  temporary)" -> "25 preserved Decision rows (24 global, 1 temporary)",
  with a new sentence naming this batch's twelve ids; G1 `evidence`
  gained the twelve new record paths.

## Checks run (all pass unless noted)

- `npm run archive:index` (before `context:generate`, per the brief),
  then `npm run context:generate` run twice with a `git add -A` staged
  between; the second run produced identical output to the first (no
  further drift).
- `npm run context:check`: "warning-only... no warnings."
- `npm run context:test`: every test passed, run via the
  `scripts/check-project-context.test.mjs`,
  `scripts/decision-records.test.mjs`, `scripts/m2-closure-register.test.mjs`,
  and `scripts/m2-closure-apply-g1-rule.test.mjs` suites named in the
  `context:test` script; no receipt was written for this run since the
  brief's checklist does not ask for one and this handoff is not a
  daily-run brief.
- `node apps/api/scripts/check-pii.mjs --strict`: clean.
- `node apps/api/scripts/check-no-committed-secrets.mjs`: clean (2727
  tracked files scanned).
- `npm run receipts:check`: `ok receipts contract` (after correcting
  three records' frontend evidence entries from a bare
  `strale-frontend/<path>` form, which the checker's `DANGLING_EVIDENCE`
  rule does not resolve, to the cross-repo form
  `strale-io/strale-frontend@<sha>:<path>` its `CROSS_REPO_REF` pattern
  accepts, and one `docs/ide-rules` directory evidence entry to the two
  actual files inside it). The 7 warn lines about bare test counts in
  unrelated 2026-09-02/03 handoffs predate this batch.
- `npm run programs:check`: `ok` for both tracked program files
  (`docs/programs/**` untouched by this batch).
- Local `validatePrivateProjection` (imported directly from
  `scripts/m2-closure-register-lib.mjs`, not reimplemented) run against
  this branch's register plus the new 36-row private file: **0
  findings**, and `compareRowsToExport` against the full 318-row raw
  export also returns **0 findings**, both confirming the projection
  itself is internally correct and ready for the pin to be bumped in a
  follow-up action.
- `node scripts/m2-closure-verify-private-rows.mjs` (the operator
  verifier, fetching the private file at the register's *unbumped*
  `private_rows.commit` over `gh api`): **79 failures**, in five
  classes: `PRIVATE_ROW_ALSO_PUBLIC`, `PRIVATE_ROW_ALREADY_PUBLIC`,
  `PRIVATE_ROW_MUST_BE_PUBLIC` (x2 per row), and
  `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID` (12 each, one per migrated
  row, because the archive at the unbumped commit still lists them as
  `not_yet_reconciled` and now also public), plus
  `PRIVATE_COUNT_MISMATCH` (x2), `PRIVATE_DIGEST_MISMATCH`, and
  `ALL_ROWS_DIGEST_MISMATCH`. This is **not** limited to the private
  count/digest classes the brief anticipated; see Deviations below. None
  is a scope/date-digest failure. This resolves only when the archive
  repository's private file is updated out-of-band and the pin bumped,
  which per this batch's explicit instruction is not this batch's job.

## Not verified / could not verify

- Whether Sprint 9F, 11D, 11E, or any sprint numbering the rows
  describe was ever tracked anywhere retrievable from this repository;
  `docs/strategy/` carries no trace.
- Whether the specific 2-3 GitHub gists DEC-20260315-B describes ever
  shipped (gists are not repo-tracked content, so this cannot be
  confirmed or denied from inside the repository).
- Whether the HSL color variables in `strale-frontend/src/index.css`
  (`--pink`, `--purple`, etc.) are a renamed descendant of
  DEC-20260329-A's palette or an unrelated color system; only that the
  exact hex values and naming convention the row specifies are absent.

## Deviations

- **The operator verifier's failure classes do not match the brief's
  prediction**, because this batch's brief instructs
  `private_rows.commit stays as on main in your PR` while batch 15's PR
  (per its own handoff's "Orchestrator addendum") bumped the pin
  in-PR after committing the private half to the archive. Given the
  explicit, unambiguous instruction in this batch's brief, I left the
  pin unbumped and did not push anything to
  `strale-io/strale-context-archive`, even though I have a push-capable
  local checkout of it. The correct pre-merge check --
  `validatePrivateProjection` run directly against my new private file
  and this PR's register -- passes with 0 findings, confirming the
  batch's substance is correct; only the archive-side pin bump remains,
  for whoever performs that step next.
- No `codex-review-backlog.yaml` row was added for this PR:
  `docs/programs/**` is explicitly out of scope for this batch's
  constraints (same posture batches 14 and 15 took).

## Next

G1 now stands at 25 preserved rows (24 global, 1 temporary) still
`not_yet_reconciled`. The private archive at
`strale-io/strale-context-archive` still needs a new commit removing
this batch's twelve migrated rows from
`archive/derived/2026-09-02-m2-closure-private-rows.yaml`, with
`private_rows.commit` in the register bumped to match, before the
operator verifier will print `ok` (the exact projection to commit is
already written at
`2026-09-02-m2-closure-private-rows.batch16.yaml` in the session
scratchpad, verified 0 findings). The next T10 batch continues the same
twelve-row cadence against the remaining 2026 rows per the program's
usual selection order.
