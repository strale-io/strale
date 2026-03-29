import { registerCapability, type CapabilityInput } from "./index.js";

// DeFi Llama — Protocol TVL API (free, no key required)
const API = "https://api.llama.fi";

// Simple in-memory cache for the protocols list (5-minute TTL)
let _protocolsCache: Array<{ name: string; slug: string }> | null = null;
let _protocolsCacheExpiry = 0;

async function getProtocolsList(): Promise<Array<{ name: string; slug: string }>> {
  if (_protocolsCache && Date.now() < _protocolsCacheExpiry) return _protocolsCache;

  const response = await fetch(`${API}/protocols`, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) throw new Error(`DeFi Llama protocols list returned HTTP ${response.status}`);

  const data = (await response.json()) as any[];
  _protocolsCache = data.map((p) => ({
    name: p.name ?? "",
    slug: p.slug ?? "",
  }));
  _protocolsCacheExpiry = Date.now() + 5 * 60 * 1000;
  return _protocolsCache;
}

registerCapability("protocol-tvl-lookup", async (input: CapabilityInput) => {
  const protocol = (
    (input.protocol as string) ??
    (input.name as string) ??
    (input.slug as string) ??
    ""
  ).trim();
  if (!protocol) throw new Error("'protocol' is required. Provide a DeFi protocol name or slug (e.g., 'aave', 'uniswap').");
  if (protocol.length < 2) throw new Error("'protocol' must be at least 2 characters.");

  // Normalize to slug format
  const slug = protocol.toLowerCase().replace(/\s+/g, "-");

  // Try direct fetch first
  let data: any = null;
  const directUrl = `${API}/protocol/${encodeURIComponent(slug)}`;
  const directResp = await fetch(directUrl, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(15000),
  });

  if (directResp.ok) {
    data = await directResp.json();
  }

  // If direct fetch failed, search the protocols list
  if (!data || data.statusCode === 400) {
    const protocols = await getProtocolsList();
    const searchLower = protocol.toLowerCase();
    const match = protocols.find(
      (p) => p.slug === searchLower || p.name.toLowerCase() === searchLower,
    ) ?? protocols.find(
      (p) => p.slug.includes(searchLower) || p.name.toLowerCase().includes(searchLower),
    );

    if (!match) {
      throw new Error(`Protocol "${protocol}" not found. Use DeFi Llama slug (e.g., 'aave-v3', 'uniswap', 'lido').`);
    }

    const matchResp = await fetch(`${API}/protocol/${encodeURIComponent(match.slug)}`, {
      headers: { "User-Agent": "Strale/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (!matchResp.ok) throw new Error(`DeFi Llama returned HTTP ${matchResp.status} for protocol "${match.slug}"`);
    data = await matchResp.json();
  }

  if (!data || !data.name) {
    throw new Error(`No data returned for protocol "${protocol}".`);
  }

  // Extract chain TVLs from the chainTvls object
  const chainTvls: Record<string, number> = {};
  if (data.chainTvls) {
    for (const [chain, tvlData] of Object.entries(data.chainTvls)) {
      if (chain.includes("-") || chain === "borrowed" || chain === "staking") continue;
      const tvlArr = (tvlData as any)?.tvl;
      if (Array.isArray(tvlArr) && tvlArr.length > 0) {
        chainTvls[chain] = tvlArr[tvlArr.length - 1]?.totalLiquidityUSD ?? 0;
      }
    }
  }

  // TVL can be an array (historical) or a number (current)
  let tvlUsd: number | null = null;
  if (typeof data.tvl === "number") {
    tvlUsd = data.tvl;
  } else if (Array.isArray(data.tvl) && data.tvl.length > 0) {
    const last = data.tvl[data.tvl.length - 1];
    tvlUsd = last?.totalLiquidityUSD ?? null;
  }

  const listedAt = data.listedAt
    ? new Date(data.listedAt * 1000).toISOString()
    : null;

  const audits = data.audits != null ? parseInt(String(data.audits), 10) : null;

  return {
    output: {
      name: data.name,
      slug: data.slug ?? slug,
      symbol: data.symbol ?? null,
      category: data.category ?? null,
      tvl_usd: tvlUsd,
      tvl_change_1d_pct: data.change_1d ?? null,
      tvl_change_7d_pct: data.change_7d ?? null,
      chains: data.chains ?? [],
      chain_tvls: chainTvls,
      audits: isNaN(audits as number) ? null : audits,
      audit_links: data.audit_links ?? [],
      is_open_source: data.openSource === true,
      url: data.url ?? null,
      description: data.description ?? null,
      twitter: data.twitter ?? null,
      github: data.github ?? [],
      listed_since: listedAt,
    },
    provenance: { source: "api.llama.fi", fetched_at: new Date().toISOString() },
  };
});
