/**
 * Chromium/Browserless health monitor.
 *
 * Probes the Browserless.io managed service every 30 minutes with a real
 * page render (example.com). Exports isChromiumHealthy() for the test runner
 * to skip Browserless-dependent capabilities when the service is down,
 * preventing hundreds of timeout failures from polluting the SQS window.
 *
 * State transitions are logged and trigger interrupt emails on critical changes.
 */

// ─── State ──────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
let _lastCheck = 0;
let _healthy = true; // Optimistic default until first check
let _lastHealthyAt = Date.now();
let _consecutiveFailures = 0;

// ─── Browserless capability list (mirrors credential-health.ts) ─────────────

const BROWSERLESS_CAPABILITIES = new Set([
  "accessibility-audit", "annual-report-extract", "austrian-company-data",
  "belgian-company-data", "business-license-check-se", "company-enrich",
  "company-tech-stack", "competitor-compare", "container-track",
  "cookie-scan", "credit-report-summary", "custom-scrape",
  "customs-duty-lookup", "danish-company-data", "dutch-company-data",
  "employer-review-summary", "estonian-company-data", "eu-court-case-search",
  "eu-regulation-search", "eu-trademark-search", "gdpr-fine-lookup",
  "german-company-data", "hong-kong-company-data", "html-to-pdf",
  "indian-company-data", "irish-company-data", "italian-company-data",
  "japanese-company-data", "landing-page-roast", "latvian-company-data",
  "lithuanian-company-data", "patent-search", "portuguese-company-data",
  "price-compare", "pricing-page-extract", "privacy-policy-analyze",
  "product-reviews-extract", "product-search", "return-policy-extract",
  "salary-benchmark", "screenshot-url", "seo-audit",
  "spanish-company-data", "structured-scrape", "swedish-company-data",
  "swiss-company-data", "tech-stack-detect", "terms-of-service-extract",
  "trustpilot-score", "url-to-markdown", "web-extract", "youtube-summarize",
]);

// ─── Public API ─────────────────────────────────────────────────────────────

/** Whether Chromium/Browserless is currently responding to render requests. */
export function isChromiumHealthy(): boolean {
  return _healthy;
}

/** Whether a capability depends on Browserless for execution. */
export function isBrowserlessCapability(slug: string): boolean {
  return BROWSERLESS_CAPABILITIES.has(slug);
}

/** Number of capabilities that would be skipped when Chromium is down. */
export function getBrowserlessCapabilityCount(): number {
  return BROWSERLESS_CAPABILITIES.size;
}

/**
 * Probe Browserless health. Called by the scheduler every 30 minutes.
 * Returns true if healthy. Manages state transitions and alerts internally.
 */
export async function probeChromiumHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - _lastCheck < CHECK_INTERVAL_MS) return _healthy;
  _lastCheck = now;

  const url = process.env.BROWSERLESS_URL;
  const key = process.env.BROWSERLESS_API_KEY;

  if (!url || !key) {
    if (_healthy) {
      console.warn("[chromium-health] BROWSERLESS_URL/API_KEY not configured");
    }
    _healthy = false;
    return false;
  }

  try {
    const res = await fetch(`${url}/content`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        url: "https://example.com",
        gotoOptions: { waitUntil: "domcontentloaded", timeout: 10000 },
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok) {
      const html = await res.text();
      const nowHealthy = html.length > 50;

      if (nowHealthy && !_healthy) {
        // Recovery detected
        const downtime = Math.round((now - _lastHealthyAt) / 60_000);
        console.log(
          `[chromium-health] RECOVERED after ${downtime}min downtime (${_consecutiveFailures} consecutive failures)`,
        );
        _consecutiveFailures = 0;
      }

      if (nowHealthy) {
        _lastHealthyAt = now;
        _consecutiveFailures = 0;
      }

      _healthy = nowHealthy;
      if (_healthy) {
        console.log("[chromium-health] OK");
      }
      return _healthy;
    }

    // Non-OK response
    return handleFailure(`HTTP ${res.status}`);
  } catch (err) {
    return handleFailure(err instanceof Error ? err.message : String(err));
  }
}

// ─── Internals ──────────────────────────────────────────────────────────────

function handleFailure(reason: string): boolean {
  _consecutiveFailures++;
  const wasHealthy = _healthy;
  _healthy = false;

  if (wasHealthy) {
    // First failure after healthy period — log prominently
    console.error(
      `[chromium-health] DOWN: ${reason} (was healthy for ${Math.round((Date.now() - _lastHealthyAt) / 60_000)}min)`,
    );
    // Fire interrupt email (async, fire-and-forget)
    fireAlert(reason).catch(() => {});
  } else {
    // Still down — log at lower frequency (every 3rd failure)
    if (_consecutiveFailures % 3 === 0) {
      console.warn(
        `[chromium-health] Still down (${_consecutiveFailures} consecutive failures): ${reason}`,
      );
    }
  }

  return false;
}

async function fireAlert(reason: string): Promise<void> {
  try {
    const { sendInterruptEmail } = await import("./interrupt-sender.js");
    await sendInterruptEmail({
      type: "infrastructure_down",
      details: {
        service: "browserless",
        error: reason,
        affected_capabilities: BROWSERLESS_CAPABILITIES.size,
        consecutive_failures: _consecutiveFailures,
      },
    });
  } catch (err) {
    console.error(
      "[chromium-health] Failed to send alert:",
      err instanceof Error ? err.message : err,
    );
  }
}
