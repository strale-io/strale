import { registerCapability, type CapabilityInput } from "./index.js";
import { MAX_PACKAGE_REGISTRY_RESPONSE_BYTES, MAX_PACKUMENT_BYTES, readJsonPickWithLimit, readJsonWithLimit } from "../lib/resource-limits.js";
import type { Pick } from "../lib/json-pick.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";

const NPM_AUDIT_PICK: Pick = {
  "dist-tags": true, time: true, maintainers: true,
  // detectInstallScripts reads only these three script names.
  versions: { "*": { _npmUser: true, scripts: { preinstall: true, install: true, postinstall: true }, deprecated: true } },
};

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

  // ── Determine previous version (for supply chain checks) ───────────
  const previousVersion = findPreviousVersion(registry.versionTimestamps, version);

  // ── Parallel API calls ──────────────────────────────────────────────
  const [osvResult, depsResult, prevDepsResult] = await Promise.allSettled([
    fetchOsv(name, version, ecosystem),
    fetchDepsdev(name, version, ecosystem),
    previousVersion
      ? fetchDepsdevProvenance(name, previousVersion, ecosystem)
      : Promise.resolve(null),
  ]);

  // OSV decides the verdict. Without it the score skipped every vulnerability
  // penalty and read "low" for a package nobody had checked, a billed clean
  // answer (2026-11-06 swallowed-failures audit, row 7). It is a required leg,
  // not one of several sources for the same fact, so its failure is the call's.
  if (osvResult.status === "rejected") throw transportFailure(OSV, osvResult.reason);
  const vulns = osvResult.value;

  // deps.dev and the Scorecard are secondary signals. When one fails the
  // answer stands, the failed leg is named in `unavailable_sources`, and the
  // fields it feeds read null (unknown), never a clean value.
  const unavailableSources: string[] = [];
  const deps = depsResult.status === "fulfilled" ? depsResult.value : null;
  if (depsResult.status === "rejected") unavailableSources.push(DEPS_DEV);
  const prevDeps = prevDepsResult.status === "fulfilled" ? prevDepsResult.value : null;
  if (prevDepsResult.status === "rejected") unavailableSources.push(`${DEPS_DEV} (previous version)`);

  // Fetch scorecard if deps.dev returned a project link
  let scorecard: ScorecardResult | null = null;
  if (deps?.projectId) {
    try {
      scorecard = await fetchScorecard(deps.projectId);
    } catch {
      // degraded-ok: the Scorecard is an optional signal that only ever adds a penalty; its failure is named in unavailable_sources, so a null scorecard is not read as "none published".
      unavailableSources.push(SCORECARD);
    }
  }

  // ── Supply chain analysis ───────────────────────────────────────────
  const versionAgeHours = computeVersionAgeHours(registry.versionTimestamps, version);

  const publisherInfo = ecosystem === "npm"
    ? detectPublisherChange(registry.versionPublishers, version, previousVersion)
    : { changed: null, previous: null, current: null };

  const currentHasAttestation = deps?.hasAttestation ?? null;
  const previousHadAttestation = prevDeps?.hasAttestation ?? null;
  // Unknown, not false, when either deps.dev read failed: a dropped
  // attestation is exactly the signal a failed leg would otherwise hide.
  const attestationMissing = depsResult.status === "rejected" || prevDepsResult.status === "rejected"
    ? null
    : previousHadAttestation === true && currentHasAttestation === false;

  const installScripts = ecosystem === "npm"
    ? detectInstallScripts(registry.versionScripts, version)
    : { has: false, names: [] as string[] };

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

  // Supply chain anomaly penalties
  if (publisherInfo.changed) riskScore -= 20;
  if (attestationMissing) riskScore -= 15;
  if (versionAgeHours !== null) {
    if (versionAgeHours < 24) riskScore -= 10;
    else if (versionAgeHours < 72) riskScore -= 5;
  }
  if (installScripts.has) riskScore -= 5;

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
            is_osi_approved: !COPYLEFT_LICENSES.has(license),
            is_copyleft: COPYLEFT_LICENSES.has(license),
          }
        : null,
      freshness: {
        latest_version: registry.latestVersion,
        published_at: registry.publishedAt,
        is_latest: version === registry.latestVersion,
        is_deprecated: registry.isDeprecated,
        days_since_last_release: registry.daysSinceLastRelease,
        version_age_hours: versionAgeHours,
        recently_published: versionAgeHours !== null && versionAgeHours < 72,
      },
      scorecard: scorecard
        ? {
            score: scorecard.score,
            checks: scorecard.checks,
          }
        : null,
      supply_chain: {
        publisher_changed: publisherInfo.changed,
        previous_publisher: publisherInfo.previous,
        current_publisher: publisherInfo.current,
        provenance: {
          has_attestation: currentHasAttestation,
          previous_had_attestation: previousHadAttestation,
          attestation_missing: attestationMissing,
        },
        has_install_scripts: installScripts.has,
        install_script_names: installScripts.names,
      },
      maintainers: registry.maintainerCount,
      dependency_count: deps?.dependencyCount ?? null,
      // Present only when a secondary leg failed, so a complete answer is unchanged.
      ...(unavailableSources.length > 0 ? { unavailable_sources: unavailableSources } : {}),
    },
    provenance: {
      source: "osv.dev + deps.dev + registry",
      fetched_at: new Date().toISOString(),
    },
  };
});

// ── Upstream failures ─────────────────────────────────────────────────────────

const OSV = "OSV vulnerability database";
const DEPS_DEV = "deps.dev";
const SCORECARD = "OpenSSF Scorecard (deps.dev)";

/**
 * An HTTP status that is no answer. 429 and 5xx are the upstream being
 * unavailable, worth a retry; 404 or 410 on a fixed endpoint means it is gone,
 * which a retry will not fix. Callers handle a 404 that IS an answer first.
 * Any other status is a rejection of our request, left as a plain error.
 */
function httpFailure(upstream: string, status: number): Error {
  if (status === 429 || status >= 500) {
    return new UpstreamUnavailableError(upstream, `HTTP ${status}; retry shortly.`, { code: `HTTP ${status}` });
  }
  if (status === 404 || status === 410) {
    return new UpstreamUnavailableError(upstream, `HTTP ${status}; the endpoint is gone.`, { code: `HTTP ${status}`, retryable: false });
  }
  return new Error(`${upstream} returned HTTP ${status}`);
}

/**
 * A request that produced no usable HTTP answer: a timeout, a network error or
 * a body that does not parse. Anything else (our own code breaking) is
 * returned unchanged, so a defect is never relabelled as the provider's fault.
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

/** `fetch` whose transport failures are upstream failures. */
async function upstreamFetch(upstream: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    throw transportFailure(upstream, err);
  }
}

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
  hasAttestation: boolean | null;
}

interface ProvenanceResult {
  hasAttestation: boolean | null;
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
  versionTimestamps: Record<string, string>;
  versionPublishers: Record<string, { name: string; email: string } | null>;
  versionScripts: Record<string, Record<string, string> | null>;
}

// ── Supply chain helpers ─────────────────────────────────────────────────────

function findPreviousVersion(
  versionTimestamps: Record<string, string>,
  currentVersion: string,
): string | null {
  const entries = Object.entries(versionTimestamps)
    .filter(([v]) => v !== "created" && v !== "modified" && v !== currentVersion)
    .sort((a, b) => new Date(a[1]).getTime() - new Date(b[1]).getTime());

  const currentTime = versionTimestamps[currentVersion];
  if (!currentTime) return entries.at(-1)?.[0] ?? null;

  const currentMs = new Date(currentTime).getTime();
  const before = entries.filter(([, t]) => new Date(t).getTime() < currentMs);
  return before.at(-1)?.[0] ?? null;
}

function computeVersionAgeHours(
  versionTimestamps: Record<string, string>,
  version: string,
): number | null {
  const ts = versionTimestamps[version];
  if (!ts) return null;
  return Math.round((Date.now() - new Date(ts).getTime()) / (3600 * 1000));
}

function detectPublisherChange(
  versionPublishers: Record<string, { name: string; email: string } | null>,
  currentVersion: string,
  previousVersion: string | null,
): { changed: boolean | null; previous: string | null; current: string | null } {
  if (!previousVersion) return { changed: null, previous: null, current: null };
  const current = versionPublishers[currentVersion];
  const previous = versionPublishers[previousVersion];
  if (!current || !previous) return { changed: null, previous: previous?.name ?? null, current: current?.name ?? null };
  return {
    changed: current.name !== previous.name,
    previous: previous.name,
    current: current.name,
  };
}

function detectInstallScripts(
  versionScripts: Record<string, Record<string, string> | null>,
  version: string,
): { has: boolean; names: string[] } {
  const scripts = versionScripts[version];
  if (!scripts) return { has: false, names: [] };
  const dangerous = ["preinstall", "install", "postinstall"];
  const found = dangerous.filter((s) => s in scripts);
  return { has: found.length > 0, names: found };
}

// ── Ecosystem detection ───────────────────────────────────────────────────────

async function detectEcosystem(name: string): Promise<string> {
  // Only a 404 says the package is not in a registry. Any other failure says
  // nothing, and falling through to the other registry on it could audit a
  // different package that shares the name, so it throws instead.
  if (await registryHas("npm registry", `https://registry.npmjs.org/${encodeURIComponent(name)}`)) return "npm";
  if (await registryHas("PyPI", `https://pypi.org/pypi/${encodeURIComponent(name)}/json`)) return "pypi";
  throw new Error(`Package '${name}' not found in npm or PyPI registries.`);
}

async function registryHas(upstream: string, url: string): Promise<boolean> {
  const resp = await upstreamFetch(upstream, url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
  if (resp.ok) return true;
  if (resp.status === 404) return false;
  throw httpFailure(upstream, resp.status);
}

// ── OSV.dev ───────────────────────────────────────────────────────────────────

async function fetchOsv(name: string, version: string, ecosystem: string): Promise<VulnResult> {
  const resp = await upstreamFetch(OSV, "https://api.osv.dev/v1/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      version,
      package: { name, ecosystem: ecosystem === "npm" ? "npm" : "PyPI" },
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!resp.ok) throw httpFailure(OSV, resp.status);
  // OSV answers a package it knows no vulnerability for with `{}`: that is the
  // real negative. A body that is not an object, or whose `vulns` is not a
  // list, is no answer at all.
  const data = (await resp.json()) as { vulns?: unknown } | null;
  if (data === null || typeof data !== "object" || (data.vulns !== undefined && !Array.isArray(data.vulns))) {
    throw new UpstreamUnavailableError(OSV, "the response was not a vulnerability list.", { code: "unparseable" });
  }
  const vulns = (data.vulns ?? []) as Array<Record<string, unknown>>;

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

  const resp = await upstreamFetch(
    DEPS_DEV,
    `https://api.deps.dev/v3alpha/systems/${system}/packages/${encodedName}/versions/${encodedVersion}`,
    { signal: AbortSignal.timeout(10000) },
  );

  // 404: deps.dev has not indexed this version, a real answer (and the output
  // it always gave). Any other failure rejects, and the caller names the leg.
  if (resp.status === 404) return { license: null, dependencyCount: 0, projectId: null, hasAttestation: null };
  if (!resp.ok) throw httpFailure(DEPS_DEV, resp.status);

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

  // Check provenance attestations
  const slsaProvenances = (data.slsaProvenances as unknown[]) ?? [];
  const attestations = (data.attestations as unknown[]) ?? [];
  const hasAttestation = slsaProvenances.length > 0 || attestations.length > 0;

  return {
    license: licenses[0] ?? null,
    dependencyCount: depNodes,
    projectId,
    hasAttestation,
  };
}

async function fetchDepsdevProvenance(
  name: string,
  version: string,
  ecosystem: string,
): Promise<ProvenanceResult | null> {
  const system = ecosystem === "npm" ? "npm" : "pypi";
  const encodedName = encodeURIComponent(name);
  const encodedVersion = encodeURIComponent(version);

  const resp = await upstreamFetch(
    DEPS_DEV,
    `https://api.deps.dev/v3alpha/systems/${system}/packages/${encodedName}/versions/${encodedVersion}`,
    { signal: AbortSignal.timeout(5000) },
  );

  // 404: the previous version is not indexed, a real answer. Any other
  // failure rejects; the caller names the leg and reports the comparison unknown.
  if (resp.status === 404) return null;
  if (!resp.ok) throw httpFailure(DEPS_DEV, resp.status);
  const data = (await resp.json()) as Record<string, unknown>;
  const slsaProvenances = (data.slsaProvenances as unknown[]) ?? [];
  const attestations = (data.attestations as unknown[]) ?? [];
  return { hasAttestation: slsaProvenances.length > 0 || attestations.length > 0 };
}

// ── OpenSSF Scorecard ─────────────────────────────────────────────────────────

async function fetchScorecard(projectId: string): Promise<ScorecardResult | null> {
  const encoded = encodeURIComponent(projectId);
  const resp = await upstreamFetch(SCORECARD, `https://api.deps.dev/v3alpha/projects/${encoded}`, {
    signal: AbortSignal.timeout(10000),
  });

  // 404: no project record, so no Scorecard; a real answer.
  if (resp.status === 404) return null;
  if (!resp.ok) throw httpFailure(SCORECARD, resp.status);

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

  if (resp.status === 404) {
    await resp.body?.cancel();
    throw new Error(`npm package '${name}' not found.`);
  }
  if (!resp.ok) {
    await resp.body?.cancel();
    throw new Error(`npm registry returned HTTP ${resp.status}`);
  }

  // Scanned, not parsed whole (lib/json-pick.ts): the packument of a popular
  // package is 30-75 MB. Kept: dist-tags, `time` (every release's date, to find
  // the previous release), the maintainer list, and per release only the
  // publisher, scripts and deprecation notice.
  const data = await readJsonPickWithLimit(resp, MAX_PACKUMENT_BYTES, NPM_AUDIT_PICK, "name", "a registry record of");
  const latest = (data["dist-tags"] as Record<string, string>)?.latest ?? null;
  const times = (data.time as Record<string, string>) ?? {};
  const latestTime = latest ? times[latest] : null;

  const maintainers = (data.maintainers as Array<unknown>) ?? [];
  const versions = (data.versions as Record<string, Record<string, unknown>>) ?? {};
  const latestData = latest ? versions[latest] : null;
  const deprecated = !!latestData?.deprecated;

  let daysSinceLastRelease: number | null = null;
  if (latestTime) {
    daysSinceLastRelease = Math.floor((Date.now() - new Date(latestTime).getTime()) / (86400 * 1000));
  }

  // Extract per-version publisher info and scripts
  const versionPublishers: Record<string, { name: string; email: string } | null> = {};
  const versionScripts: Record<string, Record<string, string> | null> = {};
  for (const [ver, verData] of Object.entries(versions)) {
    const npmUser = verData._npmUser as { name?: string; email?: string } | undefined;
    versionPublishers[ver] = npmUser?.name ? { name: npmUser.name, email: npmUser.email ?? "" } : null;
    versionScripts[ver] = (verData.scripts as Record<string, string>) ?? null;
  }

  return {
    latestVersion: latest,
    publishedAt: latestTime ?? null,
    isDeprecated: deprecated,
    daysSinceLastRelease,
    maintainerCount: maintainers.length,
    versionTimestamps: times,
    versionPublishers,
    versionScripts,
  };
}

// ── PyPI Registry ─────────────────────────────────────────────────────────────

async function fetchPypiRegistry(name: string, version: string | null): Promise<RegistryResult> {
  const url = version
    ? `https://pypi.org/pypi/${encodeURIComponent(name)}/${encodeURIComponent(version)}/json`
    : `https://pypi.org/pypi/${encodeURIComponent(name)}/json`;

  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (resp.status === 404) {
    await resp.body?.cancel();
    throw new Error(`PyPI package '${name}'${version ? ` version ${version}` : ""} not found.`);
  }
  if (!resp.ok) {
    await resp.body?.cancel();
    throw new Error(`PyPI returned HTTP ${resp.status}`);
  }

  const data = await readJsonWithLimit<Record<string, unknown>>(resp, MAX_PACKAGE_REGISTRY_RESPONSE_BYTES, "name", "a registry record of");
  const info = (data.info as Record<string, unknown>) ?? {};

  const latestVersion = (info.version as string) ?? null;
  const releases = (data.releases as Record<string, Array<{ upload_time_iso_8601?: string }>>) ?? {};
  const latestRelease = latestVersion ? releases[latestVersion] : null;
  const publishedAt = latestRelease?.[0]?.upload_time_iso_8601 ?? null;

  let daysSinceLastRelease: number | null = null;
  if (publishedAt) {
    daysSinceLastRelease = Math.floor((Date.now() - new Date(publishedAt).getTime()) / (86400 * 1000));
  }

  // Build version timestamps from releases
  const versionTimestamps: Record<string, string> = {};
  for (const [ver, files] of Object.entries(releases)) {
    if (files[0]?.upload_time_iso_8601) {
      versionTimestamps[ver] = files[0].upload_time_iso_8601;
    }
  }

  const maintainerCount = info.author ? 1 : 0;

  return {
    latestVersion,
    publishedAt,
    isDeprecated: false,
    daysSinceLastRelease,
    maintainerCount,
    versionTimestamps,
    versionPublishers: {},  // PyPI doesn't expose per-version publisher
    versionScripts: {},      // Not applicable for PyPI
  };
}
