import { registerCapability, type CapabilityInput } from "./index.js";

// npm Registry API — free, no key required
registerCapability("npm-package-info", async (input: CapabilityInput) => {
  const pkg = ((input.package as string) ?? (input.name as string) ?? (input.task as string) ?? "").trim();
  if (!pkg) throw new Error("'package' (npm package name) is required.");

  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg)}`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) throw new Error(`npm package "${pkg}" not found.`);
  if (!response.ok) throw new Error(`npm registry returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  const latest = data["dist-tags"]?.latest;
  const latestVersion = latest ? data.versions?.[latest] : null;
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
      const dlData = (await dlResp.json()) as any;
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
