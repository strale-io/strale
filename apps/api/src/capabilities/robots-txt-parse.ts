import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("robots-txt-parse", async (input: CapabilityInput) => {
  let url = ((input.url as string) ?? (input.domain as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' (website URL or domain) is required.");

  // Normalize to robots.txt URL
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
  const base = new URL(url);
  const robotsUrl = `${base.protocol}//${base.hostname}/robots.txt`;

  const response = await fetch(robotsUrl, {
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "StraleBot/1.0" },
  });

  if (response.status === 404) {
    return {
      output: { url: robotsUrl, exists: false, message: "No robots.txt found." },
      provenance: { source: "http-fetch", fetched_at: new Date().toISOString() },
    };
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching robots.txt`);

  const text = await response.text();
  const lines = text.split("\n").map(l => l.trim());

  interface Rule { user_agent: string; allow: string[]; disallow: string[]; crawl_delay?: number }
  const rules: Rule[] = [];
  let current: Rule | null = null;
  const sitemaps: string[] = [];

  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const keyLower = key.trim().toLowerCase();

    if (keyLower === "user-agent") {
      current = { user_agent: value, allow: [], disallow: [] };
      rules.push(current);
    } else if (keyLower === "disallow" && current) {
      if (value) current.disallow.push(value);
    } else if (keyLower === "allow" && current) {
      if (value) current.allow.push(value);
    } else if (keyLower === "crawl-delay" && current) {
      current.crawl_delay = parseInt(value, 10);
    } else if (keyLower === "sitemap") {
      sitemaps.push(value);
    }
  }

  const totalDisallow = rules.reduce((sum, r) => sum + r.disallow.length, 0);
  const totalAllow = rules.reduce((sum, r) => sum + r.allow.length, 0);
  const blocksAll = rules.some(r => r.user_agent === "*" && r.disallow.includes("/"));

  return {
    output: {
      url: robotsUrl,
      exists: true,
      total_rules: rules.length,
      user_agents: rules.map(r => r.user_agent),
      total_disallow_rules: totalDisallow,
      total_allow_rules: totalAllow,
      sitemaps,
      blocks_all_crawlers: blocksAll,
      rules,
      raw_length: text.length,
    },
    provenance: { source: "http-fetch", fetched_at: new Date().toISOString() },
  };
});
