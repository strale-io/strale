import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * Dependency audit — checks packages for known CVEs (via OSV.dev),
 * outdated versions, and deprecated status. Supports npm and PyPI.
 *
 * Uses the OSV querybatch API for efficient batch CVE scanning
 * (up to 1000 packages per request, free, no API key).
 */

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
  const queryable = packages.filter((p) => p.version && p.version !== "unknown");

  if (queryable.length === 0) return results;

  try {
    const resp = await fetch("https://api.osv.dev/v1/querybatch", {
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

    if (!resp.ok) return results;

    const data = (await resp.json()) as { results: Array<{ vulns?: OsvVuln[] }> };

    for (let i = 0; i < queryable.length; i++) {
      const vulns = data.results?.[i]?.vulns ?? [];
      if (vulns.length > 0) {
        results.set(queryable[i].name, vulns);
      }
    }
  } catch {
    // OSV unavailable — continue without CVE data
  }

  return results;
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
        if (!res.ok) return { name, current_version: currentVersion, error: `HTTP ${res.status}` };

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
        return { name, current_version: currentVersion, error: "fetch failed" };
      }
    }),
  );

  // Batch CVE check via OSV
  const cveMap = await batchCveCheck(
    registryResults
      .filter((r) => !("error" in r))
      .map((r) => ({
        name: r.name,
        version: r.current_version,
        ecosystem: "npm",
      })),
  );

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
        if (!res.ok) return { name: dep.name, current_version: dep.version, error: `HTTP ${res.status}` };

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
        return { name: dep.name, current_version: dep.version, error: "fetch failed" };
      }
    }),
  );

  // Batch CVE check via OSV
  const cveMap = await batchCveCheck(
    registryResults
      .filter((r) => !("error" in r) && r.current_version)
      .map((r) => ({
        name: r.name,
        version: r.current_version!,
        ecosystem: "PyPI",
      })),
  );

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
    },
    provenance: { source: "pypi-registry + osv.dev", fetched_at: new Date().toISOString() },
  };
}
