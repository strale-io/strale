/**
 * Company-name matching primitives.
 *
 * Lifted out of us-company-data.ts so registry capabilities and the shared
 * fetch libs can reuse them without importing across the capability boundary.
 * us-company-data re-exports these, so its public surface is unchanged.
 *
 * Every registry name-search API this codebase talks to is fuzzy and NONE of
 * them rank by relevance:
 *   - SEC EDGAR full-text search returns filings mentioning the name, not the
 *     entity itself.
 *   - Finland's PRH searches every historical name and orders by business ID.
 *   - Norway's Brreg orders alphabetically: "Telenor" returns NITO TELENOR (a
 *     union chapter) ahead of TELENOR ASA, and "Norsk Hydro" returns
 *     NORSK HYDROGENBILFORENING.
 *
 * Taking the first result from any of them yields a confidently-wrong legal
 * entity, which a caller cannot detect. Score the candidates and refuse when
 * nothing matches well.
 */

export type MatchConfidence = "exact" | "high" | "low";

// Common corporate suffixes / stopwords stripped before comparing names, so
// "Apple Inc" and "Apple Inc." compare equal. Applied as standalone tokens
// after punctuation has been flattened to spaces.
// Non-English legal forms matter more than they look. Every real customer query
// in the 90 days to 2026-08-09 was a single bare token — LEGO, Maersk, Nokia,
// Telenor — while registries return the full legal name. Without stripping the
// local suffix, "telenor" vs "TELENOR ASA" is a single-token partial match,
// which classifyNameMatch deliberately rates `low`, so a perfectly good query
// gets refused. With it stripped, both sides normalise to "telenor" and match
// exactly.
//
// A bare "as" (Norwegian) is deliberately NOT in the list: it is an ordinary
// English word and stripping it would corrupt unrelated names. "Telenor AS"
// still resolves, via the two-token Jaccard path rather than suffix stripping.
const CORP_SUFFIX_RE =
  /\b(incorporated|inc|corporation|corp|company|co|llc|ltd|limited|lp|plc|holdings?|group|the|asa|oyj|oy|ab|aps|gmbh|ag|nv|bv|sa|sas|sarl|srl|spa|kft)\b/gi;

/**
 * Normalize a company name for fuzzy comparison: lowercase, flatten punctuation
 * to spaces, drop common corporate suffixes, collapse whitespace.
 */
export function normalizeCompanyName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(CORP_SUFFIX_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Classify how well the name the caller asked for matches the name SEC EDGAR
 * actually returned for the resolved CIK.
 *
 * Why this exists: name lookups resolve via SEC full-text *filing* search
 * (`searchEdgar`), which returns the top-scoring filing that mentions the query
 * — not an entity lookup. For a private company with no filings of its own
 * (e.g. "Stripe Inc" pre-IPO) every hit is a *different* public filer that
 * merely mentions the name, so the capability would otherwise return someone
 * else's identity with no signal. This surfaces that risk (per the DEC-
 * 20260428-B "screening_signal" transparency spirit): callers gate on
 * `is_exact_match` / `match_confidence` rather than trusting a fuzzy hit.
 *
 * Errs toward "low": a correct-but-abbreviated match (e.g. "IBM" vs
 * "International Business Machines Corp") is flagged low, which is the safe
 * direction — a false "low" prompts a caller to verify; a false "exact" would
 * assert a wrong identity.
 */
export function classifyNameMatch(
  searched: string,
  matched: string,
): { match_confidence: MatchConfidence; is_exact_match: boolean } {
  const q = normalizeCompanyName(searched);
  const m = normalizeCompanyName(matched);
  if (!q || !m) return { match_confidence: "low", is_exact_match: false };
  if (q === m) return { match_confidence: "exact", is_exact_match: true };

  const qTokens = new Set(q.split(" "));
  const mTokens = new Set(m.split(" "));
  const intersection = [...qTokens].filter((t) => mTokens.has(t)).length;
  // Both sets are non-empty here (guarded above), so union is too.
  const jaccard = intersection / new Set([...qTokens, ...mTokens]).size;

  // A partial overlap only counts as "high" when BOTH names carry ≥2 tokens.
  // A single-token name (Stripe, Uber, Meta) that shares its one token with a
  // longer, different name ("Stripe Financial Holdings") is not a confident
  // match and must fall through to "low" — otherwise Jaccard 1/2 would call it
  // "high", the exact false-confidence this signal exists to prevent.
  const bothMultiToken = qTokens.size >= 2 && mTokens.size >= 2;
  return bothMultiToken && jaccard >= 0.5
    ? { match_confidence: "high", is_exact_match: false }
    : { match_confidence: "low", is_exact_match: false };
}
