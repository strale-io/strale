import { registerCapability, type CapabilityInput } from "./index.js";
import { resolveCountryOrThrow } from "./lib/iso-3166.js";
import { resolveLanguageOrThrow } from "./lib/language-tag.js";

registerCapability("keyword-rank-check", async (input: CapabilityInput) => {
  const rawDomain = (
    (input.domain as string) ??
    (input.url as string) ??
    (input.site as string) ??
    ""
  ).trim();
  if (!rawDomain) {
    throw new Error(
      "'domain' is required. Provide the domain (or 'url'/'site') to check ranking for.",
    );
  }
  if (rawDomain.length < 2) {
    throw new Error("'domain' must be at least 2 characters.");
  }

  const domain = normalizeHostname(rawDomain);
  if (!domain) {
    throw new Error(
      `'domain' could not be parsed into a valid hostname: "${rawDomain}"`,
    );
  }
  // Reject bare public suffixes. Without this they pass validation and then
  // match EVERY result: domain "com" makes domainsMatch("stripe.com", "com")
  // true via the `.com` suffix test, so the caller is billed for a confident
  // `found: true, position: 1` that means nothing. Same for a typo'd bare
  // name ("stripe") and for multi-label suffixes ("co.uk"), which a simple
  // "must contain a dot" check would let through.
  //
  // This is a pragmatic list, not a full Public Suffix List — pulling in a
  // PSL dependency to catch the long tail of registry suffixes isn't worth it
  // for an input-validation guard. It covers the realistic mistakes; an
  // exotic suffix would still slip through, which is documented as a
  // limitation on the manifest.
  if (!domain.includes(".") || isBarePublicSuffix(domain)) {
    throw new Error(
      `'domain' must be a full registrable hostname such as "example.com" — got "${rawDomain}". ` +
        `A bare name or a public suffix cannot be matched against search results.`,
    );
  }

  const keyword = (
    (input.keyword as string) ??
    (input.query as string) ??
    (input.search as string) ??
    (input.term as string) ??
    ""
  ).trim();
  if (!keyword) {
    throw new Error(
      "'keyword' is required. Provide a search term to check ranking for.",
    );
  }
  if (keyword.length < 2) {
    throw new Error("'keyword' must be at least 2 characters.");
  }

  // Validate before spending a Serper call. Serper silently ignores an
  // unrecognised `gl`, so an unresolvable country used to buy an unscoped
  // search while the response echoed the caller's bogus value back — and here
  // that also means the reported rank is for the wrong market.
  const country = resolveCountryOrThrow(input.country, { fallback: "us" }).toLowerCase();
  const language = resolveLanguageOrThrow(input.language, { fallback: "en" });

  let depth = 10;
  if (input.depth !== undefined && input.depth !== null) {
    const parsed = Number(input.depth);
    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new Error("'depth' must be a positive number.");
    }
    depth = Math.min(Math.floor(parsed), 100);
  }

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) throw new Error("SERPER_API_KEY is required.");

  // F-0-006 Bucket D — no URL validation needed, and safeFetch is deliberately
  // not used here. This capability accepts `domain`/`url`/`site` from the
  // caller, but that value is NEVER fetched: it is normalised to a hostname
  // and used only for string comparison against the hostnames Serper returns
  // (see domainsMatch below). The single network call goes to the hardcoded
  // https://google.serper.dev/search endpoint, which is not caller-influenced,
  // so there is no SSRF surface to guard. Same shape as google-search.ts and
  // serp-analyze.ts, which call the identical fixed endpoint.
  const resp = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: keyword, gl: country, hl: language, num: depth }),
    signal: AbortSignal.timeout(15000),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Serper API returned HTTP ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();

  const organicResults = ((data.organic as any[]) ?? []).map((item: any, idx: number) => ({
    url: (item.link as string) ?? (item.url as string) ?? "",
    title: (item.title as string) ?? "",
    snippet: (item.snippet as string) ?? "",
    position: (item.position as number) ?? idx + 1,
    domain: extractDomain((item.link as string) ?? (item.url as string) ?? ""),
  }));

  const resultsScanned = organicResults.length;

  // Find the first (best) match for our target domain among the scanned results.
  const matchIdx = organicResults.findIndex((r) => domainsMatch(r.domain, domain));
  const match = matchIdx >= 0 ? organicResults[matchIdx] : null;

  const competitorsAbove = match
    ? organicResults.slice(0, matchIdx).map((r) => ({
        position: r.position,
        domain: r.domain,
        url: r.url,
        title: r.title,
      }))
    : [];

  const position = match ? match.position : null;
  const page = position !== null ? Math.ceil(position / 10) : null;

  return {
    output: {
      domain,
      keyword,
      country,
      language,
      found: !!match,
      position,
      page,
      url: match ? match.url : null,
      title: match ? match.title : null,
      snippet: match ? match.snippet : null,
      results_scanned: resultsScanned,
      scan_depth_requested: depth,
      competitors_above: competitorsAbove,
    },
    provenance: { source: "google.com", fetched_at: new Date().toISOString() },
  };
});

/**
 * Normalize a domain/url/site input down to a bare registrable hostname:
 * strips protocol, path, query, port, and a leading "www." label.
 */
function normalizeHostname(raw: string): string {
  let value = raw.trim();
  if (!value) return "";

  // Add a scheme if missing so URL() can parse bare domains like "example.com/path".
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const hostname = new URL(candidate).hostname.toLowerCase();
    return hostname.replace(/^www\./, "");
  } catch {
    // Fall back to a best-effort strip for inputs URL() can't parse.
    return value
      .toLowerCase()
      .replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]
      .split(":")[0];
  }
}

/**
 * Common multi-label public suffixes. A caller passing one of these bare
 * (e.g. "co.uk") would otherwise match every result under that suffix.
 * Deliberately a short pragmatic list rather than the full Public Suffix
 * List — see the call site.
 */
const BARE_PUBLIC_SUFFIXES = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk", "net.uk", "sch.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "net.nz", "org.nz",
  "co.jp", "or.jp", "ne.jp", "ac.jp", "go.jp",
  "com.br", "net.br", "org.br", "gov.br",
  "co.za", "org.za", "net.za",
  "com.cn", "net.cn", "org.cn", "gov.cn",
  "co.in", "net.in", "org.in", "gov.in",
  "com.mx", "com.ar", "com.tr", "com.sg", "com.hk", "com.tw",
]);

function isBarePublicSuffix(domain: string): boolean {
  return BARE_PUBLIC_SUFFIXES.has(domain);
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/**
 * Compares a result's domain against the target domain.
 *
 * Matching is DOWNWARD ONLY: asking about "example.com" matches a result on
 * "blog.example.com", because a subdomain's ranking is genuinely your site
 * ranking. The reverse is not true and used to be accepted:
 *
 *     targetDomain.endsWith(`.${resultDomain}`)   // REMOVED
 *
 * That made asking about "blog.stripe.com" match a result on "stripe.com" —
 * reporting a completely different host's position as the caller's own. That
 * is a wrong answer, not a lenient one, and subdomain rank tracking
 * ("blog.", "docs.", "shop.") is a mainstream use of this capability.
 */
function domainsMatch(resultDomain: string, targetDomain: string): boolean {
  if (!resultDomain || !targetDomain) return false;
  if (resultDomain === targetDomain) return true;
  return resultDomain.endsWith(`.${targetDomain}`);
}
