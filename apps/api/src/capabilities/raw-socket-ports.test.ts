/**
 * Invalid ports are refused before any socket is attempted.
 *
 * ssl-check and ssl-certificate-chain armed a 10 s timer that called
 * `socket.destroy()` before `socket` was assigned. A port that makes connect
 * throw synchronously (70000, 1.5, "abc") rejected the call, then 10 s later
 * the timer hit `socket` in its temporal dead zone: a ReferenceError outside
 * any promise, in a process with no uncaughtException handler. port-check
 * either threw the raw RangeError or reported port 0 "closed".
 *
 * The host is 127.0.0.1, treated as allowed in this file only, so a
 * regression that does connect stays on loopback.
 */
import tls from "node:tls";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/url-validator.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/url-validator.js")>();
  return {
    ...actual,
    isBlockedIp: (addr: string) => (addr === "127.0.0.1" ? false : actual.isBlockedIp(addr)),
    validateHost: async (host: string) => (host === "127.0.0.1" ? undefined : actual.validateHost(host)),
  };
});

const { isCapabilityRefusal } = await import("../lib/capability-refusal.js");
const { portInput } = await import("../lib/vetted-connect.js");
const { getExecutor } = await import("./index.js");
await import("./port-check.js");
await import("./ssl-check.js");
await import("./ssl-certificate-chain.js");

const BAD_PORTS: unknown[] = [70000, 65536, 0, -1, 1.5, Number.NaN, "abc", "80abc", ""];

function exec(slug: string) {
  const fn = getExecutor(slug);
  if (!fn) throw new Error(`no executor registered for ${slug}`);
  return fn;
}

describe("portInput", () => {
  it.each([[1, 1], [443, 443], [65535, 65535], ["8443", 8443], [" 22 ", 22]])("accepts %j", (raw, want) => {
    expect(portInput(raw, "port")).toBe(want);
  });

  it.each([...BAD_PORTS, null, {}, [443], true].map((v) => [v]))("refuses %j as a structured input refusal", (raw) => {
    let err: unknown;
    try { portInput(raw, "port"); } catch (e) { err = e; }
    expect(isCapabilityRefusal(err)).toBe(true);
    expect((err as Error).message).toBe("'port' must be an integer from 1 to 65535.");
  });
});

describe("the raw-socket capabilities refuse an invalid port before connecting", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const cases = [
    ...BAD_PORTS.map((port) => ["ssl-check", { domain: "127.0.0.1", port }] as const),
    ...BAD_PORTS.map((port) => ["ssl-certificate-chain", { host: "127.0.0.1", port }] as const),
    ...BAD_PORTS.filter((p) => p !== "").map((port) => ["port-check", { host: "127.0.0.1", ports: [port] }] as const),
    ["port-check", { host: "127.0.0.1", ports: "80,70000" }] as const,
    ["port-check", { host: "127.0.0.1", port: 0 }] as const,
  ];

  it.each(cases)("%s %j", async (slug, input) => {
    const outcome = await exec(slug)(input as Record<string, unknown>).then(
      (r) => ({ resolved: r }),
      (e: unknown) => ({ rejected: e }),
    );
    expect("rejected" in outcome && isCapabilityRefusal(outcome.rejected)).toBe(true);
    expect(((outcome as { rejected: Error }).rejected).message).toMatch(/must be an integer from 1 to 65535/);
    // No timer was left behind to fire into a half-built socket.
    expect(vi.getTimerCount()).toBe(0);
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  });
});

// The timer is armed only after the socket exists. Any input that makes the
// connect call throw synchronously (a NUL in a host did, before validateHost
// refused control characters) must reject cleanly and leave no timer that
// fires into the uninitialised socket 10 s later.
describe("a synchronous connect failure leaves no timer behind", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.spyOn(tls, "connect").mockImplementation(() => {
      throw new TypeError("synchronous connect failure");
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([
    ["ssl-check", { domain: "127.0.0.1", port: 443 }],
    ["ssl-certificate-chain", { host: "127.0.0.1", port: 443 }],
  ] as const)("%s", async (slug, input) => {
    await expect(exec(slug)(input as Record<string, unknown>)).rejects.toThrow();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => vi.advanceTimersByTime(10_000)).not.toThrow();
  });
});
