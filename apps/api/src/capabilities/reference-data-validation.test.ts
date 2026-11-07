/**
 * Reference-data corrections of 2026-11-06 (docs/research/2026-11-06-reference-data-inventory.md).
 *
 * - IBAN lengths now come from one table, lib/iban-registry.ts, checked
 *   against the SWIFT IBAN Registry. iban-to-bank's copy had Andorra at 28
 *   (registry: 24), so every valid Andorran IBAN was rejected; both copies
 *   lacked ten registry countries.
 * - business-day-check treated the UAE as a Friday-Saturday weekend; the UAE
 *   moved to Saturday-Sunday on 1 January 2022, so Fridays are business days.
 *
 * Holidays are stubbed so the business-day test makes no network call.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("./holiday-calendar.js", () => ({ getHolidays: vi.fn(async () => []) }));

import { getExecutor } from "./index.js";
import { IBAN_LENGTHS, IBAN_REGISTRY_AS_OF } from "../lib/iban-registry.js";
import "./iban-validate.js";
import "./iban-to-bank.js";
import "./business-day-check.js";

const ibanValidate = getExecutor("iban-validate")!;
const ibanToBank = getExecutor("iban-to-bank")!;
const businessDay = getExecutor("business-day-check")!;

// Example IBANs as printed in the SWIFT IBAN Registry entries.
const ANDORRA = "AD1200012030200359100100"; // 24 characters
const RUSSIA = "RU0304452522540817810538091310419"; // 33 characters, added to the table

describe("IBAN registry lengths", () => {
  it("iban-validate accepts a valid Andorran IBAN", async () => {
    const { output } = await ibanValidate({ iban: ANDORRA });
    expect(output.valid).toBe(true);
    expect(output.expected_length).toBe(24);
  });

  it("iban-to-bank accepts a valid Andorran IBAN", async () => {
    const { output } = await ibanToBank({ iban: ANDORRA });
    expect(output.valid_iban).toBe(true);
    expect(output.country_code).toBe("AD");
    expect(output.error).toBeUndefined();
  });

  it("iban-validate checks the length of a registry country it used to skip", async () => {
    const { output } = await ibanValidate({ iban: RUSSIA });
    expect(output.valid).toBe(true);
    expect(output.expected_length).toBe(33);
  });

  it("iban-to-bank recognises a registry country it used to call unknown", async () => {
    const { output } = await ibanToBank({ iban: RUSSIA });
    expect(output.valid_iban).toBe(true);
    expect(output.error).toBeUndefined();
  });

  it("holds the 89 registry countries with a dated source", () => {
    expect(Object.keys(IBAN_LENGTHS)).toHaveLength(89);
    expect(IBAN_REGISTRY_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("business-day-check weekends", () => {
  it("treats a UAE Friday as a business day", async () => {
    const { output } = await businessDay({ date: "2026-11-06", country_code: "AE" });
    expect(output.is_business_day).toBe(true);
    expect(output.reason).toBeNull();
  });

  it("treats a UAE Sunday as a weekend day", async () => {
    const { output } = await businessDay({ date: "2026-11-08", country_code: "AE" });
    expect(output.is_business_day).toBe(false);
    expect(output.reason).toBe("weekend");
    expect(output.next_business_day).toBe("2026-11-09");
  });

  it("keeps Saudi Arabia on a Friday-Saturday weekend", async () => {
    const { output } = await businessDay({ date: "2026-11-06", country_code: "SA" });
    expect(output.is_business_day).toBe(false);
    expect(output.next_business_day).toBe("2026-11-08");
  });
});
