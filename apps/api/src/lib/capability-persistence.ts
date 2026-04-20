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

import { eq } from "drizzle-orm";
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
    if (opts.mode === "create") {
      await tx.insert(capabilities).values(normalized);

      if (input.testSuites?.length) {
        for (const suite of input.testSuites) {
          await tx.insert(testSuites).values(suite);
        }
      }

      if (input.limitations?.length) {
        for (let i = 0; i < input.limitations.length; i++) {
          const lim = input.limitations[i];
          await tx.insert(capabilityLimitations).values({
            ...lim,
            capabilitySlug: slug,
            sortOrder: lim.sortOrder ?? i,
          });
        }
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

      if (input.limitations?.length) {
        for (let i = 0; i < input.limitations.length; i++) {
          const lim = input.limitations[i];
          await tx.insert(capabilityLimitations).values({
            ...lim,
            capabilitySlug: slug,
            sortOrder: lim.sortOrder ?? i,
          });
        }
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
