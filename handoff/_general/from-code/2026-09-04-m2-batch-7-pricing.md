Intent: land T10 (M2 exit-gap closure) batch 7, five capability-pricing Decision rows (DEC-20260302-A-0001 the original value-tier framework, DEC-20260308-1 EUR as pricing currency, DEC-20260320-F the EUR 0.25 compliance-screening uniform price on an OpenSanctions cost basis, DEC-20260411-A the cost-structure re-founding, DEC-20260513-E the HR/CH price normalization) as inactive formal candidate records, surfacing every live contradiction with today's prices and vendors as dated Consequences notes, with the register's counts and digests made true again against the private archive.

## What this batch is

Five rows resolved from the private projection at archive commit
`8f331de9` (131 rows). All five matched exactly on `id` in the private
file: `historical_status: active`, `historical_scope: global`,
`disposition: not_yet_reconciled`. None collided
(`docs/decisions/id-collisions.yaml` has no entry for any of the five
ids), none was a Git-native protocol label, none had an existing record
(`docs/decisions/records/` had no matching filename before this batch).
Each is now a formal candidate record under `docs/decisions/records/`,
five protected sections (Decision, Context, Rationale, Consequences,
Reversal conditions), `scope: product` (pricing is a product-catalog
decision, not purely technical or operational; noted in each Context),
`owner: petter`, `authority_scope: none`, `authority_active: false`,
`migration_status: candidate`, `phase: M2`.

Full Notion content (`Decision`, `Rationale`, `Outcome`, `Scope`,
`Confidence`, `Source`) was read read-only from
`strale-io/strale-context-archive` at commit `995cece3` (same commit
batches 4-6 used), matching each row by page id with dashes stripped
against the four `decisions-rows*.json` export files. All five page ids
resolved to exactly one row each; no other row's content was read into
any of the five records.

## Contradictions found and how they are stated

All stated as dated "status on 2026-09-04" notes in each record's
Consequences section, never editing the Decision/Rationale/Outcome text:

1. **Vendor basis changed (DEC-20260320-F).** The row prices
   `sanctions-check`, `pep-check`, `adverse-media-check` at a uniform
   EUR 0.25, computed as 60% margin on an OpenSanctions cost of EUR 0.10
   per call. CLAUDE.md and the formal record `DEC-20260429-A` both confirm
   OpenSanctions was dropped 2026-04-27 (commit `16ca790`, resolves on
   `main`), single-vendor on Dilisense since. The row's margin arithmetic
   is stated as historical; this batch does not recompute a margin against
   Dilisense's cost, which was not verified.
2. **Current prices differ from every row's stated target.** Read
   `price_cents` from the six named manifests on `main`:
   `sanctions-check` 20 cents (EUR 0.20, not `DEC-20260320-F`'s EUR 0.25
   target), `pep-check` 5 cents (EUR 0.05, not EUR 0.25 nor its previous
   EUR 0.15), `adverse-media-check` 20 cents (EUR 0.20, not EUR 0.25),
   `vat-validate` 2 cents (EUR 0.02, matching `DEC-20260411-A`'s
   "algorithmic = EUR 0.02" band and confirming that specific fix landed),
   `croatian-company-data` and `swiss-company-data` both 5 cents (EUR
   0.05, matching `DEC-20260513-E`'s Outcome exactly). CLAUDE.md's
   capabilities section states the same pep-check/adverse-media-check
   figures. Per CLAUDE.md's drift-prevention rule, this batch states these
   figures as read from manifests and CLAUDE.md, the public sources, and
   does not claim what production actually charges.
3. **Framework succession (DEC-20260302-A-0001 vs DEC-20260411-A).**
   `DEC-20260411-A`'s title states directly: "price by cost structure, not
   by perceived value" - a direct rejection of `DEC-20260302-A-0001`'s
   value-tier markup mechanism. Neither row's extracted Notion text cites
   the other's ID or uses an explicit supersession verb ("replaces",
   "supersedes"); `DEC-20260411-A`'s Rationale instead grounds itself in a
   specific 2026-04-11 pricing audit without naming the earlier framework.
   Given the absence of an explicit citation or supersession verb, this
   batch records the relation on `DEC-20260411-A` as `amends` (the
   weaker-wording fallback the brief specified), not `supersedes`, and
   leaves `DEC-20260302-A-0001`'s `status: active` unchanged, per that
   row's own `Status: active` in the archive export - a status change is
   not this batch's decision to make. Both records' Consequences describe
   the tension in prose.
4. **The band.** Every price and band named across all five rows (EUR
   0.02 to EUR 0.50 in `DEC-20260411-A`'s bands, EUR 0.25 in
   `DEC-20260320-F`, EUR 0.05 in `DEC-20260513-E`) sits inside the
   readiness charter's EUR 0.02 to EUR 1.00 band
   (`docs/company/CHARTER.md`); no record sets a price outside it. Named
   solution bundle prices (KYB Complete EUR 2.50, Customer Risk Screen EUR
   1.00, from CLAUDE.md) are stated as bundle prices, not per-capability
   prices, outside the per-capability band by design.
5. **Currency (DEC-20260308-1).** The row's Rationale states directly:
   "Stablecoin rails (USDC) are ledger-level and unaffected by Stripe
   checkout currency," naming USDC explicitly. `DEC-20260502-A`
   (`docs/decisions/records/DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6.md`)
   confirms the anticipated mechanism on `main` today: x402 converts the
   canonical EUR price through a single `EUR_USD_RATE`
   (`apps/api/src/lib/x402-gateway.ts`) rather than a separate USD tier.
   `related_to` added on `DEC-20260308-1` targeting that record key, per
   the brief's explicit USDC-naming trigger.

None of these change a Decision's recorded meaning, so none required a
STOP; all are within the fidelity-and-contradiction-surfacing mandate.

## Relations: the edges added, and the ones that were not

- `DEC-20260308-1` `related_to` `DEC-20260502-A--notion-35467c87082c8124bcc5e2c2597c76c6`,
  quoted above (USDC named explicitly in the source text).
- `DEC-20260411-A` `amends` `DEC-20260302-A-0001` (weaker-wording fallback;
  no explicit citation or supersession verb in the source text, but a
  direct thematic rejection - "price by cost structure, not by perceived
  value" against the earlier row's "value-tier markup").
- `DEC-20260320-F` names `DEC-20260320-E` in its Rationale ("OpenSanctions
  commercial API confirmed at EUR 0.10/call (DEC-20260320-E)"); no record
  exists for that id on `main` and it is not in
  `docs/decisions/id-collisions.yaml`, so it is a prose mention only, per
  this batch's relation-edge scope.
- The brief anticipated `DEC-20260513-E` might name `DEC-20260506-D`; the
  extracted Notion text for that row does not contain that id anywhere
  (checked by string search over the full Rationale/Outcome fields). No
  mention was added; this is noted as a deviation below.
- `DEC-20260302-A-0001`, `DEC-20260320-F`, `DEC-20260513-E` otherwise carry
  `relations: []`.

## Commit verification

`git cat-file -e 16ca790^{commit}` and `git cat-file -e 86b04be^{commit}`
both resolve on `main` (full shas `16ca790ef8dc4dc94e2733b4c660786d9be61255`
and `86b04be6d3cea2a4d2618c806b9602fb77adf068`), cited as full-sha GitHub
commit URLs in `DEC-20260320-F` and `DEC-20260513-E` respectively.

## Register changes

Targeted string edits only, per batch 4-6 method:

- Five new rows appended to `decision_rows` (the public array), shape
  matching existing `formally_migrated` rows: `page_id`, `id`,
  `title_sha256` copied verbatim from the private projection,
  `historical_status: active`, `source_url`, `record_key`, `disposition:
  formally_migrated`, `evidence: [docs/decisions/records/DEC-....md]`,
  standard rationale string.
- `formal_records` += five `notion-row` entries (appended after
  `DEC-20260904-B`, the current tail of the list).
- `sources.formal_records.record_count`: 46 -> 51.
- `counts.decision_rows.formally_migrated`: 39 -> 44.
- `counts.decision_rows.not_yet_reconciled`: 120 -> 115.
- `digests.public_rows.count`: 187 -> 192.
- `digests.public_rows.digest`:
  `fe7243e994918cb2dd8017c342609cc8b1426a736657e866787df2a6768afb03` ->
  `81638be3e74a784617effbf502f196c0a419b10a5046ec39c3859cbaf8227c1e`.
- `digests.public_rows.scope_date_digest`:
  `011d90e60b6532217dc422ab918f08e000d7295fcfca9f7b8d8b6417615de522` ->
  `bce8ef3ef19038f9c9fcf75da47eab8c782bcdce186f291b190b95c927c13b65`
  (recomputed over all 192 public rows' `Scope`/`date:Date:start` triples
  from the raw export, per `compareRowsToExport`'s definition).
- `digests.all_rows.digest`:
  `ebd5a12ed6ffa82defaa3fbd127ccdf392b2d4fc1cf5dafe7094cf89ad45cd08` ->
  `9cc1609ee82f79bd79b4f8e5d69441af734748e14c1e6896189f9138b397b759` (count
  stays 318: 192 public + 126 private).
- `private_rows.count`: 131 -> 126; `private_rows.digest`:
  `ce10b812b169976c3d7736fc718671f99afa56fb8b5f076b133bbd394a4b716a` ->
  `c13991c33d02919cbbc7515a7e3fac60a5f4beb83f92481a8e3d30ffc0a788a0`;
  `counts_by_disposition.not_yet_reconciled`: 120 -> 115.
  `private_rows.commit` is left at `8f331de956f7fb8063e293604b89e4f347175534`
  in this PR; the orchestrator commits the new private half (below) to the
  archive repository and bumps this field afterward.
- Gap `G1`'s `gap` text: "120 preserved Decision rows (119 global, 1
  temporary)..." -> "115 preserved Decision rows (114 global, 1
  temporary)...", with this batch's five record ids appended to both the
  narrative and `evidence`.

No line was deleted from the register except as part of the in-place text
replacements above (the old digest/count values and the old G1 gap
sentence); no row, gap, or evidence entry was removed.

## Digests computed (all shown above); collected here for convenience

- `public_rows.digest`: `81638be3e74a784617effbf502f196c0a419b10a5046ec39c3859cbaf8227c1e`
- `public_rows.scope_date_digest`: `bce8ef3ef19038f9c9fcf75da47eab8c782bcdce186f291b190b95c927c13b65`
- `all_rows.digest`: `9cc1609ee82f79bd79b4f8e5d69441af734748e14c1e6896189f9138b397b759`
- `private_rows.digest` (new 126-row projection): `c13991c33d02919cbbc7515a7e3fac60a5f4beb83f92481a8e3d30ffc0a788a0`

Computed with `scripts/m2-closure-register-lib.mjs`'s own
`canonicalDigest`/`scopeDateDigest` functions, imported directly, over the
126-row private file plus the register's public rows plus the full 318-row
raw export (all four `decisions-rows*.json` files fetched read-only from
the private archive at commit `995cece3`).

## Private half for the orchestrator

New 126-row private projection (five rows removed, nothing else changed,
same layout as the source) written to (NOT committed, per the brief):
`C:/Users/pette/AppData/Local/Temp/claude/C--Users-pette-Projects-strale/4f68dcca-de52-4ade-b2b2-8341f736268e/scratchpad/2026-09-02-m2-closure-private-rows.batch7.yaml`

## Checks run

- `npm run archive:index` (before `context:generate`, per the brief): wrote
  `archive/README.md` and `handoff/README.md`; no content diff against
  `HEAD` (already current).
- `npm run context:generate`: first run failed with
  `DECISION_BODY_SECTIONS_INVALID` on all five new records (each was
  missing the mandatory fifth `## Reversal conditions` heading); fixed by
  adding that section to each record, then regenerated 13
  non-authoritative files cleanly; `docs/project/DECISIONS.md` picked up
  the five new records, no other file changed materially.
- `npm run context:check`: warning-only mode; "no warnings," exit 0, run
  after staging.
- `npm run context:test`: green, 133/133, exit 0 (CI is the gate; see
  `archive/receipts/` convention for the count-with-receipt rule this
  handoff avoids by pointing at CI rather than stating a bare count as
  evidence).
- `npm run programs:check`: `ok docs/programs/cto-readiness/tracks.yaml`
  (untouched by this batch, per the constraint).
- `npm run codex:check`: `ok codex re-review backlog`, 11 pre-existing rows
  awaiting Codex, none added or touched by this batch (per the constraint
  not to touch `docs/programs/**`; the backlog register lives there and was
  not edited).
- `npm run receipts:check`: `ok receipts contract`; 7 pre-existing
  `HANDOFF_BARE_TEST_COUNT` warnings on older handoffs, unrelated to this
  batch.
- `node --test scripts/m2-closure-register.test.mjs
  scripts/decision-records.test.mjs`: green, 92/92, exit 0.
- `node scripts/generate-archive-index.mjs --check`: "archive/README.md and
  handoff/README.md up to date."
- `node scripts/m2-closure-verify-private-rows.mjs`: 37 `FAIL` lines, all
  in the expected private count/digest classes and their direct
  consequences (the archive-repo file at the recorded commit still holds
  131 rows, five of which are now also public, so the operator script
  correctly reports `EXPORT_ROW_DUPLICATE` x5,
  `PRIVATE_ROW_ALSO_PUBLIC`/`PRIVATE_ROW_ALREADY_PUBLIC` x5,
  `PRIVATE_ROW_MUST_BE_PUBLIC` (x2 forms per row, x5),
  `PRIVATE_ROW_UNREGISTERED_DUPLICATE_ID` x5, the two
  `PRIVATE_COUNT_MISMATCH` lines, `PRIVATE_DIGEST_MISMATCH`, and
  `ALL_ROWS_DIGEST_MISMATCH`). None is a schema, evidence, derivation-rule,
  or record-citation failure: every failure traces to the private file at
  the archive commit not yet reflecting this batch's five removed rows,
  exactly what the brief says to expect until the orchestrator commits the
  private half and bumps `private_rows.commit`.
- `validatePrivateProjection` (imported directly from
  `scripts/m2-closure-register-lib.mjs`) run against this PR's register
  plus the new 126-row private file plus `docs/decisions/id-collisions.yaml`:
  **0 findings.**

## Deviations from the brief

1. `DEC-20260513-E`'s extracted Notion text does not name `DEC-20260506-D`
   anywhere; the brief anticipated it might. No prose mention was added,
   since there was nothing to quote. Noted in the record's Context section
   and above.
2. `DEC-20260411-A`/`DEC-20260302-A-0001`'s relation was decided as
   `amends` rather than left unadded, on the reading that the title's
   direct "not by perceived value" clause is a substantive (if unnamed)
   rejection of the earlier row's mechanism, satisfying the brief's
   "weaker wording" fallback case even without an explicit citation. This
   is a judgment call within the brief's own decision tree, not a
   deviation from it, but is flagged here since the brief's example
   language ("builds on", "refines") is not literally present either.
3. All five records required a `## Reversal conditions` section that
   neither the batch-4/5/6 briefs nor this batch's brief mentioned
   explicitly by name, but which `scripts/decision-records-lib.mjs`'s
   `PROTECTED_HEADINGS` enforces as mandatory (five headings, exact order,
   top-level only). Added to match every existing Notion-sourced record's
   shape (e.g. `DEC-20260425-A.md`, `DEC-20260429-A.md`).
