import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("ticker-lookup", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.company_name as string) ?? (input.company as string) ?? (input.task as string) ?? "").trim();
  if (!query) throw new Error("'query' (company name) is required.");

  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0&enableFuzzyQuery=true&quotesQueryId=tss_match_phrase_query`;

  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Strale/1.0)",
      Accept: "application/json",
    },
  });

  if (!resp.ok) throw new Error(`Yahoo Finance API returned ${resp.status}`);
  const data = await resp.json() as { quotes?: { symbol?: string; shortname?: string; longname?: string; exchDisp?: string; typeDisp?: string; score?: number }[] };

  const quotes = data.quotes ?? [];
  const matches = quotes.map(q => ({
    symbol: q.symbol ?? "",
    name: q.longname ?? q.shortname ?? "",
    exchange: q.exchDisp ?? "",
    type: q.typeDisp ?? "",
    score: q.score ?? 0,
  }));

  const topMatch = matches.length > 0 ? { symbol: matches[0].symbol, name: matches[0].name, exchange: matches[0].exchange } : null;

  return {
    output: { query, matches, top_match: topMatch, total_results: matches.length },
    provenance: { source: "finance.yahoo.com", fetched_at: new Date().toISOString() },
  };
});
