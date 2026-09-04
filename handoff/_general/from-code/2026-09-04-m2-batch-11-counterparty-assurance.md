Intent: land T10 (M2 exit-gap closure) batch 11, seven Counterparty
Assurance v1 Decision rows (DEC-20260515-A US v1 scope upgrade,
DEC-20260515-B US per-state Tier-1/Tier-2 classification, DEC-20260515-C SI
Openapi WW-Top rejection, DEC-20260518-A Evidence Tier framework,
DEC-20260518-B use-case tier framework, DEC-20260518-C T1 bank-verification
optionality fix, DEC-20260518-D `ubo_availability` semantics) as active
formal candidate records, contradiction-checked against the live US/SI
capabilities, `ubo_availability` executors, DEC-20260812-A's Counterparty
Assurance retirement, and `docs/company/DECISION-QUEUE.md`'s DQ-30 dormant
vendor entry, with the register's counts and digests made true again
against the private archive.

## What this batch is

Seven rows resolved from the private projection at archive commit
`df544ab605c19793052d3d109c4b4f0c3e7a5a69` (109 rows, the commit recorded
in the register at launch time). All seven matched exactly on `id` in the
private file: `historical_status: active`, `historical_scope: global`,
`disposition: not_yet_reconciled`, `decided_at` 2026-05-15 (three rows) or
2026-05-18 (four rows), and page ids matching the brief's table exactly.
None collided (`docs/decisions/id-collisions.yaml` has no `DEC-20260515` or
`DEC-20260518` entry), none was a Git-native protocol label, none had an
existing record (`ls docs/decisions/records/DEC-2026{0515-A,0515-B,0515-C,0518-A,0518-B,0518-C,0518-D}.md`
all "no such file"; DEC-20260518-E/F/G already exist and are unrelated ids).
Each is now a formal candidate record under `docs/decisions/records/`, five
protected sections (Decision, Context, Rationale, Consequences, Reversal
conditions), scope `product` for DEC-20260515-A, DEC-20260518-A,
DEC-20260518-B, DEC-20260518-C (product scope and tiers, per the brief) and
scope `technical` for DEC-20260515-B, DEC-20260515-C, DEC-20260518-D
(routing classification, integration choice, flag semantics, per the
brief). `owner: petter`, `authority_scope: none`, `authority_active: false`,
`migration_status: candidate`, `phase: M2`.

Full Notion content (`Decision`, `Rationale`, `Outcome`, `Scope`,
`Confidence`, `Source`) was read read-only from
`strale-io/strale-context-archive` at commit
`995cece3fe4abfb8b0bef0cccbd58191a6dab83c` (a later export-carrying commit
in that repository's history; the register's `private_rows.commit`
`df544ab6` names the derived private-projection commit, not an export
commit — the raw export files live only in earlier/later commits of the
archive repo, so the same four `decisions-rows*.json` files batch 4's brief
describes were fetched from this commit, read-only, via `git show
<commit>:<path>` into a local read-only checkout at
`C:/Users/pette/Projects/strale-context-archive`, never modified or
committed there). All seven page ids resolved to exactly one row each
(matched by dashed UUID against each row's `id` field); no other row's
content was read into any of the seven records. `Outcome` was `null` for
all seven rows — none had a non-empty Outcome, unlike some prior batches.
`Source` was non-null for three rows: DEC-20260515-B ("Phase 3 US Topograph
14-state scout (commit 34036a0, doc
apps/api/docs/us-topograph-state-scout-2026-05-15.md)"), DEC-20260515-C
("Phase 2 SI Openapi WW-Top probe (commit 8eb8c0e, doc
apps/api/docs/si-openapi-wwtop-probe-2026-05-15.md)"), and DEC-20260518-A
(a chat-session description, not a URL). Neither commit id (`34036a0`,
`8eb8c0e`) resolves on `main` (`git cat-file -e` fails for both); both
audit docs exist, moved to
`archive/sessions/stranded-research-2026-05/<name>.md` from the cited
`apps/api/docs/` path, and are cited in the relevant records at their
current location, with the move and the unresolved commit ids stated in
Consequences.

## Per-record fidelity: what was kept, what was compressed

- **DEC-20260515-A** (US v1 scope upgrade): kept the full IN-SCOPE list
  (Cobalt at $2 PAYG / $1k-mo or $7,200/yr Starter, EINsearch at $0.75
  effective / $375/yr, the four free state supplements, the 14-state
  Topograph blueprint states named individually, the litigation stack
  vendors), the OUT-OF-SCOPE bank-verification exclusion and its
  structural-gap framing, the sign-up list, the Tier 1/Tier 2 provenance
  resolution, and the PARTIAL SUPERSESSION clause against DEC-20260430-A
  verbatim. Compressed the "AFFECTED PAGES" list (three Notion page
  references with no repo anchor) into prose omission — not reproduced,
  since it names only Notion pages this repository does not track.
- **DEC-20260515-B** (US per-state tiers): kept all seven Tier 1 states
  with their exact data sources (Socrata SODA, Sunbiz SFTP, mass.gov,
  CCFS CSV, Texas Comptroller CPA API, SAM.gov Entity Management API v3),
  the build-effort estimate (~8-12 person-days) and per-state pattern
  groupings, all eight Tier 2 states (DE, GA, IL, MN, NV, NJ, PA, WY), the
  Delaware launch-gate condition, the build-queue priority order, and all
  five deferred-to-v1.1+ items verbatim.
- **DEC-20260515-C** (SI Openapi rejection): kept the 2-of-7 vs 5-of-7
  fixture split with both named fixtures (Petrol SI80267432, Mercator
  SI45884595, Krka SI82646716), the full added-field list, the ~10x
  latency and €0.12-vs-free cost comparison, the mojibake finding, and the
  AJPES hypothesis verbatim.
- **DEC-20260518-A** (Evidence Tier framework): kept all three tier
  definitions with their exact field lists (Identity: `legal_name`,
  `primary_registration_id`, `status`, `legal_form` ISO 20275 ELF,
  `registered_address`, `date_incorporated`; Bindability:
  `legal_representatives[]`, `signing_authority`; Ownership:
  `ubo_availability` three-value enum, `shareholders[]`, `ubo[]`), the
  `insufficient_evidence` no-charge rule, the Documents-deferred-to-v1.1
  clause, and the Evidence-Tier-vs-Data-Sourcing-Tier disambiguation
  verbatim.
- **DEC-20260518-B** (use-case tier framework): kept the T1
  Continuity/T2 Onboarding/T3 Enhanced Due Diligence naming exactly as the
  Decision title states it. The Notion Rationale for this row does not
  itself define what each tier requires beyond the names — nothing
  substantive was compressed; the record states this absence explicitly
  rather than inventing tier content the source does not carry.
- **DEC-20260518-C** (T1 bank verification optional): kept the "0 of 30"
  pre-fix blocked-country count, the 2-of-5 vs 3-of-5 trigger-condition
  split with all five named (recurring payment, bank-detail change,
  periodic re-check, sanctions refresh, status-change alert), the Path A
  label, and the "~28 of 30" post-fix unblocked-country estimate verbatim.
- **DEC-20260518-D** (`ubo_availability` semantics): kept the PR #131
  provenance, the exact DK (`unavailable_no_registry`, "BODS integration
  Status=Committed") and UK (`available`, "PSC integration Status=Live")
  outcomes, and the 3-value-enum-plus-reason-string mechanism verbatim.

## Contradictions found and how they are stated

All stated as dated "status on 2026-09-04" notes in each record's
Consequences section, never editing the Decision/Rationale/Outcome text:

1. **DEC-20260812-A retired the Counterparty Assurance framing every one
   of these seven rows was written for.** CLAUDE.md's "Current Decisions
   (August 2026)" paragraph is quoted verbatim in DEC-20260515-A's
   Consequences: DEC-20260812-A "supersedes DEC-20260502-A (Counterparty
   Assurance rename/ICP) and DEC-20260503-A (dual-domain architecture);
   the Counterparty Assurance framing is retired as primary product —
   compliance is a separate track gated on customer discovery." Every
   record's Consequences names this and states what survives in code, if
   anything, independent of the retired framing.
2. **US Tier 2 via Cobalt: code exists and is called, but as one 50-state
   capability, not the 8-state split, and it is dormant, along with the
   two other named US vendors.** `apps/api/src/capabilities/us-company-data-cobalt.ts`
   calls `https://apigateway.cobaltintelligence.com/v1` for any of Cobalt's
   50 states, gated on `COBALT_API_KEY`. `config/env-manifest.yaml`
   records `COBALT_API_KEY` as `required_in: []`, `set_in: [none]`, "Not
   set in production on 2026-09-02 (Railway audit)." `docs/company/DECISION-QUEUE.md`
   entry DQ-30 (raised 2026-09-02, answered by Petter 2026-09-03) is the
   "founder's 2026-09-03 note that Cobalt/EINsearch/sec-api stay in place
   dormant" the brief asks for: it confirms all three
   (`us-company-data-cobalt`, `us-ein-match`, `us-sec-filings-extended`)
   are `visible = false`, `x402_enabled = false`,
   `lifecycle_state = 'validating'`, unreachable by any route, with
   Petter's answer quoted: "leave Cobalt, EINsearch and sec-api in place,
   he will activate them later." None of the seven Tier 1 per-state
   direct capabilities (`us-ny-company-data` etc.) exist as manifests or
   executors — listed by name in DEC-20260515-A and DEC-20260515-B.
   `us-court-search` (CourtListener) exists as a manifest and is not among
   DQ-30's three dark capabilities, but its production `visible` flag was
   not queried for this record — only its absence from the dark list is
   established. Docket Alarm was never built.
3. **SI: `slovenian-company-data` still runs on data.gov.si CKAN, and the
   directors gap is documented in its manifest limitations, matching this
   row's AJPES hypothesis in substance.** `manifests/slovenian-company-data.yaml`
   names `data_source` as "Poslovni register Slovenije via data.gov.si
   CKAN datastore," and its `limitations` list carries the exact gap text
   ("Active/dissolved status, registration date, SKD/NACE activity codes,
   statutory representatives (directors), and VAT number are NOT in the
   open feed") with reactivation trigger "a paid AJPES restPrsInfo
   contract with redistribution rights." No `si-company-enrich-openapi` or
   equivalent capability was built — the row's no-build decision was not
   reversed.
4. **The Evidence Tier and use-case tier frameworks: field-level
   mechanism survives, tier labels do not.** `ubo_availability` is live
   and widely implemented (grep across `apps/api/src/capabilities/`
   returns roughly thirty company-data executors using the exact 3-value
   enum this row specifies). A grep for `evidence_tier` and
   `use_case_tier` across `apps/api/src`, `manifests/`, and
   `docs/company/claims.yaml` returns no matches in either case. "Enhanced
   Due Diligence" appears in `aml-risk-score.ts`,
   `risk-narrative-generate.ts`, `solution-catalogue.ts`, and
   `adverse-media-check.yaml` as ordinary compliance vocabulary, not this
   row's T3 label; "Continuity" appears in `dependency-manifest.ts`,
   `transactions.ts`, and `verify.ts` as audit-chain-hash continuity, not
   this row's T1 label. CLAUDE.md's current solution family (KYB
   Essentials / KYB Complete / Invoice Verify, priced €1.50/€2.50/€2.50)
   uses a different tier vocabulary entirely from T1 Continuity / T2
   Onboarding / T3 Enhanced Due Diligence.
5. **Bank verification: no Digiteal handler exists.** A search for
   `digiteal` under `apps/api/src/capabilities/` and `manifests/` finds no
   executor or manifest; `manifests/uk-cop-check.yaml` references "the
   SEPA VoP capability (Digiteal)" as a pointer to a capability that was
   never built. DEC-20260518-C's own premise (blocked "for 0 of 30 EU
   countries until Digiteal ships") remains true in the narrow sense that
   the handler still has not shipped; the row's fix (make bank
   verification optional rather than wait for the handler) is why this no
   longer blocks T1 launch.
6. **`ubo_availability`: producer confirmed, semantics confirmed as
   capability state.** `apps/api/src/capabilities/danish-company-data.ts`
   sets `o.ubo_availability = "unavailable_no_registry"` with
   `o.ubo_availability_reason = "Danish beneficial ownership data
   integration in progress; coverage in v1.1."`;
   `apps/api/src/capabilities/uk-company-data.ts` sets
   `o.ubo_availability = "available"` with `o.ubo_availability_reason =
   "Beneficial ownership data available via UK PSC register."` — both
   match this row's specified outcomes exactly. PR #131
   (`gh pr view 131`) is confirmed merged 2026-05-18 as
   "feat(evidence-tier): labeling sweep across 31 company-data handlers,"
   the same day as this decision.

None of these change a Decision's recorded meaning, so none required a
STOP; all are within the fidelity-and-contradiction-surfacing mandate.

## Relations: the five listed edges, and one deliberate omission

Five relation edges added, exactly as the brief specifies, quoting the
source sentence used for each:

- **DEC-20260515-B → affirms → DEC-20260515-A.** Source: "Parent doctrine
  DEC-20260515-A established US v1 architecture (Tier 1 direct, Tier 2
  Cobalt) using Topograph's 14-state catalog as blueprint. ... This DEC
  implements DEC-20260515-A with concrete per-state assignments." This is
  an implementation of the parent's rule, not a refinement of it —
  `affirms`.
- **DEC-20260518-B → related_to → DEC-20260518-A.** Source: "Existing
  Evidence Tier framework (DEC-20260518-A) defines per-call data
  dimensions (Identity/Bindability/Ownership) but does not specify
  customer-facing product/pricing tiers." A plain mention of a
  distinct-axis sibling decision, not a change to A's rule — `related_to`.
- **DEC-20260518-C → amends → DEC-20260518-B.** Source: "Audit revealed
  DEC-20260518-B's bank-verification-required clause blocks T1 Continuity
  for 0 of 30 EU countries ... The clause was over-spec'd against actual
  T1 use cases ... Path A makes bank verification optional at T1." This
  row explicitly fixes an over-specified clause in the target — `amends`.
- **DEC-20260518-D: PR #131 named, no relation edge.** Source: "PR #131
  /go Pass B M-2 flagged that the ubo_availability flag was being set per
  jurisdictional accessibility ... rather than capability state." PR #131
  is a Git pull request, not a formal decision record, so per the brief
  this is prose provenance only — cited in the record's evidence array as
  a GitHub URL and in Context, never a `relations` entry.
- **DEC-20260515-C names DEC-20260513-F, no relation edge (no record
  exists).** Source: "DEC-20260513-F exempted SI from v1-readiness scoring
  due to structural directors gap ... DEC-20260513-F's SI exemption ...
  stands and is empirically vindicated." No formal candidate record exists
  for DEC-20260513-F on `main` (`ls docs/decisions/records/DEC-20260513-F.md`
  is "no such file"; `DEC-20260513-E.md` exists and is a different id). Per
  the brief and the general rule (relations require an existing record for
  the target), this is prose only, stated in Context and Decision.

No row's text names DEC-20260518-E/F/G.

**One deliberate omission, flagged for review rather than added silently.**
DEC-20260515-A's source text contains an explicit, unambiguous supersession
statement: "PARTIAL SUPERSESSION: Supersedes the v1.1 designation of US
registry, EIN, and litigation capabilities as established in
DEC-20260430-A. All other elements of DEC-20260430-A remain active..." A
formal candidate record for DEC-20260430-A exists on `main`
(`docs/decisions/records/DEC-20260430-A.md`), so a `supersedes` (or
partial-scope equivalent) relation edge would be source-stated and
target-valid under the general relation rule. The brief's own relations
section, however, lists only the five edges above and closes with "No
other edges" as an explicit boundary. Following that instruction literally,
**no `relations` entry was added for this DEC-20260430-A supersession** —
DEC-20260515-A carries `relations: []`. The full PARTIAL SUPERSESSION
clause is preserved verbatim in the Decision section and restated in
Context, so the fact is not lost, only not encoded as a graph edge. This is
flagged here as a probable brief gap rather than resolved unilaterally,
since adding the edge would be a defensible reading of "source-stated
only" but contradicts "No other edges" read literally.

## Register changes

Targeted string edits only, per batch 4-10 method:

- Seven new rows appended to `decision_rows` (the public array), shape
  matching existing `formally_migrated` rows: `page_id`, `id`,
  `title_sha256` copied verbatim from the private projection,
  `historical_status: active`, `source_url`, `record_key`, `disposition:
  formally_migrated`, `evidence: [docs/decisions/records/DEC-....md]`,
  the standard rationale string, inserted immediately before
  `private_rows:` (batch 10's insertion point).
- `formal_records` += seven `notion-row` entries (appended after
  `DEC-20260416-A`, the prior tail).
- `sources.formal_records.record_count`: 68 -> 75.
- `counts.decision_rows.formally_migrated`: 61 -> 68.
- `counts.decision_rows.not_yet_reconciled`: 98 -> 91.
- `digests.public_rows.count`: 209 -> 216.
- `digests.public_rows.digest`:
  `d5d0713343651c8ce863b2f913f7d5ac96026df81827efdd90a1b6c568c68b98` ->
  `0851c210067cd246e239d468a0a9849bf684034cc992c451154e6daa060a87ab`.
- `digests.public_rows.scope_date_digest`:
  `f9b2012784ac59f1f474df7c6eaa574c2f2ae2f2400d2edf301849a9cb7af2e7` ->
  `4b5120b3a80fcc12b28842f910e5b8cf6989da0093ae4781376a1bc2ce07f3ca`
  (recomputed over all 216 public rows' `Scope`/`date:Date:start` triples
  from the raw export at commit `995cece3`, using `scopeDateDigest`; all
  216 rows matched an export row, zero missing).
- `digests.all_rows.digest`:
  `719bdad929c51f542d9d81e66145252d63631bcc5599b48aaaaa689a1a2225bb` ->
  `971e9eaa76ee3a43b28566d8fb0d7cdb80105a8b7c2363043a3ac6b81ca8da89`
  (count stays 318: 216 public + 102 private).
- `private_rows.count`: 109 -> 102; `private_rows.digest`:
  `193e43c6ead8bde9bd826fd0285c5b9ca10ec0997092229424ad3cb797e0bd45` ->
  `1bad095c57d087deb09818d1d954642ffbf168464ab2e7039d4760aefddf3719`;
  `counts_by_disposition.not_yet_reconciled`: 98 -> 91.
  `private_rows.commit` is left at `df544ab605c19793052d3d109c4b4f0c3e7a5a69`
  in this PR; the orchestrator commits the new private half (below) to the
  archive repository and bumps this field afterward.
- Gap `G1`'s `gap` text: "98 preserved Decision rows (97 global, 1
  temporary)..." -> "91 preserved Decision rows (90 global, 1 temporary)...",
  with this batch's seven record ids appended to both the narrative and
  `evidence`.

No line was deleted from the register except as part of the in-place text
replacements above. Specifically, the deleted lines are:
- `count: 209` / `digest: d5d0713343...` / `scope_date_digest: f9b2012784...` (public_rows, replaced)
- `digest: 719bdad929...` (all_rows, digest replaced, count unchanged at 318)
- `formally_migrated: 61` / `not_yet_reconciled: 98` (counts.decision_rows, replaced)
- `record_count: 68` (sources.formal_records, replaced)
- `count: 109` / `digest: 193e43c6ea...` / `not_yet_reconciled: 98` (private_rows, replaced)
- the old G1 `gap:` paragraph (98/97 preserved rows, replaced with the
  91/90 paragraph naming this batch)

No row, gap, or evidence entry was removed.

## Digests computed (all shown above); collected here for convenience

- `public_rows.digest`: `0851c210067cd246e239d468a0a9849bf684034cc992c451154e6daa060a87ab`
- `public_rows.scope_date_digest`: `4b5120b3a80fcc12b28842f910e5b8cf6989da0093ae4781376a1bc2ce07f3ca`
- `all_rows.digest`: `971e9eaa76ee3a43b28566d8fb0d7cdb80105a8b7c2363043a3ac6b81ca8da89`
- `private_rows.digest` (new 102-row projection): `1bad095c57d087deb09818d1d954642ffbf168464ab2e7039d4760aefddf3719`

Computed with `scripts/m2-closure-register-lib.mjs`'s own
`canonicalDigest`/`scopeDateDigest` functions, imported directly (via a
throwaway `.mjs` script run inside the worktree and deleted before commit,
never staged), over the 102-row private file plus the register's 216
public rows plus the full 318-row raw export (all four
`decisions-rows*.json` files fetched read-only from the private archive at
commit `995cece3`).

## Private half for the orchestrator

New 102-row private projection (seven rows removed, nothing else changed,
same layout as the source) written to (NOT committed, per the brief):
`C:/Users/pette/AppData/Local/Temp/claude/C--Users-pette-Projects-strale/4f68dcca-de52-4ade-b2b2-8341f736268e/scratchpad/2026-09-02-m2-closure-private-rows.batch11.yaml`

## Checks run

- `npm run archive:index` (before `context:generate`, per the brief), run
  twice (before and after this handoff file existed, so the index counts
  it): first run "233 handoff files indexed," final run "Wrote
  archive/README.md and handoff/README.md (234 handoff files indexed)."
- `npm run context:generate`: 13 non-authoritative project-context files
  regenerated; five protected sections present on all seven new records.
- `npm run context:check`: warning-only mode; "no warnings," exit 0, run
  after staging every generated file.
- `npm run context:test`: green, 133/133 on a clean rerun (a first
  concurrent run against a stale `node --test` process reported a
  transient 1-of-74 failure in `m2-closure-register.test.mjs`; rerun in
  isolation and rerun again as the full `context:test` bundle both came
  back 133/133 and 60/60 respectively — treated as test-runner contention
  from running two `node --test` invocations at once in this worktree, not
  a real failure, since no register edit occurred between the failing and
  passing runs).
- `npm run programs:check`: `ok docs/programs/cto-readiness/tracks.yaml`
  (untouched by this batch, per the constraint).
- `npm run codex:check`: `ok codex re-review backlog`; 17 pre-existing
  rows awaiting Codex, none added or touched by this batch (per the
  constraint not to touch `docs/programs/**`; the orchestrator adds this
  batch's row after merge, as observed for batches 4-10).
- `npm run receipts:check`: `ok receipts contract`; 7 pre-existing
  `HANDOFF_BARE_TEST_COUNT` warnings on older handoffs, unrelated to this
  batch; this handoff itself avoids a bare count.
- `node --test scripts/m2-closure-register.test.mjs
  scripts/decision-records.test.mjs`: green, 92/92. CI is the gate.
- `node scripts/generate-archive-index.mjs --check`: "archive/README.md
  and handoff/README.md up to date."
- `node scripts/m2-closure-verify-private-rows.mjs`: 49 `FAIL` lines, all
  in the expected private count/digest classes and their direct
  consequences (the archive-repo file at the recorded commit `df544ab6`
  still holds 109 rows, seven of which are now also public, so the
  operator script correctly reports `EXPORT_ROW_DUPLICATE` x7,
  `PRIVATE_ROW_ALSO_PUBLIC`/`PRIVATE_ROW_ALREADY_PUBLIC` x7,
  `PRIVATE_ROW_MUST_BE_PUBLIC` (2 forms per row) x14,
  `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID` x7, the two
  `PRIVATE_COUNT_MISMATCH` lines, `PRIVATE_DIGEST_MISMATCH`, and
  `ALL_ROWS_DIGEST_MISMATCH`). None is a schema, evidence, derivation-rule,
  or record-citation failure: every failure traces to the private file at
  the archive commit not yet reflecting this batch's seven removed rows,
  exactly what the brief says to expect until the orchestrator commits the
  private half and bumps `private_rows.commit`.
- `validatePrivateProjection` (imported directly from
  `scripts/m2-closure-register-lib.mjs`, positional signature
  `(register, privateRows, { schema, collisions, context })`) run against
  this PR's register plus the new 102-row private file plus
  `docs/decisions/id-collisions.yaml`: **0 findings.**

## Anything not verified

- `us-court-search`'s production `visible` / `x402_enabled` flags were not
  queried against the read-only prod DB; only its absence from DQ-30's
  three named dark capabilities was established from the repository text.
- The DEC-20260430-A supersession relation was deliberately not added by
  the batch worker; see "Relations" above and the orchestrator note below.

## Deviations from the brief

One: the DEC-20260430-A supersession relation on DEC-20260515-A was found
in source text but not added as a `relations` entry, per the brief's "No
other edges" instruction taken literally over the general "source-stated
only" relation rule. Flagged above rather than resolved unilaterally.

Orchestrator resolution (2026-09-04, before the independent review):
the edge WAS added in a follow-up commit. DEC-20260515-A now carries
`amends DEC-20260430-A`, typed `amends` rather than `supersedes` because
the source says "All other elements of DEC-20260430-A remain active" and
the relation semantics in `scripts/decision-records-lib.mjs` require a
superseded target to change status. The passages above that say
DEC-20260515-A carries `relations: []` describe the worker's head, not
the PR's final head. The independent review confirmed the typing.

Otherwise none identified. Every other deliverable, check, and constraint
in the brief was met as specified. The `.mjs` digest-computation and
validation scripts used during this batch were run inside the worktree and
deleted before the final `git add`, never staged or committed (verified:
`git status --short` before commit shows only the seven new record files
and the register-derived generated-file changes plus this handoff,
matching the constraint list exactly).
