import { registerCapability, type CapabilityInput } from "./index.js";

// Docker Hub API v2 — free, no auth required for public repos
registerCapability("docker-hub-info", async (input: CapabilityInput) => {
  const image = ((input.image as string) ?? (input.repository as string) ?? (input.name as string) ?? (input.task as string) ?? "").trim();
  if (!image) throw new Error("'image' (Docker Hub image, e.g. 'nginx' or 'library/nginx') is required.");

  // Normalize: add "library/" prefix for official images without a namespace
  const parts = image.split("/");
  const namespace = parts.length >= 2 ? parts[0] : "library";
  const repo = parts.length >= 2 ? parts.slice(1).join("/") : parts[0];

  // Fetch repository info
  const repoUrl = `https://hub.docker.com/v2/repositories/${namespace}/${repo}/`;
  const repoResp = await fetch(repoUrl, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (repoResp.status === 404) throw new Error(`Docker Hub image "${image}" not found.`);
  if (!repoResp.ok) throw new Error(`Docker Hub returned HTTP ${repoResp.status}`);

  const data = (await repoResp.json()) as any;

  // Fetch tags
  let tags: any[] = [];
  try {
    const tagsUrl = `https://hub.docker.com/v2/repositories/${namespace}/${repo}/tags/?page_size=10&ordering=last_updated`;
    const tagsResp = await fetch(tagsUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (tagsResp.ok) {
      const tagsData = (await tagsResp.json()) as any;
      tags = (tagsData.results ?? []).map((t: any) => ({
        name: t.name,
        last_updated: t.last_updated,
        full_size_bytes: t.full_size,
        digest: t.digest?.slice(0, 19),
        os_arch: t.images?.map((i: any) => `${i.os}/${i.architecture}`).filter(Boolean) ?? [],
      }));
    }
  } catch { /* non-critical */ }

  return {
    output: {
      name: data.name,
      namespace: data.namespace,
      full_name: `${namespace}/${repo}`,
      description: data.description ?? null,
      star_count: data.star_count ?? 0,
      pull_count: data.pull_count ?? 0,
      is_official: data.is_automated === false && namespace === "library",
      is_private: data.is_private ?? false,
      last_updated: data.last_updated ?? null,
      hub_url: `https://hub.docker.com/${namespace === "library" ? "_/" : "r/"}${namespace === "library" ? repo : `${namespace}/${repo}`}`,
      recent_tags: tags,
    },
    provenance: { source: "hub.docker.com", fetched_at: new Date().toISOString() },
  };
});
