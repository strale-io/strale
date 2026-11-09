import { analyticsUrl, campaignFromUrl, campaignLink } from "../lib/campaign";
type EventName = "tool_run_started" | "tool_run_completed" | "tool_run_failed" | "signup_cta_clicked" | "signup_completed";
type Properties = Record<string, string>;
type AnalyticsWindow = Window & {
  umami?: { track: (name: string, data: Properties) => unknown };
  straleBeforeSend?: (type: string, payload: Record<string, unknown>) => Record<string, unknown>;
};
let enabled = false;
let ready = false;
const pending: Array<[EventName, Properties]> = [];
/** Measurement must never break signup or a tool call, including a blocked tracker. */
export function track(name: EventName, slug?: string): void {
  if (!enabled) return;
  try {
    const data: Properties = { ...campaignFromUrl(location.href) };
    if (slug && /^[a-z0-9-]{1,80}$/.test(slug)) data.tool = slug;
    if (!ready) {
      if (pending.length < 20) pending.push([name, data]);
      return;
    }
    void Promise.resolve((window as AnalyticsWindow).umami?.track(name, data)).catch(() => {});
  } catch { /* Analytics is best effort; customer actions continue. */ }
}
export function initAnalytics(): void {
  const config = document.querySelector<HTMLMetaElement>('meta[name="strale-analytics"]');
  if (enabled || !config || location.hostname !== config.dataset.domains) return;
  enabled = true;
  const campaign = campaignFromUrl(location.href);
  const target = window as AnalyticsWindow;
  target.straleBeforeSend = (_type, payload) => ({
    ...payload,
    url: analyticsUrl(String(payload.url ?? location.href), location.origin, campaign),
    referrer: analyticsUrl(String(payload.referrer ?? ""), location.origin),
  });
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    a.setAttribute("href", campaignLink(a.getAttribute("href")!, location.href, campaign));
  }
  document.addEventListener("click", (event) => {
    const a = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (a && a.origin === location.origin && a.pathname === "/signup") track("signup_cta_clicked");
  });
  // Define the sanitiser before the tracker executes its first page view.
  const script = document.createElement("script");
  script.src = config.dataset.src!;
  script.dataset.websiteId = config.dataset.websiteId!;
  script.dataset.domains = config.dataset.domains!;
  script.dataset.excludeSearch = "true";
  script.dataset.excludeHash = "true";
  script.dataset.beforeSend = "straleBeforeSend";
  script.onload = () => {
    ready = true;
    for (const [name, data] of pending.splice(0)) {
      try { void Promise.resolve(target.umami?.track(name, data)).catch(() => {}); } catch { /* best effort */ }
    }
  };
  script.onerror = () => { pending.length = 0; enabled = false; };
  document.head.append(script);
}
