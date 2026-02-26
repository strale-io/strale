import { registerCapability, type CapabilityInput } from "./index.js";

// PyPI JSON API — free, no key required
registerCapability("pypi-package-info", async (input: CapabilityInput) => {
  const pkg = ((input.package as string) ?? (input.name as string) ?? (input.task as string) ?? "").trim();
  if (!pkg) throw new Error("'package' (PyPI package name) is required.");

  const url = `https://pypi.org/pypi/${encodeURIComponent(pkg)}/json`;
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (response.status === 404) throw new Error(`PyPI package "${pkg}" not found.`);
  if (!response.ok) throw new Error(`PyPI API returned HTTP ${response.status}`);

  const data = (await response.json()) as any;
  const info = data.info ?? {};

  // Get release history
  const releases = Object.entries(data.releases ?? {})
    .filter(([, files]) => (files as any[]).length > 0)
    .map(([version, files]) => ({
      version,
      upload_date: (files as any[])[0]?.upload_time_iso_8601 ?? null,
      python_requires: (files as any[])[0]?.requires_python ?? null,
    }))
    .slice(-10)
    .reverse();

  // Parse classifiers for useful metadata
  const classifiers = info.classifiers ?? [];
  const pythonVersions = classifiers
    .filter((c: string) => c.startsWith("Programming Language :: Python :: "))
    .map((c: string) => c.split(":: ").pop());
  const license = classifiers.find((c: string) => c.startsWith("License :: "))?.split(":: ").pop() ?? info.license;

  return {
    output: {
      name: info.name,
      version: info.version,
      summary: info.summary ?? null,
      description_content_type: info.description_content_type ?? null,
      author: info.author ?? info.author_email ?? null,
      license,
      homepage: info.home_page ?? info.project_url ?? null,
      project_urls: info.project_urls ?? {},
      requires_python: info.requires_python ?? null,
      python_versions: pythonVersions,
      dependencies: info.requires_dist ?? [],
      keywords: info.keywords ? info.keywords.split(",").map((k: string) => k.trim()) : [],
      total_releases: Object.keys(data.releases ?? {}).length,
      recent_releases: releases,
      package_url: info.package_url ?? `https://pypi.org/project/${pkg}/`,
    },
    provenance: { source: "pypi.org", fetched_at: new Date().toISOString() },
  };
});
