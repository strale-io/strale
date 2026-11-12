/**
 * isChallengeResponse decides whether safeFetch stops a page read at an
 * anti-bot interstitial (DEC-20261023-A, promise-audit T1 wave 3). Two things
 * must hold: a challenge is recognised with or without Cloudflare's header, and
 * a real page is left whole for the caller after the peek.
 */
import { describe, it, expect } from "vitest";
import { isChallengeResponse, looksLikeJsChallenge } from "./site-access.js";

const CHALLENGE =
  '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body>' +
  '<script>window._cf_chl_opt={cType:"managed"};</script>' +
  '<form action="/?__cf_chl_f_tk=abc" method="POST"></form></body></html>';

const ARTICLE =
  "<!DOCTYPE html><html><head><title>Robots in warehouses</title></head><body>" +
  "<p>Robots now move most parcels; this article is about robots.</p>" +
  "x".repeat(20_000) +
  "</body></html>";

function html(body: string, extra: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...extra } });
}

/** A body that arrives in several chunks, as a real network body does. */
function chunked(body: string, size = 512): Response {
  const bytes = new TextEncoder().encode(body);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/html" } });
}

describe("isChallengeResponse", () => {
  it("recognises Cloudflare's cf-mitigated header whatever the body", async () => {
    expect(await isChallengeResponse(html("<p>anything</p>", { "cf-mitigated": "challenge" }))).toBe(true);
  });

  it("recognises a challenge body without the header", async () => {
    expect(await isChallengeResponse(html(CHALLENGE))).toBe(true);
  });

  it("recognises a challenge body that arrives in chunks", async () => {
    expect(await isChallengeResponse(chunked(CHALLENGE, 16))).toBe(true);
  });

  it("does not flag an ordinary page that mentions robots", async () => {
    expect(await isChallengeResponse(html(ARTICLE))).toBe(false);
  });

  it("leaves the whole body readable for the caller after the peek", async () => {
    const response = chunked(ARTICLE);
    expect(await isChallengeResponse(response)).toBe(false);
    expect(await response.text()).toBe(ARTICLE);
  });

  it("does not read a non-HTML body", async () => {
    const response = new Response('{"__cf_chl_":1}', { headers: { "content-type": "application/json" } });
    expect(await isChallengeResponse(response)).toBe(false);
    expect(response.bodyUsed).toBe(false);
  });

  it("returns false for a body already consumed", async () => {
    const response = html(CHALLENGE);
    await response.text();
    expect(await isChallengeResponse(response)).toBe(false);
  });
});

describe("looksLikeJsChallenge", () => {
  it("is still exported from web-provider for existing importers", async () => {
    const mod = await import("../capabilities/lib/web-provider.js");
    expect(mod.looksLikeJsChallenge).toBe(looksLikeJsChallenge);
  });
});
