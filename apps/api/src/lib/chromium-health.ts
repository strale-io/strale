/**
 * Chromium/Browserless health monitor.
 *
 * Probes the Browserless.io managed service every 30 minutes with a real
 * page render (example.com). Exports isChromiumHealthy() for the test runner
 * to skip Browserless-dependent capabilities when the service is down,
 * preventing hundreds of timeout failures from polluting the SQS window.
 *
 * Browserless-dependent capabilities are determined from the database
 * (capability_type = 'scraping') with a 5-minute cache.
 *
 * State transitions are logged and trigger interrupt emails on critical changes.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { capabilities } from "../db/schema.js";

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
setTimeout(() => refreshBrowserlessCache().catch(() => {}), 5_000);

async function refreshBrowserlessCache(): Promise<Set<string>> {
  try {
    const db = getDb();
    const rows = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(eq(capabilities.capabilityType, "scraping"));
    _browserlessSlugs = new Set(rows.map((r) => r.slug));
    _browserlessCacheExpiry = Date.now() + CACHE_TTL_MS;
  } catch (err) {
    // On DB error, keep the stale cache rather than clearing it
    console.error(
      "[chromium-health] Failed to refresh Browserless capability cache:",
      err instanceof Error ? err.message : err,
    );
  }
  return _browserlessSlugs;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Whether Chromium/Browserless is currently responding to render requests. */
export function isChromiumHealthy(): boolean {
  return _healthy;
}

/**
 * Whether a capability depends on Browserless for execution.
 * Reads from cached Set (populated from DB). Safe to call synchronously —
 * cache is refreshed during probeChromiumHealth() every 30 minutes.
 */
export function isBrowserlessCapability(slug: string): boolean {
  return _browserlessSlugs.has(slug);
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
    // Use situation assessment pipeline — correlates with probe history,
    // test results, and customer impact before deciding to alert.
    const { assessDependencyProbeFailure } = await import("./situation-assessment.js");
    const { handleDependencyProbeResult } = await import("./intelligent-alerts.js");
    const assessment = await assessDependencyProbeFailure("browserless", {
      healthy: false, latency_ms: 0, error: reason,
    });
    await handleDependencyProbeResult("browserless", false, assessment);
  } catch (err) {
    console.error(
      "[chromium-health] Failed to assess situation:",
      err instanceof Error ? err.message : err,
    );
  }
}
