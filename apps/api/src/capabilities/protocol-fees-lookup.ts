import { registerCapability, type CapabilityInput } from "./index.js";

// DeFi Llama — Fees & Revenue API (free, no key required)
const FEES_API = "https://api.llama.fi/summary/fees";
const REVENUE_API = "https://api.llama.fi/summary/revenue";

registerCapability("protocol-fees-lookup", async (input: CapabilityInput) => {
  const protocol = (
    (input.protocol as string) ??
    (input.name as string) ??
    (input.slug as string) ??
    ""
  ).trim();
  if (!protocol) throw new Error("'protocol' is required. Provide a DeFi protocol name (e.g., 'uniswap', 'aave-v3').");
  if (protocol.length < 2) throw new Error("'protocol' must be at least 2 characters.");

  const slug = protocol.toLowerCase().replace(/\s+/g, "-");

  // Fetch fees and revenue in parallel
  const [feesResp, revenueResp] = await Promise.all([
    fetch(`${FEES_API}/${encodeURIComponent(slug)}?dataType=dailyFees`, {
      headers: { "User-Agent": "Strale/1.0" },
      signal: AbortSignal.timeout(15000),
    }),
    fetch(`${REVENUE_API}/${encodeURIComponent(slug)}?dataType=dailyRevenue`, {
      headers: { "User-Agent": "Strale/1.0" },
      signal: AbortSignal.timeout(15000),
    }).catch(() => null), // Revenue endpoint is optional — not all protocols have it
  ]);

  if (!feesResp.ok) {
    if (feesResp.status === 404) {
      throw new Error(`Protocol "${protocol}" not found on DeFi Llama. Use the slug format (e.g., 'aave-v3', 'uniswap').`);
    }
    throw new Error(`DeFi Llama fees API returned HTTP ${feesResp.status}`);
  }

  const feesData = (await feesResp.json()) as any;
  const now = new Date().toISOString();

  let revenueData: any = null;
  if (revenueResp && revenueResp.ok) {
    revenueData = await revenueResp.json();
  }

  return {
    output: {
      protocol: feesData.name ?? slug,
      slug: feesData.defillamaId ?? slug,
      fees_24h_usd: feesData.total24h ?? null,
      fees_48h_to_24h_usd: feesData.total48hto24h ?? null,
      fees_7d_usd: feesData.total7d ?? null,
      fees_30d_usd: feesData.total30d ?? null,
      fees_all_time_usd: feesData.totalAllTime ?? null,
      revenue_24h_usd: revenueData?.total24h ?? null,
      revenue_7d_usd: revenueData?.total7d ?? null,
      revenue_30d_usd: revenueData?.total30d ?? null,
      revenue_all_time_usd: revenueData?.totalAllTime ?? null,
    },
    provenance: { source: "api.llama.fi", fetched_at: now },
  };
});
