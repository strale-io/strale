# Cluster 2 Design: Unified Onboarding Engine

**Date:** 2026-04-20
**HEAD:** `549f9da` (`main`). Interval-commit note: the SHA is one commit past `a7058b0` — `549f9da` adds `transaction_finalization_failed` to the `ErrorCode` enum (part of DEC-20260420-L follow-up), touches only `apps/api/src/lib/errors.ts`, and does not overlap with Cluster 2 scope.
**Source:** Session B findings F-B-001, F-B-002, F-B-003, F-B-004, F-B-006, F-B-007, F-B-008, F-B-012, F-B-024, F-B-025
**Authority model:** Hybrid split ownership (DEC-20260420-K OQ-1)
**Depth:** medium — spec for implementation prompts, not full pseudocode; decisions locked enough to write code against, loose enough that implementation can refine shape details.

---

## 1. Current state

Four onboarding pathways exist today. Each writes to the same `capabilities` table but with different gate coverage and different transactional semantics. This is the core surface the design unifies.

| # | Pathway | Entry point | Gates called | INSERT structure | Post-insert hook | Columns written |
|---|---|---|---|---|---|---|
| 1 | **CLI INSERT** (net-new, no `--backfill`) | [apps/api/scripts/onboard.ts:677](../apps/api/scripts/onboard.ts#L677) `onboard()` | `validateManifest` only (pre-insert, authoring-time) | 3 independent `db.insert()` calls, no `db.transaction()`: capabilities → testSuites (N-loop) → capabilityLimitations (M-loop) | **NOT called** — `onCapabilityCreated` is not imported | `slug, name, description, category, priceCents, isFreeTier, inputSchema, outputSchema, dataSource, dataClassification, transparencyTag, capabilityType, outputFieldReliability, maintenanceClass, processesPersonalData, personalDataCategories, lifecycleState='validating', visible=false, isActive=true`. **Missing**: `freshnessCategory`, `geography` (F-B-003/F-B-004). |
| 2 | **CLI UPDATE** (`--backfill`) | [apps/api/scripts/onboard.ts:907](../apps/api/scripts/onboard.ts#L907) `backfill()` | `validateManifest` only | Non-transactional. Separate UPDATEs + INSERTs: testSuites (missing types), known_answer UPDATE (on `--discover`/`--fix`), `outputFieldReliability` UPDATE, `processesPersonalData` UPDATE, limitations INSERT (only if zero exist — F-B-012) | **NOT called** | `outputFieldReliability, processesPersonalData, personalDataCategories` + test_suites + conditional limitations (only on empty) |
| 3 | **seed.ts INSERT** | [apps/api/src/db/seed.ts](../apps/api/src/db/seed.ts) (hand-coded array, iterates and inserts 290+ capabilities) | None pre-insert. Post-insert runs full hook | Direct `db.insert(capabilities)` per iteration, no surrounding transaction | **Called** at [seed.ts:2834](../apps/api/src/db/seed.ts#L2834) `onCapabilityCreated(cap.slug)` | All declared fields in the seed object |
| 4 | **Direct SQL / admin UI** | n/a | None | Raw SQL or Drizzle direct query | Not called | Any column the operator chose |

**Key asymmetry:** CLI (pathways 1 + 2) is the advertised "canonical pipeline" per CLAUDE.md, but pathway 3 (seed.ts) is the only one that runs post-insert gates. Pathway 1 silently skips Gate 1 structure re-validation, Gate 3 schema coherence, transparency-tag auto-detect (deleted per OQ-6), readiness check, Gate 5 path coverage, visibility verification, and `validateTestFixtures`. Pathway 4 bypasses everything.

**Gate locations** (for quick reference):

| Gate | Function | File | Purpose |
|---|---|---|---|
| 1-manifest | `validateManifest(m, discover)` | [scripts/onboard.ts:129](../apps/api/scripts/onboard.ts#L129) | Pre-insert authoring-time validation. ~17 checks. |
| 1-structure | `validateCapabilityStructure(cap)` | [lib/onboarding-gates.ts:249](../apps/api/src/lib/onboarding-gates.ts#L249) | Post-insert DB-row re-validation. 12 checks. |
| 3-schema | `validateCapabilitySchema(slug, inputSchema)` | [lib/onboarding-gates.ts:148](../apps/api/src/lib/onboarding-gates.ts#L148) | `required ⊆ properties`. |
| 5-path | `runGate5(slug)` | [lib/gate5-path-coverage.ts:279](../apps/api/src/lib/gate5-path-coverage.ts#L279) | Multi-path capabilities cover PRIMARY + SECONDARY entry points. |
| Readiness | `checkReadiness(slug)` | [lib/capability-readiness.ts:71](../apps/api/src/lib/capability-readiness.ts#L71) | 6-dimension check: executor, DB row, tests, latency, transparency, schemas. |
| Enum guard (F-B-005) | `assertDiscoverNotDryRun` | [lib/onboard-guards.ts:15](../apps/api/src/lib/onboard-guards.ts#L15) | New in DEC-20260420-L; `--discover` + `--dry-run` combination. |

---

## 2. Authority-model enforcement table

Per DEC-20260420-K OQ-1, ownership is split per field. The table below maps every column on the `capabilities` table to its category. **Insert mode** reads from manifest and writes initial DB value. **Backfill mode** behavior depends on category:

- **manifest-canonical**: read from manifest, UPDATE if value changed.
- **DB-canonical**: NOT read, NOT updated. The DB value persists regardless of manifest content.
- **system-managed**: set by DB (`created_at`, `updated_at`) or by runtime jobs (SQS, trust columns).

| Field | DB column | Nullability | Category | Insert mode | Backfill mode |
|---|---|---|---|---|---|
| slug | `slug` | NOT NULL, UNIQUE | manifest-canonical | read from manifest | slug identity — rare UPDATE; flag as warning |
| name | `name` | NOT NULL | manifest-canonical | read from manifest | UPDATE if changed |
| description | `description` | NOT NULL | manifest-canonical | read from manifest | UPDATE if changed |
| category | `category` | NOT NULL | manifest-canonical | read from manifest | UPDATE if changed |
| input_schema | `input_schema` | NOT NULL | manifest-canonical | read from manifest | UPDATE if changed (deep equality) |
| output_schema | `output_schema` | NOT NULL | manifest-canonical | read from manifest | UPDATE if changed (deep equality) |
| limitations | `capability_limitations` rows | n/a (child table) | manifest-canonical | INSERT all from manifest | **diff-and-update by hash** (F-B-012 fix) |
| maintenance_class | `maintenance_class` | NOT NULL, default `'scraping-fragile-target'` | manifest-canonical | read from manifest | UPDATE if changed |
| processes_personal_data | `processes_personal_data` | NOT NULL, default `false` (post SA.2b.d) | manifest-canonical | read from manifest | UPDATE if changed |
| personal_data_categories | `personal_data_categories` | nullable, default `[]` | manifest-canonical | read from manifest | UPDATE if changed |
| data_source | `data_source` | nullable | manifest-canonical | read from manifest | UPDATE if changed |
| data_source_type → capability_type | `capability_type` | NOT NULL, default `'stable_api'` | manifest-canonical | read from manifest, mapped via `dataSourceTypeToCapType` | UPDATE if changed |
| output_field_reliability | `output_field_reliability` | nullable JSONB | manifest-canonical | read from manifest | UPDATE if changed |
| **price_cents** | `price_cents` | NOT NULL | **DB-canonical** | read from manifest (initial only) | **NOT touched** |
| **is_free_tier** | `is_free_tier` | NOT NULL, default `false` | **DB-canonical** | read from manifest (initial only) | **NOT touched** |
| **freshness_category** | `freshness_category` | nullable | **DB-canonical** | read from manifest (initial only) — F-B-003 fix | **NOT touched** |
| **transparency_tag** | `transparency_tag` | nullable (enum) | **DB-canonical** | **required** in manifest post-OQ-6, written on initial INSERT | **NOT touched** |
| **geography** | `geography` | nullable | **DB-canonical** | read from manifest (initial only) — F-B-004 fix | **NOT touched** |
| data_classification | `data_classification` | nullable | DB-canonical | read from manifest, defaults to `"public"` | NOT touched |
| lifecycle_state | `lifecycle_state` | NOT NULL, default `'draft'` | DB-canonical / runtime-managed | initial = `'validating'`; hook may flip to `'active'` per Section 6 | NOT touched by backfill |
| visible | `visible` | NOT NULL, default `false` | DB-canonical / runtime-managed | initial `false`; hook may flip true per Section 6 | NOT touched |
| is_active | `is_active` | NOT NULL, default `true` | DB-canonical / runtime-managed | initial `true` | NOT touched |
| avg_latency_ms | `avg_latency_ms` | nullable | system-managed | read from manifest if provided, else null | NOT touched |
| matrix_sqs, qp_score, rp_score, matrix_sqs_raw | corresponding cols | nullable (decimals) | system-managed | null | NOT touched (runtime SQS job) |
| trend, freshness_level, last_tested_at, freshness_decayed_at | corresponding cols | nullable / defaulted | system-managed | defaults | NOT touched |
| guidance_usable, guidance_strategy, guidance_confidence | corresponding cols | nullable | system-managed | null | NOT touched |
| search_tags | `search_tags` | nullable, default `[]` | manifest-canonical (if declared) | read from manifest if present | UPDATE if changed |
| x402_enabled, x402_price_usd, x402_method | corresponding cols | NOT NULL defaults | DB-canonical | defaults | NOT touched (admin-toggled) |
| fallback_capability_slug, fallback_coverage, fallback_verification_level | corresponding cols | nullable | manifest-canonical (if declared) | read from manifest if present | UPDATE if changed |
| error_codes_json | `error_codes_json` | nullable JSONB | manifest-canonical (if declared) | read from manifest if present | UPDATE if changed |
| degraded_recovery_count | `degraded_recovery_count` | NOT NULL, default 0 | system-managed | 0 | NOT touched |
| deactivation_reason | `deactivation_reason` | nullable | system-managed | null | NOT touched |
| data_update_cycle_days, dataset_last_updated | corresponding cols | nullable | manifest-canonical (if declared, reference-data caps) | read from manifest | UPDATE if changed |
| onboarding_manifest | `onboarding_manifest` | nullable JSONB | system (manifest snapshot) | stored on INSERT for auditability | **UPDATED on backfill** to reflect current manifest |
| created_at | `created_at` | NOT NULL, defaultNow | system-managed | DB default | NOT touched |
| updated_at | `updated_at` | NOT NULL, defaultNow | system-managed | DB default | set to `new Date()` on any UPDATE |

**Resolution of F-B-003 and F-B-004**: both `freshness_category` and `geography` move to the INSERT-writes-from-manifest path. No change to backfill (the 72 + 23 slugs with existing DB values keep them). Operators adding a new capability author these in the manifest and they land on first insert.

**Resolution of F-B-008**: the unified validator treats `processes_personal_data: null` in YAML as equivalent to `undefined` — both fail the gate cleanly. The INSERT path omits the field from `values()` entirely (DB default kicks in) rather than passing `null` explicitly.

**Pattern for "added-later manifest-canonical fields"**: if a manifest adds a field not previously declared (e.g., a new `cache_ttl_seconds`), the validator treats it as a warning, not a violation, in backfill mode — the field propagates to DB. In insert mode it's validated against the `Manifest` interface.

---

## 3. Unified validator

### 3.1 Orchestration, not rewrite

Per the plan's recommendation: keep `validateManifest`, `validateCapabilityStructure`, `validateCapabilitySchema` as internal implementation details. Add a single orchestration entry point that takes `ValidationContext` and delegates.

```ts
// lib/onboarding-gates.ts  (public entry, new)

export type ValidationMode = 'insert' | 'backfill';
export type CapabilitySource = 'manifest' | 'seed' | 'api';

export interface ValidationContext {
  mode: ValidationMode;
  source: CapabilitySource;
  /** Gate names the caller explicitly skips, paired with a reason string for the audit log.
   *  Replaces SKIP_ONBOARDING_GATES env var (DEC-20260420-K OQ-5). */
  skipGates?: Array<{ gate: string; reason: string }>;
}

export interface GateViolation {
  gate: string;           // e.g., 'gate1_structure', 'gate3_schema_coherence'
  severity: 'error';      // always error — warnings live on GateWarning
  detail: string;
}

export interface GateWarning {
  gate: string;
  detail: string;
}

export interface ValidationResult {
  violations: GateViolation[];
  warnings: GateWarning[];
  /** Post-normalization view of the candidate: defaults applied, null→undefined
   *  for nullable fields, enum values trimmed/lowercased where applicable.
   *  Caller uses this for the INSERT/UPDATE payload. */
  normalized: CapabilityCandidate;
}

export async function validateCapability(
  candidate: CapabilityCandidate,
  existing: CapabilityRow | null,
  ctx: ValidationContext,
): Promise<ValidationResult>;

export class GateViolationError extends Error {
  constructor(public readonly violations: GateViolation[]) {
    super(`Onboarding gate failed (${violations.length} violations):\n` +
          violations.map(v => `  [${v.gate}] ${v.detail}`).join('\n'));
  }
}
```

### 3.2 Internal orchestration

```
validateCapability(candidate, existing, ctx)
  ├─ if skipGates includes all → logWarn "all gates skipped by reason: <reason>"; return no violations
  ├─ run gate1-manifest (== current validateManifest body, accepts Manifest shape directly)
  │     └─ mode=backfill skips fields classified DB-canonical + marks them if provided (warning: "field X is DB-canonical, manifest value ignored")
  ├─ run gate1-structure (== current validateCapabilityStructure against the post-normalization candidate)
  ├─ run gate3-schema (== current validateCapabilitySchema)
  ├─ collect warnings from metadata-completeness check (currently in capability-onboarding.ts:validateMetadataCompleteness) — surfaced here pre-insert too
  └─ return { violations, warnings, normalized }
```

Each internal gate respects `ctx.skipGates`: if a gate name appears in `skipGates`, that gate returns `[]` and the orchestrator emits `logWarn` once per skip with the reason. This replaces the module-scoped `SKIP_ONBOARDING_GATES` env var with a per-call, per-gate, audit-trailed skip.

### 3.3 Authority-mode field handling inside the validator

```
for each field in candidate:
  category = FIELD_CATEGORIES[field]
  if mode === 'insert':
    validate presence + type per Manifest interface
    normalized[field] = candidate[field]
  else if mode === 'backfill':
    if category === 'manifest-canonical':
      validate + normalized[field] = candidate[field]
    else if category === 'DB-canonical':
      if candidate[field] provided AND differs from existing[field]:
        warnings.push({ gate: 'authority', detail: `${field} is DB-canonical; manifest value (${candidate[field]}) ignored in favor of DB value (${existing[field]})` })
      normalized[field] = existing[field]   // preserve
    else if category === 'system-managed':
      normalized[field] = existing[field]   // preserve
```

`FIELD_CATEGORIES` is a `Record<string, 'manifest-canonical' | 'DB-canonical' | 'system-managed'>` constant derived from Section 2's table. Single source of truth for the authority model.

### 3.4 `normalized` contents — explicit spec

- **Defaults applied**: `is_free_tier` falls back to `false` if undefined. `data_classification` falls back to `"public"`. Same behavior as current onboard.ts.
- **Null-to-undefined**: nullable fields with `null` value become `undefined` in `normalized` (DB insert uses `undefined` to trigger default; `null` is passed through only when explicitly intended — e.g., cleared values on UPDATE).
- **Enum casts**: `transparency_tag` value is validated against the enum; `capability_type` derived from `data_source_type` via `dataSourceTypeToCapType` mapping.
- **PII categories array**: normalized to deduped, sorted array.
- **Backfill mode**: `normalized` contains the MERGED view (manifest for manifest-canonical, existing for DB-canonical). The caller can pass this object straight to an UPDATE.

### 3.5 Enum dedup (F-B-007)

- Promote `PII_CATEGORY_ENUM` and `VALID_MAINTENANCE_CLASSES` to canonical exports from `onboarding-gates.ts`. Already exported: `PII_CATEGORY_ENUM`. Still to export: `VALID_MAINTENANCE_CLASSES`, `VALID_TRANSPARENCY_TAGS`, `VALID_CATEGORIES`.
- `onboard.ts` imports them; delete local copies at [scripts/onboard.ts:143](../apps/api/scripts/onboard.ts#L143), [scripts/onboard.ts:193](../apps/api/scripts/onboard.ts#L193).
- Add `apps/api/src/lib/onboarding-gates-enums.test.ts` that imports the enums from both surfaces (onboarding-gates.ts canonical + any other consumer) and asserts referential equality. Guards against drift.

### 3.6 `GateViolation` vs `GateWarning`

| Current check | Classification | Rationale |
|---|---|---|
| slug malformed | violation | data-integrity; always block |
| name < 1 char | violation | required by DB NOT NULL |
| description < 20 chars | violation | authoring contract |
| description 20–49 chars | warning | SEO hit, not broken |
| description > 300 chars | warning (info) | truncation risk, not wrong |
| category invalid | violation | enum constraint |
| price_cents <= 0 (non-free-tier) | violation | billing invariant |
| input_schema missing type:object | violation | runtime breaks |
| output_schema missing type:object | violation | runtime breaks |
| data_source null/empty | violation | audit trail requires it |
| transparency_tag not in enum | violation | enum constraint |
| transparency_tag null on insert | **violation** (post OQ-6) | declare-or-block |
| maintenance_class null/invalid | violation | tier scheduling depends on it |
| processes_personal_data undefined/null | violation | GDPR declaration required |
| personal_data_categories entry not in taxonomy | violation | enum constraint |
| personal_data_categories populated but processes_personal_data=false | violation | contradiction |
| input_schema properties lack descriptions | warning | MCP scoreboard + agent tool selection |
| output_schema properties empty | warning (info) | agents can't validate |
| avg_latency_ms missing | warning | sync/async routing degrades |

### 3.7 Async signature

`validateCapability` is `async` — some internal gates (e.g., future cross-capability lookups, data_source uniqueness checks) may want DB access. None of the current gates for capabilities require DB, but keeping the signature async avoids a breaking change later. (Sub-decision flagged in Section 9; chat confirms.)

---

## 4. Transactional INSERT / UPDATE shape

### 4.1 Extracted `persistCapability` function

New module: `apps/api/src/lib/capability-persistence.ts`. Both `scripts/onboard.ts` and `src/db/seed.ts` call it.

```ts
// lib/capability-persistence.ts

export async function persistCapability(
  candidate: CapabilityCandidate,
  ctx: ValidationContext,
): Promise<{ slug: string; inserted: boolean; warnings: GateWarning[] }> {
  const db = getDb();

  // 1. Lookup existing row (read-only, outside tx)
  const [existing] = await db
    .select()
    .from(capabilities)
    .where(eq(capabilities.slug, candidate.slug))
    .limit(1);

  // 2. Validate (outside tx; cheap; uses `existing` for authority merge)
  const { violations, warnings, normalized } = await validateCapability(candidate, existing ?? null, ctx);
  if (violations.length > 0) throw new GateViolationError(violations);

  // 3. Persist inside transaction
  const { slug, inserted } = await db.transaction(async (tx) => {
    if (existing) {
      // Backfill path
      await updateCapabilityRow(tx, existing.id, normalized);
      await upsertTestSuitesForBackfill(tx, normalized);
      await diffAndUpdateLimitations(tx, existing.id, normalized.limitations);
      return { slug: normalized.slug, inserted: false };
    } else {
      // Insert path
      const [{ id }] = await tx
        .insert(capabilities)
        .values(buildInitialRow(normalized))
        .returning({ id: capabilities.id });
      await insertTestSuites(tx, normalized);
      await insertLimitations(tx, normalized);
      return { slug: normalized.slug, inserted: true };
    }
  });

  return { slug, inserted, warnings };
}
```

**Transaction contents on INSERT**: capability row + test suites + limitations. A failure in any step rolls back all. Resolves F-B-002.

**Transaction contents on BACKFILL**: UPDATE of manifest-canonical columns on `capabilities` + test-suite upsert + limitation diff-and-update. Same atomicity guarantee.

### 4.2 Limitations diff (F-B-012)

Recommendation: **Option B** (hash-based upsert). Verified no code references `capability_limitations.id` as a stable identifier — `grep -rn capability_limitations\.id apps/api/src` returns only in the schema declaration. sort_order is used for display ordering but not referenced as an external key.

```ts
async function diffAndUpdateLimitations(
  tx: Transaction,
  capabilityId: string,
  manifestLimitations: ManifestLimitation[],
): Promise<void> {
  const existing = await tx
    .select()
    .from(capabilityLimitations)
    .where(eq(capabilityLimitations.capabilityId, capabilityId));

  // Hash content (not id, not sort_order)
  const hashLim = (l: { title, text, category, severity, workaround }) =>
    sha256(JSON.stringify([l.title, l.text, l.category, l.severity, l.workaround]));

  const existingByHash = new Map(existing.map(l => [hashLim(l), l]));
  const manifestByHash = new Map(manifestLimitations.map(l => [hashLim(l), l]));

  // 1. DELETE rows whose hash is not in manifest
  for (const [h, row] of existingByHash) {
    if (!manifestByHash.has(h)) {
      await tx.delete(capabilityLimitations).where(eq(capabilityLimitations.id, row.id));
    }
  }

  // 2. INSERT rows whose hash is new
  // 3. UPDATE sort_order on rows whose hash matches but position changed
  for (let i = 0; i < manifestLimitations.length; i++) {
    const lim = manifestLimitations[i];
    const h = hashLim(lim);
    const existingMatch = existingByHash.get(h);
    if (!existingMatch) {
      await tx.insert(capabilityLimitations).values({ ...lim, capabilityId, sortOrder: i });
    } else if (existingMatch.sortOrder !== i) {
      await tx.update(capabilityLimitations).set({ sortOrder: i }).where(eq(capabilityLimitations.id, existingMatch.id));
    }
  }
}
```

### 4.3 Post-insert hook placement — outside transaction

Sub-decision: **outside**. Rationale:
- `onCapabilityCreated` runs `validateTestFixtures` which executes the capability handler (paid API call, up to 30s). Holding a DB transaction open that long blocks connection pool.
- Gate 5 and readiness check make additional DB queries. Nested inside an outer tx risks lock escalation.
- Running outside means hook failures can leave a committed row with incomplete post-insert state. That's the F-B-024 concern.

Trade-off accepted: a committed-but-hook-failed row gets `lifecycle_state: 'hook_failed'` (new enum value) via the retry/fallback path described in Section 6. Operator sees an observable row that the retry scheduler can re-run, rather than a silent half-state.

### 4.4 Batch mode semantics

Unchanged from current: per-manifest transaction, per-manifest error surface, batch summary at end. One failing manifest does not abort the batch; the summary lists failures.

Sub-decision (flagged Section 9): whether `GateViolationError` thrown inside batch should abort the batch on first failure vs continue. Current behavior is continue; design preserves it for symmetry with pre-cluster-2 state.

---

## 5. Post-insert hook wiring (F-B-001, F-B-024)

### 5.1 Shared hook call, both paths

Post-`persistCapability`, both CLI and seed.ts call:

```ts
await onCapabilityCreated(result.slug, { mode: ctx.mode });
```

New 2nd argument gates which hook steps run:

| Hook step | Insert mode | Backfill mode | Rationale |
|---|---|---|---|
| Gate 1 structure re-validation | run | run | cheap; catches DB-row drift |
| Gate 3 schema coherence | run | run | cheap |
| Test-suite generation | run | **skip** | suites already exist on backfill; `persistCapability` did the upsert |
| Transparency-tag auto-detect | **DELETED** (per OQ-6) | **DELETED** | heuristic removed in Phase 5 |
| Metadata-completeness warnings | run | run | surface drift |
| Readiness check + cache clear | run | run | validates onboarding state |
| Gate 5 path coverage | run | run | cheap; logs-only |
| Visibility verify + auto-flip | run | **skip** | lifecycle is DB-canonical; backfill doesn't change operational state |
| `validateTestFixtures` (live exec) | run (fire-and-forget) | skip unless `--force-recalibrate` | F-B-014 resource-efficiency; don't re-calibrate on every backfill |

### 5.2 F-B-024 resolution — hook-failure semantics

Gates inside `onCapabilityCreated` that throw today:
- Line 35 `enforceGates(structuralViolations)` — throws on Gate 1 violation after row is committed
- Line 39 `enforceGates(schemaViolations)` — throws on Gate 3 violation after row is committed

Under the new design, these gates run BEFORE `persistCapability`'s transaction via the orchestrator. They should never fire inside `onCapabilityCreated` again (they're pre-transaction). The hook's Gate 1/3 re-run becomes defensive: emit `logError` + set `lifecycle_state: 'hook_failed'` if it somehow trips (corruption signal).

```ts
export async function onCapabilityCreated(
  slug: string,
  opts: { mode: ValidationMode },
): Promise<void> {
  try {
    // existing body, but with:
    //   - mode-gated steps per table above
    //   - enforceGates replaced by logError + lifecycleSet('hook_failed')
    //   - auto-flip visible/lifecycle at end on insert mode (Section 6)
  } catch (err) {
    log.error({ label: 'onboarding-hook-failed', slug, err }, 'hook-failed');
    await getDb()
      .update(capabilities)
      .set({ lifecycleState: 'hook_failed', updatedAt: new Date() })
      .where(eq(capabilities.slug, slug));
    // Do not re-throw. Caller (persistCapability's caller) already committed.
    // The retry scheduler picks up 'hook_failed' rows; see Section 6.
  }
}
```

### 5.3 `lifecycle_state` enum extension

Add `'hook_failed'` to the allowed values. Current values (per [schema.ts:149](../apps/api/src/db/schema.ts#L149) comment): `'draft' | 'validating' | 'probation' | 'active' | 'degraded' | 'suspended' | 'deactivated'`.

New allowed value: `'hook_failed'` — committed row whose post-insert hook did not complete. Retry scheduler sweeps these and re-runs `onCapabilityCreated`. After N retries, escalate to operator.

Migration: `lifecycle_state` is `varchar(20) NOT NULL DEFAULT 'draft'` — no enum constraint at DB level. Adding a new value is a comment/doc update + anywhere enums are hard-coded in TS. Grep `lifecycleState` consumer list to update.

---

## 6. visible / lifecycle handling (F-B-025)

### 6.1 Auto-flip on successful insert

Post-insert hook's new final step (insert mode only):

```ts
// After readiness + gate 5 + test-suite generation all complete without violation:
const readiness = await checkReadiness(slug);
if (readiness.ready) {
  await db.update(capabilities)
    .set({
      visible: true,
      lifecycleState: 'active',
      updatedAt: new Date(),
    })
    .where(eq(capabilities.slug, slug));
  log.info({ label: 'onboarding-auto-active', slug }, 'onboarding-auto-active');
} else {
  // Readiness failed on one or more dimensions. Stay at validating + invisible.
  log.warn({ label: 'onboarding-stay-validating', slug, issues: readiness.issues }, 'stay-validating');
}
```

### 6.2 State transitions — explicit matrix

| Trigger | From | To | Who |
|---|---|---|---|
| CLI INSERT committed | (no row) | `validating`, `visible=false` | persistCapability |
| Hook: all checks pass, readiness ready | `validating` | `active`, `visible=true` | onCapabilityCreated |
| Hook: readiness fails | `validating` | `validating` (unchanged), `visible=false` | onCapabilityCreated |
| Hook: exception thrown mid-run | `validating` | `hook_failed`, `visible=false` | onCapabilityCreated catch block |
| Retry scheduler: re-runs hook on `hook_failed` row, succeeds | `hook_failed` | `active` | scheduler |
| Retry scheduler: max retries exceeded | `hook_failed` | `hook_failed` (stays) + operator alert | scheduler |
| Admin/internal-health-monitor suspension | `active` | `suspended`, `visible=false` | admin |
| Admin reactivation | `suspended` | `active` | admin |
| CLI BACKFILL committed | any | unchanged | — |

### 6.3 Backfill does not change lifecycle/visibility

Per DEC-20260420-K: `lifecycle_state` and `visible` are DB-canonical. Backfill preserves them. If a capability is `active` and someone runs `--backfill`, it stays `active`. If it's `suspended`, it stays `suspended`. If the manifest author wanted to mark something new as active, they use the insert path.

### 6.4 Retry scheduler for `hook_failed`

New lightweight job (or extend existing `jobs/invariant-checker.ts`): every 5 minutes, scan `WHERE lifecycle_state = 'hook_failed' AND retry_count < 3 AND last_retry_at < NOW() - INTERVAL '2 minutes'`. Call `onCapabilityCreated(slug, { mode: 'insert' })` for each. Track `retry_count` via a new column or via `onboarding_events` table once F-B-011 lands in Cluster 4.

Sub-decision (Section 9): retry via a new small job vs. a cron vs. folding into invariant-checker. Chat decides. Design default: extend invariant-checker, cheapest wiring.

---

## 7. Migration plan

Six phases. Each phase is one implementation prompt. Each has explicit prerequisites and success criteria.

### Phase 1 — Extract enum exports (F-B-007)

**Prereqs:** none.
**Changes:** export `VALID_MAINTENANCE_CLASSES`, `VALID_TRANSPARENCY_TAGS`, `VALID_CATEGORIES` from `onboarding-gates.ts`. Update `onboard.ts` to import. Delete local copies. Add drift test.
**LOC:** ~30 lines net.
**Success criteria:**
- `grep -c "VALID_MAINTENANCE_CLASSES\s*=" apps/api` returns 1
- `grep -c "PII_CATEGORIES\s*=" apps/api/scripts/onboard.ts` returns 0
- New test passes
- Existing tests pass (208+ baseline + 5 guard + 3 phase2 + 4 F-B-016 + new drift = matching)
- `npm run build` clean (lesson from DEC-20260420-L)

### Phase 2 — Introduce `validateCapability` orchestrator (soft launch)

**Prereqs:** Phase 1 merged.
**Changes:** create `validateCapability` that delegates to the three existing gate functions. Authority-model enforcement added as **warnings only** (not violations) so operators see drift in logs without production disruption. Both `onboard.ts` and `seed.ts` route through the orchestrator.
**LOC:** ~200 lines (new module) + ~50 line refactor in onboard.ts + ~20 in seed.ts.
**Success criteria:**
- `validateCapability` called from both paths
- Gate violations from either pathway produce identical error shape
- Logs show authority-model warnings for slugs with drift (expected count ~238 Class 4 from manifest drift audit)
- Full test suite green
- `npm run build` clean

### Phase 3 — Transactional persistence + hook wiring (F-B-001, F-B-002, F-B-008, F-B-024)

**Prereqs:** Phase 2 merged. Authority-model warnings stable.
**Changes:** create `lib/capability-persistence.ts` with `persistCapability`. Wrap INSERT in transaction. Fold `onCapabilityCreated(slug, { mode })` call into persistCapability's caller. Add hook-failure catch + `lifecycle_state: 'hook_failed'`. Fix `processes_personal_data: null` handling.
**LOC:** ~300 lines (new module) + ~80 in capability-onboarding.ts (mode param + catch).
**Success criteria:**
- `db.transaction` wraps all INSERTs
- Injected DB error mid-insert rolls back cleanly (manual test or unit test)
- `onCapabilityCreated` never throws out of `persistCapability`
- `lifecycle_state: 'hook_failed'` appears in DB after induced hook failure
- `processes_personal_data: null` in YAML hits gate cleanly (not DB NOT NULL constraint)
- Full test suite green
- `npm run build` clean

### Phase 4 — Hard-enable authority-model enforcement (F-B-003, F-B-004, F-B-012)

**Prereqs:** Phase 3 merged. Authority-model warnings in Phase 2 show stable drift count — no new surprises.
**Changes:** promote authority warnings to the enforcement path (DB-canonical fields preserved on backfill; manifest-canonical fields written on insert). Add `freshness_category` and `geography` to the INSERT payload. Replace limitations overwrite-on-empty with diff-by-hash.
**LOC:** ~150 lines.
**Success criteria:**
- New CLI insert of a manifest with `freshness_category: reference-data` lands that value in DB (reproducible via dry-run + verify)
- New CLI insert of a manifest with `geography: nordic` lands that value
- Running `--backfill` on a slug with `price_cents` drift does NOT change `price_cents`
- Running `--backfill` on a slug with edited limitations DIFFS correctly (verified via fixture test)
- Full test suite green
- `npm run build` clean

### Phase 5 — Delete `detectTransparencyTag` + hand-classify affected rows (F-B-021 overlap)

**Prereqs:** Phase 4 merged. Drift audit refresh run to enumerate current null-transparency-tag rows + `external_api` rows.
**Changes:**
- Enumerate affected slugs (chat reviews list BEFORE SQL lands)
- Classify each: UPDATE to `algorithmic | ai_generated | mixed`
- Delete `detectTransparencyTag` function + its invocation
- Promote `transparency_tag` to **required** in `validateManifest` and `validateCapabilityStructure`
- Update all existing manifests where `transparency_tag` is missing or `external_api`
**LOC:** ~60 lines code + chat-reviewed classification SQL.
**Success criteria:**
- `SELECT COUNT(*) FROM capabilities WHERE transparency_tag IS NULL OR transparency_tag = 'external_api'` returns 0
- `detectTransparencyTag` function deleted
- Full test suite green
- `npm run build` clean

### Phase 6 — Auto-flip visible / lifecycle (F-B-025)

**Prereqs:** Phase 5 merged. Hook-failure retry path stable (observed in prod for at least a week).
**Changes:** add `lifecycle_state: 'hook_failed'` to schema enum comment. Implement the auto-flip step at hook end (insert mode only). Implement retry sweep in invariant-checker.
**LOC:** ~80 lines.
**Success criteria:**
- New CLI insert (readiness: ready=true) lands at `visible=true, lifecycle_state='active'` after hook completes
- New CLI insert (readiness: ready=false) stays at `visible=false, lifecycle_state='validating'`
- Induced hook failure lands at `lifecycle_state='hook_failed'`
- Retry sweep successfully promotes a `hook_failed` row to `active` on next run
- Full test suite green
- `npm run build` clean

---

## 8. Risks

### R-1 — Post-insert hook outside transaction → observable half-state

Described Section 4.3 + 5.2. Mitigation: `lifecycle_state: 'hook_failed'` + retry sweep. Trade-off: operator sees a row in DB after hook failure. Documentation obligation — add a runbook entry (at implementation time) "what to do if a capability is stuck in hook_failed".

### R-2 — Authority-model enforcement changes backfill semantics

Current tooling that relies on "`--backfill` overwrites everything" breaks on Phase 4. Affected tooling CC enumerates:

- [apps/api/scripts/onboard.ts:backfill](../apps/api/scripts/onboard.ts#L907) — the pathway itself. Its current behavior changes; design accounts for it.
- No other scripts in `apps/api/scripts/` invoke the onboard CLI programmatically. `grep -rn 'onboard\.ts' apps/api/scripts` returns no matches.
- Admin UI: out of this codebase's scope. Admin dashboards may issue `UPDATE capabilities ...` directly, which bypasses the pipeline entirely — already true today, not new risk.
- Chat flags any other tooling that CC missed; search ran `grep -rn 'backfill' apps/api/scripts` returned only onboard.ts.

### R-3 — Limitations diff-by-hash assumes hash fields are stable

Fields hashed: title, text, category, severity, workaround. A cosmetic whitespace change in `text` would re-insert the limitation (DELETE+INSERT). Not a correctness bug, but creates unnecessary DB churn. Mitigation: normalize whitespace before hashing. Low risk; document in the implementation prompt.

### R-4 — Transparency tag rollout (Phase 5) touches 5+ existing rows

Per manifest drift audit Section 6 Finding 5.1, 5 rows have `transparency_tag: 'external_api'` (invalid enum). Number of null-tag rows is unknown (refresh count at Phase 5 kickoff). Hand-classification is error-prone. Mitigation: chat reviews the classification list before SQL runs. Pattern matches SA.2b.d (F-A-003 deletion), which succeeded with this protocol.

### R-5 — Hook-failure retry may cascade paid API costs (F-B-014 overlap)

`validateTestFixtures` inside the hook executes the capability for real. If a capability's hook fails and the retry sweep re-runs the hook, the live execution runs again. Cost amplification. Mitigation: skip `validateTestFixtures` on retry (it's fire-and-forget anyway — non-blocking for readiness). F-B-014 in a later cluster resolves the root issue (add a fixture-calibrated-at TTL).

### R-6 — `capability_type` mapping still lossy (Session B finding, not in Cluster 2)

Drift audit Section 6 Finding 5.2: `data_source_type: 'api'` maps to multiple `capability_type` values via `dataSourceTypeToCapType`. Still lossy. Outside Cluster 2 scope but may surface as Phase 4 warning. Chat decides whether to fold a mapping extension into Cluster 2 or push to a later cluster.

---

## 9. Sub-decisions (chat review before implementation)

Enumerated for chat to rule on before Phase 1 implementation prompt:

### SD-1 — Hook-failure retry mechanism

- **Option A**: extend `jobs/invariant-checker.ts` with a `hook_failed` sweep. Cheapest. Recommended.
- **Option B**: dedicated new cron job. Cleaner separation; more infra.
- **Option C**: synchronous retry inside persistCapability (retry N times before giving up). Bad — holds the CLI run open on transient API flakes.

### SD-2 — GateViolationError in batch mode

- **Option A**: continue with next manifest (current behavior). Preserved in design.
- **Option B**: abort batch on first violation (stricter).

### SD-3 — `validateCapability` signature: async or sync?

- **Option A (recommended)**: `async`. None of the current gates require DB, but future gates might. No caller cost — already awaited everywhere.
- **Option B**: sync. Simpler; locks out future DB-backed gates.

### SD-4 — Authority-model warnings: emit on every call or only on first seen?

- **Option A (recommended)**: every call, once per call. Keeps logs actionable during Phase 2 soft launch.
- **Option B**: dedupe by (slug, field) for 24h window. Less log noise; harder to debug.

### SD-5 — Limitations hash: include sort_order or not?

- **Option A (recommended)**: NO, hash content only; sort_order is data shuffled independently. Matches F-B-012 suggestion.
- **Option B**: include sort_order. Any reordering → full DELETE/INSERT cycle. More churn.

### SD-6 — `lifecycle_state: 'hook_failed'` retries before escalation

- **Option A (recommended)**: 3 retries at 2-minute intervals, then operator alert.
- **Option B**: 5 retries at 5-minute intervals.
- Specific number depends on expected transient-failure profile. Chat chooses.

### SD-7 — Phase 2 rollout duration before Phase 4

Warnings-only phase is a soft launch. How long before hardening?

- **Option A**: 7 days in prod. Lets the 238 Class 4 warnings surface and chat review which are true drift vs false positives.
- **Option B**: immediately (skip soft launch). Higher risk — direct enforcement could break a backfill run the operator didn't know would bypass authority.
- Recommendation: Option A. Matches SA.2b.d's careful rollout pattern.

### SD-8 — Should Phase 5 delete `detectTransparencyTag` OR keep it behind a feature flag?

Session A / SA.2b.d already precedented "delete heuristic, rely on declared". Recommend delete. No flag.

### SD-9 — Backfill skipping `validateTestFixtures` vs providing `--force-recalibrate` flag

- **Option A (recommended)**: skip by default. Operator provides `--force-recalibrate` to re-run the calibration. Matches F-B-014 principle.
- **Option B**: always run. Preserves current behavior but spends API credits on every backfill.

---

## 10. References

- **DEC-20260420-K** — OQ decisions locked (authority model, transparency heuristic removal, SKIP env var replacement, --force confirmation, onboarding_events table)
- **DEC-20260420-L** — Session B hotfixes shipped. Introduces `lib/onboard-guards.ts` module, `transaction_finalization_failed` ErrorCode, deterministic `completedSteps` indexing
- **[SESSION_B_audit_findings.md](../SESSION_B_audit_findings.md)** (at commit 2e3e741) — source of the 10 findings scoped into this cluster
- **[audit-reports/manifest_drift_inventory.md](manifest_drift_inventory.md)** — evidence for authority-model asymmetry: 238 Class 4 conflicts, 72 freshness_category + 61 price_cents + 23 data_source + 5 transparency_tag drift
- **CLAUDE.md** — "Adding New Capabilities" + "Capability Onboarding Protocol (DEC-20260320-B)" — describes the pipeline Cluster 2 restructures
- **Schema maintenance contract** ([schema-validator.ts:5-12](../apps/api/src/lib/schema-validator.ts#L5-L12)) — for the `lifecycle_state: 'hook_failed'` enum addition
