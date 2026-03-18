import { registerCapability, type CapabilityInput } from "./index.js";

// Country code → primary IANA timezone
const COUNTRY_TIMEZONES: Record<string, string> = {
  AF: "Asia/Kabul", AL: "Europe/Tirane", DZ: "Africa/Algiers", AR: "America/Buenos_Aires",
  AM: "Asia/Yerevan", AU: "Australia/Sydney", AT: "Europe/Vienna", AZ: "Asia/Baku",
  BH: "Asia/Bahrain", BD: "Asia/Dhaka", BY: "Europe/Minsk", BE: "Europe/Brussels",
  BR: "America/Sao_Paulo", BG: "Europe/Sofia", CA: "America/Toronto", CL: "America/Santiago",
  CN: "Asia/Shanghai", CO: "America/Bogota", HR: "Europe/Zagreb", CY: "Asia/Nicosia",
  CZ: "Europe/Prague", DK: "Europe/Copenhagen", EG: "Africa/Cairo", EE: "Europe/Tallinn",
  ET: "Africa/Addis_Ababa", FI: "Europe/Helsinki", FR: "Europe/Paris", GE: "Asia/Tbilisi",
  DE: "Europe/Berlin", GR: "Europe/Athens", HK: "Asia/Hong_Kong", HU: "Europe/Budapest",
  IS: "Atlantic/Reykjavik", IN: "Asia/Kolkata", ID: "Asia/Jakarta", IR: "Asia/Tehran",
  IQ: "Asia/Baghdad", IE: "Europe/Dublin", IL: "Asia/Jerusalem", IT: "Europe/Rome",
  JP: "Asia/Tokyo", JO: "Asia/Amman", KZ: "Asia/Almaty", KE: "Africa/Nairobi",
  KR: "Asia/Seoul", KW: "Asia/Kuwait", LV: "Europe/Riga", LB: "Asia/Beirut",
  LT: "Europe/Vilnius", LU: "Europe/Luxembourg", MY: "Asia/Kuala_Lumpur", MX: "America/Mexico_City",
  MA: "Africa/Casablanca", NL: "Europe/Amsterdam", NZ: "Pacific/Auckland", NG: "Africa/Lagos",
  NO: "Europe/Oslo", PK: "Asia/Karachi", PE: "America/Lima", PH: "Asia/Manila",
  PL: "Europe/Warsaw", PT: "Europe/Lisbon", QA: "Asia/Qatar", RO: "Europe/Bucharest",
  RU: "Europe/Moscow", SA: "Asia/Riyadh", SG: "Asia/Singapore", SK: "Europe/Bratislava",
  SI: "Europe/Ljubljana", ZA: "Africa/Johannesburg", ES: "Europe/Madrid", SE: "Europe/Stockholm",
  CH: "Europe/Zurich", TW: "Asia/Taipei", TH: "Asia/Bangkok", TR: "Europe/Istanbul",
  UA: "Europe/Kyiv", AE: "Asia/Dubai", GB: "Europe/London", US: "America/New_York",
  VN: "Asia/Ho_Chi_Minh",
};

// Major city → IANA timezone
const CITY_TIMEZONES: Record<string, string> = {
  "new york": "America/New_York", "los angeles": "America/Los_Angeles",
  "chicago": "America/Chicago", "denver": "America/Denver",
  "san francisco": "America/Los_Angeles", "seattle": "America/Los_Angeles",
  "miami": "America/New_York", "houston": "America/Chicago",
  "london": "Europe/London", "paris": "Europe/Paris", "berlin": "Europe/Berlin",
  "madrid": "Europe/Madrid", "rome": "Europe/Rome", "amsterdam": "Europe/Amsterdam",
  "brussels": "Europe/Brussels", "vienna": "Europe/Vienna", "zurich": "Europe/Zurich",
  "stockholm": "Europe/Stockholm", "oslo": "Europe/Oslo", "copenhagen": "Europe/Copenhagen",
  "helsinki": "Europe/Helsinki", "dublin": "Europe/Dublin", "lisbon": "Europe/Lisbon",
  "prague": "Europe/Prague", "warsaw": "Europe/Warsaw", "budapest": "Europe/Budapest",
  "bucharest": "Europe/Bucharest", "athens": "Europe/Athens", "istanbul": "Europe/Istanbul",
  "moscow": "Europe/Moscow", "kyiv": "Europe/Kyiv",
  "tokyo": "Asia/Tokyo", "seoul": "Asia/Seoul", "beijing": "Asia/Shanghai",
  "shanghai": "Asia/Shanghai", "hong kong": "Asia/Hong_Kong", "singapore": "Asia/Singapore",
  "mumbai": "Asia/Kolkata", "delhi": "Asia/Kolkata", "bangalore": "Asia/Kolkata",
  "dubai": "Asia/Dubai", "sydney": "Australia/Sydney", "melbourne": "Australia/Melbourne",
  "auckland": "Pacific/Auckland", "toronto": "America/Toronto", "vancouver": "America/Vancouver",
  "sao paulo": "America/Sao_Paulo", "mexico city": "America/Mexico_City",
  "cairo": "Africa/Cairo", "lagos": "Africa/Lagos", "nairobi": "Africa/Nairobi",
  "cape town": "Africa/Johannesburg", "johannesburg": "Africa/Johannesburg",
  "bangkok": "Asia/Bangkok", "jakarta": "Asia/Jakarta", "taipei": "Asia/Taipei",
  "kuala lumpur": "Asia/Kuala_Lumpur", "manila": "Asia/Manila",
};

registerCapability("timezone-lookup", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.task as string) ?? "").trim();
  if (!query) {
    throw new Error("'query' is required. Provide a country code, city name, or coordinates.");
  }

  let timezone: string | null = null;

  // Try country code first (2-letter uppercase)
  const upper = query.toUpperCase();
  if (upper.length === 2 && COUNTRY_TIMEZONES[upper]) {
    timezone = COUNTRY_TIMEZONES[upper];
  }

  // Try city name
  if (!timezone) {
    const lower = query.toLowerCase();
    timezone = CITY_TIMEZONES[lower] ?? null;
  }

  // Try partial city match
  if (!timezone) {
    const lower = query.toLowerCase();
    const match = Object.entries(CITY_TIMEZONES).find(([city]) => city.includes(lower) || lower.includes(city));
    if (match) timezone = match[1];
  }

  // Try country name to code mapping
  if (!timezone) {
    const lower = query.toLowerCase();
    const countryEntry = Object.entries(COUNTRY_TIMEZONES).find(([code]) => {
      try {
        const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
        return name?.toLowerCase() === lower;
      } catch { return false; }
    });
    if (countryEntry) timezone = countryEntry[1];
  }

  if (!timezone) {
    return {
      output: {
        query,
        found: false,
        timezone: null,
        error: "Could not resolve timezone. Try a 2-letter country code (e.g. 'SE'), a major city name (e.g. 'Stockholm'), or coordinates.",
      },
      provenance: { source: "strale-timezone-data", fetched_at: new Date().toISOString() },
    };
  }

  // Get current time info for this timezone
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZoneName: "short",
  });
  const localTime = formatter.format(now);
  const parts = formatter.formatToParts(now);
  const tzAbbr = parts.find((p) => p.type === "timeZoneName")?.value ?? null;

  // Calculate UTC offset
  const utcFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
  const localHourFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false });
  const utcTime = utcFormatter.format(now);
  const localHourTime = localHourFormatter.format(now);

  const [utcH, utcM] = utcTime.split(":").map(Number);
  const [localH, localM] = localHourTime.split(":").map(Number);
  let offsetMinutes = (localH * 60 + localM) - (utcH * 60 + utcM);
  if (offsetMinutes > 720) offsetMinutes -= 1440;
  if (offsetMinutes < -720) offsetMinutes += 1440;

  const offsetHours = offsetMinutes / 60;
  const sign = offsetHours >= 0 ? "+" : "";
  const utcOffset = `UTC${sign}${offsetHours % 1 === 0 ? offsetHours : offsetHours.toFixed(1)}`;

  // DST detection: compare January offset vs current
  const jan = new Date(now.getFullYear(), 0, 1);
  const janFormatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: false });
  const janUtcFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: false });
  const [janLocalH, janLocalM] = janFormatter.format(jan).split(":").map(Number);
  const [janUtcH, janUtcM] = janUtcFormatter.format(jan).split(":").map(Number);
  let janOffset = (janLocalH * 60 + janLocalM) - (janUtcH * 60 + janUtcM);
  if (janOffset > 720) janOffset -= 1440;
  if (janOffset < -720) janOffset += 1440;
  const isDst = offsetMinutes !== janOffset;

  return {
    output: {
      query,
      timezone,
      utc_offset: utcOffset,
      utc_offset_hours: offsetHours,
      is_dst: isDst,
      current_local_time: localTime,
      abbreviation: tzAbbr,
      country_code: Object.entries(COUNTRY_TIMEZONES).find(([, tz]) => tz === timezone)?.[0] ?? null,
    },
    provenance: { source: "strale-timezone-data", fetched_at: new Date().toISOString() },
  };
});
