import { inputRefusal } from "../lib/capability-refusal.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { getHolidays } from "./holiday-calendar.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";

// Weekend days per country. Every country not listed here is treated as a
// Saturday-Sunday weekend. Checked on 2026-11-06; update when a country
// changes its working week and move this date. Public holidays are not held
// here: they come live from Nager.Date (holiday-calendar.ts).
export const WEEKEND_TABLE_AS_OF = "2026-11-06";

// Countries with a Friday-Saturday weekend, each with the source it was
// checked against. A row confirmed only by general press coverage, or not at
// all, is marked unverified; its value is kept, not guessed at.
export const FRI_SAT_WEEKEND: ReadonlySet<string> = new Set([
  "AF", // unverified as of 2026-11-06: reports conflict (Fri-Sat vs Thu-Fri); no official source found
  "DZ", // 2009 government decree moving the weekend to Fri-Sat, as reported by Gulf News (gulfnews.com/world/mena/algeria-government-issues-decree-shifting-weekend-days-1.502315); decree text not reached
  "BH", // Central Bank of Bahrain contact page: working hours Sunday to Thursday (cbb.gov.bh/?p=1105, read through a search index; direct fetch refused)
  "BD", // Bangladesh Bank schedules: weekly holiday Friday and Saturday, as reported by Prothom Alo and The Financial Express (2023-2026)
  "EG", // unverified as of 2026-11-06 against an official source; press: The National, "When is the weekend in the Arab world", 2021-12-07
  "IQ", // unverified as of 2026-11-06 against an official source; press: The National, 2021-12-07
  "JO", // unverified as of 2026-11-06 against an official source; press: The National, 2021-12-07
  "KW", // Central Bank of Kuwait notice of 2025-02-16: closed Tue-Thu 25-27 Feb, resumes Sunday 2 March (cbk.gov.kw)
  "LY", // unverified as of 2026-11-06 against an official source; press: The National, 2021-12-07
  "MV", // unverified as of 2026-11-06 against an official source; press reports Fri-Sat (Maldives Immigration Saturday-service notice)
  "OM", // Council of Ministers statement: Fri-Sat from 1 May 2013 for public and private sectors, as reported by Gulf News (2013)
  "QA", // Qatar Central Bank: Thursday 1 January 2026 a holiday, work resumes Sunday, as reported by The Peninsula (2025-12-29)
  "SA", // SAMA Rulebook, Working Hours of Banks' Remittance Centers: business days Sunday to Thursday, Friday off, Saturday optional (rulebook.sama.gov.sa)
  "SD", // unverified as of 2026-11-06: no official or press source found
  "SY", // unverified as of 2026-11-06: no official or press source found
  "YE", // unverified as of 2026-11-06: no official or press source found
]);
// The United Arab Emirates (AE) moved from Fri-Sat to Sat-Sun on 1 January
// 2022: UAE Government Media Office announcement of 2021-12-07, reported by
// The National (thenationalnews.com/uae/government/2021/12/07/breaking-uae-makes-major-changes-to-working-week).
// The federal government works a half day on Friday, so Friday is a business day.

// Countries with a Friday-only weekend.
export const FRI_ONLY_OFF: ReadonlySet<string> = new Set([
  "IR", // unverified as of 2026-11-06: Friday-only for government; a 2024 Fri-Sat bill was rejected by the Guardian Council and a 2025 Thu-Fri bill's status is unknown
]);

function isWeekend(date: Date, countryCode: string): boolean {
  const day = date.getUTCDay(); // 0=Sun, 6=Sat; UTC, because dates are parsed as UTC midnight
  if (FRI_SAT_WEEKEND.has(countryCode)) return day === 5 || day === 6;
  if (FRI_ONLY_OFF.has(countryCode)) return day === 5;
  return day === 0 || day === 6; // Standard Sat-Sun
}

const NAGER = "Nager.Date public-holiday API";

/**
 * The two answers `getHolidays` gives for a country it has no calendar for:
 * a 404 (not a code it recognises) and a 204 (recognised, no data). They are
 * matched by their wording in holiday-calendar.ts, and only those two: a
 * wording change there makes this false, so the call throws (unbilled) rather
 * than answering without holidays. The business-day tests pin both wordings.
 */
function isUncoveredCountry(err: unknown): boolean {
  const message = err instanceof Error ? err.message : "";
  return /^Country '[A-Z0-9]{2}' (not supported by Nager\.Date API|is not covered by the Nager\.Date holiday data source)/.test(message);
}

/**
 * Nager.Date answers HTTP 400 for a year outside the range it holds (it held
 * 1976 to 2079 when checked live on 2026-11-11; 1975 and 2080 both drew 400).
 * That is a fact about the caller's date, not an outage: a refusal, unbilled
 * and not counted against the capability.
 */
function isYearOutOfRange(err: unknown): boolean {
  return /^Nager\.Date API error: HTTP 400$/.test(err instanceof Error ? err.message : "");
}

/**
 * Nager.Date gave no answer: 429 or 5xx, a timeout, a network error or a body
 * that does not parse. An error that is none of these (our own code breaking)
 * is returned unchanged, so a defect is never relabelled as the provider's.
 */
function holidayFailure(err: unknown): Error {
  const name = err instanceof Error ? err.name : "";
  const message = err instanceof Error ? err.message : String(err);
  if (name === "TimeoutError" || name === "AbortError") {
    return new UpstreamUnavailableError(NAGER, "timeout; retry shortly.", { code: "timeout", cause: err });
  }
  if (err instanceof TypeError && (message === "fetch failed" || message === "terminated")) {
    const cause = (err as { cause?: { code?: unknown } }).cause;
    const code = typeof cause?.code === "string" ? cause.code : null;
    return new UpstreamUnavailableError(NAGER, `network error${code ? ` (${code})` : ""}; retry shortly.`, { code, cause: err });
  }
  const status = /^Nager\.Date API error: HTTP (\d{3})$/.exec(message)?.[1];
  if (status) {
    const code = Number(status);
    return new UpstreamUnavailableError(NAGER, `HTTP ${status}${code === 429 || code >= 500 ? "; retry shortly." : "."}`, {
      code: `HTTP ${status}`,
      retryable: code === 429 || code >= 500,
      cause: err,
    });
  }
  if (message.startsWith("Nager.Date API returned an unparseable response")) {
    return new UpstreamUnavailableError(NAGER, "the response did not parse.", { code: "unparseable", cause: err });
  }
  return err instanceof Error ? err : new Error(message);
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setUTCDate(result.getUTCDate() + n);
  return result;
}

registerCapability("business-day-check", async (input: CapabilityInput) => {
  const dateStr = ((input.date as string) ?? (input.task as string) ?? "").trim();
  if (!dateStr) {
    throw inputRefusal("'date' is required (YYYY-MM-DD format).", "date", "Send 'date' as a date in YYYY-MM-DD format.");
  }

  const countryCode = ((input.country_code as string) ?? (input.country as string) ?? "").trim().toUpperCase();
  if (!countryCode || countryCode.length !== 2) {
    throw inputRefusal("'country_code' is required (ISO 2-letter code).", "country_code", "Send 'country_code' as a 2-letter ISO country code such as SE.");
  }

  const date = new Date(dateStr + "T00:00:00Z");
  if (isNaN(date.getTime())) {
    throw inputRefusal("Invalid date format. Use YYYY-MM-DD.", "date", "Send 'date' as a valid calendar date in YYYY-MM-DD format.");
  }

  const year = date.getUTCFullYear();

  // Fetch holidays for this country+year
  let holidays: any[] = [];
  try {
    holidays = await getHolidays(countryCode, year);
  } catch (err) {
    // degraded-ok: only Nager.Date's own no-calendar answers (404 and 204) fall through to a weekends-only result, its long-standing output for those countries; every other failure throws.
    // A country Nager.Date does not hold is a real answer from it: there is no
    // holiday calendar to apply, so only weekends are checked, as before. Any
    // other failure used to land here too and answer `is_business_day: true`
    // on a public holiday, billed (2026-11-06 swallowed-failures audit, row 17).
    if (isYearOutOfRange(err)) {
      throw inputRefusal(
        `'date' must be in a year the Nager.Date holiday calendar covers (1976 to 2079); ${year} is outside that range.`,
        "date",
        "Send 'date' as a YYYY-MM-DD date in a year from 1976 to 2079.",
      );
    }
    if (!isUncoveredCountry(err)) throw holidayFailure(err);
  }
  // A 200 whose body parses but is not a holiday list is no answer either:
  // without this it surfaced as a TypeError from `.map` below.
  if (!Array.isArray(holidays)) {
    throw new UpstreamUnavailableError(NAGER, "the response was not a holiday list.", { code: "unparseable" });
  }

  const holidayDates = new Set(holidays.map((h: any) => h.date));

  const dateKey = formatDate(date);
  const weekend = isWeekend(date, countryCode);
  const isHoliday = holidayDates.has(dateKey);
  const isBusinessDay = !weekend && !isHoliday;

  let reason: string | null = null;
  if (weekend) reason = "weekend";
  else if (isHoliday) {
    const holiday = holidays.find((h: any) => h.date === dateKey);
    reason = `public_holiday: ${holiday?.name ?? holiday?.localName ?? "Unknown"}`;
  }

  // Find next business day
  let next = addDays(date, 1);
  for (let i = 0; i < 14; i++) {
    if (!isWeekend(next, countryCode) && !holidayDates.has(formatDate(next))) break;
    next = addDays(next, 1);
  }

  // Find previous business day
  let prev = addDays(date, -1);
  for (let i = 0; i < 14; i++) {
    if (!isWeekend(prev, countryCode) && !holidayDates.has(formatDate(prev))) break;
    prev = addDays(prev, -1);
  }

  return {
    output: {
      date: dateKey,
      country_code: countryCode,
      is_business_day: isBusinessDay,
      reason,
      next_business_day: formatDate(next),
      previous_business_day: formatDate(prev),
    },
    provenance: { source: "strale-calendar+nager.date", fetched_at: new Date().toISOString() },
  };
});
