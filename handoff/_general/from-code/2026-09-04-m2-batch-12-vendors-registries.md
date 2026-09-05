Intent: land T10 (M2 exit-gap closure) batch 12, twelve vendor and registry
sourcing Decision rows (DEC-20260320-E OpenSanctions pricing, DEC-20260405-A
Swedish Bolagsverket migration, DEC-20260505-G Implisense backup tier,
DEC-20260505-H/DEC-20260507-E/DEC-20260508-D the OpenRegister sequence,
DEC-20260506-G no-fixed-cost stance, DEC-20260507-D no-BYO-credentials
pattern, DEC-20260507-F Kyckr rejection, DEC-20260507-G BG/CY Tier-1
self-build, DEC-20260507-H/DEC-20260508-A the LU/HU gap-recovery sequence)
as active formal candidate records, contradiction-checked against the live
Swedish/German/BG/CY/LU/HU capabilities, `config/env-manifest.yaml`'s vendor
rows, `docs/company/DECISION-QUEUE.md`'s DQ-30, and the readiness program's
retirement of the Counterparty Assurance framing, with the register's counts
and digests made true again against the private archive.

## What this batch is

Twelve rows resolved from the private projection at archive commit
`012492be51e589ec8f327fe11746727343bd94ef` (102 rows, the commit recorded in
the register at launch time, matching origin/main after PR #532). All twelve
matched exactly on `id` in the private file: `historical_status: active`,
`historical_scope: global`, `disposition: not_yet_reconciled`, `decided_at`
spanning 2026-03-20 to 2026-05-08, and page ids matching the brief's table
exactly. None collided (`docs/decisions/id-collisions.yaml` has no
`DEC-20260320-E`, `DEC-20260405-A`, `DEC-20260505-G/H`, `DEC-20260506-G`,
`DEC-20260507-D/E/F/G/H`, or `DEC-20260508-A/D` entry), none was a Git-native
protocol label (no match in `CLAUDE.md`/`AGENTS.md` headings), none had an
existing record (`ls docs/decisions/records/` grepped for each id: all "no
such file" before this batch). Each is now a formal candidate record under
`docs/decisions/records/`, five protected sections (Decision, Context,
Rationale, Consequences, Reversal conditions), scope `product` for
DEC-20260506-G and DEC-20260507-D (sourcing doctrine and product pattern,
per the brief) and scope `technical` for the other ten (vendor and registry
integration choices). `owner: petter`, `authority_scope: none`,
`authority_active: false`, `migration_status: candidate`, `phase: M2`.

Full Notion content (`Decision`, `Rationale`, `Outcome`, `Confidence`,
`Source`, `date:Date:start`) was read read-only from
`strale-io/strale-context-archive` at commit
`995cece3fe4abfb8b0bef0cccbd58191a6dab83c` (the four `decisions-rows*.json`
export files, via a local read-only checkout at
`C:/Users/pette/Projects/strale-context-archive`, never modified or
committed there). All twelve page ids resolved to exactly one row each
(matched by dashed UUID against each row's `id` field); no other row's
content was read into any of the twelve records. `Outcome` was `null` for
eleven of the twelve; `DEC-20260320-E` is the only row with a non-null
Outcome ("Pricing confirmed. No action needed yet. Capabilities in draft
state pending OPENSANCTIONS_API_KEY configuration on Railway. Will revisit
when approaching production volume."), captured in its record's Context.

## Per-record fidelity: what was kept, what was compressed

- **DEC-20260320-E** (OpenSanctions pricing): kept the EUR 0.10/call
  Commercial tier figure, the named contact (Jack Popescu, Senior AE,
  contact email), the bulk-license 40K-plus-calls threshold, and the
  Outcome's Railway-configuration note verbatim.
- **DEC-20260405-A** (Swedish Bolagsverket migration): kept all four
  affected capabilities, the SQS/success-rate figures, the SEK/EUR setup and
  monthly figures, the four-phase migration plan, the structural gate
  sentence, and the RELATED list verbatim.
- **DEC-20260505-G** (Implisense backup tier): kept the caching-clause quote,
  the three structural-issue numbered list, the USD Pro/Ultra pricing step,
  the corrected "unit economics murdered" framing, and the three
  keep-the-relationship reasons verbatim.
- **DEC-20260505-H** (OpenRegister Free tier first): kept the co-founder's
  name and confirmations, the published Pro pricing (EUR 59/month, 5,000
  credits, per-credit overage), the "Strale100" trial code, and the storage
  clause quote verbatim.
- **DEC-20260506-G** (no-fixed-cost stance): kept the two cited prior
  findings (by id, as prose since neither has a record), the explicit
  trade-off statement, and the policy-formalization framing verbatim.
- **DEC-20260507-D** (no-BYO-credentials pattern): kept the ICP framing, the
  four named UBO sources, the "not available" coverage response, and the
  CA-product-page edit implication verbatim.
- **DEC-20260507-E** (OpenRegister Pro tier planned): kept the EUR 59/month
  figure, the credit and discount terms, the "Strale100" trial reference,
  and the audit-trail-after-cancellation open question verbatim.
- **DEC-20260507-F** (Kyckr rejection): kept both ToS clause numbers (3.2(b),
  2.1), the Openapi-fallback country list (IT/ES/PT/AT), the gap-5 Tier-1
  candidate list, the case 151296 reference, and the bits.bi competitive-
  intelligence caveat verbatim.
- **DEC-20260507-G** (BG/CY Tier-1 self-build): kept both licence names
  (CC-0, CC-BY), both source portals, both company-count estimates, the
  KBO/ONRC reuse-pattern reference, and the three open-questions list
  verbatim.
- **DEC-20260507-H** (LU/HU deferred): kept both countries' specific vendor
  paths (LBR enterprise API; companyapi.hu pricing), the "no multi-country
  aggregator backup" conclusion, and the explicit-per-country revival-
  trigger framing verbatim.
- **DEC-20260508-A** (HU refined): kept the OCCSZ Disztributor clause number
  (Section 16), the HUF/EUR fixed-minimum breakdown, both per-extract
  prices, the four disqualified Tier-2 wrapper reasons (with clause
  numbers), the blended-COGS calculation, and the explicit refinement
  statement against DEC-20260507-H verbatim.
- **DEC-20260508-D** (OpenRegister DE audit-retention confirmed): kept the
  co-founder's written confirmation date, the Pro/Business-vs-Enterprise
  distinction, the EUR 1,000/month six-month-minimum figure, the "resolves
  the gating condition" self-reference to DEC-20260505-H, and the quoted
  commitment sentence verbatim.

## Contradictions found and how they are stated

All stated as dated "status on 2026-09-04" notes in each record's
Consequences section, never editing the Decision/Rationale/Outcome text:

1. **OpenSanctions was dropped 2026-04-27; the key is still registered on
   purpose.** `DEC-20260320-E`'s Consequences cites commit `16ca790`,
   `DEC-20260429-A`, and `config/env-manifest.yaml`'s `OPENSANCTIONS_API_KEY`
   row, whose `cost_note` states plainly that no code reads it and that the
   key and account are kept on purpose per DQ-30 and the founder's 2026-09-03
   call. `docs/company/DECISION-QUEUE.md` DQ-30 is quoted: "leave Cobalt,
   EINsearch and sec-api in place, he will activate them later; and keep the
   OpenSanctions and USPTO accounts rather than closing them, since we might
   need them."
2. **The Swedish migration this row parked was completed, not deferred.**
   `apps/api/src/capabilities/swedish-company-data.ts` fetches Bolagsverket
   directly, with a code comment reading "DEC-20260405-A Phase 2: replaced
   Allabolag scraping with direct Bolagsverket API." The migration commit
   (`cb787ed9`, 2026-04-22) postdates this row's own "PARKED 2026-04-09" note
   by thirteen days and precedes any independently verified revival trigger.
   The audit doc this row cites (`tasks/2026-04-09-bolagsverket-audit.md`)
   moved to `archive/sessions/tasks/2026-04-09-bolagsverket-audit.md`; the
   current path is cited.
3. **Implisense has no live code anchor; German data runs exclusively on
   OpenRegister.** `apps/api/src/capabilities/german-company-data.ts` fetches
   only `https://api.openregister.de`; no `implisense` reference exists
   anywhere under `apps/api/src`, and `config/env-manifest.yaml` has no
   Implisense-named row. Stated on `DEC-20260505-G`.
4. **OpenRegister is wired and live; the tier billed in production (Free,
   trial Pro, or paid Pro) is not recorded in the manifest or env-manifest.**
   Stated identically, with the same evidence, on `DEC-20260505-H`,
   `DEC-20260507-E`, and `DEC-20260508-D`: `OPENREGISTER_API_KEY` is
   `required_in: [production]`, `set_in: [railway]`, with no dormancy
   `cost_note` (unlike `OPENSANCTIONS_API_KEY`'s explicit one). The
   audit-retention question `DEC-20260505-H` deferred was answered the next
   day by `DEC-20260508-D`, whose own text says it "resolves the gating
   condition from DEC-20260505-H."
5. **No Kyckr code exists on `main`, as expected; Cobalt is a separate,
   US-scoped vendor and its presence is not evidence against the Kyckr
   rejection.** Stated on `DEC-20260507-F`, citing `DEC-20260515-B`'s
   already-formal record rather than repeating the US Tier-2 investigation.
6. **BG, CY, LU, and HU all shipped on Openapi.com WW-Top, the Tier-3
   aggregator, not on the doctrine-clean direct self-build (BG/CY) or the
   deferred-pending-trigger status (LU/HU) these rows decided; all four are
   currently gated off pending a legal countersignature (case 151296).**
   Stated on `DEC-20260507-G`, `DEC-20260507-H`, and `DEC-20260508-A`, each
   citing its own manifest's `data_source: Openapi.com WW-Top` and
   `limitations` entry ("Gated behind `OPENAPI_ENABLED` flag pending resale
   addendum countersignature"), plus `config/env-manifest.yaml`'s
   `OPENAPI_ENABLED` row ("MUST stay 'false' in production until the resale
   addendum is countersigned"). Commit `84398f7`, named by DEC-20260507-G and
   DEC-20260507-H as the gap-recovery spike's source, does not resolve in
   this repository's history (`git cat-file -e 84398f7` fails); both records
   state this and go no further.
7. **The no-BYO stance is unaffected by x402, and the Counterparty Assurance
   framing its ICP language cites was retired four months later.** Stated on
   `DEC-20260507-D`: CLAUDE.md's x402 paragraph ("No signup or API key
   needed, payment IS the auth") governs customer-to-Strale authentication,
   a different mechanism from this row's Strale-to-vendor sourcing rule; the
   two are compatible, not in tension. `DEC-20260812-A`'s retirement of
   Counterparty Assurance as the primary product is quoted.
8. **The no-fixed-cost stance predates, and is narrower than, the operating
   charter's EUR 50/week spend envelope.** Stated on `DEC-20260506-G`, citing
   `docs/company/CHARTER.md` lines 43, 47, and 399, and noting
   `docs/company/BUDGET.md` tracks roughly EUR 4.08 to EUR 4.30 against the
   envelope without naming any of this row's specific vendor candidates by
   line item.

None of these change a Decision's recorded meaning, so none required a STOP;
all are within the fidelity-and-contradiction-surfacing mandate.

## Relations: the edges added, and how each was derived

Nine relation edges added across the twelve records, each source-stated and
quoted in the record itself:

- **DEC-20260508-A -> amends -> DEC-20260507-H.** Source (DEC-20260508-A's
  own title/Decision): "Refines HU portion of DEC-20260507-H; LU portion
  unchanged."
- **DEC-20260508-D -> amends -> DEC-20260505-H.** Source: "Resolves the
  gating condition from DEC-20260505-H ('defer Pro commitment until
  audit-retention terms confirmed in writing')."
- **DEC-20260505-G -> related_to -> DEC-20260505-H.** Source: "incompatible
  with Strale's primary v1 stored-with-refresh architecture (per
  DEC-20260505-H selecting OpenRegister as primary)," a plain mention of the
  sibling decision, not a change to its rule.
- **DEC-20260507-E -> affirms -> DEC-20260506-G.** Source: "EUR 59/month
  consistent with DEC-20260506-G no-fixed-cost stance (default, not hard
  cap)," confirming compliance with the cited policy.
- **DEC-20260507-F -> related_to -> DEC-20260506-G.** Source: "Sales-gated
  pricing ... collides with DEC-20260506-G no-fixed-cost stance," a mention
  of a conflict, per the brief's own worked example.
- **DEC-20260507-F -> affirms -> DEC-20260428-A.** Source: "every direct
  Tier-1 candidate ... is doctrinally cleaner per DEC-20260428-A."
- **DEC-20260507-G -> affirms -> DEC-20260428-A.** Source: "verified both as
  Tier-1 doctrine-clean per DEC-20260428-A."
- **DEC-20260507-H -> related_to -> DEC-20260506-G.** Source: "conflicts with
  DEC-20260506-G" (named twice, once for each country).
- **DEC-20260507-H -> related_to -> DEC-20260507-F.** Source: "With Kyckr
  rejected per DEC-20260507-F, no multi-country aggregator backup remains."
- **DEC-20260405-A -> related_to -> DEC-20260320-B.** Source: "RELATED: ...
  DEC-20260320-B (Capability Onboarding Pipeline)" (a plain "RELATED:" list
  mention).

**Ids named in source text with no relation edge, per the general rule (a
relation target must be an existing record):** `DEC-20260405-B` (no record),
`DEC-20260225-P-m5n6` (no record; different id grammar entirely, mentioned in
`DEC-20260405-A`'s Context as prose only), `DEC-20260422-H` and
`DEC-20260506-F` (both mentioned in `DEC-20260506-G`'s Context, neither has a
record). `DEC-20260507-D` names no other DEC id in its source text and
carries `relations: []`.

## Register changes

Targeted string edits only, per batch 4-11 method:

- Twelve new rows appended to `decision_rows` (the public array), shape
  matching existing `formally_migrated` rows: `page_id`, `id`,
  `title_sha256` copied verbatim from the private projection,
  `historical_status: active`, `source_url`, `record_key`, `disposition:
  formally_migrated`, `evidence: [docs/decisions/records/DEC-....md]`, the
  standard rationale string, inserted immediately before `private_rows:`
  (batch 10/11's insertion point).
- `formal_records` += twelve `notion-row` entries (appended after
  `DEC-20260518-D`, the prior tail).
- `sources.formal_records.record_count`: 75 -> 87.
- `counts.decision_rows.formally_migrated`: 68 -> 80.
- `counts.decision_rows.not_yet_reconciled`: 91 -> 79.
- `digests.public_rows.count`: 216 -> 228.
- `digests.public_rows.digest`:
  `0851c210067cd246e239d468a0a9849bf684034cc992c451154e6daa060a87ab` ->
  `492a17a37d2cdf5b11423ff51ff01a97d66c895f99906524326384a6d56d8aa0`.
- `digests.public_rows.scope_date_digest`:
  `4b5120b3a80fcc12b28842f910e5b8cf6989da0093ae4781376a1bc2ce07f3ca` ->
  `55643675e7a2d801533712c5ba8097d1b07cd35407f8554bb6c19aded368bb81`.
  Orchestrator correction: the batch worker had left this digest unchanged
  on the reading that it commits to the whole archive's triples. It commits
  to the PUBLIC rows' page_id/scope/date triples only (the lib's
  compareRowsToExport filters rows without clear scope/date), so twelve rows
  moving from private to public change it. Recomputed from the export at
  the archive commit; the operator verifier then printed ok.
- `digests.all_rows.digest`:
  `971e9eaa76ee3a43b28566d8fb0d7cdb80105a8b7c2363043a3ac6b81ca8da89` ->
  `e80c7e4ad14d53bcb2eb8d99a63b202230fea05e758dbf6299c2166653925918` (count
  stays 318: 228 public + 90 private).
- `private_rows.count`: 102 -> 90; `private_rows.digest`:
  `1bad095c57d087deb09818d1d954642ffbf168464ab2e7039d4760aefddf3719` ->
  `0aa61fe37252924ce775efbc08f1ff0ceee045e6d2a2c16993f1d55c4c553895`;
  `counts_by_disposition.not_yet_reconciled`: 91 -> 79.
  `private_rows.commit` is left at `012492be51e589ec8f327fe11746727343bd94ef`
  in this PR; the orchestrator commits the new private half (below) to the
  archive repository and bumps this field afterward.
- Gap `G1`'s `gap` text: "91 preserved Decision rows (90 global, 1
  temporary)..." -> "79 preserved Decision rows (78 global, 1
  temporary)...", with this batch's twelve record ids appended to both the
  narrative and `evidence`.

No line was deleted from the register except as part of the in-place text
replacements above. Specifically, the deleted lines are:
- `count: 216` / `digest: 0851c210067c...` (public_rows, replaced; `scope_date_digest` replaced too, see the correction above)
- `digest: 971e9eaa76ee...` (all_rows, digest replaced, count unchanged at 318)
- `formally_migrated: 68` / `not_yet_reconciled: 91` (counts.decision_rows, replaced)
- `record_count: 75` (sources.formal_records, replaced)
- `count: 102` / `digest: 1bad095c57d0...` / `not_yet_reconciled: 91` (private_rows, replaced)
- the old G1 `gap:` paragraph (91/90 preserved rows, replaced with the 79/78
  paragraph naming this batch)

No row, gap, or evidence entry was removed.

## Digests computed (all shown above); collected here for convenience

- `public_rows.digest`: `492a17a37d2cdf5b11423ff51ff01a97d66c895f99906524326384a6d56d8aa0`
- `public_rows.scope_date_digest`: `55643675e7a2d801533712c5ba8097d1b07cd35407f8554bb6c19aded368bb81` (orchestrator recomputation)
- `all_rows.digest`: `e80c7e4ad14d53bcb2eb8d99a63b202230fea05e758dbf6299c2166653925918`
- `private_rows.digest` (new 90-row projection): `0aa61fe37252924ce775efbc08f1ff0ceee045e6d2a2c16993f1d55c4c553895`

Computed with `scripts/m2-closure-register-lib.mjs`'s own
`canonicalDigest`/`scopeDateDigest` functions, imported directly (via a
throwaway `.mjs` script run inside the worktree and deleted before commit,
never staged), over the 90-row private file plus the register's 228 public
rows.

## Private half for the orchestrator

New 90-row private projection (twelve rows removed, nothing else changed,
same layout as the source) written to (NOT committed, per the brief):
`C:/Users/pette/AppData/Local/Temp/claude/C--Users-pette-Projects-strale/4f68dcca-de52-4ade-b2b2-8341f736268e/scratchpad/2026-09-02-m2-closure-private-rows.batch12.yaml`

## Checks run

- `npm run archive:index` (before `context:generate`, per the brief): "Wrote
  archive/README.md and handoff/README.md (234 handoff files indexed)."
- `npm run context:generate`: 13 non-authoritative project-context files
  regenerated; five protected sections present on all twelve new records.
- `npm run context:check`: warning-only mode; "no warnings," exit 0, run
  after `git add -A` staged every new/generated file (the check reads
  identity from the git index, so warnings about the new page ids/records
  "not published" appear only before staging, as expected).
- `npm run context:test`: green, 133/133.
- `npm run programs:check`: `ok docs/programs/cto-readiness/tracks.yaml`
  (untouched by this batch, per the constraint).
- `npm run codex:check`: `ok codex re-review backlog`; 18 pre-existing rows
  awaiting Codex (CX-1 through CX-18), none added or touched by this batch
  (per the constraint not to touch `docs/programs/**`; the orchestrator adds
  this batch's row after merge, as observed for batches 4-11).
- `npm run receipts:check`: `ok receipts contract`; 7 pre-existing
  `HANDOFF_BARE_TEST_COUNT` warnings on older handoffs, unrelated to this
  batch; this handoff itself avoids a bare count.
- `node --test scripts/m2-closure-register.test.mjs
  scripts/decision-records.test.mjs`: green, 92/92. CI is the gate.
- `node scripts/generate-archive-index.mjs --check`: "archive/README.md and
  handoff/README.md up to date."
- `node scripts/m2-closure-verify-private-rows.mjs`: 80 `FAIL` lines, all in
  the expected private count/digest classes and their direct consequences
  (the archive-repo file at the recorded commit `012492be` still holds 102
  rows, twelve of which are now also public, so the operator script
  correctly reports `PRIVATE_ROW_ALSO_PUBLIC` x12,
  `PRIVATE_ROW_ALREADY_PUBLIC` x12, `PRIVATE_ROW_MUST_BE_PUBLIC` (2 forms
  per row) x24, `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID` x12, the two
  `PRIVATE_COUNT_MISMATCH` lines, `PRIVATE_DIGEST_MISMATCH`, and
  `ALL_ROWS_DIGEST_MISMATCH`). None is a schema, evidence, derivation-rule,
  or record-citation failure: every failure traces to the private file at
  the archive commit not yet reflecting this batch's twelve removed rows,
  exactly what the brief says to expect until the orchestrator commits the
  private half and bumps `private_rows.commit`.
- `validatePrivateProjection` (imported directly from
  `scripts/m2-closure-register-lib.mjs`, positional signature `(register,
  privateRows, { schema, collisions, context })`) run against this PR's
  register plus the new 90-row private file plus
  `docs/decisions/id-collisions.yaml`: **0 findings.**

## Anything not verified

- Which billing tier (Free, trial Pro, or paid Pro) OpenRegister is actually
  billed against in production; the manifest and env-manifest do not record
  this, and no read-only prod query was run for it.
- Whether Bulgaria's, Cyprus's, Luxembourg's, or Hungary's Openapi-gated
  capabilities have had `OPENAPI_ENABLED` flipped to `true` in production
  since case 151296; only the repository's static gate state was read.
- Why the shipped BG/CY/LU/HU implementation diverged from the direct
  self-build (BG/CY) and deferred (LU/HU) paths these rows decided; flagged
  as a finding in each record's Consequences, not resolved.

## Deviations from the brief

None identified. Every deliverable, check, and constraint in the brief was
met as specified. The `.mjs` digest-computation and validation scripts used
during this batch were run inside the worktree and the scratchpad directory
and deleted or left outside the worktree before the final `git add`, never
staged or committed (verified: `git status --short` before commit shows only
the twelve new record files, the register edit, and the generated-file
changes plus this handoff, matching the constraint list exactly).
