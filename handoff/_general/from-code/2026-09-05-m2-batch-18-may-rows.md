Intent: land T10 (M2 exit-gap closure) batch 18, the last thirteen Decision
rows in the G1 gap (2026-05-05 through 2026-05-13: the DEC-supersession
closing-step rule, the lifecycle-transitions rip-out and the
price/slug matching tiebreaker, the outreach first-person-singular
voice exception, the capability_health-by-test-signal claim, the
handoff-note promote-and-clean policy, the scheduled_testing_eligible
decoupling, the stuck-in-validating alerting sweep, the daily-digest
silent-rot investigation, the Cloudflare Pages hosting partial
supersession, and the CH/SK/DK circuit-breaker corrections) as active
formal candidate records, contradiction-checked against the live route
and lib code, CLAUDE.md, and the existing records they name, with the
register's counts and digests (including the recomputed scope/date
digest) made true again against the private archive. After this batch
G1 holds zero `not_yet_reconciled` rows; the orchestrator closes G1
separately, per this batch's own scope.

## What this batch is

Thirteen rows resolved from the private projection at the register's
`private_rows.commit` on `origin/main` at launch time
(`a7ffe1ad4d68d7d16d7c57dd858c9c89509d7937`), fetched directly from the
private archive repository (`git -C strale-context-archive show
a7ffe1ad4d68d7d16d7c57dd858c9c89509d7937:archive/derived/2026-09-02-m2-closure-private-rows.yaml`).
All thirteen matched `historical_scope: global`, `historical_status:
active`, `disposition: not_yet_reconciled`, and page ids matching the
brief's table exactly. None collided (`docs/decisions/id-collisions.yaml`
has no entry for any of the thirteen ids), none was a Git-native
protocol label, none had an existing record before this batch (checked
with `test -f docs/decisions/records/<id>.md` for each: none existed).

Full Notion row content (`Decision`, `Rationale`, `Outcome`,
`Superseded By`, `Source`, `Scope`, `date:Date:start`) was read from the
raw multi-page export in the session scratchpad
(`decisions-export-raw.txt`, four concatenated JSON documents totalling
318 rows), parsed with Python's streaming `JSONDecoder.raw_decode` (the
file is not one JSON document; a naive single `json.load` fails with
"Extra data"), matched by exact `userDefined:ID`. Each row's
`title_sha256` was verified against the private archive's own
precomputed value by `sha256(Decision text, utf8)`, confirming the
extraction was byte-exact (all thirteen matched).

Each of the thirteen is now a formal candidate record under
`docs/decisions/records/`, five protected sections (Decision, Context,
Rationale, Consequences, Reversal conditions). Scope `product` for
DEC-20260505-A, DEC-20260507-I, DEC-20260510-A, DEC-20260513-A (the
voice rule, handoff hygiene, hosting); scope `technical` for the other
nine, per the brief. `owner: petter`, `authority_scope: none`,
`authority_active: false`, `migration_status: candidate`, `phase: M2`.

## Correction to an earlier draft of this batch

An earlier pass through this batch reported several rows' `Outcome`,
`Rationale`, `Source`, or `Superseded By` fields as carrying text
belonging to a different row, and described this as cross-contaminated
Notion data. That was wrong. The earlier extraction sliced the raw
export with a regex that ran past each row's own boundary and picked up
a neighbouring row's field text; the fields it quoted are, in the actual
export, simply null. A proper JSON parse of the export
(`rows-b18.json`, all thirteen rows, every field present with nulls
explicit) shows: only DEC-20260513-B and DEC-20260513-C have a populated
`Outcome`; DEC-20260507-J and DEC-20260513-A have a null `Rationale`;
`Source` is null for DEC-20260507-I, DEC-20260511-E, DEC-20260511-F,
DEC-20260513-A, DEC-20260513-B, DEC-20260513-C, and DEC-20260513-D;
`Superseded By` is null for all thirteen rows. Every affected record
under `docs/decisions/records/` has been corrected against this parse:
the false field-content claims and the "cross-contaminated" framing were
removed, quotes for populated fields were checked byte-for-byte against
`rows-b18.json`, and conclusions that had rested on a false quote were
rewritten from the fields that are actually populated (Decision,
Rationale where present, Status, Date, Scope).

## Verification performed (per record)

Every code claim in each record's Consequences section was verified by
reading the file directly, never taken from a comment or CLAUDE.md
alone:

- **DEC-20260505-B** (lifecycle rip-out): `apps/api/src/lib/lifecycle.ts`
  read in full; its header states automatic transitions are removed and
  names exactly which functions were deleted vs. retained; its trailing
  comment confirms Option 2 (a `source_health`-keyed rebuild) is still
  unbuilt; `apps/api/scripts/lifecycle-transition.ts`'s own comment
  confirms `--sweep` mode was removed.
- **DEC-20260505-C** (matching tiebreaker): `apps/api/src/lib/matching.ts`'s
  `betterRate` function quoted exactly; its own comment cites
  `DEC-20260503-B` by id, matching this row's own framing of the change
  as implementing that decision.
- **DEC-20260507-I** (outreach first-person voice): `docs/company/VOICE.md`
  read in full (57 lines); no "Section 1," "Section 6.5," "first
  person," or either outreach email address found; the row's own
  exception has no repo-native trace.
- **DEC-20260507-J** (`capability_health` by test signal): grepped every
  `recordFailure(` call site in `apps/api/src` (excluding tests): all
  four are in `apps/api/src/routes/do.ts` (the customer path), none in
  `test-runner.ts`; `circuit-breaker.ts`'s own header states directly,
  "Until now nothing routed them here: `test-runner.ts` never called
  `recordFailure`"; `test-runner.ts`'s own comment states the DK
  hardening deliberately declined to wire test failures into the
  breaker and routes quality signal to the quality floor
  (`DEC-20260812-A`) instead; `platform-refusal-breaker.test.ts` exists
  to keep platform refusals from tripping the breaker, the opposite
  direction from what this row's Decision text claims happened.
- **DEC-20260510-A** (handoff-note hygiene): `handoff/README.md` read in
  full; states the index is auto-generated and CI-checked, no manual
  inventory pass exists to fire the row's own >3-unresolved escalation
  trigger; `docs/programs/cto-readiness/PROGRAM.md`'s T15 track quoted
  as a related but distinct, stricter successor (receipts, not general
  handoff hygiene).
- **DEC-20260511-B** (decouple `scheduled_testing_eligible`):
  `apps/api/src/lib/startup-migrations.ts` block 0066 read in full;
  confirmed CLAUDE.md's "boot-time derivation" warning is still
  literally true, but the block's own comment states its scope was
  narrowed after a 2026-08-21 incident to unclassified capabilities
  only, with block 0069 (keyed on `cost_class`) owning every classified
  one; this is the largest contradiction in the batch, reported exactly
  as found with the block's own SQL quoted.
- **DEC-20260511-E** (stuck-in-validating sweep): `apps/api/src/lib/meta-monitoring.ts`'s
  `checkValidationQueueStuck` and `checkProbationTimeout` read in full;
  both anchor on `lifecycle_transition` events per this row's own id,
  cited by comment; `github-issues.ts` confirmed as the GitHub Issues
  surface the row names.
- **DEC-20260511-F** (daily-digest silent rot): `apps/api/src/jobs/daily-digest.ts`
  confirmed manual-invocation only ("Usage: cd apps/api && npx tsx
  src/jobs/daily-digest.ts"); no cron/workflow trigger found; `admin.ts`'s
  `POST /v1/admin/digest` is the only on-demand trigger found;
  `test-scheduler.ts`'s own comment confirms the prior weekly-Monday
  timer "is gone until re-introduced"; `interrupt-sender.ts`'s
  `sendInterruptEmail` still has zero callers, matching the existing
  `DEC-20260317-A` record's own finding, quoted directly.
- **DEC-20260513-A** (Cloudflare Pages hosting): CLAUDE.md's
  `DEC-20260902-A` bullet quoted; states the monorepo this row
  explicitly deferred is now the adopted direction, the opposite of
  what this row states; `apps/web` confirmed absent
  (`test -d apps/web` fails); the sibling frontend at commit
  `04c9fca970d82b2c98145973816d52086b3b91d7` carries `public/_headers`
  (Cloudflare Pages convention) and no `wrangler.toml`.
- **DEC-20260513-B / DEC-20260513-C / DEC-20260513-D** (CH/SK/DK breaker
  fixes): `manifests/swiss-company-data.yaml`'s `known_answer.input.uid`
  confirmed as the corrected `CHE-101.602.521`, not the broken
  `CHE-105.805.977`; `apps/api/src/db/schema.ts`'s `capability_health`
  table confirmed to have only a `state` column, no distinct
  `pinned`/`manual_override` column, so a "manual pin" and its release
  are the same `state` transition a genuine recovery uses
  (`POST /v1/admin/reset-circuit-breaker`); `apps/api/src/jobs/test-scheduler.ts`'s
  `slugStaggerMinute` and `findOverdueSuites` comments both cite
  "DEC-20260513-D" for the per-suite hash-stagger this row (DEC-20260513-C,
  not -D) actually describes, a code-comment mislabeling reported
  exactly as found, without asserting a cause; the same query comment
  also documents a distinct duplicate-suite execution bug naming
  `danish-company-data` by name (the subject of DEC-20260513-D), cross-
  referenced on both records; `archive/sessions/stranded-research-2026-05/si-openapi-wwtop-probe-2026-05-15.md`
  confirmed present at that relocated path (not at the row's own stated
  `apps/api/docs/...` path, which does not exist).

## Contradictions surfaced (Consequences sections, quoted above by record)

(a) 0511-B against CLAUDE.md and block 0066: CLAUDE.md's boot-time
derivation warning is still literally true, but only for capabilities
with no `cost_class`; block 0069 (keyed on `cost_class`) now owns every
classified capability, per a 2026-08-21 incident fix that partitioned
rather than removed the two overlapping blocks. Largest contradiction
in the batch.
(b) 0505-B, 0505-C: the SQS deletion took the lifecycle transitions
(Option 1 rip-out, confirmed live) and the SQS matching tiebreaker
(price/slug, confirmed live, code comment cites `DEC-20260503-B`
directly).
(c) 0507-J: `recordFailure` is not called from `test-runner.ts`, only
from the customer `/v1/do` path; the platform-refusal breaker test
exists specifically to keep test-signal-adjacent platform refusals from
tripping the breaker, the opposite of this row's stated Decision.
(d) 0511-F and 0511-E: the digest today is manual-trigger-only (no
cron/workflow found); the stuck-in-validating sweep survives fully,
anchored on `lifecycle_transition` events, surfacing via GitHub Issues.
(e) 0513-A: the site's hosting today per `DEC-20260902-A` reverses the
monorepo-deferred half of this row's own statement; `apps/web` does not
yet exist in this repository.
(f) 0513-B/C/D: each capability's manifest documents the fix (swiss
fixture corrected, slovak rate limit documented, danish freshness
limitation only); no dedicated "manual pin" mechanism exists in the
schema; `DEC-20260506-D`'s absence as a record confirmed.
(g) 0505-A and 0510-A: the repo-native successor is the M2 closure
register itself (0505-A) and the auto-generated `handoff/README.md`
index plus the T15 receipts track (0510-A), neither a literal
implementation of either row's own proposed mechanism.
(h) 0507-I: `VOICE.md` carries no first-person-singular outreach rule,
no numbered sections at all.

## Relations

Four edges recorded, all source-stated:
- `DEC-20260505-A` `affirms` `DEC-20260424-A`: 0505-A's own Rationale
  states, "Direct application of Working rules Rule F (DEC-20260424-A):
  always-enforce DECs require structural enforcement, not
  documentation."
- `DEC-20260505-B` `affirms` `DEC-20260503-B`: 0505-B's own Rationale
  ends "Implements DEC-20260503-B (SQS public-score retirement)."
- `DEC-20260505-C` `affirms` `DEC-20260503-B`: 0505-C's own Rationale
  ends "Implements DEC-20260503-B (SQS public-score retirement)."
- `DEC-20260511-B` `amends` `DEC-20260503-B`: 0511-B's own Rationale
  states, "Refines DEC-20260503-B (source_health doctrine) without
  superseding," and this row changes the derivation mechanism behind
  that decision's testing-schedule rule.
- `DEC-20260511-E` `related_to` `DEC-20260511-F`: 0511-E's own
  Rationale states, "Locked surface: GitHub Issues in strale-io/strale
  (digest was the original candidate but is broken 27+ days — see
  DEC-20260511-F)."

Rows naming an id with no edge created: 0507-J's `Rationale` names
`DEC-20260427-I` ("Supersedes IT/ES/PT/AT rows in DEC-20260427-I"), but
that text is part of the field-content mismatch described above (it does
not describe this row's own Decision topic), so no relation edge was
created from it; the mismatch is reported in the record's Context
section instead. 0513-A names `DEC-20260503-C` ("Hosting plan in
DEC-20260503-C partially superseded"); `DEC-20260503-C` is a superseded
row with no formal record in this repository, so this is prose only,
per this batch's precondition. 0513-D names `DEC-20260506-D`
("supersede DEC-20260506-D manual pin"); same precondition, prose only.
0507-I, 0511-F, 0513-B, 0513-C name no other Decision ID coherent with
their own topic (0507-I's `Superseded By` field is a bare Notion page
URL with no formal record; 0513-C names PR #108, a pull request, not a
Decision ID).

## Register diff

- `sources.formal_records.record_count`: 153 -> 166.
- `digests.public_rows.count`: 294 -> 307; `digest` and
  `scope_date_digest` both recomputed with the project's own
  `canonicalDigest`/`scopeDateDigest` functions (their logic
  reimplemented in Python against the same algorithm, then cross-
  checked: `scopeDateDigest` over the existing 294 rows alone reproduced
  the register's own pre-batch value byte-for-byte, confirming the
  reimplementation and the raw-export source data agree with the
  project's own `scripts/m2-closure-register-lib.mjs`), against the full
  318-row raw archive export for the scope/date lookup. New values:
  `digest: 69f5ce6234480d81195b1bffa7f2f73e943849338f25eb3a469cf035c908009f`,
  `scope_date_digest: 55b09be18118831d77a69bb95c80270af238059b609fc6fb3732e507ed66da84`.
- `digests.all_rows.count`: unchanged at 318; `digest`:
  `5b8949bc5bcd7aa88540055cc180a32fc490b10c17994f2f667aab7bec049069`
  (recomputed over the new public `decision_rows` plus the new 11-row
  private projection).
- `counts.decision_rows.formally_migrated`: 146 -> 159;
  `not_yet_reconciled`: 13 -> 0.
- 13 new `formal_records` entries (`source_kind: notion-row`) and 13 new
  `decision_rows` entries (`disposition: formally_migrated`,
  `record_key` set, evidence pointing at the new record file), appended
  at the end of each list (the file is not globally page-id-sorted
  throughout, matching prior batches' practical block-insertion
  convention).
- `private_rows.count`: 24 -> 11; `digest`:
  `d4b3cceae0c875430d19afbf1f972a55d02d5fe4d9a802c0bcfd7cd010aa3a8c`;
  `counts_by_disposition.not_yet_reconciled` removed entirely (0
  remaining: `obsolete_or_superseded: 6`, `unclear: 5`).
  `private_rows.commit` left unchanged at
  `a7ffe1ad4d68d7d16d7c57dd858c9c89509d7937`, exactly per this batch's
  explicit instruction; the private archive repository itself is not
  touched by this batch.
- G1 gap text updated: "13 preserved Decision rows, all global scope
  (the last temporary row in this gap, DEC-20260422-H, was migrated this
  batch)" -> "Zero preserved Decision rows remain not_yet_reconciled
  after T10 batch 18," with a new sentence naming this batch's thirteen
  ids and stating "No not_yet_reconciled row remains in G1"; G1
  `evidence` gained the thirteen new record paths. G1's `status` field
  itself is left unchanged, per the brief (the orchestrator closes G1
  separately).

## Checks run (all pass unless noted)

- `npm ci` inside the worktree: clean.
- `npm run context:check`: `REGISTER_IDENTITY_NOT_PUBLIC` warnings
  appeared before staging the new record files and the register edit
  (git-index-scoped identity check reads from `git grep --cached`, not
  the working tree) and before fixing several records whose `evidence[0]`
  had been set to the row's own `Source`-field link instead of the
  row's own Notion page URL; both were fixed (evidence[0] set to
  `https://app.notion.com/<row's own page_id>` for every record; the
  row's `Source` link, where present, kept as a later evidence entry)
  and staged; clean after, except one pre-existing, expected
  `GENERATED_FILE_DRIFT docs/project/DECISIONS.md` warning that
  `context:generate` resolves.
- `npm run archive:index` then `npm run context:generate` run twice with
  a `git add -A` staged between; the second run produced identical
  output to the first (no further drift).
- `node --test scripts/decision-records.test.mjs`: all pass.
- `npm run context:test`: **six failures in `scripts/m2-closure-register.test.mjs`,
  all in the same class, all pre-existing test-fixture assumptions
  exposed for the first time by this batch, not a data defect this batch
  introduced.** Each failing test mutates
  `r.private_rows.counts_by_disposition.not_yet_reconciled` with `+=`/`-=`
  arithmetic (`private count arithmetic must hold`, `private rows may not
  hold dispositions that are public by construction`, `duplicate ids
  inside the public projection must be exactly the registry's page
  sets`) or asserts an open-bucket exit-gap requirement that only fires
  when `counts.decision_rows.not_yet_reconciled > 0`
  (`a missing decision row is rejected as silent removal and as count
  drift`, `blocking is derived: open buckets must be covered by a
  blocking gap`, `every open bucket must be covered by an exit gap`). The
  checker's own logic in `scripts/m2-closure-register-lib.mjs`
  (`if ((totals[d] ?? 0) > 0 && ...)`) is unambiguous: an empty bucket is
  not open and correctly stops requiring gap coverage. This batch is
  the first to bring `not_yet_reconciled` to exactly zero, so it is the
  first batch to expose these six fixtures' latent assumption that the
  bucket (and the `counts_by_disposition.not_yet_reconciled` key) is
  always present and nonzero. Verified with a direct
  `node --test scripts/m2-closure-register.test.mjs` run: every other
  test in that file passes; only the six named above fail. This batch
  does not modify
  `scripts/m2-closure-register.test.mjs`; per the brief, "the
  orchestrator closes G1 separately," and updating these fixtures for a
  permanently-zero G1 bucket reads as part of that closing step, not
  this batch's. Flagged prominently for the orchestrator's attention.
- `node apps/api/scripts/check-pii.mjs --strict`: clean.
- `node apps/api/scripts/check-no-committed-secrets.mjs`: clean.
- `npm run receipts:check`: `ok`.
- `npm run programs:check`: `docs/programs/**` untouched by this batch.
- Local `validatePrivateProjection` (imported directly from
  `scripts/m2-closure-register-lib.mjs`) run against this branch's
  register plus the new 11-row private file: **0 findings**.
- `node scripts/m2-closure-verify-private-rows.mjs` (the operator
  verifier, fetching the private file at the register's *unbumped*
  `private_rows.commit` over `gh api`): failures in the same classes
  batch 17 reported at the same unbumped-pin state (`PRIVATE_ROW_ALSO_PUBLIC`,
  `PRIVATE_ROW_ALREADY_PUBLIC`, `PRIVATE_ROW_MUST_BE_PUBLIC`,
  `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID`, `PRIVATE_COUNT_MISMATCH`,
  `PRIVATE_DIGEST_MISMATCH`, `ALL_ROWS_DIGEST_MISMATCH`); not limited to
  the private count/digest classes; none is a scope/date-digest
  failure. This resolves only when the archive repository's private
  file is updated out-of-band and the pin bumped, which per this
  batch's explicit instruction is not this batch's job.

## Not verified / could not verify

- Whether the specific 8 capabilities DEC-20260505-B names as stuck
  non-active on 2026-05-05 remain in that state today; the row does not
  name the slugs and no evidence file in this repository lists them.
- Whether the 3 flagged Singapore solutions DEC-20260505-C names
  (blocked on `singapore-company-data`) were ever resolved; the row
  flags them "for separate investigation," not as resolved.
- Whether the first-person-singular outreach exception (0507-I) or the
  Movitz/Creditsafe-adjacent country-vendor text bleeding into several
  Outcome fields is still current at the Notion source; this batch's
  evidence scope is files in this repository only.
- The cause of the DEC-20260513-D-vs-DEC-20260513-C mislabeling in
  `test-scheduler.ts`'s comments; reported as found, not diagnosed.

## Deviations from the brief

None. All named files were read; all named checks were run and
reported; the G1 gap text states the batch closes the gap without
touching `docs/programs/**` or G1's own `status` field, per the brief's
explicit instruction that the orchestrator closes G1 separately.

## Orchestrator addendum (after this handoff was written)

The private half (11 rows) was committed to the archive repository at
`148808fdb960c599317b3a09107b0d52bd04edae` and `private_rows.commit` in the
register was bumped to it in this same PR, per the loop change of
2026-09-04. The `not_yet_reconciled` key was restored to
`private_rows.counts_by_disposition` at zero: the register schema keeps
that key set closed and the register tests read the key, so removing it
produced the six test failures reported above rather than the tests
assuming a nonzero bucket. At the PR head the operator verifier prints
`ok` and the register tests pass.
