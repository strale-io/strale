/**
 * Bus delivery for alerts (lib/alert-bus.ts, wired from sendAlert).
 *
 * No test here can reach GitHub: `fetch` is stubbed globally with a function
 * that fails the test if called unexpectedly, and the bus variables are only
 * ever set to fake values inside this file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

const FAKE_ENV = { BUS_GITHUB_TOKEN: "github_pat_fake", BUS_REPO: "example-owner/example-bus" };
// The parser in .claude/scripts/bus.mjs, verbatim.
const BUS_FORMAT = /^From ([a-z0-9][a-z0-9-]{0,62}):\n\n([\s\S]*)$/;

function okJson(value: unknown): Response {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** A fake GitHub: channel listing, then comment creation. */
function fakeGithub() {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/issues?")) return okJson([{ number: 7, title: "channel: other" }, { number: 42, title: "channel: strale-planning" }]);
    if (u.endsWith("/issues/42/comments") && init?.method === "POST") return okJson({ id: 1 });
    return new Response("unexpected", { status: 500 });
  });
}

async function freshModules() {
  vi.resetModules();
  const bus = await import("./alert-bus.js");
  const alerting = await import("./alerting.js");
  return { bus, alerting };
}

const unexpectedFetch = vi.fn(async () => {
  throw new Error("test reached the network");
});

beforeEach(() => {
  sendMock.mockReset();
  unexpectedFetch.mockClear();
  vi.stubGlobal("fetch", unexpectedFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.BUS_GITHUB_TOKEN;
  delete process.env.BUS_REPO;
  delete process.env.ALERT_ALLOW_IN_TEST;
  delete process.env.RESEND_API_KEY;
});

describe("deliverToBus", () => {
  it("is a no-op when the bus variables are unset", async () => {
    const { bus } = await freshModules();
    const f = fakeGithub();
    const env = { ALERT_ALLOW_IN_TEST: "true", VITEST: "true" };
    expect(bus.busConfig(env)).toBeNull();
    await expect(bus.deliverToBus({ subject: "s", body: "b", severity: "critical" }, { fetch: f, env })).resolves.toBe(false);
    expect(f).not.toHaveBeenCalled();
  });

  it("is off when only one variable is set, or the repo is not owner/name", async () => {
    const { bus } = await freshModules();
    expect(bus.busConfig({ BUS_GITHUB_TOKEN: "t" })).toBeNull();
    expect(bus.busConfig({ BUS_REPO: "a/b" })).toBeNull();
    expect(bus.busConfig({ BUS_GITHUB_TOKEN: "t", BUS_REPO: "not-a-repo" })).toBeNull();
  });

  it("posts the bus message format to the strale-planning channel issue", async () => {
    const { bus } = await freshModules();
    const f = fakeGithub();
    const env = { ...FAKE_ENV, ALERT_ALLOW_IN_TEST: "true", VITEST: "true" };
    await expect(
      bus.deliverToBus({ subject: "x402 volume dropped", body: "Line one.\nLine two.", severity: "critical" }, { fetch: f, env }),
    ).resolves.toBe(true);

    const post = f.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(post[0])).toBe("https://api.github.com/repos/example-owner/example-bus/issues/42/comments");
    expect((post[1]!.headers as Record<string, string>).Authorization).toBe("Bearer github_pat_fake");
    const { body } = JSON.parse(String(post[1]!.body)) as { body: string };
    expect(body).toBe("From strale-alerts:\n\n[Strale CRITICAL] x402 volume dropped\n\nLine one.\nLine two.");
    expect(body.match(BUS_FORMAT)?.[1]).toBe("strale-alerts");
  });

  it("never throws: a GitHub error or a network failure resolves to false", async () => {
    const { bus } = await freshModules();
    const env = { ...FAKE_ENV, ALERT_ALLOW_IN_TEST: "true", VITEST: "true" };
    const forbidden = vi.fn(async () => new Response("no", { status: 403 }));
    await expect(bus.deliverToBus({ subject: "s", body: "b", severity: "warning" }, { fetch: forbidden, env })).resolves.toBe(false);
    const broken = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(bus.deliverToBus({ subject: "s", body: "b", severity: "warning" }, { fetch: broken, env })).resolves.toBe(false);
  });

  it("obeys the test-runner gate even when called directly", async () => {
    const { bus } = await freshModules();
    const f = fakeGithub();
    await expect(
      bus.deliverToBus({ subject: "s", body: "b", severity: "critical" }, { fetch: f, env: { ...FAKE_ENV, VITEST: "true" } }),
    ).resolves.toBe(false);
    await expect(
      bus.deliverToBus({ subject: "s", body: "b", severity: "critical" }, { fetch: f, env: { ...FAKE_ENV, ALERT_SUPPRESS: "true" } }),
    ).resolves.toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});

describe("sendAlert with bus delivery", () => {
  it("does not reach the bus from a test run that has not opted in (STARVE-SET-1 gate)", async () => {
    Object.assign(process.env, FAKE_ENV);
    const { alerting } = await freshModules();
    await expect(alerting.sendAlert({ subject: "s", body: "b", severity: "critical" })).resolves.toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(unexpectedFetch).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends the email without waiting for a bus call that hangs", async () => {
    Object.assign(process.env, FAKE_ENV, { ALERT_ALLOW_IN_TEST: "true", RESEND_API_KEY: "re_test_key" });
    const hanging = vi.fn(() => new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", hanging);
    sendMock.mockResolvedValueOnce({ data: { id: "email_1" }, error: null });
    const { alerting } = await freshModules();

    const started = Date.now();
    await expect(alerting.sendAlert({ subject: "s", body: "b", severity: "critical" })).resolves.toBe(true);
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(hanging).toHaveBeenCalled(); // the bus was attempted, not skipped
  });

  it("sends the email when the bus call fails", async () => {
    Object.assign(process.env, FAKE_ENV, { ALERT_ALLOW_IN_TEST: "true", RESEND_API_KEY: "re_test_key" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 502 })));
    sendMock.mockResolvedValueOnce({ data: { id: "email_2" }, error: null });
    const { alerting } = await freshModules();
    await expect(alerting.sendAlert({ subject: "s", body: "b", severity: "warning" })).resolves.toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("keeps INFO off the bus", async () => {
    Object.assign(process.env, FAKE_ENV, { ALERT_ALLOW_IN_TEST: "true", ALERT_INFO_EMAIL: "true", RESEND_API_KEY: "re_test_key" });
    sendMock.mockResolvedValueOnce({ data: { id: "email_3" }, error: null });
    const { alerting } = await freshModules();
    await alerting.sendAlert({ subject: "s", body: "b", severity: "info" });
    delete process.env.ALERT_INFO_EMAIL;
    await new Promise((r) => setTimeout(r, 10));
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });
});
