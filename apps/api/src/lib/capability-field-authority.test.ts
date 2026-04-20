/**
 * Cluster 2 Phase 4a tests for the FIELD_CATEGORIES taxonomy.
 *
 * Includes:
 *   - Schema-coverage parity (every capabilities column has a FIELD_CATEGORIES
 *     entry or is explicitly skipped)
 *   - decideFieldAuthority unit tests for each category + bypass
 *   - AuthorityViolationError message shape
 */

import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import { capabilities } from "../db/schema.js";
import {
  FIELD_CATEGORIES,
  decideFieldAuthority,
  AuthorityViolationError,
  snakeToCamel,
} from "./capability-field-authority.js";

// Columns intentionally excluded from FIELD_CATEGORIES — system-managed
// PK/timestamps that are never manifest-authored or operator-tuned directly.
// Keys are the snake_case DB column names.
const SCHEMA_EXEMPT = new Set(["id", "created_at", "updated_at"]);

/** Drizzle column objects carry the real snake_case name in `.name`;
 *  use it directly rather than round-tripping through a regex. */
function dbColumnNames(table: Record<string, unknown>): string[] {
  const cols = getTableColumns(table as Parameters<typeof getTableColumns>[0]);
  return Object.values(cols).map((c) => (c as { name: string }).name);
}

describe("FIELD_CATEGORIES schema-coverage parity", () => {
  it("every capabilities column has a FIELD_CATEGORIES entry or is exempt", () => {
    const cols = dbColumnNames(capabilities);
    const missing: string[] = [];
    for (const col of cols) {
      if (SCHEMA_EXEMPT.has(col)) continue;
      if (!FIELD_CATEGORIES[col]) missing.push(col);
    }
    expect(missing, `Missing FIELD_CATEGORIES entries: ${missing.join(", ")}`).toEqual([]);
  });

  it("every FIELD_CATEGORIES key maps to a real schema column", () => {
    const cols = new Set(dbColumnNames(capabilities));
    const unknown: string[] = [];
    for (const snake of Object.keys(FIELD_CATEGORIES)) {
      if (!cols.has(snake)) unknown.push(snake);
    }
    expect(unknown, `FIELD_CATEGORIES keys with no schema column: ${unknown.join(", ")}`).toEqual([]);
  });

  it("every FIELD_CATEGORIES entry has a non-empty reason string", () => {
    for (const [field, entry] of Object.entries(FIELD_CATEGORIES)) {
      expect(entry.reason, `${field} has empty reason`).toBeTruthy();
      expect(entry.reason.length, `${field} reason too short`).toBeGreaterThan(20);
    }
  });

  it("only three category values are used: manifest | db | hybrid", () => {
    const used = new Set(Object.values(FIELD_CATEGORIES).map((e) => e.category));
    for (const c of used) {
      expect(["manifest", "db", "hybrid"]).toContain(c);
    }
  });

  it("price_cents is category=db (Gate 2 footgun regression)", () => {
    expect(FIELD_CATEGORIES.price_cents.category).toBe("db");
    expect(FIELD_CATEGORIES.price_cents.reason).toMatch(/Gate 2|lei-lookup/i);
  });
});

describe("decideFieldAuthority", () => {
  // ── manifest ─────────────────────────────────────────────────────────────

  it("manifest field with matching DB value → keep", () => {
    const d = decideFieldAuthority(
      "name",
      "Test Cap",
      { name: "Test Cap" },
    );
    expect(d.action).toBe("keep");
    if (d.action === "keep") expect(d.category).toBe("manifest");
  });

  it("manifest field with drifted DB value → violation-manifest", () => {
    const d = decideFieldAuthority(
      "name",
      "Manifest Name",
      { name: "DB Drifted Name" },
    );
    expect(d.action).toBe("violation-manifest");
    if (d.action === "violation-manifest") {
      expect(d.manifestValue).toBe("Manifest Name");
      expect(d.dbValue).toBe("DB Drifted Name");
    }
  });

  it("manifest field with undefined manifest value → keep (nothing to compare)", () => {
    const d = decideFieldAuthority("name", undefined, { name: "Existing Name" });
    expect(d.action).toBe("keep");
  });

  // ── db ───────────────────────────────────────────────────────────────────

  it("db field (price_cents) → strip-db regardless of DB value", () => {
    const d1 = decideFieldAuthority("price_cents", 10, { priceCents: 5 });
    expect(d1.action).toBe("strip-db");
    const d2 = decideFieldAuthority("price_cents", 10, { priceCents: 10 });
    expect(d2.action).toBe("strip-db");
    const d3 = decideFieldAuthority("price_cents", 10, null);
    expect(d3.action).toBe("strip-db");
  });

  // ── hybrid ───────────────────────────────────────────────────────────────

  it("hybrid field with DB null → keep-hybrid-dbnull (fill gap)", () => {
    const d = decideFieldAuthority(
      "freshness_category",
      "live-fetch",
      { freshnessCategory: null },
    );
    expect(d.action).toBe("keep-hybrid-dbnull");
  });

  it("hybrid field with DB undefined → keep-hybrid-dbnull", () => {
    const d = decideFieldAuthority(
      "freshness_category",
      "live-fetch",
      {},
    );
    expect(d.action).toBe("keep-hybrid-dbnull");
  });

  it("hybrid field with DB set → strip-hybrid-dbset (preserve operator)", () => {
    const d = decideFieldAuthority(
      "freshness_category",
      "live-fetch",
      { freshnessCategory: "reference-data" },
    );
    expect(d.action).toBe("strip-hybrid-dbset");
  });

  // ── bypass ───────────────────────────────────────────────────────────────

  it("bypassAuthority: db field is KEPT (operator reset-to-manifest)", () => {
    const d = decideFieldAuthority(
      "price_cents",
      10,
      { priceCents: 5 },
      { bypassAuthority: true },
    );
    expect(d.action).toBe("keep");
    if (d.action === "keep") expect(d.category).toBe("db");
  });

  it("bypassAuthority: hybrid field is KEPT regardless of DB state", () => {
    const d = decideFieldAuthority(
      "freshness_category",
      "live-fetch",
      { freshnessCategory: "reference-data" },
      { bypassAuthority: true },
    );
    expect(d.action).toBe("keep");
  });

  it("bypassAuthority does NOT bypass manifest-canonical drift", () => {
    // Manifest-drift is a real bug; bypass is for the operator-reset use case
    // on db/hybrid fields only.
    const d = decideFieldAuthority(
      "name",
      "Manifest Name",
      { name: "DB Drifted Name" },
      { bypassAuthority: true },
    );
    expect(d.action).toBe("violation-manifest");
  });

  // ── unknown ──────────────────────────────────────────────────────────────

  it("unknown field → unknown (caller decides; normalizer default-strips + logs)", () => {
    const d = decideFieldAuthority("made_up_field_xyz", 42, {});
    expect(d.action).toBe("unknown");
  });
});

describe("AuthorityViolationError", () => {
  it("message lists each violation with field name, values, and reason", () => {
    const err = new AuthorityViolationError([
      {
        field: "name",
        manifestValue: "Manifest",
        dbValue: "Drifted",
        reason: "Manifest is canonical; DB drifted — fix manifest or re-seed.",
      },
    ]);
    expect(err.name).toBe("AuthorityViolationError");
    expect(err.message).toContain("[name]");
    expect(err.message).toContain("manifest=\"Manifest\"");
    expect(err.message).toContain("db=\"Drifted\"");
    expect(err.message).toContain("fix");
  });
});

describe("snakeToCamel", () => {
  it("converts snake_case to camelCase", () => {
    expect(snakeToCamel("price_cents")).toBe("priceCents");
    expect(snakeToCamel("processes_personal_data")).toBe("processesPersonalData");
    expect(snakeToCamel("slug")).toBe("slug");
  });
});
