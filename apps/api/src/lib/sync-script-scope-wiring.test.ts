/**
 * The script must gate its DIFF on the same selection it passes to the WRITE.
 *
 * ## Why this is a source check
 *
 * `scripts/sync-manifest-canonical-to-db.ts` executes top-level against a live
 * database and sits outside the tsconfig graph, so a test cannot import it.
 * That is the same constraint `sync-script-field-parity.test.ts` documents and
 * the same remedy it settled on.
 *
 * Everything that CAN be proven by execution has been moved into
 * `manifest-sync-fields.ts` and is unit- and integration-tested there. What is
 * irreducibly left in the script is the wiring: that one `selection` object
 * feeds both the `compare()` gate and `buildAssignments()`. If those two ever
 * took different sets, the printed diff would stop describing the write — and
 * the diff is the artefact a founder approves a scoped mutation against, so a
 * diff wider than the write is worse than no diff at all.
 *
 * The positive controls below run the same detection over strings this file
 * controls, so "found nothing" cannot be mistaken for "nothing to find".
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = readFileSync(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../../scripts/sync-manifest-canonical-to-db.ts",
  ),
  "utf-8",
);

/** Does this source gate compare() on a set derived from `selection.fields`? */
function gatesDiffOnSelection(src: string): boolean {
  return (
    /const\s+selected\s*=\s*new\s+Set\(\s*selection\.fields\s*\)/.test(src) &&
    /function\s+compare\([\s\S]{0,200}?if\s*\(!selected\.has\(field\)\)\s*return;/.test(src)
  );
}

/** Does it derive the write from the same `selection.fields`? */
function writesFromSelection(src: string): boolean {
  return /buildAssignments\(\s*selection\.fields\s*,/.test(src);
}

describe("the script wires one selection into both the diff and the write", () => {
  it("gates compare() on the selection", () => {
    expect(
      gatesDiffOnSelection(SCRIPT),
      "compare() no longer skips unselected fields — the printed diff can now " +
        "be wider than the UPDATE, which is the artefact a scoped grant is " +
        "approved against.",
    ).toBe(true);
  });

  it("derives the write from the same selection", () => {
    expect(writesFromSelection(SCRIPT)).toBe(true);
  });

  it("never reaches the database before the scope is parsed", () => {
    // An invalid scope should cost nothing and touch no credential.
    const parseAt = SCRIPT.indexOf("parseFieldSelection(args)");
    const connectAt = SCRIPT.indexOf("openOperatorWriteDb(");
    expect(parseAt).toBeGreaterThan(-1);
    expect(connectAt).toBeGreaterThan(-1);
    expect(parseAt, "the write connection opens before the scope is validated").toBeLessThan(
      connectAt,
    );
  });

  it("prints the selected set, so the authorised scope is reconstructable", () => {
    expect(SCRIPT).toMatch(/Field scope:/);
    expect(SCRIPT).toMatch(/Audit: slug=/);
  });

  it("no longer contains a monolithic all-column UPDATE", () => {
    // The shape this PR removes: a hand-written SET listing every field.
    const setBlock = /SET\s+name\s*=[\s\S]{0,400}output_schema\s*=/.test(SCRIPT);
    expect(setBlock, "the all-column UPDATE template is still present").toBe(false);
  });

  describe("the detection itself, on strings this file controls", () => {
    it("flags a script whose compare() is ungated", () => {
      const bad =
        "const selected = new Set(selection.fields);\n" +
        "function compare(field: string, a: unknown, b: unknown) {\n  const x = 1;\n}";
      expect(gatesDiffOnSelection(bad)).toBe(false);
    });

    it("accepts a script that gates it", () => {
      const good =
        "const selected = new Set(selection.fields);\n" +
        "function compare(field: string, a: unknown, b: unknown) {\n" +
        "  if (!selected.has(field)) return;\n}";
      expect(gatesDiffOnSelection(good)).toBe(true);
    });

    it("flags a write that does not come from the selection", () => {
      expect(writesFromSelection("buildAssignments(CANONICAL_SYNC_FIELD_NAMES, manifest)")).toBe(
        false,
      );
      expect(writesFromSelection("buildAssignments(selection.fields, manifest)")).toBe(true);
    });
  });
});
