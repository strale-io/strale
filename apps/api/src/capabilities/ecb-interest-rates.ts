import { registerCapability, type CapabilityInput } from "./index.js";

function parseFredCsv(csv: string): { date: string; value: number } | null {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return null;
  for (let i = lines.length - 1; i >= 1; i--) {
    const cols = lines[i].split(",");
    if (cols.length < 2) continue;
    const date = cols[0]?.trim() ?? "";
    const raw = cols[1]?.trim() ?? "";
    if (!raw || raw === ".") continue;
    const value = parseFloat(raw);
    if (Number.isFinite(value)) return { date, value };
  }
  return null;
}

registerCapability("ecb-interest-rates", async (_input: CapabilityInput) => {
  const base = "https://fred.stlouisfed.org/graph/fredgraph.csv";

  const rateKeys = {
    main_refinancing_rate: "ECBMRRFR",
    deposit_facility_rate: "ECBDFR",
    marginal_lending_rate: "ECBMLFR",
  };

  const results: Record<string, number | null> = {};
  let effectiveDate = "";

  const entries = Object.entries(rateKeys);
  const responses = await Promise.allSettled(
    entries.map(async ([key, seriesId]) => {
      const resp = await fetch(`${base}?id=${seriesId}`, {
        headers: { Accept: "text/csv" },
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) throw new Error(`FRED API returned ${resp.status}`);
      const csv = await resp.text();
      const parsed = parseFredCsv(csv);
      return { key, parsed };
    })
  );

  for (const r of responses) {
    if (r.status === "fulfilled" && r.value.parsed) {
      results[r.value.key] = r.value.parsed.value;
      if (r.value.parsed.date) effectiveDate = r.value.parsed.date;
    } else if (r.status === "fulfilled") {
      results[r.value.key] = null;
    }
  }

  if (!results.main_refinancing_rate && !results.deposit_facility_rate && !results.marginal_lending_rate) {
    throw new Error("Could not retrieve any ECB interest rates. The FRED API may be temporarily unavailable.");
  }

  return {
    output: {
      main_refinancing_rate: results.main_refinancing_rate,
      deposit_facility_rate: results.deposit_facility_rate,
      marginal_lending_rate: results.marginal_lending_rate,
      effective_date: effectiveDate,
      currency: "EUR",
      source_url: "https://fred.stlouisfed.org",
    },
    provenance: { source: "fred.stlouisfed.org (mirrors ECB)", fetched_at: new Date().toISOString() },
  };
});
