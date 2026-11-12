/**
 * Promise-audit T1 follow-up 45: email-pattern-discover reports whether the
 * homepage was actually read.
 *
 * The homepage leg is best-effort and never fails the call, but before the fix
 * every failure (robots.txt disallow, a refusal, a non-2xx answer, a host that
 * did not answer, a page too large) was swallowed silently, so
 * `public_emails_found: []` read the same as "the page was searched and lists
 * no addresses". The output now carries `website_checked` and, when it is
 * false, a `website_note` saying why.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ resolveMx: vi.fn() }));
vi.mock("node:dns/promises", () => ({ default: dns, ...dns }));

const safeFetchMock = vi.hoisted(() => vi.fn());
vi.mock("../lib/safe-fetch.js", () => ({ safeFetch: safeFetchMock, discardBody: vi.fn(async () => {}) }));
const robotsMock = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../lib/robots-txt.js", () => ({ assertRobotsAllowed: robotsMock }));
const tooLarge = vi.hoisted(() => ({ on: false }));
vi.mock("../lib/resource-limits.js", async (orig) => {
  const real = (await orig()) as typeof import("../lib/resource-limits.js");
  return {
    ...real,
    readPageHtml: (res: Response, field?: string) =>
      tooLarge.on ? Promise.reject(new real.ResourceLimitError("page too large")) : real.readPageHtml(res, field),
  };
});

import { getDirectExecutor } from "./index.js";
import "./email-pattern-discover.js";
import { siteAccessRefusal } from "../lib/site-access.js";

type Out = Record<string, unknown>;

async function run(): Promise<Out> {
  const exec = getDirectExecutor("email-pattern-discover");
  if (!exec) throw new Error("email-pattern-discover is not registered");
  const result = (await exec({ domain: "example.com" })) as { output: Out };
  return result.output;
}

beforeEach(() => {
  dns.resolveMx.mockReset().mockResolvedValue([{ exchange: "aspmx.l.google.com", priority: 1 }]);
  safeFetchMock.mockReset();
  robotsMock.mockReset().mockResolvedValue(undefined);
  tooLarge.on = false;
});

describe("email-pattern-discover says whether the homepage was read (follow-up 45)", () => {
  it("a page that was read and lists addresses: website_checked true, no note", async () => {
    safeFetchMock.mockResolvedValue(
      new Response("<a href='mailto:jane.doe@example.com'>mail</a>", { status: 200 }),
    );
    const out = await run();
    expect(out.website_checked).toBe(true);
    expect(out.website_note).toBeNull();
    expect(out.public_emails_found).toEqual(["jane.doe@example.com"]);
  });

  it("a page that was read and lists none: website_checked true, so [] means none published", async () => {
    safeFetchMock.mockResolvedValue(new Response("<p>no addresses here</p>", { status: 200 }));
    const out = await run();
    expect(out.website_checked).toBe(true);
    expect(out.website_note).toBeNull();
    expect(out.public_emails_found).toEqual([]);
  });

  it("a homepage that refuses (HTTP 403) is reported, not passed off as no addresses", async () => {
    safeFetchMock.mockResolvedValue(new Response("forbidden", { status: 403 }));
    const out = await run();
    expect(out.public_emails_found).toEqual([]);
    expect(out.website_checked).toBe(false);
    expect(out.website_note).toMatch(/refused automated access \(HTTP 403\)/);
  });

  it("a homepage that answers HTTP 503 is reported with its status", async () => {
    safeFetchMock.mockResolvedValue(new Response("down", { status: 503 }));
    const out = await run();
    expect(out.website_checked).toBe(false);
    expect(out.website_note).toMatch(/answered HTTP 503/);
  });

  it("a robots.txt disallow is reported as the reason, and the homepage is not fetched", async () => {
    robotsMock.mockRejectedValue(siteAccessRefusal("https://example.com", { kind: "robots_disallow" }));
    const out = await run();
    expect(safeFetchMock).not.toHaveBeenCalled();
    expect(out.website_checked).toBe(false);
    expect(out.website_note).toMatch(/robots\.txt does not allow/);
  });

  it("a host that does not answer is reported", async () => {
    safeFetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const out = await run();
    expect(out.website_checked).toBe(false);
    expect(out.website_note).toMatch(/could not be reached/);
  });

  it("a page too large to read is reported", async () => {
    safeFetchMock.mockResolvedValue(new Response("<p>x</p>", { status: 200 }));
    tooLarge.on = true;
    const out = await run();
    expect(out.website_checked).toBe(false);
    expect(out.website_note).toMatch(/too large/);
  });

  it("a homepage Strale does not fetch (terms prohibit automated access) is reported as Strale's policy, not as no answer", async () => {
    safeFetchMock.mockRejectedValue(
      new Error("example.com is not a supported source: its Terms of Service prohibit automated access, so Strale does not fetch it."),
    );
    const out = await run();
    expect(out.website_checked).toBe(false);
    expect(out.website_note).toMatch(/Strale does not fetch this site's homepage/);
  });

  it("the call still succeeds on the DNS answer whatever the homepage did", async () => {
    safeFetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const out = await run();
    expect(out.accepts_email).toBe(true);
    expect(out.email_provider).toBe("Google Workspace");
  });
});
