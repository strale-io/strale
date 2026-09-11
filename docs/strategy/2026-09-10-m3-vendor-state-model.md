# M3 batch 2: the repo-owned vendor-state model

**Status:** Design only. Inactive and non-authoritative until the founder-gated M4 cutover.
**Date:** 2026-09-10
**Owner:** Claude Code (T6 batch 2)
**Active review route:** independent same-provider review in a separate context, per DEC-20260910-A
**Base audited:** `origin/main@46e19015` (commit that merged T6 batch 1, `archive/sessions/2026-09-10-m3-vendor-state-inventory.md`)
**Decision state:** design candidate. It writes no code, schema, register file, check or workflow, and changes no behaviour. Candidate project documents stay inactive and Notion-backed workflows stay authoritative until the explicit atomic M4 cutover.

> [!CAUTION]
> **DESIGN ONLY - NOT ACTIVE, NOT M4 CUTOVER.**
> This document designates the one repo-owned vendor-state model per the M3
> acceptance shape. It adds no code, schema, register, check, or workflow. The
> Notion Vendor Roster and Active Vendor Stack remain the authority until the
> founder-gated M4 cutover. Batch 3 (`config/vendors.yaml` plus its schema and
> `vendors:check`) is the next bounded task, not this batch.

## The problem

`archive/sessions/2026-09-01-m2-vendor-stack-authority-gaps.md` found that
`DEC-20260430-A` cannot be migrated as a current vendor list: it is a
historical governance decision wrapped around a mutable Notion roster
snapshot with at least four documented defects (Digiteal commercial shape,
OpenSanctions self-host roadmap, OpenOwnership BODS phantom integration,
wrong Decision identity - all in that report's "Corrections that must travel
with the snapshot" section). Its "M3 acceptance shape" directed M3 to first
inventory every current vendor-state reader and writer, then designate one
repo-owned model (or a deliberately joined set of canonical tables).

Batch 1, `archive/sessions/2026-09-10-m3-vendor-state-inventory.md`, did the
inventory. Its Findings section identified:

- **Finding 1 (duplicate authority), four instances.** Capability↔provider
  dependency edges live in both `apps/api/src/lib/dependency-manifest.ts`
  `PROVIDERS[].capabilities`/`fallbackCapabilities` (R4) and the
  `vendor_capability_dependencies` DB table (R5), already drift-checked
  against each other by `deriveVendorInventoryIssues` in
  `apps/api/src/lib/vendor-morning-status.ts` (verified below, lines 115-162).
  Vendor lifecycle/rejection state is split between `STALE_VENDORS` in code
  (R2) and the Notion Vendor Roster/Active Vendor Stack (H1/H2) with only a
  weekly best-effort text match reconciling them. Coverage-matrix
  `provider`/`sourcing_pattern`/`provider_tos_notes` (R6) overlaps
  `dependency-manifest.ts`'s `tier`/`capabilities` (R4) and manifests'
  `data_source` (R10) with no cross-check between the three.
  `packages/strale-capabilities/capabilities.json` (R12) is a generated,
  unscheduled point-in-time copy of customer-facing vendor-naming prose.
- **Finding 2 (Notion dependencies).** `check-vendor-roster-drift.ts` reads
  the Vendor Roster and Decisions DB and directs a human to the Active
  Vendor Stack page in its printed manual procedure only (confirmed below -
  the constant is declared but never fetched by the live code path). The
  `vendor-switch` skill still instructs a session to create a Notion
  Decision.
- **Gap G1** - no `candidate`/`held`/`rejected` lifecycle states in code;
  `STALE_VENDORS` is a flat name list with no date, rationale, or
  re-evaluation trigger.
- **Gap G2** - no machine-checkable link from a vendor entry to its
  governing Decision `record_key`.
- **Gap G3** - no re-evaluation trigger field anywhere.
- **Gap G4** - no structured terms/pricing/licensing verification record for
  vendors outside the coverage-matrix's per-country registry scope (e.g.
  Anthropic, Voyage AI, Stripe, Coinbase, Better Stack).
- **Gap G5** - `deactivation_reason LIKE 'vendor:%'` is a string convention,
  not a structured link (`apps/api/src/lib/vendor-control-tower.ts:394`,
  verified below).
- **Gap G6 (found in this batch's review, not in the inventory)** - the M3
  acceptance shape asks for "capability and solution dependency links with
  required/fallback semantics". Solution links have no owner of their own.
  They exist only as a runtime join: `vendor-control-tower.ts:425-437`
  suspends every solution that has a step (`solution_steps`, `schema.ts:775-799`)
  whose capability has a `required` edge to the failing provider. A solution
  step carries no required or fallback flag of its own (`gate_condition` is a
  refund precondition, not a fallback), so one required capability edge
  suspends the whole solution.

This document designates the model that fills G1-G4, resolves the R4/R5
capability-edge duplication, keeps solution links derived (G6), and leaves G5
as a named future migration.

## The model

### 1. A new repo register: `config/vendors.yaml`, with a JSON schema beside it

Follows the repository's existing "values are data" register pattern, the
same shape as `config/env-manifest.yaml` (with `config/env-manifest.schema.json`,
verified at that path - required fields `name`, `purpose`, `provider`,
`holder`, `cost_class`, `required_in`, `set_in`) and `docs/company/claims.yaml`.
It is the one owner of:

- **Stable vendor identity**: an `id` and a display name, one entry per
  vendor ever evaluated, including candidates and rejected vendors.
  *Rationale*: no current surface holds identity for a vendor Strale never
  integrated - `dependency-manifest.ts`'s `PROVIDERS` only models providers
  actually integrated, and `STALE_VENDORS` (`apps/api/src/lib/platform-facts.ts:134-156`,
  verified below) is a flat name array with no structured identity.
- **Lifecycle as an append-only history list per vendor**, each entry
  carrying a state, a date, the governing decision `record_key`, and a
  reason. States include at least `candidate`, `evaluating`, `active`,
  `fallback`, `held`, `rejected`, `deprecated` and `retired`. History is
  never rewritten; a change appends an entry. *Rationale*: fills G1. This is
  the same append-only discipline `dependency-manifest.ts` already documents
  for its own narrower migration protocol ("Set `retired: true`... do NOT
  delete it", `apps/api/src/lib/dependency-manifest.ts:11-17`, verified
  below) generalized to the full vendor-selection funnel including states
  that provider array has no room for.
- **The governing decision link**, as a `record_key` that must resolve to a
  file under `docs/decisions/records/`. *Rationale*: fills G2 - the M2 gaps
  report's "wrong Decision identity" finding (`DEC-20260430-A` mislabelling
  `DEC-20260427-A`) happened precisely because this link was prose, not
  data; `docs/decisions/records/*.md` is confirmed to exist as the
  repo-native record format (`ls docs/decisions/records` returns files named
  `DEC-YYYYMMDD-<suffix>.md`, verified below).
- **Re-evaluation triggers**: forward-looking conditions such as a date, a
  price threshold, a licensing change or an outage pattern. *Rationale*:
  fills G3, a gap the inventory confirmed has no current analogue (the
  closest are `vendor_accounts.expires_at`, a renewal date rather than a
  trigger condition, and coverage-matrix `last_verified`, a backward-looking
  staleness signal).
- **Company-level terms, pricing, licensing and redistribution
  verification**: the date each was last verified and by whom, never the
  confidential content. *Rationale*: fills G4 for vendors outside
  coverage-matrix's per-country registry scope (Anthropic, Voyage AI,
  Stripe, Coinbase, Better Stack, Browserless, Dilisense, Serper.dev,
  Tenderly, Alchemy, Etherscan, per the inventory's G4).
- **Explicit `unknown`, `attestation-required` and authorization states**, so
  absence of evidence is recorded rather than implied. *Rationale*: matches
  the M3 acceptance shape's explicit requirement ("explicit `unknown`,
  `attestation-required`, and authorization states",
  `archive/sessions/2026-09-01-m2-vendor-stack-authority-gaps.md` line 162).

### 2. Existing surfaces keep what they own, and join to the register by vendor `id`

Nothing gets a second copy:

- **`apps/api/src/lib/dependency-manifest.ts` `PROVIDERS`** keeps
  operational integration: health probes, `tier`, and the capability
  dependency edges (`capabilities`, `fallbackCapabilities`) - confirmed at
  `apps/api/src/lib/dependency-manifest.ts:45-71` (the `DependencyProvider`
  interface) and `:73-` (the `PROVIDERS` array). Each provider references a
  register `id`, and must resolve to a register entry whose current state is
  `active` or `fallback`.
- **`vendorAccounts` and the two suspension tables in
  `apps/api/src/db/schema.ts`** keep account usability (balances,
  credentials, suspension), written only by
  `apps/api/src/lib/vendor-control-tower.ts` - confirmed:
  `vendorAccounts` at `apps/api/src/db/schema.ts:1099-1124`,
  `vendorCapabilitySuspensions` at `:1150-1175`,
  `vendorSolutionSuspensions` at `:1177-1201`. The register never copies a
  balance.
- **`apps/api/coverage-matrix/*.yaml`** keeps per capability, country and
  evidence-type sourcing and registry terms notes, under DEC-20260517-A -
  confirmed by `apps/api/coverage-matrix/schema.json`, whose `provider`
  field (line 43-46) is a free-text string and whose `provider_tos_notes`,
  `last_verified`, `evidence_grade` fields (lines 70-100) are the
  terms-verification shape this design generalizes for out-of-scope
  vendors. Each row's `provider` must resolve to a register entry.
- **`docs/decisions/records/*.md`** keep rationale. The register links to
  them; it does not restate them.
- **`config/env-manifest.yaml`'s `provider` values** should resolve to
  register ids, which gives a second cross-check. **Evidence conflict:**
  `config/env-manifest.schema.json` (verified in full above) defines
  `provider` as a free-text string ("The vendor/service this key belongs
  to, or the literal string 'internal'") with no format or enum constraint
  today - there is no existing machine link from an env-manifest row to any
  other vendor surface. The design is recorded as stated (a future
  cross-check); making it enforceable requires either a schema change to
  `env-manifest.schema.json` or a `vendors:check`-side lookup against its
  raw string values, and either is out of scope for this design-only batch.

### 3. One duplication is resolved

Capability dependency edges are held both in `dependency-manifest.ts` and in
the `vendor_capability_dependencies` table (inventory finding 1, confirmed
above). The repo declaration in `dependency-manifest.ts` becomes the
canonical owner, and the table becomes a copy derived from it by a sync,
with `deriveVendorInventoryIssues` inverted to verify the table matches the
repo. `deriveVendorInventoryIssues` is confirmed at
`apps/api/src/lib/vendor-morning-status.ts:115-162`: today it treats the
`vendor_capability_dependencies` table's rows (via
`account.dependency_edges`) as ground truth and flags the `providers`
argument (the code array) for drift against it (`actual.get(slug) !== kind`,
line 143). Inverting it means the function's job becomes verifying the
table matches the code array, not the other way round.

Reason: the repository's direction is repo canonical, database derived (the
manifest-to-database onboarding pipeline; DEC-20260517-A for the coverage
matrix), and repo declarations are reviewed through pull requests while
database rows have no reviewed source.

Correction, 2026-09-11: the sync already exists for most of the table.
`startup-migrations.ts` rebuilds `vendor_capability_dependencies` from
`PROVIDERS` on every boot for paid and self-hosted providers with a
`vendor_accounts` row, so for those providers the repo is already canonical
and the table derived. The duplication described above remains only for the
providers that loop skips. See "Batch 4 rescoped" for what M3 does about it
and what waits for M4.

### 4. Two hand-maintained lists become derived from the register in later batches

- `STALE_VENDORS` in `apps/api/src/lib/platform-facts.ts` (confirmed at
  lines 134-156: a flat array of rejected/deferred/evaluation-only vendor
  names, e.g. "OpenSanctions self-host", "SurePay", "OpenOwnership"),
  derived from `rejected`, `deprecated` and `retired` states.
- Eventually `STATIC_FACTS.vendors` (confirmed at
  `apps/api/src/lib/platform-facts.ts:49-67`: a hand-edited map of category
  to active vendor display name, e.g. `sanctions: "Dilisense"`), derived
  from the `active` primary per category.

This is recorded as the target; it is not implemented in this batch.

### 5. Out of scope and kept as is

The control tower's `deactivation_reason LIKE 'vendor:%'` string convention
(gap G5) remains its runtime marker. Confirmed: the marker is produced at
`apps/api/src/lib/vendor-control-tower.ts:394`
(`` const marker = `vendor:${providerName}:${status}`; ``) and matched by the
`LIKE 'vendor:%'` predicate at lines 408, 436-437, 464 and 476 in the same
file. Lines 458 and 470 write the marker into `deactivation_reason`
(`COALESCE(..., suspension_marker)`); they are not matchers. It is noted here
as a future migration, not part of this model.

### 6. Confidential content never enters the public repository

Contracts, contact details and confidential prices stay in private
evidence; the register holds only a verification date and a pointer, and
uses `attestation-required` where the evidence is private.

### 7. Shadow mode

The register is non-authoritative until M4: it must carry the same inactive
markers other candidate surfaces use (`authority_active: false`, the
convention confirmed in both source documents' front matter - see this
document's own front matter and `archive/sessions/2026-09-10-m3-vendor-state-inventory.md`
line 7 / `archive/sessions/2026-09-01-m2-vendor-stack-authority-gaps.md`
line 7). The Notion Vendor Roster remains the authority until cutover, and
nothing writes to both.

## Write-path owners

One row per vendor fact; exactly one owner.

| Vendor fact | Owner (this design) | Current state (verified) |
|---|---|---|
| Stable vendor identity (incl. candidates/rejected) | `config/vendors.yaml` (new) | No current owner; `STALE_VENDORS` (`platform-facts.ts:134-156`) is the closest, but it is a flat name list with no structured identity (gap G1) |
| Lifecycle history (candidate → active → rejected, etc.) | `config/vendors.yaml` (new) | `dependency-manifest.ts` `PROVIDERS[].tier`/`retired`/`replacedFrom`/`migratedAt` (lines 45-71, 73-) covers only integrated providers; no `candidate`/`held`/`rejected` states exist in code (gap G1) |
| Governing decision `record_key` | `config/vendors.yaml` (new), resolving to `docs/decisions/records/*.md` | No current machine link (gap G2); records exist (confirmed: `docs/decisions/records/DEC-*.md` files present) but nothing points a vendor entry at one |
| Re-evaluation triggers | `config/vendors.yaml` (new) | No current owner (gap G3) |
| Terms/pricing/licensing/redistribution verification (date + verifier, no confidential content) | `config/vendors.yaml` (new) for vendors outside coverage-matrix scope; `apps/api/coverage-matrix/*.yaml` (`provider_tos_notes`, `last_verified`, `evidence_grade`) for the capability×country×evidence-type rows it already covers | Coverage-matrix schema confirmed (`apps/api/coverage-matrix/schema.json:70-100`); no equivalent for out-of-scope vendors (gap G4) |
| Operational integration (health probe, `tier`, capability dependency edges) | `apps/api/src/lib/dependency-manifest.ts` `PROVIDERS` (unchanged owner) | Confirmed at `apps/api/src/lib/dependency-manifest.ts:45-71`, `:73-` |
| Capability dependency edges (DB copy) | `vendor_capability_dependencies` table, derived from `dependency-manifest.ts` by a sync (this design, point 3) | Table at `apps/api/src/db/schema.ts:1126-1144`. Corrected 2026-09-11: already derived on every boot by `startup-migrations.ts` for paid and self-hosted providers with a `vendor_accounts` row; a hand-kept copy only for the providers that loop skips (see "Batch 4 rescoped") |
| Solution dependency links | No owner of their own: derived, never stored. A solution depends on a vendor through its steps' capabilities (see gap G6 below) | Computed at runtime by joining `vendor_capability_dependencies` to `solution_steps` on `capability_slug` (`apps/api/src/lib/vendor-control-tower.ts:432`); the table has no solution column (`schema.ts:1126-1144`) and `PROVIDERS` has no solution field |
| Account usability (balance, credentials, suspension) | `vendorAccounts` + suspension tables, written only by `vendor-control-tower.ts` (unchanged owner) | Confirmed at `apps/api/src/db/schema.ts:1099-1124`, `:1150-1175`, `:1177-1201` |
| Per capability/country/evidence-type sourcing | `apps/api/coverage-matrix/*.yaml` (unchanged owner) | Confirmed via `apps/api/coverage-matrix/schema.json` |
| Rationale / durable prose | `docs/decisions/records/*.md` (unchanged owner) | Confirmed present |
| Customer-facing vendor-per-category name | `apps/api/src/lib/platform-facts.ts` `STATIC_FACTS.vendors`, target: derived from the register's `active` primary per category (this design, point 4; not implemented this batch) | Confirmed at `platform-facts.ts:49-67`, hand-edited today |
| Rejected/stale vendor names for drift-checking | `STALE_VENDORS`, target: derived from the register's `rejected`/`deprecated`/`retired` states (this design, point 4; not implemented this batch) | Confirmed at `platform-facts.ts:134-156`, hand-edited today |
| Vendor-caused deactivation marker on a capability/solution row | `deactivation_reason LIKE 'vendor:%'` string convention (unchanged owner, out of scope - point 5) | Confirmed at `vendor-control-tower.ts:394` and its `LIKE` matchers |

## Cross-checks that join the surfaces

- `dependency-manifest.ts` providers must resolve to a register `id` whose
  current lifecycle state is `active` or `fallback` (point 2). Refined in
  batch 3 (PR #634): a non-retired provider whose every capability is in
  `apps/api/src/capabilities/auto-register.ts` `DEACTIVATED` must be `held`,
  and `held` is accepted only then. The 2026-09-10 vendor-terms audit left
  two such providers (GoPlus, Etherscan) in `PROVIDERS` for their health
  probes while switching every capability off.
- `apps/api/coverage-matrix/*.yaml` rows' `provider` field must resolve to a
  register `id` (point 2).
- `config/env-manifest.yaml`'s `provider` values should resolve to register
  ids as a second cross-check (point 2) - **evidence conflict noted above**:
  today `provider` is unconstrained free text, so this cross-check does not
  yet exist and needs either a schema change or a lookup-side implementation
  in a later batch.
- The `vendor_capability_dependencies` table must match
  `dependency-manifest.ts`'s declared edges exactly, verified by inverting
  `deriveVendorInventoryIssues` (point 3).
- Every register entry's lifecycle history must carry a `record_key` that
  resolves to a file under `docs/decisions/records/` (point 1, fills G2).

## Enforcement (design only - a later batch implements this)

A `vendors:check` script, wired into CI like `env:check` and `claims:check`,
that:

- validates `config/vendors.yaml` against its JSON schema;
- resolves every cross-reference named above in "Cross-checks that join the
  surfaces";
- confirms every decision `record_key` exists under
  `docs/decisions/records/`;
- refuses any rewrite of lifecycle history compared with the base branch,
  in the same way `receipts:check` protects receipt files
  (`archive/receipts/receipt.schema.json`'s append-only contract) and
  `codex:check` protects `docs/programs/codex-review-backlog.yaml` against
  deletion, backward movement, and reopening a closed row.

This is the enforcement design; it is not implemented in this batch.

## Out of scope

Per point 5: the control tower's `deactivation_reason LIKE 'vendor:%'`
string convention (gap G5) is explicitly out of scope for this model. It
remains the runtime marker for vendor-caused deactivation and is recorded
here as a future migration, not part of this batch's design.

Solution dependency links (gap G6) stay derived: capability edges joined to
`solution_steps`, with no second stored copy, consistent with point 2's rule
that nothing gets a second copy. The register does not model solution
composition. Solution-level fallback semantics, meaning a solution that
survives one vendor failing because a step has an alternative, are a
solution-execution design question, not vendor state, and are recorded here
as a named gap rather than designed. The acceptance shape's solution clause is
therefore met for required semantics (derived) and left open for fallback
semantics.

## Batch plan

- **Batch 3**: adds `config/vendors.yaml` and its schema, populated with
  currently integrated vendors, plus `vendors:check` with tests proven by
  planted failures.
- **Batch 4** (rescoped 2026-09-11, see "Batch 4 rescoped" below): shadow
  checks only. Adds every `STALE_VENDORS` name to the register with an
  honest, evidenced state, and has `vendors:check` compare `STALE_VENDORS`
  with the register's states in both directions; has `vendors:check`
  compare the dependency edges the boot-time sync writes with
  `dependency-manifest.ts` and report providers the sync skips; and adds to
  `check-vendor-roster-drift.ts` a comparison of the Notion Vendor Roster
  with the register that reports disagreements while Notion stays the
  authority.
- **Batch 5**: generates the agent-context and customer-facing views and
  prepares, without activating, the `vendor-switch` skill's cutover.

### Batch 4 rescoped

The original batch 4 would have crossed M3's boundaries in two places, and
one of its premises was wrong.

- **The dependency-edge sync mostly exists.** `apps/api/src/lib/startup-migrations.ts`
  (the loop over `getActiveProviders()` filtered to `tier` `paid` or
  `self-hosted`) already upserts `vendor_capability_dependencies` from
  `PROVIDERS` `capabilities` (required) and `fallbackCapabilities`
  (fallback) on every boot, for providers that have a `vendor_accounts`
  row, and deletes edges the manifest no longer declares. For those
  providers the table is already derived from the repository, so point 3's
  direction is the runtime reality; the "second hand-reconciled copy"
  description earlier in this document holds only for providers the loop
  skips (free-tier providers, and paid providers without an account row).
  Any new writer to that table is a production database write at deploy,
  read by the control tower to decide which capabilities and solutions to
  suspend, so it is outside M3. Batch 4 only reports the skipped providers.
  Whether to extend the sync to them, and inverting
  `deriveVendorInventoryIssues` (point 3), move to the M4 cutover with the
  other runtime changes; nothing from the original batch 4 is dropped.
- **Deriving `STALE_VENDORS` from the register** would make runtime tooling
  read a register that is `authority_active: false`. Batch 4 compares the
  two instead; the derivation, and deriving `STATIC_FACTS.vendors`, move to
  the M4 cutover.
- **Retargeting `check-vendor-roster-drift.ts` away from Notion** would stop
  reading the authority before cutover. Batch 4 adds a comparison beside the
  Notion read; replacing it is an M4 cutover step.

Each batch stays shadow mode: candidate documents remain inactive and
Notion-backed workflows remain authoritative until the founder-gated M4
cutover.

## Evidence conflicts

Two evidence conflicts were recorded above rather than silently changing the
design:

1. **`config/env-manifest.yaml`'s `provider` field is free text today, not a
   resolvable id.** `config/env-manifest.schema.json` (read in full) defines
   `provider` as `{"type": "string", "minLength": 1}` with no enum, pattern,
   or reference constraint. The design in point 2 states this field
   "should resolve to register ids" as a second cross-check; that resolution
   does not exist today and needs either a schema change or a
   `vendors:check`-side string lookup in a later batch. Recorded as
   documented in the "Existing surfaces" and "Cross-checks" sections above.
2. **The dependency-edge duplication is already drift-checked, not silently
   duplicated.** `deriveVendorInventoryIssues`
   (`apps/api/src/lib/vendor-morning-status.ts:115-162`) already treats the
   database rows as the reference and the code array as the thing checked
   for drift - the opposite direction from this design's point 3, which
   makes the code array canonical and the table derived. This is not a
   contradiction of the design (the design is recorded as stated: invert the
   function), but it is worth naming precisely because the function's
   current behaviour is the mirror image of the target, not merely absent.

## Batch 5: outcome

Batch 5 (T6, this batch) closed the vendor strand: the two missing vendors
named in section 6, the public-vendor-list cross-check that would have
caught them, the category and customer-facing view decisions, the
agent-context view, and the vendor-switch cutover draft. Shadow mode
throughout - no runtime code under `apps/api/src` changed, `config/vendors.yaml`'s
`authority_active` stays `false`, `docs/project/VENDORS.md` is front-matter
marked `status: candidate` / `authority_active: false`.

**The two missing vendors.** BODACC (`STATIC_FACTS.vendors.fr_litigation`) is
a new vendor: `apps/api/src/capabilities/fr-bodacc-lookup.ts` and
`apps/api/src/capabilities/french-insolvency-check.ts` both call
`bodacc-datadila.opendatasoft.com` directly, neither slug is in
`apps/api/src/capabilities/auto-register.ts` `DEACTIVATED`, so its state is
`active`. Liberty Data (`STATIC_FACTS.vendors.us_ein`) is **not** a second
vendor: `apps/api/src/capabilities/us-ein-match.ts:7` names the company
operating `einsearch.com` as "Liberty Data Solutions", so "Liberty Data" is
the same vendor as the register's existing `einsearch` entry under a
different display string, and is registered as an alias of `einsearch`
rather than a duplicate identity, consistent with point 2's "nothing gets a
second copy." Verifying every value in `STATIC_FACTS.vendors` (not only the
two the inventory named) surfaced four more display strings on already-registered
vendors that needed an alias to resolve: "Serper.dev (Google)" (`serper`),
"Anthropic Claude" (`anthropic`), "Coinbase x402 facilitator (USDC on Base)"
(`coinbase-cdp`), and "GLEIF L2" (`gleif`). All six additions were proven
against the real repository (`node scripts/check-vendors.mjs`), which
reports `ok` with these additions in place.

### Item 2: the public vendor-list cross-check

`scripts/vendors-lib.mjs` gained `extractStaticFactsVendors(root)`, parsing
`apps/api/src/lib/platform-facts.ts` with the TypeScript compiler API (never
a regex) to read every `STATIC_FACTS.vendors` category/value pair, and
`checkStaticFactsCrossCheck(root, register)`, wired into `checkAllVendors`.
Three findings: `STATIC_VENDOR_UNREGISTERED` (a value resolves to no vendor
by id, name, or alias), `STATIC_VENDOR_STATE_MISMATCH` (it resolves to a
vendor whose current state is not `active` or `fallback`), and
`STATIC_FACTS_UNREADABLE` (the map itself cannot be parsed - an unrecognised
shape fails loudly rather than silently reporting zero categories, matching
`extractStaleVendors`'s discipline). `STATIC_FACTS.vendors` values were also
added as a surface for the dead-alias rule (rule 7), so the new aliases
above are not reported as dead. This is the check that would have caught
the two vendors STATIC_FACTS named with no register entry at all; it was
proven by planting (see "Records" in the batch-5 PR body) both in the test
fixtures and directly against the real register (temporarily removing the
`einsearch` vendor's `Liberty Data` alias and confirming
`STATIC_VENDOR_UNREGISTERED` fires, then restoring it).

### Item 3: category view by join, no schema change

`vendorCategoryView(root)` in `scripts/vendors-lib.mjs` is a pure function
that reads `STATIC_FACTS.vendors` (via `extractStaticFactsVendors`) and joins
each category's display string against the register, returning one row per
category: the category key, the display string, the resolved vendor id
(or `null` if unresolved), its current lifecycle state, and its
redistribution-verification summary. The register gains no `category` or
`role` field of its own - option (b) from the remaining-scope inventory
(section 6, item 2), chosen over adding a schema field (option a) because it
needs no schema change, matches point 2's "nothing gets a second copy," and
the mapping stays live (re-read on every call) rather than a second,
potentially stale copy. `platform-facts.ts` keeps owning the category-to-vendor
mapping; this function only reads and joins it.

### Item 4: customer-facing view - unchanged, by decision

`STATIC_FACTS.vendors`, served customer-facing via `GET /v1/platform/facts`,
stays the customer-facing vendor surface. The register
(`config/vendors.yaml`) stays internal and is not read by any customer-facing
route; it has no HTTP route at all. Reason: the register is not authoritative
until the M4 cutover (`authority_active: false`), and a second customer-facing
artifact derived from a non-authoritative source would itself be a "second
copy" the design's point 2 exists to prevent, plus a new drift-prevention
surface to maintain before it is even the source of truth. No new
customer-facing artifact was built this batch.

### Item 5: the agent-context view

`docs/project/VENDORS.md`, generated by `scripts/generate-vendor-view.mjs`
(`npm run vendors:view`), written to the same location as the M2 candidate
documents rather than under `docs/operations/`. This was checked against the
project-context tooling before choosing it: `scripts/project-context-lib.mjs`'s
`M2_CANDIDATE_DOCUMENTS`, `M2_GENERATED_DOCUMENTS`, and `SKELETON_DOCUMENTS`
are each a fixed, enumerated map of specific file paths, and
`scripts/check-project-context.mjs`'s `runChecks` only ever validates files at
those exact enumerated paths - nothing walks `docs/project/` looking for
files outside those maps, and nothing rejects an unlisted file placed there.
A new file at `docs/project/VENDORS.md` is therefore invisible to
`context:check` and `context:generate` (neither reads nor writes it), so it
does not need to join `M2_CANDIDATE_DOCUMENTS` (whose schema requires a
`phase` of `M1` or `M2` only, which this M3-phase document does not carry)
to coexist safely there. The file follows the same front-matter shape as the
M2 candidates read for this batch (`docs/project/STATE.md`,
`docs/project/DECISIONS.md`): `doc_type`, `authority_scope: none`,
`status: candidate`, `complete: false`, `authority_active: false`, plus
`phase: M3` (not `M2`, since that field is not schema-checked for this file)
and `generated: true` (matching `DECISIONS.md`'s own generated-index
convention). A `[!CAUTION]` block states it is generated, non-authoritative,
and names the regenerate command. The file carries two tables: every
register vendor (id, name, current state, state date, decision,
redistribution outcome) and the category join from `vendorCategoryView`.

**Staleness.** `checkVendorViewFresh(root)` in `scripts/vendors-lib.mjs`
regenerates the view in memory with `renderVendorView(root)` and compares it
byte-for-byte against the committed file, reporting `VENDOR_VIEW_STALE` on
any difference or on a missing file. It is wired into `npm run vendors:check`
(`scripts/check-vendors.mjs`) rather than into `checkAllVendors` itself, so
the dozens of existing fixture-based tests in `scripts/vendors.test.mjs`
(which build throwaway directories with no `docs/project/VENDORS.md` at all)
are unaffected; `checkVendorViewFresh` has its own dedicated fixture tests
plus a real-repo test asserting the committed file matches the generator's
current output. `renderVendorView` is deterministic: stable sort order (by
vendor id, by category key) and no timestamp other than each vendor's own
recorded lifecycle dates, so two calls against the same repository state are
byte-identical - proven by a dedicated test.

### Item 6: vendor-switch step 5 at M4 (draft, inactive)

The live skill (`.claude/skills/vendor-switch/SKILL.md`, mirrored at
`.agents/skills/vendor-switch/SKILL.md`) is unedited by this batch. The
replacement text for its "Step 5 - Log the decision" section, to be copied
into both mirrors by the M4 cutover PR and not before, is:

> ## Step 5 - Log the decision
>
> Vendor switches always need a decision record under
> `docs/decisions/records/` (`DEC-YYYYMMDD-<suffix>.md`), created through the
> repository's decision process. The record must:
>
> - Reference the previous decision record being superseded (Contradiction
>   Protocol)
> - Cite the trigger (e.g. cost change, vendor outage, licensing change,
>   regulatory finding)
> - Document the engineering checklist this skill enforces
>
> The vendor's state change is then a new lifecycle entry appended to its
> entry in `config/vendors.yaml`, citing the new record's key in the
> `decision` field. History is append-only: the prior lifecycle entries are
> never edited, only a new one appended after them. `npm run vendors:check`
> must pass (schema-valid, every cross-reference resolves, the decision key
> resolves to a file under `docs/decisions/records/`, and the append-only
> history rule holds against the base branch).
>
> Drafting the decision record is Petter's call (governance authority).
> Surface a draft in the PR description; do not create the record on his
> behalf.

Until the M4 cutover, the live skill keeps its Notion step (Decisions DB
`ea57671f-7167-44e4-a254-c0a1de79e7f9`) exactly as it is today. The cutover
PR copies the text above into both `.claude/skills/vendor-switch/SKILL.md`
and `.agents/skills/vendor-switch/SKILL.md` in place of the current Notion
step, verbatim in both (matching the existing mirror-identity discipline the
remaining-scope inventory's section 2 documents for `go`/`vendor-switch`).
