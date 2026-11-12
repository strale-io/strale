import { registerCapability, type CapabilityInput } from "./index.js";
import { readErrorTextTruncated, readJsonWithLimit } from "../lib/resource-limits.js";
import { fetchUnavailable, httpUnavailable } from "../lib/upstream-result.js";

// DeFi Llama — Fees & Revenue API (free, no key required). Fees and revenue
// are the same endpoint with a different dataType; the charts are excluded
// because only the totals are read (with them, Uniswap's answer is 1.5 MB).
const SUMMARY_API = "https://api.llama.fi/summary/fees";
const FEES = "DeFi Llama fees API";
const REVENUE = "DeFi Llama revenue API";

type Summary = {
  name?: string;
  defillamaId?: string;
  total24h?: number | null;
  total48hto24h?: number | null;
  total7d?: number | null;
  total30d?: number | null;
  totalAllTime?: number | null;
};

/**
 * One dataType's summary, or null when DeFi Llama has no such series for the
 * slug. It answers that with HTTP 400 and "Fees for <slug> not found" (404
 * too, for safety); checked live on 2026-11-12, for a made-up slug and for
 * protocols it tracks fees but not revenue for. Every other failure throws.
 */
async function summary(slug: string, dataType: "dailyFees" | "dailyRevenue", upstream: string): Promise<Summary | null> {
  const url =
    `${SUMMARY_API}/${encodeURIComponent(slug)}?dataType=${dataType}` +
    "&excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true";
  let resp: Response;
  try {
    resp = await fetch(url, { headers: { "User-Agent": "Strale/1.0" }, signal: AbortSignal.timeout(15000) });
  } catch (err) {
    throw fetchUnavailable(upstream, err);
  }
  if (!resp.ok) {
    const body = await readErrorTextTruncated(resp);
    if (resp.status === 404 || (resp.status === 400 && /\bnot found\b/i.test(body))) return null;
    throw httpUnavailable(upstream, resp.status);
  }
  try {
    return await readJsonWithLimit<Summary>(resp);
  } catch (err) {
    throw fetchUnavailable(upstream, err);
  }
}

registerCapability("protocol-fees-lookup", async (input: CapabilityInput) => {
  const protocol = (
    (input.protocol as string) ??
    (input.name as string) ??
    (input.slug as string) ??
    ""
  ).trim();
  if (!protocol) throw new Error("'protocol' is required. Provide a DeFi protocol name (e.g., 'aave-v3', 'uniswap').");
  if (protocol.length < 2) throw new Error("'protocol' must be at least 2 characters.");

  const slug = protocol.toLowerCase().replace(/\s+/g, "-");

  // Both legs in parallel; settled, so an unknown protocol is reported as
  // such whichever leg finishes first.
  const [fees, revenue] = await Promise.allSettled([
    summary(slug, "dailyFees", FEES),
    summary(slug, "dailyRevenue", REVENUE),
  ]);

  if (fees.status === "rejected") throw fees.reason;
  const feesData = fees.value;
  if (feesData === null) {
    throw new Error(`Protocol "${protocol}" not found on DeFi Llama. Use the slug format (e.g., 'aave-v3', 'uniswap').`);
  }
  // The revenue leg failing is not "no revenue" (2026-11-06 swallowed-failures
  // audit, row 33): before, any failure here, and the retired /summary/revenue
  // path that answered 500 for every protocol, returned billed nulls. Only
  // DeFi Llama's own "no such series" (null) leaves the revenue fields null.
  if (revenue.status === "rejected") throw revenue.reason;
  const revenueData = revenue.value;
  const now = new Date().toISOString();

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
