/**
 * Tests for the strict country resolver (`resolveCountryAlpha2`) and the
 * throwing wrapper capabilities actually call (`resolveCountryOrThrow`), used
 * to validate caller-supplied country parameters before they reach a paid
 * upstream API.
 *
 * Motivating incident: on 2026-08-09 an x402 caller sent 50 consecutive
 * `google-search` calls with `country: "墨西"` (a truncated Chinese rendering
 * of "Mexico"). The value was forwarded verbatim as Serper's `gl` parameter,
 * which silently ignores unrecognised values — so 50 paid searches ran
 * unscoped while the response echoed back the caller's bogus country, giving
 * no signal that the geo-scoping had been dropped.
 *
 * The rejection cases below are the regression: each one previously sailed
 * through to a billed API call.
 */

import { describe, it, expect } from "vitest";
import {
  ALL_ISO_IDENTIFIERS,
  COUNTRIES,
  resolveCountryAlpha2,
  resolveCountryOrThrow,
} from "./iso-3166.js";

describe("ISO tables — data invariants", () => {
  // The resolver builds one Map per identifier kind across both tables, so a
  // duplicate would silently shadow an entry rather than error. These pin the
  // uniqueness the resolver assumes.
  it("has no duplicate names, alpha-2, alpha-3, or numeric codes across both tables", () => {
    const n = ALL_ISO_IDENTIFIERS.length;
    expect(new Set(ALL_ISO_IDENTIFIERS.map((c) => c.name.toLowerCase())).size).toBe(n);
    expect(new Set(ALL_ISO_IDENTIFIERS.map((c) => c.alpha_2)).size).toBe(n);
    expect(new Set(ALL_ISO_IDENTIFIERS.map((c) => c.alpha_3)).size).toBe(n);
    expect(new Set(ALL_ISO_IDENTIFIERS.map((c) => c.numeric)).size).toBe(n);
  });

  it("covers the full ISO 3166-1 set, plus Kosovo", () => {
    // ISO 3166-1 has 249 officially assigned entries. The table also carries
    // Kosovo under XK/XKX/383 — a user-assigned code the standard does not
    // include, kept because it is what callers and upstream APIs actually use.
    const userAssigned = ALL_ISO_IDENTIFIERS.filter((c) => c.alpha_2 === "XK");
    expect(userAssigned).toHaveLength(1);
    expect(ALL_ISO_IDENTIFIERS.length - userAssigned.length).toBe(249);
  });

  it("uses well-formed identifiers throughout", () => {
    for (const c of ALL_ISO_IDENTIFIERS) {
      expect(c.alpha_2, c.name).toMatch(/^[A-Z]{2}$/);
      expect(c.alpha_3, c.name).toMatch(/^[A-Z]{3}$/);
      expect(c.numeric, c.name).toMatch(/^\d{3}$/);
    }
  });

  it("keeps the supplementary entries out of the rich lookup table", () => {
    // COUNTRIES feeds iso-country-lookup's customer-facing response. The
    // supplementary entries carry no capital/currency/language data, so
    // admitting them there would surface empty fields as if they were facts.
    const rich = new Set(COUNTRIES.map((c) => c.alpha_2));
    expect(rich.has("SL")).toBe(false);
    expect(rich.has("KY")).toBe(false);
    expect(COUNTRIES.length).toBeLessThan(ALL_ISO_IDENTIFIERS.length);
  });
});

describe("resolveCountryAlpha2 — accepts", () => {
  it("alpha-2 codes, case-insensitively, canonicalising to uppercase", () => {
    expect(resolveCountryAlpha2("MX")).toBe("MX");
    expect(resolveCountryAlpha2("mx")).toBe("MX");
    expect(resolveCountryAlpha2("  us  ")).toBe("US");
  });

  it("alpha-3 codes", () => {
    expect(resolveCountryAlpha2("MEX")).toBe("MX");
    expect(resolveCountryAlpha2("usa")).toBe("US");
    expect(resolveCountryAlpha2("SWE")).toBe("SE");
  });

  it("three-digit numeric codes, including those with a leading zero", () => {
    expect(resolveCountryAlpha2("484")).toBe("MX");
    expect(resolveCountryAlpha2("840")).toBe("US");
    expect(resolveCountryAlpha2("040")).toBe("AT");
  });

  it("countries only present in the supplementary identifier table", () => {
    // These were absent from COUNTRIES, so before the supplementary table they
    // were rejected outright — despite Google accepting them all as `gl`.
    expect(resolveCountryAlpha2("SL")).toBe("SL"); // Sierra Leone
    expect(resolveCountryAlpha2("SLE")).toBe("SL");
    expect(resolveCountryAlpha2("694")).toBe("SL");
    expect(resolveCountryAlpha2("Sierra Leone")).toBe("SL");
    expect(resolveCountryAlpha2("ky")).toBe("KY"); // Cayman Islands
    expect(resolveCountryAlpha2("CYM")).toBe("KY");
    expect(resolveCountryAlpha2("Jersey")).toBe("JE");
    expect(resolveCountryAlpha2("VG")).toBe("VG"); // British Virgin Islands
  });

  it("exact country names, case-insensitively", () => {
    expect(resolveCountryAlpha2("Mexico")).toBe("MX");
    expect(resolveCountryAlpha2("united states")).toBe("US");
  });

  it("the UK alias, which is not ISO but which Google's gl accepts", () => {
    expect(resolveCountryAlpha2("uk")).toBe("GB");
    expect(resolveCountryAlpha2("UK")).toBe("GB");
    expect(resolveCountryAlpha2("GB")).toBe("GB");
  });
});

describe("resolveCountryAlpha2 — rejects", () => {
  it("the production incident value", () => {
    expect(resolveCountryAlpha2("墨西")).toBeNull();
    expect(resolveCountryAlpha2("墨西哥")).toBeNull();
  });

  it("empty and whitespace-only input", () => {
    expect(resolveCountryAlpha2("")).toBeNull();
    expect(resolveCountryAlpha2("   ")).toBeNull();
  });

  it("plausible-looking but invalid codes", () => {
    expect(resolveCountryAlpha2("XX")).toBeNull();
    expect(resolveCountryAlpha2("ZZZ")).toBeNull();
    expect(resolveCountryAlpha2("999")).toBeNull();
  });

  it("short digit strings, which would otherwise pad into an unrelated market", () => {
    // "84" is Vietnam's dialling code; zero-padding it would resolve to 084 =
    // Belize, i.e. a paid call silently scoped to the wrong country.
    expect(resolveCountryAlpha2("84")).toBeNull();
    expect(resolveCountryAlpha2("36")).toBeNull();
    expect(resolveCountryAlpha2("1")).toBeNull();
  });

  it("partial names that would be ambiguous under substring matching", () => {
    // `searchCountries` matches these as substrings and returns several
    // entries; the resolver must refuse rather than pick one arbitrarily.
    expect(resolveCountryAlpha2("Korea")).toBeNull(); // North / South
    expect(resolveCountryAlpha2("Congo")).toBeNull(); // DRC / Republic
    expect(resolveCountryAlpha2("United")).toBeNull();
    expect(resolveCountryAlpha2("Republic")).toBeNull();
  });

  it("but still resolves a name that is exact even though it is a substring of others", () => {
    // "Guinea" is itself a country, so exact-name matching wins over the
    // Equatorial Guinea / Papua New Guinea ambiguity.
    expect(resolveCountryAlpha2("Guinea")).toBe("GN");
  });

  it("capital cities, which searchCountries matches but which are not countries", () => {
    expect(resolveCountryAlpha2("Stockholm")).toBeNull();
    expect(resolveCountryAlpha2("Mexico City")).toBeNull();
  });
});

describe("resolveCountryOrThrow", () => {
  it("returns the canonical alpha-2 for anything resolvable", () => {
    expect(resolveCountryOrThrow("mex")).toBe("MX");
    expect(resolveCountryOrThrow("Mexico")).toBe("MX");
  });

  it("returns null when nothing is supplied and no fallback is given", () => {
    expect(resolveCountryOrThrow(undefined)).toBeNull();
    expect(resolveCountryOrThrow("")).toBeNull();
    expect(resolveCountryOrThrow("   ")).toBeNull();
  });

  it("applies the fallback when nothing is supplied", () => {
    expect(resolveCountryOrThrow("", { fallback: "us" })).toBe("US");
    expect(resolveCountryOrThrow(undefined, { fallback: "se" })).toBe("SE");
  });

  it("throws on an unresolvable value even when a fallback exists", () => {
    // The fallback covers "absent", not "present but wrong" — a bad country
    // must surface as an error rather than quietly become the default market.
    expect(() => resolveCountryOrThrow("墨西", { fallback: "us" })).toThrow(
      /must be an ISO 3166-1 alpha-2 code/,
    );
  });

  it("coerces a numeric code sent as a JSON number", () => {
    // The manifests advertise numeric codes, and nothing upstream type-checks
    // inputs against input_schema — so {"country": 484} reaches the executor.
    // Discarding it would silently fall back to the default market, which is
    // the same silent-wrong-scope bug this change exists to remove.
    expect(resolveCountryOrThrow(484)).toBe("MX");
    expect(resolveCountryOrThrow(484, { fallback: "us" })).toBe("MX");
    expect(() => resolveCountryOrThrow(999)).toThrow(/must be an ISO 3166-1/);
  });

  it("treats null and undefined as absent", () => {
    expect(resolveCountryOrThrow(null)).toBeNull();
    expect(resolveCountryOrThrow(undefined)).toBeNull();
    expect(resolveCountryOrThrow(null, { fallback: "us" })).toBe("US");
  });

  it("rejects other non-string types instead of silently dropping them", () => {
    expect(() => resolveCountryOrThrow({ country: "MX" })).toThrow(/must be a string/);
    expect(() => resolveCountryOrThrow(["MX"])).toThrow(/must be a string/);
    expect(() => resolveCountryOrThrow(true)).toThrow(/must be a string/);
  });

  it("truncates an oversized value in the error rather than reflecting it whole", () => {
    const huge = "x".repeat(5000);
    try {
      resolveCountryOrThrow(huge);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message.length).toBeLessThan(400);
      expect((e as Error).message).toContain("…");
    }
  });

  it("names the offending value in the error so the caller can fix it", () => {
    expect(() => resolveCountryOrThrow("墨西")).toThrow(/墨西/);
  });
});
