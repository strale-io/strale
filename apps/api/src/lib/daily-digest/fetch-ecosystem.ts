import type { EcosystemMetrics, Scoreboard } from "./types.js";

const GITHUB_REPOS = ["strale", "strale-frontend", "strale-beacon", "strale-examples"];
const NPM_PACKAGES = ["strale-mcp", "straleio", "strale-semantic-kernel"];
// Only packages with real framework integration (or the generic straleio SDK).
// The framework-named packages that were deprecated on 2026-04-22 (pydantic-
// ai-strale, google-adk-strale, openai-agents-strale) are intentionally
// excluded — tracking yanked packages only produces noise in the digest.
const PYPI_PACKAGES = ["straleio", "langchain-strale", "crewai-strale", "composio-strale"];

export async function getEcosystemMetrics(
  yesterday: Partial<Scoreboard> | null,
): Promise<EcosystemMetrics> {
  const repos = await fetchGitHubRepos(yesterday);
  const npmDownloads = await fetchNpmDownloads();
  const pypiDownloads = await fetchPypiDownloads();

  return { repos, npmDownloads, pypiDownloads };
}

async function fetchGitHubRepos(
  _yesterday: Partial<Scoreboard> | null,
): Promise<EcosystemMetrics["repos"]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return [];

  const results: EcosystemMetrics["repos"] = [];

  for (const name of GITHUB_REPOS) {
    try {
      const [repoResp, prsResp] = await Promise.all([
        fetch(`https://api.github.com/repos/strale-io/${name}`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(10000),
        }),
        fetch(`https://api.github.com/repos/strale-io/${name}/pulls?state=open&per_page=1`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
          signal: AbortSignal.timeout(10000),
        }),
      ]);

      if (!repoResp.ok) continue;
      const repo = await repoResp.json() as {
        stargazers_count: number;
        forks_count: number;
        open_issues_count: number;
      };

      // Open PR count from Link header (total_count) or array length
      let openPRs = 0;
      if (prsResp.ok) {
        const linkHeader = prsResp.headers.get("link") ?? "";
        // If there's pagination, extract last page number
        const lastMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
        openPRs = lastMatch ? parseInt(lastMatch[1], 10) : ((await prsResp.json()) as any[]).length;
      }

      results.push({
        name,
        stars: repo.stargazers_count,
        starsDelta: 0, // TODO: compute from yesterday snapshot
        forks: repo.forks_count,
        openIssues: repo.open_issues_count,
        openPRs,
      });
    } catch {
      // skip this repo
    }
  }

  return results;
}

async function fetchNpmDownloads(): Promise<EcosystemMetrics["npmDownloads"]> {
  const results: EcosystemMetrics["npmDownloads"] = [];

  for (const pkg of NPM_PACKAGES) {
    try {
      const resp = await fetch(`https://api.npmjs.org/downloads/point/last-week/${pkg}`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!resp.ok) continue;
      const data = await resp.json() as { downloads: number };
      results.push({ package: pkg, weeklyDownloads: data.downloads });
    } catch {
      // skip
    }
  }

  return results;
}

async function fetchPypiDownloads(): Promise<EcosystemMetrics["pypiDownloads"]> {
  const results: EcosystemMetrics["pypiDownloads"] = [];

  for (const pkg of PYPI_PACKAGES) {
    try {
      const resp = await fetch(`https://pypistats.org/api/packages/${pkg}/recent`, {
        headers: { "User-Agent": "strale-digest/1.0 (+https://strale.dev)" },
        signal: AbortSignal.timeout(10000),
      });
      if (resp.status === 429) {
        // Rate limited — wait and try once more
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      if (!resp.ok) continue;
      const data = await resp.json() as { data: { last_week: number } };
      results.push({ package: pkg, recentDownloads: data.data?.last_week ?? 0 });
      // Be a good citizen — 500ms between calls
      await new Promise((r) => setTimeout(r, 500));
    } catch {
      // skip
    }
  }

  return results;
}
