/**
 * VAT validation — single capability, multiple providers.
 *
 * Parses the input, dispatches to the right provider by country prefix, and
 * wraps every call with substrate-level cache + stale-fallback + a no-op
 * rate-limit seam (so swapping in real per-provider token buckets later is a
 * one-file change).
 *
 * Coverage today:
 *   - EU27 + XI (Northern Ireland)  → VIES
 *   - NO                            → Brønnøysundregistrene
 *   - CH, LI                        → Swiss UID register (public services)
 *   - GB                            → HMRC v2 (active when credentials are set)
 *
 * Adding a new country = add one provider module + one entry in the prefix
 * map below.
 */

import { registerCapability, type CapabilityInput } from "./index.js";
import { brregProvider } from "./lib/vat-providers/brreg.js";
import { hmrcProvider } from "./lib/vat-providers/hmrc.js";
import { uidChProvider } from "./lib/vat-providers/uid-ch.js";
import { viesProvider } from "./lib/vat-providers/vies.js";
import type {
  ParsedVat,
  VatProvider,
  VatProviderResult,
} from "./lib/vat-providers/types.js";

// ---------------------------------------------------------------------------
// Substrate: cache + stale-fallback
// ---------------------------------------------------------------------------

// 48h cache. VAT registration changes can happen — deregistration in
// particular is a real failure mode for Payee Assurance — but most agents
// are validating the same handful of counterparties repeatedly. 48h trades
// off freshness vs. upstream load and lands well within the "freshness lag"
// already disclosed in the manifest's limitations.
const CACHE_TTL_MS = 48 * 60 * 60 * 1000;

interface CachedResult {
  output: VatProviderResult;
  providerName: string;
  providerSource: string;
  cachedAt: number;
}

const cache = new Map<string, CachedResult>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.cachedAt > CACHE_TTL_MS) cache.delete(key);
  }
}, 60_000).unref();

// ---------------------------------------------------------------------------
// Substrate: rate-limit seam (no-op today, real implementation later)
// ---------------------------------------------------------------------------

/**
 * Wraps a provider call so that we have a single chokepoint to add per-provider
 * token buckets later (HMRC 3/s, Swiss UID 20/min, etc.). Today this is a
 * no-op — the substrate-level cache already cuts upstream load by ~90%, and
 * adding queues without traffic data would be premature.
 *
 * Plumbing the seam now means the day we need to flip it on, it's a one-file
 * change instead of an audit-the-whole-capability change.
 */
async function withRateLimit<T>(
  _providerName: string,
  fn: () => Promise<T>,
): Promise<T> {
  return fn();
}

// ---------------------------------------------------------------------------
// Provider routing
// ---------------------------------------------------------------------------

const ALL_PROVIDERS: readonly VatProvider[] = [
  viesProvider,
  brregProvider,
  uidChProvider,
  hmrcProvider,
];

const PROVIDER_BY_PREFIX = new Map<string, VatProvider>();
for (const provider of ALL_PROVIDERS) {
  for (const prefix of provider.prefixes) {
    PROVIDER_BY_PREFIX.set(prefix, provider);
  }
}

// ---------------------------------------------------------------------------
// Input parsing
// ---------------------------------------------------------------------------

/**
 * Parse a VAT number into country code + number.
 * Accepts inputs like:
 *   "SE556703748501", "SE 556703748501", "se556703748501",
 *   "NO123456789MVA", "CHE-123.456.789 MWST", "GB123456789"
 */
function parseVatNumber(raw: string): ParsedVat | null {
  const cleaned = raw.replace(/[\s.\-_]/g, "").toUpperCase();

  // Swiss UID: CHE + 9 digits + optional MWST/TVA/IVA
  const cheMatch = cleaned.match(/^(CHE)(\d{9})(MWST|TVA|IVA)?$/);
  if (cheMatch) {
    return {
      countryCode: "CH",
      number: cheMatch[2],
      full: `CHE${cheMatch[2]}${cheMatch[3] ?? ""}`,
    };
  }

  // Liechtenstein: LI prefix is sometimes used, sometimes CHE — both route to UID
  const liMatch = cleaned.match(/^(LI)(\d{5,12})$/);
  if (liMatch) {
    // Normalise to 9-digit form if possible (Liechtenstein UIDs are 9 digits)
    const digits = liMatch[2].padStart(9, "0").slice(-9);
    return { countryCode: "LI", number: digits, full: `LI${liMatch[2]}` };
  }

  // Norwegian MVA: NO + 9 digits + optional MVA
  const noMatch = cleaned.match(/^(NO)(\d{9})(MVA)?$/);
  if (noMatch) {
    return {
      countryCode: "NO",
      number: noMatch[2],
      full: `NO${noMatch[2]}${noMatch[3] ?? ""}`,
    };
  }

  // Generic: 2-letter prefix + 5-15 digits/alphanumerics (covers EU27 + GB)
  const generic = cleaned.match(/^([A-Z]{2})([A-Z0-9]{5,15})$/);
  if (generic) {
    return {
      countryCode: generic[1],
      number: generic[2],
      full: `${generic[1]}${generic[2]}`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Capability handler
// ---------------------------------------------------------------------------

registerCapability("vat-validate", async (input: CapabilityInput) => {
  const rawVat = input.vat_number ?? input.vat;
  if (typeof rawVat !== "string" || !rawVat) {
    throw new Error(
      "'vat_number' is required. Provide a VAT number including country prefix (e.g. SE556703748501, GB123456789, NO123456789MVA, CHE-123.456.789).",
    );
  }

  let parsed = parseVatNumber(rawVat);
  if (!parsed) {
    // Try to find a VAT-like pattern embedded in natural-language input
    const embedded = rawVat.match(/[A-Za-z]{2,3}[\s\-.]*[\dA-Za-z]{5,15}(\s*(MVA|MWST|TVA|IVA))?/);
    if (embedded) parsed = parseVatNumber(embedded[0]);
  }

  if (!parsed) {
    throw new Error(
      `Could not parse a VAT number from: "${rawVat}". Expected format: country code + digits (e.g. SE556703748501, GB123456789, NO123456789MVA, CHE-123.456.789).`,
    );
  }

  const provider = PROVIDER_BY_PREFIX.get(parsed.countryCode);
  if (!provider) {
    throw new Error(
      `VAT validation for country code "${parsed.countryCode}" is not yet supported. Currently covered: EU27 + XI (VIES), GB (HMRC), NO (Brreg), CH/LI (Swiss UID).`,
    );
  }

  const cacheKey = `${provider.name}:${parsed.full}`;
  const cached = cache.get(cacheKey);

  // Fresh cache hit — serve immediately, no upstream call
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    const ageHours = Math.round((Date.now() - cached.cachedAt) / 3_600_000);
    return {
      output: {
        ...cached.output,
        cache_hit: true,
        cached_at: new Date(cached.cachedAt).toISOString(),
        cache_age_hours: ageHours,
      },
      provenance: {
        source: `${cached.providerSource} (cached)`,
        fetched_at: new Date(cached.cachedAt).toISOString(),
      },
    };
  }

  // Cache miss — call upstream. On failure, fall back to stale cache if we
  // have one; this is the substrate guarantee — every provider gets the same
  // resilience treatment.
  try {
    const result = await withRateLimit(provider.name, () =>
      provider.validate(parsed),
    );

    cache.set(cacheKey, {
      output: result,
      providerName: provider.name,
      providerSource: provider.source,
      cachedAt: Date.now(),
    });

    return {
      output: { ...result },
      provenance: {
        source: provider.source,
        fetched_at: new Date().toISOString(),
        ...(result.source_reference
          ? { source_reference: result.source_reference }
          : {}),
      },
    };
  } catch (err) {
    if (cached) {
      // Stale-fallback: provider failed, but we have a previous answer for
      // this VAT. Serve it with stale=true so the agent's decision-readiness
      // logic can decide whether the staleness is acceptable.
      const ageHours = Math.round((Date.now() - cached.cachedAt) / 3_600_000);
      return {
        output: {
          ...cached.output,
          cache_hit: true,
          cached_at: new Date(cached.cachedAt).toISOString(),
          cache_age_hours: ageHours,
          stale: true,
          stale_reason: err instanceof Error ? err.message : String(err),
        },
        provenance: {
          source: `${cached.providerSource} (stale cache, upstream unavailable)`,
          fetched_at: new Date(cached.cachedAt).toISOString(),
        },
      };
    }
    throw err;
  }
});
