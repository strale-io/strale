import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Dutch housing stock statistics via CBS OpenData.
 * Returns average sale price by region, housing inventory, and building permit data.
 * Free, no API key required.
 */

// Municipality code mapping (same as nl-woz-value)
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

registerCapability("nl-housing-stats", async (input: CapabilityInput) => {
  const city = ((input.city ?? input.gemeente ?? input.municipality) as string ?? "").trim().toLowerCase();
  const gmCode = ((input.gm_code ?? input.municipality_code) as string ?? "").trim().toUpperCase();

  if (!city && !gmCode) {
    throw new Error(
      "'city' (e.g. 'Amsterdam') or 'gm_code' (e.g. 'GM0363') is required.",
    );
  }

  const resolvedCode = gmCode || CITY_TO_GM[city];
  if (!resolvedCode) {
    throw new Error(
      `Municipality '${city}' not found. Try using the CBS municipality code (e.g. 'GM0363' for Amsterdam).`,
    );
  }

  // Fetch average sale prices by region from CBS dataset 83625NED
  const filter = encodeURIComponent(`startswith(RegioS,'${resolvedCode}')`);
  const [priceResp, stockResp] = await Promise.all([
    fetch(
      `https://opendata.cbs.nl/ODataApi/OData/83625NED/TypedDataSet?$filter=${filter}&$top=20&$format=json`,
      { signal: AbortSignal.timeout(10000) },
    ),
    fetch(
      `https://opendata.cbs.nl/ODataApi/OData/82900NED/TypedDataSet?$filter=${filter}&$top=10&$format=json`,
      { signal: AbortSignal.timeout(10000) },
    ),
  ]);

  let salePrices: Array<Record<string, unknown>> = [];
  if (priceResp.ok) {
    const data = (await priceResp.json()) as Record<string, unknown>;
    salePrices = ((data.value ?? []) as Array<Record<string, unknown>>)
      .sort((a, b) => String(b.Perioden ?? "").localeCompare(String(a.Perioden ?? "")))
      .slice(0, 5);
  }

  let housingStock: Array<Record<string, unknown>> = [];
  if (stockResp.ok) {
    const data = (await stockResp.json()) as Record<string, unknown>;
    housingStock = ((data.value ?? []) as Array<Record<string, unknown>>)
      .sort((a, b) => String(b.Perioden ?? "").localeCompare(String(a.Perioden ?? "")))
      .slice(0, 3);
  }

  if (salePrices.length === 0 && housingStock.length === 0) {
    throw new Error(`No housing data found for municipality '${resolvedCode}'.`);
  }

  // Parse sale price data
  const parseYear = (p: unknown): number => parseInt(String(p).slice(0, 4), 10);

  const priceHistory = salePrices
    .filter((r) => r.GemiddeldeVerkoopprijs_1 != null)
    .map((r) => ({
      year: parseYear(r.Perioden),
      average_sale_price_eur: Number(r.GemiddeldeVerkoopprijs_1),
      homes_sold: r.AantalVerkopen_2 != null ? Number(r.AantalVerkopen_2) : null,
    }));

  // Parse housing stock data
  const stockData = housingStock.length > 0 ? housingStock[0] : null;

  return {
    output: {
      municipality: city || resolvedCode,
      municipality_code: resolvedCode.replace(/\s+/g, "").trim(),
      sale_prices: {
        latest_year: priceHistory[0]?.year ?? null,
        average_sale_price_eur: priceHistory[0]?.average_sale_price_eur ?? null,
        homes_sold: priceHistory[0]?.homes_sold ?? null,
        history: priceHistory,
      },
      housing_stock: stockData
        ? {
            year: parseYear(stockData.Perioden),
            total_dwellings: stockData.Woningvoorraad_1 != null ? Number(stockData.Woningvoorraad_1) : null,
            owner_occupied: stockData.Koopwoningen_2 != null ? Number(stockData.Koopwoningen_2) : null,
            rental: stockData.Huurwoningen_3 != null ? Number(stockData.Huurwoningen_3) : null,
          }
        : null,
      currency: "EUR",
      data_level: "municipality",
      note: "Regional statistics from CBS / Kadaster. Sale prices are annual averages.",
    },
    provenance: { source: "opendata.cbs.nl/83625NED+82900NED", fetched_at: new Date().toISOString() },
  };
});
