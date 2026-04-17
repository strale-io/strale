import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

// F-0-006 Bucket D: user input is an owner/repo pair; requests go to
// hardcoded api.github.com and raw.githubusercontent.com. The user
// value is embedded in the path, never the hostname.

registerCapability("github-repo-analyze", async (input: CapabilityInput) => {
  const url = ((input.url as string) ?? (input.repo as string) ?? (input.task as string) ?? "").trim();
  if (!url) throw new Error("'url' is required. Provide a GitHub repo URL (e.g. https://github.com/owner/repo).");

  // Extract owner/repo
  const match = url.match(/github\.com\/([^/]+)\/([^/\s#?]+)/);
  if (!match) throw new Error("Invalid GitHub URL. Expected format: https://github.com/owner/repo");
  const owner = match[1];
  const repo = match[2].replace(/\.git$/, "");

  const apiBase = "https://api.github.com";
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "Strale/1.0",
  };

  // Fetch repo data in parallel
  const [repoData, commits, contributors, languages, readme, packageJson] = await Promise.all([
    ghFetch(`${apiBase}/repos/${owner}/${repo}`, headers),
    ghFetch(`${apiBase}/repos/${owner}/${repo}/commits?per_page=10`, headers),
    ghFetch(`${apiBase}/repos/${owner}/${repo}/contributors?per_page=20`, headers),
    ghFetch(`${apiBase}/repos/${owner}/${repo}/languages`, headers),
    ghFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`),
    ghFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/package.json`),
  ]);

  if (!repoData) throw new Error(`Could not access repo ${owner}/${repo}. It may be private.`);

  // Also try requirements.txt if no package.json
  let requirementsTxt: string | null = null;
  if (!packageJson) {
    requirementsTxt = await ghFetchText(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/requirements.txt`);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const recentCommits = Array.isArray(commits)
    ? commits.slice(0, 10).map((c: Record<string, unknown>) => {
        const commit = c.commit as Record<string, unknown>;
        const author = commit.author as Record<string, unknown>;
        return { message: (commit.message as string)?.slice(0, 100), date: author?.date };
      })
    : [];

  const topContributors = Array.isArray(contributors)
    ? contributors.slice(0, 10).map((c: Record<string, unknown>) => ({
        login: c.login, contributions: c.contributions,
      }))
    : [];

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Analyze this GitHub repository. Return ONLY valid JSON.

Repo: ${owner}/${repo}
Stars: ${(repoData as Record<string, unknown>).stargazers_count}
Forks: ${(repoData as Record<string, unknown>).forks_count}
Open issues: ${(repoData as Record<string, unknown>).open_issues_count}
Description: ${(repoData as Record<string, unknown>).description ?? "none"}
License: ${((repoData as Record<string, unknown>).license as Record<string, unknown>)?.spdx_id ?? "none"}
Languages: ${JSON.stringify(languages).slice(0, 500)}
Created: ${(repoData as Record<string, unknown>).created_at}
Last push: ${(repoData as Record<string, unknown>).pushed_at}
Contributors: ${topContributors.length}

Recent commits:
${recentCommits.map((c) => `- ${c.message} (${c.date})`).join("\n")}

README excerpt:
${(readme ?? "No README").slice(0, 3000)}

${packageJson ? `package.json excerpt:\n${packageJson.slice(0, 1500)}` : ""}
${requirementsTxt ? `requirements.txt:\n${requirementsTxt.slice(0, 1000)}` : ""}

Return JSON:
{
  "tech_stack": ["primary technologies"],
  "primary_language": "string",
  "documentation_quality": "excellent/good/fair/poor",
  "activity_level": "very-active/active/moderate/low/abandoned",
  "dependency_count": <number if detectable>,
  "bus_factor_estimate": <1-10 how many key contributors>,
  "maintenance_health_score": <1-100>,
  "purpose": "one sentence describing what this repo does",
  "strengths": ["positive aspects"],
  "concerns": ["potential issues"],
  "summary": "2-3 sentence assessment"
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to analyze repository.");

  const output = JSON.parse(jsonMatch[0]);
  output.repo = `${owner}/${repo}`;
  output.url = `https://github.com/${owner}/${repo}`;
  output.stars = (repoData as Record<string, unknown>).stargazers_count;
  output.forks = (repoData as Record<string, unknown>).forks_count;
  output.open_issues = (repoData as Record<string, unknown>).open_issues_count;
  output.license = ((repoData as Record<string, unknown>).license as Record<string, unknown>)?.spdx_id ?? null;
  output.languages = languages;
  output.top_contributors = topContributors;

  return {
    output,
    provenance: { source: "github-api", fetched_at: new Date().toISOString() },
  };
});

async function ghFetch(url: string, headers: Record<string, string>): Promise<unknown> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function ghFetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}
