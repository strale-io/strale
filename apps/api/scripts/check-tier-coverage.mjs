#!/usr/bin/env node
/**
 * Tier-coverage structural gate (STRICT in CI as of 2026-08-17).
 *
 * Fourth structural CI gate alongside:
 *   - check-output-schema.ts               (output_schema isn't char-indexed)
 *   - check-fetch-timeout-coverage.mjs     (every fetch() is AbortSignal-bounded)
 *   - check-no-bare-catch.mjs              (F-0-009 anti-pattern)
 *   - check-manifest-guaranteed-consistency.mjs (guaranteed-tier fields appear in schema)
 *
 * For each capability with a captured response fixture at
 *   apps/api/test/fixtures/tier-coverage/<slug>.json
 * asserts the manifest's declarations match empirical response shape:
 *
 *   (a) GUARANTEED_EMPTY — every `output_field_reliability` entry marked
 *       `guaranteed` must be populated (non-null, non-empty) in the fixture.
 *       A guaranteed field absent from the wire is the worst class of drift:
 *       customers assert on it, downstream callers .field access it without
 *       a null-guard, and the SQS engine (gone) used to mark capabilities
 *       degraded on first miss. Strict mode fails CI on it.
 *
 *   (b) UNDECLARED_POPULATED — every populated key in the fixture must be
 *       declared in BOTH (i) `output_field_reliability` and (ii)
 *       `output_schema.properties`. A populated field the manifest doesn't
 *       declare is wire-shape drift: the consumer can't reason about
 *       reliability, the JSON-schema-driven SDK generator skips it, and
 *       the audit-trail builder doesn't tag it. The Finnish-vat-number
 *       gap (commit 64d8a30, 2026-05-13) is the case study — the handler
 *       emitted three additional fields for months before the manifest
 *       caught up.
 *
 * Common-/rare-reliability fields are unconditional by design — neither
 * the guaranteed-emptiness check nor the undeclared-populated check fires
 * on them. They're allowed to be present or absent.
 *
 * Enforcement (promoted 2026-08-17, the day findings-not-in-allowlist hit
 * zero): --strict exits 1 on any finding not in
 * scripts/tier-coverage-allowlist.txt; the bare invocation stays warn-only
 * for local exploration. CI runs --strict.
 *
 * The fixture set is the EU30 registry capabilities (output of
 *   npx tsx apps/api/scripts/capture-tier-fixtures.ts --company-data
 * ) captured once during the 2026-05-15/16 Openapi sprint cleanup. Other
 * capabilities are checked when/if a fixture exists for them; the gate
 * silently skips manifests with no captured fixture.
 *
 * Pattern mirrors check-manifest-guaranteed-consistency.mjs.
 *
 * Usage (run from repo root or apps/api):
 *   node apps/api/scripts/check-tier-coverage.mjs            # warn-only
 *   node apps/api/scripts/check-tier-coverage.mjs --strict   # CI mode, enforcing
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");
const manifestsDir = resolve(repoRoot, "manifests");
const fixturesDir = resolve(repoRoot, "apps", "api", "test", "fixtures", "tier-coverage");
const allowlistPath = resolve(__dirname, "tier-coverage-allowlist.txt");
const strict = process.argv.includes("--strict");

function isPopulated(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  // numbers, booleans always count as populated (0 / false are valid).
  return true;
}

function loadManifest(file) {
  try {
    return yaml.load(readFileSync(resolve(manifestsDir, file), "utf8"));
  } catch {
    // Malformed YAML is a different gate's problem (validate-capability).
    return null;
  }
}

function loadAllowlist() {
  if (!existsSync(allowlistPath)) return new Set();
  return new Set(
    readFileSync(allowlistPath, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );
}

function loadFixture(slug) {
  const p = resolve(fixturesDir, `${slug}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return { __corrupt: true };
  }
}

function scan() {
  if (!existsSync(manifestsDir)) {
    console.error(`manifests directory not found: ${manifestsDir}`);
    process.exit(2);
  }
  if (!existsSync(fixturesDir)) {
    // No fixtures captured yet — gate is a no-op. Not an error.
    console.log(
      "tier-coverage: no fixtures directory at apps/api/test/fixtures/tier-coverage/ — skipping all checks",
    );
    return { scanned: 0, withFixture: 0, findings: [] };
  }

  const files = readdirSync(manifestsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const findings = [];
  let withFixture = 0;

  for (const file of files) {
    const m = loadManifest(file);
    if (!m || typeof m !== "object") continue;
    const slug = m.slug ?? file.replace(/\.ya?ml$/, "");

    const fixture = loadFixture(slug);
    if (fixture === null) continue;
    withFixture++;

    if (fixture.__corrupt) {
      findings.push({ slug, type: "FIXTURE_CORRUPT", detail: "fixture JSON failed to parse" });
      continue;
    }

    const reliability = m.output_field_reliability ?? {};
    const schemaProps = m.output_schema?.properties ?? {};
    // Match check-manifest-guaranteed-consistency.mjs: union keys from
    // `properties` and `example`. Several manifests describe their full
    // shape in `example` alone and the sibling gate considers that
    // declared; diverging here would produce false-positive
    // UNDECLARED_SCHEMA findings on those manifests.
    const exampleKeys =
      m.output_schema?.example && typeof m.output_schema.example === "object"
        ? Object.keys(m.output_schema.example)
        : [];
    const reliabilityKeys = new Set(Object.keys(reliability));
    const schemaKeys = new Set([...Object.keys(schemaProps), ...exampleKeys]);

    // (a) GUARANTEED_EMPTY — every guaranteed field must be populated.
    const guaranteed = Object.entries(reliability)
      .filter(([, lvl]) => lvl === "guaranteed")
      .map(([k]) => k);
    const emptyGuaranteed = guaranteed.filter((f) => !isPopulated(fixture[f]));
    if (emptyGuaranteed.length > 0) {
      findings.push({
        slug,
        type: "GUARANTEED_EMPTY",
        detail: `manifest declares guaranteed but fixture is null/empty: [${emptyGuaranteed.join(", ")}]`,
      });
    }

    // (b) UNDECLARED_POPULATED — every populated fixture key must be declared
    // in both reliability + schema. Skip keys the manifest doesn't classify;
    // those are caught separately as (b1)/(b2).
    const undeclaredReliability = [];
    const undeclaredSchema = [];
    for (const [k, v] of Object.entries(fixture)) {
      if (!isPopulated(v)) continue;
      if (!reliabilityKeys.has(k)) undeclaredReliability.push(k);
      if (!schemaKeys.has(k)) undeclaredSchema.push(k);
    }
    if (undeclaredReliability.length > 0) {
      findings.push({
        slug,
        type: "UNDECLARED_RELIABILITY",
        detail: `fixture populates fields not in output_field_reliability: [${undeclaredReliability.join(", ")}]`,
      });
    }
    if (undeclaredSchema.length > 0) {
      findings.push({
        slug,
        type: "UNDECLARED_SCHEMA",
        detail: `fixture populates fields not in output_schema.properties: [${undeclaredSchema.join(", ")}]`,
      });
    }
  }

  return { scanned: files.length, withFixture, findings };
}

const { scanned, withFixture, findings } = scan();
const allowed = loadAllowlist();
const newFindings = findings.filter((f) => !allowed.has(f.slug));

console.log(
  `tier-coverage [${strict ? "strict" : "warn-only"}]: ${scanned} manifests scanned, ` +
    `${withFixture} with fixtures, ${findings.length} findings (${newFindings.length} not in allowlist)`,
);

if (findings.length > 0) {
  const grouped = new Map();
  for (const f of findings) {
    if (!grouped.has(f.type)) grouped.set(f.type, []);
    grouped.get(f.type).push(f);
  }
  for (const [type, items] of grouped) {
    console.log(`\n${type} (${items.length}):`);
    for (const it of items) {
      const tag = allowed.has(it.slug) ? " [allowlisted]" : "";
      console.log(`  ${it.slug}${tag}: ${it.detail}`);
    }
  }
  console.log(
    strict
      ? "\nSTRICT: findings not in scripts/tier-coverage-allowlist.txt fail this gate. " +
          "Re-capture a fixture after fixing its manifest with: " +
          "npx tsx apps/api/scripts/capture-tier-fixtures.ts --slug <slug>"
      : "\nWarn-only invocation — exiting 0. CI runs this gate with --strict. " +
          "Re-capture a fixture after fixing its manifest with: " +
          "npx tsx apps/api/scripts/capture-tier-fixtures.ts --slug <slug>",
  );
}

// Phase 2 promotion (2026-08-17): --strict now enforces. Promoted the same
// day the finding count reached zero-not-in-allowlist (spanish recaptured
// after its 2026-08-13 vendor swap; cypriot allowlisted pending the
// OPENAPI_ENABLED legal gate, case 151296).
if (strict && newFindings.length > 0) process.exit(1);
process.exit(0);
