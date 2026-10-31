import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";
import {
  MAX_FETCHED_API_RESPONSE_BYTES,
  readJsonWithLimit,
  readTextWithLimit,
} from "../lib/resource-limits.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import { deriveResultDomain, isGotoLink, resolveSerperLinks } from "../lib/serper-links.js";

// F-0-006 Bucket D (preemptive migration): user domain is embedded in the
// query string to hardcoded third-party APIs (index.commoncrawl.org,
// google.serper.dev). Today the hostname is fixed and there is no SSRF
// surface. Migrated defensively to `safeFetch` per Phase C Observation #4:
// if either hostname is ever swapped to a user-provided value, the guard
// is already in place.
registerCapability("backlink-check", async (input: CapabilityInput) => {
  const raw = (
    (input.domain as string) ??
    (input.url as string) ??
    (input.site as string) ??
    ""
  ).trim();
  if (!raw) throw new Error("'domain' is required. Provide a domain to check backlinks for.");
  if (raw.length < 3) throw new Error("'domain' must be at least 3 characters.");

  // Clean domain
  const domain = raw
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .toLowerCase();

  let source = "commoncrawl.org";
  // Google redirect links that stayed opaque, so a dropped row is a reported
  // absence rather than a silent one.
  let unresolvedLinkCount = 0;
  const backlinks: Array<{
    source_url: string;
    source_domain: string;
    anchor_text: string | null;
    first_seen: string | null;
  }> = [];

  // Attempt 1: CommonCrawl Index API
  try {
    const ccUrl = `https://index.commoncrawl.org/CC-MAIN-2024-10-index?url=*.${encodeURIComponent(domain)}&output=json&limit=50`;
    const ccResp = await safeFetch(ccUrl, {
      headers: { "User-Agent": "Strale/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (ccResp.ok) {
      const text = await readTextWithLimit(
        ccResp,
        MAX_FETCHED_API_RESPONSE_BYTES,
        "domain",
        "a domain whose Common Crawl index response is",
      );
      const lines = text.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          const sourceUrl = record.url ?? "";
          const sourceDomain = extractDomain(sourceUrl);
          // Only include pages from OTHER domains linking to the target
          if (sourceDomain && sourceDomain !== domain) {
            backlinks.push({
              source_url: sourceUrl,
              source_domain: sourceDomain,
              anchor_text: null,
              first_seen: record.timestamp ?? null,
            });
          }
        } catch {
          // Skip malformed NDJSON lines
        }
      }
    }
  } catch {
    // CommonCrawl may timeout or be unavailable
  }

  // Attempt 2: If CommonCrawl yielded few results, try Serper.dev Google search
  if (backlinks.length < 5) {
    const serperKey = process.env.SERPER_API_KEY;
    if (serperKey) {
      try {
        const query = `"${domain}" -site:${domain}`;
        const resp = await meteredVendorFetch("serper", "https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, num: 10 }),
          signal: AbortSignal.timeout(10000),
        }, 1, safeFetch);

        if (resp.ok) {
          source = "google-serper";
          const data = await readJsonWithLimit<Record<string, unknown>>(
            resp,
            MAX_FETCHED_API_RESPONSE_BYTES,
            "domain",
          );
          // Google wraps every organic link past the top three in an opaque
          // `google.com/goto` redirect (2026-10-30). Unresolved, the old
          // `extractDomain` read `google.com` off each wrapper and pushed it
          // into `backlinks` — so `referring_domains_count` counted Google as
          // a site linking to the caller, and `source_url` was unopenable.
          await resolveSerperLinks(data, serperKey, safeFetch);
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
            if (isGotoLink(sourceUrl)) {
              unresolvedLinkCount += 1;
              continue;
            }
            const sourceDomain = deriveResultDomain(sourceUrl, item.displayedLink);
            if (!sourceDomain || sourceDomain === domain) continue;
            // Check if already in list
            if (!backlinks.some((b) => b.source_url === sourceUrl)) {
              backlinks.push({
                source_url: sourceUrl,
                source_domain: sourceDomain,
                anchor_text: item.title ?? null,
                first_seen: null,
              });
            }
          }
        }
      } catch {
        // Serper unavailable
      }
    }
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
      source,
      fetched_at: new Date().toISOString(),
      // The manifest default names CommonCrawl; the Serper fallback says so per call.
      ...(source === "google-serper"
        ? { acquisition_method: "vendor_api" as const, upstream_vendor: "serper" }
        : {}),
    },
  };
});

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
