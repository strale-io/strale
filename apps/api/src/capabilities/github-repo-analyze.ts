import { createAnthropicClient } from "../lib/anthropic-client.js";
import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { extractJsonWithLlm } from "./lib/llm-extract.js";
import { MAX_REPO_FILE_BYTES, readJsonWithLimit, readTextTruncated } from "../lib/resource-limits.js";
import { fetchUnavailable, httpUnavailable, UpstreamUnavailableError } from "../lib/upstream-result.js";

// F-0-006 Bucket D: user input is an owner/repo pair; requests go to
// hardcoded api.github.com and raw.githubusercontent.com. The user
// value is embedded in the path, never the hostname.
//
// Every request answers one of three ways: the data, "there is none" (a 404,
// an empty repository's 409, a 204 with no contributors), or no answer (rate
// limit, 5xx, timeout, network error, a body that does not parse). No answer
// fails the call unbilled: before 2026-11-11 each one read as null, so a
// rate-limited GitHub produced "No README", no commits and an "abandoned"
// verdict on a live project (2026-11-06 swallowed-upstream-failures audit,
// row 21).

const GITHUB_API = "GitHub API";
const GITHUB_RAW = "GitHub raw file host";
/** Named in unavailable_sources when GitHub will not list the contributors. */
const CONTRIBUTORS = "GitHub contributors list";

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
  const raw = (file: string) => `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${file}`;

  // Fetch repo data in parallel. Settled, so the repo record is judged first
  // whatever order the others fail in.
  const settled = await Promise.allSettled([
    ghJson(`${apiBase}/repos/${owner}/${repo}`, headers),
    // 409: the repository is empty, so it has no commits.
    ghJson(`${apiBase}/repos/${owner}/${repo}/commits?per_page=10`, headers, [404, 409]),
    ghJson(`${apiBase}/repos/${owner}/${repo}/contributors?per_page=20`, headers),
    ghJson(`${apiBase}/repos/${owner}/${repo}/languages`, headers),
    ghFetchText(raw("README.md")),
    ghFetchText(raw("package.json")),
  ]);
  const [repoData, commits, contributorsReply, languages, readme, packageJson] = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    // GitHub declines to list contributors for a repository whose history is
    // too large (HTTP 403 that is not a rate limit); the rest of the answer
    // stands without them.
    if (i === 2 && s.reason instanceof UpstreamUnavailableError && s.reason.code === "HTTP 403") return UNLISTED;
    throw s.reason;
  }) as [unknown, unknown, unknown, unknown, string | null, string | null];

  if (!repoData) throw new Error(`Could not access repo ${owner}/${repo}. It may be private.`);
  if (typeof repoData !== "object" || Array.isArray(repoData)) throw unparseable(GITHUB_API, "repository record");
  if (commits !== null && !Array.isArray(commits)) throw unparseable(GITHUB_API, "commit list");
  if (contributorsReply !== null && contributorsReply !== UNLISTED && !Array.isArray(contributorsReply)) {
    throw unparseable(GITHUB_API, "contributor list");
  }
  if (languages !== null && (typeof languages !== "object" || Array.isArray(languages))) {
    throw unparseable(GITHUB_API, "language breakdown");
  }
  const contributorsListed = contributorsReply !== UNLISTED;

  // Also try requirements.txt if no package.json
  let requirementsTxt: string | null = null;
  if (!packageJson) {
    requirementsTxt = await ghFetchText(raw("requirements.txt"));
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

  const topContributors = !contributorsListed
    ? null
    : Array.isArray(contributorsReply)
      ? contributorsReply.slice(0, 10).map((c: Record<string, unknown>) => ({
          login: c.login, contributions: c.contributions,
        }))
      : [];

  const client = createAnthropicClient({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 1500,
    prompt: `Analyze this GitHub repository. Return ONLY valid JSON.

Repo: ${owner}/${repo}
Stars: ${(repoData as Record<string, unknown>).stargazers_count}
Forks: ${(repoData as Record<string, unknown>).forks_count}
Open issues: ${(repoData as Record<string, unknown>).open_issues_count}
Description: ${(repoData as Record<string, unknown>).description ?? "none"}
License: ${((repoData as Record<string, unknown>).license as Record<string, unknown>)?.spdx_id ?? "none"}
Languages: ${JSON.stringify(languages).slice(0, 500)}
Created: ${(repoData as Record<string, unknown>).created_at}
Last push: ${(repoData as Record<string, unknown>).pushed_at}
Contributors: ${topContributors ? topContributors.length : "unknown (GitHub did not list them; do not guess the bus factor)"}

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
    truncationGuidance: "This repository produced more analysis content than fits in one call.",
    parseFailureError: () => new Error("Failed to analyze repository."),
  });
  output.repo = `${owner}/${repo}`;
  output.url = `https://github.com/${owner}/${repo}`;
  output.stars = (repoData as Record<string, unknown>).stargazers_count;
  output.forks = (repoData as Record<string, unknown>).forks_count;
  output.open_issues = (repoData as Record<string, unknown>).open_issues_count;
  output.license = ((repoData as Record<string, unknown>).license as Record<string, unknown>)?.spdx_id ?? null;
  output.languages = languages;
  output.top_contributors = topContributors;
  if (!contributorsListed) {
    // Without the contributor list there is nothing to estimate it from.
    output.bus_factor_estimate = null;
    output.unavailable_sources = [CONTRIBUTORS];
  }

  return {
    output,
    provenance: { source: "github-api", fetched_at: new Date().toISOString() },
  };
});

/** Marks a contributor list GitHub declined to produce. */
const UNLISTED = Symbol("contributors-unlisted");

function unparseable(upstream: string, what: string): UpstreamUnavailableError {
  return new UpstreamUnavailableError(upstream, `the ${what} was not in the expected shape.`, { code: "unparseable", retryable: false });
}

/**
 * Send one GitHub request. A rate limit (429, or 403 with no requests left
 * or a Retry-After) and a 5xx throw a retryable UpstreamUnavailableError, as
 * do a timeout and a network error. Any other response is returned.
 */
async function ghRequest(url: string, upstream: string, headers?: Record<string, string>): Promise<Response> {
  let res: Response;
  try {
    // unguarded-fetch-ok: fixed api.github.com / raw.githubusercontent.com host; caller supplies only the repo path
    res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  } catch (err) {
    throw fetchUnavailable(upstream, err);
  }
  const rateLimited =
    res.status === 429 ||
    (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")));
  if (rateLimited) {
    await res.body?.cancel();
    throw new UpstreamUnavailableError(upstream, `rate limited (HTTP ${res.status}); retry shortly.`, {
      code: "rate limited",
      retryable: true,
    });
  }
  return res;
}

/**
 * A GitHub API JSON answer, or null when GitHub says there is none (a status
 * in `absent`, or 204 No Content). Any other non-OK status throws.
 */
async function ghJson(url: string, headers: Record<string, string>, absent: number[] = [404]): Promise<unknown> {
  const res = await ghRequest(url, GITHUB_API, headers);
  if (absent.includes(res.status) || res.status === 204) {
    await res.body?.cancel();
    return null;
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw httpUnavailable(GITHUB_API, res.status);
  }
  try {
    // 4 MiB; past it the caller's repository is refused, not buffered.
    return await readJsonWithLimit(res, undefined, "url", "a repository whose GitHub API record is");
  } catch (err) {
    throw fetchUnavailable(GITHUB_API, err);
  }
}

/** A repository file, or null when the repository has no such file (404). */
async function ghFetchText(url: string): Promise<string | null> {
  const res = await ghRequest(url, GITHUB_RAW);
  if (res.status === 404) {
    await res.body?.cancel();
    return null;
  }
  if (!res.ok) {
    await res.body?.cancel();
    throw httpUnavailable(GITHUB_RAW, res.status);
  }
  try {
    // A prefix: only the first 3,000 characters reach the model. The file is the repository owner's.
    return await readTextTruncated(res, MAX_REPO_FILE_BYTES);
  } catch (err) {
    throw fetchUnavailable(GITHUB_RAW, err);
  }
}
