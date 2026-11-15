/**
 * Public GitHub reads for tools whose caller names the account or repository.
 *
 * No Authorization header, ever. A token sent with a caller-chosen path reads
 * whatever that token can see: a repository the token's account can read but
 * the public cannot, or the token owner's own record when a crafted path such
 * as `../user` resolves to `/user`. These tools answer about public GitHub
 * data, so the anonymous API (60 requests an hour per IP) is the honest scope.
 * github-repo-analyze already works this way; github-repo-compare and
 * github-user-profile sent `GITHUB_TOKEN` until 2026-11-15.
 *
 * Names are checked against GitHub's own shapes before any request, so no
 * caller text reaches the path unencoded.
 */
import { fetchUnavailable, httpUnavailable, UpstreamUnavailableError } from "../../lib/upstream-result.js";

export const GITHUB_API = "GitHub API";

/**
 * GitHub logins: alphanumerics and hyphens, not starting with a hyphen, at
 * most 39 characters. New accounts may not use double or trailing hyphens,
 * but some older ones do, so this is the path-safe superset, not the sign-up
 * rule.
 */
export const GITHUB_LOGIN_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/;

/** Repository names: letters, digits, ".", "_" and "-", at most 100; never "." or "..". */
const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

export function isGithubLogin(name: string): boolean {
  return GITHUB_LOGIN_RE.test(name);
}

/**
 * "owner/repo", "github.com/owner/repo" or a github.com URL (extra path,
 * query or ".git" ignored) to an encoded "owner/repo" path, or null when the
 * text is not a GitHub repository name.
 */
export function parseGithubRepo(raw: string): string | null {
  const path = raw
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, "")
    .split(/[?#]/)[0];
  const [owner = "", repoPart = ""] = path.split("/");
  const repo = repoPart.replace(/\.git$/i, "");
  if (!GITHUB_LOGIN_RE.test(owner) || !GITHUB_REPO_RE.test(repo) || repo === "." || repo === "..") return null;
  return `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
}

/**
 * GET a public api.github.com URL without credentials. A rate limit (429, or
 * 403 with no requests left or a Retry-After) throws a retryable error whose
 * message carries no status number: the breaker files any "403" in a message
 * as auth_expired and suspends the tool for 30 minutes for every caller
 * (see ghRequest in github-repo-analyze.ts). Any other response is returned.
 */
export async function githubPublicGet(url: string): Promise<Response> {
  let res: Response;
  try {
    // unguarded-fetch-ok: fixed api.github.com host; the caller's name is validated and encoded before it reaches the path
    res = await fetch(url, {
      headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw fetchUnavailable(GITHUB_API, err);
  }
  const rateLimited =
    res.status === 429 ||
    (res.status === 403 && (res.headers.get("x-ratelimit-remaining") === "0" || res.headers.has("retry-after")));
  if (rateLimited) {
    await res.body?.cancel();
    throw new UpstreamUnavailableError(GITHUB_API, "rate limited; retry shortly.", {
      code: `HTTP ${res.status}`,
      retryable: true,
    });
  }
  return res;
}

/** The error for a non-OK GitHub answer that is not a 404 or a rate limit. */
export async function githubFailure(res: Response): Promise<UpstreamUnavailableError> {
  await res.body?.cancel();
  if (res.status === 403) {
    // A 403 without rate-limit headers is GitHub declining (abuse detection);
    // keep the number out of the message for the same breaker reason.
    return new UpstreamUnavailableError(GITHUB_API, "declined the request; retry shortly.", {
      code: "HTTP 403",
      retryable: true,
    });
  }
  return httpUnavailable(GITHUB_API, res.status);
}
