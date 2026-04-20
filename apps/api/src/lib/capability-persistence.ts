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

export type PersistMode = "create" | "update";

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
 * Transactional capability persistence with post-insert hook wiring.
 *
 * On `mode: 'create'`: INSERT capability + optional suites + optional
 * limitations, all inside one transaction, then call
 * `onCapabilityCreated(slug, { mode: 'create' })` inside the same
 * transaction. Any failure before the hook rolls back the whole
 * transaction. Hook failure is caught (logged + `lifecycle_state =
 * 'hook_failed'`) and the transaction commits.
 *
 * On `mode: 'update'`: UPDATE the capability row (by slug) with the
 * provided fields, then call `onCapabilityCreated(slug, { mode: 'update'
 * })` inside the same transaction. Same hook-failure semantics.
 *
 * Note: the hook currently (Phase 3 C1) takes only a slug — the `mode`
 * parameter is threaded through for future use (Phase 3 C2 extends the
 * hook signature). Phase 2's `validateCapability` orchestrator is NOT
 * called from here; callers (onboard.ts) still run validation before
 * invoking persist. Phase 3 C2 folds validation into the persist flow.
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

  let hookFailed = false;

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
    } else {
      await tx
        .update(capabilities)
        .set({ ...normalized, updatedAt: new Date() })
        .where(eq(capabilities.slug, slug));
    }

    try {
      await onCapabilityCreated(slug);
    } catch (err) {
      hookFailed = true;
      logError(
        "capability-persistence-hook-failed",
        err,
        { slug, mode: opts.mode },
      );
      await tx
        .update(capabilities)
        .set({ lifecycleState: "hook_failed", updatedAt: new Date() })
        .where(eq(capabilities.slug, slug));
      // Do NOT re-throw. Transaction commits with the capability row
      // present and lifecycle_state='hook_failed'. Phase 6 retry scheduler
      // will sweep and re-run the hook.
    }
  });

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
