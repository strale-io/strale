/**
 * Every refusal the 2026-09-05 agent-data batch can emit, through all three
 * health consumers.
 *
 * A refusal is the capability working: the caller passed a hallucinated
 * ticker, an IPv6 address, a string that is not a DOI. The health machinery
 * cannot tell that from an outage unless the MESSAGE says so — the async and
 * x402 paths persist only the string, so `CapabilityRefusalError` alone does
 * not survive to `recordFailure`.
 *
 * This is the 2026-08-14 french-company-data incident (LESSONS F1/F9): three
 * identical refusals opened the breaker on a healthy capability and every
 * caller got `capability_unavailable`. Independent review of PR #582 found
 * twelve messages in this batch with exactly that shape before this test
 * existed.
 *
 * Asserting through `verdicts()` rather than a regex is the point: a message
 * that only the taxonomy recognises still trips the breaker.
 */
import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";
import { getDirectExecutor } from "./index.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { categorizeError } from "../lib/quality-capture.js";
import { classifyTransactionFailure, countsAgainstCapability } from "../lib/transaction-failure-taxonomy.js";

import "./clinical-trials-search.js";
import "./doi-resolve.js";
import "./citation-graph.js";
import "./cert-transparency-search.js";
import "./host-exposure-lookup.js";
import "./breach-exposure-check.js";
import "./fda-safety-search.js";
import "./company-fundamentals.js";

function verdicts(message: string) {
  const cls = classifyTransactionFailure(message);
  return {
    breakerExcuses: isUserInputError(message),
    qualityBucket: categorizeError(message),
    taxonomyClass: cls,
    floorExcuses: !countsAgainstCapability(cls),
  };
}

function expectRecognisedEverywhere(message: string, why: string) {
  const v = verdicts(message);
  expect(v.breakerExcuses, `${why}: circuit breaker would count it — ${message}`).toBe(true);
  expect(v.qualityBucket, `${why}: quality capture bucketed it wrong — ${message}`).toBe("capability_refusal");
  expect(v.taxonomyClass, `${why}: taxonomy classified it wrong — ${message}`).toBe("caller_input");
  expect(v.floorExcuses, `${why}: the quality floor would count it — ${message}`).toBe(true);
}

/** Refusals reachable from input alone — no upstream call is made. */
const INPUT_REFUSALS: Array<[string, Record<string, unknown>]> = [
  ["clinical-trials-search", {}],
  ["clinical-trials-search", { query: "x" }],
  ["clinical-trials-search", { query: "crispr", status: "sleeping" }],
  ["doi-resolve", {}],
  ["doi-resolve", { doi: "not-a-doi" }],
  ["citation-graph", {}],
  ["citation-graph", { paper_id: "???" }],
  ["citation-graph", { paper_id: "10.1038/nature12373", direction: "sideways" }],
  ["cert-transparency-search", {}],
  ["cert-transparency-search", { domain: "not a domain" }],
  ["host-exposure-lookup", {}],
  ["host-exposure-lookup", { host: "2606:4700:4700::1111" }],
  ["host-exposure-lookup", { host: "10.0.0.1" }],
  ["host-exposure-lookup", { host: "127.0.0.1" }],
  ["breach-exposure-check", { email: "a@b.com" }],
  ["breach-exposure-check", { password: "hunter2" }],
  ["breach-exposure-check", { account: "x" }],
  ["breach-exposure-check", {}],
  ["breach-exposure-check", { domain: "nope" }],
  ["fda-safety-search", { query: "a" }],
  ["fda-safety-search", { query: "aspirin", domain: "vehicle" }],
  ["fda-safety-search", { query: "aspirin", classification: "IV" }],
  ["company-fundamentals", {}],
  ["company-fundamentals", { ticker: "!!!" }],
  ["company-fundamentals", { cik: "not-a-cik" }],
];

describe("input refusals are recognised by every health consumer", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn(async () => {
      throw new Error("no upstream call should happen for an input refusal");
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it.each(INPUT_REFUSALS)("%s %j", async (slug, input) => {
    const exec = getDirectExecutor(slug)!;
    const err = await exec(input).then(
      () => { throw new Error(`${slug} accepted input it should have refused`); },
      (e: unknown) => e as Error,
    );
    expect(fetchMock, `${slug} called an upstream before refusing`).not.toHaveBeenCalled();
    expectRecognisedEverywhere(err.message, slug);
  });
});

/** Refusals that need an upstream answer first — "no such record" shapes. */
describe("not-found refusals are recognised by every health consumer", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("doi-resolve: registered with neither agency", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    const err = await getDirectExecutor("doi-resolve")!({ doi: "10.9999/nope" }).catch((e: Error) => e);
    expectRecognisedEverywhere(err.message, "doi-resolve not-registered");
  });

  it("citation-graph: OpenAlex has no such work", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    const err = await getDirectExecutor("citation-graph")!({ paper_id: "10.9999/nope" }).catch((e: Error) => e);
    expectRecognisedEverywhere(err.message, "citation-graph not-found");
  });

  it("company-fundamentals: ticker absent from the SEC directory", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ 0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." } }), { status: 200 }));
    const err = await getDirectExecutor("company-fundamentals")!({ ticker: "ZZZZ" }).catch((e: Error) => e);
    expectRecognisedEverywhere(err.message, "company-fundamentals unknown ticker");
  });

  it("company-fundamentals: registrant files no annual XBRL", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 404 }));
    const err = await getDirectExecutor("company-fundamentals")!({ cik: "1" }).catch((e: Error) => e);
    expectRecognisedEverywhere(err.message, "company-fundamentals no annual data");
  });

  it("host-exposure-lookup: hostname with no A record", async () => {
    vi.doMock("node:dns", () => ({ promises: { resolve4: async () => { throw new Error("ENOTFOUND"); } } }));
    const err = await getDirectExecutor("host-exposure-lookup")!({ host: "no-such-host.invalid" }).catch((e: Error) => e);
    expectRecognisedEverywhere(err.message, "host-exposure-lookup no A record");
    vi.doUnmock("node:dns");
  });
});

/**
 * Upstream faults must keep tripping the breaker. A test that only proves
 * refusals are excused would pass just as well if everything were excused,
 * which would hide a real outage.
 */
describe("genuine upstream faults are still counted", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it.each([
    ["clinical-trials-search", { query: "crispr" }],
    ["breach-exposure-check", { domain: "adobe.com" }],
    ["fda-safety-search", { query: "aspirin" }],
  ])("%s: a 500 from the upstream is not excused", async (slug, input) => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const err = await getDirectExecutor(slug)!(input).catch((e: Error) => e);
    expect(isUserInputError(err.message), `${slug}: a 500 was excused — ${err.message}`).toBe(false);
  });
});
