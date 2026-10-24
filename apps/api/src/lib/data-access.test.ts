import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ACQUISITION_METHODS,
  DATA_ACCESS_LANES,
  parseDataAccess,
  stampDataAccess,
  registerDataAccess,
  __resetDataAccessForTests,
} from "./data-access.js";
import { validateProvenanceAtBoundary } from "./provenance-builder.js";
import { registerCapability, getExecutor } from "../capabilities/index.js";

describe("parseDataAccess (DEC-20261023-A manifest block)", () => {
  it("accepts a valid block, with and without a vendor", () => {
    expect(parseDataAccess({ lane: "preferred", acquisition_method: "direct_api" })).toEqual({
      ok: true,
      value: { lane: "preferred", acquisition_method: "direct_api" },
    });
    expect(
      parseDataAccess({ lane: "allowed_with_checks", acquisition_method: "vendor_api", upstream_vendor: "serper" }),
    ).toEqual({
      ok: true,
      value: { lane: "allowed_with_checks", acquisition_method: "vendor_api", upstream_vendor: "serper" },
    });
  });

  it("refuses an unknown lane, an unknown method and an unknown key", () => {
    const r = parseDataAccess({ lane: "never", acquisition_method: "scraping", vendor: "x" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join("\n")).toMatch(/lane must be one of/);
    expect(r.errors.join("\n")).toMatch(/acquisition_method must be one of/);
    expect(r.errors.join("\n")).toMatch(/data_access\.vendor is not a known field/);
  });

  it("ties not_applicable to computed, both ways, and refuses a vendor on computed", () => {
    expect(parseDataAccess({ lane: "not_applicable", acquisition_method: "direct_api" }).ok).toBe(false);
    expect(parseDataAccess({ lane: "preferred", acquisition_method: "computed" }).ok).toBe(false);
    expect(
      parseDataAccess({ lane: "not_applicable", acquisition_method: "computed", upstream_vendor: "anthropic" }).ok,
    ).toBe(false);
    expect(parseDataAccess({ lane: "not_applicable", acquisition_method: "computed" }).ok).toBe(true);
  });

  it("refuses a non-mapping and an empty vendor", () => {
    expect(parseDataAccess("preferred").ok).toBe(false);
    expect(parseDataAccess(null).ok).toBe(false);
    expect(parseDataAccess({ lane: "preferred", acquisition_method: "direct_api", upstream_vendor: "" }).ok).toBe(false);
  });
});

describe("stampDataAccess", () => {
  const vendorDefault = { lane: "allowed_with_checks", acquisition_method: "vendor_api", upstream_vendor: "serper" } as const;

  it("fills method, lane and vendor when the executor set none", () => {
    expect(stampDataAccess({ source: "google-serper", fetched_at: "t" }, vendorDefault)).toEqual({
      source: "google-serper",
      fetched_at: "t",
      acquisition_method: "vendor_api",
      data_access_lane: "allowed_with_checks",
      upstream_vendor: "serper",
    });
  });

  it("never overwrites the executor's values", () => {
    const p = { source: "dilisense.com", fetched_at: "t", acquisition_method: "vendor_api", upstream_vendor: "dilisense" };
    expect(stampDataAccess(p, vendorDefault)).toEqual({ ...p, data_access_lane: "allowed_with_checks" });
  });

  it("does not hand the manifest's vendor to a call the executor labelled with another method", () => {
    const p = { source: "commoncrawl.org", fetched_at: "t", acquisition_method: "primary_source" };
    expect(stampDataAccess(p, vendorDefault)).not.toHaveProperty("upstream_vendor");
  });

  it("leaves provenance unchanged without a declaration", () => {
    const p = { source: "x", fetched_at: "t" };
    expect(stampDataAccess(p, undefined)).toBe(p);
  });
});

describe("provenance schema accepts every declared value", () => {
  it.each(ACQUISITION_METHODS.flatMap((m) => DATA_ACCESS_LANES.map((l) => [m, l] as const)))(
    "%s / %s passes validateProvenanceAtBoundary without a shape warning",
    (method, lane) => {
      const r = validateProvenanceAtBoundary(
        { source: "s", fetched_at: new Date().toISOString(), acquisition_method: method, data_access_lane: lane, upstream_vendor: "v", primary_source_reference: "r" },
        { slug: `data-access-test-${method}-${lane}`, dataSourceType: "api" },
      );
      expect(r.ok).toBe(true);
    },
  );
});

describe("getExecutor stamps the manifest's data_access onto provenance", () => {
  beforeEach(() => __resetDataAccessForTests());
  afterEach(() => __resetDataAccessForTests());

  it("stamps a registered declaration and keeps the executor's own values", async () => {
    registerCapability("data-access-stamp-test", async () => ({
      output: { ok: true },
      provenance: { source: "google-serper", fetched_at: "t" },
    }));
    registerDataAccess("data-access-stamp-test", {
      lane: "allowed_with_checks",
      acquisition_method: "vendor_api",
      upstream_vendor: "serper",
    });
    const result = await getExecutor("data-access-stamp-test")!({});
    expect(result.output).toEqual({ ok: true });
    expect(result.provenance).toMatchObject({
      acquisition_method: "vendor_api",
      data_access_lane: "allowed_with_checks",
      upstream_vendor: "serper",
    });
  });

  it("returns the plain executor when nothing is declared", async () => {
    registerCapability("data-access-unstamped-test", async () => ({
      output: {},
      provenance: { source: "s", fetched_at: "t" },
    }));
    const result = await getExecutor("data-access-unstamped-test")!({});
    expect(result.provenance).toEqual({ source: "s", fetched_at: "t" });
  });
});
