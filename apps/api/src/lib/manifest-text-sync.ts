import { TEXT_COLUMNS, isReportOnly } from "./manifest-publication-policy.js";
export { TEXT_COLUMNS, isReportOnly } from "./manifest-publication-policy.js";
/** Reviewed text only: reuse canonical assignment selection and limitations diff. */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as yaml from "js-yaml";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Sql } from "postgres";
import { getDb, type Database } from "../db/index.js";
import { capabilities, capabilityLimitations } from "../db/schema.js";
import { FIELD_CATEGORIES, snakeToCamel, valuesEqual, withRuntimeExample } from "./capability-field-authority.js";
import { buildAssignments } from "./manifest-sync-fields.js";
import { textManifest, describeFailure } from "./limitations-sync.js";
import { manifestLimitationsToRows } from "./manifest-limitations.js";
import { diffAndUpdateLimitations } from "./capability-persistence.js";
import { sanitizeLimitationTitle } from "./capability-persistence.js";
import { clearReadinessCache } from "./capability-readiness.js";
import { autonomousAuthority, describeAuthority } from "./production-authority.js";
import { log } from "./log.js";

// 400 covers today's entire catalogue, while bounding future growth. One row,
// one connection, one short transaction at a time; never one bulk rewrite.
export const MANIFEST_TEXT_BOOT_LIMIT = 400;
const manifestSchema = textManifest.extend({
  name: z.string().min(1), description: z.string().min(1), category: z.string().min(1),
  data_source: z.string().min(1), input_schema: z.record(z.unknown()), output_schema: z.record(z.unknown()),
  output_field_reliability: z.record(z.enum(["guaranteed", "common", "rare"])).optional(),
}).passthrough();
export type TextManifest = z.infer<typeof manifestSchema>;

export function canonicalText(value: unknown): string {
  return JSON.stringify(value, (_key, v) => v && typeof v === "object" && !Array.isArray(v)
    ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b))) : v);
}
export function textPayload(manifest: TextManifest) {
  // Sources may be injected without going through the file parser. Never let
  // an empty or absent list delete the stored limitations.
  textManifest.shape.limitations.parse(manifest.limitations, { path: ["limitations"] });
  for (const column of TEXT_COLUMNS) {
    if (FIELD_CATEGORIES[column]?.category !== "manifest") throw new Error("Text authority mismatch");
  }
  const patch = Object.fromEntries(buildAssignments(TEXT_COLUMNS, manifest).map(a => [snakeToCamel(a.column), a.value]));
  const limitations = manifestLimitationsToRows(manifest).map(l => ({ ...l, title: sanitizeLimitationTitle(l.title) }));
  const hash = createHash("sha256").update(canonicalText({ patch, limitations })).digest("hex");
  return { patch, limitations, hash };
}
export async function readTextManifests() {
  // Same source/dist-relative layout as auto-register; Docker copies manifests.
  const directory = resolve(import.meta.dirname, "../../../../manifests");
  const files = (await readdir(directory)).filter(f => /\.ya?ml$/.test(f)).sort();
  return files.map(file => ({ slug: file.replace(/\.ya?ml$/, ""), load: async () => {
    const manifest = manifestSchema.parse(yaml.load(await readFile(resolve(directory, file), "utf8")));
    if (manifest.slug !== file.replace(/\.ya?ml$/, "")) throw new Error("Manifest slug mismatch");
    return manifest;
  } }));
}
export type ManifestSource = Awaited<ReturnType<typeof readTextManifests>>[number];

export async function applyManifestText(db: Database = getDb(), sources?: ManifestSource[]) {
  const counts = { updated: 0, unchanged: 0, report_only: 0, failed: 0, deferred: 0, skipped: 0 };
  const authority = autonomousAuthority("catalogue_metadata_sync", "DEC-20261027-B");
  let connection: Awaited<ReturnType<Sql["reserve"]>> | undefined;
  let locked = false;
  try {
    // Reserve one session solely for the run lock; rows keep independent
    // transactions on the API pool (max 30). A pooled lock/unlock could use
    // different sessions. ReservedSql is not a full Drizzle transaction client.
    const client = (db as Database & { $client: Sql }).$client;
    connection = await client.reserve();
    const [lock] = await connection.unsafe("SELECT pg_try_advisory_lock(728103, 1) AS acquired");
    locked = lock.acquired === true;
    if (!locked) {
      counts.skipped++;
      log.info({ label: "manifest-text-sync-locked" }, "Manifest text sync already running; skipping");
      return counts;
    }
    const inputs = sources ?? await readTextManifests();
    // Read hashes once to put pending work before unchanged rows on later boots.
    // No LIMIT before this prioritisation: otherwise the same first N starve the rest.
    const rows = await db.select().from(capabilities);
    const bySlug = new Map(rows.map(row => [row.slug, row]));
    const pending: Array<{ manifest: TextManifest; row: typeof rows[number]; payload: ReturnType<typeof textPayload> }> = [];
    for (const source of inputs) {
      const row = bySlug.get(source.slug);
      if (!row) continue; // no implicit onboarding
      try {
        const manifest = await source.load();
        const payload = textPayload(manifest);
        if (!isReportOnly(manifest, row) && row.manifestTextHash === payload.hash) counts.unchanged++;
        else pending.push({ manifest, row, payload });
      } catch (err) {
        counts.failed++;
        log.warn({ label: "manifest-text-row-failed", slug: source.slug, ...describeFailure(err) }, "Invalid manifest text; row skipped");
      }
    }
    counts.deferred = Math.max(0, pending.length - MANIFEST_TEXT_BOOT_LIMIT);
    for (const { manifest, payload } of pending.slice(0, MANIFEST_TEXT_BOOT_LIMIT)) {
      try {
        const outcome = await db.transaction(async tx => {
          await tx.execute(sql`SET LOCAL lock_timeout = '1s'`);
          await tx.execute(sql`SET LOCAL statement_timeout = '5s'`);
          const [current] = await tx.select().from(capabilities).where(eq(capabilities.slug, manifest.slug)).limit(1).for("no key update");
          if (!current) throw new Error("Capability disappeared");
          // The hash covers the manifest text only; a runtime-captured example is kept, not drift.
          const patch: Record<string, unknown> = { ...payload.patch, outputSchema: withRuntimeExample(payload.patch.outputSchema, current.outputSchema) };
          if (isReportOnly(manifest, current)) {
            const limitations = await tx.select().from(capabilityLimitations).where(and(eq(capabilityLimitations.capabilitySlug, current.slug), eq(capabilityLimitations.active, true))).orderBy(capabilityLimitations.sortOrder);
            const fields = Object.keys(patch).filter(k => !valuesEqual(patch[k], (current as Record<string, unknown>)[k]));
            if (!valuesEqual(payload.limitations, limitations.map(({ title, limitationText, category, severity, workaround }) => ({ title, limitationText, category, severity, workaround })))) fields.push("limitations");
            if (fields.length) log.info({ label: "manifest-text-report-only", slug: current.slug, fields }, "Manifest text differs; Petter must approve publication");
            return "report_only" as const;
          }
          if (current.manifestTextHash === payload.hash) return "unchanged" as const;
          await diffAndUpdateLimitations(tx, manifest.slug, payload.limitations);
          await tx.update(capabilities).set({ ...patch, manifestTextHash: payload.hash }).where(eq(capabilities.slug, manifest.slug));
          return "updated" as const;
        });
        counts[outcome]++;
      } catch (err) {
        counts.failed++;
        log.warn({ label: "manifest-text-row-failed", slug: manifest.slug, ...describeFailure(err) }, "Manifest text transaction rolled back; row skipped");
      }
    }
    if (counts.updated) clearReadinessCache();
  } catch (err) {
    counts.failed++;
    log.warn({ label: "manifest-text-sync-failed", ...describeFailure(err) }, "Manifest text sync unavailable; API continues serving");
  }
  finally {
    if (connection) {
      try {
        if (locked) await connection.unsafe("SELECT pg_advisory_unlock(728103, 1)");
      } catch (err) {
        counts.failed++;
        log.warn({ label: "manifest-text-unlock-failed", ...describeFailure(err) }, "Manifest text advisory unlock failed");
      } finally { connection.release(); }
    }
  }
  const summary = { label: "manifest-text-sync-summary", ...counts, limit: MANIFEST_TEXT_BOOT_LIMIT, ...describeAuthority(authority) };
  if (counts.failed > 0 && counts.updated === 0) log.warn(summary, "manifest-text-sync-summary");
  else log.info(summary, "manifest-text-sync-summary");
  return counts;
}
