import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Dutch WOZ property tax assessment values via CBS OpenData.
 * Returns municipality-level average WOZ values and year-over-year trends.
 * Free, no API key required.
 */

// Municipality code mapping for major Dutch cities
const CITY_TO_GM: Record<string, string> = {
  amsterdam: "GM0363",
  rotterdam: "GM0599",
  "den haag": "GM0518",
  "the hague": "GM0518",
  utrecht: "GM0344",
  eindhoven: "GM0772",
  groningen: "GM0014",
  tilburg: "GM0855",
  almere: "GM0034",
  breda: "GM0758",
  nijmegen: "GM0268",
  arnhem: "GM0202",
  haarlem: "GM0392",
  enschede: "GM0153",
  apeldoorn: "GM0200",
  amersfoort: "GM0307",
  "den bosch": "GM0796",
  "'s-hertogenbosch": "GM0796",
  zaanstad: "GM0479",
  zwolle: "GM0193",
  leiden: "GM0546",
  maastricht: "GM0935",
  dordrecht: "GM0505",
  haarlemmermeer: "GM0394",
  zoetermeer: "GM0637",
  delft: "GM0503",
  deventer: "GM0150",
  leeuwarden: "GM0080",
  alkmaar: "GM0361",
  helmond: "GM0794",
};

registerCapability("nl-woz-value", async (input: CapabilityInput) => {
  const city = ((input.city ?? input.gemeente ?? input.municipality) as string ?? "").trim().toLowerCase();
  const gmCode = ((input.gm_code ?? input.municipality_code) as string ?? "").trim().toUpperCase();

  if (!city && !gmCode) {
    throw new Error(
      "'city' (e.g. 'Amsterdam') or 'gm_code' (e.g. 'GM0363') is required. Major Dutch municipalities are supported.",
    );
  }

  const resolvedCode = gmCode || CITY_TO_GM[city];
  if (!resolvedCode) {
    throw new Error(
      `Municipality '${city}' not found in lookup table. Try using the CBS municipality code (e.g. 'GM0363' for Amsterdam). See https://opendata.cbs.nl for municipality codes.`,
    );
  }

  // Fetch WOZ data from CBS dataset 85036NED
  const filter = encodeURIComponent(`startswith(RegioS,'${resolvedCode}')`);
  const resp = await fetch(
    `https://opendata.cbs.nl/ODataApi/OData/85036NED/TypedDataSet?$filter=${filter}&$top=20&$format=json`,
    { signal: AbortSignal.timeout(10000) },
  );

  if (!resp.ok) {
    throw new Error(`CBS OpenData returned HTTP ${resp.status}.`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const allRows = ((data.value ?? []) as Array<Record<string, unknown>>).filter(
    (r) => r.GemiddeldeWOZWaardeVanWoningen_1 != null,
  );
  // Sort by period descending (CBS OData may not honor $orderby)
  allRows.sort((a, b) => String(b.Perioden ?? "").localeCompare(String(a.Perioden ?? "")));
  const rows = allRows.slice(0, 10);

  if (rows.length === 0) {
    throw new Error(
      `No WOZ data found for municipality '${resolvedCode}'. The municipality code may not match a CBS region.`,
    );
  }

  // Parse year from Perioden (format: "2023JJ00")
  const parseYear = (p: unknown): number => parseInt(String(p).slice(0, 4), 10);
  const parseValue = (v: unknown): number | null => (v != null ? Number(v) * 1000 : null);

  const latest = rows[0];
  const previous = rows.length > 1 ? rows[1] : null;

  const latestValue = parseValue(latest.GemiddeldeWOZWaardeVanWoningen_1);
  const previousValue = previous ? parseValue(previous.GemiddeldeWOZWaardeVanWoningen_1) : null;

  const yearOverYear =
    latestValue != null && previousValue != null && previousValue > 0
      ? Math.round(((latestValue - previousValue) / previousValue) * 1000) / 10
      : null;

  const trend = rows.slice(0, 5).map((r) => ({
    year: parseYear(r.Perioden),
    average_woz_eur: parseValue(r.GemiddeldeWOZWaardeVanWoningen_1),
  }));

  return {
    output: {
      municipality: city || resolvedCode,
      municipality_code: resolvedCode.replace(/\s+/g, "").trim(),
      latest_year: parseYear(latest.Perioden),
      average_woz_value_eur: latestValue,
      previous_year: previous ? parseYear(previous.Perioden) : null,
      previous_woz_value_eur: previousValue,
      year_over_year_change_pct: yearOverYear,
      trend,
      currency: "EUR",
      data_level: "municipality_average",
      note: "Values are municipality-level averages from CBS. Individual property WOZ values may differ significantly.",
    },
    provenance: { source: "opendata.cbs.nl/85036NED", fetched_at: new Date().toISOString() },
  };
});
