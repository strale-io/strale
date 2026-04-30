import { describe, it, expect } from "vitest";
import { STATIC_FACTS, extractCountryCodes } from "./platform-facts.js";
import { TRANSACTION_RETENTION_DAYS } from "./data-retention.js";

describe("platform-facts STATIC_FACTS", () => {
  it("retention_days_default mirrors TRANSACTION_RETENTION_DAYS", () => {
    // Critical invariant: if these drift, the Privacy/AuditRecord pages
    // will display a number that doesn't match what the retention sweep
    // actually does. The cert audit found this at exactly 36x off.
    expect(STATIC_FACTS.retention_days_default).toBe(TRANSACTION_RETENTION_DAYS);
  });

  it("retention_days_max_configurable is at least retention_days_default", () => {
    expect(STATIC_FACTS.retention_days_max_configurable).toBeGreaterThanOrEqual(
      STATIC_FACTS.retention_days_default,
    );
  });

  it("vendors map names every category we make compliance claims about", () => {
    // If you remove a category from this list, also delete its mention
    // from the marketing surfaces. The check-platform-facts-drift cron
    // will fail until you do.
    expect(STATIC_FACTS.vendors).toMatchObject({
      sanctions: expect.any(String),
      pep: expect.any(String),
      adverse_media_primary: expect.any(String),
      adverse_media_fallback: expect.any(String),
      embeddings: expect.any(String),
      risk_narrative: expect.any(String),
      headless_browser: expect.any(String),
      payments_card: expect.any(String),
      payments_x402: expect.any(String),
      log_sink: expect.any(String),
    });
  });

  it("sanctions and pep vendor are Dilisense (DEC-20260429-A)", () => {
    // OpenSanctions was dropped 2026-04-27; if a future change reverts
    // this, the methodology page lints will silently re-validate the
    // pre-2026-04-27 copy. Pin the expected vendor here so any switch
    // is intentional.
    expect(STATIC_FACTS.vendors.sanctions).toBe("Dilisense");
    expect(STATIC_FACTS.vendors.pep).toBe("Dilisense");
  });

  it("tos_version_current matches the routes/auth.ts CURRENT_TOS_VERSION shape", () => {
    // YYYY-MM-DD, so it sorts and is unambiguous. Bump in lockstep
    // with the Terms page LAST_UPDATED.
    expect(STATIC_FACTS.tos_version_current).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("extractCountryCodes", () => {
  it("pulls 2-letter prefixes from {cc}-company-data slugs", () => {
    expect(
      extractCountryCodes(["us-company-data", "uk-company-data", "de-company-data"]),
    ).toEqual(["de", "uk", "us"]);
  });

  it("dedupes and sorts", () => {
    expect(
      extractCountryCodes(["us-company-data", "us-company-data", "fr-company-data"]),
    ).toEqual(["fr", "us"]);
  });

  it("ignores non-matching slugs", () => {
    expect(
      extractCountryCodes(["sanctions-check", "us-company-data", "foo"]),
    ).toEqual(["us"]);
  });

  it("includes longer prefixes (e.g. swedish-company-data)", () => {
    // Decision: keep prose names too. The frontend can map them to
    // ISO codes if it wants; UI shouldn't lie about coverage just
    // because the backend slug isn't ISO.
    expect(extractCountryCodes(["swedish-company-data"])).toEqual(["swedish"]);
  });

  it("empty input → empty output", () => {
    expect(extractCountryCodes([])).toEqual([]);
  });
});
