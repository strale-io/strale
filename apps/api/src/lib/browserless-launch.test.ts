/**
 * Per DEC-20260504-A: regression test for the Browserless v2 per-request
 * launch-args helper. Asserts both the encoding shape (so a future edit
 * can't silently swap to a broken format) and the URL builder shape (so
 * call sites importing it can rely on the contract).
 */

import { describe, expect, it } from "vitest";
import {
  BROWSERLESS_LAUNCH_ARGS,
  LAUNCH_QUERY_PARAM,
  buildBrowserlessRequestUrl,
  stripToken,
} from "./browserless-launch.js";

describe("BROWSERLESS_LAUNCH_ARGS", () => {
  it("contains the four flags required for Railway-hosted chromium to launch", () => {
    expect([...BROWSERLESS_LAUNCH_ARGS]).toEqual([
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-setuid-sandbox",
    ]);
  });
});

describe("LAUNCH_QUERY_PARAM", () => {
  it("is a base64-encoded JSON object with an `args` array equal to BROWSERLESS_LAUNCH_ARGS", () => {
    expect(LAUNCH_QUERY_PARAM.startsWith("launch=")).toBe(true);
    const base64 = LAUNCH_QUERY_PARAM.slice("launch=".length);
    const decoded = Buffer.from(base64, "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    expect(parsed).toEqual({ args: [...BROWSERLESS_LAUNCH_ARGS] });
  });

  it("does not contain raw special characters that would need URL-encoding (the whole point of base64)", () => {
    expect(LAUNCH_QUERY_PARAM).not.toMatch(/[{}",\[\]]/);
  });
});

describe("buildBrowserlessRequestUrl", () => {
  it("composes baseUrl + path + token + launch query in the canonical order", () => {
    const url = buildBrowserlessRequestUrl(
      "http://chromium.railway.internal:8080",
      "/content",
      "strale-browser-2026",
    );
    expect(url).toBe(
      "http://chromium.railway.internal:8080/content?token=strale-browser-2026&" +
        LAUNCH_QUERY_PARAM,
    );
  });

  it("URL-encodes tokens with reserved characters", () => {
    const url = buildBrowserlessRequestUrl(
      "https://example.com",
      "/content",
      "tok+with/special=chars",
    );
    expect(url).toContain("token=tok%2Bwith%2Fspecial%3Dchars");
    expect(url).toContain(LAUNCH_QUERY_PARAM);
  });

  it("works against the public hosted Browserless URL shape (regression for the post-flip rollback path)", () => {
    const url = buildBrowserlessRequestUrl(
      "https://production-sfo.browserless.io",
      "/content",
      "abc123",
    );
    expect(url).toBe(
      "https://production-sfo.browserless.io/content?token=abc123&" +
        LAUNCH_QUERY_PARAM,
    );
  });
});

describe("stripToken", () => {
  it("redacts ?token=<value> when token is the first query param", () => {
    const url = "https://production-sfo.browserless.io/content?token=secret123&launch=eyJhcmdzIjpbXX0=";
    expect(stripToken(url)).toBe(
      "https://production-sfo.browserless.io/content?token=<redacted>&launch=eyJhcmdzIjpbXX0=",
    );
  });

  it("redacts &token=<value> when token is not the first query param", () => {
    const url = "http://chromium.railway.internal:8080/content?launch=eyJhcmdzIjpbXX0=&token=secret123";
    expect(stripToken(url)).toBe(
      "http://chromium.railway.internal:8080/content?launch=eyJhcmdzIjpbXX0=&token=<redacted>",
    );
  });

  it("redacts URL-encoded tokens too (the encodeURIComponent path in buildBrowserlessRequestUrl)", () => {
    const url = buildBrowserlessRequestUrl(
      "http://chromium.railway.internal:8080",
      "/content",
      "tok+with/special=chars",
    );
    const stripped = stripToken(url);
    expect(stripped).not.toContain("tok%2Bwith");
    expect(stripped).not.toContain("tok+with");
    expect(stripped).toContain("token=<redacted>");
    // Launch payload must survive intact — it's the entire point of logging.
    expect(stripped).toContain(LAUNCH_QUERY_PARAM);
  });

  it("is a no-op on URLs with no token query param", () => {
    const url = "http://chromium.railway.internal:8080/content";
    expect(stripToken(url)).toBe(url);
  });

  it("redacts capitalised forms (Token=, TOKEN=) — exported helper must not silently miss case variants from upstream callers", () => {
    expect(stripToken("https://example.com/?Token=secret123")).toBe(
      "https://example.com/?Token=<redacted>",
    );
    expect(stripToken("https://example.com/?a=1&TOKEN=secret123")).toBe(
      "https://example.com/?a=1&TOKEN=<redacted>",
    );
  });

  it("preserves the launch payload so the base64 still decodes to the canonical Chrome flags (Phase 2 diagnostic contract)", () => {
    const built = buildBrowserlessRequestUrl(
      "http://chromium.railway.internal:8080",
      "/content",
      "strale-browser-2026",
    );
    const stripped = stripToken(built);
    const launchMatch = stripped.match(/launch=([^&]+)/);
    expect(launchMatch).not.toBeNull();
    const decoded = Buffer.from(launchMatch![1], "base64").toString("utf-8");
    const parsed = JSON.parse(decoded);
    expect(parsed).toEqual({ args: [...BROWSERLESS_LAUNCH_ARGS] });
  });
});
