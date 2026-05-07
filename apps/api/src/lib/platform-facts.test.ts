import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  STATIC_FACTS,
  STALE_VENDORS,
  extractCountryCodes,
  getActiveVendorNames,
  getStaleVendorNames,
} from "./platform-facts.js";
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

describe("platform-facts vendor helpers (Phase B substrate)", () => {
  // Map each STATIC_FACTS.vendors category to one or more capability-slug
  // substrings that prove the vendor ships. A category passes if at least
  // one capability file matches at least one of its substrings.
  // Categories with no capability path (purely-runtime infrastructure: Stripe,
  // x402 facilitator, Browserless headless layer, log sink, embeddings/risk
  // helpers used internally) are explicitly opted out via `null`.
  const VENDOR_CATEGORY_SLUG_HINTS: Record<keyof typeof STATIC_FACTS.vendors, string[] | null> = {
    sanctions: ["sanctions-check"],
    pep: ["pep-check"],
    adverse_media_primary: ["adverse-media-check"],
    adverse_media_fallback: ["adverse-media-check"],
    embeddings: null,
    risk_narrative: ["risk-narrative-generate"],
    headless_browser: null,
    payments_card: null,
    payments_x402: null,
    log_sink: null,
    us_company_registry: ["us-company-data-cobalt", "us-company-data"],
    us_ein: ["us-ein-match"],
    ubo_supplement_global: ["gleif-l2-ubo-lookup", "gleif-l2-children-lookup"],
    fr_litigation: ["fr-bodacc-lookup"],
  };

  function listCapabilitySlugs(): string[] {
    const dir = resolve(import.meta.dirname, "../capabilities");
    return readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && f !== "index.ts" && f !== "auto-register.ts")
      .map((f) => f.replace(/\.ts$/, ""));
  }

  it("every checked STATIC_FACTS.vendors category corresponds to a shipped capability slug", () => {
    // Replaces the obsolete 'unit test asserts runtime values match'
    // claim that lived in check-platform-facts-drift.mjs's header.
    // New invariant: a vendor named in the canonical map must have shipped
    // a capability slug. Catches the 'vendor listed without integration'
    // mode (the OpenOwnership / OpenSanctions failure shape).
    const slugs = new Set(listCapabilitySlugs());
    const missing: string[] = [];
    for (const [category, hints] of Object.entries(VENDOR_CATEGORY_SLUG_HINTS) as Array<
      [keyof typeof STATIC_FACTS.vendors, string[] | null]
    >) {
      if (hints === null) continue;
      const matched = hints.some((h) => slugs.has(h));
      if (!matched) {
        missing.push(`${category} (no capability matched any of: ${hints.join(", ")})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("getActiveVendorNames() and getStaleVendorNames() are disjoint", () => {
    // A vendor cannot be both active and stale. Catches the failure mode
    // where a vendor switch leaves the old name in both lists.
    const active = getActiveVendorNames();
    const stale = getStaleVendorNames();
    const overlap = [...active].filter((n) => stale.has(n));
    expect(overlap).toEqual([]);
  });

  it("getActiveVendorNames() is non-empty", () => {
    expect(getActiveVendorNames().size).toBeGreaterThan(0);
  });

  it("getStaleVendorNames() is non-empty", () => {
    expect(getStaleVendorNames().size).toBeGreaterThan(0);
  });

  it("STALE_VENDORS contains the historical superseded vendors", () => {
    // Pin a known-stale subset so a careless edit can't empty the list.
    const stale = getStaleVendorNames();
    for (const name of ["OpenSanctions self-host", "SurePay", "OpenOwnership"]) {
      expect(stale.has(name)).toBe(true);
    }
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
