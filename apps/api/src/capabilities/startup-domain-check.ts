import { registerCapability, type CapabilityInput } from "./index.js";
import * as dns from "node:dns/promises";
import { inputRefusal } from "../lib/capability-refusal.js";
import { dnsUnavailable, fetchUnavailable, httpUnavailable, UpstreamUnavailableError } from "../lib/upstream-result.js";

// A wrong "available" is the worst answer this tool can give: a founder may
// act on it. So a domain is "available" only on a definitive NXDOMAIN, a
// resolver that could not answer fails the call, and a handle check that could
// not answer reads null rather than "available" or "taken" (2026-11-06
// swallowed-upstream-failures audit, row 24).

registerCapability("startup-domain-check", async (input: CapabilityInput) => {
  const keyword = ((input.company_name as string) ?? (input.keyword as string) ?? (input.task as string) ?? "").trim();
  if (!keyword) throw new Error("'company_name' or 'keyword' is required.");

  const slug = keyword.toLowerCase().replace(/[^a-z0-9]/g, "");
  // Without a letter or digit there is no domain to ask about (".com"); past
  // 63 characters the name cannot be a DNS label at all.
  if (!slug || slug.length > 63) {
    throw inputRefusal(
      "'company_name' must contain between 1 and 63 letters (a-z) or digits once spaces and punctuation are removed.",
      "company_name",
      "Send the name in Latin letters or digits, at most 63 of them.",
    );
  }

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
          // degraded-ok: current_owner only describes a domain DNS already showed is registered; a website that does not answer is reported as exactly that, never as a verdict on availability.
          currentOwner = "Domain registered but no active website";
        }
      }
      return { domain, extension: ext, available, current_owner: currentOwner };
    }),
  );

  // Check social handles and package names. The former x.com handle probe is
  // GONE (P2 review M-7): probing x.com for handle existence is exactly the
  // DEC-20260420-H case that put x.com/twitter.com on the ToS blocklist, and
  // this capability was the last raw-fetch caller bypassing the fetch-layer
  // gate. The X handle is reported as unchecked, honestly.
  const handleLegs: Array<[label: string, url: string]> = [
    [GITHUB, `https://github.com/${slug}`],
    [NPM, `https://registry.npmjs.org/${slug}`],
    [PYPI, `https://pypi.org/pypi/${slug}/json`],
  ];
  const settled = await Promise.allSettled(handleLegs.map(([label, url]) => checkUrl(url, label)));
  const unavailableSources: string[] = [];
  const [githubAvail, npmAvail, pypiAvail] = settled.map((result, i) => {
    if (result.status === "fulfilled") return result.value;
    if (!(result.reason instanceof UpstreamUnavailableError)) throw result.reason;
    unavailableSources.push(handleLegs[i][0]);
    return null;
  });
  const unchecked = (label: string, available: boolean | null) =>
    available === null ? { note: `Not checked: ${label} did not answer. Verify the name manually.` } : {};

  const socialChecks = [
    {
      platform: "Twitter/X",
      handle: `@${slug}`,
      available: null as boolean | null,
      note: "Not checked — X's Terms of Service prohibit automated access. Verify the handle manually at x.com.",
    },
    { platform: "GitHub", handle: slug, available: githubAvail, ...unchecked(GITHUB, githubAvail) },
    { platform: "npm", package: slug, available: npmAvail, ...unchecked(NPM, npmAvail) },
    { platform: "PyPI", package: slug, available: pypiAvail, ...unchecked(PYPI, pypiAvail) },
  ];

  const available = [
    ...domainChecks.filter((d) => d.available).map((d) => ({ type: "domain", name: d.domain })),
    ...socialChecks.filter((s) => s.available === true).map((s) => ({ type: s.platform.toLowerCase(), name: s.handle ?? s.package })),
  ];

  // Only a check that answered "taken" is listed here: an unchecked handle
  // (available: null) is neither available nor taken.
  const taken = [
    ...domainChecks.filter((d) => !d.available).map((d) => ({ type: "domain", name: d.domain, details: d.current_owner })),
    ...socialChecks.filter((s) => s.available === false).map((s) => ({ type: s.platform.toLowerCase(), name: (s as Record<string, unknown>).handle ?? (s as Record<string, unknown>).package, details: "taken" })),
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
      ...(unavailableSources.length > 0 ? { unavailable_sources: unavailableSources } : {}),
    },
    provenance: { source: "dns-http", fetched_at: new Date().toISOString() },
  };
});

const GITHUB = "GitHub";
const NPM = "npm registry";
const PYPI = "PyPI";

/**
 * True only on NXDOMAIN (ENOTFOUND): no such name exists. A name that exists
 * without an A record (ENODATA) is registered, so it is taken. Any other
 * resolver failure is not an answer and throws UpstreamUnavailableError.
 */
async function isDomainAvailable(domain: string): Promise<boolean> {
  const [lookup] = await Promise.allSettled([dns.resolve4(domain)]);
  if (lookup.status === "fulfilled") return false; // Has DNS records = taken
  const code = (lookup.reason as NodeJS.ErrnoException | null)?.code;
  if (code === "ENOTFOUND") return true;
  if (code === "ENODATA") return false;
  throw dnsUnavailable(lookup.reason, `DNS A-record query for ${domain}`);
}

/**
 * True when the platform answers 404 (no such name), false when it answers
 * with a page. A 429, 5xx, other status, timeout or network error is not an
 * answer and throws UpstreamUnavailableError.
 */
async function checkUrl(url: string, label: string): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "Strale/1.0" },
    });
  } catch (err) {
    throw fetchUnavailable(label, err);
  }
  await res.body?.cancel();
  if (res.status === 404) return true;
  if (res.ok) return false;
  throw httpUnavailable(label, res.status);
}
