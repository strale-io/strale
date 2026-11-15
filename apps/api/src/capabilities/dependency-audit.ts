import { registerCapability, type CapabilityInput } from "./index.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";
import { inputRefusal } from "../lib/capability-refusal.js";
import { osvSeverity, type OsvSeverity } from "../lib/osv-severity.js";

/**
 * Dependency audit — checks packages for known CVEs (via OSV.dev),
 * outdated versions, and deprecated status. Supports npm and PyPI.
 *
 * Uses the OSV querybatch API for efficient batch CVE scanning
 * (up to 1000 packages per request, free, no API key).
 *
 * Upstream failures (2026-11-06 swallowed-failures audit, row 8). OSV decides
 * the vulnerability verdict, the answer's headline, so an OSV failure throws:
 * it used to read as `vulnerable_count: 0`, a billed clean bill of health for
 * packages nobody had checked. A registry lookup that fails (429, 5xx,
 * network, timeout, unparseable) marks that dependency `unavailable: true`,
 * names the registry in `unavailable_sources`, and still sends the declared
 * version to OSV when there is one. An unpinned PyPI requirement is checked at
 * the latest registry version. Dependencies that cannot reach OSV are marked
 * unchecked; when none can be checked the call refuses or throws, unbilled.
 */

const OSV = "OSV vulnerability database";
const OSV_DETAILS = "OSV vulnerability details";

/** 429 and 5xx: the upstream is unavailable, worth a retry. */
function isUnavailableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * A request that produced no usable answer: a timeout, a network error or a
 * body that does not parse. Anything else (our own code breaking) is returned
 * unchanged, so a defect is never relabelled as the provider's fault.
 */
function transportFailure(upstream: string, err: unknown): Error {
  if (err instanceof UpstreamUnavailableError) return err;
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new UpstreamUnavailableError(upstream, "timeout; retry shortly.", { code: "timeout", cause: err });
  }
  if (err instanceof TypeError && (err.message === "fetch failed" || err.message === "terminated")) {
    const cause = (err as { cause?: { code?: unknown } }).cause;
    const code = typeof cause?.code === "string" ? cause.code : null;
    return new UpstreamUnavailableError(upstream, `network error${code ? ` (${code})` : ""}; retry shortly.`, { code, cause: err });
  }
  if (err instanceof SyntaxError) {
    return new UpstreamUnavailableError(upstream, "the response did not parse.", { code: "unparseable", cause: err });
  }
  return err instanceof Error ? err : new Error(String(err));
}

registerCapability("dependency-audit", async (input: CapabilityInput) => {
  const packageJson = (input.package_json as string)?.trim();
  const requirementsTxt = (input.requirements_txt as string)?.trim();

  if (!packageJson && !requirementsTxt) {
    throw new Error("'package_json' or 'requirements_txt' (string contents) is required.");
  }

  if (packageJson) {
    return auditNpm(packageJson);
  }
  return auditPypi(requirementsTxt!);
});

// ─── OSV batch query (shared) ───────────────────────────────────────────────

interface OsvVuln {
  id: string;
  summary?: string;
  severity?: Array<{ type: string; score: string }>;
  aliases?: string[];
  database_specific?: { severity?: unknown };
}

interface BatchResult {
  vulnerabilities: Map<string, OsvVuln[]>;
  detailsUnavailable: boolean;
}

async function batchCveCheck(
  packages: Array<{ name: string; version: string; ecosystem: string }>,
): Promise<BatchResult> {
  const results = new Map<string, OsvVuln[]>();
  if (packages.length === 0) return { vulnerabilities: results, detailsUnavailable: false };

  // Filter to packages with parseable versions
  const queryable = packages.filter(isQueryable);

  if (queryable.length === 0) return { vulnerabilities: results, detailsUnavailable: false };

  let resp: Response;
  let data: { results?: unknown };
  try {
    resp = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        queries: queryable.map((p) => ({
          package: { name: p.name, ecosystem: p.ecosystem },
          version: p.version,
        })),
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) {
      if (isUnavailableStatus(resp.status)) {
        throw new UpstreamUnavailableError(OSV, `HTTP ${resp.status}; retry shortly.`, { code: `HTTP ${resp.status}` });
      }
      if (resp.status === 404 || resp.status === 410) {
        throw new UpstreamUnavailableError(OSV, `HTTP ${resp.status}; the endpoint is gone.`, { code: `HTTP ${resp.status}`, retryable: false });
      }
      throw new Error(`${OSV} returned HTTP ${resp.status}`);
    }
    data = (await resp.json()) as { results?: unknown };
  } catch (err) {
    throw transportFailure(OSV, err);
  }

  // querybatch answers one entry per query, `{}` for a package with no known
  // vulnerability. Anything else is no answer, not "no vulnerabilities".
  if (data === null || typeof data !== "object" || !Array.isArray(data.results) || data.results.length !== queryable.length) {
    throw new UpstreamUnavailableError(OSV, "the response did not match the queries sent.", { code: "unparseable" });
  }
  const answers = data.results as Array<{ vulns?: OsvVuln[] } | null>;

  const ids = [...new Set(answers.flatMap((answer) => (answer?.vulns ?? []).map((v) => v.id)))];
  const detailIds = ids.slice(0, 100);
  const details = new Map<string, OsvVuln>();
  let detailsUnavailable = ids.length > detailIds.length;
  for (let offset = 0; offset < detailIds.length; offset += 8) {
    await Promise.all(detailIds.slice(offset, offset + 8).map(async (id) => {
      try {
        const response = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!response.ok) {
          detailsUnavailable = true;
          return;
        }
        const detail = (await response.json()) as OsvVuln;
        if (!detail || typeof detail !== "object" || typeof detail.id !== "string") {
          detailsUnavailable = true;
          return;
        }
        details.set(id, detail);
      } catch (err) {
        // degraded-ok: an OSV detail fetch that times out, fails on the network or returns a body that does not parse leaves that vulnerability listed with severity "unknown" and names "OSV vulnerability details" in unavailable_sources, never as rated or absent; any other error (our own defect) is rethrown, unbilled.
        const failure = transportFailure(OSV_DETAILS, err);
        if (!(failure instanceof UpstreamUnavailableError)) throw failure;
        detailsUnavailable = true;
      }
    }));
  }

  for (let i = 0; i < queryable.length; i++) {
    const vulns = (answers[i]?.vulns ?? []).map((v) => details.get(v.id) ?? { id: v.id });
    if (vulns.length > 0) {
      results.set(queryable[i].name, vulns);
    }
  }

  return { vulnerabilities: results, detailsUnavailable };
}

/** A dependency whose registry lookup produced no answer (not a 404). */
function isUnavailable(r: object): boolean {
  return (r as { unavailable?: unknown }).unavailable === true;
}

/** True when `batchCveCheck` will send this query to OSV. */
function isQueryable(q: { version: string }): boolean {
  return Boolean(q.version) && q.version !== "unknown";
}

/**
 * Every registry lookup failed and OSV has nothing to check: no leg answered,
 * so there is no audit to sell.
 */
function requireCheckedDependency(registry: string, results: object[], osvQueries: Array<{ version: string }>, field: string): void {
  if (!osvQueries.some(isQueryable) && results.some(isUnavailable)) {
    throw new UpstreamUnavailableError(
      registry,
      `registry lookups failed and no dependency had a version for OSV to check; retry shortly.`,
    );
  }
  if (!osvQueries.some(isQueryable)) {
    throw inputRefusal(
      `'${field}' must contain at least one dependency that can be checked; none had a declared version or a registry answer.`,
      field,
      "Declare a dependency version or use a package available from the registry.",
    );
  }
}

const SEVERITY_ORDER: Record<OsvSeverity, number> = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
function highestSeverity(vulns: OsvVuln[]): OsvSeverity {
  return vulns.map(osvSeverity).sort((a, b) => SEVERITY_ORDER[b] - SEVERITY_ORDER[a])[0] ?? "unknown";
}

// ─── npm audit ──────────────────────────────────────────────────────────────

async function auditNpm(packageJsonStr: string) {
  const pkg = JSON.parse(packageJsonStr);
  const allDeps: Record<string, string> = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };

  const depNames = Object.keys(allDeps).slice(0, 50);

  // Fetch version info from npm registry
  const registryResults = await Promise.all(
    depNames.map(async (name) => {
      const currentVersion = allDeps[name].replace(/^[\^~>=<]*/g, "");
      try {
        const res = await fetch(`https://registry.npmjs.org/${name}`, {
          signal: AbortSignal.timeout(8000),
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          return isUnavailableStatus(res.status)
            ? { name, current_version: currentVersion, error: `HTTP ${res.status}`, unavailable: true }
            : { name, current_version: currentVersion, error: `HTTP ${res.status}` };
        }

        const data = (await res.json()) as Record<string, unknown>;
        const distTags = data["dist-tags"] as Record<string, string> | undefined;
        const latest = distTags?.latest ?? "unknown";
        const deprecated = !!(data as Record<string, unknown>).deprecated;

        return {
          name,
          current_version: currentVersion,
          latest_version: latest,
          is_outdated: currentVersion !== latest && latest !== "unknown",
          is_deprecated: deprecated,
          is_dev_dependency: !!(pkg.devDependencies ?? {})[name],
        };
      } catch {
        return { name, current_version: currentVersion, error: "fetch failed", unavailable: true };
      }
    }),
  );

  // Batch CVE check via OSV. The declared version is enough to query, so a
  // dependency whose registry lookup failed is still checked.
  const osvQueries = registryResults
    .filter((r) => r.current_version)
    .map((r) => ({
      name: r.name,
      version: r.current_version,
      ecosystem: "npm",
    }));
  requireCheckedDependency("npm registry", registryResults, osvQueries, "package_json");
  const cveResult = await batchCveCheck(osvQueries);

  // Merge CVE results
  const dependencies = registryResults.map((r) => {
    const vulns = cveResult.vulnerabilities.get(r.name) ?? [];
    const checked = osvQueries.some((q) => q.name === r.name && isQueryable(q));
    const malicious = vulns.some((v) => v.id.startsWith("MAL-"));
    return {
      ...r,
      ...(checked ? {} : { checked: false }),
      ...(malicious ? { malicious: true } : {}),
      vulnerabilities: vulns.map((v) => ({
        id: v.id,
        severity: osvSeverity(v),
        summary: v.summary ?? "",
        aliases: v.aliases?.filter((a) => a.startsWith("CVE-")) ?? [],
      })),
      vulnerability_count: vulns.length,
      highest_severity: vulns.length > 0 ? highestSeverity(vulns) : null,
    };
  });

  const outdated = dependencies.filter((r) => (r as Record<string, unknown>).is_outdated);
  const deprecated = dependencies.filter((r) => (r as Record<string, unknown>).is_deprecated);
  const vulnerable = dependencies.filter((r) => r.vulnerability_count > 0);
  const totalVulns = vulnerable.reduce((s, r) => s + r.vulnerability_count, 0);
  const unchecked = dependencies.filter((r) => r.checked === false).length;
  const malicious = dependencies.filter((r) => r.malicious === true);

  return {
    output: {
      ecosystem: "npm",
      total_dependencies: depNames.length,
      outdated_count: outdated.length,
      deprecated_count: deprecated.length,
      vulnerable_count: vulnerable.length,
      total_vulnerabilities: totalVulns,
      dependencies,
      summary: {
        total: depNames.length,
        up_to_date: dependencies.filter((r) => r.checked !== false && !(r as Record<string, unknown>).is_outdated && !(r as Record<string, unknown>).error).length,
        outdated: outdated.length,
        deprecated: deprecated.length,
        vulnerable: vulnerable.length,
        unchecked,
        errors: dependencies.filter((r) => (r as Record<string, unknown>).error).length,
      },
      critical_updates: [
        ...malicious.map((d) => `${d.name} (malicious package advisory)`),
        ...deprecated.map((d) => `${d.name} (deprecated)`),
        ...vulnerable.filter((v) => !v.malicious).map((v) => `${v.name} (${v.vulnerability_count} vulns)`),
      ],
      // Present when a registry lookup or some OSV advisory-detail reads failed.
      ...(registryResults.some(isUnavailable) || cveResult.detailsUnavailable
        ? { unavailable_sources: [...(registryResults.some(isUnavailable) ? ["npm registry"] : []), ...(cveResult.detailsUnavailable ? [OSV_DETAILS] : [])] }
        : {}),
    },
    provenance: { source: "npm-registry + osv.dev", fetched_at: new Date().toISOString() },
  };
}

// ─── PyPI audit ─────────────────────────────────────────────────────────────

async function auditPypi(requirementsStr: string) {
  const lines = requirementsStr
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("-"));

  const deps = lines.slice(0, 50).map((line) => {
    const match = line.match(/^([a-zA-Z0-9_.-]+)\s*(?:[=<>!~]+\s*(.+))?/);
    return { name: match?.[1] ?? line, version: match?.[2]?.trim() ?? null };
  });

  const registryResults = await Promise.all(
    deps.map(async (dep) => {
      try {
        const res = await fetch(`https://pypi.org/pypi/${dep.name}/json`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) {
          return isUnavailableStatus(res.status)
            ? { name: dep.name, current_version: dep.version, checked_version: dep.version, version_source: dep.version ? "declared" as const : undefined, error: `HTTP ${res.status}`, unavailable: true }
            : { name: dep.name, current_version: dep.version, checked_version: dep.version, version_source: dep.version ? "declared" as const : undefined, error: `HTTP ${res.status}` };
        }

        const data = (await res.json()) as Record<string, unknown>;
        const info = data.info as Record<string, unknown>;
        const latest = (info.version as string) ?? "unknown";

        return {
          name: dep.name,
          current_version: dep.version,
          checked_version: dep.version ?? latest,
          version_source: dep.version ? "declared" as const : "latest" as const,
          latest_version: latest,
          is_outdated: dep.version !== null && dep.version !== latest,
        };
      } catch {
        return { name: dep.name, current_version: dep.version, checked_version: dep.version, version_source: dep.version ? "declared" as const : undefined, error: "fetch failed", unavailable: true };
      }
    }),
  );

  // Batch CVE check via OSV. The pinned version is enough to query, so a
  // dependency whose registry lookup failed is still checked.
  const osvQueries = registryResults
    .filter((r) => r.checked_version)
    .map((r) => ({
      name: r.name,
      version: r.checked_version!,
      ecosystem: "PyPI",
    }));
  requireCheckedDependency("PyPI", registryResults, osvQueries, "requirements_txt");
  const cveResult = await batchCveCheck(osvQueries);

  const dependencies = registryResults.map((r) => {
    const vulns = cveResult.vulnerabilities.get(r.name) ?? [];
    const checked = osvQueries.some((q) => q.name === r.name && isQueryable(q));
    return {
      ...r,
      ...(checked ? {} : { checked: false }),
      vulnerabilities: vulns.map((v) => ({
        id: v.id,
        severity: osvSeverity(v),
        summary: v.summary ?? "",
        aliases: v.aliases?.filter((a) => a.startsWith("CVE-")) ?? [],
      })),
      vulnerability_count: vulns.length,
      highest_severity: vulns.length > 0 ? highestSeverity(vulns) : null,
    };
  });

  const outdated = dependencies.filter((r) => (r as Record<string, unknown>).is_outdated);
  const vulnerable = dependencies.filter((r) => r.vulnerability_count > 0);
  const totalVulns = vulnerable.reduce((s, r) => s + r.vulnerability_count, 0);
  const unchecked = dependencies.filter((r) => r.checked === false).length;

  return {
    output: {
      ecosystem: "pypi",
      total_dependencies: deps.length,
      outdated_count: outdated.length,
      vulnerable_count: vulnerable.length,
      total_vulnerabilities: totalVulns,
      dependencies,
      summary: {
        total: deps.length,
        up_to_date: dependencies.filter((r) => r.checked !== false && !(r as Record<string, unknown>).is_outdated && !(r as Record<string, unknown>).error).length,
        outdated: outdated.length,
        vulnerable: vulnerable.length,
        unchecked,
        errors: dependencies.filter((r) => (r as Record<string, unknown>).error).length,
      },
      critical_updates: vulnerable.map((v) => `${v.name} (${v.vulnerability_count} vulns)`),
      // Present when a registry lookup or some OSV advisory-detail reads failed.
      ...(registryResults.some(isUnavailable) || cveResult.detailsUnavailable
        ? { unavailable_sources: [...(registryResults.some(isUnavailable) ? ["PyPI"] : []), ...(cveResult.detailsUnavailable ? [OSV_DETAILS] : [])] }
        : {}),
    },
    provenance: { source: "pypi-registry + osv.dev", fetched_at: new Date().toISOString() },
  };
}
