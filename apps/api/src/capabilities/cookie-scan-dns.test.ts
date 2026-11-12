/**
 * cookie-scan against a host that does not resolve, with the real fetch path.
 *
 * PR #1018 review round 4, B1: cookie-scan's robots.txt pre-check ran before
 * the try that files the caller's site failing as `targetUnavailable`, and
 * the pre-check rethrows the resolver's own Error (code ENOTFOUND or
 * EAI_AGAIN). For a host that does not resolve, the call failed as this
 * capability's fault: counted by the breaker, the quality floor and the batch
 * path, and retried. A test that stubs safeFetch to answer robots.txt with a
 * 404 and fail only the page fetch never sees that sequence. Here safeFetch,
 * the robots pre-check and undici stay real; only the resolver is mocked, so
 * no request leaves the machine.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ resolve4: vi.fn(), resolve6: vi.fn(), lookup: vi.fn() }));
vi.mock("dns/promises", () => ({ default: dns }));
vi.mock("node:dns", () => ({ lookup: dns.lookup }));

import { getDirectExecutor } from "./index.js";
import "./cookie-scan.js";
import { __resetRobotsCacheForTests } from "../lib/robots-txt.js";
import { withAcquisitionMethod } from "../lib/data-access.js";
import { outcomeFromError, shouldCountAgainstCapability } from "../lib/execution-outcome.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";

/** What getaddrinfo hands back: a plain Error carrying an errno code. */
function resolverFails(code: string) {
  const fail = (hostname: string) =>
    Object.assign(new Error(`getaddrinfo ${code} ${hostname}`), { code, errno: -3008, syscall: "getaddrinfo", hostname });
  dns.resolve4.mockImplementation(async (hostname: string) => { throw fail(hostname); });
  dns.resolve6.mockImplementation(async (hostname: string) => { throw fail(hostname); });
  dns.lookup.mockImplementation((hostname: string, _opts: unknown, callback: (err: Error) => void) => {
    queueMicrotask(() => callback(fail(hostname)));
  });
}

async function scanFails(): Promise<UpstreamUnavailableError> {
  const err = await withAcquisitionMethod("customer_directed_fetch", () =>
    getDirectExecutor("cookie-scan")!({ url: "https://dead.test" }),
  ).then(
    () => { throw new Error("expected cookie-scan to throw"); },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UpstreamUnavailableError);
  return err as UpstreamUnavailableError;
}

beforeEach(() => {
  __resetRobotsCacheForTests();
  dns.resolve4.mockReset();
  dns.resolve6.mockReset();
  dns.lookup.mockReset();
});

describe("cookie-scan, real safeFetch and robots pre-check, resolver mocked (review round 4, B1)", () => {
  it("files a host that does not resolve as the target's failure: unbilled, not counted, not retried", async () => {
    resolverFails("ENOTFOUND");
    const err = await scanFails();
    expect(dns.lookup).toHaveBeenCalled();
    expect(err.message).toContain("URL did not answer (ENOTFOUND)");
    expect(err.retryable).toBe(false);
    expect(isUserInputError(err.message)).toBe(true);
    expect(shouldCountAgainstCapability(err)).toBe(false);
    expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "target", counts_against_capability: false });
  });

  it("files a resolver that fails for now as the target's failure, retryable", async () => {
    resolverFails("EAI_AGAIN");
    const err = await scanFails();
    expect(err.message).toContain("URL did not answer (EAI_AGAIN)");
    expect(err.retryable).toBe(true);
    expect(isUserInputError(err.message)).toBe(true);
    expect(outcomeFromError(err)).toMatchObject({ billable: false, fault: "target", counts_against_capability: false });
  });
});
