import { registerCapability, type CapabilityInput } from "./index.js";
import {
  MAX_PAGESPEED_REPORT_BYTES,
  readErrorTextTruncated,
  readJsonWithLimit,
  ResourceLimitError,
} from "../lib/resource-limits.js";
import { assertTargetAllowed } from "../lib/tos-blocklist.js";

/**
 * Only what this capability reads. PSI's report has hundreds of other fields;
 * naming the handful we consume keeps the `any` casts below honest about the
 * fact that everything past `audits` is vendor-shaped.
 */
interface PageSpeedResponse {
  lighthouseResult?: {
    categories?: { performance?: { score?: number | null } };
    audits?: Record<string, any>;
  };
}

// F-0-006 Bucket D: user URL is url-encoded and sent to the HARDCODED
// Google PageSpeed API endpoint. We never fetch the user's URL directly —
// Google does, from their network.
registerCapability("page-speed-test", async (input: CapabilityInput) => {
  const rawUrl = ((input.url as string) ?? (input.task as string) ?? "").trim();
  // ToS gate: sending a prohibited URL to a vendor/API to fetch on our
  // behalf is the same policy violation by proxy (money-integrity 2026-08-12).
  assertTargetAllowed(rawUrl);
  if (!rawUrl) throw new Error("'url' is required. Provide a URL to test page speed.");

  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const strategy = ((input.strategy as string) ?? "mobile").trim().toLowerCase();
  if (strategy !== "mobile" && strategy !== "desktop") {
    throw new Error("'strategy' must be 'mobile' or 'desktop'.");
  }

  // Build PageSpeed Insights API URL
  let apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}&strategy=${strategy}&category=performance`;

  const apiKey = process.env.PAGESPEED_API_KEY;
  if (apiKey) {
    apiUrl += `&key=${apiKey}`;
  }

  // unguarded-fetch-ok: fixed googleapis.com PSI host; caller URL gated by assertTargetAllowed above
  const resp = await fetch(apiUrl, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(60000), // PSI can be slow
  });

  if (!resp.ok) {
    const err = await readErrorTextTruncated(resp);
    throw new Error(`PageSpeed Insights returned HTTP ${resp.status}: ${err.slice(0, 300)}`);
  }

  // Bounded (#434), closing the last sanctioned unbounded read in the
  // caller-URL guard's ledger. PSI returns the whole Lighthouse report, of
  // which this capability keeps about 2 KB — the largest output ever stored
  // for it in production is 2,306 bytes.
  //
  // An oversize here is classified UPSTREAM, not caller_input, and that is a
  // deliberate departure from every other cap in this family. The cap sits
  // 1.8x above the mathematical ceiling of the report format (see
  // MAX_PAGESPEED_REPORT_BYTES for the derivation), so no page a caller can
  // name will reach it. A response above it means Google emitted something
  // outside its own documented structure, which is a vendor anomaly and
  // *should* count against the capability's health — blaming the caller here
  // would be both inaccurate and a way of hiding a real upstream problem.
  //
  // Hence the plain Error rather than letting ResourceLimitError through: that
  // class carries `isCapabilityRefusal`, which is exactly what this is not.
  let data: PageSpeedResponse;
  try {
    data = await readJsonWithLimit<PageSpeedResponse>(resp, MAX_PAGESPEED_REPORT_BYTES);
  } catch (err) {
    if (!(err instanceof ResourceLimitError)) throw err;
    throw new Error(
      `PageSpeed Insights returned a report larger than ${MAX_PAGESPEED_REPORT_BYTES / 1024 / 1024}MB, ` +
        `beyond what Lighthouse can produce for any page — treating it as an upstream fault.`,
    );
  }
  const lighthouse = data.lighthouseResult;
  if (!lighthouse) throw new Error("PageSpeed Insights did not return Lighthouse results.");

  // Performance score
  const performanceScore = Math.round(
    (lighthouse.categories?.performance?.score ?? 0) * 100,
  );

  // Core Web Vitals + metrics
  const audits = lighthouse.audits ?? {};
  const lcp = audits["largest-contentful-paint"]?.numericValue ?? null;
  const fcp = audits["first-contentful-paint"]?.numericValue ?? null;
  const cls = audits["cumulative-layout-shift"]?.numericValue ?? null;
  const tbt = audits["total-blocking-time"]?.numericValue ?? null;
  const speedIndex = audits["speed-index"]?.numericValue ?? null;
  const ttfb = audits["server-response-time"]?.numericValue ?? null;

  // Opportunities (actionable items with savings)
  const opportunities: Array<{ title: string; savings_ms: number; description: string }> = [];
  for (const [, audit] of Object.entries(audits) as [string, any][]) {
    if (
      audit.details?.type === "opportunity" &&
      audit.details?.overallSavingsMs > 0
    ) {
      opportunities.push({
        title: audit.title ?? "",
        savings_ms: Math.round(audit.details.overallSavingsMs),
        description: audit.description ?? "",
      });
    }
  }
  opportunities.sort((a, b) => b.savings_ms - a.savings_ms);

  // Diagnostics
  const diagnostics: Array<{ title: string; description: string; displayValue: string | null }> = [];
  const diagnosticIds = [
    "dom-size",
    "mainthread-work-breakdown",
    "bootup-time",
    "font-display",
    "uses-passive-event-listeners",
    "critical-request-chains",
    "render-blocking-resources",
    "uses-responsive-images",
    "offscreen-images",
    "unminified-css",
    "unminified-javascript",
    "unused-css-rules",
    "unused-javascript",
    "modern-image-formats",
    "uses-optimized-images",
    "uses-text-compression",
    "uses-rel-preconnect",
    "efficient-animated-content",
    "third-party-summary",
  ];
  for (const id of diagnosticIds) {
    const audit = audits[id];
    if (audit && audit.score !== null && audit.score < 1) {
      diagnostics.push({
        title: audit.title ?? id,
        description: audit.description ?? "",
        displayValue: audit.displayValue ?? null,
      });
    }
  }

  // Grade based on performance score
  let grade: string;
  if (performanceScore >= 90) grade = "A";
  else if (performanceScore >= 70) grade = "B";
  else if (performanceScore >= 50) grade = "C";
  else if (performanceScore >= 30) grade = "D";
  else grade = "F";

  return {
    output: {
      url,
      strategy,
      performance_score: performanceScore,
      metrics: {
        lcp_ms: lcp !== null ? Math.round(lcp) : null,
        fcp_ms: fcp !== null ? Math.round(fcp) : null,
        cls_score: cls !== null ? +cls.toFixed(3) : null,
        tbt_ms: tbt !== null ? Math.round(tbt) : null,
        ttfb_ms: ttfb !== null ? Math.round(ttfb) : null,
        speed_index: speedIndex !== null ? Math.round(speedIndex) : null,
      },
      opportunities,
      diagnostics,
      grade,
    },
    provenance: { source: "pagespeedonline.googleapis.com", fetched_at: new Date().toISOString() },
  };
});
