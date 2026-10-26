import { describe, expect, it } from "vitest";
import { COMPANY_STATUSES, STATUS_MAP_ROWS, mappedSlugs, normaliseStatus } from "./normalise.js";

describe("normaliseStatus: one test per mapping row", () => {
  it.each(STATUS_MAP_ROWS.map((r) => [r.slug, r.raw, r.status] as const))("%s: %j -> %s", (slug, raw, status) => {
    const out = normaliseStatus(slug, raw);
    expect(out).toEqual({ status, registry_status_raw: raw, mapped: true });
  });

  it("every row cites a source and maps into the enum", () => {
    for (const r of STATUS_MAP_ROWS) {
      expect(r.source.length, `${r.slug}/${r.raw}`).toBeGreaterThan(10);
      expect(COMPANY_STATUSES).toContain(r.status);
    }
  });

  it("has no duplicate (slug, raw) rows after normalisation", () => {
    const keys = STATUS_MAP_ROWS.map((r) => `${r.slug}|${r.raw.trim().toLowerCase()}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("normaliseStatus: unmapped values", () => {
  it.each(mappedSlugs())("%s: an unmapped value is unknown and passes the raw value through", (slug) => {
    const out = normaliseStatus(slug, "Some Value The Registry Added Later");
    expect(out).toEqual({ status: "unknown", registry_status_raw: "Some Value The Registry Added Later", mapped: false });
  });

  it("a slug with no rows maps nothing, even to a value another registry maps", () => {
    expect(normaliseStatus("us-company-data", "active")).toMatchObject({ status: "unknown", mapped: false });
  });

  it("a value mapped for one registry is not mapped for another", () => {
    expect(normaliseStatus("swedish-company-data", "Normal").status).toBe("unknown");
    expect(normaliseStatus("irish-company-data", "Normal").status).toBe("active");
  });

  it.each([undefined, null, "", "   ", 7, {}])("a missing or non-string value (%j) is unknown with no raw value", (v) => {
    expect(normaliseStatus("swedish-company-data", v)).toEqual({ status: "unknown", registry_status_raw: null, mapped: false });
  });

  it("matching ignores case and surrounding whitespace (CRO returns 'Normal ' with a trailing space)", () => {
    expect(normaliseStatus("irish-company-data", "  NORMAL ").status).toBe("active");
  });

  it("values the Irish executor passes through but we deliberately do not map stay unknown", () => {
    for (const raw of ["Strike Off Listed", "Deleted CB Merger", "De-Registered ICAV", "Conv. to IndProvSoc"]) {
      expect(normaliseStatus("irish-company-data", raw)).toMatchObject({ status: "unknown", mapped: false });
    }
  });
});
