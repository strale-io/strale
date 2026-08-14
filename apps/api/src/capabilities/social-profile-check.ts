import { registerCapability, type CapabilityInput } from "./index.js";
import { safeFetch } from "../lib/safe-fetch.js";

interface PlatformResult {
  platform: string;
  url: string;
  exists: boolean;
  status_code: number | null;
}

// LinkedIn, Twitter/X, Instagram, Facebook removed per DEC-20260420-H — those platforms
// forbid automated access (incl. HEAD-style existence probes) in their ToS.
const PLATFORMS = [
  { name: "GitHub", urlTemplate: (u: string) => `https://github.com/${u}` },
  { name: "YouTube", urlTemplate: (u: string) => `https://www.youtube.com/@${u}` },
  { name: "TikTok", urlTemplate: (u: string) => `https://www.tiktok.com/@${u}` },
  { name: "Reddit", urlTemplate: (u: string) => `https://www.reddit.com/user/${u}/` },
  { name: "Pinterest", urlTemplate: (u: string) => `https://www.pinterest.com/${u}/` },
  { name: "npm", urlTemplate: (u: string) => `https://www.npmjs.com/~${u}` },
  { name: "PyPI", urlTemplate: (u: string) => `https://pypi.org/user/${u}/` },
];

async function checkPlatform(
  platform: { name: string; urlTemplate: (u: string) => string },
  username: string,
): Promise<PlatformResult> {
  const url = platform.urlTemplate(username);
  try {
    const resp = await safeFetch(url, {
      method: "GET",
      headers: {
        // Honest bot UA (money-integrity 2026-08-12): the previous spoofed
        // Chrome UA was the disguised-access pattern the legal audit flagged.
        "User-Agent": "Mozilla/5.0 (compatible; StraleBot/1.0; +https://strale.dev)",
        Accept: "text/html,application/xhtml+xml,*/*",
      },
      // redirect handling: safeFetch follows up to 3 hops with per-hop re-validation
      signal: AbortSignal.timeout(5000),
    });

    // Most platforms return 404 for non-existent users
    // Some redirect to login or homepage for non-existent profiles
    const exists = resp.status === 200;
    return { platform: platform.name, url, exists, status_code: resp.status };
  } catch {
    // Timeout or network error
    return { platform: platform.name, url, exists: false, status_code: null };
  }
}

registerCapability("social-profile-check", async (input: CapabilityInput) => {
  const raw = (
    (input.username as string) ??
    (input.brand as string) ??
    (input.task as string) ??
    ""
  ).trim();
  if (!raw) throw new Error("'username' is required. Provide a username or brand name to check.");

  // Clean username: remove @ prefix, trim
  const username = raw.replace(/^@/, "").trim();
  if (!username) throw new Error("'username' cannot be empty after cleanup.");

  // Check all platforms in parallel
  const results = await Promise.allSettled(
    PLATFORMS.map((p) => checkPlatform(p, username)),
  );

  const profiles: PlatformResult[] = results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : { platform: "unknown", url: "", exists: false, status_code: null },
  );

  const foundCount = profiles.filter((p) => p.exists).length;
  const notFoundCount = profiles.filter((p) => !p.exists).length;
  const availablePlatforms = profiles
    .filter((p) => !p.exists && p.status_code === 404)
    .map((p) => p.platform);

  return {
    output: {
      username,
      profiles,
      found_count: foundCount,
      not_found_count: notFoundCount,
      available_platforms: availablePlatforms,
    },
    provenance: { source: "multi-platform", fetched_at: new Date().toISOString() },
  };
});
