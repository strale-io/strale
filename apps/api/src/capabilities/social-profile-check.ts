import { registerCapability, type CapabilityInput } from "./index.js";
import { discardBody, safeFetch } from "../lib/safe-fetch.js";
import { STRALE_USER_AGENT, isBlockStatus } from "../lib/site-access.js";
import { fetchUnavailable, httpUnavailable, quotedLegCodes, UpstreamUnavailableError } from "../lib/upstream-result.js";

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

/**
 * Why a registry could not tell, kept off the output: when no registry
 * answered, the call fails with these rather than billing three "not
 * checked" rows (promise-audit T1 wave 6).
 */
const legFailures = new WeakMap<RegistryCheck, Error>();

function unchecked(registry: Registry, url: string, statusCode: number | null, note: string, failure: Error): RegistryCheck {
  const check: RegistryCheck = { platform: registry.platform, kind: registry.kind, url, exists: null, status_code: statusCode, note };
  legFailures.set(check, failure);
  return check;
}

/**
 * A refusal (401, 403, 407, 429) from a registry is a rate limit or a block, not a
 * credential problem: GitHub answers its anonymous limit with 403. Quoting the
 * number would make the breaker read it as auth_expired and suspend the
 * capability for half an hour (see httpUnavailable), so it is worded without it.
 */
function registryStatusFailure(platform: string, status: number): UpstreamUnavailableError {
  if (isBlockStatus(status)) {
    return new UpstreamUnavailableError(`${platform} API`, "declined the request; retry later.", { code: "declined", retryable: true });
  }
  return httpUnavailable(`${platform} API`, status);
}

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
    // All three registries answer JSON. A 200 in any other type is a block
    // or maintenance page, not the record, so it is no evidence of a taken name.
    if (resp.status === 200 && !/json/i.test(resp.headers.get("content-type") ?? "")) {
      return unchecked(registry, url, 200, `${registry.platform} did not answer with its API; not checked.`,
        new UpstreamUnavailableError(`${registry.platform} API`, "the reply was not JSON; retry shortly.", { code: "unparseable" }));
    }
    if (resp.status === 200) {
      return { platform: registry.platform, kind: registry.kind, url, exists: true, status_code: 200 };
    }
    if (resp.status === 404) {
      return { platform: registry.platform, kind: registry.kind, url, exists: false, status_code: 404 };
    }
    // A rate limit or refusal is the registry declining to answer — not
    // evidence either way, so it is reported as unknown rather than "free".
    return unchecked(
      registry,
      url,
      resp.status,
      isBlockStatus(resp.status)
        ? `${registry.platform} declined the request (HTTP ${resp.status}); not checked.`
        : `${registry.platform} answered HTTP ${resp.status}; not checked.`,
      registryStatusFailure(registry.platform, resp.status),
    );
  } catch (err) {
    // degraded-ok: one registry that cannot be reached reads exists:null with a note while the others answer; its classified error is kept, and the call throws it when no registry answered (promise-audit T1 wave 6).
    return unchecked(registry, url, null, `${registry.platform} could not be reached; not checked.`, fetchUnavailable(`${registry.platform} API`, err));
  }
}

/**
 * Normalise free text to the shape every registry below accepts. Two
 * solutions pass a company name here ("Stripe, Inc.", "H&M", "Nestlé",
 * "Klarna Bank AB (publ)"), so this rewrites rather than refuses: accents
 * are stripped, "&" becomes "and", any other run of characters a registry
 * name cannot hold becomes "-", and the ends are trimmed. Exported for tests.
 */
export function toRegistryName(raw: string): string {
  return raw
    .trim()
    .replace(/^@/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 214);
}

registerCapability("social-profile-check", async (input: CapabilityInput) => {
  const raw = (
    (input.username as string) ??
    (input.brand as string) ??
    (input.task as string) ??
    ""
  ).trim();
  if (!raw) throw new Error("'username' is required. Provide a package, project or organisation name to check.");

  const name = toRegistryName(raw);
  if (!name) {
    throw new Error("'username' must be a name with at least one letter or digit.");
  }

  const profiles = await Promise.all(REGISTRIES.map((r) => checkRegistry(r, name)));

  // When every registry that could be asked failed, there is no answer to
  // sell: fail unbilled, as the rail does for any upstream outage. A name
  // valid on no registry at all is the caller's input, reported as is.
  const failures = profiles.map((p) => legFailures.get(p)).filter((f): f is Error => f !== undefined);
  const asked = profiles.filter((p) => p.url !== "").length;
  if (asked > 0 && failures.length === asked) {
    // An error that is not an outage (our own defect, a refusal) is thrown as
    // itself, so it is not filed under the registries.
    const other = failures.find((f) => !(f instanceof UpstreamUnavailableError));
    if (other) throw other;
    const outages = failures as UpstreamUnavailableError[];
    throw new UpstreamUnavailableError("npm, PyPI and GitHub registries", `none answered (${quotedLegCodes(outages)}).`, {
      code: outages[0].code,
      retryable: outages.some((f) => f.retryable),
    });
  }

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
      fetched_at: new Date().toISOString(),
    },
  };
});
