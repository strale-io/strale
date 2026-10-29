import { sql } from "drizzle-orm";
import { deriveQuotaCapFromRateLimit, type ManifestKnownRateLimit } from "../../lib/capability-manifest-types.js";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0082: reclassify throttled-upstream free_unlimited caps ─────────
//
// Audit follow-up (2026-08-14). `free_unlimited` disarms the
// guarded-executor.ts ALLOW_MATRIX entirely ("allow, no constraint" for
// every invocation context) — the exact conflation the 2026-05-11 DE
// OpenRegister incident post-mortem named as root cause: "no per-call
// cost" was read as "no quota." A production audit of all 193
// `free_unlimited` caps found 19 whose upstream vendor documents a real
// rate limit or daily cap; the rest (algorithmic, static-table, or
// arbitrary-customer-target fetches with no vendor account/quota) are
// correctly free_unlimited and untouched.
//
// Quota_cap derivation. Where the vendor documents a literal daily
// total, that number is used directly (Etherscan 100,000/day; Open-Meteo
// 10,000/day). Where the vendor documents only a per-minute or
// per-second rate, quota_cap is the rate's 1-hour-sustained volume
// (rate_per_minute × 60) — a deliberately conservative fraction of the
// naive 24h extrapolation, matching the conservative-estimate posture
// Block 0075/0077 already established for this table. This number only
// bounds Strale's own internal_test/ci budget (5%/2% of quota_cap per
// window, per computeBudgetCap) — customer_paid traffic is unaffected
// per the ALLOW_MATRIX (free_quota × customer_paid = allow). Per-cap
// vendor citations:
//
//   - brazilian-company-data: ReceitaWS free tier, 3 req/min
//     (https://receitaws.com.br/api; corroborated across public API
//     directories). quota_cap = 3×60 = 180.
//   - address-geocode, address-validate: OSM Nominatim Usage Policy
//     (https://operations.osmfoundation.org/policies/nominatim/) —
//     "absolute maximum of 1 request per second" for casual use, but
//     "restricted to a lower limit of 4 requests per minute" for bulk /
//     regular-interval automated use, which is what a production
//     capability does. quota_cap = 4×60 = 240. (address-validate.ts
//     already self-throttles at ~1 req/1.1s in-process; that bounds
//     burst rate but not cumulative scheduler volume across restarts —
//     the two protections are complementary, not redundant.)
//   - weather-lookup: Open-Meteo pricing page
//     (https://open-meteo.com/en/pricing) — "Daily Limit 10.000 calls /
//     day" for free non-commercial use. quota_cap = 10000 (literal).
//   - ip-geolocation, ip-risk-score: ip-api.com docs
//     (https://ip-api.com/docs/api:json) — "limited to 45 requests per
//     minute from an IP address" (also already noted in
//     ip-geolocation.ts's own header comment). quota_cap = 45×60 = 2700.
//   - sec-filing-events: SEC.gov fair-access policy
//     (https://www.sec.gov/os/webmaster-faq, in effect since 2021-07-27)
//     — "no more than 10 requests per second," applies site-wide
//     including data.sec.gov (used by this executor). quota_cap =
//     10×60×60 = 36000.
//   - contract-verify-check, gas-price-check, wallet-age-check,
//     wallet-balance-lookup, wallet-transactions-lookup: shared
//     lib/etherscan-client.ts. Etherscan free-tier rate limits
//     (docs.etherscan.io/etherscan-v2/rate-limits, corroborated via
//     info.etherscan.com/api-return-errors) — 5 calls/second, 100,000
//     calls/day. quota_cap = 100000 (literal). The client already
//     self-throttles to ~4.76 req/s in-process; same complementary
//     relationship as Nominatim above — it doesn't bound the 100k/day
//     total across a long-running or multi-instance process.
//   - barcode-lookup: Open Food Facts API docs
//     (https://openfoodfacts.github.io/openfoodfacts-server/api/) —
//     "15 req/min/IP address for all read product queries," which is
//     the exact endpoint this executor calls. quota_cap = 15×60 = 900.
//   - crypto-price: CoinGecko official support article
//     (https://support.coingecko.com/hc/en-us/articles/4538771776153) —
//     public/keyless plan "5 to 15 calls per minute depending on usage
//     conditions." Conservative low end used. quota_cap = 5×60 = 300.
//   - company-news: GDELT Project's own blog
//     (https://blog.gdeltproject.org/ukraine-api-rate-limiting-web-ngrams-3-0/)
//     — "one request every 5 seconds" per IP (= 12/min). quota_cap =
//     12×60 = 720.
//   - approval-security-check, phishing-site-check, token-security-check,
//     wallet-risk-score: GoPlus Labs official docs
//     (https://docs.gopluslabs.io/reference/support) — "the rate limit
//     is 30 calls/minute" for the free tier without an access token
//     (none of these 4 executors send one). quota_cap = 30×60 = 1800.
//
// Deliberately NOT reclassified (checked, left free_unlimited): DefiLlama
// (protocol-fees-lookup, protocol-tvl-lookup, stablecoin-flow-check) —
// vendor docs state no rate limit on the free API. GLEIF (lei-lookup,
// gleif-l2-children-lookup, gleif-l2-ubo-lookup) — vendor docs state no
// rate limiting. PyPI (pypi-package-info) — vendor docs state no edge
// rate limiting. Nager.Date (business-day-check, holiday-calendar,
// public-holiday-lookup) — vendor docs state unlimited. Docker Hub
// (docker-hub-info) — the documented 100-pulls/6h limit applies to
// registry image pulls, not the hub.docker.com/v2/repositories/
// metadata endpoint this executor actually calls; no rate limit found
// documented for that endpoint. Zippopotam.us (postal-code-lookup) — no
// published limit ("no hard limits ... best-effort"). A broader set of
// ~50 other free_unlimited caps with third-party vendor data sources
// (e.g. npm-package-info, several EU open-data CKAN company registries,
// Yahoo Finance-backed caps) were surfaced but not individually
// re-verified in this pass — see PR body for the full candidate list;
// left alone per "don't guess" rather than reclassified speculatively.
//
// Reclassification (not first-time classification), so the idempotency
// gate is `cost_class = 'free_unlimited'` per slug, not `IS NULL` — a
// prior classification (correct or not) is what's being corrected, and
// once corrected to `free_quota` this predicate naturally stops
// matching (self-terminating, same as the IS NULL blocks above).
//
// Follow-up (2026-08-14, same day): quotaCap below used to be 19
// hand-computed integers with the arithmetic spelled out only in
// trailing `//` comments — easy to typo, and nothing checked the
// comment against the number. Now sourced from the same
// `{value, unit, source_url}` shape the manifest's `known_rate_limit`
// field carries (capability-manifest-types.ts) and run through the same
// `deriveQuotaCapFromRateLimit` both this migration and
// check-cost-class-coherence.mjs's consistency check use — so a mismatch
// between what this migration writes to the DB and what the manifest
// declares is now a lint failure, not just a manually-maintained
// coincidence. This migration still can't read manifests/*.yaml at
// deploy time (startup migrations must be self-contained, deterministic
// SQL — no filesystem dependency on repo layout), so the rate-limit
// facts are re-declared here rather than imported from YAML; they're
// the same facts as the corresponding manifest's known_rate_limit,
// verified equal by startup-migrations.test.ts.

interface ThrottledUpstreamReclassifyCap {
  slug: string;
  quotaCap: number;
}

interface ThrottledUpstreamReclassifySource {
  slug: string;
  rateLimit: ManifestKnownRateLimit;
}

// Vendor rate-limit citations — one entry per reclassified capability,
// mirrored 1:1 on that capability's manifest known_rate_limit field.
// quotaCap (below) is derived from these, not hand-computed. Exported so
// startup-migrations.test.ts can assert this list stays byte-identical
// to each corresponding manifest's known_rate_limit.
export const PHASE_C1_THROTTLED_UPSTREAM_SOURCE: ReadonlyArray<ThrottledUpstreamReclassifySource> = [
  { slug: "brazilian-company-data", rateLimit: { value: 3, unit: "per_minute", source_url: "https://receitaws.com.br/api" } },
  { slug: "address-geocode", rateLimit: { value: 4, unit: "per_minute", source_url: "https://operations.osmfoundation.org/policies/nominatim/" } },
  { slug: "address-validate", rateLimit: { value: 4, unit: "per_minute", source_url: "https://operations.osmfoundation.org/policies/nominatim/" } },
  { slug: "weather-lookup", rateLimit: { value: 10000, unit: "per_day", source_url: "https://open-meteo.com/en/pricing" } },
  { slug: "ip-geolocation", rateLimit: { value: 45, unit: "per_minute", source_url: "https://ip-api.com/docs/api:json" } },
  { slug: "ip-risk-score", rateLimit: { value: 45, unit: "per_minute", source_url: "https://ip-api.com/docs/api:json" } },
  { slug: "sec-filing-events", rateLimit: { value: 10, unit: "per_second", source_url: "https://www.sec.gov/os/webmaster-faq" } },
  { slug: "contract-verify-check", rateLimit: { value: 100000, unit: "per_day", source_url: "https://docs.etherscan.io/etherscan-v2/rate-limits" } },
  { slug: "gas-price-check", rateLimit: { value: 100000, unit: "per_day", source_url: "https://docs.etherscan.io/etherscan-v2/rate-limits" } },
  { slug: "wallet-age-check", rateLimit: { value: 100000, unit: "per_day", source_url: "https://docs.etherscan.io/etherscan-v2/rate-limits" } },
  { slug: "wallet-balance-lookup", rateLimit: { value: 100000, unit: "per_day", source_url: "https://docs.etherscan.io/etherscan-v2/rate-limits" } },
  { slug: "wallet-transactions-lookup", rateLimit: { value: 100000, unit: "per_day", source_url: "https://docs.etherscan.io/etherscan-v2/rate-limits" } },
  { slug: "barcode-lookup", rateLimit: { value: 15, unit: "per_minute", source_url: "https://openfoodfacts.github.io/openfoodfacts-server/api/" } },
  { slug: "crypto-price", rateLimit: { value: 5, unit: "per_minute", source_url: "https://support.coingecko.com/hc/en-us/articles/4538771776153" } },
  { slug: "company-news", rateLimit: { value: 12, unit: "per_minute", source_url: "https://blog.gdeltproject.org/ukraine-api-rate-limiting-web-ngrams-3-0/" } },
  { slug: "approval-security-check", rateLimit: { value: 30, unit: "per_minute", source_url: "https://docs.gopluslabs.io/reference/support" } },
  { slug: "phishing-site-check", rateLimit: { value: 30, unit: "per_minute", source_url: "https://docs.gopluslabs.io/reference/support" } },
  { slug: "token-security-check", rateLimit: { value: 30, unit: "per_minute", source_url: "https://docs.gopluslabs.io/reference/support" } },
  { slug: "wallet-risk-score", rateLimit: { value: 30, unit: "per_minute", source_url: "https://docs.gopluslabs.io/reference/support" } },
];

export const PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY: ReadonlyArray<ThrottledUpstreamReclassifyCap> =
  PHASE_C1_THROTTLED_UPSTREAM_SOURCE.map((c) => ({
    slug: c.slug,
    quotaCap: deriveQuotaCapFromRateLimit(c.rateLimit),
  }));

export async function runMigration0082_reclassifyThrottledFreeUnlimited(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  // Single VALUES-CTE UPDATE (same shape as Block 0072, which already
  // solved "19 rows, each with a different quota_cap" in one round trip)
  // rather than a per-cap loop — at 19 rows this is well past the point
  // where Block 0075's 8-row "keeps the SQL trivial for chat review"
  // trade-off still wins. Reclassification, not first-time
  // classification, so the safety filter is `c.cost_class =
  // 'free_unlimited'` rather than `IS NULL`. This also means a cap
  // manually reclassified to something else between deploys (e.g. an
  // operator moved one to paid_prepaid) is left alone.
  const valuesRows = PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY.map((c) => {
    const slug = c.slug.replace(/'/g, "''");
    return `('${slug}', ${c.quotaCap})`;
  }).join(",\n      ");

  const result = await tx.execute(sql.raw(`
    UPDATE capabilities AS c
       SET cost_class = 'free_quota',
           quota_window = 'daily',
           quota_cap = v.quota_cap,
           quota_reset_dom = NULL,
           updated_at = NOW()
      FROM (VALUES
      ${valuesRows}
      ) AS v(slug, quota_cap)
     WHERE c.slug = v.slug
       AND c.cost_class = 'free_unlimited'
  `));
  const updateCount = (result as { count?: number }).count ?? 0;

  return {
    block: "0082_reclassify_throttled_free_unlimited",
    outcome:
      updateCount === 0
        ? `no rows to reclassify (all ${PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY.length} slugs already non-free_unlimited)`
        : `reclassified ${updateCount} cap(s) from free_unlimited to free_quota (of ${PHASE_C1_THROTTLED_UPSTREAM_RECLASSIFY.length} target slugs)`,
    rows_affected: updateCount,
    duration_ms: Date.now() - startedAt,
  };
}
