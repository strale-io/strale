import { registerCapability, type CapabilityInput } from "./index.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";

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
 * version to OSV when there is one. A dependency that declares none (an
 * unpinned PyPI requirement) is not checked, and its zero count means
 * unchecked (recorded in the promise-audit T1 next_action). A registry 404
 * stays what it was: an `error` on that dependency.
 */

const OSV = "OSV vulnerability database";

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
  summary: string;
  severity: Array<{ type: string; score: string }>;
  aliases: string[];
}

async function batchCveCheck(
  packages: Array<{ name: string; version: string; ecosystem: string }>,
): Promise<Map<string, OsvVuln[]>> {
  const results = new Map<string, OsvVuln[]>();
  if (packages.length === 0) return results;

  // Filter to packages with parseable versions
  const queryable = packages.filter(isQueryable);

  if (queryable.length === 0) return results;

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

  for (let i = 0; i < queryable.length; i++) {
    const vulns = answers[i]?.vulns ?? [];
    if (vulns.length > 0) {
      results.set(queryable[i].name, vulns);
    }
  }

  return results;
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
function requireSomeAnswer(registry: string, results: object[], osvQueries: Array<{ version: string }>): void {
  if (results.length > 0 && results.every(isUnavailable) && !osvQueries.some(isQueryable)) {
    throw new UpstreamUnavailableError(
      registry,
      `all ${results.length} lookups failed and no dependency had a version for OSV to check; retry shortly.`,
    );
  }
}

function getHighestSeverity(vulns: OsvVuln[]): string {
  for (const v of vulns) {
    for (const s of v.severity ?? []) {
      const score = parseFloat(s.score);
      if (score >= 9.0) return "critical";
      if (score >= 7.0) return "high";
      if (score >= 4.0) return "medium";
    }
  }
  return "low";
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
    .filter((r) => !("error" in r) || isUnavailable(r))
    .map((r) => ({
      name: r.name,
      version: r.current_version,
      ecosystem: "npm",
    }));
  requireSomeAnswer("npm registry", registryResults, osvQueries);
  const cveMap = await batchCveCheck(osvQueries);

  // Merge CVE results
  const dependencies = registryResults.map((r) => {
    const vulns = cveMap.get(r.name) ?? [];
    return {
      ...r,
      vulnerabilities: vulns.map((v) => ({
        id: v.id,
        summary: v.summary,
        aliases: v.aliases?.filter((a) => a.startsWith("CVE-")) ?? [],
      })),
      vulnerability_count: vulns.length,
      highest_severity: vulns.length > 0 ? getHighestSeverity(vulns) : null,
    };
  });

  const outdated = dependencies.filter((r) => (r as Record<string, unknown>).is_outdated);
  const deprecated = dependencies.filter((r) => (r as Record<string, unknown>).is_deprecated);
  const vulnerable = dependencies.filter((r) => r.vulnerability_count > 0);
  const totalVulns = vulnerable.reduce((s, r) => s + r.vulnerability_count, 0);

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
        up_to_date: dependencies.filter((r) => !(r as Record<string, unknown>).is_outdated && !(r as Record<string, unknown>).error).length,
        outdated: outdated.length,
        deprecated: deprecated.length,
        vulnerable: vulnerable.length,
        errors: dependencies.filter((r) => (r as Record<string, unknown>).error).length,
      },
      critical_updates: [
        ...deprecated.map((d) => `${d.name} (deprecated)`),
        ...vulnerable.map((v) => `${v.name} (${v.vulnerability_count} vulns)`),
      ],
      // Present only when a registry lookup failed, so a complete answer is unchanged.
      ...(registryResults.some(isUnavailable) ? { unavailable_sources: ["npm registry"] } : {}),
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
            ? { name: dep.name, current_version: dep.version, error: `HTTP ${res.status}`, unavailable: true }
            : { name: dep.name, current_version: dep.version, error: `HTTP ${res.status}` };
        }

        const data = (await res.json()) as Record<string, unknown>;
        const info = data.info as Record<string, unknown>;
        const latest = (info.version as string) ?? "unknown";

        return {
          name: dep.name,
          current_version: dep.version,
          latest_version: latest,
          is_outdated: dep.version !== null && dep.version !== latest,
        };
      } catch {
        return { name: dep.name, current_version: dep.version, error: "fetch failed", unavailable: true };
      }
    }),
  );

  // Batch CVE check via OSV. The pinned version is enough to query, so a
  // dependency whose registry lookup failed is still checked.
  const osvQueries = registryResults
    .filter((r) => (!("error" in r) || isUnavailable(r)) && r.current_version)
    .map((r) => ({
      name: r.name,
      version: r.current_version!,
      ecosystem: "PyPI",
    }));
  requireSomeAnswer("PyPI", registryResults, osvQueries);
  const cveMap = await batchCveCheck(osvQueries);

  const dependencies = registryResults.map((r) => {
    const vulns = cveMap.get(r.name) ?? [];
    return {
      ...r,
      vulnerabilities: vulns.map((v) => ({
        id: v.id,
        summary: v.summary,
        aliases: v.aliases?.filter((a) => a.startsWith("CVE-")) ?? [],
      })),
      vulnerability_count: vulns.length,
      highest_severity: vulns.length > 0 ? getHighestSeverity(vulns) : null,
    };
  });

  const outdated = dependencies.filter((r) => (r as Record<string, unknown>).is_outdated);
  const vulnerable = dependencies.filter((r) => r.vulnerability_count > 0);
  const totalVulns = vulnerable.reduce((s, r) => s + r.vulnerability_count, 0);

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
        up_to_date: dependencies.filter((r) => !(r as Record<string, unknown>).is_outdated && !(r as Record<string, unknown>).error).length,
        outdated: outdated.length,
        vulnerable: vulnerable.length,
        errors: dependencies.filter((r) => (r as Record<string, unknown>).error).length,
      },
      critical_updates: vulnerable.map((v) => `${v.name} (${v.vulnerability_count} vulns)`),
      // Present only when a registry lookup failed, so a complete answer is unchanged.
      ...(registryResults.some(isUnavailable) ? { unavailable_sources: ["PyPI"] } : {}),
    },
    provenance: { source: "pypi-registry + osv.dev", fetched_at: new Date().toISOString() },
  };
}
