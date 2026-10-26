/**
 * auto-register loads each manifest's data_access block at startup, so that
 * getExecutor can stamp it onto provenance (DEC-20261023-A). Without this
 * wiring the manifest blocks would be dead data.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDataAccess } from "../lib/data-access.js";

beforeAll(async () => {
  process.env.AUDIT_HMAC_SECRET ??= "unit-test-audit-secret-plenty-of-entropy-0123456789";
  process.env.ADMIN_SECRET ??= "unit-test-admin-secret-plenty-of-entropy-0123456789";
  const { autoRegisterCapabilities } = await import("./auto-register.js");
  await autoRegisterCapabilities();
});

describe("auto-register loads manifest data_access", () => {
  it("registers the declaration for a vendor-backed capability", () => {
    expect(getDataAccess("google-search")).toMatchObject({
      lane: "allowed_with_checks",
      acquisition_method: "vendor_api",
      upstream_vendor: "serper",
      checks: "pending",
    });
  });

  it("registers official-source and computed declarations", () => {
    expect(getDataAccess("uk-company-data")).toEqual({ lane: "preferred", acquisition_method: "direct_api" });
    expect(getDataAccess("json-repair")).toEqual({ lane: "not_applicable", acquisition_method: "computed" });
  });

  it("has no declaration for a deactivated capability (its manifest carries none)", () => {
    expect(getDataAccess("annual-report-extract")).toBeUndefined();
  });
});
