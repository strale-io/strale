import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FIELD_CATEGORIES } from "./capability-field-authority.js";

/**
 * Parity gate: sync-manifest-canonical-to-db.ts must handle EVERY
 * `category: "manifest"` field in FIELD_CATEGORIES.
 *
 * The script is the sanctioned way to clear an AuthorityViolationError from
 * checkAuthorityDrift, which iterates exactly this taxonomy. When a field is
 * manifest-canonical but absent from the script, "run the sync script" stops
 * being sufficient and the next migration hits the gate anyway — the
 * 2026-08-27 austrian-company-data backfill aborted on cost_class drift
 * immediately after a sync run, because the script predated the Phase A0b
 * cost-class fields. This test turns that gap class into a CI failure at the
 * moment the taxonomy grows.
 *
 * The check is textual (the script is outside the tsconfig graph and executes
 * top-level against a live DB, so importing it is not an option). A field
 * "handled" means its snake_case name appears in the script source — which
 * holds for the SELECT list, the compare() calls, and the UPDATE SET list
 * alike, and fails loudly for a field that appears in none of them.
 */
describe("sync-manifest-canonical-to-db field parity", () => {
  const scriptSource = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "../../scripts/sync-manifest-canonical-to-db.ts",
    ),
    "utf-8",
  );

  const manifestCanonical = Object.entries(FIELD_CATEGORIES)
    .filter(([, entry]) => entry.category === "manifest")
    .map(([field]) => field);

  it("the taxonomy actually contains manifest-canonical fields (not vacuous)", () => {
    expect(manifestCanonical.length).toBeGreaterThanOrEqual(16);
    expect(manifestCanonical).toContain("cost_class");
  });

  it.each(manifestCanonical)(
    "script handles manifest-canonical field %s",
    (field) => {
      expect(
        scriptSource.includes(field),
        `FIELD_CATEGORIES marks '${field}' manifest-canonical but ` +
          "scripts/sync-manifest-canonical-to-db.ts never mentions it — add it " +
          "to the manifest type, the SELECT, the compare() block, and the " +
          "UPDATE, or one sync run will no longer clear authority drift.",
      ).toBe(true);
    },
  );
});
