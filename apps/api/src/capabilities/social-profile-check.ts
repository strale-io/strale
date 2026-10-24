import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { STRALE_USER_AGENT, isBlockStatus } from "../lib/site-access.js";

/**
 * Is a name taken on the developer registries? npm package, PyPI project,
 * GitHub organisation — each read through the registry's own official API.
 *
 * ## Why it is this narrow (DEC-20261023-A, 2026-10-24)
 *
 * Until 2026-10-24 this probed personal profile pages on TikTok, Reddit,
 * YouTube, Pinterest, GitHub, npm and PyPI by fetching their HTML. The
 * data-access rule puts "harvesting profiles … about identifiable people" in
 * the never lane (item 3), names Reddit among the litigating platforms
 * (item 4), and allows YouTube and TikTok only through their official APIs.
 * What remains is non-personal: whether a PACKAGE or an ORGANISATION name is
 * taken, read from the registries' documented APIs — the "preferred" lane.
 *
 * GitHub is checked for organisations only (`/orgs/{name}`). A 404 there
 * means "no organisation", not "the name is free", because a personal account
 * may hold it — and this capability does not look personal accounts up. So a
 * GitHub 404 never enters `available_platforms`.
 *
 * The slug and the output field names (`username`, `profiles`, …) are kept so
 * existing callers and the two solutions that run this step do not break.
 */

interface RegistryCheck {
  platform: string;
  kind: "npm_package" | "pypi_project" | "github_organization";
  /** The registry's public page for the name. */
  url: string;
  /** true = taken, false = not found, null = could not tell. */
  exists: boolean | null;
  status_code: number | null;
  note?: string;
}

interface Registry {
  platform: string;
  kind: RegistryCheck["kind"];
  /** Normalise the name the way the registry does, or null if it cannot be a valid name there. */
  normalise: (name: string) => string | null;
  apiUrl: (name: string) => string;
  pageUrl: (name: string) => string;
  headers: () => Record<string, string>;
  /** Whether a 404 means the name is free to register (false for GitHub orgs). */
  notFoundMeansAvailable: boolean;
}

const REGISTRIES: Registry[] = [
  {
    platform: "npm",
    kind: "npm_package",
    // Unscoped npm names are lowercase, at most 214 characters, and may not
    // start with "." or "_".
    normalise: (n) => {
      const lower = n.toLowerCase();
      return /^[a-z0-9][a-z0-9._-]{0,213}$/.test(lower) ? lower : null;
    },
    apiUrl: (n) => `https://registry.npmjs.org/${encodeURIComponent(n)}`,
    pageUrl: (n) => `https://www.npmjs.com/package/${n}`,
    headers: () => ({ Accept: "application/vnd.npm.install-v1+json" }),
    notFoundMeansAvailable: true,
  },
  {
    platform: "PyPI",
    kind: "pypi_project",
    // PEP 508 project-name shape; PyPI's JSON API applies PEP 503
    // normalisation itself, so case and separators need no rewriting here.
    normalise: (n) => (/^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/.test(n) ? n : null),
    apiUrl: (n) => `https://pypi.org/pypi/${encodeURIComponent(n)}/json`,
    pageUrl: (n) => `https://pypi.org/project/${n}/`,
    headers: () => ({ Accept: "application/json" }),
    notFoundMeansAvailable: true,
  },
  {
    platform: "GitHub",
    kind: "github_organization",
    // GitHub logins: alphanumerics and single hyphens, at most 39 characters.
    normalise: (n) => (/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(n) ? n : null),
    apiUrl: (n) => `https://api.github.com/orgs/${encodeURIComponent(n)}`,
    pageUrl: (n) => `https://github.com/${n}`,
    headers: () => {
      const h: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      // Optional: raises the anonymous 60-requests-an-hour limit.
      if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
      return h;
    },
    notFoundMeansAvailable: false,
  },
];

async function checkRegistry(registry: Registry, name: string): Promise<RegistryCheck> {
  const normalised = registry.normalise(name);
  if (!normalised) {
    return {
      platform: registry.platform,
      kind: registry.kind,
      url: "",
      exists: null,
      status_code: null,
      note: `Not a valid ${registry.platform} name, so not checked.`,
    };
  }
  const url = registry.pageUrl(normalised);
  try {
    const resp = await safeFetch(registry.apiUrl(normalised), {
      method: "GET",
      headers: { "User-Agent": STRALE_USER_AGENT, ...registry.headers() },
      timeoutMs: 5000,
    });
    // Only the status is used; the metadata body (megabytes for a popular
    // npm package) is never read.
    await discardBody(resp, `${registry.platform} name check`);
    if (resp.status === 200) {
      return { platform: registry.platform, kind: registry.kind, url, exists: true, status_code: 200 };
    }
    if (resp.status === 404) {
      return { platform: registry.platform, kind: registry.kind, url, exists: false, status_code: 404 };
    }
    // A rate limit or refusal is the registry declining to answer — not
    // evidence either way, so it is reported as unknown rather than "free".
    return {
      platform: registry.platform,
      kind: registry.kind,
      url,
      exists: null,
      status_code: resp.status,
      note: isBlockStatus(resp.status)
        ? `${registry.platform} declined the request (HTTP ${resp.status}); not checked.`
        : `${registry.platform} answered HTTP ${resp.status}; not checked.`,
    };
  } catch {
    return {
      platform: registry.platform,
      kind: registry.kind,
      url,
      exists: null,
      status_code: null,
      note: `${registry.platform} could not be reached; not checked.`,
    };
  }
}

registerCapability("social-profile-check", async (input: CapabilityInput) => {
  const raw = (
    (input.username as string) ??
    (input.brand as string) ??
    (input.task as string) ??
    ""
  ).trim();
  if (!raw) throw new Error("'username' is required. Provide a package, project or organisation name to check.");

  // "@acme" and "Acme Corp" (a company name, as two solutions pass it) become
  // "acme" and "Acme-Corp": the shape every registry below accepts.
  const name = raw.replace(/^@/, "").trim().replace(/\s+/g, "-");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,213}$/.test(name)) {
    throw new Error(
      "'username' must be a name of letters, digits, '.', '_' or '-' (spaces become '-'), " +
        "starting with a letter or digit.",
    );
  }

  const profiles = await Promise.all(REGISTRIES.map((r) => checkRegistry(r, name)));

  const available = new Set(
    REGISTRIES.filter((r) => r.notFoundMeansAvailable).map((r) => r.platform),
  );

  return {
    output: {
      username: name,
      profiles,
      found_count: profiles.filter((p) => p.exists === true).length,
      not_found_count: profiles.filter((p) => p.exists === false).length,
      unknown_count: profiles.filter((p) => p.exists === null).length,
      available_platforms: profiles
        .filter((p) => p.exists === false && available.has(p.platform))
        .map((p) => p.platform),
    },
    provenance: {
      source: "npm registry API, PyPI JSON API, GitHub REST API",
      acquisition_method: "direct_api",
      data_access_lane: "preferred",
      fetched_at: new Date().toISOString(),
    },
  };
});
