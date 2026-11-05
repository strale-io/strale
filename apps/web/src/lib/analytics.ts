// Head tags that exist in live builds only (Base.astro renders exactly what this returns).
// A preview build must not send visits to the production Umami site, must not claim the domain
// with a search-console token, and must stay out of search indexes.
//
// Umami Cloud (EU region, cookieless), the same website as strale-frontend's index.html.
import type { SiteData } from "./types.ts";

export const UMAMI_SCRIPT = "https://cloud.umami.is/script.js";
export const UMAMI_WEBSITE_ID = "9f534d25-6ff4-43e0-aa20-780c2e087db4";
/** Search Console token, copied from strale-frontend's index.html. */
export const GOOGLE_SITE_VERIFICATION = "XQvx0pAgAE14Bs50A6mWPLPjTohQIA6gs4m-WseUizo";

export interface LiveHead {
  noindex: boolean;
  verification: string | null;
  analytics: { src: string; websiteId: string; domains: string; excludeSearch: "true" } | null;
}

/**
 * excludeSearch: audit links carry a 90-day bearer token in the query string; Umami must not
 * record it. domains: Umami ignores visits from any other host (a *.pages.dev preview).
 */
export function liveHead(mode: SiteData["mode"], site: string | URL, pageNoindex = false): LiveHead {
  const live = mode === "live";
  return {
    noindex: !live || pageNoindex,
    verification: live ? GOOGLE_SITE_VERIFICATION : null,
    analytics: live ? { src: UMAMI_SCRIPT, websiteId: UMAMI_WEBSITE_ID, domains: new URL(site).hostname, excludeSearch: "true" } : null,
  };
}
