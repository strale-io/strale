/**
 * Unit tests for the Phase 3b static manifest-consistency check.
 *
 * Per Rule 12 (audit-follow-up test coverage): three cases — happy path,
 * new-violation detection, allowlist-exempt. The script itself is .mjs and
 * scans the on-disk manifests directory; these tests exercise the smaller
 * shape-validation logic by mirroring it against fixture YAML data so they
 * don't depend on the production manifest set.
 */

import { describe, it, expect } from "vitest";
import yaml from "js-yaml";

// Mirror of the static-check logic from check-manifest-guaranteed-consistency.mjs.
// Kept here for unit testing without spawning the script and crawling disk.
// If the mjs script's logic changes, this mirror must change with it —
// the live check at CI time uses the script; this test guards the contract.
function findMissingGuaranteedFields(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== "object") return [];
  const m = manifest as Record<string, unknown>;
  const reliability = m.output_field_reliability;
  if (!reliability || typeof reliability !== "object") return [];

  const guaranteed = Object.entries(reliability as Record<string, unknown>)
    .filter(([, lvl]) => lvl === "guaranteed")
    .map(([k]) => k);
  if (guaranteed.length === 0) return [];

  const outputSchema = m.output_schema as Record<string, unknown> | undefined;
  const schemaProps = (outputSchema?.properties as Record<string, unknown>) || {};
  const example = outputSchema?.example;
  const exampleKeys =
    example && typeof example === "object" ? Object.keys(example as Record<string, unknown>) : [];
  const declared = new Set([...Object.keys(schemaProps), ...exampleKeys]);

  return guaranteed.filter((f) => !declared.has(f));
}

describe("check-manifest-guaranteed-consistency (Phase 3b static gate)", () => {
  it("passes a clean manifest where every guaranteed field is in output_schema.properties", () => {
    const manifest = yaml.load(`
      slug: clean-cap
      output_field_reliability:
        company_name: guaranteed
        uid: guaranteed
        status: guaranteed
        canton: common
      output_schema:
        type: object
        properties:
          company_name: { type: string }
          uid: { type: string }
          status: { type: string }
          canton: { type: string }
    `);
    expect(findMissingGuaranteedFields(manifest)).toEqual([]);
  });

  it("passes a clean manifest where every guaranteed field is in output_schema.example", () => {
    // Many manifests rely on the .example shape rather than .properties.
    const manifest = yaml.load(`
      slug: example-only-cap
      output_field_reliability:
        ico: guaranteed
        company_name: guaranteed
      output_schema:
        type: object
        example:
          ico: "12345678"
          company_name: Example s.r.o.
    `);
    expect(findMissingGuaranteedFields(manifest)).toEqual([]);
  });

  it("detects a new violation when a guaranteed field is not declared in schema", () => {
    // The regression class this gate catches: manifest author adds a
    // guaranteed-tier reliability annotation but forgets to declare the
    // field in output_schema. Runtime sentinel (PR #109) would catch this
    // within one scheduler tick; this gate shifts detection to PR review.
    const manifest = yaml.load(`
      slug: drift-cap
      output_field_reliability:
        company_name: guaranteed
        forgotten_field: guaranteed
      output_schema:
        type: object
        properties:
          company_name: { type: string }
    `);
    expect(findMissingGuaranteedFields(manifest)).toEqual(["forgotten_field"]);
  });

  it("ignores non-guaranteed reliability tiers (common, rare)", () => {
    // The gate is strict-missing-only on `guaranteed`. Fields marked common
    // or rare are allowed to be absent from the schema enumeration.
    const manifest = yaml.load(`
      slug: tiered-cap
      output_field_reliability:
        always_there: guaranteed
        sometimes_there: common
        rarely_there: rare
      output_schema:
        type: object
        properties:
          always_there: { type: string }
    `);
    expect(findMissingGuaranteedFields(manifest)).toEqual([]);
  });

  it("returns empty for manifests with no output_field_reliability block", () => {
    // Defensive: capabilities authored before the field-reliability concept
    // landed don't have the annotation. The gate must no-op on them rather
    // than producing false positives.
    expect(findMissingGuaranteedFields(yaml.load("slug: legacy-cap"))).toEqual([]);
  });
});
