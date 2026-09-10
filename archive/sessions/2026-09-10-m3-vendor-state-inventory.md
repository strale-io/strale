---
doc_type: session-report
authority_scope: none
status: complete
complete: true
phase: M3
authority_active: false
created_at: 2026-09-10
---

# M3 batch 1: inventory of every current reader and writer of vendor state

> [!CAUTION]
> **READ-ONLY ANALYSIS - NOT A DESIGN, NOT A CUTOVER.**
> This report only inventories current readers and writers of vendor state. It
> designs nothing, selects no repo-owned model, and changes no behaviour, no
> schema, and no production or Notion data. Candidate project documents stay
> inactive and Notion-backed workflows stay authoritative until the
> founder-gated M4 cutover. Batch 2 (per T6's `next_action`) designates the one
> repo-owned vendor-state model this inventory feeds.

## Scope and method

Per `archive/sessions/2026-09-01-m2-vendor-stack-authority-gaps.md` ("M3
acceptance shape"): "M3 should first inventory every current vendor-state
reader and writer." This batch does exactly that, nothing more.

**Method.** Every surface below was found by an exhaustive term search across
the whole repository (see the Search Appendix for every command and its exact
hit count), not by starting from files already known and following their
references outward. Each reader/writer's reach was verified - the import
chain from `apps/api/src/index.ts`, a named `.github/workflows/*.yml` job, a
`package.json`/`docs/company/DAILY-RUN.md` manual step, or "read only by a
person or session" - rather than assumed from history or naming.

**What counts as vendor state**, per the brief: identity/display name;
lifecycle/selection status; capability/solution dependency (primary vs
fallback); account usability (balance, credentials, auth failures, quota,
suspension); terms/pricing/licensing/redistribution facts and their
verification date; the governing Decision; re-evaluation triggers; and any
customer-facing statement naming a vendor.

**Categories**, kept separate throughout: **runtime** (what the product can
route or serve), **account readiness** (whether an existing account can serve
now - operator-only), **historical** (decisions, evaluations, research,
commercial notes).

## Inventory

### Runtime - what the product can route or serve

| # | Path : line | R/W, exact fact | Reach (file/line proving it) | Notion? |
|---|---|---|---|---|
| R1 | `apps/api/src/lib/platform-facts.ts:42-117` `STATIC_FACTS.vendors` | Writes (hand-edited constant) canonical vendor name per capability category (sanctions, pep, adverse_media primary/fallback, embeddings, risk_narrative, headless_browser, payments_card, payments_x402, log_sink, us_company_registry, us_ein, ubo_supplement_global, fr_litigation). Read by every consumer of `computePlatformFacts()` / `GET /v1/platform/facts`. | Imported by `apps/api/src/routes/*` (e.g. `llms-txt.ts`) and exposed at `GET /v1/platform/facts`; route is registered from `index.ts`'s route-mounting import graph. Confirmed by `grep -rn "platform-facts" apps/api/src/routes` (llms-txt.ts hit). | No |
| R2 | `apps/api/src/lib/platform-facts.ts:134-173` `STALE_VENDORS`, `getActiveVendorNames()`, `getStaleVendorNames()` | Writes (hand-edited constant) the list of rejected/deferred/evaluation-only vendor names that must never appear as if active; read by the drift checker. | Called only from `apps/api/scripts/check-platform-facts-drift.ts` (`grep -rln "STALE_VENDORS\|getActiveVendorNames\|getStaleVendorNames" apps/api/src apps/api/scripts` → 2 files, the module itself and this script). | No |
| R3 | `apps/api/scripts/check-platform-facts-drift.ts` | Reads `STATIC_FACTS.vendors` / `STALE_VENDORS` and scans consumer surfaces (marketing routes, frontend pages/guides, static `llms.txt`/`.well-known/*.json`) for stale vendor mentions. | Invoked by `.github/workflows/weekly-drift.yml:63`, on the `schedule: cron "0 7 * * 1"` + `workflow_dispatch` triggers only - **not** run on every PR. | No |
| R4 | `apps/api/src/lib/dependency-manifest.ts:73-` `PROVIDERS: DependencyProvider[]` | Writes (hand-edited constant) provider identity, `tier` (free/paid/self-hosted), health-probe shape, `capabilities`/`fallbackCapabilities` dependency edges, `retired`/`replacedFrom`/`migratedAt` migration history. This is the closest existing thing to a lifecycle-with-history record. | Imported by `apps/api/src/lib/dependency-health.ts`, `credential-health.ts`, `upstream-health-gate.ts`, `situation-assessment.ts`, `startup-migrations.ts` (`grep -rn "from .*dependency-manifest" apps/api/src` → 10 files). `dependency-health.ts`'s probes feed `apps/api/src/jobs/test-scheduler.ts` and `invariant-checker.ts`, both wired at `apps/api/src/index.ts:211,222` (`await import("./jobs/test-scheduler.js")` / `invariant-checker.js`). | No |
| R5 | `apps/api/src/db/schema.ts:1126-1144` `vendorCapabilityDependencies` table | DB table: `(provider_name, capability_slug, dependency_kind, units_per_execution)` - required-vs-fallback dependency edges, distinct from and duplicating part of R4's `capabilities`/`fallbackCapabilities` arrays. | Written/read by `apps/api/src/lib/vendor-control-tower.ts` (suspend/restore queries) and read by `apps/api/scripts/vendor-control-tower-report.ts`. `vendor-control-tower.ts` is invoked hourly via `apps/api/src/jobs/vendor-control-tower.ts` → `apps/api/src/jobs/migrated-jobs.ts:52` → `index.ts:311` `await import("./jobs/vendor-control-tower.js"); startVendorControlTower();`. | No |
| R6 | `apps/api/coverage-matrix/*.yaml` (52 files) | Per `(capability_slug, country, evidence_type)`: `provider`, `status` (Live/Committed), `sourcing_pattern` (Direct API / Vendor Tier 2 / Licensed bulk Tier 3 / Self-hosted / Tier 1 violation), `per_call_price_eur`, `evidence_grade`, `last_verified`, `provider_tos_notes` (terms/licence verification prose), `doctrine_reference`, `vendor_roster_url` (8 rows still point at Notion Vendor Roster pages - see finding 2 (Notion dependencies) and H4 below). Already the repo-native replacement for the Notion Provider-Coverage matrix per `DEC-20260517-A` (migrated 2026-05-17; `.migration-snapshot.json` is the immutable pre-migration dump). | Validated by `apps/api/scripts/validate-coverage-matrix.mjs` and regenerated by `regenerate-coverage-matrix-summary.mjs`; both run via `npm run coverage-matrix:check` (`package.json:20`), which is invoked by `.github/workflows/coverage-matrix-validation.yml` on `push: main` and `pull_request: paths: [apps/api/coverage-matrix/**, ...]` - a real gate, path-scoped. | Partial - 8 of 52 rows carry a live `vendor_roster_url` link (see finding 2 and H4) |
| R7 | `apps/api/src/lib/provenance-builder.ts:50-52,204-220` `upstream_vendor`, `acquisition_method`, `primary_source_reference` | Per-transaction customer-facing provenance fields naming the upstream vendor for `vendor_scraping` acquisitions, enforced at validation time per `DEC-20260428-A`. This is the "customer-facing statement that names a vendor" fact, generated per call rather than stored as static state. | `validateProvenance`-style checks are unit-tested in `provenance-builder-validation.test.ts`; the builder itself is imported by capability executors (e.g. registry-scrape capabilities) whose output flows through `POST /v1/do` (`routes/do.ts`), on the route-mounting import graph from `index.ts`. | No |
| R8 | `apps/api/src/lib/solution-activation.ts:29-36` `wasDeactivatedDeliberately()` | Reads the string convention `deactivation_reason LIKE 'vendor:%'` on `capabilities`/`solutions` rows - a shared predicate that landed in commit `34ee32d3` ("fix(solutions): one predicate for every automated solution activation", #626) so an automated reactivation sweep never re-enables something the vendor tower suspended. | Called from the solution auto-activation sweep; `solution-activation.ts` is imported by `apps/api/src/jobs/*` per its test file naming and the recent PR title. Confirmed present via `grep -n "vendor:" apps/api/src/lib/solution-activation.ts`. | No |
| R9 | `apps/api/src/lib/upstream-tracker.ts`, `upstream-health-gate.ts` | Track upstream **test/serving health**, not vendor identity - `isUpstreamHealthy()`/`updateUpstreamHealth()` in-memory map, keyed by dependency name pulled from `dependency-manifest.ts` (`getCuratedProviderCapabilities`) for the "browserless" special case. Adjacent to vendor state, not itself vendor identity/lifecycle/account authority. | `upstream-health-gate.ts` is read by `apps/api/src/lib/test-runner.ts` (skip-not-fail on unhealthy upstream); `dependency-health.ts` probes update it. Both on the `test-scheduler.ts`/`invariant-checker.ts` import graph confirmed under R4. | No |
| R10 | ~140 `apps/api/src/capabilities/*.ts` executor files | Each names its own vendor in a header comment / error string / `data_source` echo (e.g. `us-company-data-cobalt.ts` → Cobalt Intelligence). This is per-capability **consumption** of one data source, not a cross-cutting vendor-state authority - it duplicates the vendor name already in the manifest `data_source` field and (for some) in `dependency-manifest.ts`'s `capabilities` array, but carries no lifecycle/account/terms state of its own. | Auto-imported by `apps/api/src/capabilities/auto-register.ts`, itself imported from `index.ts` per the capability-registration convention documented in `CLAUDE.md`. | No (2 files - `us-company-data-cobalt.ts`, `us-ein-match.ts` - cite "Vendor Roster row" pricing in a comment; historical/dated prose only, read by a person, not fetched live) |
| R11 | `apps/api/scripts/check-cost-class-coherence.mjs` `THROTTLED_HOST_RULES` | Per-hostname detector: "this vendor host is throttled, manifest must declare `known_rate_limit`." Deliberately holds no rate number/citation (that lives in the manifest's `known_rate_limit` field, `capability-manifest-types.ts`) after a documented 2026-08-14 split to stop duplicating the same facts across this script, `startup-migrations.ts` Block 0082, and the manifest. Narrow (rate-limit only), not full vendor-state, but the same duplication failure mode the brief is checking for. | Run in `.github/workflows/ci.yml` (line ~417-418 comment references "Block 0082 throttled-vendor guard"); confirmed present via CI grep. | No |

### Account readiness - whether an existing account can serve now (operator-only)

| # | Path : line | R/W, exact fact | Reach | Notion? |
|---|---|---|---|---|
| A1 | `apps/api/src/db/schema.ts:1099-1124` `vendorAccounts` table | Canonical account-usability row per provider: `display_name`, `billing_model`, `plan_name`, `payment_method`, `monitor_mode`, `status` (`unknown/healthy/low/exhausted/auth_error/rate_limited/unavailable/disabled`), unit balances, `reset_at`, `expires_at`, `metadata` (recovery-probe leases, blocked-credential fingerprints). | Read/written exclusively through `apps/api/src/lib/vendor-control-tower.ts`. | No |
| A2 | `apps/api/src/lib/vendor-control-tower.ts` (whole file, ~1200 lines) | Writes: balance assessment (`writeAssessment`), HTTP-failure classification (`recordVendorHttpFailure`), credential-rearm (`rearmVendorAfterCredentialChange`), local usage accounting (`recordVendorUsage`), and the two-table cross-cutting suspend/restore transaction over `vendor_capability_suspensions` / `vendor_solution_suspensions` + `capabilities`/`solutions` lifecycle columns. Reads: `assertVendorAvailable()` pre-flight gate. | `runVendorControlTower()` is the hourly job entry (`apps/api/src/jobs/vendor-control-tower.ts` → `migrated-jobs.ts:52` → `index.ts:311`, confirmed job-schedule migration convention in `migrated-jobs.ts`'s own doc comment). `assertVendorAvailable`/`recordVendorHttpFailure`/`recordVendorUsage` are also called synchronously from `apps/api/src/lib/metered-vendor-fetch.ts`, which capability executors use for metered HTTP calls (import confirmed: `grep -n "from .*vendor-control-tower" apps/api/src/lib/metered-vendor-fetch.ts`). | No |
| A3 | `apps/api/src/db/schema.ts:1150-1199` `vendorCapabilitySuspensions`, `vendorSolutionSuspensions` tables | Records the exact prior lifecycle/visible/x402 state the tower overwrote, so restoration only fires while the tower's own marker is still present (a later quality/legal quarantine can't be silently undone by a balance refill). | Same reach as A2. | No |
| A4 | `apps/api/scripts/vendor-control-tower-report.ts` (`npm run vendor:status` in `apps/api/package.json:21`) | Read-only join over `vendor_accounts` + dependency/suspension tables; prints per-provider status, units, billing model, payment method, and every issue from `deriveVendorMorningIssues`/`deriveVendorInventoryIssues`. | Manual - **not** wired into any `.github/workflows/*.yml` (confirmed absent by `grep -rn "vendor:status" .github/workflows`). Named as a required daily-run step in `docs/company/DAILY-RUN.md:58-59` ("First run the Vendor Control Tower report... production read-only"). Run by a person/session, not a scheduled job. | No |
| A5 | `apps/api/src/lib/vendor-morning-status.ts` `deriveVendorMorningIssues`, `deriveVendorInventoryIssues` | Pure policy functions: classify account status into critical/warning issues; cross-check `dependency-manifest.ts`'s `getActiveProviders()` capability list against `vendor_capability_dependencies` DB rows and flag drift (missing edge, wrong kind, stale extra edge) - this is itself evidence of R4/R5 duplication (same fact, two owners) being actively drift-checked. | Called only from A4 and its own `.test.ts` (confirmed: `grep -rn "deriveVendorMorningIssues\|deriveVendorInventoryIssues" apps/api/src` → the module + report script + tests only). | No |

### Historical - decisions, evaluations, research, commercial notes

| # | Path : line | R/W, exact fact | Reach | Notion? |
|---|---|---|---|---|
| H1 | Notion **Vendor Roster** (`af5a164bdea948379835210ae69b4283`) | Canonical historical evaluation/status/contact/price/primary-Decision-link register for every vendor Strale has ever evaluated (166 captured rows per the M0 preservation count in the migration plan). Still the live authority pre-M4. | Read (never written) by `apps/api/scripts/check-vendor-roster-drift.ts`. | Yes - primary subject |
| H2 | Notion **Active Vendor Stack** page (`35367c87082c812e88d1dc6bdbfbd4f5`) | Dated snapshot of the vendor selected per capability category at canonicalization time (`DEC-20260430-A`); documented as containing at least four defects since corrected (Digiteal commercial shape, OpenSanctions self-host roadmap, OpenOwnership phantom integration, wrong Decision-identity label) per the M2 gaps report. | Read (never written) by `apps/api/scripts/check-vendor-roster-drift.ts` (its header constant `ACTIVE_VENDOR_STACK_PAGE`). | Yes |
| H3 | `apps/api/scripts/check-vendor-roster-drift.ts` | Fetches Decisions DB (`ea57671f-...`) rows from the last N days, extracts vendor-name mentions, compares against the matching Vendor Roster row's `Last evaluated` date; flags drift. Falls back to `--doc` mode (prints the manual procedure) when `NOTION_TOKEN` is absent. | `.github/workflows/weekly-drift.yml:80-86`, `id: vendor-roster` step, same Monday-07:00-UTC cron as R3. Requires `NOTION_TOKEN` - its consumption is already recorded in `docs/strategy/2026-08-31-notion-consumer-migration-inventory.md:56` ("`NOTION_TOKEN` is consumed by the vendor-drift workflow/script"). | Yes - reads two Notion DBs |
| H4 | `apps/api/coverage-matrix/*.yaml` `vendor_roster_url` field (8 of 52 rows: DK, DE, PT, CH, NL, IT, ES, AT company-data rows) | Static pointer from a repo-native coverage row to the Notion Vendor Roster page that historically justified the provider choice. Not fetched by code; a human follows the link. | Read only by a person, never by code (confirmed: `grep -rn "vendor_roster_url" apps/api/src apps/api/scripts` → 0 hits outside `coverage-matrix/*` and `schema.json`). | Yes - link only, not a live dependency |
| H5 | `apps/api/src/capabilities/us-company-data-cobalt.ts:12`, `us-ein-match.ts:12` | Dated pricing comment "(per Vendor Roster row): $2/call PAYG..." - historical commercial evidence frozen in prose at authoring time, never re-verified programmatically. | Read only by a person. | Indirectly - cites Notion by name, not by link |
| H6 | `.claude/skills/vendor-switch/SKILL.md`, `.agents/skills/vendor-switch/SKILL.md` (byte-identical, confirmed by `diff`) | Step 5 of the checklist still instructs: "Vendor switches always need a DEC entry in Notion (Decisions DB - `ea57671f-...`)." This is the exact gap the M2 report named: "the `vendor-switch` skill... still tells sessions to create a Notion Decision; it must be cut over only after the new decision and vendor-state routes exist." | Invoked by a person/session choosing to run the `/vendor-switch` (or equivalent) skill; not machine-scheduled. | Yes - directs a human to write to Notion |
| H7 | `docs/decisions/records/DEC-20260430-A.md`, `DEC-20260517-A.md`, `DEC-20260429-A.md` (`--notion-...`), plus the `Vendor Roster`/`Active Vendor Stack` mentions across `docs/research/*.md`, `archive/sessions/*.md`, `handoff/_general/from-code/*.md` | Formal decision records and dated research/handoff prose that is itself historical evidence about specific vendors (selection rationale, corrections, commercial terms observed at a point in time). Not consumed by any running code. | Read only by a person/session doing historical research (confirmed: none of the ~90 `roster`-matching non-code files are imported by any script). | Mixed - many carry `--notion-<pageid>` record-key qualifiers per `DEC-20260904-B` |
| H8 | `docs/strategy/2026-08-31-notion-consumer-migration-inventory.md:14` | Prior M1 inventory row already names "Weekly vendor drift: Vendor Roster plus Active Vendor Stack via `check-vendor-roster-drift.ts` and `.github/workflows/weekly-drift.yml`" as a consumer to replace in M3 and cut in M4 - corroborates H1-H3 independently of this batch's search. | Reference document only. | N/A |
| H9 | `docs/company/claims.yaml:5-11` (header comment) | Explicitly disclaims vendor-name-drift scope: "that is `apps/api/scripts/check-platform-facts-drift.ts`'s job, which already owns the canonical vendor list in `platform-facts.ts`." A negative finding: a surface that considered owning part of vendor state and deliberately deferred to R1/R3 instead. | `npm run claims:check` (wired in CI after `design:check`/`design:test` per `CLAUDE.md`). | No |

## Findings

### 1. Duplicate authority

Three distinct duplications exist today, all partially or fully unresolved:

- **Capability↔provider dependency edges are stored in two places that can
 drift from each other and are already drift-checked against each other**:
 `dependency-manifest.ts`'s `PROVIDERS[].capabilities`/`fallbackCapabilities`
 arrays (R4, hand-edited constant, code-reachable at boot) vs.
 `vendor_capability_dependencies` DB rows (R5/A3, written by the operator or
 a migration, read by the control tower). `vendor-morning-status.ts`'s
 `deriveVendorInventoryIssues` (A5) exists specifically to catch drift
 between these two - the checker is itself proof the duplication is live,
 not resolved.
- **Vendor lifecycle/rejection state is split between code and Notion with no
 reconciliation mechanism beyond a weekly best-effort text match**:
 `STALE_VENDORS` (R2, code, canonical for consumer-copy drift) vs. the
 Notion Vendor Roster's Status field (H1, canonical for evaluation history)
 vs. the Active Vendor Stack snapshot (H2, a frozen point-in-time copy of
 the same facts, already documented as containing at least four defects).
 `check-vendor-roster-drift.ts` (H3) only compares Vendor-Roster
 `Last evaluated` dates against Decision dates - it does not reconcile
 either against R2's code list.
- **Per-capability vendor rate-limit facts** were duplicated across
 `check-cost-class-coherence.mjs`, `startup-migrations.ts` Block 0082, and
 the manifest's `quota_cap` until a 2026-08-14 fix split them onto two
 explicit owners (R11). This one is resolved and cited here only because it
 is the same failure mode at smaller scope, and the fix pattern (one
 detector, one canonical value, explicit ownership comment) is a candidate
 precedent for batch 2.
- **Coverage-matrix `provider`/`sourcing_pattern`/`provider_tos_notes` (R6)
 overlaps `dependency-manifest.ts`'s `tier`/`capabilities` (R4) and
 manifests' `data_source` (R10)** for the same capability without a
 cross-check between the three. No script currently compares them.

### 2. Notion dependencies

Every current repository reader/writer of a Notion vendor surface, each of
which needs a mapped replacement before M4 per the acceptance shape's
condition 1:

| Notion surface | Repo reader | What must be replaced |
|---|---|---|
| Vendor Roster (`af5a164b...`) | `check-vendor-roster-drift.ts` (H3); `vendor_roster_url` links in 8 coverage-matrix rows (H4, link only, not fetched); two capability-file pricing comments (H5, prose only) | The drift-check query itself, and the historical-evidence trail the 8 links and 2 comments point at |
| Active Vendor Stack (`35367c87...`) | `check-vendor-roster-drift.ts`'s `ACTIVE_VENDOR_STACK_PAGE` constant (H2) - referenced but, on inspection, never fetched or diffed by the script's actual logic (it drives the Vendor Roster/Decisions comparison only) | Confirm whether the constant is dead reference or live input in batch 2 - this inventory could not establish which from static reading alone; **marked unclear**, see below |
| Decisions DB (`ea57671f-...`) | `check-vendor-roster-drift.ts` (H3, read); `.claude/skills/vendor-switch/SKILL.md` and its `.agents/` mirror (H6, directs a human to write a new Decision row here) | The read side needs a repo-native Decision-record source (already exists per `docs/decisions/records/*.md` - H3 should probably read those instead); the write side (H6) needs the skill retargeted only after a repo-native decision route exists, per the M2 gaps report's own explicit caveat |
| `NOTION_TOKEN` (env credential) | Consumed only by `check-vendor-roster-drift.ts` per this batch's search, corroborating the prior M1 finding at `docs/strategy/2026-08-31-notion-consumer-migration-inventory.md:56` | Retire only after H3's read side is replaced |

No other script, route, job, or scheduled workflow in the repository reads or
writes a Notion vendor surface. `NOTION_API_KEY` (distinct from
`NOTION_TOKEN`) is consumed by the daily digest per the same M1 inventory row
and is unrelated to vendor state.

### 3. Write-path owners (candidates only - no design chosen)

| Fact | Candidates the evidence supports | Recommendation basis |
|---|---|---|
| Vendor identity + lifecycle status (active/fallback/candidate/held/rejected/deprecated) | (a) extend `dependency-manifest.ts`'s `PROVIDERS` array with the missing states (candidate/held/rejected have no current code representation at all - see Gap G1); (b) a new DB table alongside `vendorAccounts` | `dependency-manifest.ts` already carries `tier`/`retired`/`replacedFrom`/`migratedAt` - closest existing lifecycle-with-history shape (R4) |
| Capability/solution dependency edges (required vs fallback) | `vendor_capability_dependencies` (R5) as the single owner, with `dependency-manifest.ts`'s arrays either derived from it at build/test time or retired in favour of it | The DB table is already the one `deriveVendorInventoryIssues` (A5) treats as ground truth to check the code array against |
| Account usability (balance, credentials, suspension) | `vendorAccounts` + the suspension tables (A1-A3) | Already the sole owner; no competing surface found |
| Terms/pricing/licensing/redistribution verification | `apps/api/coverage-matrix/*.yaml` (R6) for the 52 capability×country×evidence-type rows it already covers; **unclear** for every vendor outside that scope (e.g. Anthropic, Voyage AI, Stripe, Coinbase, Better Stack - none of these appear in coverage-matrix because they aren't a per-country registry lookup) | Coverage-matrix has the schema (`provider_tos_notes`, `last_verified`, `evidence_grade`) but a scope limited to the identity/beneficial-ownership/sanctions/registry evidence types listed in its own `schema.json` enum |
| Governing Decision + evaluation-evidence links | `docs/decisions/records/*.md` (already the repo-native decision-record format per `DEC-20260904-B`'s git-qualified record keys) | Existing mechanism; no new write path evidently needed, only a linking convention from whichever table owns vendor identity |
| Re-evaluation triggers | **Unclear** - no current surface stores a forward-looking "re-check this vendor by/when X" fact. The closest analogues are `vendor_accounts.expires_at` (a specific renewal date, not a trigger condition) and the coverage-matrix `last_verified` date (a backward-looking staleness signal, not a trigger) | This is a genuine gap, not an ownership ambiguity - see G3 |
| Customer-facing vendor mentions | `platform-facts.ts` `STATIC_FACTS.vendors` (R1) for the ~14 categories it already covers, drift-checked by `check-platform-facts-drift.ts` (R3) weekly | Already the sole mechanism; scope is narrower than "every vendor," e.g. no entry exists for eSortcode, Cobalt Intelligence, GEMI, etc. even though they appear in customer-visible manifest `data_source` fields |

### 4. Gaps - vendor facts the acceptance shape requires that no current surface holds

- **G1 - No `candidate`/`held`/`rejected` lifecycle states in code.**
 `dependency-manifest.ts` only models providers Strale actually integrated
 (`tier: free|paid|self-hosted`, `retired?: boolean`). `STALE_VENDORS` (R2)
 is the closest thing to a rejected-vendor list, but it is a flat name list
 with no evaluation date, no rationale, no re-evaluation trigger, and no
 distinction between rejected, deferred, and evaluation-only (the M2 report
 explicitly notes this ambiguity for OpenSanctions self-host vs. rejected
 IBAN-matching vendors).
- **G2 - No single surface links vendor identity to its governing Decision
 by machine-checkable reference.** Decision records exist (`docs/decisions/
 records/*.md`) and vendor facts exist (R1-R11), but nothing currently
 cross-references a `dependency-manifest.ts` entry or a `vendorAccounts` row
 to a specific `record_key`. The M2 report's "wrong Decision identity"
 finding (DEC-20260430-A mislabeling DEC-20260427-A) happened precisely
 because this link was prose, not data.
- **G3 - No re-evaluation trigger field anywhere** (see write-path-owner
 table above). Nothing currently answers "should this vendor be
 reconsidered now" except a human noticing a cost change, an outage, or a
 licensing change and starting a fresh evaluation from scratch.
- **G4 - No structured record of terms/pricing verification for vendors
 outside the coverage-matrix's per-country registry scope.** Anthropic,
 Voyage AI, Stripe, Coinbase CDP, Better Stack, Browserless, Dilisense,
 Serper.dev, Tenderly, Alchemy, Etherscan and others appear in
 `config/env-manifest.yaml` (provider field) and `dependency-manifest.ts`
 but have no `last_verified`/`provider_tos_notes`-equivalent record. Their
 terms evidence, where it exists at all, lives only in dated Notion pages,
 research docs, or Decision records (historical category), not in a
 queryable current-state surface.
- **G5 - `deactivation_reason LIKE 'vendor:%'` is a string convention, not a
 structured link.** R8's predicate and the control tower's suspension
 marker (`vendor:{provider}:{status}`, `vendor-control-tower.ts:394`) are
 the only place vendor-caused deactivation is machine-readable, and it is a
 parsed string prefix rather than a foreign key or typed union. Any new
 vendor-state model that wants to answer "why is this capability off" must
 either keep parsing this string or migrate it.

## What could not be classified, and why

- **Whether `check-vendor-roster-drift.ts`'s `ACTIVE_VENDOR_STACK_PAGE`
 constant is live input or dead reference.** The constant is declared
 (`check-vendor-roster-drift.ts:47`) but the script's visible logic (Vendor
 Roster row vs. Decisions DB date comparison) does not appear to fetch or
 diff against it in the code read for this batch. Confirming this needs
 either running the script against live Notion credentials (out of scope - 
 this batch is read-only and this session holds no `NOTION_TOKEN`) or a
 closer line-by-line trace than an inventory batch's budget allows. Left
 **unclear**; batch 2 should resolve it before deciding whether the Active
 Vendor Stack page needs its own replacement or is already folded into the
 Vendor-Roster-vs-Decisions check.
- **The exact current row count and freshness of the Notion Vendor Roster.**
 The M0 preservation count (166 rows) is from `2026-08-31`; this batch did
 not re-query Notion (out of scope - read-only, no write, and the brief
 permits Notion reads only for listing Vendor Roster/Active Vendor Stack
 *fields*, which this batch did not need beyond what the M2 report and the
 coverage-matrix `vendor_roster_url` links already show).
- **Whether every one of the ~140 capability executor files (R10) that name
 a vendor in prose has a manifest `data_source` value that agrees with it.**
 Checking that for all ~140 would be a full data-shape audit, not an
 inventory of readers/writers; flagged here as a candidate check for batch
 2's design (a single generated view could derive both from one canonical
 table, closing this class of drift structurally rather than by sweep).

## Confirmation

Nothing in this batch changed code, schema, production state, or Notion
content. No capability, solution, vendor account, or Decision record was
modified. The two `vendor-switch` skill copies were read and diffed
(byte-identical) but not edited. All findings above are read evidence with
their reach verified as stated; where reach could not be verified from static
reading alone, the fact is marked unclear rather than assumed.

## Search appendix

Every search command run for this inventory, with its exact hit count at the
time of the search (repository state: `origin/main` at `9ec2a91a`, branch
`docs/m3-vendor-state-inventory`). File-count searches used ripgrep
(`files_with_matches`); two broad term counts were run via a backgrounded
shell `grep -rEi` sweep as noted.

| # | Command (pattern / scope) | Result |
|---|---|---|
| S1 | `grep -rEi "vendor" --include="*.ts" --include="*.mjs" --include="*.yaml" --include="*.yml" --include="*.md" --include="*.json" -l .` (excl. `node_modules`, `archive/`) | 520 files |
| S2 | same scope, `\broster\b` | 105 files |
| S3 | same scope, `\bprovider\b` | 456 files |
| S4 | same scope, `\bsupplier\b` | 42 files |
| S5 | same scope, `\bupstream\b` | 462 files |
| S6 | ripgrep `vendor` (case-insensitive), whole repo, `files_with_matches` | 593 files |
| S7 | ripgrep `vendor` (case-insensitive), `apps/api/src` only | 148 files |
| S8 | ripgrep `roster` (case-insensitive), whole repo | 96 files |
| S9 | ripgrep `\bupstream\b` (case-insensitive), `apps/api/src` only | 171 files |
| S10 | ripgrep `vendor_roster_url`, whole repo | 51 matches across `apps/api/coverage-matrix/*.yaml` (48 rows incl. `null`) + `schema.json` (1) + 2 non-null-URL summary lines already counted |
| S11 | ripgrep `Active Vendor Stack`, `*.md`/`*.ts`/`*.yaml`/`*.yml` | 27 files |
| S12 | ripgrep `Vendor Roster`, `*.md`/`*.ts` | 22 files |
| S13 | `grep provider: config/env-manifest.yaml \| sed ... \| sort -u` | 41 distinct provider names |
| S14 | `grep -h "^data_source:" manifests/*.yaml \| sort -u` | 334 distinct data_source strings |
| S15 | `grep -n "vendor" apps/api/coverage-matrix/schema.json` (targeted read of the coverage-matrix schema) | confirmed `vendor_roster_url`, `provider_tos_notes`, `doctrine_reference`, `evidence_grade`, `last_verified` fields |
| S16 | `grep -rn "runVendorControlTower\|vendor-control-tower" apps/api/src --include="*.ts"` (excl. `.test.ts`) | 11 matches across 7 files, confirming the hourly job wiring (R4/A2 reach) |
| S17 | `grep -n "vendor-morning-status\|deriveVendorMorningIssues\|deriveVendorInventoryIssues" apps/api/src --include="*.ts"` (excl. `.test.ts`) | 2 matches, both in the module itself - confirms A5 has exactly one caller (`vendor-control-tower-report.ts`) |
| S18 | `grep -rn "check-vendor-roster-drift\|vendor-control-tower-report" package.json apps/api/package.json .github/workflows/*.yml docs/company/DAILY-RUN.md` | 3 matches: `apps/api/package.json` (`vendor:status` script), `weekly-drift.yml:86`, `DAILY-RUN.md:60` |
| S19 | `grep -rln "from .*dependency-manifest" apps/api/src --include="*.ts"` (path-anchored import search) | 10 files |
| S20 | `grep -rln "getActiveVendorNames\|getStaleVendorNames\|STALE_VENDORS\|STATIC_FACTS.vendors" apps/api/src apps/api/scripts --include="*.ts"` (excl. `.test.ts`) | 2 files: `platform-facts.ts`, `check-platform-facts-drift.ts` |
| S21 | `grep -n "check-platform-facts-drift" package.json apps/api/package.json .github/workflows/*.yml` | 1 match: `weekly-drift.yml:63` (confirms it is **not** a per-PR gate) |
| S22 | `grep -n "vendor_accounts\|vendor_capability_dependencies\|vendor_capability_suspensions\|vendor_solution_suspensions\|export const vendor" apps/api/src/db/schema.ts` | 8 matches, 4 tables |
| S23 | `grep -n "providerName\|provider_name" apps/api/src/db/schema.ts` | 9 matches, confined to the 4 tables in S22 - no other table carries a `provider_name` column |
| S24 | `grep -n "vendor" -i .github/workflows/ci.yml` | 2 matches (secret-format comment; Block 0082 throttled-vendor guard comment) - neither a vendor-state reader in the brief's sense |
| S25 | `grep -ln "vendor" -i .github/workflows/*.yml` | 2 files: `ci.yml`, `weekly-drift.yml` |
| S26 | `grep -n "Dilisense\|OpenSanctions\|Serper\|Voyage\|Browserless\|Stripe\|Cobalt\|Liberty Data\|GLEIF\|BODACC" docs/company/claims.yaml` | 1 match - a scope-boundary comment, not a claim row |
| S27 | `grep -n "vendor" -i docs/company/claims.yaml` | 3 matches, all in the same header comment disclaiming vendor-drift scope |
| S28 | `diff .claude/skills/vendor-switch/SKILL.md .agents/skills/vendor-switch/SKILL.md` | 0 differences (byte-identical, 160 lines each) |
| S29 | `grep -n -A15 "Vendor Roster\|Active Vendor Stack" docs/strategy/2026-08-31-notion-consumer-migration-inventory.md` | 2 matches, corroborating H1-H3/H8 independently |
| S30 | `grep -rln "vendor" apps/api/scripts --include="*.ts" --include="*.mjs" -i` | 15 files |
| S31 | `ls apps/api/scripts \| grep -i vendor` | 2 files: `check-vendor-roster-drift.ts`, `vendor-control-tower-report.ts` |
| S32 | `grep -n "vendor" -i apps/api/scripts/check-cost-class-coherence.mjs` | 17 matches - confirms the resolved rate-limit duplication (R11) |
| S33 | `grep -n "Vendor Roster\|Active Vendor Stack" apps/api/src/capabilities/*.ts` | 3 matches, all dated prose comments (H5) |
| S34 | `grep -n "vendor:" apps/api/src/lib/solution-activation.ts` | 3 matches, confirming R8's predicate and its documented rationale |
| S35 | `grep -n "vendor" apps/api/src/lib/upstream-tracker.ts apps/api/src/lib/upstream-health-gate.ts` (header reads) | confirmed these track serving health, not vendor identity (R9) |

Known surfaces the brief named explicitly were each opened and read in full or
in the relevant section: `apps/api/src/lib/platform-facts.ts` (279 lines, read
whole), `apps/api/src/lib/dependency-manifest.ts` (765 lines, header + 100
lines read), `apps/api/scripts/vendor-control-tower-report.ts` (104 lines,
read whole), `apps/api/src/db/schema.ts` (control-tower table block, lines
1099-1199, read whole), `apps/api/scripts/check-vendor-roster-drift.ts`
(header + first 60 lines read), the `apps/api/coverage-matrix/` directory
(README.md, schema.json, one full example row), `config/env-manifest.yaml`
(provider field extracted, 41 distinct values), `.claude/skills/vendor-switch/
SKILL.md` and `.agents/skills/vendor-switch/SKILL.md` (both read whole, diffed
identical), every `.github/workflows/*.yml` (6 files, listed and grepped), and
`docs/company/claims.yaml` (267 lines, header read).
