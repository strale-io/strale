/**
 * page-exists against a host that does not resolve, with the real fetch path.
 *
 * PR #1018 review B1: safeFetch's robots.txt pre-check rethrows the resolver's
 * own Error (code ENOTFOUND or EAI_AGAIN, not wrapped in a TypeError), so a
 * test that mocks safeFetch cannot see what the executor receives. Here
 * safeFetch, the robots pre-check and undici stay real; only the resolver is
 * mocked, so no request leaves the machine.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ resolve4: vi.fn(), resolve6: vi.fn(), lookup: vi.fn() }));
vi.mock("dns/promises", () => ({ default: dns }));
vi.mock("node:dns", () => ({ lookup: dns.lookup }));

import { getDirectExecutor } from "./index.js";
import "./page-exists.js";
import { __resetRobotsCacheForTests } from "../lib/robots-txt.js";
import { withAcquisitionMethod } from "../lib/data-access.js";
import { assertBillableOutput, outcomeFromError } from "../lib/execution-outcome.js";
import { isUserInputError } from "../lib/circuit-breaker.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";

const URL_UNDER_TEST = "https://no-such-host.test/listing/123";

/** What getaddrinfo hands back: a plain Error carrying an errno code. */
function resolverFails(code: string) {
  const fail = (hostname: string) =>
    Object.assign(new Error(`getaddrinfo ${code} ${hostname}`), { code, errno: -3008, syscall: "getaddrinfo", hostname });
  dns.resolve4.mockRejectedValue(fail("no-such-host.test"));
  dns.resolve6.mockRejectedValue(fail("no-such-host.test"));
  dns.lookup.mockImplementation((hostname: string, _opts: unknown, callback: (err: Error) => void) => {
    queueMicrotask(() => callback(fail(hostname)));
  });
}

const run = () =>
  withAcquisitionMethod("customer_directed_fetch", () => getDirectExecutor("page-exists")!({ url: URL_UNDER_TEST }));

beforeEach(() => {
  __resetRobotsCacheForTests();
  dns.resolve4.mockReset();
  dns.resolve6.mockReset();
  dns.lookup.mockReset();
});

describe("page-exists, real safeFetch and robots pre-check, resolver mocked (review B1)", () => {
  it("bills exists:false with reason dns_nxdomain when the host does not exist", async () => {
    resolverFails("ENOTFOUND");
    const result = (await run()) as { output: Record<string, unknown> };
    expect(result.output).toMatchObject({ exists: false, confidence: "high", reason: "dns_nxdomain", status_code: null });
    expect(() => assertBillableOutput("page-exists", result.output)).not.toThrow();
    expect(dns.lookup).toHaveBeenCalled();
  });

  it("fails unbilled, as the target's fault, when the resolver only fails for now", async () => {
    resolverFails("EAI_AGAIN");
    const err = await run().then(
      () => { throw new Error("expected page-exists to throw"); },
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    const upstream = err as UpstreamUnavailableError;
    expect(upstream.message).toContain("URL did not answer (EAI_AGAIN)");
    expect(upstream.retryable).toBe(true);
    expect(isUserInputError(upstream.message)).toBe(true);
    expect(outcomeFromError(upstream)).toMatchObject({
      billable: false,
      fault: "target",
      counts_against_capability: false,
    });
  });
});
