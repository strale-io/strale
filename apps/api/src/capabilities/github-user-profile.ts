import { registerCapability, type CapabilityInput } from "./index.js";

// GitHub REST API — free, no token required (60 req/hr unauthenticated)
registerCapability("github-user-profile", async (input: CapabilityInput) => {
  const username = ((input.username as string) ?? (input.user as string) ?? (input.task as string) ?? "").trim();
  if (!username) throw new Error("'username' (GitHub username) is required.");

  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  const ghToken = process.env.GITHUB_TOKEN;
  if (ghToken) headers["Authorization"] = `Bearer ${ghToken}`;

  // Fetch user profile
  const userResp = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });

  if (userResp.status === 404) throw new Error(`GitHub user "${username}" not found.`);
  if (!userResp.ok) throw new Error(`GitHub API returned HTTP ${userResp.status}`);

  const user = (await userResp.json()) as any;

  // Fetch recent public repos
  let topRepos: any[] = [];
  try {
    const reposResp = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=10&type=owner`, {
      headers,
      signal: AbortSignal.timeout(10000),
    });
    if (reposResp.ok) {
      const repos = (await reposResp.json()) as any[];
      topRepos = repos.map(r => ({
        name: r.name,
        description: r.description,
        language: r.language,
        stars: r.stargazers_count,
        forks: r.forks_count,
        updated_at: r.updated_at,
        is_fork: r.fork,
      }));
    }
  } catch { /* non-critical */ }

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
