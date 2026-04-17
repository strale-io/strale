import { registerCapability, type CapabilityInput } from "./index.js";

// F-0-006 Bucket D: user domain is embedded in query strings to hardcoded
// third-party APIs (index.commoncrawl.org, google.serper.dev). We never
// fetch a user-controllable host — no SSRF surface.
registerCapability("backlink-check", async (input: CapabilityInput) => {
  const raw = (
    (input.domain as string) ??
    (input.url as string) ??
    (input.site as string) ??
    ""
  ).trim();
  if (!raw) throw new Error("'domain' is required. Provide a domain to check backlinks for.");
  if (raw.length < 3) throw new Error("'domain' must be at least 3 characters.");

  // Clean domain
  const domain = raw
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .toLowerCase();

  let source = "commoncrawl.org";
  const backlinks: Array<{
    source_url: string;
    source_domain: string;
    anchor_text: string | null;
    first_seen: string | null;
  }> = [];

  // Attempt 1: CommonCrawl Index API
  try {
    const ccUrl = `https://index.commoncrawl.org/CC-MAIN-2024-10-index?url=*.${encodeURIComponent(domain)}&output=json&limit=50`;
    const ccResp = await fetch(ccUrl, {
      headers: { "User-Agent": "Strale/1.0" },
      signal: AbortSignal.timeout(15000),
    });

    if (ccResp.ok) {
      const text = await ccResp.text();
      const lines = text.trim().split("\n").filter(Boolean);
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          const sourceUrl = record.url ?? "";
          const sourceDomain = extractDomain(sourceUrl);
          // Only include pages from OTHER domains linking to the target
          if (sourceDomain && sourceDomain !== domain) {
            backlinks.push({
              source_url: sourceUrl,
              source_domain: sourceDomain,
              anchor_text: null,
              first_seen: record.timestamp ?? null,
            });
          }
        } catch {
          // Skip malformed NDJSON lines
        }
      }
    }
  } catch {
    // CommonCrawl may timeout or be unavailable
  }

  // Attempt 2: If CommonCrawl yielded few results, try Serper.dev Google search
  if (backlinks.length < 5) {
    const serperKey = process.env.SERPER_API_KEY;
    if (serperKey) {
      try {
        const query = `"${domain}" -site:${domain}`;
        const resp = await fetch("https://google.serper.dev/search", {
          method: "POST",
          headers: { "X-API-KEY": serperKey, "Content-Type": "application/json" },
          body: JSON.stringify({ q: query, num: 10 }),
          signal: AbortSignal.timeout(10000),
        });

        if (resp.ok) {
          source = "google.com";
          const data = await resp.json();
          const organic = (data.organic as any[]) ?? [];
          for (const item of organic) {
            const sourceUrl = item.link ?? item.url ?? "";
            const sourceDomain = extractDomain(sourceUrl);
            if (sourceDomain && sourceDomain !== domain) {
              // Check if already in list
              if (!backlinks.some((b) => b.source_url === sourceUrl)) {
                backlinks.push({
                  source_url: sourceUrl,
                  source_domain: sourceDomain,
                  anchor_text: item.title ?? null,
                  first_seen: null,
                });
              }
            }
          }
        }
      } catch {
        // Serper unavailable
      }
    }
  }

  // Compute referring domains
  const referringDomains = new Set(backlinks.map((b) => b.source_domain));

  // Compute top anchor texts
  const anchorCounts = new Map<string, number>();
  for (const bl of backlinks) {
    if (bl.anchor_text) {
      const key = bl.anchor_text.toLowerCase().trim();
      anchorCounts.set(key, (anchorCounts.get(key) ?? 0) + 1);
    }
  }
  const topAnchors = [...anchorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([text, count]) => ({ text, count }));

  return {
    output: {
      domain,
      backlinks,
      total_backlinks: backlinks.length,
      referring_domains_count: referringDomains.size,
      top_anchors: topAnchors,
      dofollow_estimate: null,
      nofollow_estimate: null,
    },
    provenance: { source, fetched_at: new Date().toISOString() },
  };
});

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}
