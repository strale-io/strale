// Umami Cloud (EU region, cookieless), the same website as strale-frontend's index.html.
// Emitted in live builds only: a preview build must not send visits to the production site.
import type { SiteData } from "./types.ts";

export const UMAMI_SCRIPT = "https://cloud.umami.is/script.js";
export const UMAMI_WEBSITE_ID = "9f534d25-6ff4-43e0-aa20-780c2e087db4";

export function analyticsTag(mode: SiteData["mode"]): { src: string; websiteId: string } | null {
  return mode === "live" ? { src: UMAMI_SCRIPT, websiteId: UMAMI_WEBSITE_ID } : null;
}
