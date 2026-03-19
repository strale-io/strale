/**
 * Lightweight health checks for external dependencies.
 * Zero cost — just HTTP pings, no capability execution.
 */

interface HealthCheckResult {
  healthy: boolean;
  latency_ms: number;
  error?: string;
}

interface HealthCheck {
  name: string;
  check: () => Promise<HealthCheckResult>;
}

const healthChecks: HealthCheck[] = [
  {
    name: "browserless",
    check: async () => {
      const url = process.env.BROWSERLESS_URL;
      const key = process.env.BROWSERLESS_API_KEY;
      if (!url || !key) return { healthy: false, latency_ms: 0, error: "BROWSERLESS_URL/API_KEY not configured" };
      const start = Date.now();
      try {
        // Browserless.io managed service requires auth on all endpoints.
        // Use a minimal /content request with example.com (fast, reliable) as
        // a real health probe — the /health endpoint may not exist on managed plans.
        const res = await fetch(`${url}/content`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${key}`,
          },
          body: JSON.stringify({
            url: "https://example.com",
            gotoOptions: { waitUntil: "domcontentloaded", timeout: 5000 },
          }),
          signal: AbortSignal.timeout(10000),
        });
        const latency = Date.now() - start;
        if (res.ok) {
          const html = await res.text();
          return { healthy: html.length > 50, latency_ms: latency };
        }
        return { healthy: false, latency_ms: latency, error: `HTTP ${res.status}` };
      } catch (e: any) {
        return { healthy: false, latency_ms: Date.now() - start, error: e.message };
      }
    },
  },
  {
    name: "vies",
    check: async () => {
      const start = Date.now();
      try {
        const res = await fetch(
          "https://ec.europa.eu/taxation_customs/vies/rest-api/check-status",
          { signal: AbortSignal.timeout(5000) },
        );
        return { healthy: res.ok, latency_ms: Date.now() - start };
      } catch (e: any) {
        return { healthy: false, latency_ms: Date.now() - start, error: e.message };
      }
    },
  },
  {
    name: "opensanctions",
    check: async () => {
      const start = Date.now();
      try {
        const res = await fetch("https://api.opensanctions.org/health/ready", {
          signal: AbortSignal.timeout(5000),
        });
        return { healthy: res.ok, latency_ms: Date.now() - start };
      } catch (e: any) {
        return { healthy: false, latency_ms: Date.now() - start, error: e.message };
      }
    },
  },
  {
    name: "gleif",
    check: async () => {
      const start = Date.now();
      try {
        const res = await fetch("https://api.gleif.org/api/v1/lei-records?page[size]=1", {
          signal: AbortSignal.timeout(5000),
        });
        return { healthy: res.ok, latency_ms: Date.now() - start };
      } catch (e: any) {
        return { healthy: false, latency_ms: Date.now() - start, error: e.message };
      }
    },
  },
  {
    name: "brreg",
    check: async () => {
      const start = Date.now();
      try {
        const res = await fetch("https://data.brreg.no/enhetsregisteret/api/enheter?size=1", {
          signal: AbortSignal.timeout(5000),
        });
        return { healthy: res.ok, latency_ms: Date.now() - start };
      } catch (e: any) {
        return { healthy: false, latency_ms: Date.now() - start, error: e.message };
      }
    },
  },
  {
    name: "anthropic",
    check: async () => {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) return { healthy: false, latency_ms: 0, error: "ANTHROPIC_API_KEY not configured" };
      const start = Date.now();
      try {
        // Just check auth is valid with a cheap models list call
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          signal: AbortSignal.timeout(5000),
        });
        return { healthy: res.ok, latency_ms: Date.now() - start };
      } catch (e: any) {
        return { healthy: false, latency_ms: Date.now() - start, error: e.message };
      }
    },
  },
];

export async function runDependencyHealthChecks(): Promise<
  Record<string, HealthCheckResult>
> {
  const results: Record<string, HealthCheckResult> = {};
  await Promise.all(
    healthChecks.map(async (hc) => {
      try {
        results[hc.name] = await hc.check();
      } catch (e: any) {
        results[hc.name] = { healthy: false, latency_ms: 0, error: e.message };
      }
    }),
  );

  // Fire-and-forget: notify event triggers of any state changes
  import("./event-triggers.js")
    .then(({ triggerOnDependencyChange }) => {
      for (const [name, result] of Object.entries(results)) {
        triggerOnDependencyChange(name, result.healthy).catch(() => {});
      }
    })
    .catch(() => {});

  return results;
}
