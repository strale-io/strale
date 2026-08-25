/**
 * Chromium/Browserless health monitor.
 *
 * Probes Browserless reachability and control-tower account state every 30
 * minutes without rendering a page or consuming a browser unit. Exports
 * isChromiumHealthy() for capability
 * executors on the live customer path (see data-provider.ts's
 * executeWithFallback, which skips a fallback-chain provider whose
 * requiredServices includes "browserless" when this reports unhealthy) to
 * fail fast rather than wait out a timeout.
 *
 * NOTE (2026-08-18): this module does NOT gate the scheduled test runner.
 * That was the original intent — isBrowserlessCapability() was written for
 * exactly that — but it had zero call sites anywhere in the codebase and was
 * removed. Skip-on-unhealthy-provider for scheduled tests is handled by
 * upstream-health-gate.ts's findUnhealthyUpstream(), wired into
 * test-runner.ts's runTests() per-suite loop, and (as an earlier, cheaper
 * gate) by test-scheduler.ts's own pre-runTests() provider-health filter.
 * All of these share one source of truth for "which capabilities depend on
 * Browserless": dependency-manifest.ts's curated `browserless.capabilities`
 * list — the gate and this module's getBrowserlessCapabilityCount() read it
 * via upstream-health-gate.ts's getBrowserlessDependentSlugs(), while the
 * scheduler's pre-filter reads the manifest directly. Either way it is the
 * curated list, never inferred from capability_type='scraping'. See that function's
 * doc comment for why the capability_type heuristic was rejected (it missed
 * capabilities hard-requiring Browserless that happen to be classified
 * capability_type='ai_assisted', while over-including capabilities that
 * keep working via web-provider.ts's fallback tiers when Browserless is
 * down).
 *
 * State transitions are logged and trigger interrupt emails on critical changes.
 */

import { fireAndForget } from "./fire-and-forget.js";
import { log, logError, logWarn } from "./log.js";
import { vendorReachabilityFetch } from "./metered-vendor-fetch.js";

// ─── State ──────────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
let _lastCheck = 0;
let _healthy = true; // Optimistic default until first check
let _lastHealthyAt = Date.now();
let _consecutiveFailures = 0;

// ─── Browserless capability cache (from DB) ─────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
let _browserlessSlugs: Set<string> = new Set();
let _browserlessCacheExpiry = 0;

// Pre-warm cache on module load (fire-and-forget, non-blocking)
setTimeout(() => {
  fireAndForget(() => refreshBrowserlessCache(), { label: "browserless-cache-prewarm" });
}, 5_000);

async function refreshBrowserlessCache(): Promise<Set<string>> {
  try {
    const { getBrowserlessDependentSlugs } = await import("./upstream-health-gate.js");
    const slugs = await getBrowserlessDependentSlugs();
    _browserlessSlugs = new Set(slugs);
    _browserlessCacheExpiry = Date.now() + CACHE_TTL_MS;
  } catch (err) {
    // On DB error, keep the stale cache rather than clearing it
    logError("chromium-health-cache-refresh-failed", err);
  }
  return _browserlessSlugs;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Whether Chromium/Browserless is currently responding to render requests. */
export function isChromiumHealthy(): boolean {
  return _healthy;
}

/** Number of capabilities that would be skipped when Chromium is down. */
export function getBrowserlessCapabilityCount(): number {
  return _browserlessSlugs.size;
}

/**
 * Probe Browserless health. Called by the scheduler every 30 minutes.
 * Also refreshes the Browserless capability cache from DB.
 * Returns true if healthy. Manages state transitions and alerts internally.
 */
export async function probeChromiumHealth(): Promise<boolean> {
  const now = Date.now();
  if (now - _lastCheck < CHECK_INTERVAL_MS) return _healthy;
  _lastCheck = now;

  // Refresh the capability cache on each probe cycle
  if (now >= _browserlessCacheExpiry) {
    await refreshBrowserlessCache();
  }

  const url = process.env.BROWSERLESS_URL;
  const key = process.env.BROWSERLESS_API_KEY;

  if (!url || !key) {
    if (_healthy) {
      logWarn("chromium-health-not-configured", "BROWSERLESS_URL/API_KEY not configured");
    }
    _healthy = false;
    return false;
  }

  try {
    // A real /content render every 30 minutes consumed ~1,440 units/month by
    // itself. The root request is zero-unit; 401/403/404 still prove the edge
    // is reachable, while browserlessFetch refuses before the network when the
    // control tower has blocked the account. Customer renders remain the
    // authoritative end-to-end signal and record their actual failures.
    const res = await vendorReachabilityFetch("browserless", url, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
    });

    if (res.ok || res.status === 401 || res.status === 403 || res.status === 404) {
      const nowHealthy = true;

      if (nowHealthy && !_healthy) {
        // Recovery detected
        const downtime = Math.round((now - _lastHealthyAt) / 60_000);
        log.info(
          { label: "chromium-health-recovered", downtime_min: downtime, consecutive_failures: _consecutiveFailures },
          "chromium-health-recovered",
        );
        _consecutiveFailures = 0;
      }

      if (nowHealthy) {
        _lastHealthyAt = now;
        _consecutiveFailures = 0;
      }

      _healthy = nowHealthy;
      if (_healthy) {
        log.info({ label: "chromium-health-ok" }, "chromium-health-ok");
      }
      return _healthy;
    }

    // Non-reachability response
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
    logError(
      "chromium-health-down",
      new Error(reason),
      { was_healthy_for_min: Math.round((Date.now() - _lastHealthyAt) / 60_000) },
    );
    // Fire interrupt email (async, fire-and-forget)
    fireAndForget(() => fireAlert(reason), { label: "chromium-down-alert", context: { reason } });
  } else {
    // Still down — log at lower frequency (every 3rd failure)
    if (_consecutiveFailures % 3 === 0) {
      logWarn("chromium-health-still-down", "still down", {
        consecutive_failures: _consecutiveFailures,
        reason,
      });
    }
  }

  return false;
}

async function fireAlert(reason: string): Promise<void> {
  try {
    // Use situation assessment pipeline — correlates with probe history,
    // test results, and customer impact before deciding to alert.
    const { assessDependencyProbeFailure } = await import("./situation-assessment.js");
    const { handleDependencyProbeResult } = await import("./intelligent-alerts.js");
    const assessment = await assessDependencyProbeFailure("browserless", {
      healthy: false, latency_ms: 0, error: reason,
    });
    await handleDependencyProbeResult("browserless", false, assessment);
  } catch (err) {
    logError("chromium-health-assess-failed", err);
  }
}
