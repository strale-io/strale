/**
 * social-profile-check after DEC-20261023-A (2026-10-24): developer-registry
 * names only — npm package, PyPI project, GitHub organisation — through each
 * registry's official API. No personal profile is requested, on any platform.
 *
 * The REGRESSION tests fail against the previous executor, which fetched
 * personal profile pages on TikTok, Reddit, YouTube, Pinterest, GitHub, npm
 * and PyPI, and turned any refusal into "exists: false".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { safeFetchMock } = vi.hoisted(() => ({ safeFetchMock: vi.fn() }));
vi.mock("../lib/safe-fetch.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/safe-fetch.js")>()),
  safeFetch: safeFetchMock,
}));

import { getDirectExecutor } from "./index.js";
import { STRALE_USER_AGENT } from "../lib/site-access.js";
import { isCapabilityRefusal } from "../lib/capability-refusal.js";
import "./social-profile-check.js";

type Profile = { platform: string; kind: string; exists: boolean | null; status_code: number | null; url: string };

let statusFor: (url: string) => number;

beforeEach(() => {
  safeFetchMock.mockReset();
  statusFor = () => 404;
  safeFetchMock.mockImplementation(async (url: string) => new Response("{}", { status: statusFor(String(url)) }));
});

async function check(username: string) {
  const r = await getDirectExecutor("social-profile-check")!({ username });
  return r as { output: Record<string, unknown>; provenance: Record<string, unknown> };
}

function requestedUrls(): string[] {
  return safeFetchMock.mock.calls.map(([u]) => String(u));
}

describe("what is asked, and of whom", () => {
  it("REGRESSION: requests only the three registry APIs — no social platform, no personal profile", async () => {
    await check("acme");
    const urls = requestedUrls();
    expect(urls.sort()).toEqual(
      [
        "https://api.github.com/orgs/acme",
        "https://pypi.org/pypi/acme/json",
        "https://registry.npmjs.org/acme",
      ].sort(),
    );
    for (const u of urls) {
      expect(u).not.toMatch(/tiktok|reddit|youtube|pinterest|\/~|\/user\/|github\.com\/acme$/);
    }
  });

  it("identifies as Strale on every request", async () => {
    await check("acme");
    for (const [, init] of safeFetchMock.mock.calls as Array<[string, { headers: Record<string, string> }]>) {
      expect(init.headers["User-Agent"]).toBe(STRALE_USER_AGENT);
    }
  });

  it("records the direct-API acquisition method", async () => {
    const r = await check("acme");
    expect(r.provenance.acquisition_method).toBe("direct_api");
  });
});

describe("answers", () => {
  it("200 is taken, 404 is not found; npm and PyPI 404s are available, a GitHub 404 is not", async () => {
    statusFor = (u) => (u.includes("registry.npmjs.org") ? 200 : 404);
    const r = await check("acme");
    const profiles = r.output.profiles as Profile[];
    expect(profiles.find((p) => p.platform === "npm")?.exists).toBe(true);
    expect(profiles.find((p) => p.platform === "PyPI")?.exists).toBe(false);
    expect(profiles.find((p) => p.platform === "GitHub")?.exists).toBe(false);
    expect(r.output.found_count).toBe(1);
    expect(r.output.not_found_count).toBe(2);
    // A GitHub 404 means "no organisation", and a personal account may hold
    // the name, so GitHub is never claimed as available.
    expect(r.output.available_platforms).toEqual(["PyPI"]);
  });

  it("REGRESSION: a refusal or rate limit is unknown, never 'does not exist'", async () => {
    statusFor = (u) => (u.includes("api.github.com") ? 403 : u.includes("pypi") ? 429 : 404);
    const r = await check("acme");
    const profiles = r.output.profiles as Profile[];
    expect(profiles.find((p) => p.platform === "GitHub")?.exists).toBeNull();
    expect(profiles.find((p) => p.platform === "PyPI")?.exists).toBeNull();
    expect(r.output.unknown_count).toBe(2);
    expect(r.output.available_platforms).toEqual(["npm"]);
  });

  it("a transport failure is unknown too", async () => {
    safeFetchMock.mockRejectedValue(new Error("fetch failed"));
    const r = await check("acme");
    expect((r.output.profiles as Profile[]).every((p) => p.exists === null)).toBe(true);
    expect(r.output.available_platforms).toEqual([]);
  });
});

describe("names", () => {
  it("a company name with spaces is checked as a hyphenated name (two solutions pass company_name)", async () => {
    const r = await check("Acme Corp");
    expect(r.output.username).toBe("Acme-Corp");
    expect(requestedUrls()).toContain("https://registry.npmjs.org/acme-corp");
  });

  it("drops a leading @", async () => {
    const r = await check("@acme");
    expect(r.output.username).toBe("acme");
  });

  it("a name invalid for one registry is skipped there, not refused", async () => {
    const r = await check("acme_tools");
    const gh = (r.output.profiles as Profile[]).find((p) => p.platform === "GitHub");
    expect(gh?.exists).toBeNull();
    expect(requestedUrls().some((u) => u.includes("api.github.com"))).toBe(false);
  });

  it("REGRESSION: real company names are normalised, not refused (they arrive from solutions)", async () => {
    // A first version refused anything with punctuation, which failed the
    // vendor-risk solution step for "Stripe, Inc." (independent review).
    for (const [input, expected] of [
      ["Stripe, Inc.", "Stripe-Inc"],
      ["AT&T", "AT-and-T"],
      ["H&M", "H-and-M"],
      ["Nestlé", "Nestle"],
      ["Klarna Bank AB (publ)", "Klarna-Bank-AB-publ"],
    ] as const) {
      const r = await check(input);
      expect(r.output.username, input).toBe(expected);
    }
  });

  it("refuses input with no letter or digit, as a recognised refusal", async () => {
    const err = await check("!!!").catch((e: unknown) => e);
    expect(isCapabilityRefusal(err)).toBe(true);
    await expect(getDirectExecutor("social-profile-check")!({})).rejects.toThrow(/'username' is required/);
  });
});
