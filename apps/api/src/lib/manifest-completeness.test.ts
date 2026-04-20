/**
 * Cluster 2 Phase 4b.1 — manifest completeness gate.
 *
 * Scans every YAML file in `manifests/*.yaml` and asserts that each passes
 * `validateManifest(m, false)` (non-discover mode). Any required-field gap
 * fails the build — the regression guard for the 4b.1 YAML backfill.
 *
 * Runs as part of `npm test` under `apps/api` workspace; the existing
 * `.github/workflows/ci.yml` invokes `npm test` so this gate fires in CI
 * automatically.
 *
 * Required fields covered (via validateManifest):
 *   slug, name, description (>=20), category, price_cents, input_schema,
 *   output_schema, data_source, data_source_type, maintenance_class,
 *   processes_personal_data, output_field_reliability, limitations,
 *   test_fixtures.known_answer.{input,expected_fields}.
 *
 * If a new manifest is added without complete required fields, this test
 * fails with a clear error naming the offending slug and the error list.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { validateManifest } from "./onboarding-gates.js";
import type { Manifest } from "./capability-manifest-types.js";

const MANIFEST_DIR = resolve(import.meta.dirname, "../../../../manifests");

function loadManifests(): Array<{ slug: string; manifest: Manifest; file: string }> {
  const files = readdirSync(MANIFEST_DIR)
    .filter((f) => f.endsWith(".yaml"))
    .sort();
  return files.map((f) => {
    const file = resolve(MANIFEST_DIR, f);
    const text = readFileSync(file, "utf8");
    const manifest = yaml.load(text) as Manifest;
    return { slug: f.replace(/\.yaml$/, ""), manifest, file };
  });
}

describe("manifest completeness gate (Phase 4b.1)", () => {
  const entries = loadManifests();

  it("loads at least 275 manifests (catalog size guard)", () => {
    expect(entries.length).toBeGreaterThanOrEqual(275);
  });

  it("every manifest passes validateManifest() in strict (non-discover) mode", () => {
    const failures: Array<{ slug: string; errors: string[] }> = [];
    for (const { slug, manifest } of entries) {
      const errors = validateManifest(manifest, false);
      if (errors.length > 0) failures.push({ slug, errors });
    }
    if (failures.length > 0) {
      const lines = failures.map(
        (f) => `  ${f.slug}:\n    - ${f.errors.join("\n    - ")}`,
      );
      throw new Error(
        `Manifest completeness gate failed for ${failures.length} file(s):\n${lines.join("\n")}`,
      );
    }
    expect(failures).toEqual([]);
  });

  it("every manifest slug matches its filename", () => {
    const mismatches: Array<{ file: string; declared: string }> = [];
    for (const { slug, manifest } of entries) {
      if (manifest.slug !== slug) {
        mismatches.push({ file: slug, declared: manifest.slug });
      }
    }
    expect(mismatches, JSON.stringify(mismatches)).toEqual([]);
  });
});
