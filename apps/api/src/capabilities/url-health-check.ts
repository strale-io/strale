import { registerCapability, type CapabilityInput } from "./index.js";
import { validateUrl } from "../lib/url-validator.js";
import { safeFetch } from "../lib/safe-fetch.js";

registerCapability("url-health-check", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  await validateUrl(fullUrl);
  const followRedirects = input.follow_redirects !== false;
  const timeout = Math.min((input.timeout as number) ?? 10000, 30000);

  const redirectChain: Array<{ url: string; status: number }> = [];
  let finalUrl = fullUrl;
  let currentUrl = fullUrl;
  let statusCode: number;
  let responseTimeMs: number;
  let contentType: string | null = null;
  let server: string | null = null;
  let sslValid: boolean | null = null;

  const start = Date.now();

  if (followRedirects) {
    // Manual redirect following to capture chain
    let maxRedirects = 10;
    while (maxRedirects > 0) {
      // F-0-006: re-validate every hop. safeFetch with maxRedirects: 0 +
      // returnOnRedirectCap: true returns the 3xx instead of throwing, so
      // we can walk the chain ourselves. Phase-4 tail fix (MEDIUM-5,
      // 2026-08-17 review): this call was missing returnOnRedirectCap —
      // same bug class as redirect-trace.ts before its fix. Without the
      // flag, maxRedirects: 0 alone makes safeFetch throw "Too many
      // redirects (>0)" on the FIRST redirect (followRedirects increments
      // hop to 1 before the hop > maxRedirects check, so 1 > 0 is always
      // true) — any URL with a real redirect failed this whole capability
      // outright instead of reporting the redirect chain. See
      // safe-fetch.ts's SafeFetchOptions doc for the full history.
      await validateUrl(currentUrl);
      const response = await safeFetch(currentUrl, {
        method: "HEAD",
        maxRedirects: 0,
        returnOnRedirectCap: true,
        signal: AbortSignal.timeout(timeout),
        headers: { "User-Agent": "Strale/1.0 (health-check; admin@strale.io)" },
      });

      statusCode = response.status;
      contentType = response.headers.get("content-type");
      server = response.headers.get("server");

      if (statusCode >= 300 && statusCode < 400) {
        const location = response.headers.get("location");
        if (!location) break;

        redirectChain.push({ url: currentUrl, status: statusCode });
        try {
          currentUrl = new URL(location, currentUrl).href;
        } catch {
          break;
        }
        maxRedirects--;
      } else {
        finalUrl = currentUrl;
        break;
      }
    }
    responseTimeMs = Date.now() - start;
  } else {
    // follow_redirects: false — caller wants to see whether the URL
    // redirects at all, not follow it. Same returnOnRedirectCap need as
    // above: without it, a redirecting URL threw instead of reporting
    // its 3xx status_code.
    const response = await safeFetch(fullUrl, {
      method: "HEAD",
      maxRedirects: 0,
      returnOnRedirectCap: true,
      signal: AbortSignal.timeout(timeout),
      headers: { "User-Agent": "Strale/1.0 (health-check; admin@strale.io)" },
    });
    responseTimeMs = Date.now() - start;
    statusCode = response.status;
    contentType = response.headers.get("content-type");
    server = response.headers.get("server");
    finalUrl = fullUrl;
  }

  // SSL check for HTTPS URLs
  if (finalUrl.startsWith("https://")) {
    sslValid = true; // If we got a response over HTTPS, SSL is valid enough
  }

  const isUp = statusCode! >= 200 && statusCode! < 400;

  return {
    output: {
      url: fullUrl,
      final_url: finalUrl,
      is_up: isUp,
      status_code: statusCode!,
      response_time_ms: responseTimeMs!,
      redirect_chain: redirectChain,
      ssl_valid: sslValid,
      content_type: contentType,
      server,
    },
    provenance: { source: "http-head", fetched_at: new Date().toISOString() },
  };
});
