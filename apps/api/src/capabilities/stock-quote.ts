import { registerCapability, type CapabilityInput } from "./index.js";

// Yahoo Finance v8 API — free, no auth required
const YAHOO_API = "https://query1.finance.yahoo.com/v8/finance/chart";

registerCapability("stock-quote", async (input: CapabilityInput) => {
  const symbol = ((input.symbol as string) ?? (input.task as string) ?? "").toUpperCase().trim();
  if (!symbol) {
    throw new Error("'symbol' is required. Provide a stock ticker (e.g. AAPL, VOLV-B.ST).");
  }

  const url = `${YAHOO_API}/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Strale/1.0 (api; admin@strale.io)",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Yahoo Finance returned HTTP ${res.status} for ${symbol}.`);
  const data = (await res.json()) as any;

  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No quote data found for symbol "${symbol}".`);

  const meta = result.meta;
  const quote = result.indicators?.quote?.[0];
  const timestamps = result.timestamp;

  const lastClose = quote?.close?.filter((v: any) => v != null).pop() ?? meta.regularMarketPrice;
  const lastOpen = quote?.open?.filter((v: any) => v != null)?.[0] ?? null;
  const high = quote?.high ? Math.max(...quote.high.filter((v: any) => v != null)) : null;
  const low = quote?.low ? Math.min(...quote.low.filter((v: any) => v != null)) : null;
  const volume = quote?.volume?.reduce((a: number, b: number | null) => a + (b ?? 0), 0) ?? null;

  const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const change = previousClose != null && lastClose != null ? lastClose - previousClose : null;
  const changePercent = change != null && previousClose ? (change / previousClose) * 100 : null;

  return {
    output: {
      symbol: meta.symbol,
      name: meta.shortName ?? meta.longName ?? symbol,
      currency: meta.currency,
      exchange: meta.exchangeName,
      price: lastClose != null ? Math.round(lastClose * 100) / 100 : null,
      open: lastOpen != null ? Math.round(lastOpen * 100) / 100 : null,
      high: high != null ? Math.round(high * 100) / 100 : null,
      low: low != null ? Math.round(low * 100) / 100 : null,
      volume,
      previous_close: previousClose != null ? Math.round(previousClose * 100) / 100 : null,
      change: change != null ? Math.round(change * 100) / 100 : null,
      change_percent: changePercent != null ? Math.round(changePercent * 100) / 100 : null,
      market_state: meta.marketState ?? null,
      trading_date: timestamps?.length
        ? new Date(timestamps[timestamps.length - 1] * 1000).toISOString().slice(0, 10)
        : null,
    },
    provenance: { source: "finance.yahoo.com", fetched_at: new Date().toISOString() },
  };
});
