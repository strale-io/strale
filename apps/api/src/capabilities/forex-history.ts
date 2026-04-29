import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("forex-history", async (input: CapabilityInput) => {
  const from = ((input.from as string) ?? (input.from_currency as string) ?? "EUR").trim().toUpperCase();
  const to = ((input.to as string) ?? (input.to_currency as string) ?? "USD").trim().toUpperCase();

  // Default: last 30 days
  const now = new Date();
  const defaultEnd = now.toISOString().slice(0, 10);
  const defaultStart = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);

  const startDate = ((input.start_date as string) ?? defaultStart).trim();
  const endDate = ((input.end_date as string) ?? defaultEnd).trim();

  if (!from || !to) throw new Error("'from' and 'to' currency codes are required.");

  const url = `https://api.frankfurter.app/${startDate}..${endDate}?from=${from}&to=${to}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Frankfurter API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = await resp.json() as {
    base: string;
    start_date: string;
    end_date: string;
    rates: Record<string, Record<string, number>>;
  };

  const rates: { date: string; rate: number }[] = [];
  for (const [date, rateObj] of Object.entries(data.rates ?? {})) {
    const rate = rateObj[to];
    if (rate !== undefined) rates.push({ date, rate });
  }
  rates.sort((a, b) => a.date.localeCompare(b.date));

  if (rates.length === 0) {
    throw new Error(`No exchange rate data found for ${from}→${to} in the given date range.`);
  }

  const values = rates.map(r => r.rate);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const changePct = ((values[values.length - 1] - values[0]) / values[0]) * 100;

  return {
    output: {
      from_currency: from,
      to_currency: to,
      start_date: startDate,
      end_date: endDate,
      rates,
      average: Math.round(avg * 10000) / 10000,
      min: Math.round(min * 10000) / 10000,
      max: Math.round(max * 10000) / 10000,
      change_percent: Math.round(changePct * 100) / 100,
      data_points: rates.length,
    },
    provenance: { source: "frankfurter.app", fetched_at: new Date().toISOString() },
  };
});
