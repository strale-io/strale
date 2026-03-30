import { registerCapability, type CapabilityInput } from "./index.js";

// GoPlus Security — Phishing Site Detection API (free, no key required)
const API = "https://api.gopluslabs.io/api/v1/phishing_site";

registerCapability("phishing-site-check", async (input: CapabilityInput) => {
  let url = (
    (input.url as string) ??
    (input.website as string) ??
    (input.site as string) ??
    (input.domain as string) ??
    ""
  ).trim();
  if (!url) throw new Error("'url' is required. Provide a URL to check (e.g., 'https://uniswap.org').");
  if (url.length < 3) throw new Error("'url' must be at least 3 characters.");

  // Prepend https:// if no protocol
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  const apiUrl = `${API}?url=${encodeURIComponent(url)}`;
  const response = await fetch(apiUrl, {
    headers: { "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error(`GoPlus API returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  const now = new Date().toISOString();

  if (data.code !== 1 && data.code !== "1") {
    throw new Error(`GoPlus API error: ${data.message ?? "unknown error"}`);
  }

  const result = data.result ?? {};
  const phishingValue = result.phishing_site;

  let isPhishing = false;
  let confidence: "confirmed" | "safe" | "unknown" = "unknown";

  if (phishingValue === 1 || phishingValue === "1") {
    isPhishing = true;
    confidence = "confirmed";
  } else if (phishingValue === 0 || phishingValue === "0") {
    isPhishing = false;
    confidence = "safe";
  }

  return {
    output: {
      url,
      is_phishing: isPhishing,
      confidence,
    },
    provenance: { source: "api.gopluslabs.io", fetched_at: now },
  };
});
