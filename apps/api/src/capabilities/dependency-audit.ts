import { registerCapability, type CapabilityInput } from "./index.js";

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

async function auditNpm(packageJsonStr: string) {
  const pkg = JSON.parse(packageJsonStr);
  const allDeps: Record<string, string> = {
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  };

  const depNames = Object.keys(allDeps).slice(0, 50); // Cap at 50

  const results = await Promise.all(
    depNames.map(async (name) => {
      const currentVersion = allDeps[name].replace(/^[\^~>=<]*/g, "");
      try {
        const res = await fetch(`https://registry.npmjs.org/${name}`, {
          signal: AbortSignal.timeout(8000),
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return { name, current_version: currentVersion, error: `HTTP ${res.status}` };

        const data = await res.json() as Record<string, unknown>;
        const distTags = data["dist-tags"] as Record<string, string> | undefined;
        const latest = distTags?.latest ?? "unknown";
        const time = data.time as Record<string, string> | undefined;
        const lastPublished = time?.[latest] ?? null;
        const deprecated = !!(data as Record<string, unknown>).deprecated;

        return {
          name,
          current_version: currentVersion,
          latest_version: latest,
          is_outdated: currentVersion !== latest && latest !== "unknown",
          is_deprecated: deprecated,
          last_published: lastPublished,
          is_dev_dependency: !!(pkg.devDependencies ?? {})[name],
        };
      } catch {
        return { name, current_version: currentVersion, error: "fetch failed" };
      }
    }),
  );

  const outdated = results.filter((r) => (r as Record<string, unknown>).is_outdated);
  const deprecated = results.filter((r) => (r as Record<string, unknown>).is_deprecated);

  return {
    output: {
      ecosystem: "npm",
      total_dependencies: depNames.length,
      outdated_count: outdated.length,
      deprecated_count: deprecated.length,
      dependencies: results,
      summary: {
        total: depNames.length,
        up_to_date: results.filter((r) => !(r as Record<string, unknown>).is_outdated && !(r as Record<string, unknown>).error).length,
        outdated: outdated.length,
        deprecated: deprecated.length,
        errors: results.filter((r) => (r as Record<string, unknown>).error).length,
      },
      critical_updates: deprecated.map((d) => d.name),
    },
    provenance: { source: "npm-registry", fetched_at: new Date().toISOString() },
  };
}

async function auditPypi(requirementsStr: string) {
  const lines = requirementsStr.split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("-"));

  const deps = lines.slice(0, 50).map((line) => {
    const match = line.match(/^([a-zA-Z0-9_.-]+)\s*(?:[=<>!~]+\s*(.+))?/);
    return { name: match?.[1] ?? line, version: match?.[2]?.trim() ?? null };
  });

  const results = await Promise.all(
    deps.map(async (dep) => {
      try {
        const res = await fetch(`https://pypi.org/pypi/${dep.name}/json`, {
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) return { name: dep.name, current_version: dep.version, error: `HTTP ${res.status}` };

        const data = await res.json() as Record<string, unknown>;
        const info = data.info as Record<string, unknown>;
        const latest = (info.version as string) ?? "unknown";

        return {
          name: dep.name,
          current_version: dep.version,
          latest_version: latest,
          is_outdated: dep.version !== null && dep.version !== latest,
          summary: (info.summary as string) ?? null,
          last_published: null as string | null,
        };
      } catch {
        return { name: dep.name, current_version: dep.version, error: "fetch failed" };
      }
    }),
  );

  const outdated = results.filter((r) => (r as Record<string, unknown>).is_outdated);

  return {
    output: {
      ecosystem: "pypi",
      total_dependencies: deps.length,
      outdated_count: outdated.length,
      dependencies: results,
      summary: {
        total: deps.length,
        up_to_date: results.filter((r) => !(r as Record<string, unknown>).is_outdated && !(r as Record<string, unknown>).error).length,
        outdated: outdated.length,
        errors: results.filter((r) => (r as Record<string, unknown>).error).length,
      },
    },
    provenance: { source: "pypi-registry", fetched_at: new Date().toISOString() },
  };
}
