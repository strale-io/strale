/**
 * Dependency health checks — auto-generated from dependency-manifest.ts.
 *
 * DO NOT add hand-written checks here. Add providers to dependency-manifest.ts
 * instead. This file is a generic probe runner.
 *
 * PRINCIPLE A: Health probes must NEVER consume billable API calls.
 * Probes run ~4×/day. For paid APIs, set `skipAuth: true` on the health probe
 * in dependency-manifest.ts. An unauthenticated 401 proves the service is
 * reachable without consuming quota. Only network errors = unhealthy.
 */

import { getActiveProviders, type DependencyProvider } from "./dependency-manifest.js";
import { fireAndForget } from "./fire-and-forget.js";

export interface HealthCheckResult {
  healthy: boolean;
  latency_ms: number;
  error?: string;
}

interface SingleAttemptResult {
  healthy: boolean;
  latency_ms: number;
  /** True if the response proves the endpoint is reachable but intentionally
   *  refused (auth rejection, rate limit). Don't retry on these. */
  fatal?: boolean;
  error?: string;
}

async function probeSingleUrl(
  url: string,
  provider: DependencyProvider,
  headers: Record<string, string>,
): Promise<SingleAttemptResult> {
  const probe = provider.healthProbe;
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: probe.method,
      headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
      signal: AbortSignal.timeout(probe.timeoutMs),
    });
    const latency_ms = Date.now() - start;
    if (probe.healthyStatuses.includes(res.status)) {
      return { healthy: true, latency_ms };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        healthy: false,
        latency_ms,
        fatal: true,
        error: `${provider.envVar ?? "API key"} is invalid (HTTP ${res.status})`,
      };
    }
    return { healthy: false, latency_ms, error: `Unexpected HTTP ${res.status}` };
  } catch (e: any) {
    return { healthy: false, latency_ms: Date.now() - start, error: e.message };
  }
}

async function probeProvider(
  provider: DependencyProvider,
): Promise<HealthCheckResult> {
  // Resolve base URL — Browserless reads from env at runtime
  const baseUrl = provider.name === "browserless"
    ? process.env.BROWSERLESS_URL ?? ""
    : provider.baseUrl;

  if (!baseUrl) {
    return {
      healthy: false,
      latency_ms: 0,
      error: provider.name === "browserless"
        ? "BROWSERLESS_URL not configured"
        : `baseUrl not set for provider '${provider.name}'`,
    };
  }

  // Check required env var. If skipAuth is set, the probe doesn't send the
  // key — it relies on the server returning 401 to prove reachability — so
  // a missing env var shouldn't hard-fail the probe. Capabilities that need
  // the key at execution time handle absence separately.
  if (provider.envVar && !provider.healthProbe.skipAuth) {
    const key = process.env[provider.envVar];
    if (!key) {
      return {
        healthy: false,
        latency_ms: 0,
        error: `${provider.envVar} not configured`,
      };
    }
  }

  const apiKey = provider.envVar ? process.env[provider.envVar]! : undefined;
  const probe = provider.healthProbe;

  // Build auth headers
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey && !probe.skipAuth) {
    switch (provider.authType) {
      case "api-key-header":
        headers[provider.authHeader!] = apiKey;
        break;
      case "bearer":
        headers["Authorization"] = `Bearer ${apiKey}`;
        break;
      case "basic":
        headers["Authorization"] = `Basic ${Buffer.from(apiKey + ":").toString("base64")}`;
        break;
    }
  }

  if (provider.extraProbeHeaders) {
    for (const [k, v] of Object.entries(provider.extraProbeHeaders)) {
      headers[k] = v;
    }
  }

  // Pool of endpoints to try. For providers with fallbackBaseUrls, the pool
  // is healthy if ANY endpoint returns healthy — this matches how capabilities
  // fail over across the same pool and avoids false alerts when a single free
  // endpoint is rate-limiting us.
  const poolBaseUrls = [baseUrl, ...(provider.fallbackBaseUrls ?? [])];

  // Run the pool up to 2 times — filters out transient network blips across
  // the whole pool. Retry only if every endpoint failed on the previous pass.
  let lastAttempt: SingleAttemptResult | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const errors: string[] = [];
    let bestLatency = 0;
    for (const b of poolBaseUrls) {
      const res = await probeSingleUrl(`${b}${probe.path}`, provider, headers);
      if (res.healthy) {
        return { healthy: true, latency_ms: res.latency_ms };
      }
      lastAttempt = res;
      errors.push(`${b}: ${res.error ?? "unknown"}`);
      bestLatency = Math.max(bestLatency, res.latency_ms);
      // Auth failure on the primary applies to the whole provider — no point
      // hammering fallbacks that share no auth.
      if (res.fatal && b === baseUrl) {
        return { healthy: false, latency_ms: res.latency_ms, error: res.error };
      }
    }
    // Entire pool failed.
    if (attempt === 0 && poolBaseUrls.length === 1) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }
    // For pooled providers, trying the whole pool already cost real calls —
    // a 5s retry of the full pool is expensive. Skip it; the next scheduled
    // probe cycle is the retry.
    return {
      healthy: false,
      latency_ms: bestLatency,
      error: poolBaseUrls.length > 1
        ? `All ${poolBaseUrls.length} endpoints failed: ${errors.join("; ")}`
        : (lastAttempt?.error ?? "unknown"),
    };
  }

  return { healthy: false, latency_ms: 0, error: lastAttempt?.error ?? "probe exhausted retries" };
}

export async function runDependencyHealthChecks(): Promise<
  Record<string, HealthCheckResult>
> {
  const activeProviders = getActiveProviders();
  const results: Record<string, HealthCheckResult> = {};

  await Promise.all(
    activeProviders.map(async (provider) => {
      try {
        results[provider.name] = await probeProvider(provider);
      } catch (e: any) {
        results[provider.name] = { healthy: false, latency_ms: 0, error: e.message };
      }
    }),
  );

  // Update shared upstream health state (used by test runner to skip tests)
  fireAndForget(
    async () => {
      const { updateUpstreamHealth } = await import("./upstream-health-gate.js");
      for (const [name, result] of Object.entries(results)) {
        updateUpstreamHealth(name, result.healthy);
      }
    },
    { label: "upstream-health-update" },
  );

  // Fire-and-forget: notify event triggers of any state changes
  fireAndForget(
    async () => {
      const { triggerOnDependencyChange } = await import("./event-triggers.js");
      for (const [name, result] of Object.entries(results)) {
        await triggerOnDependencyChange(name, result.healthy);
      }
    },
    { label: "dependency-change-trigger" },
  );

  // Fire-and-forget: persist probe results to health_monitor_events
  persistProbeResults(results).catch((err) => {
    console.error("[dependency-health] Failed to persist probe results:", err instanceof Error ? err.message : err);
  });

  // Fire-and-forget: run situation assessment for unhealthy probes
  fireAndForget(
    async () => {
      const { assessDependencyProbeFailure } = await import("./situation-assessment.js");
      const { handleDependencyProbeResult } = await import("./intelligent-alerts.js");
      for (const [name, result] of Object.entries(results)) {
        try {
          const assessment = await assessDependencyProbeFailure(name, result);
          await handleDependencyProbeResult(name, result.healthy, assessment);
        } catch (err) {
          console.error(`[situation] Assessment failed for ${name}:`, err instanceof Error ? err.message : err);
        }
      }
    },
    { label: "situation-assessment" },
  );

  return results;
}

async function persistProbeResults(results: Record<string, HealthCheckResult>): Promise<void> {
  const { getDb } = await import("../db/index.js");
  const { healthMonitorEvents } = await import("../db/schema.js");
  const db = getDb();

  for (const [name, result] of Object.entries(results)) {
    try {
      await db.insert(healthMonitorEvents).values({
        eventType: "dependency_probe",
        capabilitySlug: null,
        tier: result.healthy ? 1 : 2,
        actionTaken: result.healthy
          ? `${name}: healthy (${result.latency_ms}ms)`
          : `${name}: unhealthy — ${result.error ?? "unknown"}`,
        details: {
          dependency: name,
          healthy: result.healthy,
          latency_ms: result.latency_ms,
          error: result.error ?? null,
        },
      });
    } catch (err) {
      console.error(
        `[dependency-health] Failed to persist probe for ${name}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}
