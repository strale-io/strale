Intent: land T10 (M2 exit-gap closure) batch 17, twelve Decision rows from
April to early May 2026 (2026-04-07 through 2026-05-03: the Phase 3
Session 2 closeout, Gate 2 null-output correctness tier, code-based
lookup plus cross-validation for entity resolution, Gate 4's four-layer
solution test pyramid, progressive unlock and agent self-signup, the
7-vertical framework and long-tail customer definition, two Brand &
voice Section 2.7 additions, the deferred Payee Assurance v1 pricing
commitment, the two ToS-violating-scraper deactivation batches, and the
SQS-redesign-as-per-product-routing-engine decision) as active formal
candidate records, contradiction-checked against the live route and lib
code, `auto-register.ts`'s DEACTIVATED map and every named capability
file, CLAUDE.md, the SQS-deletion decision (DEC-20260503-B itself),
the third-party scraping doctrine records (DEC-20260813-A,
DEC-20260812-A), the vendor-stack governance record (DEC-20260430-A),
and the 2026-08-05 Direction Plan, with the register's counts and
digests (including the recomputed scope/date digest) made true again
against the private archive.

## What this batch is

Twelve rows resolved from the private projection at the register's
`private_rows.commit` on `origin/main` at launch time
(`9da4ff92751c4afb0282141d04d9ea63359c1840`), fetched directly from the
private archive repository (`git -C strale-context-archive show
9da4ff92...:archive/derived/2026-09-02-m2-closure-private-rows.yaml`).
Eleven matched `historical_scope: global`; one (DEC-20260422-H) matched
`historical_scope: temporary` and is the last temporary row in the G1
gap. All twelve matched `historical_status: active`, `disposition:
not_yet_reconciled`, and page ids matching the brief's table exactly.
None collided (`docs/decisions/id-collisions.yaml` has no entry for any
of the twelve ids), none was a Git-native protocol label, none had an
existing record before this batch (checked with `test -f
docs/decisions/records/<id>.md` for each: none existed). One date
discrepancy was caught and corrected: DEC-20260406-E's own
`date:Date:start` field is 2026-04-07, one day after the "406" the
historical ID's own name implies; the record uses the row's actual
recorded date, not the ID-implied one, and says so in its Context
section.

Each of the twelve is now a formal candidate record under
`docs/decisions/records/`, five protected sections (Decision, Context,
Rationale, Consequences, Reversal conditions). Scope `product` for
DEC-20260406-E, DEC-20260410-A, DEC-20260413-A, DEC-20260415-A,
DEC-20260415-B, DEC-20260422-H, DEC-20260427-H, DEC-20260427-I; scope
`technical` for DEC-20260409-A, DEC-20260409-B, DEC-20260409-D,
DEC-20260503-B, per the brief. `owner: petter`, `authority_scope: none`,
`authority_active: false`, `migration_status: candidate`, `phase: M2`.

Full Notion content (`Decision`, `Rationale`, `Outcome`, `Scope`,
`date:Date:start` where present) was read from a locally cached copy of
the archive export (`decisions-export-pretty.json` in the session
scratchpad, a parsed-JSON array of all 318 rows already fetched by an
earlier session), matched by exact `userDefined:ID`. Each row's
`title_sha256` was computed directly with `sha256(Decision text, utf8)`
via Node, importing the project's own `sha256` from
`scripts/m2-closure-register-lib.mjs` rather than reimplementing it.

## Verification performed (per record)

Every code claim in each record's Consequences section was verified by
reading the file and tracing callers, never taken from a comment or
CLAUDE.md alone:

- **DEC-20260409-A** (Gate 2 null-output correctness tier):
  `apps/api/src/lib/null-field-ratio.ts` read in full, its header
  comment and rule list quoted byte-for-byte; its caller in
  `apps/api/src/lib/test-runner.ts` located (`calculateNullFieldRatio`
  at the point commented "Gate 2: Null-ratio check (DEC-20260409-A)");
  found the enforcement flag `NULL_RATIO_RULE_ENABLED` defaults to
  disabled in code but is documented `required_in: production` /
  `set_in: railway` in `config/env-manifest.yaml`.
- **DEC-20260409-B** (code-based lookup + cross-validation):
  `apps/api/src/lib/entity-validation.ts` read in full (header labels
  itself "DEC-20260409-B Phase 1"); grepped every file under
  `apps/api/src/capabilities/` for its exported functions
  (`validateCompanyResult`, `buildValidationBlock`, or an import of the
  module), zero matches; only its own test file calls it, so the
  cross-validation half is unwired dead code. The context-propagation
  half was independently confirmed live in
  `apps/api/src/lib/solution-executor.ts` (the exact
  `registration_number`/`jurisdiction` propagation comment and code) and
  `apps/api/src/lib/onboarding-gates.ts`'s `AUTO_INJECTED` set.
- **DEC-20260409-D** (Gate 4 four-layer pyramid): `onboarding-gates.ts`
  read for gate1/gate3/gate4a (Layer A); `gate4b-solution-dryrun.ts`
  read in full, its header explicitly cites "DEC-20260409-D Layer B";
  confirmed piggyback validation exists generally but is not labelled to
  this decision; confirmed `test-scheduler.ts`'s `weekly-sweep` job is a
  URL health probe (`runWeeklyHealthSweep`), not Layer D's
  representative-solution execution, which was never built; found the
  adjacent `gate5-path-coverage.ts` is a different, later decision
  (DEC-20260411-B) despite the sequential gate number.
- **DEC-20260410-A** (progressive unlock + agent self-signup):
  `apps/api/src/lib/progressive-unlock.ts` read in full, its
  `UNLOCK_MAP` confirmed to unlock exactly 3 related capabilities per
  of 5 trigger capabilities with a 24h TTL; two `do.ts` comments citing
  this decision by id quoted exactly; `auth.ts`'s `agentSignupHandler`
  read in full, its own header comment ("Agent self-signup
  (DEC-20260410-A)") and the `/v1/signup` mount point quoted exactly.
- **DEC-20260413-A** (7-vertical framework + long-tail customer):
  compared the row's seven named verticals against CLAUDE.md's current
  seven (company-data, compliance, developer-tools, finance,
  data-processing, web-scraping, monitoring) name by name; none
  matches except by coincidence of count; read
  `docs/strategy/2026-08-05-direction-plan.md` in full and quoted its
  revenue finding (38 crypto wallets over x402, KYB/compliance "never
  launched") directly against this row's KYB-first long-tail-customer
  framing.
- **DEC-20260415-A / DEC-20260415-B** (Brand & voice Section 2.7):
  `docs/company/VOICE.md` read in full (57 lines, two headings, no
  numbered sections); grepped for "2.7", "thinking-out-loud",
  "deference", "market-claim", "engagement-bait"; zero matches in
  either case; recorded the `amends` relation from -B to -A since -B's
  own Rationale explicitly extends the Section 2.7 that -A's own text
  created, both decided the same date.
- **DEC-20260422-H** (defer Payee Assurance v1 pricing): grepped
  `docs/company/DECISION-QUEUE.md` and `docs/company/BUDGET.md` for
  "Movitz"/"Creditsafe": zero matches; found the existing
  `DEC-20260430-A` record (decided 8 days later) explicitly discusses
  this exact row by id ("the Movitz-dependent path in the unique but
  unmigrated `DEC-20260422-H`") and states the same source Decision
  "attempted to retire conflicting candidate lists and Movitz-dependent
  pricing work", quoted directly, showing the deferral's own trigger
  was itself being retired within days rather than resolved; cited
  `DEC-20260812-A`'s retirement of the Counterparty Assurance framing as
  the reason the product this row priced never needed a price.
- **DEC-20260427-H** (deactivate 5 ToS-violating scrapers): read
  `apps/api/src/capabilities/auto-register.ts`'s `DEACTIVATED` map in
  full for all five slugs (`patent-search`, `trustpilot-score`,
  `salary-benchmark`, `employer-review-summary`,
  `linkedin-url-validate`), quoted each `DEC-20260427-H-1` through `-5`
  comment exactly; confirmed all five manifests still exist on disk;
  cross-checked the existing `DEC-20260813-A` record's own list of
  targets that remain absolute ("Google surfaces prohibited by
  `DEC-20260427-H-4`") to confirm this row's Google-scraping
  prohibition is still cited as binding four and a half months later.
- **DEC-20260427-I** (deactivate 6 commercial-KYB-aggregator countries):
  checked all six slugs (`dutch-company-data`, `portuguese-company-data`,
  `lithuanian-company-data`, `spanish-company-data`,
  `german-company-data`, `austrian-company-data`) against
  `auto-register.ts`'s `DEACTIVATED` map: none present; read each
  capability's own source file and the map's historical "REACTIVATED"
  comments (citing `DEC-20260427-I-1` through `-6` by exact suffix) to
  confirm each now runs a compliant path (direct government API,
  licensed Openapi.com aggregator, or the official JustizOnline
  Firmenbuch API); grepped all three "surgical fix" capabilities
  (`swiss-company-data`, `polish-company-data`, `officer-search`) for
  live `northdata` calls: none found, only historical removal
  comments; noted the row's own `Outcome` field (recorded 2026-05-07,
  "5 of the original 6... still in mid-rebuild") is stale and its own
  country list appears to substitute IT for the omitted sixth country
  (Lithuania), reported as written without correction.
- **DEC-20260503-B** (SQS redesign): quoted CLAUDE.md's SQS-deletion
  paragraph in full; read `apps/api/src/db/schema.ts` directly and
  confirmed every PR2 residual column CLAUDE.md names (`qp_score`,
  `rp_score`, `matrix_sqs`, `matrix_sqs_raw`, `trend`, `guidance_*`) plus
  the `sqs_daily_snapshot` table are all still present; read
  `test-scheduler.ts` for the hourly-free-only base filter (confirmed
  live at two query sites) and the newer risk-tiered A/B/C cadence layer
  the row's text does not describe; grepped `audit.ts` for
  "tier"/"basic"/"Assurance": zero matches, and found the actual
  mechanism is a per-capability GDPR Art. 22 classification
  (`data_lookup`/`screening_signal`/`risk_synthesis`), not a product-line
  split; found a second, independent code comment ("Daily SQS snapshot
  retired with the SQS engine (DEC-20260503-B)") in `test-scheduler.ts`
  corroborating the schema evidence from a different file.

## Contradictions surfaced (Consequences sections, quoted above by record)

(a) 0503-B: PR1 (deletion) shipped 2026-05-05; PR2 (residual schema
columns and `sqs_daily_snapshot` drop) has not; all named columns and
the table are still in `schema.ts`. The "hourly free-only" testing rule
survives as the base filter but is now layered with a risk-tiered A/B/C
cadence this row does not describe. The "tiered audit trail" this row
specifies (basic/full by `*-Assurance` product line) was never built in
that shape; a per-capability GDPR classification exists instead, and the
product-line boundary it would have keyed off was itself retired by
DEC-20260812-A.
(b) 0409-A, 0409-D: both gates belonged to the SQS-scoring-adjacent test
programme; the null-ratio rule (0409-A) survives as a live test-runner
gate independent of SQS, behind a feature flag documented as
production-enabled; the four-layer pyramid (0409-D) survives at Layers
A and B (both explicitly cited by gate number in code), exists in
substance but not by name at Layer C, and was never built at Layer D.
(c) 0427-H, 0427-I: H's five deactivations are all still in force,
unreversed, no reactivation trigger fired; I's six deactivations are
*all* reactivated via compliant paths today (direct API, licensed
vendor, or official partnership), making the row's own 2026-05-07
Outcome field stale; northdata mentions in the three "surgical fix"
capabilities are historical comments only; the 15 paused KYB solutions'
current state cannot be proven from repo evidence per CLAUDE.md's own
drift-prevention instruction, so this record does not assert it either
way.
(d) 0410-A: `POST /v1/signup` exists exactly as described, and
progressive unlock's mechanics (3 capabilities, 24h TTL) match the row
precisely; the "silent" (not-on-pricing-page) half was not checked
against the live frontend, out of this batch's file-only evidence scope.
(e) 0413-A: none of the row's seven vertical names survive in
CLAUDE.md's current seven; the row's KYB-first long-tail framing is
directly contradicted by the 2026-08-05 Direction Plan's revenue finding
and its treatment of the compliance vertical as gated on customer
discovery rather than aggressively expanded.
(f) 0415-A, 0415-B: neither Section 2.7 nor any of its nine rules exist
in the repository's `VOICE.md`; the source page is Notion-only, so
absence from the repo file proves nothing about the Notion page's
current state.
(g) 0422-H: the deferral's own trigger (Movitz/Creditsafe/ICP signal)
never resolved before its 2026-05-31 expiry, and the product it priced
was itself deprioritized within days by the vendor-stack consolidation
(DEC-20260430-A) and later by DEC-20260812-A, making the temporary row
moot rather than closed by resolution.
(h) 0406-E: neither named canonical page ("Market Context",
"Competitive Landscape") nor a session closeout artefact exists
anywhere in `docs/strategy/` or `archive/sessions/`; the row's own date
field disagrees by one day with its historical ID's implied date.

## Relations

Three edges recorded, all source-stated:
- `DEC-20260409-B` `related_to` `DEC-20260409-A`: 0409-B's own Rationale
  ends "RELATED: DEC-20260409-A (Gate 2 null-output correctness tier).
  Both are hardening measures from the SpendLatch Bug Fix Framework
  Phase 3 work."
- `DEC-20260409-D` `related_to` `DEC-20260409-A` and `related_to`
  `DEC-20260409-B`: 0409-D's own Rationale ends "RELATED: Supersedes
  DEC-20260409-C (naive Gate 4 plan)... DEC-20260409-A (Gate 2
  null-output correctness tier) and DEC-20260409-B (code-based lookup +
  cross-validation) remain active." No record exists for
  `DEC-20260409-C` (unresolved collision id), so no `supersedes`/`amends`
  edge was created toward it, per the rule that a relation target must
  exist as a record on the PR head.
- `DEC-20260415-B` `amends` `DEC-20260415-A`: 0415-B's own Rationale
  states it adds "rules 7, 8, 9" to "Section 2.7" and its own Decision
  says it extends the section 0415-A's own Decision text created the
  same day.

Two rows named an id with no existing record and got no edge:
`DEC-20260427-H` names "DEC-20260420-H" (does not exist as a record);
`DEC-20260427-I` names "DEC-20260420-H" in its own Rationale text (not
`DEC-20260427-H` or `DEC-20260428-A` as the brief anticipated it might).
`DEC-20260413-A` and `DEC-20260503-B` name no other Decision ID in their
own text at all. `DEC-20260422-H` and `DEC-20260406-E` name no other
Decision ID in their own text either, despite `DEC-20260430-A` (an
existing record) discussing `DEC-20260422-H` from the other direction,
per this batch's methodology, relation edges are recorded only from a
row's own stated text, not from a later record that happens to name it,
so no edge was added for that pair; the connection is discussed in
`DEC-20260422-H`'s Consequences section in prose instead.

## Register diff

- `sources.formal_records.record_count`: 141 -> 153.
- `digests.public_rows.count`: 282 -> 294; `digest` and
  `scope_date_digest` both recomputed with the project's own
  `canonicalDigest`/`scopeDateDigest` functions (imported directly from
  `scripts/m2-closure-register-lib.mjs`, not reimplemented), against the
  full 318-row raw archive export (`decisions-export-pretty.json`) for
  the scope/date lookup. New values:
  `digest: 9e08ba12faff088b23b612e3fe74604161690a3b354e56f32142edaafc17ee1d`,
  `scope_date_digest: c2d63181433afd796651acf4f25b5ea4b75b687330b40088e87876765634324e`.
- `digests.all_rows.count`: unchanged at 318; `digest`:
  `9ac6fdb2386dd7f426a275d5d47c11a05c91d1a7dca55b1a35336e63c23479fa`
  (recomputed over the new public `decision_rows` plus the new 24-row
  private projection).
- `counts.decision_rows.formally_migrated`: 134 -> 146;
  `not_yet_reconciled`: 25 -> 13.
- 12 new `formal_records` entries (`source_kind: notion-row`) and 12 new
  `decision_rows` entries (`disposition: formally_migrated`,
  `record_key` set, evidence pointing at the new record file), both
  inserted in page-id-adjacent position near the batch's own page ids
  (the file is not globally page-id-sorted throughout; the existing
  March/April rows are already interleaved out of strict order in
  several places), so this batch followed the same practical,
  block-insertion convention prior batches used rather than a global
  re-sort).
- `private_rows.count`: 36 -> 24; `digest`:
  `4d0c811be5cd73e735d596461d4c39443caebfe5083099f5e5e9f48c4df501b2`;
  `counts_by_disposition.not_yet_reconciled`: 25 -> 13 (unchanged:
  `obsolete_or_superseded: 6`, `unclear: 5`). `private_rows.commit` left
  unchanged at `9da4ff92751c4afb0282141d04d9ea63359c1840`, exactly per
  this batch's explicit instruction ("private_rows.commit stays as on
  main in your PR"); the private archive repository itself is not
  touched by this batch.
- G1 gap text updated: "25 preserved Decision rows (24 global, 1
  temporary)" -> "13 preserved Decision rows, all global scope (the last
  temporary row in this gap, DEC-20260422-H, was migrated this batch)",
  with a new sentence naming this batch's twelve ids; G1 `evidence`
  gained the twelve new record paths.

## Checks run (all pass unless noted)

- `npm run archive:index` then `npm run context:generate` run twice with
  a `git add -A` staged between; the second run produced identical
  output to the first (no further drift).
- `npm run context:check`: warning-only, `GENERATED_FILE_DRIFT` only
  before regeneration, clean after.
- `node --test scripts/decision-records.test.mjs`: all pass, including
  the repository-wide decision-candidate and merge-base-immutability
  check.
- `npm run context:test`: all pass (the full
  `check-project-context.test.mjs` / `decision-records.test.mjs` /
  `m2-closure-register.test.mjs` / `m2-closure-apply-g1-rule.test.mjs`
  suite named by the script).
- `node apps/api/scripts/check-pii.mjs --strict`: clean.
- `node apps/api/scripts/check-no-committed-secrets.mjs`: clean.
- `npm run receipts:check`: `ok receipts contract`. The 7 warn lines
  about bare test counts in unrelated pre-existing handoffs predate this
  batch; this handoff itself was rewritten once to remove a test count
  the checker correctly flagged on a first pass.
- `npm run programs:check`: `docs/programs/**` untouched by this batch.
- Local `validatePrivateProjection` (imported directly from
  `scripts/m2-closure-register-lib.mjs`, not reimplemented) run against
  this branch's register plus the new 24-row private file: **0
  findings**. `compareRowsToExport` against the full 318-row raw export:
  **0 findings**. Both confirm the projection itself is internally
  correct and ready for the pin to be bumped in a follow-up action.
- `node scripts/m2-closure-verify-private-rows.mjs` (the operator
  verifier, fetching the private file at the register's *unbumped*
  `private_rows.commit` over `gh api`): **79 failures**, in the same
  five classes batch 16 reported at the same unbumped-pin state:
  `PRIVATE_ROW_ALSO_PUBLIC`, `PRIVATE_ROW_ALREADY_PUBLIC`,
  `PRIVATE_ROW_MUST_BE_PUBLIC` (x2 per row), and
  `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID` (one set per migrated row,
  because the archive at the unbumped commit still lists them as
  `not_yet_reconciled` and this PR now also lists them publicly), plus
  `PRIVATE_COUNT_MISMATCH` (x2), `PRIVATE_DIGEST_MISMATCH`, and
  `ALL_ROWS_DIGEST_MISMATCH`. This is **not** limited to the private
  count/digest classes; none is a scope/date-digest failure. This
  resolves only when the archive repository's private file is updated
  out-of-band and the pin bumped, which per this batch's explicit
  instruction is not this batch's job.

## Not verified / could not verify

- Whether Payee Assurance v1 pricing research (the `docs/research/` and
  `docs/diligence/` files under that name) ever produced a committed
  price outside a formal Decision record; none exists in
  `docs/decisions/records/`.
- Whether the "silent" (not on the pricing page) half of DEC-20260410-A
  still holds today; the pricing page lives in the frontend surface,
  outside this batch's file-only evidence scope.
- Whether the "Switchboard" page DEC-20260406-E names as a "standing
  recurring watch item" exists or is still watched; no repo file names
  it.

## Deviations

None from the brief's explicit instructions. `private_rows.commit` was
left unbumped exactly as instructed, unlike batch 15's precedent and
unlike batch 16's own after-the-fact addendum; if the current loop
practice has moved to committing and bumping within the batch PR itself,
that is an orchestrator-level decision to make on this PR, not one this
session took unilaterally against an explicit brief instruction.

## Next

G1 now stands at 13 preserved rows, all global scope. The private
archive at `strale-io/strale-context-archive` still needs a new commit
removing this batch's twelve migrated rows from
`archive/derived/2026-09-02-m2-closure-private-rows.yaml`, with
`private_rows.commit` in the register bumped to match, before the
operator verifier will print `ok`. The exact projection to commit is
already written at `2026-09-02-m2-closure-private-rows.batch17.yaml` in
the session scratchpad. The next T10 batch continues the same
twelve-row cadence against the remaining 13 rows, all now global scope.

## Orchestrator addendum (after this handoff was written)

The private half (24 rows) was committed to the archive repository at
`a7ffe1ad4d68d7d16d7c57dd858c9c89509d7937` and `private_rows.commit` in the
register was bumped to it in this same PR, per the loop change of
2026-09-04 (private half committed and register pinned before the
independent review). The statements above that the pin was left at
`9da4ff92...` and that the operator verifier reported failures in the
private count and digest classes describe the worker's state before that
step; at the PR head the verifier prints `ok`.
