/**
 * Forward-looking guard for the manifest-driven capability registration
 * pipeline (apps/api/src/capabilities/auto-register.ts).
 *
 * Reports two classes of registration drift, plus one informational class:
 *
 *   ERRORS (exit 1):
 *     1. Manifests without executors — manifest exists but no <slug>.ts
 *        file. The cap would log auto-register-executor-file-missing on boot.
 *     2. Executors without manifests (and not DEACTIVATED) — executor file
 *        present, no manifests/<slug>.yaml, and not in the DEACTIVATED list.
 *        The cap silently fails to register under the manifest-driven flow.
 *
 *   INFO (exit 0):
 *     3. Dead-executor candidates — executor file present, slug is in
 *        DEACTIVATED, no manifest. The executor is not imported, not in
 *        the catalog, not visible. Candidate for removal as dead code.
 *
 * Run manually after adding/removing/renaming capabilities:
 *   cd apps/api && npx tsx scripts/audit-capability-pairing.ts
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { getDeactivatedCapabilities } from "../src/capabilities/auto-register.js";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const MANIFESTS_DIR = resolve(REPO_ROOT, "manifests");
const CAPABILITIES_DIR = resolve(REPO_ROOT, "apps", "api", "src", "capabilities");

function manifestSlugs(): Set<string> {
  const slugs = new Set<string>();
  for (const file of readdirSync(MANIFESTS_DIR)) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    try {
      const raw = readFileSync(resolve(MANIFESTS_DIR, file), "utf8");
      const parsed = yaml.load(raw) as { slug?: string } | null;
      if (typeof parsed?.slug === "string") slugs.add(parsed.slug);
    } catch {
      // skip malformed
    }
  }
  return slugs;
}

function executorSlugs(): Set<string> {
  const slugs = new Set<string>();
  for (const file of readdirSync(CAPABILITIES_DIR)) {
    if (!file.endsWith(".ts")) continue;
    if (file === "index.ts" || file === "auto-register.ts") continue;
    if (file.endsWith(".test.ts") || file.endsWith(".spec.ts") || file.endsWith(".d.ts")) continue;
    slugs.add(file.replace(/\.ts$/, ""));
  }
  return slugs;
}

const manifests = manifestSlugs();
const executors = executorSlugs();
const deactivated = new Set(getDeactivatedCapabilities().keys());

// Errors — would break registration silently.
const manifestsWithoutExecutors: string[] = [];
const executorsWithoutManifests: string[] = [];
// Info — orphan executor file for a deactivated cap with no manifest.
// Not loaded, not in the catalog, not visible. Candidate for deletion.
const deadExecutorCandidates: string[] = [];

for (const slug of manifests) {
  if (!executors.has(slug) && !deactivated.has(slug)) {
    manifestsWithoutExecutors.push(slug);
  }
}
for (const slug of executors) {
  if (manifests.has(slug)) continue;
  if (deactivated.has(slug)) {
    deadExecutorCandidates.push(slug);
  } else {
    executorsWithoutManifests.push(slug);
  }
}

manifestsWithoutExecutors.sort();
executorsWithoutManifests.sort();
deadExecutorCandidates.sort();

const report = {
  totals: {
    manifests: manifests.size,
    executors: executors.size,
    deactivated: deactivated.size,
  },
  manifests_without_executors: manifestsWithoutExecutors,
  executors_without_manifests: executorsWithoutManifests,
  dead_executor_candidates: deadExecutorCandidates,
};

console.log(JSON.stringify(report, null, 2));

const errorCount = manifestsWithoutExecutors.length + executorsWithoutManifests.length;

if (errorCount > 0) {
  console.error(
    `\nERROR: ${manifestsWithoutExecutors.length} manifest(s) without executors, ` +
      `${executorsWithoutManifests.length} executor(s) without manifests.`,
  );
  console.error(
    "For each: write the missing manifest, write the missing executor, move the orphan out, or add to DEACTIVATED.",
  );
  process.exit(1);
}

if (deadExecutorCandidates.length > 0) {
  console.log(
    `\nINFO: ${deadExecutorCandidates.length} dead-executor candidate(s) — DEACTIVATED with no manifest. ` +
      "Not loaded by auto-register; safe to remove if confirmed dead code.",
  );
}

console.log("\nClean: registration drift = 0.");
process.exit(0);
