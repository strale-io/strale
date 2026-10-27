import { expect, it } from "vitest";
import { TEXT_COLUMNS } from "./manifest-publication-policy.js";
import { FIELD_CATEGORIES } from "./capability-field-authority.js";
import { manifestDrift, driftExitCode } from "./manifest-drift.js";
it("fails only on sync-writable fields; other manifest and DB/hybrid fields report", () => {
  for (const [field, authority] of Object.entries(FIELD_CATEGORIES)) {
    if (field === "slug") continue;
    const drift = manifestDrift({ [field]: "new" }, { [field]: "old" }, []);
    const synced = (TEXT_COLUMNS as readonly string[]).includes(field);
    expect(drift.writable.includes(field)).toBe(synced);
    expect(drift.nonSynced.includes(field)).toBe(!synced && authority.category === "manifest");
    expect(drift.dbOwned.includes(field)).toBe(authority.category !== "manifest");
    expect(driftExitCode(true, drift.writable.length, 0)).toBe(synced ? 1 : 0);
  }
  expect(manifestDrift({ limitations: [{ title: "New", text: "Content", category: "coverage" }] }, {}, []).writable).toEqual(["limitations"]);
});
it("JSONB key order agrees, and incomplete sweeps fail closed", () => {
  expect(manifestDrift({ output_schema: { a: 1, b: 2 } }, { output_schema: { b: 2, a: 1 } }, []).writable).toEqual([]);
  expect(driftExitCode(false, 1, 0)).toBe(0);
  expect(driftExitCode(false, 0, 1)).toBe(2);
});

it("uses both DB and manifest publication guards for strict drift", () => {
  for (const row of [{ category: "compliance" }, { gdpr_art_22_classification: "screening_signal" }, { gdprArt22Classification: "risk_synthesis" }]) {
    const drift = manifestDrift({ name: "new" }, { ...row, name: "old" }, []);
    expect(drift.reportOnly).toEqual(["name"]); expect(drift.writable).toEqual([]);
  }
});
