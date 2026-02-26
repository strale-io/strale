import { registerCapability, type CapabilityInput } from "./index.js";

// CoinGecko API v3 — free tier, no key required (10-30 req/min)
const API = "https://api.coingecko.com/api/v3";

registerCapability("crypto-price", async (input: CapabilityInput) => {
  const coin = ((input.coin as string) ?? (input.symbol as string) ?? (input.cryptocurrency as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!coin) throw new Error("'coin' (cryptocurrency name or id, e.g. 'bitcoin', 'ethereum') is required.");

  const currencies = ((input.vs_currencies as string) ?? "usd,eur,gbp").trim().toLowerCase();

  // Common symbol-to-id mapping
  const symbolMap: Record<string, string> = {
    btc: "bitcoin", eth: "ethereum", sol: "solana", ada: "cardano",
    dot: "polkadot", avax: "avalanche-2", matic: "matic-network",
    link: "chainlink", uni: "uniswap", atom: "cosmos", xrp: "ripple",
    doge: "dogecoin", shib: "shiba-inu", ltc: "litecoin", bnb: "binancecoin",
    usdt: "tether", usdc: "usd-coin", dai: "dai",
  };

  const coinId = symbolMap[coin] ?? coin;

  const url = `${API}/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`;
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (response.status === 404) throw new Error(`Cryptocurrency "${coin}" not found. Use CoinGecko ID (e.g. 'bitcoin', 'ethereum').`);
  if (!response.ok) throw new Error(`CoinGecko API returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  const market = data.market_data;

  const prices: Record<string, number> = {};
  for (const c of currencies.split(",")) {
    const trimmed = c.trim();
    if (market.current_price[trimmed] !== undefined) {
      prices[trimmed] = market.current_price[trimmed];
    }
  }

  return {
    output: {
      id: data.id,
      symbol: data.symbol,
      name: data.name,
      prices,
      market_cap_usd: market.market_cap?.usd ?? null,
      market_cap_rank: data.market_cap_rank,
      total_volume_usd: market.total_volume?.usd ?? null,
      price_change_24h_percent: market.price_change_percentage_24h,
      price_change_7d_percent: market.price_change_percentage_7d,
      price_change_30d_percent: market.price_change_percentage_30d,
      ath_usd: market.ath?.usd ?? null,
      ath_date: market.ath_date?.usd ?? null,
      circulating_supply: market.circulating_supply,
      total_supply: market.total_supply,
      last_updated: data.last_updated,
    },
    provenance: { source: "api.coingecko.com", fetched_at: new Date().toISOString() },
  };
});
