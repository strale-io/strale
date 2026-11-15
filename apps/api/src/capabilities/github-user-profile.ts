import { registerCapability, type CapabilityInput } from "./index.js";
import { GITHUB_API, githubFailure, githubPublicGet, isGithubLogin } from "./lib/github-public.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";

// GitHub REST API — free, no token required (60 req/hr unauthenticated)
registerCapability("github-user-profile", async (input: CapabilityInput) => {
  const raw = input.username ?? input.user ?? input.task ?? "";
  if (typeof raw !== "string") {
    throw new Error("'username' must be a GitHub username: letters, digits and hyphens, at most 39 characters.");
  }
  const username = raw.trim();
  if (!username) throw new Error("'username' (GitHub username) is required.");

  // Checked against GitHub's login shape before any request, and no GitHub
  // token is sent (lib/github-public.ts).
  if (!isGithubLogin(username)) {
    throw new Error("'username' must be a GitHub username: letters, digits and hyphens, at most 39 characters.");
  }

  // Fetch user profile
  const userResp = await githubPublicGet(`https://api.github.com/users/${encodeURIComponent(username)}`);

  if (userResp.status === 404) {
    await userResp.body?.cancel();
    throw new Error(`GitHub user "${username}" not found.`);
  }
  if (!userResp.ok) throw await githubFailure(userResp);

  const user = (await userResp.json()) as any;

  // Recent public repos. A failed list throws, unbilled: an empty list here
  // would read as "this user owns no repositories" (the anonymous rate limit
  // makes a second-request failure common).
  const reposResp = await githubPublicGet(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=10&type=owner`);
  if (!reposResp.ok) throw await githubFailure(reposResp);
  const repos = (await reposResp.json()) as any[];
  if (!Array.isArray(repos)) {
    throw new UpstreamUnavailableError(GITHUB_API, "the repository list was not in the expected shape.", { code: "unparseable", retryable: false });
  }
  const topRepos = repos.map(r => ({
    name: r.name,
    description: r.description,
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    updated_at: r.updated_at,
    is_fork: r.fork,
  }));

  return {
    output: {
      username: user.login,
      name: user.name,
      bio: user.bio,
      company: user.company,
      location: user.location,
      email: user.email,
      blog: user.blog || null,
      twitter: user.twitter_username || null,
      avatar_url: user.avatar_url,
      profile_url: user.html_url,
      public_repos: user.public_repos,
      public_gists: user.public_gists,
      followers: user.followers,
      following: user.following,
      account_type: user.type,
      created_at: user.created_at,
      updated_at: user.updated_at,
      recent_repos: topRepos,
    },
    provenance: { source: "api.github.com", fetched_at: new Date().toISOString() },
  };
});
