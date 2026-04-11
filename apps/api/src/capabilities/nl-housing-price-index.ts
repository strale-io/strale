import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Dutch housing price index and average sale prices via CBS OpenData.
 * Returns national price index, average sale price, year-over-year trends.
 * Free, no API key required.
 */

registerCapability("nl-housing-price-index", async (input: CapabilityInput) => {
  const year = input.year ? Number(input.year) : null;
  const months = Math.min(Math.max(Number(input.months ?? 12), 1), 60);

  // Fetch housing price index from CBS dataset 85773NED
  // CBS OData may not support $orderby reliably, so fetch more and sort client-side
  const resp = await fetch(
    `https://opendata.cbs.nl/ODataApi/OData/85773NED/TypedDataSet?$format=json`,
    { signal: AbortSignal.timeout(15000) },
  );

  if (!resp.ok) {
    throw new Error(`CBS OpenData returned HTTP ${resp.status}.`);
  }

  const data = (await resp.json()) as Record<string, unknown>;
  const allRows = (data.value ?? []) as Array<Record<string, unknown>>;
  // Sort by period descending (format: "2024MM01")
  allRows.sort((a, b) => String(b.Perioden ?? "").localeCompare(String(a.Perioden ?? "")));
  const rows = allRows.slice(0, months);

  if (rows.length === 0) {
    throw new Error("No housing price data returned from CBS.");
  }

  // Parse period: "2024MM01" → { year: 2024, month: 1 }
  const parsePeriod = (p: unknown): { year: number; month: number; label: string } => {
    const s = String(p);
    const y = parseInt(s.slice(0, 4), 10);
    const m = parseInt(s.slice(6, 8), 10);
    return { year: y, month: m, label: `${y}-${String(m).padStart(2, "0")}` };
  };

  // Filter by year if specified
  const filtered = year
    ? rows.filter((r) => String(r.Perioden).startsWith(String(year)))
    : rows;

  if (filtered.length === 0) {
    throw new Error(`No data found for year ${year}.`);
  }

  const latest = filtered[0];
  const latestPeriod = parsePeriod(latest.Perioden);

  const timeSeries = filtered.map((r) => {
    const period = parsePeriod(r.Perioden);
    return {
      period: period.label,
      price_index: r.PrijsindexVerkoopprijzen_1 != null ? Number(r.PrijsindexVerkoopprijzen_1) : null,
      month_over_month_pct: r.OntwikkelingTOVVoorgaandePeriode_2 != null ? Number(r.OntwikkelingTOVVoorgaandePeriode_2) : null,
      year_over_year_pct: r.OntwikkelingTOVEenJaarEerder_3 != null ? Number(r.OntwikkelingTOVEenJaarEerder_3) : null,
      homes_sold: r.VerkochteWoningen_4 != null ? Number(r.VerkochteWoningen_4) : null,
      average_sale_price_eur: r.GemiddeldeVerkoopprijs_7 != null ? Number(r.GemiddeldeVerkoopprijs_7) : null,
    };
  });

  const latestSeries = timeSeries[0];

  return {
    output: {
      latest_period: latestPeriod.label,
      price_index: latestSeries.price_index,
      price_index_base: "2020 = 100",
      year_over_year_pct: latestSeries.year_over_year_pct,
      month_over_month_pct: latestSeries.month_over_month_pct,
      homes_sold: latestSeries.homes_sold,
      average_sale_price_eur: latestSeries.average_sale_price_eur,
      currency: "EUR",
      data_points: timeSeries.length,
      time_series: timeSeries,
      note: "National-level statistics for the Netherlands. Source: CBS / Kadaster.",
    },
    provenance: { source: "opendata.cbs.nl/85773NED", fetched_at: new Date().toISOString() },
  };
});
