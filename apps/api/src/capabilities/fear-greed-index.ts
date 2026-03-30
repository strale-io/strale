import { registerCapability, type CapabilityInput } from "./index.js";

// Alternative.me — Crypto Fear & Greed Index (free, no key required)
const API = "https://api.alternative.me/fng";

registerCapability("fear-greed-index", async (input: CapabilityInput) => {
  let days = 1;
  const rawDays = (input.days as number) ?? (input.limit as number) ?? (input.history as number) ?? (input.period as number);
  if (typeof rawDays === "number" && rawDays > 0) {
    days = Math.min(Math.floor(rawDays), 30);
  }

  const url = `${API}/?limit=${days}&format=json`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(5000),
  });

  if (!response.ok) throw new Error(`Alternative.me API returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  const now = new Date().toISOString();

  if (!data.data || data.data.length === 0) {
    throw new Error("No Fear & Greed data available.");
  }

  const current = data.data[0];
  const currentValue = parseInt(String(current.value), 10);
  const currentDate = new Date(parseInt(String(current.timestamp), 10) * 1000).toISOString();

  const output: Record<string, unknown> = {
    current_value: currentValue,
    classification: current.value_classification,
    timestamp: currentDate,
  };

  if (days > 1 && data.data.length > 1) {
    const history = data.data.map((d: any) => ({
      value: parseInt(String(d.value), 10),
      classification: d.value_classification,
      date: new Date(parseInt(String(d.timestamp), 10) * 1000).toISOString(),
    }));

    const values = history.map((h: any) => h.value);
    const avg = Math.round(values.reduce((a: number, b: number) => a + b, 0) / values.length);

    // Trend: compare newest vs oldest
    const newest = values[0];
    const oldest = values[values.length - 1];
    const diff = newest - oldest;
    const trend = diff > 5 ? "rising" : diff < -5 ? "falling" : "stable";

    output.history = history;
    output.average = avg;
    output.trend = trend;
  }

  return {
    output,
    provenance: { source: "alternative.me", fetched_at: now },
  };
});
