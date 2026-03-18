import { registerCapability, type CapabilityInput } from "./index.js";
import { getHolidays } from "./holiday-calendar.js";

// Countries that observe Fri-Sat weekend
const FRI_SAT_WEEKEND = new Set(["AF", "DZ", "BH", "BD", "EG", "IQ", "JO", "KW", "LY", "MV", "OM", "QA", "SA", "SD", "SY", "AE", "YE"]);
// Countries that observe Fri-Sun weekend (some)
const FRI_ONLY_OFF = new Set(["IR"]);

function isWeekend(date: Date, countryCode: string): boolean {
  const day = date.getDay(); // 0=Sun, 6=Sat
  if (FRI_SAT_WEEKEND.has(countryCode)) return day === 5 || day === 6;
  if (FRI_ONLY_OFF.has(countryCode)) return day === 5;
  return day === 0 || day === 6; // Standard Sat-Sun
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

registerCapability("business-day-check", async (input: CapabilityInput) => {
  const dateStr = ((input.date as string) ?? (input.task as string) ?? "").trim();
  if (!dateStr) {
    throw new Error("'date' is required (YYYY-MM-DD format).");
  }

  const countryCode = ((input.country_code as string) ?? (input.country as string) ?? "").trim().toUpperCase();
  if (!countryCode || countryCode.length !== 2) {
    throw new Error("'country_code' is required (ISO 2-letter code).");
  }

  const date = new Date(dateStr + "T00:00:00Z");
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date format. Use YYYY-MM-DD.");
  }

  const year = date.getFullYear();

  // Fetch holidays for this country+year
  let holidays: any[] = [];
  try {
    holidays = await getHolidays(countryCode, year);
  } catch {
    // If holiday API fails, still check weekends
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
