/**
 * Swallowed-upstream-failure fixes, wave 2a: package-security-audit (audit row
 * 7) and dependency-audit (row 8); archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md.
 *
 * OSV decides the vulnerability verdict in both tools, so an OSV failure must
 * throw (unbilled), never come back as `risk_level: "low"` or
 * `vulnerable_count: 0`. A secondary leg that fails keeps the answer and is
 * named in `unavailable_sources`. A real negative (OSV `{}`, a deps.dev 404, a
 * registry 404) keeps its output and stays billable.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapabilityExecutor } from "./index.js";

let fetchMock: ReturnType<typeof vi.fn>;

async function load(slug: string, module: string): Promise<CapabilityExecutor> {
  vi.resetModules();
  const index = await import("./index.js");
  await import(module);
  const exec = index.getDirectExecutor(slug);
  if (!exec) throw new Error(`${slug} is not registered`);
  return exec;
}

async function expectUnbilledUpstreamFailure(promise: Promise<unknown>): Promise<Error & { retryable?: boolean; upstream?: string }> {
  const err = await promise.then(
    (r) => {
      throw new Error(`expected a throw, got a billable result: ${JSON.stringify((r as { output?: unknown }).output)}`);
    },
    (e: unknown) => e,
  );
  expect((err as Error).name).toBe("UpstreamUnavailableError");
  // The message must not read as the caller's fault.
  expect((err as Error).message).not.toMatch(/not found|invalid|missing|required/i);
  const { outcomeFromError } = await import("../lib/execution-outcome.js");
  expect(outcomeFromError(err)).toMatchObject({ billable: false, failure_class: "provider_unavailable" });
  return err as Error & { retryable?: boolean };
}

async function expectBillable(slug: string, output: unknown): Promise<void> {
  const { assertBillableOutput } = await import("../lib/execution-outcome.js");
  expect(() => assertBillableOutput(slug, output)).not.toThrow();
}

const json = (body: unknown, code = 200) =>
  new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });
const status = (code: number) => new Response("", { status: code });
const networkError = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } });
const timeout = () => new DOMException("The operation was aborted due to timeout", "TimeoutError");

type Route = (url: string, init?: RequestInit) => Promise<Response> | Response;
function route(routes: Array<[RegExp, Route]>) {
  fetchMock.mockImplementation(async (input: unknown, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    for (const [pattern, answer] of routes) if (pattern.test(url)) return answer(url, init);
    throw new Error(`unexpected fetch ${url}`);
  });
}

const failures: Array<[string, () => Promise<Response>, boolean]> = [
  ["HTTP 503", async () => status(503), true],
  ["HTTP 429", async () => status(429), true],
  ["network error", async () => { throw networkError(); }, true],
  ["timeout", async () => { throw timeout(); }, true],
  ["HTTP 404 (the endpoint is gone)", async () => status(404), false],
];

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── package-security-audit (row 7) ─────────────────────────────────────────

const PACKUMENT = {
  name: "left-pad",
  "dist-tags": { latest: "1.3.0" },
  time: { "1.2.0": "2025-01-01T00:00:00.000Z", "1.3.0": "2025-06-01T00:00:00.000Z" },
  maintainers: [{ name: "a" }],
  versions: {
    "1.2.0": { _npmUser: { name: "a", email: "a@example.test" } },
    "1.3.0": { _npmUser: { name: "a", email: "a@example.test" } },
  },
};
const DEPS_DEV_VERSION = { licenses: ["MIT"], dependencyCount: 2, links: [{ label: "SOURCE_REPO", url: "https://github.com/example/left-pad" }] };
const SCORECARD = { scorecardV2: { overallScore: 7.5, check: [{ name: "Maintained", score: 9 }] } };
const PSA_INPUT = { name: "left-pad", ecosystem: "npm", version: "1.3.0" };

const NPM = /^https:\/\/registry\.npmjs\.org\//;
const OSV_QUERY = /^https:\/\/api\.osv\.dev\/v1\/query$/;
const DEPS_CURRENT = /deps\.dev\/v3alpha\/systems\/npm\/packages\/left-pad\/versions\/1\.3\.0$/;
const DEPS_PREVIOUS = /deps\.dev\/v3alpha\/systems\/npm\/packages\/left-pad\/versions\/1\.2\.0$/;
const DEPS_PROJECT = /deps\.dev\/v3alpha\/projects\//;

function psaRoutes(overrides: Partial<Record<"osv" | "current" | "previous" | "project", Route>> = {}) {
  route([
    [NPM, () => json(PACKUMENT)],
    [OSV_QUERY, overrides.osv ?? (() => json({}))],
    [DEPS_CURRENT, overrides.current ?? (() => json(DEPS_DEV_VERSION))],
    [DEPS_PREVIOUS, overrides.previous ?? (() => json({}))],
    [DEPS_PROJECT, overrides.project ?? (() => json(SCORECARD))],
  ]);
}

describe("package-security-audit: OSV is required (row 7)", () => {
  it.each(failures)("throws, unbilled, when OSV fails with %s", async (_label, answer, retryable) => {
    psaRoutes({ osv: answer });
    const exec = await load("package-security-audit", "./package-security-audit.js");
    const err = await expectUnbilledUpstreamFailure(exec(PSA_INPUT));
    expect(err.message).toContain("OSV vulnerability database");
    expect(err.retryable).toBe(retryable);
  });

  it("throws, unbilled, when OSV answers 200 with a body that is not a vulnerability list", async () => {
    psaRoutes({ osv: () => json({ vulns: "maintenance" }) });
    const exec = await load("package-security-audit", "./package-security-audit.js");
    const err = await expectUnbilledUpstreamFailure(exec(PSA_INPUT));
    expect(err.message).toContain("not a vulnerability list");
  });

  it("throws, unbilled, when OSV answers 200 with a body that does not parse", async () => {
    psaRoutes({ osv: () => new Response("<html>maintenance</html>", { status: 200 }) });
    const exec = await load("package-security-audit", "./package-security-audit.js");
    await expectUnbilledUpstreamFailure(exec(PSA_INPUT));
  });

  it("throws, unbilled, when ecosystem detection cannot reach the npm registry", async () => {
    route([[NPM, () => status(503)]]);
    const exec = await load("package-security-audit", "./package-security-audit.js");
    const err = await expectUnbilledUpstreamFailure(exec({ name: "left-pad" }));
    expect(err.message).toContain("npm registry");
  });
});

describe("package-security-audit: secondary legs are marked, never clean (row 7)", () => {
  it("names deps.dev in unavailable_sources and reports attestation unknown when it fails", async () => {
    psaRoutes({ current: () => status(503) });
    const exec = await load("package-security-audit", "./package-security-audit.js");
    const r = await exec(PSA_INPUT);
    expect(r.output.unavailable_sources).toEqual(["deps.dev"]);
    const supply = r.output.supply_chain as { provenance: Record<string, unknown> };
    expect(supply.provenance.attestation_missing).toBeNull();
    expect(supply.provenance.has_attestation).toBeNull();
    expect(r.output.dependency_count).toBeNull();
    await expectBillable("package-security-audit", r.output);
  });

  it("does not read a failed deps.dev as an unlicensed package: no license penalty, risk_score_complete false", async () => {
    psaRoutes();
    let exec = await load("package-security-audit", "./package-security-audit.js");
    const complete = await exec(PSA_INPUT);
    expect(complete.output.license).toMatchObject({ spdx: "MIT" });

    psaRoutes({ current: () => status(503) });
    exec = await load("package-security-audit", "./package-security-audit.js");
    const r = await exec(PSA_INPUT);
    expect(r.output.license).toBeNull();
    // Same score as the complete MIT answer: the -15 "no license" penalty is
    // not applied to a license nobody could read.
    expect(r.output.risk_score).toBe(complete.output.risk_score);
    expect(r.output.risk_level).toBe(complete.output.risk_level);
    expect(r.output.risk_score_complete).toBe(false);
    await expectBillable("package-security-audit", r.output);
  });

  it("reports risk_score_complete false when the previous-version read or the Scorecard fails", async () => {
    psaRoutes({ previous: () => status(503) });
    let exec = await load("package-security-audit", "./package-security-audit.js");
    expect((await exec(PSA_INPUT)).output.risk_score_complete).toBe(false);

    psaRoutes({ project: () => status(503) });
    exec = await load("package-security-audit", "./package-security-audit.js");
    expect((await exec(PSA_INPUT)).output.risk_score_complete).toBe(false);
  });

  it("names the previous-version deps.dev read when only it fails", async () => {
    psaRoutes({ previous: async () => { throw timeout(); } });
    const exec = await load("package-security-audit", "./package-security-audit.js");
    const r = await exec(PSA_INPUT);
    expect(r.output.unavailable_sources).toEqual(["deps.dev (previous version)"]);
    const supply = r.output.supply_chain as { provenance: Record<string, unknown> };
    expect(supply.provenance.attestation_missing).toBeNull();
  });

  it("names the Scorecard when its read fails", async () => {
    psaRoutes({ project: () => status(502) });
    const exec = await load("package-security-audit", "./package-security-audit.js");
    const r = await exec(PSA_INPUT);
    expect(r.output.unavailable_sources).toEqual(["OpenSSF Scorecard (deps.dev)"]);
    expect(r.output.scorecard).toBeNull();
  });

  it("keeps the real negative: OSV {} and deps.dev 404 give the same answer, with no unavailable_sources", async () => {
    psaRoutes({ current: () => status(404), previous: () => status(404) });
    const exec = await load("package-security-audit", "./package-security-audit.js");
    const r = await exec(PSA_INPUT);
    expect(r.output).not.toHaveProperty("unavailable_sources");
    expect(r.output.risk_score_complete).toBe(true);
    expect(r.output.vulnerabilities).toEqual({ total: 0, critical: 0, high: 0, medium: 0, low: 0, details: [] });
    expect(r.output.dependency_count).toBe(0);
    expect(r.output.license).toBeNull();
    expect(r.output.scorecard).toBeNull();
    const supply = r.output.supply_chain as { provenance: Record<string, unknown> };
    expect(supply.provenance).toEqual({ has_attestation: null, previous_had_attestation: null, attestation_missing: false });
    await expectBillable("package-security-audit", r.output);
  });

  it("keeps the complete answer unchanged when every leg answers", async () => {
    psaRoutes();
    const exec = await load("package-security-audit", "./package-security-audit.js");
    const r = await exec(PSA_INPUT);
    expect(r.output).not.toHaveProperty("unavailable_sources");
    expect(r.output.risk_score_complete).toBe(true);
    expect(r.output.scorecard).toEqual({ score: 7.5, checks: { Maintained: 9 } });
    expect(r.output.license).toMatchObject({ spdx: "MIT" });
    await expectBillable("package-security-audit", r.output);
  });
});

// ─── dependency-audit (row 8) ───────────────────────────────────────────────

const OSV_BATCH = /^https:\/\/api\.osv\.dev\/v1\/querybatch$/;
const PACKAGE_JSON = JSON.stringify({ dependencies: { "left-pad": "^1.3.0", lodash: "4.17.21" } });
const npmDoc = (latest: string) => json({ "dist-tags": { latest } });
const osvAnswers = (n: number) => json({ results: Array.from({ length: n }, () => ({})) });

function sentQueries(): number {
  const call = fetchMock.mock.calls.find(([url]) => OSV_BATCH.test(String(url)));
  if (!call) return 0;
  return (JSON.parse(String((call[1] as RequestInit).body)) as { queries: unknown[] }).queries.length;
}

describe("dependency-audit: OSV is required (row 8)", () => {
  it.each(failures)("throws, unbilled, when OSV fails with %s", async (_label, answer, retryable) => {
    route([[NPM, (url) => npmDoc(url.endsWith("lodash") ? "4.17.21" : "1.3.0")], [OSV_BATCH, answer]]);
    const exec = await load("dependency-audit", "./dependency-audit.js");
    const err = await expectUnbilledUpstreamFailure(exec({ package_json: PACKAGE_JSON }));
    expect(err.message).toContain("OSV vulnerability database");
    expect(err.retryable).toBe(retryable);
  });

  it("throws, unbilled, when OSV's answer does not match the queries sent", async () => {
    route([[NPM, (url) => npmDoc(url.endsWith("lodash") ? "4.17.21" : "1.3.0")], [OSV_BATCH, () => json({})]]);
    const exec = await load("dependency-audit", "./dependency-audit.js");
    const err = await expectUnbilledUpstreamFailure(exec({ package_json: PACKAGE_JSON }));
    expect(err.message).toContain("did not match the queries sent");
  });

  it("throws, unbilled, when OSV's body does not parse", async () => {
    route([[NPM, (url) => npmDoc(url.endsWith("lodash") ? "4.17.21" : "1.3.0")], [OSV_BATCH, () => new Response("<html/>", { status: 200 })]]);
    const exec = await load("dependency-audit", "./dependency-audit.js");
    await expectUnbilledUpstreamFailure(exec({ package_json: PACKAGE_JSON }));
  });

  it("throws, unbilled, when every registry lookup fails and OSV has no version to check", async () => {
    route([[NPM, () => status(503)]]);
    const exec = await load("dependency-audit", "./dependency-audit.js");
    const err = await expectUnbilledUpstreamFailure(exec({ package_json: JSON.stringify({ dependencies: { "left-pad": "" } }) }));
    expect(err.message).toContain("npm registry");
    expect(fetchMock.mock.calls.some(([url]) => OSV_BATCH.test(String(url)))).toBe(false);
  });
});

describe("dependency-audit: registry failures are marked, never clean (row 8)", () => {
  it("marks a dependency whose registry lookup failed, names the registry, and still sends it to OSV", async () => {
    route([
      [NPM, (url) => (url.endsWith("lodash") ? status(503) : npmDoc("1.3.0"))],
      [OSV_BATCH, () => osvAnswers(2)],
    ]);
    const exec = await load("dependency-audit", "./dependency-audit.js");
    const r = await exec({ package_json: PACKAGE_JSON });
    expect(r.output.unavailable_sources).toEqual(["npm registry"]);
    const lodash = (r.output.dependencies as Array<Record<string, unknown>>).find((d) => d.name === "lodash");
    expect(lodash).toMatchObject({ error: "HTTP 503", unavailable: true });
    expect(sentQueries()).toBe(2);
    await expectBillable("dependency-audit", r.output);
  });

  it("marks a PyPI dependency whose lookup hit a network error", async () => {
    route([
      [/^https:\/\/pypi\.org\/pypi\/requests\/json$/, async () => { throw networkError(); }],
      [/^https:\/\/pypi\.org\/pypi\/flask\/json$/, () => json({ info: { version: "3.0.0" } })],
      [OSV_BATCH, () => osvAnswers(2)],
    ]);
    const exec = await load("dependency-audit", "./dependency-audit.js");
    const r = await exec({ requirements_txt: "requests==2.31.0\nflask==3.0.0" });
    expect(r.output.unavailable_sources).toEqual(["PyPI"]);
    expect(sentQueries()).toBe(2);
  });

  it("keeps the real negative: a registry 404 and an OSV answer of no vulnerabilities, with no unavailable_sources", async () => {
    route([
      [NPM, (url) => (url.endsWith("lodash") ? status(404) : npmDoc("1.3.0"))],
      [OSV_BATCH, () => osvAnswers(1)],
    ]);
    const exec = await load("dependency-audit", "./dependency-audit.js");
    const r = await exec({ package_json: PACKAGE_JSON });
    expect(r.output).not.toHaveProperty("unavailable_sources");
    expect(r.output.vulnerable_count).toBe(0);
    const lodash = (r.output.dependencies as Array<Record<string, unknown>>).find((d) => d.name === "lodash");
    expect(lodash).toEqual({
      name: "lodash",
      current_version: "4.17.21",
      error: "HTTP 404",
      vulnerabilities: [],
      vulnerability_count: 0,
      highest_severity: null,
    });
    expect(sentQueries()).toBe(1);
    await expectBillable("dependency-audit", r.output);
  });
});
