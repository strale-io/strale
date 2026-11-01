import { inputRefusal } from "../lib/capability-refusal.js";
import { registerCapability, type CapabilityInput } from "./index.js";

// ECB Statistical Data Warehouse API — free, no auth
const ECB_API = "https://data-api.ecb.europa.eu/service/data/EXR";

registerCapability("exchange-rate", async (input: CapabilityInput) => {
  const from = ((input.from as string) ?? "USD").toUpperCase().trim();
  const to = ((input.to as string) ?? "EUR").toUpperCase().trim();

  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    throw new Error("'from' and 'to' must be valid 3-letter ISO 4217 currency codes.");
  }

  if (from === to) {
    return {
      output: { from, to, rate: 1, inverse_rate: 1, date: new Date().toISOString().slice(0, 10) },
      provenance: { source: "identity", fetched_at: new Date().toISOString() },
    };
  }

  // ECB uses EUR as the base — we need to convert through EUR if neither currency is EUR
  let rate: number;
  let date: string;

  if (from === "EUR") {
    const r = await fetchEcbRate(to, "to");
    rate = r.rate;
    date = r.date;
  } else if (to === "EUR") {
    const r = await fetchEcbRate(from, "from");
    rate = 1 / r.rate;
    date = r.date;
  } else {
    // Cross rate through EUR
    const [rFrom, rTo] = await Promise.all([fetchEcbRate(from, "from"), fetchEcbRate(to, "to")]);
    rate = rTo.rate / rFrom.rate;
    date = rFrom.date > rTo.date ? rFrom.date : rTo.date;
  }

  return {
    output: {
      from,
      to,
      rate: Math.round(rate * 1_000_000) / 1_000_000,
      inverse_rate: Math.round((1 / rate) * 1_000_000) / 1_000_000,
      date,
    },
    provenance: { source: "ecb.europa.eu", fetched_at: new Date().toISOString() },
  };
});

async function fetchEcbRate(currency: string, field: "from" | "to"): Promise<{ rate: number; date: string }> {
  const url = `${ECB_API}/D.${currency}.EUR.SP00.A?lastNObservations=1&format=jsondata`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  // The ECB answers 404 for a currency it publishes no reference rate for. That
  // is the ask, not the source: as a plain error, three such calls in a row
  // would open the breaker on this tool for every buyer.
  if (res.status === 404) {
    throw inputRefusal(
      `'${field}' must be a currency with an ECB daily reference rate; ${currency} has none.`,
      field,
      "Use a currency the European Central Bank publishes a daily reference rate for.",
    );
  }
  if (!res.ok) throw new Error(`ECB API returned HTTP ${res.status} for ${currency}.`);
  const data = (await res.json()) as any;

  const observations = data?.dataSets?.[0]?.series?.["0:0:0:0:0"]?.observations;
  if (!observations) throw new Error(`No exchange rate data for ${currency}.`);

  const key = Object.keys(observations)[0];
  const rate = observations[key][0];
  const dates = data?.structure?.dimensions?.observation?.[0]?.values;
  const date = dates?.[Number(key)]?.id ?? new Date().toISOString().slice(0, 10);

  return { rate, date };
}
