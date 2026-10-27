import type { Manifest } from "./capability-manifest-types.js";

/** Shared by backfill and text-only sync; keep manifest defaults identical. */
export function manifestLimitationsToRows(manifest: Pick<Manifest, "limitations">) {
  return (manifest.limitations ?? []).map((lim) => ({
    title: lim.title ?? null,
    limitationText: lim.text,
    category: lim.category,
    severity: lim.severity ?? "info",
    workaround: lim.workaround ?? null,
  }));
}
