import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("url-health-check", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required.");

  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
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
      const response = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
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
    const response = await fetch(fullUrl, {
      method: "HEAD",
      redirect: "manual",
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
