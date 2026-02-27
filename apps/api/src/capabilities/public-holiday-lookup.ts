import { registerCapability, type CapabilityInput } from "./index.js";

// Public holiday lookup via Nager.Date API — free, no key required
// https://date.nager.at/api/v3/PublicHolidays/{year}/{countryCode}

registerCapability("public-holiday-lookup", async (input: CapabilityInput) => {
  const rawCountry =
    (input.country_code as string) ??
    (input.country as string) ??
    (input.task as string) ??
    "";
  if (typeof rawCountry !== "string" || !rawCountry.trim()) {
    throw new Error(
      "'country_code' is required. Provide a 2-letter country code (e.g. 'SE', 'DE', 'US').",
    );
  }

  // Try to extract a 2-letter country code from the input
  let countryCode = rawCountry.trim().toUpperCase();
  const codeMatch = countryCode.match(/\b([A-Z]{2})\b/);
  if (codeMatch) {
    countryCode = codeMatch[1];
  }

  const currentYear = new Date().getFullYear();
  const year =
    input.year != null
      ? typeof input.year === "number"
        ? input.year
        : parseInt(String(input.year), 10)
      : currentYear;

  if (isNaN(year) || year < 1900 || year > 2100) {
    throw new Error("'year' must be a valid year between 1900 and 2100.");
  }

  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) {
    throw new Error(
      `No public holiday data found for country '${countryCode}' and year ${year}. Verify the country code is supported by Nager.Date API.`,
    );
  }
  if (!response.ok) {
    throw new Error(`Nager.Date API returned HTTP ${response.status}`);
  }

  const data = (await response.json()) as Array<{
    date: string;
    localName: string;
    name: string;
    countryCode: string;
    fixed: boolean;
    global: boolean;
    counties: string[] | null;
    launchYear: number | null;
    types: string[];
  }>;

  // Format holidays
  const holidays = data.map((h) => ({
    date: h.date,
    name: h.name,
    local_name: h.localName,
    type: h.types?.join(", ") ?? "Public",
    fixed: h.fixed,
    global: h.global,
  }));

  // Calculate next upcoming holiday from today
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  let nextUpcoming: {
    date: string;
    name: string;
    days_until: number;
  } | null = null;

  for (const h of data) {
    if (h.date >= today) {
      const holidayDate = new Date(h.date + "T00:00:00Z");
      const todayDate = new Date(today + "T00:00:00Z");
      const diffMs = holidayDate.getTime() - todayDate.getTime();
      const daysUntil = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      nextUpcoming = {
        date: h.date,
        name: h.name,
        days_until: daysUntil,
      };
      break;
    }
  }

  return {
    output: {
      country_code: countryCode,
      year,
      holidays,
      total_holidays: holidays.length,
      next_upcoming: nextUpcoming,
    },
    provenance: {
      source: "date.nager.at",
      fetched_at: new Date().toISOString(),
    },
  };
});
