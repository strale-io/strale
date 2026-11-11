import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";
import {
  MAX_FETCHED_API_RESPONSE_BYTES,
  readJsonWithLimit,
  readTextWithLimit,
} from "../lib/resource-limits.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import { fetchUnavailable, httpUnavailable, quotedLegCodes, UpstreamUnavailableError } from "../lib/upstream-result.js";
import {
  deriveResultDomain,
  isGotoLink,
  resolveSerperLinks,
  startSerperBudget,
  usableResultUrl,
} from "../lib/serper-links.js";

const COMMON_CRAWL = "Common Crawl index API";
const SERPER = "Serper Google search API";

interface Backlink {
  source_url: string;
  source_domain: string;
  anchor_text: string | null;
  first_seen: string | null;
}

// F-0-006 Bucket D (preemptive migration): user domain is embedded in the
// query string to hardcoded third-party APIs (index.commoncrawl.org,
// google.serper.dev). Today the hostname is fixed and there is no SSRF
// surface. Migrated defensively to `safeFetch` per Phase C Observation #4:
// if either hostname is ever swapped to a user-provided value, the guard
// is already in place.
registerCapability("backlink-check", async (input: CapabilityInput) => {
  // One budget for the whole Serper leg, taken before any input work.
  // Round-2 review: the search used to ask for the entire 15 s
  // SYNC_TRANSACTION_WALL_MS and resolution then added its own slice on
  // top, so a slow pair could exceed the wall and the caller would get an
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
  const backlinks: Backlink[] = [];
  // A leg that could not answer is named here, and the call throws when no leg
  // answered, or when Serper was needed, failed and nothing was found: an
  // empty list must mean the sources found nothing, never that they were down
  // (2026-11-06 swallowed-upstream-failures audit, row 16).
  const unavailableSources: string[] = [];
  const failures: Error[] = [];

  // Attempt 1: CommonCrawl Index API
  try {
    backlinks.push(...(await readCommonCrawl(domain, budget.searchTimeoutMs)));
  } catch (err) {
    // degraded-ok: a Common Crawl outage is named in unavailable_sources, and the call throws below unless Serper answers.
    if (!(err instanceof UpstreamUnavailableError)) throw err;
    failures.push(err);
    unavailableSources.push(COMMON_CRAWL);
  }
  let answered = failures.length === 0;

  // Attempt 2: If CommonCrawl yielded few results, try Serper.dev Google search
  if (backlinks.length < 5) {
    const serperKey = process.env.SERPER_API_KEY;
    if (!serperKey) {
      // Required in production (config/env-manifest.yaml). Unset, Serper was
      // needed and could not be asked: the same path as a failed Serper leg,
      // never a billed "0 backlinks" (PR #1015 delta review).
      failures.push(
        new UpstreamUnavailableError(SERPER, "not configured on this deployment.", { code: "not_configured", retryable: false }),
      );
      unavailableSources.push(SERPER);
      if (backlinks.length === 0) answered = false;
    } else {
      try {
        const query = `"${domain}" -site:${domain}`;
        const resp = await meteredVendorFetch("serper", "https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, num: 10 }),
          // Capped by what Common Crawl left of the shared budget, so the two
          // legs together stay inside SYNC_TRANSACTION_WALL_MS (round-2
          // review: each used to get its own full slice).
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
        source = "google-serper";
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
        answered = true;
      } catch (err) {
        // degraded-ok: a Serper failure is named in unavailable_sources; the call throws below when no backlink was found or Common Crawl did not answer either.
        const failure = fetchUnavailable(SERPER, err);
        if (!(failure instanceof UpstreamUnavailableError) && !isStraleVendorState(failure)) throw failure;
        failures.push(failure);
        unavailableSources.push(SERPER);
        // Common Crawl's `url=*.domain` query returns the domain's own pages,
        // which are never backlinks, so for most domains Serper is the only
        // source that can find any. With nothing found, a failed Serper leg
        // leaves no answer at all: "0 backlinks" would be a fabricated
        // negative (PR #1015 review).
        if (backlinks.length === 0) answered = false;
      }
    }
  }

  if (!answered) {
    // Strale's own Serper account state passes through unchanged: it is ours,
    // not the provider's, and must not count against the capability.
    const strale = failures.find(isStraleVendorState);
    if (strale) throw strale;
    // Serper alone when Common Crawl answered with nothing.
    if (failures.length === 1) throw failures[0];
    const upstream = failures as UpstreamUnavailableError[];
    throw new UpstreamUnavailableError(
      `${COMMON_CRAWL} and ${SERPER}`,
      `neither source answered (${quotedLegCodes(upstream)}).`,
      { code: upstream[0].code, retryable: upstream.some((f) => f.retryable) },
    );
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
      ...(unavailableSources.length > 0 ? { unavailable_sources: unavailableSources } : {}),
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
  if (!URL.canParse(url)) return "";
  return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
}

/** The domain itself or one of its subdomains: a page that cannot be a backlink to it. */
function isOwnHost(host: string, domain: string): boolean {
  // "google.com." is google.com: a fully qualified name's trailing dot.
  const h = host.replace(/\.$/, "");
  return h === domain || h.endsWith(`.${domain}`);
}

/** Strale's own vendor-account or test-traffic state, never the provider's outage. */
function isStraleVendorState(err: Error): boolean {
  return err.name === "VendorUnavailableError" || err.name === "PaidCallBlockedError";
}

/**
 * Common Crawl's captures for the domain. The index answers a domain it holds
 * no captures for with HTTP 404 (the real negative, `[]`). Any other non-OK
 * status, a timeout, or a body none of whose lines parse is not an answer and
 * throws UpstreamUnavailableError.
 */
async function readCommonCrawl(domain: string, timeoutMs: number): Promise<Backlink[]> {
  const ccUrl = `https://index.commoncrawl.org/CC-MAIN-2024-10-index?url=*.${encodeURIComponent(domain)}&output=json&limit=50`;
  let text: string;
  try {
    const ccResp = await safeFetch(ccUrl, {
      headers: { "User-Agent": "Strale/1.0" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (ccResp.status === 404) {
      await ccResp.body?.cancel();
      return [];
    }
    if (!ccResp.ok) {
      await ccResp.body?.cancel();
      throw httpUnavailable(COMMON_CRAWL, ccResp.status);
    }
    text = await readTextWithLimit(
      ccResp,
      MAX_FETCHED_API_RESPONSE_BYTES,
      "domain",
      "a domain whose Common Crawl index response is",
    );
  } catch (err) {
    throw fetchUnavailable(COMMON_CRAWL, err);
  }

  const backlinks: Backlink[] = [];
  const lines = text.trim().split("\n").filter(Boolean);
  let parsed = 0;
  for (const line of lines) {
    let record: Record<string, any>;
    try {
      record = JSON.parse(line);
    } catch {
      // degraded-ok: one malformed NDJSON line is skipped; a reply none of whose lines parse throws below.
      continue;
    }
    parsed += 1;
    const sourceUrl = record?.url ?? "";
    const sourceDomain = extractDomain(sourceUrl);
    // Only include pages from OTHER domains linking to the target; the
    // domain's own subdomains are not backlinks (PR #1015 delta review).
    if (sourceDomain && !isOwnHost(sourceDomain, domain)) {
      backlinks.push({
        source_url: sourceUrl,
        source_domain: sourceDomain,
        anchor_text: null,
        first_seen: record?.timestamp ?? null,
      });
    }
  }
  if (lines.length > 0 && parsed === 0) {
    throw new UpstreamUnavailableError(COMMON_CRAWL, "no line of the reply parsed.", { code: "unparseable", retryable: false });
  }
  return backlinks;
}
