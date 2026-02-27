import { registerCapability, type CapabilityInput } from "./index.js";

function parseEcbCsv(csv: string): { date: string; value: number } | null {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return null;
  const headers = lines[0].split(",");
  const dateIdx = headers.findIndex(h => h.trim() === "TIME_PERIOD");
  const valIdx = headers.findIndex(h => h.trim() === "OBS_VALUE");
  if (dateIdx < 0 || valIdx < 0) return null;
  const lastLine = lines[lines.length - 1];
  const cols = lastLine.split(",");
  return { date: cols[dateIdx]?.trim() ?? "", value: parseFloat(cols[valIdx]?.trim() ?? "0") };
}

registerCapability("ecb-interest-rates", async (input: CapabilityInput) => {
  const base = "https://sdw-wsrest.ecb.europa.eu/service/data/FM";
  const suffix = "?format=csvdata&lastNObservations=1";

  const urls: Record<string, string> = {
    main_refinancing_rate: `${base}/B.U2.EUR.4F.KR.MRR_FR.LEV${suffix}`,
    deposit_facility_rate: `${base}/B.U2.EUR.4F.KR.DFR.LEV${suffix}`,
    marginal_lending_rate: `${base}/B.U2.EUR.4F.KR.MLFR.LEV${suffix}`,
  };

  const results: Record<string, number | null> = {};
  let effectiveDate = "";

  const entries = Object.entries(urls);
  const responses = await Promise.allSettled(
    entries.map(async ([key, url]) => {
      const resp = await fetch(url, { headers: { Accept: "text/csv" } });
      if (!resp.ok) throw new Error(`ECB API returned ${resp.status}`);
      const csv = await resp.text();
      const parsed = parseEcbCsv(csv);
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
    throw new Error("Could not retrieve any ECB interest rates. The ECB API may be temporarily unavailable.");
  }

  return {
    output: {
      main_refinancing_rate: results.main_refinancing_rate,
      deposit_facility_rate: results.deposit_facility_rate,
      marginal_lending_rate: results.marginal_lending_rate,
      effective_date: effectiveDate,
      currency: "EUR",
      source_url: "https://sdw-wsrest.ecb.europa.eu",
    },
    provenance: { source: "ecb.europa.eu", fetched_at: new Date().toISOString() },
  };
});
