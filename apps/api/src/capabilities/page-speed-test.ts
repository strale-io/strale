import { registerCapability, type CapabilityInput } from "./index.js";

// F-0-006 Bucket D: user URL is url-encoded and sent to the HARDCODED
// Google PageSpeed API endpoint. We never fetch the user's URL directly —
// Google does, from their network.
registerCapability("page-speed-test", async (input: CapabilityInput) => {
  const rawUrl = ((input.url as string) ?? (input.task as string) ?? "").trim();
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

  const resp = await fetch(apiUrl, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(60000), // PSI can be slow
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => "");
    throw new Error(`PageSpeed Insights returned HTTP ${resp.status}: ${err.slice(0, 300)}`);
  }

  const data = await resp.json();
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
