# Session B: Onboarding Engine Audit

**Date:** 2026-04-20
**HEAD:** `6dfb47f` (`main`)
**Scope:** capability + solutions onboarding engine
**Depth:** medium (bugs + design weaknesses; architectural rewrite deferred to remediation)
**Pre-decided:** solutions get equal-depth treatment; authority model is an Open Question

---

## 1. Architecture summary

The onboarding engine is the set of pathways that get a capability or solution from declared-intent (YAML manifest or hand-coded TypeScript) to a live DB row that `/v1/do` and `/v1/solutions/:slug/execute` can serve.

**Capability pathways** (four distinct, not unified):

```
┌─ scripts/onboard.ts ──── manifest YAML → validateManifest() → INSERT capabilities
│                                                              → INSERT test_suites (5 types)
│                                                              → INSERT capability_limitations
│                          (post-insert gates NOT run)
│
├─ db/seed.ts          ─── hardcoded array → direct INSERT → onCapabilityCreated()
│                          (post-insert gates DO run: gate1 structure, gate3 schema,
│                           readiness, gate5 path coverage, visibility, transparency-tag
│                           auto-detect)
│
├─ admin UI            ─── direct DB edit (no gates re-run)
│
└─ direct SQL (SA.2b.c) ── bypass all gates (DEC-20260420-I)
```

**Solution pathways** (two, neither uses YAML):

```
├─ scripts/seed-kyb-solutions.ts ── TS code → validateSolution() (gates 1+4a)
│                                          → enforceGates()
│                                          → tx.upsert(solutions, solution_steps)
│                                          (no gate4b dry-run, no test generation)
│
└─ db/seed-solutions.ts (3055 LOC) ── older hand-coded path
```

**Gate framework** (`lib/onboarding-gates.ts`, 386 LOC):
- Gate 1 structure (`validateCapabilityStructure`): 12 checks, post-insert re-validation
- Gate 1 manifest (`validateManifest` in onboard.ts): pre-insert file validation, ~17 checks
- Gate 3 schema coherence (`validateCapabilitySchema`): required ⊆ properties
- Gate 4a solution composition (`validateSolution`): $input and $steps[N] references
- Gate 4b solution dry-run (`runSolutionDryRun`): thread mock outputs through step chain
- Gate 5 path coverage (`runGate5`): multi-path capabilities must cover PRIMARY and SECONDARY
- Escape hatch: `SKIP_ONBOARDING_GATES=true` disables all (one env var, all gates).

**Post-insert hook** (`lib/capability-onboarding.ts`, 783 LOC) runs from seed.ts only. Covers: test-suite generation (3-4 suites), transparency-tag auto-detect, metadata warnings, readiness check, gate 5, visibility verification, fire-and-forget `validateTestFixtures` (live execution to calibrate assertions).

**Schema-validator** (`lib/schema-validator.ts`, 142 LOC): fail-fast at boot for 10 specific `capabilities` / `transactions` / `transaction_quality` columns. Does NOT cover `solutions` or `solution_steps`.

**Runtime consumers** of onboarding-produced state:
- `routes/do.ts` (~3,000 LOC) reads 20+ capability columns per request.
- `routes/transactions.ts` joins capabilities for audit/quality.
- `routes/solution-execute.ts` (404 LOC) loads `solutions` + walks `solution_steps`.
- `routes/quality.ts`, `lib/digest-compiler.ts`, `lib/trust-grade.ts`, `lib/sqs.ts` read capability trust/freshness state.

**LOC per subsystem** (rough):

| Subsystem | LOC |
|---|---|
| Capability onboarding (onboard.ts + gates + hook + readiness + integrity-hash + SCF-3 lint) | ~3,279 |
| Solution onboarding/execution (seed-kyb-solutions + solution-executor + gate4b + routes) | ~2,169 |
| Test generation (test-generation + test-input-generator + fixture-quality + dependency-manifest) | ~1,105 |
| Manifests | 275 YAML files |
| Drizzle migrations touching capabilities/solutions | 15+ |

---

## 2. Assumptions made

- Baseline test run (208 passing / 11 pre-existing FRONTEND_URL failures from SA.2b.d) is still current; I did not re-run `npm test` as part of this audit.
- The 238 Class 4 drift entries from `audit-reports/manifest_drift_inventory.md` are treated as evidence, not re-audited. Where a Session B finding overlaps, I cite the drift doc instead of re-enumerating.
- I assumed `seed.ts` (2,834-line file with 290+ capability definitions) is the canonical pre-YAML authoring pathway and haven't treated it as a separate subsystem. It calls `onCapabilityCreated` and therefore inherits the full post-insert gate chain, which is the intended shape.
- I assumed `capabilities.slug` is unique (schema.ts line 96 declares `.unique()`); race conditions on concurrent onboard runs are not considered in scope.
- I did not trace Gate 4b (solution dry-run) through an actual run in production. Evidence is code-only.
- I did not execute a solution end-to-end to confirm the `$steps[N]` parallel-group ordering finding (F-B-016); the finding is from code reading plus reasoning about Promise.all semantics.

---

## 3. Findings

### F-B-001: `scripts/onboard.ts` bypasses the post-insert gate chain entirely

- **Category**: Bug, Design weakness
- **Severity**: High
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts:757-797](apps/api/scripts/onboard.ts#L757-L797), [apps/api/src/lib/capability-onboarding.ts:22-201](apps/api/src/lib/capability-onboarding.ts#L22-L201), [apps/api/src/db/seed.ts:2834](apps/api/src/db/seed.ts#L2834)
- **What's wrong**: `onboard.ts` is advertised (in [CLAUDE.md](CLAUDE.md)'s "MANDATORY PIPELINE") as the canonical onboarding path for new capabilities. But after the three `db.insert()` calls (capabilities, test_suites, limitations) it returns. It does **not** import or call `onCapabilityCreated(slug)`. `seed.ts:2834` does. As a result, CLI-onboarded capabilities skip: Gate 1 structure re-validation, Gate 3 schema coherence check, transparency-tag auto-detection, metadata completeness check, readiness check (with cache clear), Gate 5 path coverage, visibility verification, and fire-and-forget `validateTestFixtures` calibration against live execution.
- **Why it matters**: The two gate chains (pre-insert `validateManifest` in the CLI vs post-insert `validateCapabilityStructure` + readiness in the hook) were designed to cover different surface area. Class 5 drift findings in `audit-reports/manifest_drift_inventory.md` are a direct consequence: the CLI's pre-insert gate doesn't know about `transparency_tag` enum or `is_free_tier` semantics, and the post-insert gate never fires for CLI-onboarded caps, so invalid values land in DB undetected. Every capability onboarded via the CLI since the gate framework was introduced has entered production without the post-insert safety net.
- **Reproduction / evidence**: `grep -n "onCapabilityCreated" apps/api/scripts/onboard.ts` returns zero matches. `grep -n "onCapabilityCreated" apps/api/src/db/seed.ts` returns 2 matches. CLAUDE.md line "Auto-registered — executors are auto-imported at startup" and "Automated testing — 5 test types auto-generated at onboarding" both refer to behaviour that lives in the hook, not the CLI.
- **Suggested direction**:
  1. Call `onCapabilityCreated(manifest.slug)` from `onboard.ts` after the final INSERT, wrapped in a try/catch that surfaces gate violations as CLI errors (not warnings).
  2. Alternatively, extract the post-insert chain into a shared function `finalizeCapability(slug)` that both pathways call.
- **Related findings**: F-B-002 (non-transactional), F-B-006 (two-validator drift).

### F-B-002: Onboarding pipeline is non-transactional — partial state on mid-sequence failure

- **Category**: Bug, Safety
- **Severity**: High
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts:757-797](apps/api/scripts/onboard.ts#L757-L797)
- **What's wrong**: `onboard()` performs three independent `db.insert(...)` calls sequentially with no surrounding `db.transaction(...)`: (1) capabilities row, (2) N test_suites rows in a for-loop, (3) M capability_limitations rows in a for-loop. If any step after (1) fails (DB connection drop, constraint violation in test_suites, duplicate limitation sort_order), the capability row is already committed; subsequent inserts may partially succeed. There is no rollback path and no cleanup. This contrasts with `seed-kyb-solutions.ts:590-675` which wraps its solution-and-steps upsert in `tx.transaction(...)`.
- **Why it matters**: A partially-onboarded capability is worse than no capability: the row exists (so seeding, readiness checks, and catalog endpoints see it), but test suites are missing or incomplete, so quality scoring is blind. With `visible=false` the public catalog doesn't show it, but internal jobs and free-tier/x402 wildcards could still execute against a capability whose suites say it's untested. The drift audit's 32 orphan rows may partly reflect earlier incidents of this kind.
- **Reproduction / evidence**: Inject a DB error mid-sequence (e.g., break the second test-suite insert). The capabilities row remains; partial test_suites rows remain; limitations aren't written. Recovery requires manual SQL cleanup.
- **Suggested direction**: Wrap the INSERT block in `await db.transaction(async (tx) => { ... })`, pass `tx` to each insert. On failure the whole onboarding rolls back. Pairs naturally with F-B-001 if `onCapabilityCreated` is folded in — the hook can run inside the same transaction or as an after-commit step with its own rollback semantics.
- **Related findings**: F-B-001.

### F-B-003: `freshness_category` is queried by the runtime but never written by `onboard.ts`

- **Category**: Bug, Correctness
- **Severity**: High
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts:757-778](apps/api/scripts/onboard.ts#L757-L778), [apps/api/src/lib/trust-grade.ts:28-52](apps/api/src/lib/trust-grade.ts#L28-L52), [apps/api/src/routes/quality.ts:43-93](apps/api/src/routes/quality.ts#L43-L93), [apps/api/src/routes/do.ts:302-775](apps/api/src/routes/do.ts#L302-L775)
- **What's wrong**: The `Manifest` type in `onboard.ts:76` declares `freshness_category?: string`. The INSERT on line 757-778 does NOT include `freshnessCategory`. Every new capability onboarded via the CLI lands with `freshness_category = NULL`. `trust-grade.ts:34` short-circuits to `null` when `freshnessCategory` is null, so the trust grade computation silently degrades; `quality.ts` and `do.ts` emit null in the audit payload; `digest-compiler.ts` reports "unknown" freshness.
- **Why it matters**: The drift inventory reports 72 slugs with `freshness_category` conflict between YAML and DB. That pattern reads as "YAML has stale defaults; DB has correct values set by admin after onboarding." This finding is the upstream cause: the pipeline never writes the field, so operators have to fix it out-of-band every time. Also affects `geography` (F-B-004) — same root cause.
- **Reproduction / evidence**: Add a new capability manifest with `freshness_category: reference-data`, run `npx tsx scripts/onboard.ts --manifest manifests/new.yaml`, then `SELECT slug, freshness_category FROM capabilities WHERE slug = 'new'` → NULL.
- **Suggested direction**: Add `freshnessCategory: manifest.freshness_category ?? null` to the INSERT values object (line 770-778). Fold into the backfill path too (line 1056-1079 pattern).
- **Related findings**: F-B-004 (geography), Class 4 drift in manifest_drift_inventory.md.

### F-B-004: `geography` field is likewise never written by `onboard.ts`

- **Category**: Bug, Correctness
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts:757-778](apps/api/scripts/onboard.ts#L757-L778), [apps/api/src/db/schema.ts:107-108](apps/api/src/db/schema.ts#L107-L108)
- **What's wrong**: Same pattern as F-B-003. `capabilities.geography` (schema.ts line 107) is a documented column used for filtering (e.g., "nordic", "eu") but `onboard.ts` does not declare `geography?: string` in the `Manifest` interface and does not insert it. The CLI cannot author geographically-scoped capabilities; they must be updated via admin or direct SQL.
- **Why it matters**: Geography drives solution filtering (`/v1/solutions?geography=nordic`) and catalog display. CLI-onboarded caps are geographically invisible to those filters.
- **Reproduction / evidence**: Inspect the insert at onboard.ts:757-778 — no `geography:` key.
- **Suggested direction**: Add `geography?: string` to the `Manifest` interface, add `geography: manifest.geography ?? null` to the insert, and document the allowed values (they aren't currently in any enum).
- **Related findings**: F-B-003.

### F-B-005: `--discover` executes capabilities LIVE even under `--dry-run`

- **Category**: Bug, Resource efficiency, Safety
- **Severity**: High
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts:701-704](apps/api/scripts/onboard.ts#L701-L704), [apps/api/scripts/onboard.ts:581-647](apps/api/scripts/onboard.ts#L581-L647), [apps/api/scripts/onboard.ts:741-747](apps/api/scripts/onboard.ts#L741-L747)
- **What's wrong**: `verifyFixtures` (line 741) is correctly gated by `if (!dryRun)`. `discoverFixtures` is NOT: line 702 `if (flags.discover)` runs regardless of `dryRun`. `discoverFixtures` calls `executeCapability` which calls the real executor. For capabilities backed by paid external APIs (Claude, Browserless, Serper, Dilisense, AviationStack, Adzuna, OpenSanctions), each `--dry-run --discover` invocation spends real money and writes the regenerated manifest to disk — even though the user asked to "preview without inserting to DB". Batch mode with `--dry-run --discover --delay-ms 2000` across 275 manifests would bill every upstream.
- **Why it matters**: The Test Infrastructure Cost Principles in CLAUDE.md explicitly include "Zero-cost health probes" as mandatory. `--dry-run` semantically promises no side effects. A reasonable operator runs `--dry-run --discover` to see "what would discovery do" without spending anything; today they've been billed and the manifest has been rewritten on disk.
- **Reproduction / evidence**: `npx tsx scripts/onboard.ts --manifest manifests/pep-check.yaml --dry-run --discover` → Dilisense API call + manifest file rewrite. Confirmed: `discoverFixtures:642-643` writes the file.
- **Suggested direction**: Move the `if (flags.discover)` block inside the `if (!dryRun)` guard, or have `discoverFixtures` itself refuse to run when `dryRun === true` with a helpful error ("Discovery requires live execution. Re-run without --dry-run, or use --dry-run alone to preview insert without discovery.").
- **Related findings**: F-B-014 (another path that spends on live execution), F-B-013 (negative test).

### F-B-006: Two-validator gate framework drifts in coverage (Class 5 from drift inventory)

- **Category**: Design weakness
- **Severity**: High
- **Confidence**: High
- **Location**: [apps/api/src/lib/onboarding-gates.ts:249-358](apps/api/src/lib/onboarding-gates.ts#L249-L358), [apps/api/scripts/onboard.ts:129-214](apps/api/scripts/onboard.ts#L129-L214)
- **What's wrong**: Two validators exist with overlapping but divergent field coverage:
  - `validateManifest()` (pre-insert, authoring-time) in onboard.ts:129 covers: slug, name, description, category, price_cents, schemas, data_source, data_source_type, maintenance_class, test_fixtures, output_field_reliability, limitations, processes_personal_data.
  - `validateCapabilityStructure()` (post-insert, DB-row) in onboarding-gates.ts:249 covers: name, slug, description, category, price_cents + is_free_tier, schemas (type:object only), data_source, transparency_tag, maintenance_class, processes_personal_data, personal_data_categories taxonomy.
  - Fields checked only in `validateManifest`: `data_source_type`, `test_fixtures`, `output_field_reliability`, `limitations`.
  - Fields checked only in `validateCapabilityStructure`: `transparency_tag` enum, `is_free_tier` (affects price check).
- **Why it matters**: The drift inventory's Class 5 section documents this exact pattern as cause of:
  - 5 manifests with `transparency_tag: "external_api"` (invalid enum) passing `validateManifest`.
  - 77 rows with `capability_type: "ai_assisted"` where the YAML still says `data_source_type: api` — a round-trip that no validator catches.
  - `is_free_tier` authoring behaviour: the CLI silently defaults to `false` because `validateManifest` doesn't ask the author to declare it.
- **Reproduction / evidence**: `audit-reports/manifest_drift_inventory.md` Section 6 Findings 5.1, 5.2, 5.3.
- **Suggested direction**: Unify into a single `validateCapability(source, target)` validator that takes the raw manifest object and returns violations. Run it at both file-parse time (in `onboard.ts`) and post-insert (`onCapabilityCreated`). Authority model is the OQ (see OQ-1). The unification is the mechanical fix regardless of authority choice.
- **Related findings**: F-B-007 (duplicated enums that already demonstrate drift risk), F-B-001.

### F-B-007: `VALID_MAINTENANCE_CLASSES` and `PII_CATEGORY_ENUM` are declared twice

- **Category**: Design weakness
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/lib/onboarding-gates.ts:219-226](apps/api/src/lib/onboarding-gates.ts#L219-L226), [apps/api/scripts/onboard.ts:143-146](apps/api/scripts/onboard.ts#L143-L146), [apps/api/src/lib/onboarding-gates.ts:232-245](apps/api/src/lib/onboarding-gates.ts#L232-L245), [apps/api/scripts/onboard.ts:193-196](apps/api/scripts/onboard.ts#L193-L196)
- **What's wrong**: Two enums that must stay in lockstep are declared in two files:
  - `VALID_MAINTENANCE_CLASSES` in `onboarding-gates.ts:219` (6 values) and `onboard.ts:143` (also 6 values, manually copy-pasted).
  - `PII_CATEGORY_ENUM` in `onboarding-gates.ts:232` (12 values, exported) and `onboard.ts:193` as a local `PII_CATEGORIES` const (same 12 values, not imported).
- **Why it matters**: Adding a new PII category (e.g., `geolocation`) or a new maintenance class (e.g., `community-maintained`) requires editing both. A PR that updates one file and not the other lands silently and causes a manifest that passes `validateManifest` but fails `validateCapabilityStructure` (or vice versa) — same pattern as Class 5.
- **Reproduction / evidence**: `grep -n "VALID_MAINTENANCE_CLASSES\|PII_CATEG" apps/api/scripts/onboard.ts apps/api/src/lib/onboarding-gates.ts`.
- **Suggested direction**: In `onboard.ts`, `import { PII_CATEGORY_ENUM, VALID_MAINTENANCE_CLASSES } from "../src/lib/onboarding-gates.js"` and delete the local copies. `VALID_MAINTENANCE_CLASSES` isn't currently exported — export it first. Add a narrow unit test `duplicated_enums.test.ts` that imports both modules and asserts equality (catches future drift).
- **Related findings**: F-B-006.

### F-B-008: Null vs undefined mismatch on `processes_personal_data` can cause INSERT to fail NOT NULL constraint

- **Category**: Bug, Correctness
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts:197-201](apps/api/scripts/onboard.ts#L197-L201), [apps/api/scripts/onboard.ts:773](apps/api/scripts/onboard.ts#L773), [apps/api/src/db/schema.ts:115](apps/api/src/db/schema.ts#L115)
- **What's wrong**: `validateManifest` checks `if (m.processes_personal_data === undefined)` and blocks. A YAML file with `processes_personal_data: null` parses to JS `null`, passes the `=== undefined` check, then hits the INSERT on line 773: `processesPersonalData: manifest.processes_personal_data ?? null`. Post-SA.2b.d, schema.ts line 115 is `.notNull().default(false)`. Drizzle sends explicit `NULL`, the DB rejects with a NOT NULL constraint violation. Error message surfaces late (post-gate, mid-insert) and is opaque.
- **Why it matters**: The symptom is a cryptic DB error instead of a clean gate violation. The fix is trivial, but an operator encountering it would be confused — the gate said OK, the DB said no. It also doubles as evidence that the gate and the DB constraint aren't coordinated.
- **Reproduction / evidence**: Author a manifest with `processes_personal_data: null`. Run `onboard.ts`. Observe Drizzle error.
- **Suggested direction**: Change the gate to `if (m.processes_personal_data === undefined || m.processes_personal_data === null)`. Change the INSERT to `?? false` (align with DB default) OR omit the key entirely (let DB default apply). The second option is safer since it localises the default in one place (the DB).
- **Related findings**: F-B-006.

### F-B-009: `SKIP_ONBOARDING_GATES` is a single-env-var kill switch for all gate enforcement

- **Category**: Safety, Design weakness
- **Severity**: High
- **Confidence**: High
- **Location**: [apps/api/src/lib/onboarding-gates.ts:17-24](apps/api/src/lib/onboarding-gates.ts#L17-L24), [apps/api/src/lib/onboarding-gates.ts:59](apps/api/src/lib/onboarding-gates.ts#L59), [apps/api/src/lib/onboarding-gates.ts:152](apps/api/src/lib/onboarding-gates.ts#L152), [apps/api/src/lib/onboarding-gates.ts:265](apps/api/src/lib/onboarding-gates.ts#L265)
- **What's wrong**: Setting `SKIP_ONBOARDING_GATES=true` causes `validateSolution`, `validateCapabilitySchema`, and `validateCapabilityStructure` to return `[]` immediately. The `logWarn` fires once at module load, not per call. If the env var is accidentally set in production (Railway variable copy-paste, misnamed shared-env file, CI config bleed), every new capability and every solution update onboards without validation until the service restarts with the flag unset. There is no on-call alert, no per-operation audit row, and no per-call warning. It also does not affect `validateManifest` in onboard.ts (pre-insert), only the post-insert gates, which compounds the drift surface.
- **Why it matters**: Escape hatches are fine; single-flag-disables-everything escape hatches with no telemetry are an auditability hole. The drift inventory's Class 5 findings include "5 manifests currently carry `transparency_tag: external_api`… the onboarding-gates check has never fired on these (they were probably inserted via seed.ts before the gate existed, or via an admin override)". That's the kind of silent-bypass this flag enables.
- **Reproduction / evidence**: `grep -rn "SKIP_ONBOARDING_GATES" apps/api/src`. One place it's set, three places it short-circuits.
- **Suggested direction**: (a) Narrow the scope: split into `SKIP_GATE_1`, `SKIP_GATE_3`, `SKIP_GATE_5` so the escape hatch is targeted. (b) Emit a `logWarn` on EVERY call that short-circuits (not just boot), so logs show which capability bypassed which gate. (c) Require a second env var to be set (e.g., `SKIP_GATES_REASON=<ticket-ref>`) and log it — paper-trail trade-off. (d) OR delete the flag entirely and require explicit opt-out via a `--skip-gates` CLI flag that only `onboard.ts` honours.
- **Related findings**: F-B-011 (no onboarding audit log), F-B-010 (same pattern, --force).

### F-B-010: `--force` bypasses the drift safety banner with no confirmation

- **Category**: Safety
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts:935-957](apps/api/scripts/onboard.ts#L935-L957), [apps/api/scripts/onboard.ts:1296](apps/api/scripts/onboard.ts#L1296)
- **What's wrong**: The drift safety banner (added 2026-04-20) prints a 12-line warning about the 238 Class 4 drift entries and requires `--force` to proceed with `--backfill`. But `--force` is just a CLI flag: `args.includes("--force")`. There's no typed-slug confirmation, no `--force=<slug>` pattern, no prompt. An operator running `onboard.ts --manifest manifests/pep-check.yaml --backfill --force` has acknowledged nothing — the warning is never printed (line 935 short-circuits the if-branch).
- **Why it matters**: The banner exists because the drift inventory documents concrete data-loss risk. A single typed flag with no confirmation is the same weight as any other flag. Auto-completion and shell history make it easier to re-run with --force than to re-read the banner. Low-severity-because-current-backfill-scope-is-narrow, but the banner itself says "re-check if this script is widened in the future" — the safety property depends on discipline, which the --force mechanism doesn't enforce.
- **Reproduction / evidence**: `grep -n "force" apps/api/scripts/onboard.ts` — three lines. No confirmation prompt.
- **Suggested direction**: Require `--force=<slug>` matching the manifest slug. If it doesn't match, abort with "—force must be =<expected-slug>; got <provided>; this gate exists to prevent accidental bulk overwrite." Alternatively, add a 5-second countdown with "press Ctrl-C to abort" after the warning print.
- **Related findings**: F-B-009 (same "single-flag bypass" pattern).

### F-B-011: No persistent audit log of onboarding events

- **Category**: Design weakness
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts](apps/api/scripts/onboard.ts), [apps/api/src/lib/capability-onboarding.ts:111-201](apps/api/src/lib/capability-onboarding.ts#L111-L201)
- **What's wrong**: Onboarding is the process by which a capability enters production. Every capability row is the result of an onboarding event. Yet there is no `onboarding_events` table or equivalent. The only record is log lines emitted by `log.info`/`logWarn` during the run, which rotate out of Railway log retention. `onboarding-gates-bypassed` and `onboarding-not-ready` warnings live in logs; after 7 days (Railway default) they're gone. There's no "when was slug X onboarded? with what manifest hash? did it pass Gate 5 at onboarding time? who ran it?" record.
- **Why it matters**: The SQS and trust-grade subsystem depends on onboarding-produced state. If a capability's quality degrades, diagnosing "did we onboard this broken, or did it regress?" requires log forensics. A compliance auditor asking "show me the validation trail for pep-check" has only `capabilities.created_at` and `updated_at` — no detail. Given SOC 2 / ISO 24970 ambitions around tamper-evident logging (F-A-002 scope), the onboarding event is a natural counterpart to the per-transaction integrity chain.
- **Reproduction / evidence**: No `onboarding_events`, `capability_changes`, or similar table in `schema.ts`. Migration history has no matching file.
- **Suggested direction**: Add an `onboarding_events` table: `(id, slug, event_type: enum, manifest_hash, gate_results jsonb, actor, created_at)`. Write a row at the end of each `onCapabilityCreated` and each CLI invocation (success and failure). Optionally chain via `previous_hash` if regulatory requirements warrant.
- **Related findings**: F-B-009 (escape hatch with no trail), F-B-020.

### F-B-012: Limitations are written only on first insert; backfill never UPDATEs them

- **Category**: Bug, Design weakness
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts:1082-1102](apps/api/scripts/onboard.ts#L1082-L1102)
- **What's wrong**: The backfill path inserts limitations only if `existingLimitations.length === 0`. If the manifest adds, removes, or edits a limitation, `--backfill` is a no-op for that change. The only way to update a limitation is direct DB edit. The onboarding pipeline is advertised as the authoring path, so this violates the "manifest is canonical" reading of the design.
- **Why it matters**: Limitations are user-visible on `/capabilities/:slug` detail pages and are part of the trust surface ("here's what this capability can't do"). Stale limitations mislead callers. The specific scenario: a third-party provider adds a new limitation to their manifest, opens a PR, operator runs `onboard.ts --backfill`, nothing happens to limitations. Operator believes it worked.
- **Reproduction / evidence**: Edit `manifests/pep-check.yaml` to add a third limitation. Run `--backfill`. `SELECT COUNT(*) FROM capability_limitations WHERE capability_slug = 'pep-check'` stays at the old count.
- **Suggested direction**: On backfill, diff the DB's limitations vs manifest. Either (a) full replace (DELETE + INSERT, risky if customer-pinned limitation_ids are referenced anywhere) or (b) upsert by (slug, sort_order) with a hash on (title, text, category, severity, workaround) to detect edits. Option (b) preserves referential stability.
- **Related findings**: F-B-001 (the backfill path skips the post-insert hook that could warn about stale limitations).

### F-B-013: Auto-generated `negative` test with `input: {}` may hit paid upstream APIs

- **Category**: Resource efficiency, Safety
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts:861-868](apps/api/scripts/onboard.ts#L861-L868), [apps/api/src/lib/capability-onboarding.ts:89-97](apps/api/src/lib/capability-onboarding.ts#L89-L97)
- **What's wrong**: Both the CLI and the post-insert hook generate a `testType: "negative"` suite with `input: {}`. The intent (per CLAUDE.md Principle B) is that every capability validates empty input locally before calling a paid API. That's a property of each capability's handler — not enforced by the generator. For capabilities that don't validate (or validate incompletely), a scheduled empty-input run actually calls Dilisense, Claude, Serper, Browserless, etc. with empty input and pays for the 401/400 round trip. Principle B mentions "~4×/day per provider" cost exposure; negative suites run at `scheduleTier: "B"` = every 24h plus on reactivation.
- **Why it matters**: Bill leakage. Also: the negative test's `validationRules: { checks: [] }` is an empty-checks rule — the test "passes" whether the capability errored locally or spent money and errored upstream. No signal in test results.
- **Reproduction / evidence**: Grep capabilities that call external APIs without input validation: e.g., [apps/api/src/capabilities/dilisense-pep.ts](apps/api/src/capabilities/dilisense-pep.ts) or similar. Principle B in CLAUDE.md acknowledges the problem.
- **Suggested direction**: Two-part fix: (a) add a `validationRules.checks: [{ field: "__no_external_call", operator: "is_true" }]` or equivalent marker so the test-runner can assert "this capability refused locally". (b) Add an onboarding-time probe that sends `{}` to the executor and measures latency — if latency > 50ms, fail the gate with "capability does not validate empty input before external call; add input-guard per Principle B." This enforces the principle at onboarding instead of hoping.
- **Related findings**: F-B-014.

### F-B-014: `validateTestFixtures` runs live executor calls fire-and-forget on every hook invocation — unbounded cost on reseeds/reactivations

- **Category**: Resource efficiency
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/lib/capability-onboarding.ts:120-125](apps/api/src/lib/capability-onboarding.ts#L120-L125), [apps/api/src/lib/capability-onboarding.ts:375-517](apps/api/src/lib/capability-onboarding.ts#L375-L517)
- **What's wrong**: `validateTestFixtures` executes the capability for real (line 424 `await executor(execInput)`) to calibrate assertions. It's called fire-and-forget from `onCapabilityCreated` (line 120). Every invocation of `onCapabilityCreated` — seed.ts startup, lifecycle reactivation via `onCapabilityReactivated` flows, trigger-test-runs.ts script, admin reseed — spends one external API call per capability. For a 307-capability seed restart, that's 307 paid calls at container cold-start. Multiplied by Railway autoscale events or dev-env restarts, the cost compounds silently.
- **Why it matters**: Dev-env restarts and preview deploys are routine. The comment on line 119 notes "getExecutor may return null during seed.ts" as a safeguard, but in a warm-start (hot reload) environment the executor IS registered, so the live call fires every time. Also: the execution has no idempotency guard — it's re-calibrating assertions based on a fresh external-data sample each time, which can introduce oscillation if an API returns slightly different output each call.
- **Reproduction / evidence**: Trace through: container starts → seed.ts runs (if needed) OR trigger-test-runs runs → `onCapabilityCreated` → `validateTestFixtures` → live executor call. Dilisense charges per call.
- **Suggested direction**: (a) Only run `validateTestFixtures` for newly-inserted capabilities, not re-calibrate on every hook call. Add a "fixtures calibrated at" timestamp; skip if within TTL (e.g., 7 days). (b) For capabilities marked `maintenance_class: commercial-stable-api` or `requires-domain-expertise`, gate the call behind an explicit flag. (c) Ensure it's actually fire-and-forget (today it is, but the log warning if it fails is thrown away — consider surfacing on the readiness check).
- **Related findings**: F-B-005 (`--discover` live cost), F-B-013.

### F-B-015: Solutions have no YAML / manifest authoring pathway — all authoring is hand-coded TypeScript

- **Category**: Design weakness
- **Severity**: Medium (architectural; impact scales with solution growth)
- **Confidence**: High
- **Location**: [apps/api/scripts/seed-kyb-solutions.ts](apps/api/scripts/seed-kyb-solutions.ts), [apps/api/src/db/seed-solutions.ts](apps/api/src/db/seed-solutions.ts) (3055 LOC)
- **What's wrong**: The capability onboarding pipeline centres on YAML manifests (275 files, canonical authoring surface). Solutions have nothing equivalent. All solution definitions live as TypeScript code in `seed-kyb-solutions.ts` (687 LOC, defining 60 solutions programmatically) and `seed-solutions.ts` (3055 LOC, older hand-coded definitions). To add or modify a solution, an engineer edits TS and runs the seed script; the authoring surface is inaccessible to non-engineers, third-party providers, or any other pathway capabilities have. There is no `solutions/*.yaml` directory, no `onboard-solution.ts`, no equivalent of `validateManifest`.
- **Why it matters**: The project's north star (per project memory: "scales to any sector where agents need verified data (real estate, finance, trade, HR, etc.) … long-term ambition is tens/hundreds of thousands of data sources") implies solutions will scale as fast as capabilities or faster, because solutions compose capabilities into high-value workflows. The current authoring asymmetry means third-party or non-engineer contributors cannot propose new solutions, and every new solution requires a seed-script edit + TS review. The gate framework (`validateSolution`) exists but is only invoked from `seed-kyb-solutions.ts:583`; the other seed script doesn't use it.
- **Reproduction / evidence**: `ls solutions/` and `ls apps/api/solutions/` — neither exists. `find . -name "*.yaml" -path "*solution*"` returns nothing.
- **Suggested direction**: Out of audit scope (architectural), but the shape is clear: a `solutions/*.yaml` authoring directory, a `scripts/onboard-solution.ts` CLI, and Gate 4a/4b/readiness wired into the CLI path. Authority question is the same as capabilities (OQ-3). This is a candidate for Session B remediation as a standalone feature, not a patch.
- **Related findings**: F-B-019 (schema-validator doesn't cover solutions), F-B-018 (no quality floor), OQ-3.

### F-B-016: `$steps[N]` references inside a prior parallel group resolve to non-deterministic outputs

- **Category**: Bug, Correctness
- **Severity**: Medium
- **Confidence**: Medium (reasoning-based; no reproduction run)
- **Location**: [apps/api/src/lib/solution-executor.ts:247-324](apps/api/src/lib/solution-executor.ts#L247-L324)
- **What's wrong**: In `executeSolution`, parallel groups run via `Promise.all(executions)`. Each `execution` is an async map callback that at line 300 calls `completedSteps.push(output)` when the individual executor promise resolves. For a parallel group with 3 steps (A, B, C), the push order into `completedSteps` is completion order, not `stepOrder`. Downstream steps that reference `$steps[N]` by index resolve that index against `completedSteps` in completion order. `$steps[2]` might refer to step A on one run and step C on the next.
- **Why it matters**: All current KYB/Invoice-Verify solutions in `seed-kyb-solutions.ts` only reference `$steps[0]` (the sequential first step, always deterministic) or `$input` or `$all_results`. No current production solution triggers this. But the pattern is undocumented — a future solution author adding `$steps[2].field` where step 2 was part of a prior parallel group has a subtle correctness bug that would pass Gate 4a (forward-reference check passes because 2 < current index) and pass Gate 4b dry-run (mock outputs don't expose the ordering issue).
- **Reproduction / evidence**: Code reading: line 300 `completedSteps.push(output)` is inside the map callback, after the executor promise resolves. `Promise.all` awaits all callbacks but doesn't order their side effects. A unit test with three parallel executors that sleep different durations would confirm. Per the guidance, I did not execute the reproduction.
- **Suggested direction**: (a) Preallocate `completedSteps` with nulls sized to `steps.length` and assign by stepOrder instead of pushing. (b) Or add Gate 4a validation: reject `$steps[N]` references where step N is in a parallel group. (b) is safer for authoring semantics — parallel steps' outputs aren't meant to be ordered.
- **Related findings**: F-B-018.

### F-B-017: `validateSolution` silently accepts steps referencing non-existent capability slugs

- **Category**: Bug, Design weakness
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/lib/onboarding-gates.ts:68-137](apps/api/src/lib/onboarding-gates.ts#L68-L137)
- **What's wrong**: `validateSolution` loads the capabilities referenced by steps (line 68-72), builds `capSchemas`. If a step references a slug that doesn't exist in DB, `capSchemas.get(slug)` returns undefined, `stepOutputFields.get(i)` is empty, and the loop's "field exists in referenced step's output" check (line 126: `if (refFields && refFields.size > 0 && !refFields.has(refField))`) short-circuits at `refFields.size > 0`. The nonexistent step is silently treated as "no output fields" and any $steps reference to it is vacuously accepted. The FK on `solution_steps.capability_slug` will catch the violation at INSERT, but the error message is a Postgres FK error, not "step N references unknown capability 'foo'".
- **Why it matters**: A typo in a capability slug (e.g., `sanctions-check` misspelled as `sactions-check`) passes the gate cleanly and fails at INSERT with a confusing error. The gate exists to produce actionable messages; this one doesn't.
- **Reproduction / evidence**: Author a solution with a typo'd capability slug. Run seed-kyb-solutions.ts. Observe FK error from Postgres.
- **Suggested direction**: After loading `capRows`, compare `capSlugs` set vs `capRows` set. Any missing slug → `violations.push({ gate: "gate4a_step_ref", ..., detail: \`step ${step.stepOrder} references unknown capability '${slug}'\` })`.
- **Related findings**: F-B-016, F-B-018.

### F-B-018: Solution onboarding has no quality-floor gate — can compose from broken or pending capabilities

- **Category**: Design weakness
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/lib/onboarding-gates.ts:54-138](apps/api/src/lib/onboarding-gates.ts#L54-L138), [apps/api/scripts/seed-kyb-solutions.ts:583-588](apps/api/scripts/seed-kyb-solutions.ts#L583-L588)
- **What's wrong**: `validateSolution` checks structural composition (input references, step ordering, field existence in schemas). It does NOT check any capability-quality signal: `lifecycle_state`, `matrix_sqs`, `isActive`, `visible`, `last_tested_at`. A solution can onboard with steps pointing to capabilities in `lifecycle_state: 'validating'` (no tests yet), or `matrix_sqs: null` (quality unknown), or `isActive: true` but SQS 20 (floor is 25 per platform rules). The runtime path `solutions.ts:80` flags `hasPendingStep` for display but does not refuse execution. `solution-execute.ts` has no SQS gate.
- **Why it matters**: Solutions are the primary paid surface for composed workflows. A KYB-Complete solution at €2.50 whose pep-check step has SQS 15 (below the floor that `/v1/do` enforces via min_sqs) would execute, charge the customer, and return low-quality data. `/v1/do` refuses to execute that capability standalone below min_sqs, but the solution path wraps it. This is the inverse of the finding's intent — floor-aware solution SQS (lowest step + 20 cap) exists in scoring but doesn't propagate as a GATE.
- **Reproduction / evidence**: Check `computeSolutionScore` in `solutions.ts:77` — it uses lowest-step SQS but doesn't reject the solution. Add a solution step referencing a SQS-10 capability, seed it, hit `/v1/solutions/:slug/execute` with enough wallet balance — it executes.
- **Suggested direction**: Add Gate 4c "solution quality floor": at onboarding, reject if any step's capability is in `lifecycle_state: 'validating' | 'suspended' | 'deactivated'` or `matrix_sqs < 25`. Also consider: solution total `sum(priceCents) > 0` but step executor is null (executor unavailable) should block.
- **Related findings**: F-B-015, F-B-017.

### F-B-019: `schema-validator.ts` has zero coverage for `solutions` and `solution_steps` tables

- **Category**: Design weakness
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/lib/schema-validator.ts:18-92](apps/api/src/lib/schema-validator.ts#L18-L92)
- **What's wrong**: `REQUIRED_COLUMNS` covers 10 entries, all on `capabilities`, `transactions`, `transaction_quality`, `test_suites`, `rate_limit_counters`. None on `solutions` or `solution_steps`. The file's maintenance contract explicitly says "When a Drizzle migration adds a column that is actively queried by the code, add an entry to REQUIRED_COLUMNS." Multiple migrations have touched `solutions` (0007, 0013, 0043 — including `solution_transactions`), none are reflected. If a future migration adds a NOT NULL column to `solutions` and the deploy happens before `drizzle-kit migrate` runs, solutions endpoints 500 on every request with confusing errors, instead of failing fast at boot.
- **Why it matters**: Schema-validator is the fail-fast safety net. Solutions are a paid production surface. A missed migration silently serving 500s is the exact failure mode the validator exists to prevent.
- **Reproduction / evidence**: `grep -n "solutions\|solution_steps" apps/api/src/lib/schema-validator.ts` returns 0 matches. `ls apps/api/drizzle/ | grep solution` shows migrations exist.
- **Suggested direction**: Audit all solution columns queried in `routes/solutions.ts`, `routes/solution-execute.ts`, `lib/solution-executor.ts`, `lib/gate4b-solution-dryrun.ts`, `lib/solution-pricing.ts`. Add REQUIRED_COLUMNS entries for the NOT NULL ones introduced post-0007. At minimum: `solutions.price_cents`, `solutions.category`, `solutions.is_active`, `solution_steps.capability_slug`, `solution_steps.input_map`.
- **Related findings**: F-B-015.

### F-B-020: `onCapabilityReactivated` reactivates solutions without verifying the original deactivation reason

- **Category**: Bug, Correctness
- **Severity**: Low
- **Confidence**: Medium
- **Location**: [apps/api/src/lib/capability-onboarding.ts:730-783](apps/api/src/lib/capability-onboarding.ts#L730-L783)
- **What's wrong**: `onCapabilityReactivated(slug)` finds all inactive solutions that reference `slug`, and for each, reactivates the solution if ALL its steps are now active. It does NOT check why the solution was deactivated in the first place. A solution manually deactivated for unrelated reasons (legal hold, pricing review, broken final output shape) gets auto-reactivated the moment the last of its step capabilities happens to come back online — even if the original deactivation was deliberate.
- **Why it matters**: The cascade in `onCapabilityDeactivated` is lossy — it sets `is_active=false` and logs a warning, but does NOT record "deactivated because of capability X". So `onCapabilityReactivated` has no way to know if its reactivation is justified. Subtle correctness issue; low impact today because manual solution deactivations are rare, but the failure mode is "admin turned this off on purpose; a routine capability reactivation turned it back on."
- **Reproduction / evidence**: Manually `UPDATE solutions SET is_active = false WHERE slug = 'kyb-essentials-se'`. Wait for any step capability to be reactivated (e.g., via `fix-lifecycle-anomalies.ts`). Observe the solution auto-reactivate without the admin's knowledge.
- **Suggested direction**: Add `solutions.deactivation_reason` column (mirroring `capabilities.deactivation_reason`). `onCapabilityDeactivated` sets it to `capability-cascade:{slug}`. `onCapabilityReactivated` only reactivates solutions whose `deactivation_reason` matches `capability-cascade:{slug}`. Other reasons (manual, pricing, etc.) stay deactivated.
- **Related findings**: F-B-011 (no audit log makes this harder to diagnose).

### F-B-021: `detectTransparencyTag` heuristic defaults to `"algorithmic"` silently

- **Category**: Correctness
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/lib/capability-onboarding.ts:614-639](apps/api/src/lib/capability-onboarding.ts#L614-L639)
- **What's wrong**: `detectTransparencyTag(slug)` matches slug substrings against a keyword list. If no match, returns `"algorithmic"` (line 638, comment "Default to algorithmic — safer assumption"). This fires when the capability was inserted without `transparencyTag` set (line 129 `if (!cap.transparencyTag)`). Slug-based heuristics are weak: `cve-lookup` hits `"lookup"` → algorithmic (correct). `company-enrich` hits `"enrich"` → ai_generated (correct). But `fear-greed-index`, `ens-resolve`, `wallet-balance-lookup`, `stablecoin-flow-check` have no match → silently "algorithmic", which is wrong for capabilities that use an AI or paid API backend and would mis-label their audit trail.
- **Why it matters**: `transparency_tag` lands in every transaction's `audit_trail.compliance.ai_involvement` string. A capability that uses Claude for extraction but is slug-matched as "algorithmic" tells the user "Purely algorithmic — no AI/LLM involved in processing" — which is false. Same failure pattern as F-A-003 (the PII heuristic Session A closed) and the same heuristic anti-pattern.
- **Reproduction / evidence**: Check the 32 orphan slugs from the drift inventory — most don't match any keyword, so they'd get "algorithmic" if their tag is null. DB audit showed 5 slugs with `transparency_tag: "external_api"` (invalid) that would fall through to null → the heuristic would relabel them algorithmic.
- **Suggested direction**: Delete the default fallback (return null instead of "algorithmic"). Let `validateCapabilityStructure` fire for missing `transparencyTag` (it already does; the enum accepts null, but paired with manifest required-declaration it becomes a hard gate). Following the SA.2b.d pattern: declare-or-block, don't guess.
- **Related findings**: F-A-003 / SA.2b.d (identical anti-pattern for PII — already removed), F-B-006.

### F-B-022: `solution-execute.ts` fires transaction-status UPDATEs without awaiting — status can stay `executing` on DB failure

- **Category**: Bug, Correctness
- **Severity**: Medium
- **Confidence**: High
- **Location**: [apps/api/src/routes/solution-execute.ts:199-211](apps/api/src/routes/solution-execute.ts#L199-L211), [apps/api/src/routes/solution-execute.ts:230-242](apps/api/src/routes/solution-execute.ts#L230-L242), [apps/api/src/routes/solution-execute.ts:297-310](apps/api/src/routes/solution-execute.ts#L297-L310)
- **What's wrong**: Three `db.update(transactions).set(...).where(...).catch(...)` calls are fire-and-forget (no `await`). Two are on failure paths; one is the main success-path phase-2 update. If the UPDATE fails (DB connection drop, serialization conflict), the `.catch` logs an error and the endpoint returns success to the caller. The transaction row stays at `status: 'executing'`, `output: null`. There is no retry. The row is now wedged in `executing` state until manually fixed.
- **Why it matters**: Wedged `executing` rows break several downstream jobs: the integrity-hash worker (F-A-002 context) only processes `pending` rows and skips `executing`; the retention purger and audit endpoints filter on `status = 'completed'|'failed'`. Customers who hit `GET /v1/transactions/:id` see their transaction stuck. Wallet debit already happened inside the earlier transaction; customer paid but has no completion record. This is a visible bug class.
- **Reproduction / evidence**: Force a DB error at line 297 (e.g., kill the connection just after `executeSolution` returns). Customer response: 200 OK with result. DB: transaction stuck in `executing`.
- **Suggested direction**: Await the UPDATE and handle failure by (a) refunding the wallet (since we can't guarantee the record), (b) returning 500 to the caller with a specific error code. Alternatively, use the two-phase write pattern with a retry worker that sweeps `executing` rows older than 60s and moves them to a terminal state.
- **Related findings**: F-A-002 (integrity hash chain depends on completed rows).

### F-B-023: Gate 4b and Gate 5 have retrospective check functions that aren't wired to CI

- **Category**: Design weakness
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/lib/gate5-path-coverage.ts:367-403](apps/api/src/lib/gate5-path-coverage.ts#L367-L403), [apps/api/src/lib/gate4b-solution-dryrun.ts:273-316](apps/api/src/lib/gate4b-solution-dryrun.ts#L273-L316)
- **What's wrong**: Both `retrospectiveCheck` (Gate 5 across all active capabilities) and `retrospectiveSolutionDryRun` (Gate 4b across all active solutions) exist as callable functions. They are not invoked from CI, from a scheduled job, or from a script. They are dead code unless manually called from an ad-hoc REPL.
- **Why it matters**: The drift inventory shows structural drift accumulates over time. These retrospective checks exist because the authoring gates don't catch 100% of regressions. Not wiring them to anything means they catch nothing.
- **Reproduction / evidence**: `grep -rn "retrospectiveCheck\|retrospectiveSolutionDryRun" apps/api/src apps/api/scripts` — only the export declarations, no invocations.
- **Suggested direction**: Either (a) add a daily cron that runs both and logs summary counts + detailed failures to `logWarn` (noisy but low-effort), or (b) add to CI as a `--check` mode on a script that exits non-zero on new failures (treat it as a test). Option (b) integrates into the existing quality process.
- **Related findings**: F-B-011.

### F-B-024: `onCapabilityCreated` gates violations throw after the DB row exists — no rollback

- **Category**: Bug, Correctness
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/src/lib/capability-onboarding.ts:33-39](apps/api/src/lib/capability-onboarding.ts#L33-L39)
- **What's wrong**: `onCapabilityCreated` reads the DB row (line 25), then runs `validateCapabilityStructure` (line 33) and `validateCapabilitySchema` (line 37), and `enforceGates` throws on any violation. But the capability row is already in the DB at this point (inserted by seed.ts or onboard.ts before this hook is called). The throw doesn't roll back the INSERT; it just aborts the rest of the hook. The capability row stays in DB with invalid values, and test suites + readiness + visibility checks don't run. Operator sees a stack trace and has to clean up manually.
- **Why it matters**: Gate 1 and Gate 3 are advertised as blocking. Post-insert they're effectively "warn and abort the rest of onboarding" — halfway. The gate names imply safety; the behaviour is partial. Fold-in with F-B-002 (non-transactional onboarding).
- **Reproduction / evidence**: Insert a capability with `priceCents: 0` and `isFreeTier: false`. `onCapabilityCreated` throws at Gate 1 Check 7. Row still exists in DB.
- **Suggested direction**: Either (a) move these gate calls to the CLI pre-insert path where they belong (F-B-001 makes this natural), or (b) wrap the hook in a transaction with the INSERT and roll back on gate failure (F-B-002).
- **Related findings**: F-B-001, F-B-002.

### F-B-025: `visible=false` is the insert default and only a warning if not flipped

- **Category**: Design weakness
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts:776](apps/api/scripts/onboard.ts#L776), [apps/api/src/lib/capability-onboarding.ts:231-261](apps/api/src/lib/capability-onboarding.ts#L231-L261)
- **What's wrong**: CLI-onboarded capabilities land with `visible: false, lifecycle_state: "validating"`. `verifyCapabilityVisibility` (capability-onboarding.ts:212, which doesn't run from CLI per F-B-001) warns if visible=false. There's no SQL update that moves validating → active or visible → true automatically. The comment at onboard.ts:800 says `Next: npx tsx scripts/validate-capability.ts --slug ${slug} --apply` — meaning the operator must know about a second script. The gap between "onboarded" and "public" is a manual two-step.
- **Why it matters**: Third-party contribution flow: developer opens PR with manifest, CI runs `onboard.ts --dry-run`, PR merges, deploy runs `onboard.ts` for real, capability is in DB but invisible. No automated flip. Developer expects to hit `/v1/do` with their new capability slug — returns 404. Poor UX.
- **Reproduction / evidence**: See the print on onboard.ts:799: "`Onboarded '${manifest.slug}' → lifecycle_state=validating, visible=false`". There's no visible-flip path in the CLI.
- **Suggested direction**: Either (a) after readiness check passes and Gate 5 passes (once F-B-001 is fixed), auto-flip `visible=true, lifecycle_state='active'`. Or (b) document the two-step flow prominently in the CLI output and the CLAUDE.md mandatory pipeline section. Option (a) matches operator expectations.
- **Related findings**: F-B-001.

### F-B-026: Batch mode swallows errors as strings with no stack trace

- **Category**: Observability
- **Severity**: Low
- **Confidence**: High
- **Location**: [apps/api/scripts/onboard.ts:1118-1154](apps/api/scripts/onboard.ts#L1118-L1154)
- **What's wrong**: `processSingleManifest` catches all exceptions at line 1151-1153 and writes `result.error = err.message` (or `String(err)`). The stack trace is lost. The batch summary (line 1271-1275) prints `${r.slug}: ${r.error}` — no trace, no cause chain. Debugging a failed batch onboard requires re-running the single manifest individually.
- **Why it matters**: Batch mode is the envisioned scale path (275 manifests, potentially more with third-party providers). Failures buried in a string summary with no trace force manual re-runs. Trivial DX fix.
- **Reproduction / evidence**: Break one manifest (e.g., malformed YAML) in a batch run. Observe the summary has "YAML parse error: ..." but no line numbers / no cause.
- **Suggested direction**: Change the result type to `error?: { message: string; stack?: string; cause?: string }`. In the summary, print the full stack for each failure. For batch operators, also emit a per-failure JSON log line that downstream tooling can parse.
- **Related findings**: F-B-011.

---

## 4. Open questions (for chat remediation)

### OQ-1: Authority model — manifest-canonical, DB-canonical, or hybrid

The drift inventory shows 238 Class 4 conflicts where YAML and DB disagree on `price_cents`, `freshness_category`, `transparency_tag`, `data_source`, `data_source_type`. For 4 of 5 fields, DB appears to be the post-admin-edit canonical state; for `data_source` the split is per-slug. Findings F-B-003, F-B-004, F-B-006, F-B-012 all become trivially resolvable once the authority model is chosen. Three options:

- **A. Manifest-canonical** (strict Rule 3): DB values come from the manifest on every onboard/backfill. Admin UI edits are the delta source, and get regenerated into the manifest. Clean round-trip. Highest refactoring cost (admin UI must write-through to manifests or stop being an authoring surface).
- **B. DB-canonical**: Manifests are authoring hints; DB state wins on conflict. Onboard reads the manifest for structure (schemas, slug, name) but does not overwrite operational fields (pricing, freshness, transparency) that admin may have tuned. Simpler to retrofit; weaker "reproducibility" story.
- **C. Hybrid (split ownership)**: Each field has a declared owner. Authoring fields (slug, name, description, schemas, limitations, PII declaration, maintenance_class) are manifest-canonical. Operational fields (price_cents, is_free_tier, freshness_category, transparency_tag, geography) are DB-canonical (set at onboarding from manifest, thereafter owned by admin). Needs documented per-field ownership and tooling that respects it.

Chat decides.

### OQ-2: Should `--force` require typed-slug confirmation (F-B-010)?

Simpler change than --force=<slug>: add a 5-second countdown after the warning prints, or require env `I_KNOW_WHAT_IM_DOING=1`. Trade-off is "extra friction for legitimate operators" vs "near-zero extra safety for the real failure mode (unattended CI runs)". Chat decides what level of friction to add.

### OQ-3: Should solutions have a YAML authoring pathway (F-B-015)?

Large surface change. Options:
- **A. Yes, symmetrically with capabilities**: `solutions/*.yaml`, `scripts/onboard-solution.ts`, gates in the CLI. Enables third-party solution submissions.
- **B. No, API-only**: Keep solutions as admin-owned. Add an `/v1/internal/solutions` admin endpoint for authoring. Moves from TS code to DB as authoring surface, skipping YAML entirely.
- **C. Punt**: Leave seed-scripts as-is until solution volume grows past N.

Depends on product priorities (third-party submission timeline, admin UI roadmap). Chat decides.

### OQ-4: Should the PII gate propagate to solutions (F-B-015 neighbour)?

A solution's PII footprint is the UNION of its steps' PII. Today solutions have `transparency_tag` but no `processes_personal_data` declaration — the audit trail emitted on solution execution uses a static default. Options:
- **A. Auto-derive** solution PII from union of step capabilities' `processes_personal_data` / `personal_data_categories`.
- **B. Explicit declare** on solution manifest/row (duplicative but checkable).
- **C. Leave implicit** (status quo).

Chat decides.

### OQ-5: Should `SKIP_ONBOARDING_GATES` stay (F-B-009)?

Three options: keep with strengthened logging; narrow to per-gate flags; delete and require `--skip-gates=<reason>` as a CLI flag. Chat decides.

### OQ-6: Should the `transparencyTag` heuristic default to null instead of "algorithmic" (F-B-021)?

Same anti-pattern as F-A-003 which was deleted in SA.2b.d. Symmetry suggests delete-the-default. But some current capabilities rely on the default for backwards compat. Need to enumerate impacted rows before deleting. Chat decides.

### OQ-7: Where should `--dry-run --discover` land (F-B-005)?

- **A. Refuse**: Error on the combination (`--discover requires live; cannot coexist with --dry-run`). Simplest.
- **B. Dry-discover**: Execute the cap but DON'T write the manifest to disk. Partial side effect (API call), no disk write.
- **C. Fix-disk-write-only**: Execute live (cost), write to disk, but skip DB insert. Status quo except the naming is clearer.

Chat decides which of these maps to operator intent.

---

## 5. Summary by severity and category

| Severity | Count | Findings |
|---|---|---|
| High | 7 | F-B-001, F-B-002, F-B-003, F-B-005, F-B-006, F-B-009 |
| Medium | 12 | F-B-004, F-B-007, F-B-008, F-B-010, F-B-011, F-B-012, F-B-013, F-B-014, F-B-015, F-B-016, F-B-018, F-B-019, F-B-022 |
| Low | 7 | F-B-017, F-B-020, F-B-021, F-B-023, F-B-024, F-B-025, F-B-026 |

| Category | Count |
|---|---|
| Bug | 10 |
| Design weakness | 11 |
| Safety | 4 |
| Correctness | 6 |
| Resource efficiency | 3 |
| Observability | 1 |

(Findings span multiple categories; totals exceed 26.)

---

## 6. References

- Session A findings: [SESSION_A_audit_findings.md](SESSION_A_audit_findings.md)
- Manifest drift inventory (prior evidence, not re-audited): [audit-reports/manifest_drift_inventory.md](audit-reports/manifest_drift_inventory.md)
- Session A DECs: DEC-20260420-A through DEC-20260420-J (Session A closure report)
- CLAUDE.md mandatory pipeline: `CLAUDE.md` "Adding New Capabilities"
- Capability Onboarding Protocol (DEC-20260320-B): `CLAUDE.md` "Capability Onboarding Protocol"
- Test Infrastructure Cost Principles (CLAUDE.md): Principles A / B / C (cited by F-B-013, F-B-014, F-B-005)
