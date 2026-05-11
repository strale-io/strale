/**
 * Shared helper: enumerate slugs declared in manifests/*.yaml.
 *
 * Used by drift-detection scripts that need to compare the on-disk
 * manifest set against another source of truth (executors, DB rows, etc).
 *
 * Malformed YAML files are reported via the supplied `onMalformed` callback
 * (defaults to no-op) so callers can decide how to surface them. The
 * function never throws — it returns the slug set it could parse.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

export function manifestSlugs(opts: {
  manifestsDir: string;
  onMalformed?: (file: string, err: unknown) => void;
}): Set<string> {
  const slugs = new Set<string>();
  for (const file of readdirSync(opts.manifestsDir)) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    try {
      const raw = readFileSync(resolve(opts.manifestsDir, file), "utf8");
      const parsed = yaml.load(raw) as { slug?: string } | null;
      if (typeof parsed?.slug === "string") slugs.add(parsed.slug);
    } catch (err) {
      opts.onMalformed?.(file, err);
    }
  }
  return slugs;
}
