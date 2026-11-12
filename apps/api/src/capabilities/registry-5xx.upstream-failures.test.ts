/**
 * A registry outage is the tool's upstream failing, not the caller's input.
 *
 * (56) The breaker excused any message containing "returned a server error",
 * meant for web-provider's "The target site (host) returned a server error".
 * cvrapi.dk and Companies House word their own 5xx the same way, so a
 * registry outage never moved the breaker that exists to stop calling it.
 *
 * (58) polish-company-data reported every non-2xx from the KRS S register,
 * a 503 included, as "not found in either P or S register" — which the
 * breaker excuses as a missing entity.
 *
 * All fetches are mocked; no network and no keys.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDirectExecutor } from "./index.js";
import "./danish-company-data.js";
import "./uk-filing-events.js";
import "./polish-company-data.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { classifyTransactionFailure, countsAgainstCapability } from "../lib/transaction-failure-taxonomy.js";

const status = (code: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status: code, headers: { "content-type": "application/json" } });

async function failure(slug: string, input: Record<string, unknown>): Promise<string> {
  const exec = getDirectExecutor(slug);
  if (!exec) throw new Error(`${slug} is not registered`);
  try {
    await exec(input);
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error(`${slug} did not fail`);
}

function expectCountedAgainstTheTool(message: string) {
  expect(isUserInputError(message), `breaker excused: ${message}`).toBe(false);
  expect(countsAgainstCapability(classifyTransactionFailure(message)), `floor excused: ${message}`).toBe(true);
}

describe("a registry's 5xx counts against the tool", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.COMPANIES_HOUSE_API_KEY;
    process.env.COMPANIES_HOUSE_API_KEY = "test-key";
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.COMPANIES_HOUSE_API_KEY;
    else process.env.COMPANIES_HOUSE_API_KEY = originalKey;
    vi.unstubAllGlobals();
  });

  it("(56) danish-company-data: cvrapi.dk answering 503", async () => {
    fetchMock.mockResolvedValue(status(503));
    const message = await failure("danish-company-data", { cvr_number: "10403782" });
    expect(message).toMatch(/cvrapi\.dk\) returned a server error \(HTTP 503\)/);
    expectCountedAgainstTheTool(message);
  });

  it("(56) uk-filing-events: Companies House answering 503", async () => {
    fetchMock.mockResolvedValue(status(503));
    const message = await failure("uk-filing-events", { company_number: "00445790" });
    expect(message).toMatch(/Companies House API returned a server error \(HTTP 503\)/);
    expectCountedAgainstTheTool(message);
  });

  it("(58) polish-company-data: P register 404, S register 503", async () => {
    fetchMock.mockResolvedValueOnce(status(404)).mockResolvedValueOnce(status(503));
    const message = await failure("polish-company-data", { krs_number: "0000028860" });
    expect(message).not.toMatch(/not found/);
    expect(message).toMatch(/HTTP 503/);
    expectCountedAgainstTheTool(message);
  });

  it("(58) polish-company-data: a 404 from both registers is still the caller's missing entity", async () => {
    fetchMock.mockResolvedValueOnce(status(404)).mockResolvedValueOnce(status(404));
    const message = await failure("polish-company-data", { krs_number: "0000028860" });
    expect(message).toMatch(/not found in either P or S register/);
    expect(isUserInputError(message)).toBe(true);
  });
});

describe("the caller's own target site answering 5xx is still excused", () => {
  // The one shape lib/web-provider.ts builds (with and without a hostname).
  it.each([
    "The target site (shop.example) returned a server error (HTTP 503). This is usually transient — try again in a few minutes.",
    "The target site returned a server error (HTTP 502). This is usually transient — try again in a few minutes.",
  ])("%s", (message) => {
    expect(isUserInputError(message)).toBe(true);
  });
});
