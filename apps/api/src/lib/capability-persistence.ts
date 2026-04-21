/**
 * Cluster 2 Phase 3 C1: persistCapability — transactional capability write.
 *
 * Owns the capability INSERT/UPDATE path. Wraps capability + test_suites +
 * limitations writes in a single `db.transaction`, then invokes
 * `onCapabilityCreated(slug, { mode })` inside the transaction. On hook
 * failure, logs at ERROR and sets `lifecycle_state: 'hook_failed'` via a
 * same-transaction UPDATE; does NOT re-throw. The capability row commits
 * with the failed-hook marker so operators (and the Phase 6 retry
 * scheduler) can surface + retry.
 *
 * Addresses Session B findings F-B-001 (hook not wired on CLI path),
 * F-B-002 (non-transactional INSERT), F-B-008 (null processes_personal_data
 * violates NOT NULL constraint), F-B-024 (hook throws after commit).
 *
 * Scope for C1: migrated by onboard.ts INSERT (create mode). seed.ts and
 * capability-onboarding.ts are C2 holdouts pending Manifest/DB-row shape
 * unification. Operational UPDATE sites (lifecycle flips, SQS score writes,
 * freshness markers) remain on direct `db.update(capabilities)` — those
 * are not creation events and must not trigger the onCapabilityCreated
 * hook.
 */

import { and, eq, inArray, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { getDb } from "../db/index.js";
import {
  capabilities,
  testSuites,
  capabilityLimitations,
} from "../db/schema.js";
import { onCapabilityCreated } from "./capability-onboarding.js";
import { log, logError } from "./log.js";

export type PersistMode = "create" | "update" | "upsert";

export type CapabilityRowInsert = typeof capabilities.$inferInsert;
export type TestSuiteInsert = typeof testSuites.$inferInsert;
export type CapabilityLimitationInsert = typeof capabilityLimitations.$inferInsert;

export interface PersistCapabilityInput {
  /** DB-row-shaped capability record. Caller is responsible for
   *  Manifest→DB-row conversion (C2 unifies this). */
  capability: CapabilityRowInsert;
  /** Optional. If provided on create, inserted inside the same tx. */
  testSuites?: TestSuiteInsert[];
  /** Optional. If provided on create, inserted inside the same tx. */
  limitations?: Omit<CapabilityLimitationInsert, "capabilitySlug">[];
}

export interface PersistCapabilityOpts {
  mode: PersistMode;
  /** Optional. On upsert, columns to refresh when a row already exists
   *  (`onConflictDoUpdate.set`). If omitted, defaults to spreading the
   *  full normalized payload — matches seed.ts's current semantics. */
  upsertRefreshColumns?: Record<string, unknown>;
}

export interface PersistCapabilityResult {
  slug: string;
  mode: PersistMode;
  /** True iff the post-insert hook failed. When true, the row was
   *  committed with `lifecycle_state: 'hook_failed'`. */
  hookFailed: boolean;
}

/**
 * F-B-008: `processes_personal_data` is NOT NULL with DEFAULT false (post
 * SA.2b.d migration 0050). If the manifest-driven caller passed null or
 * undefined, omit the field from the INSERT values so the DB default
 * applies. Explicit null would violate the NOT NULL constraint and surface
 * as an opaque Drizzle/Postgres error; omission surfaces as "false" — the
 * safer default for unclassified data.
 *
 * The paired gate fix in validateManifest blocks this case pre-insert, but
 * this persistence-layer guard handles direct-API writes and is
 * defense-in-depth.
 */
// ─── F-B-012 diff-by-hash limitations helper (DEC-20260424-A / cluster_2_design §4.2) ──
// Closes the last piece of Cluster 2 Phase 4. Before this helper, three
// sites wrote to capability_limitations incorrectly:
//   1. onboard.ts:1081 backfill — "INSERT only if none exist", so manifest
//      changes silently no-opped whenever any rows already existed.
//   2. persistCapability upsert mode — per-row INSERT without existence
//      check, creating duplicates on re-seed (latent, no seed declares
//      limitations today).
//   3. persistCapability create mode — same per-row INSERT; duplicates if
//      create is called on a capability that already has limitations rows
//      from a prior aborted attempt.
// All three are replaced with a content-addressed diff: sha256 hash of
// (title | limitation_text | category | severity | workaround) with
// trim-normalized null handling. DELETE orphans, INSERT new, UPDATE
// sort_order for position moves. No-op when manifest and DB hashes
// match and positions align.
//
// Fields NOT hashed: `affected_percentage` (not on `ManifestLimitation`;
// only the manual `seed-limitations.ts` path sets it). A manifest-path
// re-seed of content-identical rows is therefore a no-op and preserves
// the existing `affected_percentage` value on the row. If
// `affected_percentage` is ever added to `ManifestLimitation`, add it to
// `limitationHash` and this comment.

type LimitationHashInput = {
  title?: string | null;
  limitationText: string;
  category: string;
  severity?: string | null;
  workaround?: string | null;
};

/** Hash the 5 content fields. Null/undefined normalize to empty string;
 *  leading/trailing whitespace is trimmed before hashing. */
export function limitationHash(l: LimitationHashInput): string {
  const norm = (s: string | null | undefined): string => (s ?? "").trim();
  const parts = [
    norm(l.title),
    norm(l.limitationText),
    norm(l.category),
    norm(l.severity),
    norm(l.workaround),
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/** Drizzle's tx and db share the query-builder interface used here; accept
 *  either so callers inside a transaction and callers without one both
 *  work. Typed loosely on purpose — the helper only uses `.select`,
 *  `.insert`, `.update`, `.delete` from the interface. */
type DrizzleQueryable = {
  select: typeof getDb extends () => infer D ? (D extends { select: infer S } ? S : never) : never;
  insert: typeof getDb extends () => infer D ? (D extends { insert: infer I } ? I : never) : never;
  update: typeof getDb extends () => infer D ? (D extends { update: infer U } ? U : never) : never;
  delete: typeof getDb extends () => infer D ? (D extends { delete: infer X } ? X : never) : never;
};

export interface DiffLimitationsResult {
  deleted: number;
  inserted: number;
  reordered: number;
}

/**
 * Diff-by-hash upsert for capability_limitations for one capability.
 *
 * Runs inside the caller's transaction if `queryable` is a tx; otherwise
 * runs on the top-level db. Either way, aborts on any error (tx rolls
 * back; db propagates).
 *
 * `manifestLimitations` uses the persistence-layer row shape (Omit<
 * CapabilityLimitationInsert, "capabilitySlug">). The caller is
 * responsible for the Manifest→row mapping (defaults on severity, etc.).
 * The helper hashes only the 5 content fields; other fields like
 * `sortOrder` drive position and don't affect the hash.
 */
export async function diffAndUpdateLimitations(
  queryable: DrizzleQueryable,
  capabilitySlug: string,
  manifestLimitations: ReadonlyArray<Omit<CapabilityLimitationInsert, "capabilitySlug">>,
): Promise<DiffLimitationsResult> {
  // 1. Build manifestByHash with positional index (drives sort_order).
  const manifestByHash = new Map<string, { lim: Omit<CapabilityLimitationInsert, "capabilitySlug">; index: number }>();
  for (let i = 0; i < manifestLimitations.length; i++) {
    const lim = manifestLimitations[i];
    const h = limitationHash(lim);
    // If two manifest rows hash-collide (rare but possible — identical
    // content duplicated in the manifest), later wins. The caller
    // authored duplicates; we dedupe silently.
    manifestByHash.set(h, { lim, index: i });
  }

  // 2. Load existing active rows for this capability.
  const existing = await (queryable as ReturnType<typeof getDb>)
    .select({
      id: capabilityLimitations.id,
      title: capabilityLimitations.title,
      limitationText: capabilityLimitations.limitationText,
      category: capabilityLimitations.category,
      severity: capabilityLimitations.severity,
      workaround: capabilityLimitations.workaround,
      sortOrder: capabilityLimitations.sortOrder,
    })
    .from(capabilityLimitations)
    .where(
      and(
        eq(capabilityLimitations.capabilitySlug, capabilitySlug),
        eq(capabilityLimitations.active, true),
      ),
    );

  const dbByHash = new Map<string, { id: string; sortOrder: number }>();
  for (const row of existing) {
    const h = limitationHash(row);
    dbByHash.set(h, { id: row.id as string, sortOrder: row.sortOrder });
  }

  // 3. DELETE orphans: rows in DB whose hash is NOT in manifest.
  const orphanIds: string[] = [];
  for (const [h, row] of dbByHash) {
    if (!manifestByHash.has(h)) orphanIds.push(row.id);
  }
  if (orphanIds.length > 0) {
    await (queryable as ReturnType<typeof getDb>)
      .delete(capabilityLimitations)
      .where(inArray(capabilityLimitations.id, orphanIds));
  }

  // 4. INSERT new + UPDATE sort_order on moved rows.
  let inserted = 0;
  let reordered = 0;
  for (const [h, { lim, index }] of manifestByHash) {
    const existingRow = dbByHash.get(h);
    if (!existingRow) {
      await (queryable as ReturnType<typeof getDb>)
        .insert(capabilityLimitations)
        .values({
          ...lim,
          capabilitySlug,
          sortOrder: index,
        });
      inserted++;
    } else if (existingRow.sortOrder !== index) {
      await (queryable as ReturnType<typeof getDb>)
        .update(capabilityLimitations)
        .set({ sortOrder: index, updatedAt: new Date() })
        .where(eq(capabilityLimitations.id, existingRow.id));
      reordered++;
    }
  }

  return { deleted: orphanIds.length, inserted, reordered };
}

function normalizePiiFields(row: CapabilityRowInsert): CapabilityRowInsert {
  const out = { ...row };
  if (out.processesPersonalData === null || out.processesPersonalData === undefined) {
    delete out.processesPersonalData;
  }
  if (out.personalDataCategories === null || out.personalDataCategories === undefined) {
    delete out.personalDataCategories;
  }
  return out;
}

/**
 * Transactional capability persistence with post-commit hook wiring.
 *
 * Cluster 2 Phase 3 C2 correction (DEC-20260421-B): the hook call is
 * OUTSIDE the transaction. Design doc §4.3 — `onCapabilityCreated` can
 * execute the capability handler live (via `generateAlgorithmicRegressionTest`)
 * and fire paid upstream APIs; holding a Postgres connection + row lock
 * for the ~30s that takes causes pool pressure under concurrent onboarding.
 * C1 put the hook inside the tx; C2 moves it out.
 *
 * Ordering:
 *   1. `db.transaction`: write capability + optional suites + limitations
 *      atomically. Commit.
 *   2. Post-commit: call `onCapabilityCreated(slug)` in try/catch.
 *   3. On hook failure: log at ERROR and run a short separate UPDATE
 *      setting `lifecycle_state = 'hook_failed'`. If that UPDATE itself
 *      throws (rare — network blip), log at ERROR and swallow so the
 *      outer return shape stays consistent. Phase 6 retry scheduler will
 *      surface and re-run.
 *
 * Modes:
 *   - `create`: INSERT capability + optional suites + optional limitations
 *   - `update`: UPDATE capability row by slug with normalized fields
 *   - `upsert`: INSERT ... ON CONFLICT DO UPDATE (seed.ts path)
 *
 * Note: the hook (`onCapabilityCreated`) still takes only a slug. The
 * `mode` value is logged + returned but not forwarded to the hook. Future
 * phases may extend the hook signature; C2 keeps it narrow.
 */
export async function persistCapability(
  input: PersistCapabilityInput,
  opts: PersistCapabilityOpts,
): Promise<PersistCapabilityResult> {
  const db = getDb();
  const normalized = normalizePiiFields(input.capability);
  const slug = normalized.slug;
  if (!slug) {
    throw new Error("persistCapability: capability.slug is required");
  }

  // ── Phase 1: transactional write ────────────────────────────────────────
  await db.transaction(async (tx) => {
    // DEC-20260423-B Stage B.2: set the transaction-local GUC so the
    // BEFORE INSERT trigger (migration 0051) allows this write. Any path
    // that bypasses persistCapability and runs a raw INSERT fails the
    // trigger check. `is_local = true` scopes the setting to this tx —
    // it auto-clears at COMMIT/ROLLBACK and cannot leak across connections.
    await tx.execute(
      sql`SELECT set_config('strale.capability_insert_token', 'persistCapability', true)`,
    );

    if (opts.mode === "create") {
      await tx.insert(capabilities).values(normalized);

      if (input.testSuites?.length) {
        for (const suite of input.testSuites) {
          await tx.insert(testSuites).values(suite);
        }
      }

      // F-B-012: route limitations through diffAndUpdateLimitations for
      // idempotency parity. If the capability row already has limitations
      // (e.g. prior aborted create), the diff handles orphan cleanup.
      if (input.limitations) {
        await diffAndUpdateLimitations(tx as unknown as DrizzleQueryable, slug, input.limitations);
      }
    } else if (opts.mode === "update") {
      await tx
        .update(capabilities)
        .set({ ...normalized, updatedAt: new Date() })
        .where(eq(capabilities.slug, slug));
    } else {
      // upsert: INSERT ... ON CONFLICT DO UPDATE on slug. Matches seed.ts's
      // previous onConflictDoUpdate semantics. Caller can pass
      // `upsertRefreshColumns` to narrow the update-on-conflict set;
      // otherwise the full normalized payload (minus stamps) refreshes.
      const refreshSet = opts.upsertRefreshColumns ?? {
        ...normalized,
        updatedAt: new Date(),
      };
      await tx
        .insert(capabilities)
        .values(normalized)
        .onConflictDoUpdate({
          target: capabilities.slug,
          set: refreshSet,
        });

      if (input.testSuites?.length) {
        for (const suite of input.testSuites) {
          await tx.insert(testSuites).values(suite);
        }
      }

      // F-B-012: upsert mode also routes through diffAndUpdateLimitations.
      // Previously INSERTed each row without an existence check, creating
      // duplicates on re-seed. Diff helper no-ops when content matches.
      if (input.limitations) {
        await diffAndUpdateLimitations(tx as unknown as DrizzleQueryable, slug, input.limitations);
      }
    }
  });

  // ── Phase 2: post-commit hook (outside the transaction) ─────────────────
  let hookFailed = false;
  try {
    await onCapabilityCreated(slug);
  } catch (err) {
    hookFailed = true;
    logError(
      "capability-persistence-hook-failed",
      err,
      { slug, mode: opts.mode },
    );
    // Short separate UPDATE to surface the failure via lifecycle_state.
    // Paranoia: if THIS statement throws (e.g., transient DB error), log
    // and swallow so the outer return shape is consistent. The Phase 6
    // retry scheduler sweeps hook_failed + any row whose post-commit
    // state looks incomplete.
    try {
      await db
        .update(capabilities)
        .set({ lifecycleState: "hook_failed", updatedAt: new Date() })
        .where(eq(capabilities.slug, slug));
    } catch (markerErr) {
      logError(
        "capability-persistence-marker-failed",
        markerErr,
        { slug, mode: opts.mode, original_hook_err: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  log.info(
    {
      label: "capability-persistence-done",
      slug,
      mode: opts.mode,
      hook_failed: hookFailed,
    },
    "capability-persistence-done",
  );

  return { slug, mode: opts.mode, hookFailed };
}
