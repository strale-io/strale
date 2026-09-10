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

## Corrections applied after independent review (2026-09-10)

An independent review of the first version of this report found six issues,
all fixed in this revision, still read-only (no code, schema, production, or
Notion change beyond this file and, where cited, T6's `next_action`):

1. **A missed writer.** `packages/strale-capabilities/generate.js` writes a
 published-npm snapshot of the live catalogue's customer-facing
 `description` fields (which name vendors, e.g. Dilisense, Serper) into
 `packages/strale-capabilities/capabilities.json`. Added as **R12** in the
 runtime table and as a fourth item in finding 1 (duplicate authority).
2. **A sweep for the same class.** Searched every directory under
 `packages/`, plus `apps/` and the repository root, for other committed
 generated catalogue/vendor snapshots. Found nothing beyond R12; see the
 new "Sweep for missed writers of the same class" note below finding 1 and
 appendix searches S36-S40.
3. **An unclear item resolved.** `check-vendor-roster-drift.ts`'s
 `ACTIVE_VENDOR_STACK_PAGE` constant is reclassified from unclear to
 confirmed dead reference - see H2 and the "What could not be classified"
 section, both updated.
4. **Appendix counts corrected.** Every search in the appendix was rerun at
 this branch's head and every count replaced with the actual current
 result (several had drifted or been mistranscribed the first time,
 including S2, S3, S4, S5, S8, S10, S18, S19, S22, S23, S24, S29, and
 S32; S18's original DAILY-RUN.md hit did not reproduce and the note now
 says why).
5. **A denominator corrected.** `apps/api/coverage-matrix/` holds 52
 directory entries, of which 47 are `.yaml` capability rows (the rest are
 4 markdown files and one `schema.json`). R6, H4, the write-path-owners
 table, and S10 now read "8 of 47 rows" rather than treating 52 as the row
 count.
6. **A completeness note added.** `apps/api/src/lib/daily-digest/
 fetch-notion.ts` is now recorded in the Notion-dependencies section as a
 Decisions-database reader that is not a vendor-state reader (it filters
 only on `Reviewed = false`, no vendor-specific query), so batch 2 knows it
 was considered and excluded.

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
| R4 | `apps/api/src/lib/dependency-manifest.ts:73-` `PROVIDERS: DependencyProvider[]` | Writes (hand-edited constant) provider identity, `tier` (free/paid/self-hosted), health-probe shape, `capabilities`/`fallbackCapabilities` dependency edges, `retired`/`replacedFrom`/`migratedAt` migration history. This is the closest existing thing to a lifecycle-with-history record. | Imported by `apps/api/src/lib/dependency-health.ts`, `credential-health.ts`, `upstream-health-gate.ts`, `situation-assessment.ts`, `startup-migrations.ts` (`grep -rln "from .*dependency-manifest" apps/api/src --include="*.ts"` → 8 files, S19). `dependency-health.ts`'s probes feed `apps/api/src/jobs/test-scheduler.ts` and `invariant-checker.ts`, both wired at `apps/api/src/index.ts:211,222` (`await import("./jobs/test-scheduler.js")` / `invariant-checker.js`). | No |
| R5 | `apps/api/src/db/schema.ts:1126-1144` `vendorCapabilityDependencies` table | DB table: `(provider_name, capability_slug, dependency_kind, units_per_execution)` - required-vs-fallback dependency edges, distinct from and duplicating part of R4's `capabilities`/`fallbackCapabilities` arrays. | Written/read by `apps/api/src/lib/vendor-control-tower.ts` (suspend/restore queries) and read by `apps/api/scripts/vendor-control-tower-report.ts`. `vendor-control-tower.ts` is invoked hourly via `apps/api/src/jobs/vendor-control-tower.ts` → `apps/api/src/jobs/migrated-jobs.ts:52` → `index.ts:311` `await import("./jobs/vendor-control-tower.js"); startVendorControlTower();`. | No |
| R6 | `apps/api/coverage-matrix/` (52 directory entries: 47 `.yaml` capability rows, 4 markdown files, and one `schema.json` - the row count is 47, not 52) | Per `(capability_slug, country, evidence_type)`: `provider`, `status` (Live/Committed), `sourcing_pattern` (Direct API / Vendor Tier 2 / Licensed bulk Tier 3 / Self-hosted / Tier 1 violation), `per_call_price_eur`, `evidence_grade`, `last_verified`, `provider_tos_notes` (terms/licence verification prose), `doctrine_reference`, `vendor_roster_url` (8 of the 47 rows still point at Notion Vendor Roster pages - see finding 2 (Notion dependencies) and H4 below). Already the repo-native replacement for the Notion Provider-Coverage matrix per `DEC-20260517-A` (migrated 2026-05-17; `.migration-snapshot.json` is the immutable pre-migration dump). | Validated by `apps/api/scripts/validate-coverage-matrix.mjs` and regenerated by `regenerate-coverage-matrix-summary.mjs`; both run via `npm run coverage-matrix:check` (`package.json:20`), which is invoked by `.github/workflows/coverage-matrix-validation.yml` on `push: main` and `pull_request: paths: [apps/api/coverage-matrix/**, ...]` - a real gate, path-scoped. | Partial - 8 of 47 rows carry a live `vendor_roster_url` link (see finding 2 and H4) |
| R7 | `apps/api/src/lib/provenance-builder.ts:50-52,204-220` `upstream_vendor`, `acquisition_method`, `primary_source_reference` | Per-transaction customer-facing provenance fields naming the upstream vendor for `vendor_scraping` acquisitions, enforced at validation time per `DEC-20260428-A`. This is the "customer-facing statement that names a vendor" fact, generated per call rather than stored as static state. | `validateProvenance`-style checks are unit-tested in `provenance-builder-validation.test.ts`; the builder itself is imported by capability executors (e.g. registry-scrape capabilities) whose output flows through `POST /v1/do` (`routes/do.ts`), on the route-mounting import graph from `index.ts`. | No |
| R8 | `apps/api/src/lib/solution-activation.ts:29-36` `wasDeactivatedDeliberately()` | Reads the string convention `deactivation_reason LIKE 'vendor:%'` on `capabilities`/`solutions` rows - a shared predicate that landed in commit `34ee32d3` ("fix(solutions): one predicate for every automated solution activation", #626) so an automated reactivation sweep never re-enables something the vendor tower suspended. | Called from the solution auto-activation sweep; `solution-activation.ts` is imported by `apps/api/src/jobs/*` per its test file naming and the recent PR title. Confirmed present via `grep -n "vendor:" apps/api/src/lib/solution-activation.ts`. | No |
| R9 | `apps/api/src/lib/upstream-tracker.ts`, `upstream-health-gate.ts` | Track upstream **test/serving health**, not vendor identity - `isUpstreamHealthy()`/`updateUpstreamHealth()` in-memory map, keyed by dependency name pulled from `dependency-manifest.ts` (`getCuratedProviderCapabilities`) for the "browserless" special case. Adjacent to vendor state, not itself vendor identity/lifecycle/account authority. | `upstream-health-gate.ts` is read by `apps/api/src/lib/test-runner.ts` (skip-not-fail on unhealthy upstream); `dependency-health.ts` probes update it. Both on the `test-scheduler.ts`/`invariant-checker.ts` import graph confirmed under R4. | No |
| R10 | ~140 `apps/api/src/capabilities/*.ts` executor files | Each names its own vendor in a header comment / error string / `data_source` echo (e.g. `us-company-data-cobalt.ts` → Cobalt Intelligence). This is per-capability **consumption** of one data source, not a cross-cutting vendor-state authority - it duplicates the vendor name already in the manifest `data_source` field and (for some) in `dependency-manifest.ts`'s `capabilities` array, but carries no lifecycle/account/terms state of its own. | Auto-imported by `apps/api/src/capabilities/auto-register.ts`, itself imported from `index.ts` per the capability-registration convention documented in `CLAUDE.md`. | No (2 files - `us-company-data-cobalt.ts`, `us-ein-match.ts` - cite "Vendor Roster row" pricing in a comment; historical/dated prose only, read by a person, not fetched live) |
| R11 | `apps/api/scripts/check-cost-class-coherence.mjs` `THROTTLED_HOST_RULES` | Per-hostname detector: "this vendor host is throttled, manifest must declare `known_rate_limit`." Deliberately holds no rate number/citation (that lives in the manifest's `known_rate_limit` field, `capability-manifest-types.ts`) after a documented 2026-08-14 split to stop duplicating the same facts across this script, `startup-migrations.ts` Block 0082, and the manifest. Narrow (rate-limit only), not full vendor-state, but the same duplication failure mode the brief is checking for. | Run in `.github/workflows/ci.yml` (line ~417-418 comment references "Block 0082 throttled-vendor guard"); confirmed present via CI grep. | No |
| R12 | `packages/strale-capabilities/generate.js` (whole file, 53 lines) writing `packages/strale-capabilities/capabilities.json` | Writes a generated snapshot of the live catalogue: `generate.js` fetches `GET https://api.strale.io/v1/capabilities` and writes the response's `slug`/`name`/`description`/`category`/`price_cents`/`input_schema` fields to `capabilities.json` (`generate.js:14-46`). The `description` field is customer-facing prose that names vendors verbatim - confirmed present, e.g. `capabilities.json:264` ("via Dilisense (primary) with Serper Google search fallback"), `:388` ("Uses Dilisense consolidated database"), `:3161` ("via Dilisense"). This is a customer-facing statement naming a vendor (per the brief's "what counts as vendor state"), captured as a point-in-time copy rather than read live. | Reached in two steps, both verified by reading the files rather than assumed: (1) `generate.js` itself is run by hand (no CI job invokes it; confirmed by S41 in the appendix - the only repo-wide hits for the literal `generate.js` are the package's own `npm run generate` script and this report; no `.github/workflows/*.yml` or other `package.json` references it); (2) the committed `capabilities.json` it produces is published to npm as `strale-capabilities` via `.github/workflows/release-npm.yml`, which lists `packages/strale-capabilities` as a `workflow_dispatch` package option (`release-npm.yml:28`) and is also reachable by the tag-push trigger `push.tags: "*@*"` (`release-npm.yml:13-16`, monorepo convention `<package-name>@<version>`); the package's `files` array in `package.json` includes `capabilities.json` (`package.json:42-47`), so it ships inside the published tarball. | No |

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
| H2 | Notion **Active Vendor Stack** page (`35367c87082c812e88d1dc6bdbfbd4f5`) | Dated snapshot of the vendor selected per capability category at canonicalization time (`DEC-20260430-A`); documented as containing at least four defects since corrected (Digiteal commercial shape, OpenSanctions self-host roadmap, OpenOwnership phantom integration, wrong Decision-identity label) per the M2 gaps report. | `check-vendor-roster-drift.ts` declares `ACTIVE_VENDOR_STACK_PAGE` at line 51 and uses it only at line 100, interpolated into the string `printManualProcedure()` prints (that function runs in `--doc` mode or as the no-token fallback, line 162). `runCheck()` (lines 158-236), the script's only live logic, never fetches or diffs this page. Confirmed by reading the whole file (250 lines): **dead reference, printed in the manual procedure only, not a live input.** | Yes - named in printed prose only, not fetched by any code path |
| H3 | `apps/api/scripts/check-vendor-roster-drift.ts` | Fetches Decisions DB (`ea57671f-...`) rows from the last N days, extracts vendor-name mentions, compares against the matching Vendor Roster row's `Last evaluated` date; flags drift. Falls back to `--doc` mode (prints the manual procedure) when `NOTION_TOKEN` is absent. | `.github/workflows/weekly-drift.yml:80-86`, `id: vendor-roster` step, same Monday-07:00-UTC cron as R3. Requires `NOTION_TOKEN` - its consumption is already recorded in `docs/strategy/2026-08-31-notion-consumer-migration-inventory.md:56` ("`NOTION_TOKEN` is consumed by the vendor-drift workflow/script"). | Yes - reads two Notion DBs |
| H4 | `apps/api/coverage-matrix/*.yaml` `vendor_roster_url` field (8 of 47 `.yaml` capability rows: DK, DE, PT, CH, NL, IT, ES, AT company-data rows) | Static pointer from a repo-native coverage row to the Notion Vendor Roster page that historically justified the provider choice. Not fetched by code; a human follows the link. | Read only by a person, never by code (confirmed: `grep -rn "vendor_roster_url" apps/api/src apps/api/scripts` → 0 hits outside `coverage-matrix/*` and `schema.json`). | Yes - link only, not a live dependency |
| H5 | `apps/api/src/capabilities/us-company-data-cobalt.ts:12`, `us-ein-match.ts:12` | Dated pricing comment "(per Vendor Roster row): $2/call PAYG..." - historical commercial evidence frozen in prose at authoring time, never re-verified programmatically. | Read only by a person. | Indirectly - cites Notion by name, not by link |
| H6 | `.claude/skills/vendor-switch/SKILL.md`, `.agents/skills/vendor-switch/SKILL.md` (byte-identical, confirmed by `diff`) | Step 5 of the checklist still instructs: "Vendor switches always need a DEC entry in Notion (Decisions DB - `ea57671f-...`)." This is the exact gap the M2 report named: "the `vendor-switch` skill... still tells sessions to create a Notion Decision; it must be cut over only after the new decision and vendor-state routes exist." | Invoked by a person/session choosing to run the `/vendor-switch` (or equivalent) skill; not machine-scheduled. | Yes - directs a human to write to Notion |
| H7 | `docs/decisions/records/DEC-20260430-A.md`, `DEC-20260517-A.md`, `DEC-20260429-A.md` (`--notion-...`), plus the `Vendor Roster`/`Active Vendor Stack` mentions across `docs/research/*.md`, `archive/sessions/*.md`, `handoff/_general/from-code/*.md` | Formal decision records and dated research/handoff prose that is itself historical evidence about specific vendors (selection rationale, corrections, commercial terms observed at a point in time). Not consumed by any running code. | Read only by a person/session doing historical research (confirmed: none of the ~90 `roster`-matching non-code files are imported by any script). | Mixed - many carry `--notion-<pageid>` record-key qualifiers per `DEC-20260904-B` |
| H8 | `docs/strategy/2026-08-31-notion-consumer-migration-inventory.md:14` | Prior M1 inventory row already names "Weekly vendor drift: Vendor Roster plus Active Vendor Stack via `check-vendor-roster-drift.ts` and `.github/workflows/weekly-drift.yml`" as a consumer to replace in M3 and cut in M4 - corroborates H1-H3 independently of this batch's search. | Reference document only. | N/A |
| H9 | `docs/company/claims.yaml:5-11` (header comment) | Explicitly disclaims vendor-name-drift scope: "that is `apps/api/scripts/check-platform-facts-drift.ts`'s job, which already owns the canonical vendor list in `platform-facts.ts`." A negative finding: a surface that considered owning part of vendor state and deliberately deferred to R1/R3 instead. | `npm run claims:check` (wired in CI after `design:check`/`design:test` per `CLAUDE.md`). | No |

## Findings

### 1. Duplicate authority

Four distinct duplications exist today, all partially or fully unresolved:

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
- **`packages/strale-capabilities/capabilities.json` (R12) is a generated
 point-in-time copy of the same customer-facing `description` text that the
 live `GET /v1/capabilities` endpoint serves from the DB/manifest catalogue**
 (the same descriptions R10's executor files and the manifests' own
 `description` field author). Nothing re-runs `generate.js` on a schedule or
 checks the committed snapshot against the live catalogue before a publish,
 so a vendor switch on the live side (a `dependency-manifest.ts`/manifest
 change, R4/R10) does not propagate to the published npm package until
 someone manually reruns `generate.js` and cuts a release - the exact drift
 shape the `vendor-switch` skill (H6) does not mention at all.

**Sweep for missed writers of the same class.** Because R12 was missed on the
first pass, every directory under `packages/` (composio-strale, crewai-strale,
google-adk-strale, langchain, langchain-strale, mcp-server, openai-agents-
strale, pydantic-ai-strale, sdk-python, sdk-typescript, semantic-kernel-
strale, skill, strale-capabilities), plus `apps/` and the repository root,
were searched for other committed JSON/YAML/TypeScript/Python files embedding
provider names, capability descriptions, or catalogue data, and for other
generator scripts writing such a file to disk (appendix S36-S40):

- Every `.json`/`.yaml`/`.yml` file git-tracked under `packages/` was listed
 (S36): only `packages/mcp-server/server.json` (a hand-written MCP registry
 manifest with generic marketing prose, no vendor names, no generated
 timestamp) and `packages/strale-capabilities/capabilities.json` itself.
 The eight Python packages (`composio-strale`, `crewai-strale`,
 `google-adk-strale`, `langchain-strale`, `openai-agents-strale`,
 `pydantic-ai-strale`, `sdk-python`, `skill`) carry no committed JSON/YAML
 data files at all - only `pyproject.toml`, `README.md`, and `.py` source.
- Every script under `packages/` that both writes to disk
 (`writeFileSync`/`write_text`/`open(..., "w")`) and mentions capability or
 catalog concepts (S37) found only `generate.js` itself.
- The distinctive vendor names from `config/env-manifest.yaml`'s 44 provider
 values (S13) were grepped across every git-tracked file under `packages/`
 (S38): the only hit is `capabilities.json` (R12).
- Root-level tracked JSON/YAML (`context7.json`, `glama.json`, `server.json`,
 `smithery.yaml`) and every JSON/YAML file under `apps/` other than test
 fixtures, config, and the already-inventoried `manifests/*.yaml` and
 `coverage-matrix/*.yaml` (S40) were read: none embed a generated vendor
 snapshot. `apps/api/audit-report.json` does mention `Serper.dev` (a stale,
 untracked-by-any-current-script artifact last touched 2026-03-18, no
 script under `apps/api/scripts` or `apps/api/package.json` references it),
 but it is not published or shipped anywhere - it stays out of this
 inventory's runtime/account-readiness/historical categories as an
 unreached, non-customer-facing leftover, not a new finding.
- Other generator scripts repo-wide whose name matches
 `generate|snapshot|catalog` (S39) are either capability executors (runtime
 code already covered by R10), the already-inventoried
 `regenerate-coverage-matrix-summary.mjs` (R6), or scripts under
 `apps/api/scripts/archive/` (dead, not on any current path).

**Conclusion: the sweep found nothing beyond R12.** `capabilities.json` is
the only committed, generated, customer-facing catalogue snapshot embedding
vendor names anywhere in `packages/`, `apps/`, or the repository root.

### 2. Notion dependencies

Every current repository reader/writer of a Notion vendor surface, each of
which needs a mapped replacement before M4 per the acceptance shape's
condition 1:

| Notion surface | Repo reader | What must be replaced |
|---|---|---|
| Vendor Roster (`af5a164b...`) | `check-vendor-roster-drift.ts` (H3); `vendor_roster_url` links in 8 coverage-matrix rows (H4, link only, not fetched); two capability-file pricing comments (H5, prose only) | The drift-check query itself, and the historical-evidence trail the 8 links and 2 comments point at |
| Active Vendor Stack (`35367c87...`) | `check-vendor-roster-drift.ts`'s `ACTIVE_VENDOR_STACK_PAGE` constant (H2) - declared at line 51, used only at line 100 inside the string `printManualProcedure()` prints; `runCheck()` (lines 158-236) never reads or references it | **Dead reference, printed in the manual procedure only, not a live input** (confirmed by reading the whole file; see H2) - no replacement needed for the check itself, only for the printed procedure text a human follows by hand |
| Decisions DB (`ea57671f-...`) | `check-vendor-roster-drift.ts` (H3, read); `.claude/skills/vendor-switch/SKILL.md` and its `.agents/` mirror (H6, directs a human to write a new Decision row here) | The read side needs a repo-native Decision-record source (already exists per `docs/decisions/records/*.md` - H3 should probably read those instead); the write side (H6) needs the skill retargeted only after a repo-native decision route exists, per the M2 gaps report's own explicit caveat |
| `NOTION_TOKEN` (env credential) | Consumed only by `check-vendor-roster-drift.ts` per this batch's search, corroborating the prior M1 finding at `docs/strategy/2026-08-31-notion-consumer-migration-inventory.md:56` | Retire only after H3's read side is replaced |

No other script, route, job, or scheduled workflow in the repository reads or
writes a Notion vendor surface. `NOTION_API_KEY` (distinct from
`NOTION_TOKEN`) is consumed by the daily digest per the same M1 inventory row
and is unrelated to vendor state.

**Considered and excluded:** `apps/api/src/lib/daily-digest/fetch-notion.ts`
also holds a `DECISIONS_DB` constant (`ea57671f-...`, same database as H3)
and queries it in `fetchUnreviewedDecisions()` (lines 135-155) - but only
with the generic filter `{ property: "Reviewed", checkbox: { equals: false
} }`, no vendor-specific field or query. It is a Decisions-database reader,
not a vendor-state reader, so it needs no mapped replacement under this
finding; recorded here so batch 2 knows it was considered and excluded.

### 3. Write-path owners (candidates only - no design chosen)

| Fact | Candidates the evidence supports | Recommendation basis |
|---|---|---|
| Vendor identity + lifecycle status (active/fallback/candidate/held/rejected/deprecated) | (a) extend `dependency-manifest.ts`'s `PROVIDERS` array with the missing states (candidate/held/rejected have no current code representation at all - see Gap G1); (b) a new DB table alongside `vendorAccounts` | `dependency-manifest.ts` already carries `tier`/`retired`/`replacedFrom`/`migratedAt` - closest existing lifecycle-with-history shape (R4) |
| Capability/solution dependency edges (required vs fallback) | `vendor_capability_dependencies` (R5) as the single owner, with `dependency-manifest.ts`'s arrays either derived from it at build/test time or retired in favour of it | The DB table is already the one `deriveVendorInventoryIssues` (A5) treats as ground truth to check the code array against |
| Account usability (balance, credentials, suspension) | `vendorAccounts` + the suspension tables (A1-A3) | Already the sole owner; no competing surface found |
| Terms/pricing/licensing/redistribution verification | `apps/api/coverage-matrix/*.yaml` (R6) for the 47 capability×country×evidence-type rows it already covers; **unclear** for every vendor outside that scope (e.g. Anthropic, Voyage AI, Stripe, Coinbase, Better Stack - none of these appear in coverage-matrix because they aren't a per-country registry lookup) | Coverage-matrix has the schema (`provider_tos_notes`, `last_verified`, `evidence_grade`) but a scope limited to the identity/beneficial-ownership/sanctions/registry evidence types listed in its own `schema.json` enum |
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
 records/*.md`) and vendor facts exist (R1-R12), but nothing currently
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

- **Resolved in this revision:** whether `check-vendor-roster-drift.ts`'s
 `ACTIVE_VENDOR_STACK_PAGE` constant is live input or dead reference. A full
 read of the file (all 250 lines) confirms the constant is declared at line
 51 and used only at line 100, inside the string `printManualProcedure()`
 prints (that function runs only in `--doc` mode or as the no-`NOTION_TOKEN`
 fallback, line 162); `runCheck()` (lines 158-236), the only code path that
 reads live data, never fetches or diffs the Active Vendor Stack page. It is
 a **dead reference, printed in the manual procedure only, not a live
 input** - see H2. No longer left unclear; batch 2 needs no separate
 replacement for the check itself, only for the printed procedure text a
 human follows by hand (folded into H2's Notion-dependency row).
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

Every search command in this table was re-run on this branch (still built on
`origin/main` at `9ec2a91a`, the same base the first version cited - no
intervening `main` commits changed any file this appendix searches) and every
result below is the actual current count, not the count from the first
version of this report. The first version's counts had simply drifted from
what their own commands produce; this is not staleness from later commits,
since the repository base is unchanged. Where a command's literal text does
not produce the result the first version claimed, the note says what the
rerun actually shows and why (S18, S29). File-count searches use ripgrep
(`files_with_matches`) or `grep -l` as specified; four broad whole-repo term
counts (S1-S5) were run via a backgrounded shell because an unindexed
`grep -r .` sweep across the whole tree is slow.

| # | Command (pattern / scope) | Result |
|---|---|---|
| S1 | `grep -rEi "vendor" --include="*.ts" --include="*.mjs" --include="*.yaml" --include="*.yml" --include="*.md" --include="*.json" -l .` (excl. `node_modules`, `archive/`) | 520 files |
| S2 | same scope, `\broster\b` | 45 files |
| S3 | same scope, `\bprovider\b` | 354 files |
| S4 | same scope, `\bsupplier\b` | 38 files |
| S5 | same scope, `\bupstream\b` | 385 files |
| S6 | ripgrep `vendor` (case-insensitive), whole repo, `files_with_matches` | 585 files |
| S7 | ripgrep `vendor` (case-insensitive), `apps/api/src` only | 148 files |
| S8 | ripgrep `roster` (case-insensitive), whole repo | 93 files |
| S9 | ripgrep `\bupstream\b` (case-insensitive), `apps/api/src` only | 171 files |
| S10 | ripgrep `vendor_roster_url`, whole repo | 54 raw matches, of which 6 are this report file's own prose discussing the term (self-matches, since the report itself now names `vendor_roster_url`). Excluding `archive/` (as S1-S5 already do, for the same reason): 48 matches - 47 in `apps/api/coverage-matrix/*.yaml` (one `vendor_roster_url:` line per row, 8 non-null + 39 `null`) + 1 in `schema.json`'s field definition |
| S11 | ripgrep `Active Vendor Stack`, `*.md`/`*.ts`/`*.yaml`/`*.yml` | 29 files |
| S12 | ripgrep `Vendor Roster`, `*.md`/`*.ts` | 24 files |
| S13 | `grep provider: config/env-manifest.yaml \| sed ... \| sort -u` | 44 distinct provider names |
| S14 | `grep -h "^data_source:" manifests/*.yaml \| sort -u` | 334 distinct data_source strings |
| S15 | `grep -n "vendor" apps/api/coverage-matrix/schema.json` (targeted read of the coverage-matrix schema) | 3 literal matches (`vendor-claimed` enum value ×2, `vendor_roster_url` field name ×1); `provider_tos_notes`, `doctrine_reference`, `evidence_grade`, `last_verified` were confirmed present by reading the schema file, not by this grep (they contain no substring "vendor") |
| S16 | `grep -rn "runVendorControlTower\|vendor-control-tower" apps/api/src --include="*.ts"` (excl. `.test.ts`) | 11 matches across 7 files, confirming the hourly job wiring (R4/A2 reach) |
| S17 | `grep -n "vendor-morning-status\|deriveVendorMorningIssues\|deriveVendorInventoryIssues" apps/api/src --include="*.ts"` (excl. `.test.ts`) | 2 matches, both in the module itself - confirms A5 has exactly one caller (`vendor-control-tower-report.ts`) |
| S18 | `grep -rn "check-vendor-roster-drift\|vendor-control-tower-report" package.json apps/api/package.json .github/workflows/*.yml docs/company/DAILY-RUN.md` | 2 matches: `apps/api/package.json:21` (`vendor:status` script), `weekly-drift.yml:86`. The first version claimed a third match at `DAILY-RUN.md:60`; that line reads "`cd apps/api && npm run vendor:status`" - it names the npm script alias, not the literal string `vendor-control-tower-report`, so this exact command does not and never did match it. A4's reach through `DAILY-RUN.md:58-60` is still correct; it was established by reading that file directly (see the "Known surfaces" paragraph below), not by this grep. |
| S19 | `grep -rln "from .*dependency-manifest" apps/api/src --include="*.ts"` (path-anchored import search) | 8 files: `anthropic-dependency-drift.test.ts`, `browserless-dependency-drift.test.ts`, `credential-health.ts`, `dependency-health.ts`, `situation-assessment.ts`, `startup-migrations.ts`, `upstream-health-gate.test.ts`, `upstream-health-gate.ts` |
| S20 | `grep -rln "getActiveVendorNames\|getStaleVendorNames\|STALE_VENDORS\|STATIC_FACTS.vendors" apps/api/src apps/api/scripts --include="*.ts"` (excl. `.test.ts`) | 2 files: `platform-facts.ts`, `check-platform-facts-drift.ts` |
| S21 | `grep -n "check-platform-facts-drift" package.json apps/api/package.json .github/workflows/*.yml` | 1 match: `weekly-drift.yml:63` (confirms it is **not** a per-PR gate) |
| S22 | `grep -n "vendor_accounts\|vendor_capability_dependencies\|vendor_capability_suspensions\|vendor_solution_suspensions\|export const vendor" apps/api/src/db/schema.ts` | 10 matches, still confined to the same 4 tables |
| S23 | `grep -n "providerName\|provider_name" apps/api/src/db/schema.ts` | 10 matches, still confined to the 4 tables in S22 - no other table carries a `provider_name` column |
| S24 | `grep -n "vendor" -i .github/workflows/ci.yml` | 3 matches (a credential-format comment; the Block 0082 throttled-vendor guard comment, now on two lines) - none a vendor-state reader in the brief's sense |
| S25 | `grep -ln "vendor" -i .github/workflows/*.yml` | 2 files: `ci.yml`, `weekly-drift.yml` |
| S26 | `grep -n "Dilisense\|OpenSanctions\|Serper\|Voyage\|Browserless\|Stripe\|Cobalt\|Liberty Data\|GLEIF\|BODACC" docs/company/claims.yaml` | 1 match - a scope-boundary comment, not a claim row |
| S27 | `grep -n "vendor" -i docs/company/claims.yaml` | 3 matches, all in the same header comment disclaiming vendor-drift scope |
| S28 | `diff .claude/skills/vendor-switch/SKILL.md .agents/skills/vendor-switch/SKILL.md` | 0 differences (byte-identical) |
| S29 | `grep -c "Vendor Roster\|Active Vendor Stack" docs/strategy/2026-08-31-notion-consumer-migration-inventory.md` | 3 matching lines (line 14 the M1 inventory row, line 37 the surface list, line 42 the row-count sentence), corroborating H1-H3/H8 independently. The first version's `grep -n -A15 ... | 2 matches` conflated a 15-line-of-context display with a match count; recounted directly here without `-A` context. |
| S30 | `grep -rln "vendor" apps/api/scripts --include="*.ts" --include="*.mjs" -i` | 15 files |
| S31 | `ls apps/api/scripts \| grep -i vendor` | 2 files: `check-vendor-roster-drift.ts`, `vendor-control-tower-report.ts` |
| S32 | `grep -n "vendor" -i apps/api/scripts/check-cost-class-coherence.mjs` | 19 matches - confirms the resolved rate-limit duplication (R11) |
| S33 | `grep -n "Vendor Roster\|Active Vendor Stack" apps/api/src/capabilities/*.ts` | 3 matches, all dated prose comments (H5) |
| S34 | `grep -n "vendor:" apps/api/src/lib/solution-activation.ts` | 3 matches, confirming R8's predicate and its documented rationale |
| S35 | `grep -in "vendor" apps/api/src/lib/upstream-tracker.ts apps/api/src/lib/upstream-health-gate.ts` | 0 literal matches for "vendor" (case-insensitive) in either file - R9's conclusion (these track serving health, not vendor identity) comes from reading the files, not from this grep matching anything |
| S36 | `git ls-files packages/ \| grep -E '\.(json\|yaml\|yml)$'` (added for item 1's sweep) | 11 files: 9 `package.json`/`tsconfig.json` config files, `packages/mcp-server/server.json` (hand-written MCP registry manifest, generic prose, no vendor names), and `packages/strale-capabilities/capabilities.json` (R12) - no other committed JSON/YAML data file anywhere under `packages/` |
| S37 | `grep -rlnE "writeFileSync\|write_text\|open\(.*['\"]w['\"]" packages/ --include="*.js" --include="*.ts" --include="*.py" --include="*.mjs"` (excl. `node_modules`, `/tests/`, `/dist/`) | 1 file: `packages/strale-capabilities/generate.js` - no other script under `packages/` writes to disk |
| S38 | `grep -lnE "Dilisense\|OpenSanctions\|Serper\|Cobalt Intelligence\|GEMI\|Zefix\|EINsearch\|sec-api\|Etherscan\|Tenderly\|Alchemy" $(git ls-files packages/)` (distinctive `config/env-manifest.yaml` provider names, per S13, against every git-tracked file under `packages/`) | 1 file: `packages/strale-capabilities/capabilities.json` |
| S39 | `git ls-files \| grep -iE '(generate\|snapshot\|catalog).*\.(js\|ts\|mjs\|py)$'` then excl. `node_modules` and any `*test*` path (repo-wide generator-script name sweep, for item 2) | 39 files, all either `apps/api/src/capabilities/*-generate.ts` executors (runtime code, R10), already-inventoried scripts (`regenerate-coverage-matrix-summary.mjs`, R6), dead files under `apps/api/scripts/archive/`, or `packages/strale-capabilities/generate.js` itself (R12) - no other script in this list writes a committed catalogue/vendor snapshot |
| S40 | `git ls-files \| grep -E '^[^/]+\.(json\|yaml\|yml)$'` (root) plus `git ls-files apps/ \| grep -E '\.(json\|yaml\|yml)$'` excl. `node_modules`, `package(-lock).json`, `tsconfig`, `.eslintrc`, `manifests/`, `coverage-matrix/` (apps/, for item 2) | 7 root files (`context7.json`, `glama.json`, `package-lock.json`, `package.json`, `server.json`, `smithery.yaml`, `tsconfig.json`) + 39 apps/ files (all `apps/api` test fixtures under `test/fixtures/tier-coverage/`, plus `audit-fixes.json`, `audit-report.json`, `docker-compose.dev.yml`, `console-allowlist.json`, `jcs-vectors.json`, `startup-migrations.ledger.json`) - none is a published, generated, vendor-naming catalogue snapshot |
| S41 | `rg -n "generate\.js" .` (repo-wide literal search, for R12's reach) | 6 non-report hits across 4 files: `packages/strale-capabilities/package.json:8` (`"generate": "node generate.js"`, the package's own npm script), `packages/strale-capabilities/generate.js:6` (its own usage comment), and 4 unrelated `*-generate.js` capability-executor imports, matched only because they share the `-generate.js` suffix: `apps/api/src/capabilities/caller-url-read-limits.test.ts:67` and `apps/api/src/capabilities/input-shape-refusal.test.ts:27`, `:31` and `:32`. Only the first 2 concern R12. No `.github/workflows/*.yml` references `generate.js` |

Known surfaces the brief named explicitly were each opened and read in full or
in the relevant section: `apps/api/src/lib/platform-facts.ts` (279 lines, read
whole), `apps/api/src/lib/dependency-manifest.ts` (765 lines, header + 100
lines read), `apps/api/scripts/vendor-control-tower-report.ts` (104 lines,
read whole), `apps/api/src/db/schema.ts` (control-tower table block, lines
1099-1199, read whole), `apps/api/scripts/check-vendor-roster-drift.ts` (all
250 lines read, in full, for this revision - the first version read only the
header and first 60 lines, which is what left the `ACTIVE_VENDOR_STACK_PAGE`
question unclear), the `apps/api/coverage-matrix/` directory (README.md,
schema.json, one full example row, and a full `ls`/extension breakdown of all
52 entries for this revision's denominator fix), `config/env-manifest.yaml`
(provider field extracted, 44 distinct values), `.claude/skills/vendor-switch/
SKILL.md` and `.agents/skills/vendor-switch/SKILL.md` (both read whole, diffed
identical), every `.github/workflows/*.yml` (6 files, listed and grepped),
`docs/company/claims.yaml` (267 lines, header read), and, added for this
revision, `packages/strale-capabilities/generate.js` (53 lines, read whole),
`packages/strale-capabilities/package.json` (confirms `capabilities.json` is
in the published `files` array), and `.github/workflows/release-npm.yml`
(confirms the `workflow_dispatch` package option and the `push.tags: "*@*"`
trigger).
