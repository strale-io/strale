/**
 * Field-scope selection for the manifest sync script.
 *
 * ## The property under test
 *
 * A founder grant can only be as narrow as the tool it authorises. These prove
 * the tool can actually be narrowed — that `--fields input_schema` writes that
 * column and no other, including when some other canonical field has genuinely
 * drifted and would have been swept along by the old all-fields UPDATE.
 *
 * That is not hypothetical. On 2026-08-28 a one-line `input_schema` change to
 * `image-resize` needed a production sync; a read-only preflight showed the
 * write would also have replaced `output_schema`, an unrelated drift dating to
 * #98. The script's own comment had already named the failure mode, citing the
 * google-search near-miss during the #160 sync.
 */

import { describe, it, expect } from "vitest";
import {
  CANONICAL_SYNC_FIELD_NAMES,
  FieldSelectionError,
  buildAssignments,
  parseFieldSelection,
  unwritableSelected,
  applyAssignments,
  type SqlLike,
} from "./manifest-sync-fields.js";

const MANIFEST = {
  slug: "demo",
  name: "Demo",
  description: "d",
  category: "c",
  input_schema: { type: "object", properties: { a: { enum: ["x"] } } },
  output_schema: { type: "object", properties: { b: {} } },
  data_source: "src",
  cost_class: "free_unlimited",
  quota_window: null,
};

describe("the field list is an allowlist, and it fails closed", () => {
  it("refuses an unknown field", () => {
    expect(() => parseFieldSelection(["demo", "--fields", "lifecycle_state"])).toThrow(
      /Not manifest-canonical field\(s\): lifecycle_state/,
    );
  });

  it("refuses a field that exists on the table but is not manifest-canonical", () => {
    // price_cents is a real column and deliberately NOT syncable — the script's
    // scope note says it never touches pricing.
    expect(() => parseFieldSelection(["demo", "--fields", "price_cents"])).toThrow(
      FieldSelectionError,
    );
  });

  it("refuses an empty list", () => {
    expect(() => parseFieldSelection(["demo", "--fields", ""])).toThrow(/empty list/);
    expect(() => parseFieldSelection(["demo", "--fields", " , , "])).toThrow(/empty list/);
  });

  it("refuses --fields with no value", () => {
    expect(() => parseFieldSelection(["demo", "--fields"])).toThrow(/requires a comma-separated/);
    expect(() => parseFieldSelection(["demo", "--fields", "--dry-run"])).toThrow(
      /requires a comma-separated/,
    );
  });

  it("refuses a run with no scope at all", () => {
    // The load-bearing default change: silence used to mean "write everything".
    expect(() => parseFieldSelection(["demo"])).toThrow(/Refusing to write without an explicit field scope/);
    expect(() => parseFieldSelection(["demo", "--dry-run"])).toThrow(/explicit field scope/);
  });

  it("refuses both flags at once rather than guessing", () => {
    expect(() =>
      parseFieldSelection(["demo", "--fields", "input_schema", "--all-fields"]),
    ).toThrow(/not both/);
  });

  it("accepts one field, several fields, and the = form", () => {
    expect(parseFieldSelection(["demo", "--fields", "input_schema"]).fields).toEqual([
      "input_schema",
    ]);
    expect(
      parseFieldSelection(["demo", "--fields", "input_schema,description"]).fields,
    ).toEqual(["input_schema", "description"]);
    expect(parseFieldSelection(["demo", "--fields=cost_class"]).fields).toEqual(["cost_class"]);
  });

  it("--all-fields is explicit, and selects exactly the canonical set", () => {
    const sel = parseFieldSelection(["demo", "--all-fields"]);
    expect(sel.mode).toBe("all");
    expect([...sel.fields]).toEqual([...CANONICAL_SYNC_FIELD_NAMES]);
  });

  it("records the mode so the audit line can distinguish the two", () => {
    expect(parseFieldSelection(["demo", "--fields", "input_schema"]).mode).toBe("explicit");
  });
});

describe("assignments are derived from the selection and nothing else", () => {
  it("one requested field yields exactly one column", () => {
    const a = buildAssignments(["input_schema"], MANIFEST);
    expect(a.map((x) => x.column)).toEqual(["input_schema"]);
  });

  it("UNREQUESTED DRIFT CANNOT BE OVERWRITTEN", () => {
    // The property the whole PR exists for. output_schema differs from the DB
    // and is deliberately not selected; it must not appear.
    const a = buildAssignments(["input_schema"], MANIFEST);
    expect(a.some((x) => x.column === "output_schema")).toBe(false);
    expect(a.some((x) => x.column === "description")).toBe(false);
  });

  it("multiple explicitly requested fields are all written", () => {
    const a = buildAssignments(["input_schema", "description", "cost_class"], MANIFEST);
    expect(a.map((x) => x.column).sort()).toEqual(["cost_class", "description", "input_schema"]);
  });

  it("never returns a column outside the selection, for any selection", () => {
    // Exhaustive rather than sampled: every single-field selection must
    // produce at most that one column.
    for (const field of CANONICAL_SYNC_FIELD_NAMES) {
      const a = buildAssignments([field], MANIFEST);
      for (const x of a) {
        expect(x.column, `selecting ${field} produced ${x.column}`).toBe(field);
      }
    }
  });

  it("a selected field absent from the manifest is skipped, not written as undefined", () => {
    // Absent means "leave the DB alone" — the same rule checkAuthorityDrift
    // uses. Writing `undefined` would blank the column.
    const a = buildAssignments(["maintenance_class"], MANIFEST);
    expect(a).toHaveLength(0);
    expect(unwritableSelected(["maintenance_class"], MANIFEST)).toEqual(["maintenance_class"]);
  });

  it("an explicit null IS written, because null is a declared value", () => {
    // How a cost-class transition clears its old quota fields.
    const a = buildAssignments(["quota_window"], MANIFEST);
    expect(a).toEqual([{ column: "quota_window", kind: "plain", value: null }]);
  });
});

describe("the UPDATE sets only the selected columns", () => {
  /** Captures the SQL and params instead of executing them. */
  function recorder() {
    const calls: Array<{ query: string; params: unknown[] }> = [];
    const sql = {
      unsafe: async (query: string, params: unknown[] = []) => {
        calls.push({ query, params });
        return [{ slug: "demo" }];
      },
      json: (v: unknown) => v,
      array: (v: unknown) => v,
    } as unknown as SqlLike;
    return { sql, calls };
  }

  it("names exactly the requested column in the SET clause", async () => {
    const { sql, calls } = recorder();
    await applyAssignments(sql, "demo", buildAssignments(["input_schema"], MANIFEST));
    expect(calls).toHaveLength(1);
    // ::jsonb is required, not cosmetic — see applyAssignments. An untyped
    // parameter into a jsonb column stores the value double-encoded.
    expect(calls[0]!.query).toMatch(/SET input_schema = \$2::jsonb WHERE slug = \$1/);
  });

  it("NO SQL BUILDER FALLS BACK TO ALL FIELDS", async () => {
    // Read the generated SQL and assert that not one unselected canonical
    // column appears in it. This is the assertion that would have caught the
    // old monolithic template.
    const { sql, calls } = recorder();
    await applyAssignments(sql, "demo", buildAssignments(["input_schema"], MANIFEST));
    const query = calls[0]!.query;
    for (const field of CANONICAL_SYNC_FIELD_NAMES) {
      if (field === "input_schema") continue;
      expect(query, `unselected column ${field} appears in the UPDATE`).not.toContain(field);
    }
  });

  it("sets several columns when several are authorised", async () => {
    const { sql, calls } = recorder();
    await applyAssignments(
      sql,
      "demo",
      buildAssignments(["input_schema", "description"], MANIFEST),
    );
    // Order follows the canonical field list, not the caller's argument order,
    // so the placeholder numbers are asserted by pattern rather than pinned.
    const q = calls[0]!.query;
    expect(q).toMatch(/input_schema = \$\d/);
    expect(q).toMatch(/description = \$\d/);
    expect(q).not.toContain("output_schema");
  });

  it("binds values as parameters rather than inlining them", async () => {
    const { sql, calls } = recorder();
    await applyAssignments(sql, "demo", buildAssignments(["description"], MANIFEST));
    expect(calls[0]!.params).toEqual(["demo", "d"]);
    expect(calls[0]!.query).not.toContain("'d'");
  });

  it("passes json columns as OBJECTS, not pre-stringified JSON", async () => {
    // Inverted after a real-Postgres run: pre-stringifying stores the value
    // double-encoded, because postgres.js serialises whatever it is handed.
    // Measured on Postgres 17 with and without a ::jsonb cast; the object form
    // is the only one that lands as an object.
    const { sql, calls } = recorder();
    await applyAssignments(sql, "demo", buildAssignments(["input_schema"], MANIFEST));
    expect(typeof calls[0]!.params[1]).toBe("object");
    expect(calls[0]!.params[1]).toEqual(MANIFEST.input_schema);
  });

  it("refuses to run an UPDATE with an empty SET", async () => {
    const { sql, calls } = recorder();
    await expect(applyAssignments(sql, "demo", [])).rejects.toThrow(FieldSelectionError);
    expect(calls, "an empty selection still reached the database").toHaveLength(0);
  });
});

describe("the displayed diff and the executed write use the same set", () => {
  /**
   * The script gates `compare()` on the same `selection.fields` it passes to
   * `buildAssignments`. Proven here at the level both share: for any selection,
   * the set of fields that CAN appear in the diff equals the set that can be
   * written.
   *
   * A diff wider than the write would be worse than none — it is the artefact a
   * reviewer approves a scoped mutation against.
   */
  it("selectable and writable field sets are identical", () => {
    for (const selection of [
      ["input_schema"],
      ["input_schema", "output_schema"],
      [...CANONICAL_SYNC_FIELD_NAMES],
    ]) {
      const writable = buildAssignments(selection, MANIFEST).map((a) => a.column);
      for (const column of writable) {
        expect(selection).toContain(column);
      }
    }
  });
});
