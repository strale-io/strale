// Public campaign labels only. No storage, visitor IDs, raw query strings or form data.
export type Campaign = Partial<Record<"utm_source" | "utm_medium" | "utm_campaign" | "utm_content", string>>;
const LABEL = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export function campaignFromUrl(href: string): Campaign {
  try {
    const q = new URL(href).searchParams;
    const source = q.get("utm_source");
    if (source !== "x" && source !== "linkedin") return {};
    const campaign: Campaign = { utm_source: source };
    if (q.get("utm_medium") === "organic_social") campaign.utm_medium = "organic_social";
    for (const key of ["utm_campaign", "utm_content"] as const) {
      const value = q.get(key);
      if (value && LABEL.test(value)) campaign[key] = value;
    }
    return campaign;
  } catch { return {}; }
}
export function publicCampaignPath(path: string): boolean {
  return /^(?:\/$|\/(?:tools|company-data|use-cases|solutions|docs|guides)(?:\/|$)|\/(?:signup|pricing|about|security|privacy|terms)\/?$)/.test(path);
}
/** Remove incoming query/hash; rebuild only approved campaign fields on public pages. */
export function analyticsUrl(href: string, base: string, campaign: Campaign = {}): string {
  if (!href) return "";
  try {
    const url = new URL(href, base);
    if (!/^https?:$/.test(url.protocol)) return "";
    url.username = ""; url.password = ""; url.search = ""; url.hash = "";
    if (url.origin === new URL(base).origin && publicCampaignPath(url.pathname)) {
      for (const [key, value] of Object.entries(campaign)) url.searchParams.set(key, value);
    }
    return url.href;
  } catch { return ""; }
}
/** Carry attribution on public navigation without cookies/localStorage or visitor IDs. */
export function campaignLink(href: string, base: string, campaign: Campaign): string {
  if (!href || href.startsWith("#") || !campaign.utm_source) return href;
  try {
    const url = new URL(href, base);
    if (url.origin !== new URL(base).origin || !publicCampaignPath(url.pathname)) return href;
    if (url.searchParams.has("utm_source")) return href;
    for (const [key, value] of Object.entries(campaign)) url.searchParams.set(key, value);
    return url.href;
  } catch { return href; }
}
