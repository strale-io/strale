/**
 * Working out where a caller came from.
 *
 * The problem this solves, measured 2026-08-15: of 2,196 recorded discovery
 * hits, exactly **one** carried a source tag. Attribution depended entirely on
 * a `?src=` query parameter that only we can add — so it worked for links we
 * hand-submit and for nothing else. If our second paying customer arrived
 * tomorrow, we could not say how they found us, which makes every channel
 * decision a guess and makes any future marketing spend unmeasurable.
 *
 * The fix is to derive the source from what callers actually send, in
 * descending order of reliability:
 *
 *   1. an explicit `?src=` tag (we put it there; trust it completely)
 *   2. the `Referer` header (the directory's own page linked to us)
 *   3. a recognised crawler user agent (the directory's indexer fetched us)
 *   4. otherwise `null` — genuinely unknown, and recorded as such
 *
 * Deliberately NOT included: any attempt to fingerprint an individual caller.
 * The daily-rotating IP salt exists so we cannot build a cross-session profile,
 * and source attribution does not need one. This module answers "which venue"
 * and never "which person".
 */

/**
 * Known venues, matched against user agent then referer host. Keys are the
 * canonical source tag written to `discovery_hits.src_tag`; the array holds
 * substrings identifying that venue.
 *
 * Adding a venue here is how a new directory becomes measurable. Keep the
 * needles specific — a loose match silently reattributes traffic, which is
 * worse than leaving it unknown.
 */
const VENUE_SIGNATURES: Record<string, string[]> = {
  smithery: ["smithery"],
  glama: ["glama"],
  "agent-tools-cloud": ["agent-tools.cloud"],
  "x402-observatory": ["x402-observatory"],
  "aisec-registry": ["aisec-registry"],
  "402-index": ["402index", "402.index"],
  x402scan: ["x402scan"],
  "mcp-scoring": ["mcpscoringengine"],
  glimind: ["glimind"],
  mcpbeat: ["mcpbeat"],
  yellowmcp: ["yellowmcp"],
  "reliability-bureau": ["reliability-bureau"],
  bazaar: ["cdp.coinbase", "coinbase"],
  github: ["github.com"],
  npm: ["npmjs.com", "npmjs.org"],
  "chatgpt-referral": ["chatgpt.com", "openai.com"],
  "claude-referral": ["claude.ai", "anthropic.com"],
  perplexity: ["perplexity.ai"],
};

/** Venue plus how confident we are, so a consumer can weight the evidence. */
export interface DiscoverySource {
  tag: string;
  /** `tagged` = we put it there; `referer` = their page linked us; `agent` = their crawler. */
  basis: "tagged" | "referer" | "agent";
}

function matchVenue(haystack: string): string | null {
  const h = haystack.toLowerCase();
  for (const [tag, needles] of Object.entries(VENUE_SIGNATURES)) {
    if (needles.some((n) => h.includes(n))) return tag;
  }
  return null;
}

/**
 * Resolve a source. Returns null when genuinely unknown — never a guess, and
 * never a catch-all bucket that would inflate one venue's apparent
 * contribution.
 */
export function resolveDiscoverySource(input: {
  src?: string | null;
  referer?: string | null;
  userAgent?: string | null;
}): DiscoverySource | null {
  // 1. Explicit tag. Ours, so trusted, but still bounded — a caller can put
  // anything in a query string and this value is stored.
  const explicit = input.src?.trim();
  if (explicit) return { tag: explicit.slice(0, 64), basis: "tagged" };

  // 2. Referer: the venue's own page sent them. Parse the host rather than
  // substring-matching the whole URL, so a path containing "github.com" in a
  // query parameter cannot masquerade as a GitHub referral.
  const ref = input.referer?.trim();
  if (ref) {
    try {
      const host = new URL(ref).hostname;
      const venue = matchVenue(host);
      if (venue) return { tag: venue, basis: "referer" };
      // Unrecognised but real referrer: keep the host. It is the single most
      // useful field for discovering venues we do not yet know about.
      return { tag: `ref:${host.slice(0, 58)}`, basis: "referer" };
    } catch {
      // Malformed Referer — ignore rather than store junk.
    }
  }

  // 3. The venue's crawler identified itself.
  const ua = input.userAgent?.trim();
  if (ua) {
    const venue = matchVenue(ua);
    if (venue) return { tag: venue, basis: "agent" };
  }

  return null;
}

/** Exposed for the directory map in docs/company/DISTRIBUTION-FINDINGS.md. */
export const KNOWN_VENUES = Object.keys(VENUE_SIGNATURES);
