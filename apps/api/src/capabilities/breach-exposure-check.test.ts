import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDirectExecutor } from "./index.js";
import { normalizeDomain, stripHtml, exposedCredentials } from "./breach-exposure-check.js";

const exec = getDirectExecutor("breach-exposure-check")!;

const ADOBE = [
  {
    Name: "Adobe",
    Title: "Adobe",
    Domain: "adobe.com",
    BreachDate: "2013-10-04",
    AddedDate: "2013-12-04T00:00:00Z",
    PwnCount: 152445165,
    Description: 'In October 2013, <a href="http://x">153 million</a> accounts were &quot;breached&quot;.',
    DataClasses: ["Email addresses", "Password hints", "Passwords", "Usernames"],
    IsVerified: true,
  },
  {
    Name: "Older",
    BreachDate: "2011-01-01",
    PwnCount: 100,
    DataClasses: ["Email addresses"],
    IsVerified: false,
    IsSpamList: true,
  },
];

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe("breach-exposure-check", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it("normalizes a domain out of a URL, an email, and a www prefix", () => {
    expect(normalizeDomain("https://www.Adobe.com/path?x=1")).toBe("adobe.com");
    expect(normalizeDomain("someone@Example.co.uk")).toBe("example.co.uk");
    expect(normalizeDomain("adobe.com.")).toBe("adobe.com");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(normalizeDomain("localhost")).toBeNull();
  });

  it("flattens HTML and entities out of a breach description", () => {
    expect(stripHtml(ADOBE[0].Description)).toBe('In October 2013, 153 million accounts were "breached".');
    expect(stripHtml(undefined)).toBeNull();
  });

  it("treats password, hint, token and card classes as credential exposure", () => {
    expect(exposedCredentials(["Email addresses"])).toBe(false);
    expect(exposedCredentials(["Email addresses", "Passwords"])).toBe(true);
    expect(exposedCredentials(["Auth tokens"])).toBe(true);
    expect(exposedCredentials(["PASSWORD HINTS"])).toBe(true);
  });

  // The refusal is the privacy guarantee: these inputs would be persisted on
  // the transaction record for 90 days, so they must never be accepted.
  it.each(["email", "password", "account"])("refuses a '%s' input before any upstream call", async (field) => {
    await expect(exec({ [field]: "x", domain: "adobe.com" })).rejects.toThrow(/is not accepted/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a missing or malformed domain before any upstream call", async () => {
    await expect(exec({})).rejects.toThrow(/'domain' is required/);
    await expect(exec({ domain: "nope" })).rejects.toThrow(/'domain' is required/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("summarizes breaches, sorts newest first, and counts credential exposure", async () => {
    fetchMock.mockResolvedValue(ok(ADOBE));
    const { output } = await exec({ domain: "https://www.adobe.com" });
    expect(output.domain).toBe("adobe.com");
    expect(output.breached).toBe(true);
    expect(output.breach_count).toBe(2);
    expect(output.credential_breach_count).toBe(1);
    expect(output.total_accounts_exposed).toBe(152445265);
    expect(output.most_recent_breach_date).toBe("2013-10-04");
    const breaches = output.breaches as Array<Record<string, unknown>>;
    expect(breaches[0].name).toBe("Adobe");
    expect(breaches[0].exposed_credentials).toBe(true);
    expect(breaches[1].is_spam_list).toBe(true);
    expect(breaches[1].is_verified).toBe(false);
  });

  it("reports a clean domain without claiming it is unknown", async () => {
    fetchMock.mockResolvedValue(ok([]));
    const { output } = await exec({ domain: "strale.dev" });
    expect(output.breached).toBe(false);
    expect(output.breach_count).toBe(0);
    expect(output.total_accounts_exposed).toBe(0);
    expect(output.most_recent_breach_date).toBeNull();
  });

  it("surfaces upstream rate limiting as retryable", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(exec({ domain: "adobe.com" })).rejects.toThrow(/rate-limiting/);
  });
});
