/**
 * github-repo-compare and github-user-profile read only public GitHub data
 * for names the caller chooses (2026-11-15 master handoff, follow-up 1).
 *
 * Before: both sent the server's GITHUB_TOKEN with every request, and
 * github-repo-compare put the caller's text into the path unencoded, so
 * `../user` resolved to GitHub's `/user` (the token owner's own record) and a
 * private repository the token could read was answered like a public one.
 * "failure:" tests fail against the pre-fix executors; "passthrough:" tests
 * pass against both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getDirectExecutor } from "./index.js";
import { categorizeFailureReason, isRetryableFailure } from "../lib/trust-helpers.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { parseGithubRepo } from "./lib/github-public.js";
import "./github-repo-compare.js";
import "./github-user-profile.js";

type Out = Record<string, any>;

function exec(slug: string) {
  const fn = getDirectExecutor(slug);
  if (!fn) throw new Error(`${slug} is not registered`);
  return fn;
}

const json = (body: unknown, code = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json", ...headers } });

const REPO = {
  full_name: "o/r", description: "d", language: "TypeScript", stargazers_count: 5, forks_count: 1,
  open_issues_count: 0, subscribers_count: 2, size: 10, license: null, created_at: "2020-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z", pushed_at: "2026-01-01T00:00:00Z", fork: false, archived: false,
  topics: [], default_branch: "main", has_wiki: false, has_pages: false,
};
const USER = { login: "octo", name: "Octo", type: "User", public_repos: 1, created_at: "2011-01-01T00:00:00Z" };

let fetchMock: ReturnType<typeof vi.fn>;
const savedToken = process.env.GITHUB_TOKEN;

beforeEach(() => {
  process.env.GITHUB_TOKEN = "production-token-must-not-leave";
  fetchMock = vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/repos?")) return json([]);
    if (u.startsWith("https://api.github.com/users/")) return json(USER);
    return json(REPO);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (savedToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = savedToken;
});

function noAuthorizationSent() {
  expect(fetchMock).toHaveBeenCalled();
  for (const [, init] of fetchMock.mock.calls) {
    expect(new Headers(init?.headers).has("Authorization")).toBe(false);
  }
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (err) {
    return err as Error;
  }
  throw new Error("expected the call to fail");
}

describe("failure: a configured GitHub token never travels with a caller-chosen name", () => {
  it("github-repo-compare sends no Authorization header", async () => {
    await exec("github-repo-compare")({ repo_a: "o/r", repo_b: "https://github.com/p/q" });
    noAuthorizationSent();
  });

  it("github-user-profile sends no Authorization header on either request", async () => {
    await exec("github-user-profile")({ username: "octo" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    noAuthorizationSent();
  });
});

describe("failure: github-repo-compare refuses a name that is not owner/repo, before any request", () => {
  for (const bad of ["../user", "o/..", "x/../../user", "o%2F..%2Fuser/r", "-o/r", "o/r name"]) {
    it(`refuses ${JSON.stringify(bad)} as the caller's input`, async () => {
      const err = await rejection(exec("github-repo-compare")({ repo_a: bad, repo_b: "o/r" }));
      expect(err.message).toMatch(/^'repo_a' must be a GitHub repository/);
      expect(isUserInputError(err.message)).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

describe("failure: github-user-profile refuses a name that is not a GitHub login, before any request", () => {
  for (const bad of ["..", "octo/../../user", "-octo", "a".repeat(40)]) {
    it(`refuses ${JSON.stringify(bad)} as the caller's input`, async () => {
      const err = await rejection(exec("github-user-profile")({ username: bad }));
      expect(err.message).toMatch(/^'username' must be a GitHub username/);
      expect(isUserInputError(err.message)).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  }
});

describe("failure: GitHub's anonymous rate limit is a retry-shortly outage, not a suspended tool", () => {
  const limited = () => json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0" });

  it("github-repo-compare", async () => {
    fetchMock.mockImplementation(async () => limited());
    const err = await rejection(exec("github-repo-compare")({ repo_a: "o/r", repo_b: "p/q" }));
    expect(err.message).not.toMatch(/403/);
    expect(categorizeFailureReason(err.message)).not.toBe("auth_expired");
    expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
  });

  it("github-user-profile", async () => {
    fetchMock.mockImplementation(async () => limited());
    const err = await rejection(exec("github-user-profile")({ username: "octo" }));
    expect(err.message).not.toMatch(/403/);
    expect(categorizeFailureReason(err.message)).not.toBe("auth_expired");
    expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
  });
});

describe("failure: github-user-profile never bills an invented empty repository list", () => {
  it("a failed second request (rate limit) fails the call instead of answering recent_repos: []", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/repos?")
        ? json({ message: "API rate limit exceeded" }, 403, { "x-ratelimit-remaining": "0" })
        : json(USER),
    );
    const err = await rejection(exec("github-user-profile")({ username: "octo" }));
    expect(err.message).toMatch(/rate limited/);
    expect(isRetryableFailure(categorizeFailureReason(err.message))).toBe(true);
  });
});

describe("failure: a non-text name is the caller's error, not a crash", () => {
  it("github-repo-compare refuses a number for repo_a", async () => {
    const err = await rejection(exec("github-repo-compare")({ repo_a: 42, repo_b: "o/r" }));
    expect(err.message).toMatch(/^'repo_a' must be a GitHub repository/);
    expect(isUserInputError(err.message)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("github-user-profile refuses an object for username", async () => {
    const err = await rejection(exec("github-user-profile")({ username: { login: "octo" } }));
    expect(err.message).toMatch(/^'username' must be a GitHub username/);
    expect(isUserInputError(err.message)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("passthrough: the forms callers already use still work", () => {
  it.each([
    ["o/r", "o/r"],
    ["github.com/o/r", "o/r"],
    ["https://github.com/o/r", "o/r"],
    ["https://www.github.com/o/r.git", "o/r"],
    ["https://github.com/o/r/tree/main/src", "o/r"],
    ["https://github.com/o/r?tab=readme", "o/r"],
    ["vercel/next.js", "vercel/next.js"],
  ])("%s reads /repos/%s", (raw, path) => {
    expect(parseGithubRepo(raw)).toBe(path);
  });

  it("github-repo-compare answers a comparison for two public repositories", async () => {
    const result = (await exec("github-repo-compare")({ repo1: "o/r", repo2: "p/q" })) as { output: Out };
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/o/r", expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/p/q", expect.anything());
    expect(result.output).toBeTruthy();
  });

  it("an unknown repository is still the caller's 'not found'", async () => {
    fetchMock.mockImplementation(async () => json({ message: "Not Found" }, 404));
    const err = await rejection(exec("github-repo-compare")({ repo_a: "o/r", repo_b: "p/q" }));
    expect(err.message).toMatch(/not found/);
    expect(isUserInputError(err.message)).toBe(true);
  });

  it("github-user-profile accepts an older login with a double hyphen", async () => {
    const result = (await exec("github-user-profile")({ username: "old--login" })) as { output: Out };
    expect(result.output.username).toBe("octo");
  });
});
