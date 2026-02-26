import { registerCapability, type CapabilityInput } from "./index.js";

// GitHub REST API comparison of two repositories
registerCapability("github-repo-compare", async (input: CapabilityInput) => {
  const repoA = ((input.repo_a as string) ?? (input.repo1 as string) ?? "").trim();
  const repoB = ((input.repo_b as string) ?? (input.repo2 as string) ?? "").trim();
  if (!repoA || !repoB) throw new Error("'repo_a' and 'repo_b' (owner/repo format) are required.");

  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const ghToken = process.env.GITHUB_TOKEN;
  if (ghToken) headers["Authorization"] = `Bearer ${ghToken}`;

  async function fetchRepo(fullName: string) {
    // Extract owner/repo from various formats
    const match = fullName.match(/(?:github\.com\/)?([^/]+\/[^/]+)/);
    const ownerRepo = match ? match[1].replace(/\.git$/, "") : fullName;

    const resp = await fetch(`https://api.github.com/repos/${ownerRepo}`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (resp.status === 404) throw new Error(`Repository "${ownerRepo}" not found.`);
    if (!resp.ok) throw new Error(`GitHub API returned HTTP ${resp.status} for "${ownerRepo}"`);

    const r = (await resp.json()) as any;
    return {
      full_name: r.full_name,
      description: r.description,
      language: r.language,
      stars: r.stargazers_count,
      forks: r.forks_count,
      open_issues: r.open_issues_count,
      watchers: r.subscribers_count,
      size_kb: r.size,
      license: r.license?.spdx_id ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
      pushed_at: r.pushed_at,
      is_fork: r.fork,
      is_archived: r.archived,
      topics: r.topics ?? [],
      default_branch: r.default_branch,
      has_wiki: r.has_wiki,
      has_pages: r.has_pages,
    };
  }

  const [a, b] = await Promise.all([fetchRepo(repoA), fetchRepo(repoB)]);

  // Build comparison
  const comparison: Record<string, { repo_a: unknown; repo_b: unknown; winner: string }> = {};
  const numericFields: [string, keyof typeof a][] = [
    ["stars", "stars"], ["forks", "forks"], ["open_issues", "open_issues"],
    ["watchers", "watchers"], ["size_kb", "size_kb"],
  ];

  for (const [label, field] of numericFields) {
    const va = a[field] as number;
    const vb = b[field] as number;
    comparison[label] = {
      repo_a: va,
      repo_b: vb,
      winner: va > vb ? a.full_name : va < vb ? b.full_name : "tie",
    };
  }

  // Activity comparison (most recently pushed)
  const aDate = new Date(a.pushed_at).getTime();
  const bDate = new Date(b.pushed_at).getTime();
  comparison["last_push"] = {
    repo_a: a.pushed_at,
    repo_b: b.pushed_at,
    winner: aDate > bDate ? a.full_name : aDate < bDate ? b.full_name : "tie",
  };

  // Age comparison
  const aAge = new Date(a.created_at).getTime();
  const bAge = new Date(b.created_at).getTime();

  return {
    output: {
      repo_a: a,
      repo_b: b,
      comparison,
      same_language: a.language === b.language,
      common_topics: a.topics.filter((t: string) => b.topics.includes(t)),
      age_difference_days: Math.abs(Math.round((aAge - bAge) / 86400000)),
    },
    provenance: { source: "api.github.com", fetched_at: new Date().toISOString() },
  };
});
