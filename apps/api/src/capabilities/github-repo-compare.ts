import { registerCapability, type CapabilityInput } from "./index.js";
import { githubFailure, githubPublicGet, parseGithubRepo } from "./lib/github-public.js";

// GitHub REST API comparison of two repositories
registerCapability("github-repo-compare", async (input: CapabilityInput) => {
  const rawA = input.repo_a ?? input.repo1 ?? "";
  const rawB = input.repo_b ?? input.repo2 ?? "";
  const repoA = typeof rawA === "string" ? rawA.trim() : rawA;
  const repoB = typeof rawB === "string" ? rawB.trim() : rawB;
  if (!repoA || !repoB) throw new Error("'repo_a' and 'repo_b' (owner/repo format) are required.");

  // Both names are checked before either request: no caller text reaches the
  // path unencoded, and no GitHub token is sent (lib/github-public.ts).
  const pathA = typeof repoA === "string" ? parseGithubRepo(repoA) : null;
  if (!pathA) throw new Error("'repo_a' must be a GitHub repository as owner/repo or a github.com URL.");
  const pathB = typeof repoB === "string" ? parseGithubRepo(repoB) : null;
  if (!pathB) throw new Error("'repo_b' must be a GitHub repository as owner/repo or a github.com URL.");

  async function fetchRepo(ownerRepo: string) {
    const resp = await githubPublicGet(`https://api.github.com/repos/${ownerRepo}`);

    if (resp.status === 404) {
      await resp.body?.cancel();
      throw new Error(`Repository "${ownerRepo}" not found.`);
    }
    if (!resp.ok) throw await githubFailure(resp);

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

  const [a, b] = await Promise.all([fetchRepo(pathA), fetchRepo(pathB)]);

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
