import { eq } from "drizzle-orm";
import * as yaml from "js-yaml";
import { z } from "zod";
import { boundDatabase, type Database } from "../db/index.js";
import { capabilities } from "../db/schema.js";
import { diffAndUpdateLimitations } from "./capability-persistence.js";
import { clearReadinessCache } from "./capability-readiness.js";
import { manifestLimitationsToRows } from "./manifest-limitations.js";
import { log } from "./log.js";
import type { OnboardingOptions, OnboardingResult } from "./onboarding-pipeline.js";

// Validate only the text we write. Stale fixtures and unrelated manifest gates
// must never prevent text from reaching an existing (even deactivated) row.
const textManifest = z.object({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  limitations: z.array(z.object({
    title: z.string().nullable().optional(),
    text: z.string().min(1),
    category: z.string().min(1),
    severity: z.string().optional(),
    workaround: z.string().nullable().optional(),
  // Backfill's gates require at least one limitation; this mode skips the
  // gates, and an empty list would delete every stored limitation.
  })).min(1),
});

/** Error shape for the operator log: names, paths and codes, never values. */
function describeFailure(err: unknown) {
  if (err instanceof z.ZodError) {
    return { err_name: "ZodError", issues: err.issues.map((i) => ({ path: i.path.join("."), code: i.code })) };
  }
  const e = err as { name?: unknown; code?: unknown };
  return {
    err_name: typeof e?.name === "string" ? e.name : typeof err,
    ...(typeof e?.code === "string" ? { pg_code: e.code } : {}),
  };
}

/** No executors, gates, hooks, readiness or capability-row persistence. */
export async function runLimitationsSync(
  handle: Database,
  options: OnboardingOptions,
): Promise<OnboardingResult> {
  const start = Date.now();
  const limitations: NonNullable<OnboardingResult["limitations"]> = {
    outcome: "failed",
    reason: "Limitations sync failed; no changes committed for this slug. Check the manifest and API logs before retrying.",
    created: 0, updated: 0, deleted: 0,
  };
  const result: OnboardingResult = {
    slug: "unknown", status: "failed", timeMs: 0, errors: [],
    rows: { created: [], updated: [], deleted: [] },
    generatedTestTypes: [], verification: { passed: null, entries: [] }, readiness: null,
    limitations,
  };
  try {
    options.signal?.throwIfAborted();
    const manifest = textManifest.parse(yaml.load(options.manifestYaml));
    result.slug = manifest.slug;
    const db = boundDatabase(handle, options.signal);
    // Stage counts until COMMIT succeeds; a rollback must not report writes.
    const rows: OnboardingResult["rows"] = { created: [], updated: [], deleted: [] };
    const found = await db.transaction(async (tx) => {
      const [existing] = await tx.select({ slug: capabilities.slug })
        .from(capabilities).where(eq(capabilities.slug, manifest.slug)).limit(1);
      if (!existing) return false;
      if (!options.dryRun) {
        await diffAndUpdateLimitations(tx, manifest.slug, manifestLimitationsToRows(manifest), (action, names) => {
          rows[action].push({ table: "capability_limitations", count: names.length, names });
        });
      }
      options.signal?.throwIfAborted();
      return true;
    });
    if (!found) {
      limitations.outcome = "not_found";
      limitations.reason = "No existing capability row. Nothing was written; onboard the capability separately if needed.";
      result.errors.push({ code: "not_found", message: limitations.reason });
    } else {
      result.rows = rows;
      const count = (action: keyof typeof rows) => rows[action].reduce((n, change) => n + change.count, 0);
      const counts = { created: count("created"), updated: count("updated"), deleted: count("deleted") };
      const changed = counts.created + counts.updated + counts.deleted > 0;
      result.status = "success";
      if (changed && !options.dryRun) clearReadinessCache();
      result.limitations = {
        outcome: changed ? "updated" : "unchanged",
        reason: options.dryRun ? "Dry run; nothing was written." : changed ? "Manifest limitations synced." : "Limitations already match the manifest.",
        ...counts,
      };
    }
  } catch (err) {
    const code = options.signal?.aborted ? "timeout" : "limitations_sync_failed";
    log.error({ label: "limitations-sync-failed", slug: result.slug, code, ...describeFailure(err) }, "limitations-sync-failed");
    if (options.signal?.aborted) limitations.reason = "Time budget exceeded; this slug's transaction was rolled back. Inspect the run before retrying.";
    result.errors.push({ code, message: limitations.reason });
  }
  result.timeMs = Date.now() - start;
  return result;
}
