import { inputRefusal, isCapabilityRefusal } from "../lib/capability-refusal.js";
import { FxCurrencyUnavailableError, getFrankfurterCurrencies, getFrankfurterSeries } from "../lib/fx/rates.js";
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

  if (!/^[A-Z]{3}$/.test(from)) throw inputRefusal("'from' must be a three-letter currency code.", "from", "Send 'from' as a three-letter currency code.");
  if (!/^[A-Z]{3}$/.test(to)) throw inputRefusal("'to' must be a three-letter currency code.", "to", "Send 'to' as a three-letter currency code.");

  // Checked here because Frankfurter answers 404 for a bad range as well, which
  // would read as an unavailable currency below.
  const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
  if (!isIsoDate(startDate)) {
    throw inputRefusal("'start_date' must be a date in YYYY-MM-DD format.", "start_date", "Send 'start_date' as YYYY-MM-DD.");
  }
  if (!isIsoDate(endDate)) {
    throw inputRefusal("'end_date' must be a date in YYYY-MM-DD format.", "end_date", "Send 'end_date' as YYYY-MM-DD.");
  }
  if (startDate > endDate) {
    throw inputRefusal("'start_date' must be on or before 'end_date'.", "start_date", "Send 'start_date' on or before 'end_date'.");
  }
  const days = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000;
  if (days > 1827) {
    throw inputRefusal("'start_date' must be within 1,827 days of 'end_date'.", "start_date", "Send 'start_date' so the date range is no more than five years (1,827 days).");
  }

  let source = "frankfurter.dev";
  let rateSource = "Frankfurter blended central-bank rate";
  let provenance: { source: string; [key: string]: string } = { source, attribution: "Source: Frankfurter (blended central-bank rates, frankfurter.dev)", acquisition_method: "vendor_api", data_access_lane: "allowed_with_checks", upstream_vendor: "Frankfurter" };
  let rates: { date: string; rate: number }[] = [];
  if (from === to) {
    source = "identity";
    rateSource = "identity";
    provenance = { source, acquisition_method: "computed", data_access_lane: "not_applicable" };
    rates = [];
    for (let time = Date.parse(`${startDate}T00:00:00Z`), end = Date.parse(`${endDate}T00:00:00Z`); time <= end; time += 86400000) {
      rates.push({ date: new Date(time).toISOString().slice(0, 10), rate: 1 });
    }
  } else {
    try {
      rates = (await getFrankfurterSeries(from, to, startDate, endDate)).map(({ date, rate }) => ({ date, rate }));
    } catch (error) {
      if (!(error instanceof FxCurrencyUnavailableError)) throw error;
      try {
        const currencies = await getFrankfurterCurrencies();
        if (!currencies.has(from)) throw inputRefusal(`'from' must be a currency with a published reference rate; ${from} has no published reference rate.`, "from", "Send 'from' as a currency with a published reference rate.");
        throw inputRefusal(`'to' must be a currency with a published reference rate; ${to} has no published reference rate.`, "to", "Send 'to' as a currency with a published reference rate.");
      } catch (listError) {
        if (isCapabilityRefusal(listError)) throw listError;
        throw inputRefusal(`'from' and 'to' must be currencies with published reference rates; ${from} and ${to} could not be confirmed.`, "from", "Send 'from' and 'to' as currencies with published reference rates.");
      }
    }
  }
  rates.sort((a, b) => a.date.localeCompare(b.date));

  if (rates.length === 0) {
    throw inputRefusal("'start_date' has no published rates in this range.", "start_date", "Send 'start_date' as part of a range containing published rates.");
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
      rate_source: rateSource,
    },
    provenance: { ...provenance, fetched_at: new Date().toISOString() },
  };
});
