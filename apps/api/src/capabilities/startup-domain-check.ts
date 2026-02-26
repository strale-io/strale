import { registerCapability, type CapabilityInput } from "./index.js";
import * as dns from "node:dns/promises";

registerCapability("startup-domain-check", async (input: CapabilityInput) => {
  const keyword = ((input.company_name as string) ?? (input.keyword as string) ?? (input.task as string) ?? "").trim();
  if (!keyword) throw new Error("'company_name' or 'keyword' is required.");

  const slug = keyword.toLowerCase().replace(/[^a-z0-9]/g, "");

  // Check domain availability via DNS
  const extensions = [".com", ".io", ".ai", ".co", ".dev"];
  const domainChecks = await Promise.all(
    extensions.map(async (ext) => {
      const domain = `${slug}${ext}`;
      const available = await isDomainAvailable(domain);
      let currentOwner: string | null = null;
      if (!available) {
        // Try to detect what's there
        try {
          const res = await fetch(`https://${domain}`, {
            method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000),
          });
          currentOwner = res.url !== `https://${domain}` && res.url !== `https://${domain}/`
            ? `Redirects to ${res.url}` : `Active website (HTTP ${res.status})`;
        } catch {
          currentOwner = "Domain registered but no active website";
        }
      }
      return { domain, extension: ext, available, current_owner: currentOwner };
    }),
  );

  // Check social handles and package names
  const [twitterAvail, githubAvail, npmAvail, pypiAvail] = await Promise.all([
    checkUrl(`https://x.com/${slug}`, slug),
    checkUrl(`https://github.com/${slug}`, slug),
    checkUrl(`https://registry.npmjs.org/${slug}`, slug),
    checkUrl(`https://pypi.org/pypi/${slug}/json`, slug),
  ]);

  const socialChecks = [
    { platform: "Twitter/X", handle: `@${slug}`, available: twitterAvail },
    { platform: "GitHub", handle: slug, available: githubAvail },
    { platform: "npm", package: slug, available: npmAvail },
    { platform: "PyPI", package: slug, available: pypiAvail },
  ];

  const available = [
    ...domainChecks.filter((d) => d.available).map((d) => ({ type: "domain", name: d.domain })),
    ...socialChecks.filter((s) => s.available).map((s) => ({ type: s.platform.toLowerCase(), name: s.handle ?? s.package })),
  ];

  const taken = [
    ...domainChecks.filter((d) => !d.available).map((d) => ({ type: "domain", name: d.domain, details: d.current_owner })),
    ...socialChecks.filter((s) => !s.available).map((s) => ({ type: s.platform.toLowerCase(), name: (s as Record<string, unknown>).handle ?? (s as Record<string, unknown>).package, details: "taken" })),
  ];

  return {
    output: {
      keyword: slug,
      domains: domainChecks,
      social: socialChecks,
      available_count: available.length,
      taken_count: taken.length,
      available,
      taken,
      best_available_domain: domainChecks.find((d) => d.available)?.domain ?? null,
    },
    provenance: { source: "dns-http", fetched_at: new Date().toISOString() },
  };
});

async function isDomainAvailable(domain: string): Promise<boolean> {
  try {
    await dns.resolve4(domain);
    return false; // Has DNS records = taken
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") return true;
    return false; // Assume taken on other errors
  }
}

async function checkUrl(url: string, _slug: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Strale/1.0" },
    });
    // 404 = available, 200 = taken
    return res.status === 404;
  } catch {
    return true; // Assume available if can't reach
  }
}
