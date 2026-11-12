import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { readRobotsTxt } from "../lib/resource-limits.js";
import { validateUrl } from "../lib/url-validator.js";
import { isChallengeResponse, siteAccessRefusal } from "../lib/site-access.js";

registerCapability("robots-txt-parse", async (input: CapabilityInput) => {
  let url = ((input.url as string) ?? (input.domain as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' (website URL or domain) is required.");

  // Normalize to robots.txt URL
  if (!url.startsWith("http://") && !url.startsWith("https://")) url = "https://" + url;
  const base = new URL(url);
  const robotsUrl = `${base.protocol}//${base.hostname}/robots.txt`;
  await validateUrl(robotsUrl);

  const response = await safeFetch(robotsUrl, {
    purpose: "availability_probe",
    signal: AbortSignal.timeout(10000),
    headers: { "User-Agent": "StraleBot/1.0" },
  });

  if (response.status === 404) {
    await discardBody(response, "robots-txt-parse: no robots.txt");
    return {
      output: { url: robotsUrl, exists: false, message: "No robots.txt found." },
      provenance: { source: "http-fetch", fetched_at: new Date().toISOString() },
    };
  }
  if (!response.ok) {
    // Nothing below reads the body (#434). Cancel it rather than leaving
    // it to pin the keep-alive connection until GC.
    await discardBody(response, "robots-txt-parse: non-2xx");
    throw new Error(`HTTP ${response.status} fetching robots.txt`);
  }

  // An availability probe, so safeFetch does not stop at a challenge itself.
  // A challenge here is not a robots.txt with no rules (promise-audit T1 wave 3).
  if (await isChallengeResponse(response)) {
    await discardBody(response, "robots-txt-parse: anti-bot challenge page");
    throw siteAccessRefusal(robotsUrl, { kind: "challenge" });
  }

  const text = await readRobotsTxt(response);
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

  // A site that answers /robots.txt with an HTML page and 200 (a soft 404, or
  // a redirect to its home page) has no robots.txt: the same answer a 404
  // gives, not a robots.txt that exists with no rules (promise-audit T1
  // follow-up 18). A real robots.txt mislabelled as text/html still parses.
  if (rules.length === 0 && sitemaps.length === 0 && text.trimStart().startsWith("<")) {
    return {
      output: { url: robotsUrl, exists: false, message: "No robots.txt found: the site answered with an HTML page." },
      provenance: { source: "http-fetch", fetched_at: new Date().toISOString() },
    };
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
