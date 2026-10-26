/** CLI adapter for the shared onboarding pipeline. */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { resolve, join } from "node:path";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import * as yaml from "js-yaml";
import { openOperatorWriteDrizzle } from "../src/lib/operator-db.js";
import { autonomousAuthority } from "../src/lib/production-authority.js";
import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";
import { assertDiscoverNotDryRun } from "../src/lib/onboard-guards.js";
import {
  runOnboarding,
  validateOnboardingManifest,
} from "../src/lib/onboarding-pipeline.js";
import type { Manifest } from "../src/lib/capability-manifest-types.js";
import { capabilities } from "../src/db/schema.js";
config({ path: resolve(import.meta.dirname, "../../../.env") });

export function parseSkipGates(
  raw: string | undefined
): Array<{ gate: string; reason: string }> {
  if (!raw) return [];
  return raw.split(",").map((entry) => {
    const [gate, ...reasonParts] = entry.split(":");
    const reason = reasonParts.join(":").trim();
    const trimmedGate = gate?.trim() ?? "";
    if (!trimmedGate || !reason) {
      throw new Error(
        `Invalid --skip-gates entry "${entry}". Format: gate:reason (comma-separated for multiple)`
      );
    }
    return { gate: trimmedGate, reason };
  });
}

/**
 * Cluster 2 Phase 4a: --force-override-authority interactive guard.
 *
 * Reads exactly `OVERRIDE AUTHORITY` from stdin before letting the
 * backfill proceed. The flag alone is not enough — this prevents
 * reflexive / tab-completed overrides. In batch mode or when stdin is
 * not a TTY (CI runs), the override is refused unconditionally: if you
 * want to bypass authority in CI, you have to build a different flow.
 */
const AUTHORITY_CONFIRM_PHRASE = "OVERRIDE AUTHORITY";

async function confirmAuthorityOverride(isBatch: boolean): Promise<boolean> {
  if (isBatch) {
    console.error(
      "\n--force-override-authority is not allowed in --batch mode. Run single-manifest to override."
    );
    return false;
  }
  if (!process.stdin.isTTY) {
    console.error(
      "\n--force-override-authority requires interactive stdin. Refusing in non-TTY context."
    );
    return false;
  }

  console.warn(
    "\n" +
      "═══════════════════════════════════════════════════════════════════\n" +
      "⚠  --force-override-authority\n" +
      "═══════════════════════════════════════════════════════════════════\n" +
      "You are about to OVERWRITE DB-canonical and hybrid fields with\n" +
      "manifest values. Operator tunings (e.g., admin-repriced price_cents,\n" +
      "admin-set freshness_category) will be reset.\n" +
      "\n" +
      "Use this only when intentionally resetting a capability to manifest\n" +
      "defaults. This does NOT bypass manifest-canonical drift errors — if\n" +
      "DB drifted on a manifest-canonical field, fix the manifest instead.\n" +
      "═══════════════════════════════════════════════════════════════════\n"
  );
  process.stdout.write(
    `Type exactly "${AUTHORITY_CONFIRM_PHRASE}" to continue: `
  );

  const answer = await new Promise<string>((resolve) => {
    let buf = "";
    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      if (buf.includes("\n")) {
        process.stdin.removeListener("data", onData);
        resolve(buf.split("\n")[0].trim());
      }
    };
    process.stdin.on("data", onData);
  });

  return answer === AUTHORITY_CONFIRM_PHRASE;
}

interface OnboardResult {
  slug: string;
  status: "success" | "failed" | "skipped";
  timeMs: number;
  error?: string;
}
async function processSingleManifest(
  manifestPath: string,
  dryRun: boolean,
  isBackfill: boolean,
  flags: {
    strict: boolean;
    fix: boolean;
    discover: boolean;
    force: boolean;
    bypassAuthority?: boolean;
    skipGates: Array<{ gate: string; reason: string }>;
  }
): Promise<OnboardResult> {
  const db = openOperatorWriteDrizzle(
    autonomousAuthority("capability_onboarding", "DEC-20260812-A")
  );
  const result = await runOnboarding(db, {
    manifestYaml: readFileSync(manifestPath, "utf-8"),
    mode: isBackfill ? "backfill" : "onboard",
    dryRun,
    ...flags,
    onMessage: (...values) => console.log(...values),
  });
  if (result.updatedManifestYaml)
    writeFileSync(manifestPath, result.updatedManifestYaml, "utf-8");
  return { ...result, error: result.errors.map((e) => e.message).join("; ") };
}

// ─── Batch processing ────────────────────────────────────────────────────────

async function runBatch(
  manifestDir: string,
  dryRun: boolean,
  isBackfill: boolean,
  flags: {
    strict: boolean;
    fix: boolean;
    discover: boolean;
    skipGates: Array<{ gate: string; reason: string }>;
    force: boolean;
    bypassAuthority?: boolean;
  },
  delayMs: number
): Promise<void> {
  if (!existsSync(manifestDir)) {
    console.error(`Directory not found: ${manifestDir}`);
    process.exit(1);
  }

  // Find all YAML files
  const files = readdirSync(manifestDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
    .map((f) => join(manifestDir, f));

  if (files.length === 0) {
    console.error(`No .yaml files found in ${manifestDir}`);
    process.exit(1);
  }

  console.log(`\n[batch] Found ${files.length} manifests in ${manifestDir}`);

  const db = openOperatorWriteDrizzle(
    autonomousAuthority("capability_onboarding", "DEC-20260812-A")
  );

  // Parse all manifests upfront for validation
  const manifests: Array<{
    path: string;
    manifest: Manifest;
    errors: string[];
  }> = [];
  for (const file of files) {
    try {
      const raw = readFileSync(file, "utf-8");
      const manifest = yaml.load(raw) as Manifest;
      const errors = await validateOnboardingManifest(
        manifest,
        {
          mode: isBackfill ? "backfill" : "insert",
          source: "manifest",
          skipGates: flags.skipGates,
          discover: flags.discover,
        },
        db
      );
      manifests.push({ path: file, manifest, errors });
    } catch (err) {
      manifests.push({
        path: file,
        manifest: { slug: file } as any,
        errors: [
          `YAML parse error: ${err instanceof Error ? err.message : err}`,
        ],
      });
    }
  }

  // Fail fast if any manifests are invalid
  const invalid = manifests.filter((m) => m.errors.length > 0);
  if (invalid.length > 0) {
    console.error(
      `\n[batch] ${invalid.length} invalid manifests — fix before batch processing:`
    );
    for (const m of invalid) {
      console.error(`  ${m.manifest.slug ?? m.path}: ${m.errors.join("; ")}`);
    }
    process.exit(1);
  }

  // Resumability: check which capabilities already exist
  const existingRows = await db
    .select({ slug: capabilities.slug })
    .from(capabilities);
  const existingSlugs = new Set(existingRows.map((r) => r.slug));

  const toProcess = isBackfill
    ? manifests // backfill mode processes all
    : manifests.filter((m) => !existingSlugs.has(m.manifest.slug));
  const skippedCount = manifests.length - toProcess.length;

  if (skippedCount > 0 && !isBackfill) {
    console.log(`[batch] ${skippedCount} already onboarded — skipping`);
  }
  console.log(
    `[batch] Processing ${toProcess.length} manifests (${
      isBackfill ? "backfill" : "onboard"
    } mode)\n`
  );

  // Process sequentially with delay between capabilities
  const results: OnboardResult[] = [];
  for (let i = 0; i < toProcess.length; i++) {
    const { path: mPath } = toProcess[i];
    const shortName = mPath.split(/[/\\]/).pop() ?? mPath;
    console.log(
      `[batch] (${i + 1}/${toProcess.length}) Processing ${shortName}...`
    );

    const result = await processSingleManifest(
      mPath,
      dryRun,
      isBackfill,
      flags
    );
    results.push(result);

    if (result.status === "failed") {
      console.error(`  FAILED: ${result.error}`);
    } else {
      console.log(`  OK (${(result.timeMs / 1000).toFixed(1)}s)`);
    }

    // Delay between capabilities to avoid rate-limiting upstreams
    if (i < toProcess.length - 1 && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  // Add skipped results
  if (!isBackfill) {
    for (const m of manifests.filter((m) =>
      existingSlugs.has(m.manifest.slug)
    )) {
      results.push({ slug: m.manifest.slug, status: "skipped", timeMs: 0 });
    }
  }

  // Summary table
  const succeeded = results.filter((r) => r.status === "success");
  const failed = results.filter((r) => r.status === "failed");
  const skipped = results.filter((r) => r.status === "skipped");

  console.log("\n" + "═".repeat(60));
  console.log("BATCH SUMMARY");
  console.log("═".repeat(60));
  console.log(`  Total manifests:  ${manifests.length}`);
  console.log(`  Succeeded:        ${succeeded.length}`);
  console.log(`  Failed:           ${failed.length}`);
  console.log(`  Skipped (exists): ${skipped.length}`);
  console.log(
    `  Total time:       ${(
      results.reduce((s, r) => s + r.timeMs, 0) / 1000
    ).toFixed(1)}s`
  );

  if (failed.length > 0) {
    console.log("\nFailed capabilities:");
    for (const r of failed) {
      console.log(`  ${r.slug}: ${r.error}`);
    }
  }

  if (failed.length > 0) {
    process.exit(1);
  }
}

export async function main() {
  // Register executors so --discover and fixture verification can execute capabilities
  await autoRegisterCapabilities();

  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const isBackfill = args.includes("--backfill");
  const strict = args.includes("--strict");
  const fix = args.includes("--fix");
  const discover = args.includes("--discover");
  const isBatch = args.includes("--batch");
  // --force bypasses the backfill safety banner (manifest drift audit, 2026-04-20).
  const force = args.includes("--force");

  // Cluster 2 Phase 2 (OQ-5 / DEC-20260420-K): --skip-gates replaces the
  // old SKIP_ONBOARDING_GATES env var. Format:
  //   --skip-gates="gate1_manifest:reason,gate3_schema:other reason"
  const skipGatesIdx = args.indexOf("--skip-gates");
  const skipGatesRaw = skipGatesIdx !== -1 ? args[skipGatesIdx + 1] : undefined;
  let skipGates: Array<{ gate: string; reason: string }>;
  try {
    skipGates = parseSkipGates(skipGatesRaw);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Cluster 2 Phase 4a (DEC-20260421-D, DEC-20260421-E):
  // --force-override-authority lets operator overwrite db/hybrid fields
  // from manifest (the "reset to manifest defaults" workflow). Requires
  // interactive stdin confirmation — the flag alone is not enough. Does
  // NOT bypass manifest-canonical drift errors (those indicate a real
  // bug, not an override case).
  const bypassAuthority = args.includes("--force-override-authority");
  if (bypassAuthority) {
    const confirmed = await confirmAuthorityOverride(isBatch);
    if (!confirmed) {
      console.error("--force-override-authority aborted by operator.");
      process.exit(1);
    }
  }

  const flags = { strict, fix, discover, force, skipGates, bypassAuthority };

  // F-B-005: refuse --discover under --dry-run. Applies to single- and
  // batch-mode, onboard- and backfill-paths uniformly because both call
  // sites (onboard() and backfill()) invoke discoverFixtures() without
  // checking dryRun.
  assertDiscoverNotDryRun(dryRun, discover);

  // Batch mode
  if (isBatch) {
    const dirIdx = args.indexOf("--manifest-dir");
    if (dirIdx === -1 || !args[dirIdx + 1]) {
      console.error(
        "Batch usage: npx tsx scripts/onboard.ts --batch --manifest-dir <dir> [--discover] [--backfill] [--dry-run] [--delay-ms N]"
      );
      process.exit(1);
    }
    const manifestDir = resolve(args[dirIdx + 1]);
    const delayIdx = args.indexOf("--delay-ms");
    const delayMs =
      delayIdx !== -1 ? parseInt(args[delayIdx + 1], 10) || 2000 : 2000;
    await runBatch(manifestDir, dryRun, isBackfill, flags, delayMs);
    return;
  }

  // Single manifest mode
  const manifestIdx = args.indexOf("--manifest");
  if (manifestIdx === -1 || !args[manifestIdx + 1]) {
    console.error(
      "Usage: npx tsx scripts/onboard.ts --manifest <path> [--dry-run] [--backfill] [--strict] [--fix] [--discover]"
    );
    console.error(
      "Batch: npx tsx scripts/onboard.ts --batch --manifest-dir <dir> [--discover] [--backfill] [--dry-run]"
    );
    process.exit(1);
  }

  const manifestPath = resolve(args[manifestIdx + 1]);
  console.log(`Reading manifest: ${manifestPath}`);

  const result = await processSingleManifest(
    manifestPath,
    dryRun,
    isBackfill,
    flags
  );
  if (result.status === "failed") {
    console.error(result.error);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((err) => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}
