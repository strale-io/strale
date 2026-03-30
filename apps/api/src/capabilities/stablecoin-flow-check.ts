import { registerCapability, type CapabilityInput } from "./index.js";

// DeFi Llama — Stablecoins API (free, no key required)
const STABLECOINS_API = "https://stablecoins.llama.fi/stablecoins?includePrices=true";
const CHAINS_API = "https://stablecoins.llama.fi/stablecoinchains";

// Cache the stablecoins list (10-minute TTL)
let _stablecoinsCache: any[] | null = null;
let _stablecoinsCacheExpiry = 0;

async function getStablecoinsList(): Promise<any[]> {
  if (_stablecoinsCache && Date.now() < _stablecoinsCacheExpiry) return _stablecoinsCache;
  const resp = await fetch(STABLECOINS_API, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(15000),
  });
  if (!resp.ok) throw new Error(`DeFi Llama stablecoins API returned HTTP ${resp.status}`);
  const data = (await resp.json()) as any;
  _stablecoinsCache = data.peggedAssets ?? [];
  _stablecoinsCacheExpiry = Date.now() + 10 * 60 * 1000;
  return _stablecoinsCache!;
}

registerCapability("stablecoin-flow-check", async (input: CapabilityInput) => {
  const chain = (
    (input.chain as string) ??
    (input.network as string) ??
    (input.blockchain as string) ??
    ""
  ).trim();

  const stablecoin = (
    (input.stablecoin as string) ??
    (input.token as string) ??
    (input.coin as string) ??
    (input.symbol as string) ??
    ""
  ).trim();

  const now = new Date().toISOString();

  // Query by chain
  if (chain) {
    const resp = await fetch(CHAINS_API, {
      headers: { "User-Agent": "Strale/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) throw new Error(`DeFi Llama stablecoin chains API returned HTTP ${resp.status}`);
    const chains = (await resp.json()) as any[];

    const match = chains.find(
      (c: any) => c.name?.toLowerCase() === chain.toLowerCase(),
    ) ?? chains.find(
      (c: any) => c.name?.toLowerCase().includes(chain.toLowerCase()),
    );

    if (!match) {
      throw new Error(`Chain "${chain}" not found. Try: Ethereum, BSC, Polygon, Arbitrum, Base, Solana, Avalanche.`);
    }

    return {
      output: {
        query_type: "chain",
        chain: match.name,
        total_supply_usd: match.totalCirculatingUSD?.peggedUSD ?? null,
        details: {
          circulating_usd: match.totalCirculatingUSD ?? null,
          circulating_prev_day: match.totalCirculatingPrevDayUSD ?? null,
          circulating_prev_week: match.totalCirculatingPrevWeekUSD ?? null,
          circulating_prev_month: match.totalCirculatingPrevMonthUSD ?? null,
        },
      },
      provenance: { source: "stablecoins.llama.fi", fetched_at: now },
    };
  }

  // Query by specific stablecoin
  if (stablecoin) {
    const list = await getStablecoinsList();
    const searchLower = stablecoin.toLowerCase();
    const match = list.find(
      (s: any) => s.symbol?.toLowerCase() === searchLower || s.name?.toLowerCase() === searchLower,
    ) ?? list.find(
      (s: any) => s.symbol?.toLowerCase().includes(searchLower) || s.name?.toLowerCase().includes(searchLower),
    );

    if (!match) {
      throw new Error(`Stablecoin "${stablecoin}" not found. Try: USDT, USDC, DAI, BUSD, FRAX.`);
    }

    return {
      output: {
        query_type: "stablecoin",
        stablecoin: match.symbol,
        name: match.name,
        total_supply_usd: match.circulating?.peggedUSD ?? null,
        price: match.price ?? null,
        chains: match.chains ?? [],
        details: {
          gecko_id: match.gecko_id ?? null,
          peg_type: match.pegType ?? null,
          peg_mechanism: match.pegMechanism ?? null,
        },
      },
      provenance: { source: "stablecoins.llama.fi", fetched_at: now },
    };
  }

  // Market summary — no chain or stablecoin specified
  const list = await getStablecoinsList();

  // Sort by circulating supply descending
  const sorted = [...list]
    .filter((s: any) => s.circulating?.peggedUSD > 0)
    .sort((a: any, b: any) => (b.circulating?.peggedUSD ?? 0) - (a.circulating?.peggedUSD ?? 0));

  const totalSupply = sorted.reduce((sum: number, s: any) => sum + (s.circulating?.peggedUSD ?? 0), 0);

  const top5 = sorted.slice(0, 5).map((s: any) => ({
    symbol: s.symbol,
    name: s.name,
    supply_usd: s.circulating?.peggedUSD ?? 0,
    market_share_pct: totalSupply > 0
      ? Math.round(((s.circulating?.peggedUSD ?? 0) / totalSupply) * 10000) / 100
      : 0,
  }));

  return {
    output: {
      query_type: "market_summary",
      total_supply_usd: totalSupply,
      stablecoin_count: sorted.length,
      top_5: top5,
    },
    provenance: { source: "stablecoins.llama.fi", fetched_at: now },
  };
});
