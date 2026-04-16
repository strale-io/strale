import { registerCapability, type CapabilityInput } from "./index.js";
import { validateUrl } from "../lib/url-validator.js";
import { safeFetch } from "../lib/safe-fetch.js";

/**
 * F-0-006 special case: redirect-trace exists to FOLLOW and REPORT ON
 * redirects, which means the Bucket-A recipe (auto-follow via safeFetch)
 * would destroy the feature. Instead we call safeFetch with
 * maxRedirects: 0 — we still get validateUrl + the undici dispatcher's
 * DNS-rebinding refusal, but the 3xx response is returned to us so we
 * can record the hop and advance the chain ourselves. validateUrl is
 * also called on every next-hop URL before we fetch it.
 */
registerCapability("redirect-trace", async (input: CapabilityInput) => {
  let url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' (URL to trace) is required.");

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }
  await validateUrl(url);

  const maxRedirects = Math.min(Number(input.max_redirects ?? 20), 30);
  const chain: { step: number; url: string; status_code: number; status_text: string; location: string | null; server: string | null; latency_ms: number }[] = [];

  let currentUrl = url;
  for (let step = 1; step <= maxRedirects; step++) {
    // safeFetch with maxRedirects: 0 validates + refuses connection-time
    // DNS rebinding but returns the 3xx to us so we can walk the chain.
    const start = Date.now();
    const response = await safeFetch(currentUrl, {
      method: "GET",
      maxRedirects: 0,
      signal: AbortSignal.timeout(10000),
    });
    const latency = Date.now() - start;
    const location = response.headers.get("location");
    const server = response.headers.get("server");

    chain.push({
      step,
      url: currentUrl,
      status_code: response.status,
      status_text: response.statusText,
      location,
      server,
      latency_ms: latency,
    });

    // Check if redirect
    if (response.status >= 300 && response.status < 400 && location) {
      // Handle relative redirects
      try {
        currentUrl = new URL(location, currentUrl).toString();
      } catch {
        currentUrl = location;
      }
    } else {
      break;
    }
  }

  const totalLatency = chain.reduce((sum, c) => sum + c.latency_ms, 0);
  const redirectCount = chain.length - 1;
  const finalEntry = chain[chain.length - 1];

  // Detect issues
  const issues: string[] = [];
  if (chain.some(c => c.url.startsWith("http://") && chain.some(c2 => c2.url.startsWith("https://")))) {
    issues.push("Mixed HTTP/HTTPS in redirect chain");
  }
  if (redirectCount > 3) {
    issues.push(`Excessive redirects (${redirectCount})`);
  }
  if (chain.some(c => c.status_code === 301) && chain.some(c => c.status_code === 302)) {
    issues.push("Mixed permanent (301) and temporary (302) redirects");
  }

  return {
    output: {
      original_url: url,
      final_url: finalEntry.url,
      final_status_code: finalEntry.status_code,
      redirect_count: redirectCount,
      total_latency_ms: totalLatency,
      chain,
      issues,
      uses_https: finalEntry.url.startsWith("https://"),
      same_domain: new URL(url).hostname === new URL(finalEntry.url).hostname,
    },
    provenance: { source: "http-trace", fetched_at: new Date().toISOString() },
  };
});
