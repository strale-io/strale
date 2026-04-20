/**
 * Manifest → capabilities-row normalization (Cluster 2 Phase 3 C2).
 *
 * Consolidates the Manifest (snake_case, YAML authoring shape) → DB-row
 * (camelCase, Drizzle insert shape) conversion that was previously done
 * inline at three sites:
 *   - onboard.ts create path (~line 700)
 *   - onboard.ts backfill path (~lines 1005-1030)
 *   - indirectly through seed.ts (seed objects were hand-authored DB-row-
 *     shaped, but normalizing here means future seed migrations have a
 *     single entry point)
 *
 * Field-by-field mapping is driven by the design doc's authority-model
 * table (Section 2). Every field in Manifest that maps to a capabilities
 * column is listed explicitly — silent drops are a bug and the tests
 * assert coverage.
 *
 * Partial mode: `normalizeManifestToRow(manifest, { partial: true })`
 * returns only the fields present in the manifest (omits undefined).
 * Used by the backfill path so unchanged fields aren't overwritten to
 * null/default.
 */

import type { Manifest } from "./capability-manifest-types.js";
import type { CapabilityRowInsert } from "./capability-persistence.js";
import {
  decideFieldAuthority,
  AuthorityViolationError,
  FIELD_CATEGORIES,
} from "./capability-field-authority.js";
import { log } from "./log.js";

// Re-exported so onboard.ts can drop its local copy in a future phase.
/**
 * YAML `data_source_type` → DB `capability_type`. The drift audit
 * (2026-04-20) found the DB holds `ai_assisted` capabilities whose
 * manifests still say `data_source_type: api` (Class 4 drift, SA.2b.c
 * scope). This mapping plugs the pipeline gap for new authors; the
 * drift itself is out of C2 scope.
 */
export function dataSourceTypeToCapType(dsType: string): string {
  switch (dsType) {
    case "computed":
      return "deterministic";
    case "scrape":
      return "scraping";
    case "api":
      return "stable_api";
    case "ai_assisted":
      return "ai_assisted";
    default:
      return "stable_api";
  }
}

export interface NormalizeOptions {
  /** If true, omits undefined manifest fields from the output so backfill
   *  UPDATEs don't clobber DB-canonical columns with null. Default false
   *  (create path writes all fields, letting DB defaults apply). */
  partial?: boolean;
  /** Phase 4a: existing DB row (camelCase shape) for authority decisions.
   *  Required for hybrid-field resolution (manifest-default overridable
   *  by DB): when DB has a non-null value, manifest value is stripped.
   *  Also used for manifest-canonical drift detection. Safe to omit in
   *  partial mode if the caller guarantees the row doesn't exist yet
   *  (rare). */
  existingRow?: Record<string, unknown> | null;
  /** Phase 4a: --force-override-authority CLI flag threaded through.
   *  When true, db and hybrid fields are KEPT (operator reset-to-manifest).
   *  Does NOT bypass manifest-canonical drift (those are real bugs). */
  bypassAuthority?: boolean;
}

/**
 * Convert a Manifest (YAML-authoring shape) into a DB-row payload suitable
 * for `db.insert(capabilities).values(...)` or
 * `db.update(capabilities).set(...)`.
 *
 * PII normalization (F-B-008) is NOT done here; `persistCapability` strips
 * null/undefined `processesPersonalData` so the DB default applies. Callers
 * pass whatever the manifest declared and trust persistCapability.
 */
export function normalizeManifestToRow(
  manifest: Manifest,
  opts: NormalizeOptions = {},
): CapabilityRowInsert {
  const partial = opts.partial === true;

  // Build the full payload, then (if partial) strip undefined.
  const row: Record<string, unknown> = {
    slug: manifest.slug,
    name: manifest.name,
    description: manifest.description,
    category: manifest.category,
    priceCents: manifest.price_cents,
    isFreeTier: manifest.is_free_tier ?? (partial ? undefined : false),
    inputSchema: manifest.input_schema,
    outputSchema: manifest.output_schema,
    dataSource: manifest.data_source,
    // data_classification is an extension field on some manifests — the
    // Manifest type doesn't formally declare it, but it appears in the
    // onboard.ts inline mapping. Preserved via structural access.
    dataClassification:
      ((manifest as unknown as { data_classification?: string }).data_classification)
      ?? (partial ? undefined : "public"),
    transparencyTag: manifest.transparency_tag ?? (partial ? undefined : null),
    capabilityType: manifest.data_source_type
      ? dataSourceTypeToCapType(manifest.data_source_type)
      : undefined,
    outputFieldReliability: manifest.output_field_reliability,
    maintenanceClass: manifest.maintenance_class
      ?? (partial ? undefined : "scraping-fragile-target"),
    // F-B-008: processes_personal_data is passed through as-is. `null` and
    // `undefined` are both stripped by persistCapability.normalizePiiFields
    // so the DB default (`false`) applies. The gate (validateManifest)
    // rejects both upstream — this is defense-in-depth.
    processesPersonalData: manifest.processes_personal_data,
    personalDataCategories: manifest.personal_data_categories
      ?? (partial ? undefined : []),
    // Manifest may carry these Cluster-2-Phase-4 fields once the hybrid
    // authority model hardens. For now, pass through when present.
    freshnessCategory: manifest.freshness_category,
    geography: manifest.geography,
  };

  if (!partial) {
    // Create path: stamp lifecycle defaults. Phase 6 (design Section 6.1)
    // will flip visible/lifecycleState post-hook on readiness-pass.
    row.lifecycleState = "validating";
    row.visible = false;
    row.isActive = true;
  }

  if (partial) {
    for (const k of Object.keys(row)) {
      if (row[k] === undefined) delete row[k];
    }
    // Cluster 2 Phase 4a: authority enforcement. For each remaining field,
    // consult FIELD_CATEGORIES + existing DB row. Strip db-canonical and
    // hybrid-with-DB-set; throw on manifest-canonical drift.
    applyAuthorityEnforcement(row, opts);
  }

  return row as CapabilityRowInsert;
}

// ─── Phase 4a authority enforcement ─────────────────────────────────────────

const AUTHORITY_STRIP_LABEL = "[authority-strip]";

function camelToSnake(camel: string): string {
  return camel.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/([A-Z])([A-Z][a-z])/g, "$1_$2").toLowerCase();
}

/**
 * Phase 4a (partial mode only): consume FIELD_CATEGORIES, strip fields
 * the operator shouldn't overwrite on backfill, throw on manifest drift.
 *
 * - `db`: strip (operator-owned; DEBUG log the strip so ops can grep)
 * - `hybrid` with DB value: strip (DB wins, fills gaps only)
 * - `hybrid` with DB null: keep (fills the gap)
 * - `manifest` drift (manifest value differs from DB): throw
 *    AuthorityViolationError. --force-override-authority does NOT bypass.
 * - `unknown`: strip + log (defensive; new DB column without taxonomy entry)
 */
function applyAuthorityEnforcement(
  row: Record<string, unknown>,
  opts: NormalizeOptions,
): void {
  const existingRow = opts.existingRow ?? null;
  const bypass = opts.bypassAuthority === true;

  const manifestDrifts: Array<{ field: string; manifestValue: unknown; dbValue: unknown; reason: string }> = [];

  // Iterate a snapshot of keys so we can delete during iteration safely.
  for (const camelKey of Object.keys(row)) {
    const snakeKey = camelToSnake(camelKey);
    const decision = decideFieldAuthority(snakeKey, row[camelKey], existingRow, { bypassAuthority: bypass });

    switch (decision.action) {
      case "keep":
      case "keep-hybrid-dbnull":
        // pass through
        break;
      case "strip-db":
        log.debug({
          label: "authority-strip",
          field: snakeKey,
          category: "db",
          slug: row.slug,
          manifest_value: row[camelKey],
        }, `${AUTHORITY_STRIP_LABEL} ${snakeKey} (db-canonical)`);
        delete row[camelKey];
        break;
      case "strip-hybrid-dbset":
        log.debug({
          label: "authority-strip",
          field: snakeKey,
          category: "hybrid",
          slug: row.slug,
          manifest_value: row[camelKey],
          db_value: existingRow ? existingRow[camelKey] : undefined,
        }, `${AUTHORITY_STRIP_LABEL} ${snakeKey} (hybrid, DB has value)`);
        delete row[camelKey];
        break;
      case "violation-manifest":
        manifestDrifts.push({
          field: snakeKey,
          manifestValue: decision.manifestValue,
          dbValue: decision.dbValue,
          reason: FIELD_CATEGORIES[snakeKey]?.reason ?? "(no reason registered)",
        });
        break;
      case "unknown":
        log.debug({
          label: "authority-strip",
          field: snakeKey,
          category: "unknown",
          slug: row.slug,
        }, `${AUTHORITY_STRIP_LABEL} ${snakeKey} (unknown; add to FIELD_CATEGORIES)`);
        delete row[camelKey];
        break;
    }
  }

  if (manifestDrifts.length > 0) {
    throw new AuthorityViolationError(manifestDrifts);
  }
}
