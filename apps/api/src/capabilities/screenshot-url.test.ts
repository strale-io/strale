/**
 * Regression test for the wait_for coercion bug surfaced by 2026-07 x402
 * traffic. A caller passed `wait_for:"3"` (a numeric string, meaning "wait 3
 * seconds") to screenshot-url; the executor routed every string into the
 * `waitForSelector` branch, so "3" was sent to Browserless as a CSS selector.
 * Browserless rejected it (HTTP 400). Only a real JS `number` ever reached the
 * intended `waitForTimeout` path.
 *
 * Post-fix: numeric strings and numbers both map to waitForTimeout (seconds →
 * ms, clamped 0..30); only non-numeric strings become selectors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../lib/url-validator.js", () => ({ validateUrl: vi.fn(async () => {}) }));

import {
  normalizeWaitFor,
  toV1WaitFor,
  isWaitKeyRejection,
  waitDialectByHost,
} from "./screenshot-url.js";
import { getDirectExecutor } from "./index.js";

describe("normalizeWaitFor", () => {
  it('treats a numeric string ("3") as a 3-second timeout, not a selector (the bug case)', () => {
    expect(normalizeWaitFor("3")).toEqual({ waitForTimeout: 3000 });
  });

  it("treats a JS number as seconds", () => {
    expect(normalizeWaitFor(2)).toEqual({ waitForTimeout: 2000 });
  });

  it("accepts fractional numeric strings", () => {
    expect(normalizeWaitFor("1.5")).toEqual({ waitForTimeout: 1500 });
  });

  it("treats a non-numeric string as a CSS selector", () => {
    expect(normalizeWaitFor("#main")).toEqual({
      waitForSelector: { selector: "#main", timeout: 10000 },
    });
  });

  it("clamps seconds to a 30s ceiling", () => {
    expect(normalizeWaitFor(120)).toEqual({ waitForTimeout: 30000 });
  });

  it("clamps negative seconds to 0", () => {
    expect(normalizeWaitFor(-5)).toEqual({ waitForTimeout: 0 });
  });

  it("returns null for empty / whitespace / undefined input", () => {
    expect(normalizeWaitFor(undefined)).toBeNull();
    expect(normalizeWaitFor("")).toBeNull();
    expect(normalizeWaitFor("   ")).toBeNull();
  });

  it("returns null for a non-finite number", () => {
    expect(normalizeWaitFor(NaN)).toBeNull();
    expect(normalizeWaitFor(Infinity)).toBeNull();
  });
});

/**
 * Regression tests for the Browserless v1 fallback (2026-08). The production
 * chromium service is pinned to Browserless v1 (`browserless/chrome:1.61.1`,
 * apps/api/railway-config.md), which Joi-rejects the v2 keys — first observed
 * as `"waitForSelector" is not allowed` pre-PR-148, then as
 * `"waitForTimeout" is not allowed` once PR #148 mapped numeric waits to the
 * other v2 key. v1 wants a single `waitFor` (number = ms, string = selector).
 */
describe("toV1WaitFor", () => {
  it("maps a v2 timeout directive to waitFor milliseconds", () => {
    expect(toV1WaitFor({ waitForTimeout: 3000 })).toEqual({ waitFor: 3000 });
  });

  /**
   * Security regression (Pass-A H-1). v1's handler branches on typeof: an
   * OBJECT goes to `page.waitForSelector`, but a bare STRING is interpolated
   * unescaped into `page.evaluate(...querySelector("<raw>"))` and then run as
   * `page.evaluate('(<raw>)()')` — caller-supplied JS inside the chromium
   * container. The object form is the only safe shape, and it also carries
   * the timeout a bare string has nowhere to put.
   */
  it("maps a v2 selector directive to the SAFE v1 object form, never a bare string", () => {
    const out = toV1WaitFor({ waitForSelector: { selector: "#main", timeout: 10000 } });
    expect(out).toEqual({ waitFor: { selector: "#main", timeout: 10000 } });
    expect(typeof out.waitFor).not.toBe("string");
  });

  it("keeps a JS-injection payload inside the object form (no evaluate path)", () => {
    const payload = '") || fetch("http://169.254.169.254/latest/meta-data";';
    const out = toV1WaitFor({ waitForSelector: { selector: payload, timeout: 10000 } });
    expect(out.waitFor).toEqual({ selector: payload, timeout: 10000 });
  });
});

describe("isWaitKeyRejection", () => {
  it("recognizes the v1 Joi rejection of waitForTimeout (the prod bug case)", () => {
    const body =
      '[{"message":"\\"waitForTimeout\\" is not allowed","path":["waitForTimeout"],"type":"object.unknown"}]';
    expect(isWaitKeyRejection(400, body)).toBe(true);
  });

  it("recognizes the v1 Joi rejection of waitForSelector", () => {
    const body = '[{"message":"\\"waitForSelector\\" is not allowed","path":["waitForSelector"]}]';
    expect(isWaitKeyRejection(400, body)).toBe(true);
  });

  /**
   * Captured live from production-sfo.browserless.io (v2) on 2026-08-05 by
   * POSTing the v1 `waitFor` shape. v2 uses ajv, not Joi, so it does NOT
   * emit the `"X" is not allowed` phrasing — matching only the Joi form
   * would strand a process that memoized v1 against a host later upgraded
   * to v2 (no retry, hard fail on every wait_for call until restart).
   */
  it("recognizes the REAL v2 ajv rejection of the v1 waitFor key (symmetry guard)", () => {
    expect(
      isWaitKeyRejection(400, "POST Body validation failed: must NOT have additional properties\n"),
    ).toBe(true);
  });

  it("does not match unrelated 400s (bad URL, nav timeout)", () => {
    expect(isWaitKeyRejection(400, "Navigation timeout of 25000 ms exceeded")).toBe(false);
  });

  it("does not match non-400 statuses", () => {
    expect(isWaitKeyRejection(500, '"waitForTimeout" is not allowed')).toBe(false);
  });
});

describe("executor v1 fallback", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
  const V1_REJECTION =
    '[{"message":"\\"waitForTimeout\\" is not allowed","path":["waitForTimeout"],"type":"object.unknown"}]';
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.BROWSERLESS_URL = "http://chromium.test:8080";
    process.env.BROWSERLESS_API_KEY = "test-token";
    waitDialectByHost.clear();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sentBody = (call: number): Record<string, unknown> =>
    JSON.parse(fetchMock.mock.calls[call][1].body as string);

  it("retries with v1 waitFor when the endpoint rejects waitForTimeout (the prod bug case)", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(V1_REJECTION, { status: 400 }))
      .mockResolvedValueOnce(new Response(PNG, { status: 200 }));

    const exec = getDirectExecutor("screenshot-url")!;
    const result = await exec({ url: "https://example.com/", wait_for: "3" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sentBody(0)).toMatchObject({ waitForTimeout: 3000 });
    expect(sentBody(1)).toMatchObject({ waitFor: 3000 });
    expect(sentBody(1)).not.toHaveProperty("waitForTimeout");
    expect((result.output as Record<string, unknown>).size_bytes).toBe(4);
    expect(waitDialectByHost.get("chromium.test:8080")).toBe("v1");
  });

  it("skips the probe once the host's dialect is memoized (no wasted roundtrip)", async () => {
    waitDialectByHost.set("chromium.test:8080", "v1");
    fetchMock.mockResolvedValueOnce(new Response(PNG, { status: 200 }));

    const exec = getDirectExecutor("screenshot-url")!;
    await exec({ url: "https://example.com/", wait_for: "3" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody(0)).toMatchObject({ waitFor: 3000 });
    expect(sentBody(0)).not.toHaveProperty("waitForTimeout");
  });

  it("memoizes v2 when the first v2-shaped call succeeds", async () => {
    fetchMock.mockResolvedValueOnce(new Response(PNG, { status: 200 }));

    const exec = getDirectExecutor("screenshot-url")!;
    await exec({ url: "https://example.com/", wait_for: "3" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sentBody(0)).toMatchObject({ waitForTimeout: 3000 });
    expect(waitDialectByHost.get("chromium.test:8080")).toBe("v2");
  });

  it("does not retry on unrelated 400s", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("Navigation timeout of 25000 ms exceeded", { status: 400 }),
    );

    const exec = getDirectExecutor("screenshot-url")!;
    await expect(exec({ url: "https://example.com/", wait_for: "3" })).rejects.toThrow(
      /HTTP 400.*Navigation timeout/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends a selector as the v1 object form on the retry (security regression)", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          '[{"message":"\\"waitForSelector\\" is not allowed","path":["waitForSelector"]}]',
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(new Response(PNG, { status: 200 }));

    const exec = getDirectExecutor("screenshot-url")!;
    await exec({ url: "https://example.com/", wait_for: "#main" });

    expect(sentBody(1)).toMatchObject({ waitFor: { selector: "#main", timeout: 10000 } });
    expect(typeof (sentBody(1) as { waitFor: unknown }).waitFor).not.toBe("string");
  });

  it("surfaces a framed error and does not memoize when both dialects are rejected", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(V1_REJECTION, { status: 400 }))
      .mockResolvedValueOnce(
        new Response("POST Body validation failed: must NOT have additional properties", {
          status: 400,
        }),
      );

    const exec = getDirectExecutor("screenshot-url")!;
    await expect(exec({ url: "https://example.com/", wait_for: "3" })).rejects.toThrow(
      /rejected both supported wait dialects/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(waitDialectByHost.has("chromium.test:8080")).toBe(false);
  });

  it("recovers when a memoized dialect goes stale (host upgraded to v2 under a warm process)", async () => {
    waitDialectByHost.set("chromium.test:8080", "v1");
    fetchMock
      .mockResolvedValueOnce(
        new Response("POST Body validation failed: must NOT have additional properties", {
          status: 400,
        }),
      )
      .mockResolvedValueOnce(new Response(PNG, { status: 200 }));

    const exec = getDirectExecutor("screenshot-url")!;
    await exec({ url: "https://example.com/", wait_for: "3" });

    expect(sentBody(0)).toMatchObject({ waitFor: 3000 });
    expect(sentBody(1)).toMatchObject({ waitForTimeout: 3000 });
    expect(waitDialectByHost.get("chromium.test:8080")).toBe("v2");
  });

  it("does not retry when no wait_for was requested", async () => {
    fetchMock.mockResolvedValueOnce(new Response("boom", { status: 500 }));

    const exec = getDirectExecutor("screenshot-url")!;
    await expect(exec({ url: "https://example.com/" })).rejects.toThrow(/HTTP 500/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
