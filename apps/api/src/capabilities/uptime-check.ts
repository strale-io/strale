import { registerCapability, type CapabilityInput } from "./index.js";
import { validateUrl } from "../lib/url-validator.js";

registerCapability("uptime-check", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' (URL to check) is required.");

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("URL must start with http:// or https://");
  }
  await validateUrl(url);

  const timeout = Math.min(Number(input.timeout_ms ?? 10000), 30000);
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(url, {
      method: (input.method as string)?.toUpperCase() ?? "GET",
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timer);
    const latencyMs = Date.now() - start;

    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => { headers[k] = v; });

    return {
      output: {
        url,
        status: "up",
        status_code: response.status,
        status_text: response.statusText,
        latency_ms: latencyMs,
        redirected: response.redirected,
        final_url: response.url,
        headers: {
          server: headers["server"] ?? null,
          content_type: headers["content-type"] ?? null,
          x_powered_by: headers["x-powered-by"] ?? null,
        },
        tls: url.startsWith("https://"),
        checked_at: new Date().toISOString(),
      },
      provenance: { source: "http-check", fetched_at: new Date().toISOString() },
    };
  } catch (err: unknown) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = message.includes("abort");

    return {
      output: {
        url,
        status: "down",
        status_code: null,
        error: isTimeout ? "timeout" : message,
        latency_ms: latencyMs,
        tls: url.startsWith("https://"),
        checked_at: new Date().toISOString(),
      },
      provenance: { source: "http-check", fetched_at: new Date().toISOString() },
    };
  }
});
