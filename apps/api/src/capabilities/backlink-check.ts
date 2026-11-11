import { domainToASCII } from "node:url";
import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";
import { MAX_FETCHED_API_RESPONSE_BYTES, readJsonWithLimit } from "../lib/resource-limits.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import { fetchUnavailable, httpUnavailable, UpstreamUnavailableError } from "../lib/upstream-result.js";
import {
  deriveResultDomain,
  isGotoLink,
  resolveSerperLinks,
  startSerperBudget,
  usableResultUrl,
} from "../lib/serper-links.js";

const SERPER = "Serper Google search API";

interface Backlink {
  source_url: string;
  source_domain: string;
  anchor_text: string | null;
  first_seen: string | null;
}

// Serper's Google search is the only source. A Common Crawl leg was dropped in
// the PR #1017 review: its `url=*.domain` query returns only the domain's own
// hosts, which are never backlinks, so it never found one and only spent the
// shared budget. The user domain goes in the query to a hardcoded host
// (google.serper.dev), through `safeFetch` in case that ever changes
// (F-0-006 Bucket D).
registerCapability("backlink-check", async (input: CapabilityInput) => {
  // One budget for the search and link resolution, taken before any input
  // work. Round-2 review: the search used to ask for the entire 15 s
  // SYNC_TRANSACTION_WALL_MS and resolution then added its own slice on top,
  // so a slow pair could exceed the wall and the caller would get an
  // infrastructure error instead of this capability's designed answer.
  const budget = startSerperBudget();
  const raw = (
    (input.domain as string) ??
    (input.url as string) ??
    (input.site as string) ??
    ""
  ).trim();
  if (!raw) throw new Error("'domain' is required. Provide a domain to check backlinks for.");
  if (raw.length < 3) throw new Error("'domain' must be at least 3 characters.");

  const domain = normaliseDomain(raw);
  if (!domain) throw new Error("'domain' must be a valid domain name, such as example.com.");

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    // Required in production (config/env-manifest.yaml). Unset, there is no
    // source to ask: never a billed "0 backlinks". The key's name lets the
    // breaker read this as dependency_missing (PR #1017 review).
    throw new UpstreamUnavailableError(SERPER, "not configured on this deployment (SERPER_API_KEY is not set).", {
      code: "not_configured",
      retryable: false,
    });
  }

  // Google redirect links that stayed opaque, so a dropped row is a reported
  // absence rather than a silent one.
  let unresolvedLinkCount = 0;
  const backlinks: Backlink[] = [];

  try {
    const query = `"${domain}" -site:${domain}`;
    const resp = await meteredVendorFetch("serper", "https://google.serper.dev/search", {
      method: "POST",
      headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, num: 10 }),
      signal: AbortSignal.timeout(Math.max(1_000, Math.min(budget.searchTimeoutMs, budget.resolveDeadline - Date.now()))),
    }, 1, safeFetch);

    if (!resp.ok) {
      await resp.body?.cancel();
      throw httpUnavailable(SERPER, resp.status);
    }
    const data = await readJsonWithLimit<Record<string, unknown>>(
      resp,
      MAX_FETCHED_API_RESPONSE_BYTES,
      "domain",
    );
    if (!data || typeof data !== "object" || (data.organic !== undefined && !Array.isArray(data.organic))) {
      throw new UpstreamUnavailableError(SERPER, "the reply carried no result list.", { code: "unparseable", retryable: false });
    }
    // Google wraps every organic link past the top three in an opaque
    // `google.com/goto` redirect (2026-10-30). Unresolved, the old
    // `extractDomain` read `google.com` off each wrapper and pushed it
    // into `backlinks` — so `referring_domains_count` counted Google as
    // a site linking to the caller, and `source_url` was unopenable.
    await resolveSerperLinks(data, serperKey, safeFetch, budget.resolveDeadline);
    const organic = (data.organic as any[]) ?? [];
    for (const item of organic) {
      const sourceUrl = item.link ?? item.url ?? "";
      // A link whose real URL is unknown is dropped, not guessed at.
      // A backlink list is a list of addresses; an entry without one is
      // not a weaker row, it is a wrong row. `unresolved_link_count`
      // makes the absence visible rather than silent.
      //
      // The wrapper test comes first on purpose: it must count even
      // when no host could be derived at all, which is the ordinary
      // case for a wrapper with no `displayedLink` breadcrumb.
      // Round-2 review: test the URL, not just the wrapper. An
      // organic entry with no `link` at all but a `displayedLink`
      // breadcrumb used to be skipped (`extractDomain("")` was `""`);
      // deriving the host from the breadcrumb would now admit it with
      // `source_url: ""`, inflating `total_backlinks` and
      // `referring_domains_count` with an address nobody can open —
      // exactly the wrong row the comment above refuses.
      if (!usableResultUrl(sourceUrl)) {
        if (isGotoLink(sourceUrl)) unresolvedLinkCount += 1;
        continue;
      }
      const sourceDomain = deriveResultDomain(sourceUrl, item.displayedLink);
      if (!sourceDomain || isOwnHost(sourceDomain, domain)) continue;
      if (!backlinks.some((b) => b.source_url === sourceUrl)) {
        backlinks.push({
          source_url: sourceUrl,
          source_domain: sourceDomain,
          anchor_text: item.title ?? null,
          first_seen: null,
        });
      }
    }
  } catch (err) {
    // A search that did not answer is never "0 backlinks" (2026-11-06
    // swallowed-upstream-failures audit, row 16). fetchUnavailable returns
    // Strale's own vendor-account or test-traffic state, an
    // UpstreamUnavailableError and a defect unchanged.
    throw fetchUnavailable(SERPER, err);
  }

  // Compute referring domains
  const referringDomains = new Set(backlinks.map((b) => b.source_domain));

  // Compute top anchor texts
  const anchorCounts = new Map<string, number>();
  for (const bl of backlinks) {
    if (bl.anchor_text) {
      const key = bl.anchor_text.toLowerCase().trim();
      anchorCounts.set(key, (anchorCounts.get(key) ?? 0) + 1);
    }
  }
  const topAnchors = [...anchorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([text, count]) => ({ text, count }));

  return {
    output: {
      domain,
      backlinks,
      total_backlinks: backlinks.length,
      referring_domains_count: referringDomains.size,
      unresolved_link_count: unresolvedLinkCount,
      top_anchors: topAnchors,
      dofollow_estimate: null,
      nofollow_estimate: null,
    },
    provenance: {
      source: "google-serper",
      fetched_at: new Date().toISOString(),
      acquisition_method: "vendor_api" as const,
      upstream_vendor: "serper",
    },
  };
});

/**
 * The host to search for: scheme, path, user info, port, trailing dots and a
 * leading `www.` removed, lower case, and an internationalised name in its
 * ASCII (punycode) form, so "Google.COM:443", "google.com." and "google.com"
 * are one domain to the own-host filter (PR #1017 review). Empty when the
 * name is not a valid domain.
 */
function normaliseDomain(raw: string): string {
  const host = raw
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^[^@]*@/, "")
    .replace(/:\d*$/, "")
    .replace(/\.+$/, "")
    .replace(/^www\./, "");
  return domainToASCII(host);
}

/** The domain itself or one of its subdomains: a page that cannot be a backlink to it. */
function isOwnHost(host: string, domain: string): boolean {
  // "google.com." is google.com: a fully qualified name's trailing dot.
  const h = host.replace(/\.+$/, "");
  return h === domain || h.endsWith(`.${domain}`);
}
