/**
 * Upstream hosts whose terms forbid how Strale would use them.
 *
 * Strale resells lookups. "Free and keyless" answers whether Strale can call
 * an upstream, not whether it may sell what comes back, and a commercial
 * vendor's free tier is usually the tier that excludes exactly this. Two
 * vendor-terms audits found fifteen capabilities on the wrong side of that
 * line, some live and paid for months:
 *   docs/security/2026-09-06-vendor-terms-audit.md
 *   docs/security/2026-09-10-vendor-terms-audit-batch-2.md
 *
 * vendor-terms.test.ts holds the source tree to this list: a live code path
 * may not reach any of these hosts. An executor that does must be in
 * auto-register's DEACTIVATED map, and a shared client must refuse the call
 * behind a licence gate. Removing a host from this list is a licence
 * decision — record the plan or permission that changed the answer.
 *
 * When the M3 vendor-state model lands `config/vendors.yaml` with its terms /
 * redistribution verification record (docs/strategy/2026-09-10-m3-vendor-state-model.md,
 * gap G4, batch 3), derive this list from that file's verdicts instead of
 * keeping both — two lists for one fact is how the drift in these audits began.
 */
export const PROHIBITED_UPSTREAM_HOSTS: ReadonlyMap<string, string> = new Map([
  // 2026-09-06
  ["suggestqueries.google.com", "Google — an absolute prohibited target under DEC-20260813-A"],
  ["api.coingecko.com", "CoinGecko free Demo plan excludes commercial use"],
  ["ip-api.com", "ip-api.com free endpoint is non-commercial only"],
  ["internetdb.shodan.io", "Shodan InternetDB is licensed for non-commercial use only"],
  ["api.etherscan.io", "Etherscan API content is for personal, non-commercial use; resale for commercial purposes prohibited"],
  // 2026-09-10
  ["api.gopluslabs.io", "GoPlus bars commercial use of its data without explicit written permission"],
  ["api.aviationstack.com", "AviationStack free plan is personal, non-commercial use"],
  ["api.adzuna.com", "Adzuna permits publishing listings with branding; other commercial use is a 14-day trial"],
  ["hub.docker.com", "Docker bars replicating content for an unauthorized commercial service"],
  ["ethereum-rpc.publicnode.com", "PublicNode bars selling or re-using Service Content commercially"],
  ["rpc.ankr.com", "Ankr bars commercial exploitation of the Service without written consent"],
  ["eth.llamarpc.com", "terms unreadable and the endpoint answered HTTP 525 when checked"],
  ["cloudflare-eth.com", "Cloudflare's anonymous Ethereum gateway is discontinued"],
  // 2026-10-24 (DEC-20261023-A; see VENDOR_TERMS_RECORDS below). Listed for the
  // rule's never lane item 2 (getting around blocks) as much as for its terms,
  // which are unrecorded: this list also holds hosts barred for HOW they fetch.
  ["r.jina.ai", "Jina Reader retries a blocked fetch through its own proxy pool by default and was used on an anonymous tier whose commercial terms were never recorded"],
]);

/** Every prohibited host named in `text` as a URL (scheme://host). */
export function prohibitedHostsIn(text: string): string[] {
  const found: string[] = [];
  for (const host of PROHIBITED_UPSTREAM_HOSTS.keys()) {
    const re = new RegExp(`\\bhttps?://${host.replace(/\./g, "\\.")}(?=[/:?"'\`\\s]|$)`, "i");
    if (re.test(text)) found.push(host);
  }
  return found;
}

/**
 * What a vendor's terms say about Strale reselling its data, as read, with the
 * evidence (DEC-20261023-A: vendor data is allowed only when "the vendor's
 * terms permit resale, verified and recorded").
 *
 * `resale` is what the terms SAY, not what Strale would like: "unverified"
 * means nobody has read a current copy that settles it. Being unverified does
 * not by itself put a vendor on `PROHIBITED_UPSTREAM_HOSTS` (Jina is there
 * for how it fetches, see above); a vendor still in use with unverified terms
 * is an open decision, and the entry names where that decision is queued.
 *
 * `vendor-terms.test.ts` holds `capabilities` to the source tree: every
 * executor that calls one of `hosts` must be listed, so the record cannot
 * silently understate who depends on a vendor.
 */
export interface VendorTermsRecord {
  vendor: string;
  hosts: readonly string[];
  /** Vendor id passed to meteredVendorFetch, when calls go through it. */
  metered_id?: string;
  /** Executors that call one of `hosts`. */
  capabilities: readonly string[];
  resale: "permitted" | "prohibited" | "unverified";
  terms_url: string;
  /** ISO date the terms were read (or the read was attempted). */
  accessed: string;
  /** How the text was obtained, and its limits. */
  how_read: string;
  findings: readonly string[];
  /** Where the open question or the decision lives. */
  decision_ref: string;
}

export const VENDOR_TERMS_RECORDS: readonly VendorTermsRecord[] = [
  {
    vendor: "Serper.dev",
    hosts: ["google.serper.dev"],
    metered_id: "serper",
    capabilities: [
      "adverse-media-check",
      "backlink-check",
      "brand-mention-search",
      "google-news-search",
      "google-search",
      "keyword-rank-check",
      "serp-analyze",
      "serp-related-questions",
    ],
    resale: "unverified",
    terms_url: "https://serper.dev/terms",
    accessed: "2026-10-24",
    how_read:
      "serper.dev was unreachable from the 2026-10-24 session (environment network policy). Read instead: a " +
      "web-search tool's summary of, and excerpts from, a cached copy about 878 days old per that tool. The " +
      "quotations below are the tool's excerpts, not verified word-for-word against the page, and an ellipsis may " +
      "hide qualifying words.",
    findings: [
      "Licence is a B2B use licence ('Permission is granted to download the materials … for as long as your use case " +
        "requires'), not a transfer of title; no clause grants resale or sublicensing of results.",
      "Prohibits 'Mirror the materials on any other server as-is with no-value-added' — close to returning raw results.",
      "States 'Serper provides web-scraped data collected from public domain sources' and no affiliation with Google.",
      "Termination at any time, with or without cause.",
    ],
    decision_ref: "docs/company/DECISION-QUEUE.md DQ-39",
  },
  {
    vendor: "Jina AI (Reader)",
    hosts: ["r.jina.ai"],
    capabilities: [],
    resale: "unverified",
    terms_url: "https://jina.ai/legal/",
    accessed: "2026-10-24",
    how_read:
      "jina.ai was unreachable from the 2026-10-24 session. Read instead: the reader's open-source code " +
      "(github.com/jina-ai/reader, src/api/crawler.ts, src/dto/crawler-options.ts) and search summaries of jina.ai pages.",
    findings: [
      "Jina's sales FAQ (per search summary) says hosted-API commercial use is covered by its service terms for " +
        "signed-up, paying users; Strale called it keyless, on the anonymous tier, whose terms were never recorded.",
      "The hosted reader retries a non-200 fetch through its own rotating proxy pool unless X-Proxy: none is sent, " +
        "and does not report the target's status — DEC-20261023-A never lane item 2.",
      "Removed from every fetch path on 2026-10-24 (PR #723); listed in PROHIBITED_UPSTREAM_HOSTS so it cannot return.",
    ],
    decision_ref: "DEC-20261023-A (removed; no open decision)",
  },
];
