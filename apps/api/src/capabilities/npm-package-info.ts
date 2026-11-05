import { registerCapability, type CapabilityInput } from "./index.js";
import { MAX_FETCHED_API_RESPONSE_BYTES, MAX_PACKAGE_REGISTRY_RESPONSE_BYTES, MAX_PACKUMENT_BYTES, readJsonPickWithLimit, readJsonWithLimit } from "../lib/resource-limits.js";
import type { Pick } from "../lib/json-pick.js";

// The packument fields this reads; versions are kept by NAME only.
const PACKUMENT_PICK: Pick = {
  name: true, description: true, license: true, homepage: true, repository: true, author: true,
  keywords: true, "dist-tags": true, time: true, versions: "keys",
};

// npm Registry API — free, no key required
registerCapability("npm-package-info", async (input: CapabilityInput) => {
  const pkg = ((input.package as string) ?? (input.name as string) ?? (input.task as string) ?? "").trim();
  if (!pkg) throw new Error("'package' (npm package name) is required.");

  const base = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
  // Not the full packument (renovate's is 74 MB, vite's 39 MB, next's 31 MB):
  //  1. the packument, scanned and cut down to what this reads: dist-tags, the
  //     list of version names, `time` (created, modified and each release's
  //     publish date, which only the full document carries), and the few
  //     top-level descriptors;
  //  2. `<pkg>/latest`, the latest version's own small manifest, for its
  //     license, homepage and dependencies.
  // Both requests must succeed. A failed /latest is an upstream error, like a
  // failed packument fetch, not a reason to answer with empty dependency lists
  // that would read as "this package has no dependencies". A 404 on /latest is
  // different: the package has no `latest` tag, so there IS no latest version
  // and its (absent) dependency lists are empty because of that.
  const [response, latestAttempt] = await Promise.all([
    fetch(base, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }),
    fetch(`${base}/latest`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }).then(
      (res) => ({ res, err: null as unknown }),
      (err: unknown) => ({ res: null as Response | null, err }),
    ),
  ]);
  const latestResponse = latestAttempt.res;
  const dropLatest = () => latestResponse?.body?.cancel().catch(() => undefined);

  if (response.status === 404) {
    await response.body?.cancel();
    await dropLatest();
    throw new Error(`npm package "${pkg}" not found.`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    await dropLatest();
    throw new Error(`npm registry returned HTTP ${response.status}`);
  }
  if (latestAttempt.err || (latestResponse && !latestResponse.ok && latestResponse.status !== 404)) {
    await response.body?.cancel();
    await dropLatest();
    if (latestAttempt.err) {
      throw new Error(`npm registry latest-version request failed: ${latestAttempt.err instanceof Error ? latestAttempt.err.message : String(latestAttempt.err)}`);
    }
    throw new Error(`npm registry returned HTTP ${latestResponse!.status}`);
  }

  let data: Record<string, any>;
  try {
    data = await readJsonPickWithLimit(response, MAX_PACKUMENT_BYTES, PACKUMENT_PICK, "package", "a registry record of");
  } catch (err) {
    await dropLatest();
    throw err;
  }
  let latestVersion: any = null;
  if (latestResponse?.ok) {
    try {
      latestVersion = await readJsonWithLimit<any>(latestResponse, MAX_PACKAGE_REGISTRY_RESPONSE_BYTES, "package", "a registry record of");
    } catch (err) {
      if (err instanceof SyntaxError) throw new Error("npm registry returned an unreadable latest-version record; retry later.");
      throw err;
    }
  } else {
    await dropLatest();
  }
  const latest = data["dist-tags"]?.latest;
  const times = data.time ?? {};

  // Get version count and recent versions
  const versionList = Object.keys(data.versions ?? {});
  const recentVersions = versionList.slice(-5).reverse().map(v => ({
    version: v,
    published: times[v] ?? null,
  }));

  // Weekly downloads (separate API call)
  let weeklyDownloads: number | null = null;
  try {
    const dlResp = await fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(pkg)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (dlResp.ok) {
      const dlData = await readJsonWithLimit<any>(dlResp, MAX_FETCHED_API_RESPONSE_BYTES, "package");
      weeklyDownloads = dlData.downloads ?? null;
    }
  } catch { /* non-critical */ }

  return {
    output: {
      name: data.name,
      description: data.description ?? null,
      latest_version: latest,
      license: latestVersion?.license ?? data.license ?? null,
      homepage: latestVersion?.homepage ?? data.homepage ?? null,
      repository: typeof data.repository === "string" ? data.repository : data.repository?.url ?? null,
      author: typeof data.author === "string" ? data.author : data.author?.name ?? null,
      keywords: data.keywords ?? [],
      dependencies: Object.keys(latestVersion?.dependencies ?? {}),
      dev_dependencies: Object.keys(latestVersion?.devDependencies ?? {}),
      total_versions: versionList.length,
      recent_versions: recentVersions,
      weekly_downloads: weeklyDownloads,
      created: times.created ?? null,
      last_modified: times.modified ?? null,
      dist_tags: data["dist-tags"] ?? {},
    },
    provenance: { source: "registry.npmjs.org", fetched_at: new Date().toISOString() },
  };
});
