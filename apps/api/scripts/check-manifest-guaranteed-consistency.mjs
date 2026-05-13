#!/usr/bin/env node
/**
 * Phase 3b Harden — pipeline-bypass detector (static manifest-consistency).
 *
 * Per DEC-20260513-B + DEC-20260513-C, enforces that every field declared
 * `guaranteed` in a manifest's `output_field_reliability` is also enumerated
 * in `output_schema.properties` or `output_schema.example`. Catches the
 * authorship-time drift class where a manifest author adds a guaranteed-tier
 * field reliability annotation but forgets to declare the field in the
 * output schema — the runtime sentinel (PR #109) would catch the resulting
 * runtime divergence within one scheduler tick, but this static gate
 * shifts detection left to PR review.
 *
 * Pattern mirrors check-fetch-timeout-coverage.mjs --strict. Two modes:
 *   default    — print findings + exit 0 (informational)
 *   --strict   — exit 1 if any new offenders appear vs the allowlist
 *
 * Allowlist: scripts/manifest-consistency-allowlist.txt (one slug per line).
 * The 22 entries grandfathered as of 2026-05-13 are the pre-existing drift
 * surfaced when the gate first ran; each gets a separate per-manifest fix.
 *
 * Path A re-entry triggers (full PR-time dynamic gate that invokes the live
 * executor against changed manifests) per DEC-20260513-B/C:
 *   (a) multiple concurrent contributors merging manifests,
 *   (b) a CH-class bug recurs that the 1-hour runtime-sentinel window
 *       allows to damage production, or
 *   (c) CI infrastructure (DB access + ~30 executor env vars) gets
 *       provisioned for unrelated reasons.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");
const manifestsDir = resolve(repoRoot, "manifests");
const allowlistPath = resolve(__dirname, "manifest-consistency-allowlist.txt");
const strict = process.argv.includes("--strict");

function loadAllowlist() {
  if (!existsSync(allowlistPath)) return new Set();
  return new Set(
    readFileSync(allowlistPath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );
}

function scan() {
  if (!existsSync(manifestsDir)) {
    console.error(`manifests directory not found: ${manifestsDir}`);
    process.exit(2);
  }

  const files = readdirSync(manifestsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const violations = [];

  for (const file of files) {
    let parsed;
    try {
      parsed = yaml.load(readFileSync(resolve(manifestsDir, file), "utf8"));
    } catch (err) {
      // Malformed YAML is a different gate's problem (validate-capability).
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const m = parsed;

    const reliability = m.output_field_reliability;
    if (!reliability || typeof reliability !== "object") continue;

    const guaranteed = Object.entries(reliability)
      .filter(([, lvl]) => lvl === "guaranteed")
      .map(([k]) => k);
    if (guaranteed.length === 0) continue;

    const schemaProps = m.output_schema?.properties || {};
    const exampleKeys = m.output_schema?.example && typeof m.output_schema.example === "object"
      ? Object.keys(m.output_schema.example)
      : [];
    const declared = new Set([...Object.keys(schemaProps), ...exampleKeys]);

    const missing = guaranteed.filter((f) => !declared.has(f));
    if (missing.length > 0) {
      violations.push({ slug: m.slug ?? file.replace(/\.ya?ml$/, ""), file, missing });
    }
  }

  return violations;
}

const violations = scan();
const allowed = loadAllowlist();
const newViolations = violations.filter((v) => !allowed.has(v.slug));

console.log(
  `manifest guaranteed-field consistency: ${violations.length} total, ${newViolations.length} not in allowlist`,
);

if (newViolations.length > 0) {
  console.log("\nNew violations (not in allowlist):");
  for (const v of newViolations) {
    console.log(`  ${v.slug} (${v.file}): missing-from-schema=[${v.missing.join(", ")}]`);
  }
}

if (strict && newViolations.length > 0) {
  console.error(
    "\nManifest declares `guaranteed` field(s) not enumerated in output_schema.properties " +
      "or output_schema.example. Either add the field to output_schema (preferred) or " +
      "downgrade the reliability annotation to `common` or `rare`. See DEC-20260513-B.",
  );
  process.exit(1);
}
