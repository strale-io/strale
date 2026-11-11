/**
 * WP12 batch 3 (CR-12): responses whose CONTENT a caller (or the owner of the
 * thing a caller names) controls must be read with a byte cap.
 *
 * These capabilities call fixed, trusted hosts, so the SSRF guard has nothing
 * to say about them. What is caller-influenced is the size of the answer:
 *
 *   - `npm-package-info`, `pypi-package-info`, `package-security-audit`: the
 *     caller names any package; its registry record grows with every release
 *     and every file listing its owner publishes. `package-docs` already read
 *     the same records under a 20 MiB cap (portfolio plan 2.7); these three
 *     read them with `response.json()`.
 *   - `github-repo-analyze`: the caller names any repository, and the raw
 *     README / package.json / requirements.txt are whatever the repository's
 *     owner committed, up to GitHub's file limits. The capability uses the
 *     first 3,000 characters of the README.
 *
 * Every upstream here is `fetch`, stubbed with a response that streams more
 * bytes than any cap without ever buffering them (loopback only; no network).
 * "Pulled chunks" is the measurement: a bounded reader stops pulling at the
 * cap, `response.json()` / `.text()` pull until the stream ends.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { streamingResponse, type StreamingResponseHandle } from "./lib/streaming-response-testutil.js";

const { extractJsonWithLlm } = vi.hoisted(() => ({
  extractJsonWithLlm: vi.fn(async () => ({ summary: "stub" })),
}));
vi.mock("./lib/llm-extract.js", () => ({ extractJsonWithLlm }));

import "./npm-package-info.js";
import "./pypi-package-info.js";
import "./package-security-audit.js";
import "./github-repo-analyze.js";
import { getExecutor } from "./index.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";

const CHUNK = 64 * 1024; // the testutil's pull size
const MIB = 1024 * 1024;
const HUGE = 64 * MIB;
/** Chunks a reader needs to take `bytes`, plus one for the crossing pull. */
const pullsFor = (bytes: number) => Math.ceil(bytes / CHUNK) + 2;

const handles: StreamingResponseHandle[] = [];
function huge(contentType = "application/json"): Response {
  const h = streamingResponse(HUGE, { contentType });
  handles.push(h);
  return h.response;
}
const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const totalPulls = () => handles.reduce((n, h) => n + h.pulls(), 0);

const fetchMock = vi.fn();

beforeEach(() => {
  handles.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  process.env.ANTHROPIC_API_KEY = "test-key";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PyPI records are read under the 20 MiB registry cap", () => {
  const capped = pullsFor(20 * MIB);

  // npm-package-info, package-security-audit (npm) and package-docs read a
  // packument through lib/json-pick.ts under a 128 MiB work bound, not this
  // 20 MiB whole-document cap: see npm-packument-large.test.ts (review B1).

  it("pypi-package-info", async () => {
    fetchMock.mockImplementation(async () => huge());
    const err = await getExecutor("pypi-package-info")!({ package: "requests" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(totalPulls(), "the registry record was read past the cap").toBeLessThanOrEqual(capped);
    expect((err as Error).message).toMatch(/'package' must be .*20\.0MB or less/);
    expect(isCapabilityRefusal(err)).toBe(true);
  });

  it("package-security-audit (pypi)", async () => {
    fetchMock.mockImplementation(async () => huge());
    const err = await getExecutor("package-security-audit")!({ name: "requests", ecosystem: "pypi" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(totalPulls(), "the registry record was read past the cap").toBeLessThanOrEqual(capped);
    expect((err as Error).message).toMatch(/'name' must be .*20\.0MB or less/);
    expect(isCapabilityRefusal(err)).toBe(true);
  });
});

describe("github-repo-analyze reads repository files as a bounded prefix", () => {
  it("README, package.json and requirements.txt are cut at the cap; the analysis still runs", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.startsWith("https://raw.githubusercontent.com/")) return huge("text/plain");
      if (u.endsWith("/languages")) return json({ TypeScript: 1 });
      if (u.includes("/commits") || u.includes("/contributors")) return json([]);
      return json({ stargazers_count: 1, forks_count: 0, open_issues_count: 0, license: null });
    });
    const r = (await getExecutor("github-repo-analyze")!({ url: "https://github.com/o/r" })) as {
      output: Record<string, unknown>;
    };
    // Three raw files are requested (README, package.json, requirements.txt
    // because package.json is "missing"); each is cut at 256 KiB.
    expect(totalPulls(), "a repository file was read past the cap").toBeLessThanOrEqual(3 * pullsFor(256 * 1024));
    expect(r.output.repo).toBe("o/r");
    expect(extractJsonWithLlm).toHaveBeenCalled();
  });

  it("an API JSON answer past 4 MiB is refused, not buffered", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.startsWith("https://raw.githubusercontent.com/")) return new Response("", { status: 404 });
      return u.endsWith("/repos/o/r") ? huge() : json([]);
    });
    // Since 2026-11-11 the size refusal reaches the caller as itself, not as
    // "could not access" (which now means only GitHub's 404).
    const err = await getExecutor("github-repo-analyze")!({ url: "https://github.com/o/r" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as Error).message).toMatch(/'url' must be .*4\.0MB or less/);
    expect(isCapabilityRefusal(err)).toBe(true);
    expect(totalPulls(), "the repo record was read past the cap").toBeLessThanOrEqual(pullsFor(4 * MIB));
  });
});

describe("a non-OK answer's body is cancelled before the capability throws or returns null (review N2)", () => {
  /** A response with a body nobody will read, and a probe for its cancel(). */
  function unread(status: number) {
    const cancel = vi.fn();
    return { cancel, response: new Response(new ReadableStream({ cancel }), { status }) };
  }

  it.each([
    ["pypi-package-info", { package: "requests" }, 404],
    ["pypi-package-info", { package: "requests" }, 503],
    ["package-security-audit", { name: "requests", ecosystem: "pypi" }, 404],
    ["package-security-audit", { name: "requests", ecosystem: "pypi" }, 503],
    ["package-security-audit", { name: "left-pad", ecosystem: "npm" }, 404],
    ["package-security-audit", { name: "left-pad", ecosystem: "npm" }, 503],
  ])("%s %j answers HTTP %i", async (slug, input, status) => {
    const u = unread(status);
    fetchMock.mockImplementation(async () => u.response);
    await expect(getExecutor(slug)!(input)).rejects.toThrow();
    expect(u.cancel, "the unread body was left open").toHaveBeenCalled();
  });

  it("github-repo-analyze cancels the bodies of the API and raw-file requests that fail", async () => {
    const all: Array<ReturnType<typeof unread>> = [];
    fetchMock.mockImplementation(async () => {
      const u = unread(404);
      all.push(u);
      return u.response;
    });
    await expect(getExecutor("github-repo-analyze")!({ url: "https://github.com/o/r" })).rejects.toThrow(/Could not access repo/);
    expect(all.length).toBeGreaterThanOrEqual(5);
    expect(all.filter((u) => !u.cancel.mock.calls.length).length, "failed responses left open").toBe(0);
  });
});
