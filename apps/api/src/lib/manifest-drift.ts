import { FIELD_CATEGORIES, valuesEqual, withRuntimeExample } from "./capability-field-authority.js";
import { manifestLimitationsToRows } from "./manifest-limitations.js";
import { sanitizeLimitationTitle } from "./capability-persistence.js";
import { TEXT_COLUMNS, isReportOnly } from "./manifest-publication-policy.js";
import type { Manifest } from "./capability-manifest-types.js";

export function manifestDrift(manifest: Record<string, unknown>, row: Record<string, unknown>, limitations: unknown[]) {
  const writable: string[] = [];
  const reportOnly: string[] = [];
  const nonSynced: string[] = [];
  const dbOwned: string[] = [];
  const publicationPending = isReportOnly(manifest, row);
  const synced = new Set<string>(TEXT_COLUMNS);
  const destination = (field: string, manifestOwned: boolean) => !manifestOwned ? dbOwned
    : !synced.has(field) && field !== "limitations" ? nonSynced
    : publicationPending ? reportOnly : writable;
  for (const [field, authority] of Object.entries(FIELD_CATEGORIES)) {
    if (field === "slug" || manifest[field] === undefined) continue;
    const expected = field === "output_schema" ? withRuntimeExample(manifest[field], row[field]) : manifest[field];
    if (!valuesEqual(expected, row[field])) destination(field, authority.category === "manifest").push(field);
  }
  if (manifest.limitations !== undefined) {
    const expected = manifestLimitationsToRows(manifest as unknown as Manifest).map(l => ({ ...l, title: sanitizeLimitationTitle(l.title) }));
    if (!valuesEqual(expected, limitations)) destination("limitations", true).push("limitations");
  }
  return { writable, reportOnly, nonSynced, dbOwned, publicationPending };
}
export function driftExitCode(strict: boolean, differences: number, failures: number) {
  return failures > 0 ? 2 : strict && differences > 0 ? 1 : 0;
}
