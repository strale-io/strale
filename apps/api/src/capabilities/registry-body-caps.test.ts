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

describe("package registry records are read under the 20 MiB registry cap", () => {
  const capped = pullsFor(20 * MIB);

  it("npm-package-info", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("https://registry.npmjs.org/") ? huge() : json({ downloads: 1 }),
    );
    const err = await getExecutor("npm-package-info")!({ package: "left-pad" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(totalPulls(), "the registry record was read past the cap").toBeLessThanOrEqual(capped);
    expect((err as Error).message).toMatch(/'package' must be .*20\.0MB or less/);
    expect(isCapabilityRefusal(err)).toBe(true);
  });

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

  it("package-security-audit (npm)", async () => {
    fetchMock.mockImplementation(async () => huge());
    const err = await getExecutor("package-security-audit")!({ name: "left-pad", ecosystem: "npm" }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(totalPulls(), "the registry record was read past the cap").toBeLessThanOrEqual(capped);
    expect((err as Error).message).toMatch(/'name' must be .*20\.0MB or less/);
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

  it("an API JSON answer past 4 MiB is refused as 'could not access', not buffered", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.startsWith("https://raw.githubusercontent.com/")) return new Response("", { status: 404 });
      return u.endsWith("/repos/o/r") ? huge() : json([]);
    });
    await expect(getExecutor("github-repo-analyze")!({ url: "https://github.com/o/r" })).rejects.toThrow(
      /Could not access repo o\/r/,
    );
    expect(totalPulls(), "the repo record was read past the cap").toBeLessThanOrEqual(pullsFor(4 * MIB));
  });
});
