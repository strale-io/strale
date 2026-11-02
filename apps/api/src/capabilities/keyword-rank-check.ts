import { registerCapability, type CapabilityInput } from "./index.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import {
  describeResultDomain,
  resolveSerperLinks,
  startSerperBudget,
  usableResultUrl,
} from "../lib/serper-links.js";
import { resolveCountryOrThrow } from "./lib/iso-3166.js";
import { resolveLanguageOrThrow } from "./lib/language-tag.js";

registerCapability("keyword-rank-check", async (input: CapabilityInput) => {
  // One budget for the whole Serper leg, taken before any input work.
  // Round-2 review: the search used to ask for the entire 15 s
  // SYNC_TRANSACTION_WALL_MS and resolution then added its own slice on
  // top, so a slow pair could exceed the wall and the caller would get an
  // infrastructure error instead of this capability's designed answer.
  const budget = startSerperBudget();
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
  // unguarded-fetch-ok: fixed licensed Serper API host
  const resp = await meteredVendorFetch("serper", "https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
    body: JSON.stringify({ q: keyword, gl: country, hl: language, num: depth }),
    signal: AbortSignal.timeout(budget.searchTimeoutMs),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`Serper API returned HTTP ${resp.status}: ${err.slice(0, 200)}`);
  }

  const data = await resp.json();

  // Google wraps every organic link past the top three in an opaque
  // `google.com/goto` redirect (2026-10-30). Undo that before a domain is
  // derived from anything: the old `extractDomain` read `www.google.com` off
  // the wrapper and happily compared it against the caller's target, so a
  // rank check past position 3 was answering about the wrong host.
  const resolution = await resolveSerperLinks(data, serperKey, undefined, budget.resolveDeadline);

  const organicResults = ((data.organic as any[]) ?? []).map((item: any, idx: number) => {
    const link = (item.link as string) ?? (item.url as string) ?? "";
    const host = describeResultDomain(link, item.displayedLink);
    return {
      url: usableResultUrl(link),
      title: (item.title as string) ?? "",
      snippet: (item.snippet as string) ?? "",
      position: (item.position as number) ?? idx + 1,
      domain: host.domain,
      // Where the host came from. `breadcrumb` means Google's display
      // breadcrumb named it while the link itself stayed opaque — see the
      // output field below for why the caller is told.
      domain_source: host.source,
    };
  });

  const resultsScanned = organicResults.length;

  // Results whose host could not be established at all, and results whose
  // host came only from Google's display breadcrumb. Round-2 review: the
  // second group must block too. A breadcrumb is Google's *display* URL, and
  // for AMP, syndicated and redirecting results it is routinely not the
  // destination host — so a breadcrumb-derived position could still be the
  // caller's domain under a different host, and reporting a rank from it is
  // the guess this capability exists to refuse.
  //
  // Indices, not position numbers. Round-2 review: `competitors_above` is
  // built with `slice(0, matchIdx)`, so comparing position *values* against
  // the match let an unresolved result land among the competitors without
  // blocking whenever Serper's array order and its `position` values
  // disagree. One space, used by both tests.
  const uncertainIdx = organicResults
    .map((r, idx) => (r.domain === null || r.domain_source === "breadcrumb" ? idx : -1))
    .filter((idx) => idx >= 0);

  // Find the first (best) match for our target domain among the scanned results.
  const matchIdx = organicResults.findIndex((r) => domainsMatch(r.domain, domain));

  // An uncertain host above the best match — or anywhere at all, when there
  // is no match — could be the caller's own domain, so neither `position` nor
  // `found: false` can be stated. Refusing is the only honest answer: a
  // ranking a customer pays for must not be a guess. (DEC-20260428-B: never
  // assert a fact the input does not support.)
  // `<=`, not `<`. The match itself can be the uncertain one: a position whose
  // host came only from the breadcrumb can *be* what we matched on, in which
  // case the reported rank rests on Google's display URL rather than on the
  // destination — the same guess, one step further in.
  const blocking = uncertainIdx.filter((idx) => matchIdx < 0 || idx <= matchIdx);
  if (blocking.length > 0) {
    const positions = blocking.map((idx) => organicResults[idx].position);
    throw new Error(
      `Google returned opaque redirect links for result position(s) ${positions.join(", ")} ` +
        `and Serper's link resolution did not return a real URL for them` +
        `${resolution.error ? ` (${resolution.error})` : ""}. ` +
        `Those positions could be "${domain}", so no ranking is reported rather than a possibly wrong one. ` +
        `Retry shortly; this is a transient upstream condition.`,
    );
  }
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
      // Honest about the redirect wrapper even on a clean answer: positions
      // below the match may stay opaque, and a caller reading
      // `competitors_above` deserves to know none were hidden.
      unresolved_positions: organicResults
        .filter((r) => r.domain === null)
        .map((r) => r.position)
        .sort((a, b) => a - b),
      // Positions whose host came from Google's display breadcrumb rather
      // than from the destination URL. Round-2 review: the previous version
      // reported these as ordinary known hosts, so a caller could not tell
      // that position 4 was never actually resolved.
      breadcrumb_derived_positions: organicResults
        .filter((r) => r.domain_source === "breadcrumb")
        .map((r) => r.position)
        .sort((a, b) => a - b),
      competitors_above: competitorsAbove,
    },
    provenance: { source: "google-serper", fetched_at: new Date().toISOString() },
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
function domainsMatch(resultDomain: string | null, targetDomain: string): boolean {
  if (!resultDomain || !targetDomain) return false;
  if (resultDomain === targetDomain) return true;
  return resultDomain.endsWith(`.${targetDomain}`);
}
