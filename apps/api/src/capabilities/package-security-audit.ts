import { registerCapability, type CapabilityInput } from "./index.js";

const COPYLEFT_LICENSES = new Set(["GPL-2.0", "GPL-3.0", "AGPL-3.0", "LGPL-2.1", "LGPL-3.0", "GPL-2.0-only", "GPL-3.0-only", "AGPL-3.0-only", "LGPL-2.1-only", "LGPL-3.0-only"]);

registerCapability("package-security-audit", async (input: CapabilityInput) => {
  const name = ((input.name as string) ?? (input.package as string) ?? "").trim();
  if (!name) throw new Error("'name' is required. Provide an npm or PyPI package name.");

  let version = ((input.version as string) ?? "").trim() || null;
  let ecosystem = ((input.ecosystem as string) ?? "").trim().toLowerCase() || null;

  // ── Detect ecosystem ────────────────────────────────────────────────
  if (!ecosystem) {
    ecosystem = await detectEcosystem(name);
  }
  if (ecosystem !== "npm" && ecosystem !== "pypi") {
    throw new Error(`Unsupported ecosystem '${ecosystem}'. Supported: npm, pypi.`);
  }

  // ── Resolve version + registry data ─────────────────────────────────
  const registry = ecosystem === "npm"
    ? await fetchNpmRegistry(name)
    : await fetchPypiRegistry(name, version);

  if (!version) {
    version = registry.latestVersion;
  }
  if (!version) throw new Error(`Could not determine version for ${name}.`);

  // ── Parallel API calls ──────────────────────────────────────────────
  const [osvResult, depsResult] = await Promise.allSettled([
    fetchOsv(name, version, ecosystem),
    fetchDepsdev(name, version, ecosystem),
  ]);

  const vulns = osvResult.status === "fulfilled" ? osvResult.value : null;
  const deps = depsResult.status === "fulfilled" ? depsResult.value : null;

  // Fetch scorecard if deps.dev returned a project link
  let scorecard: ScorecardResult | null = null;
  if (deps?.projectId) {
    try {
      scorecard = await fetchScorecard(deps.projectId);
    } catch { /* ignore */ }
  }

  // ── Compute risk score ──────────────────────────────────────────────
  let riskScore = 100;

  if (vulns) {
    riskScore -= Math.min(vulns.critical * 25, 50);
    riskScore -= Math.min(vulns.high * 15, 30);
    riskScore -= Math.min(vulns.medium * 8, 16);
    riskScore -= Math.min(vulns.low * 3, 6);
  }

  if (registry.isDeprecated) riskScore -= 20;

  if (registry.daysSinceLastRelease !== null) {
    if (registry.daysSinceLastRelease > 730) riskScore -= 20;
    else if (registry.daysSinceLastRelease > 365) riskScore -= 10;
  }

  if (scorecard && scorecard.score < 4) riskScore -= 10;

  const license = deps?.license ?? null;
  if (license) {
    if (COPYLEFT_LICENSES.has(license)) riskScore -= 5;
  } else {
    riskScore -= 15;
  }

  riskScore = Math.max(0, riskScore);
  const riskLevel = riskScore >= 80 ? "low" : riskScore >= 50 ? "medium" : riskScore >= 25 ? "high" : "critical";

  return {
    output: {
      name,
      version,
      ecosystem,
      risk_score: riskScore,
      risk_level: riskLevel,
      vulnerabilities: vulns
        ? {
            total: vulns.total,
            critical: vulns.critical,
            high: vulns.high,
            medium: vulns.medium,
            low: vulns.low,
            details: vulns.details.slice(0, 10),
          }
        : null,
      license: license
        ? {
            spdx: license,
            is_osi_approved: !COPYLEFT_LICENSES.has(license), // simplified
            is_copyleft: COPYLEFT_LICENSES.has(license),
          }
        : null,
      freshness: {
        latest_version: registry.latestVersion,
        published_at: registry.publishedAt,
        is_latest: version === registry.latestVersion,
        is_deprecated: registry.isDeprecated,
        days_since_last_release: registry.daysSinceLastRelease,
      },
      scorecard: scorecard
        ? {
            score: scorecard.score,
            checks: scorecard.checks,
          }
        : null,
      maintainers: registry.maintainerCount,
      dependency_count: deps?.dependencyCount ?? null,
    },
    provenance: {
      source: "osv.dev + deps.dev + registry",
      fetched_at: new Date().toISOString(),
    },
  };
});

// ── Types ─────────────────────────────────────────────────────────────────────

interface VulnResult {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  details: Array<{ id: string; severity: string; summary: string; fixed_in: string | null }>;
}

interface DepsdevResult {
  license: string | null;
  dependencyCount: number;
  projectId: string | null;
}

interface ScorecardResult {
  score: number;
  checks: Record<string, number>;
}

interface RegistryResult {
  latestVersion: string | null;
  publishedAt: string | null;
  isDeprecated: boolean;
  daysSinceLastRelease: number | null;
  maintainerCount: number | null;
}

// ── Ecosystem detection ───────────────────────────────────────────────────────

async function detectEcosystem(name: string): Promise<string> {
  try {
    const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) return "npm";
  } catch { /* ignore */ }

  try {
    const resp = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) return "pypi";
  } catch { /* ignore */ }

  throw new Error(`Package '${name}' not found in npm or PyPI registries.`);
}

// ── OSV.dev ───────────────────────────────────────────────────────────────────

async function fetchOsv(name: string, version: string, ecosystem: string): Promise<VulnResult> {
  const resp = await fetch("https://api.osv.dev/v1/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      version,
      package: { name, ecosystem: ecosystem === "npm" ? "npm" : "PyPI" },
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) throw new Error(`OSV API returned HTTP ${resp.status}`);
  const data = (await resp.json()) as { vulns?: Array<Record<string, unknown>> };
  const vulns = data.vulns ?? [];

  let critical = 0, high = 0, medium = 0, low = 0;
  const details: VulnResult["details"] = [];

  for (const v of vulns) {
    const severity = extractSeverity(v);
    if (severity === "CRITICAL") critical++;
    else if (severity === "HIGH") high++;
    else if (severity === "MEDIUM") medium++;
    else low++;

    details.push({
      id: (v.id as string) ?? "unknown",
      severity: severity.toLowerCase(),
      summary: ((v.summary as string) ?? "").slice(0, 200),
      fixed_in: extractFixedVersion(v),
    });
  }

  return { total: vulns.length, critical, high, medium, low, details };
}

function extractSeverity(vuln: Record<string, unknown>): string {
  const severity = vuln.database_specific as Record<string, unknown> | undefined;
  if (severity?.severity) return String(severity.severity).toUpperCase();

  const cvss = (vuln.severity as Array<{ type: string; score: string }>) ?? [];
  for (const s of cvss) {
    if (s.type === "CVSS_V3") {
      const score = parseFloat(s.score?.split("/")[0] ?? "0");
      if (score >= 9) return "CRITICAL";
      if (score >= 7) return "HIGH";
      if (score >= 4) return "MEDIUM";
      return "LOW";
    }
  }
  return "UNKNOWN";
}

function extractFixedVersion(vuln: Record<string, unknown>): string | null {
  const affected = (vuln.affected as Array<{ ranges?: Array<{ events?: Array<{ fixed?: string }> }> }>) ?? [];
  for (const a of affected) {
    for (const range of a.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed) return event.fixed;
      }
    }
  }
  return null;
}

// ── deps.dev ──────────────────────────────────────────────────────────────────

async function fetchDepsdev(name: string, version: string, ecosystem: string): Promise<DepsdevResult> {
  const system = ecosystem === "npm" ? "npm" : "pypi";
  const encodedName = encodeURIComponent(name);
  const encodedVersion = encodeURIComponent(version);

  const resp = await fetch(
    `https://api.deps.dev/v3alpha/systems/${system}/packages/${encodedName}/versions/${encodedVersion}`,
    { signal: AbortSignal.timeout(10000) },
  );

  if (!resp.ok) return { license: null, dependencyCount: 0, projectId: null };

  const data = (await resp.json()) as Record<string, unknown>;
  const links = (data.links as Array<{ label: string; url: string }>) ?? [];
  const repoLink = links.find((l) => l.label === "SOURCE_REPO")?.url ?? null;

  let projectId: string | null = null;
  if (repoLink) {
    const match = repoLink.match(/github\.com\/([^/]+\/[^/]+)/);
    if (match) projectId = `github.com/${match[1]}`;
  }

  const licenses = (data.licenses as string[]) ?? [];
  const depNodes = (data.dependencyCount as number) ?? 0;

  return {
    license: licenses[0] ?? null,
    dependencyCount: depNodes,
    projectId,
  };
}

// ── OpenSSF Scorecard ─────────────────────────────────────────────────────────

async function fetchScorecard(projectId: string): Promise<ScorecardResult | null> {
  const encoded = encodeURIComponent(projectId);
  const resp = await fetch(`https://api.deps.dev/v3alpha/projects/${encoded}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) return null;

  const data = (await resp.json()) as {
    scorecardV2?: { overallScore?: number; check?: Array<{ name: string; score: number }> };
  };

  const sc = data.scorecardV2;
  if (!sc) return null;

  const checks: Record<string, number> = {};
  for (const c of sc.check ?? []) {
    checks[c.name] = c.score;
  }

  return { score: sc.overallScore ?? 0, checks };
}

// ── npm Registry ──────────────────────────────────────────────────────────────

async function fetchNpmRegistry(name: string): Promise<RegistryResult> {
  const resp = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (resp.status === 404) throw new Error(`npm package '${name}' not found.`);
  if (!resp.ok) throw new Error(`npm registry returned HTTP ${resp.status}`);

  const data = (await resp.json()) as Record<string, unknown>;
  const latest = (data["dist-tags"] as Record<string, string>)?.latest ?? null;
  const times = (data.time as Record<string, string>) ?? {};
  const latestTime = latest ? times[latest] : null;

  const maintainers = (data.maintainers as Array<unknown>) ?? [];
  const versionData = latest ? (data.versions as Record<string, Record<string, unknown>>)?.[latest] : null;
  const deprecated = !!versionData?.deprecated;

  let daysSinceLastRelease: number | null = null;
  if (latestTime) {
    daysSinceLastRelease = Math.floor((Date.now() - new Date(latestTime).getTime()) / (86400 * 1000));
  }

  return {
    latestVersion: latest,
    publishedAt: latestTime ?? null,
    isDeprecated: deprecated,
    daysSinceLastRelease,
    maintainerCount: maintainers.length,
  };
}

// ── PyPI Registry ─────────────────────────────────────────────────────────────

async function fetchPypiRegistry(name: string, version: string | null): Promise<RegistryResult> {
  const url = version
    ? `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`
    : `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (resp.status === 404) throw new Error(`PyPI package '${name}'${version ? ` version ${version}` : ""} not found.`);
  if (!resp.ok) throw new Error(`PyPI returned HTTP ${resp.status}`);

  const data = (await resp.json()) as Record<string, unknown>;
  const info = (data.info as Record<string, unknown>) ?? {};

  const latestVersion = (info.version as string) ?? null;
  const releases = (data.releases as Record<string, Array<{ upload_time_iso_8601?: string }>>) ?? {};
  const latestRelease = latestVersion ? releases[latestVersion] : null;
  const publishedAt = latestRelease?.[0]?.upload_time_iso_8601 ?? null;

  let daysSinceLastRelease: number | null = null;
  if (publishedAt) {
    daysSinceLastRelease = Math.floor((Date.now() - new Date(publishedAt).getTime()) / (86400 * 1000));
  }

  // PyPI doesn't expose maintainer count directly; use author as proxy
  const maintainerCount = info.author ? 1 : 0;

  return {
    latestVersion,
    publishedAt,
    isDeprecated: false, // PyPI doesn't have a deprecation flag per-version
    daysSinceLastRelease,
    maintainerCount,
  };
}
