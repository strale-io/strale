/**
 * Dependency health checks — auto-generated from dependency-manifest.ts.
 *
 * DO NOT add hand-written checks here. Add providers to dependency-manifest.ts
 * instead. This file is a generic probe runner.
 */

import { getActiveProviders, type DependencyProvider } from "./dependency-manifest.js";

export interface HealthCheckResult {
  healthy: boolean;
  latency_ms: number;
  error?: string;
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

  // Check required env var
  if (provider.envVar) {
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
  const url = `${baseUrl}${probe.path}`;

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

  // Add any extra probe headers (e.g. anthropic-version)
  if (provider.extraProbeHeaders) {
    for (const [k, v] of Object.entries(provider.extraProbeHeaders)) {
      headers[k] = v;
    }
  }

  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: probe.method,
      headers,
      body: probe.body ? JSON.stringify(probe.body) : undefined,
      signal: AbortSignal.timeout(probe.timeoutMs),
    });

    const latency_ms = Date.now() - start;
    const healthy = probe.healthyStatuses.includes(res.status);

    if (!healthy) {
      if (res.status === 401 || res.status === 403) {
        return {
          healthy: false,
          latency_ms,
          error: `${provider.envVar ?? "API key"} is invalid (HTTP ${res.status})`,
        };
      }
      return { healthy: false, latency_ms, error: `Unexpected HTTP ${res.status}` };
    }

    return { healthy: true, latency_ms };
  } catch (e: any) {
    return { healthy: false, latency_ms: Date.now() - start, error: e.message };
  }
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
  import("./upstream-health-gate.js")
    .then(({ updateUpstreamHealth }) => {
      for (const [name, result] of Object.entries(results)) {
        updateUpstreamHealth(name, result.healthy);
      }
    })
    .catch(() => {});

  // Fire-and-forget: notify event triggers of any state changes
  import("./event-triggers.js")
    .then(({ triggerOnDependencyChange }) => {
      for (const [name, result] of Object.entries(results)) {
        triggerOnDependencyChange(name, result.healthy).catch(() => {});
      }
    })
    .catch(() => {});

  // Fire-and-forget: persist probe results to health_monitor_events
  persistProbeResults(results).catch((err) => {
    console.error("[dependency-health] Failed to persist probe results:", err instanceof Error ? err.message : err);
  });

  // Fire-and-forget: run situation assessment for unhealthy probes
  import("./situation-assessment.js")
    .then(async ({ assessDependencyProbeFailure }) => {
      const { handleDependencyProbeResult } = await import("./intelligent-alerts.js");
      for (const [name, result] of Object.entries(results)) {
        try {
          const assessment = await assessDependencyProbeFailure(name, result);
          await handleDependencyProbeResult(name, result.healthy, assessment);
        } catch (err) {
          console.error(`[situation] Assessment failed for ${name}:`, err instanceof Error ? err.message : err);
        }
      }
    })
    .catch(() => {});

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
