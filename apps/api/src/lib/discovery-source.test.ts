/**
 * Attribution has to be honest about how much it knows.
 *
 * Measured 2026-08-15: 1 of 2,196 discovery hits carried a source. The fix
 * derives source from what callers actually send — but a derived source is
 * weaker evidence than a tag we placed ourselves, and the tests below exist to
 * stop that distinction from eroding. The failure this guards against is not
 * "no attribution"; it is *confident wrong* attribution, which is the same
 * class of error that produced five bad conclusions that day.
 */
import { describe, it, expect } from "vitest";
import { resolveDiscoverySource } from "./discovery-source.js";

describe("precedence: strongest evidence wins", () => {
  it("prefers our own tag over everything else", () => {
    const r = resolveDiscoverySource({
      src: "bazaar-submission", referer: "https://smithery.ai/x", userAgent: "glama/1.0",
    });
    expect(r).toEqual({ tag: "bazaar-submission", basis: "tagged" });
  });

  it("falls back to the referring site when we did not tag the link", () => {
    const r = resolveDiscoverySource({ referer: "https://smithery.ai/servers/strale", userAgent: "curl/8" });
    expect(r).toEqual({ tag: "smithery", basis: "referer" });
  });

  it("falls back to the crawler's identity when there is no referer", () => {
    expect(resolveDiscoverySource({ userAgent: "smithery-probe/0" }))
      .toEqual({ tag: "smithery", basis: "agent" });
  });
});

describe("it says 'unknown' rather than guessing", () => {
  it("returns null when nothing identifies the caller", () => {
    expect(resolveDiscoverySource({})).toBeNull();
    expect(resolveDiscoverySource({ userAgent: "python-requests/2.31" })).toBeNull();
  });

  it("ignores a malformed referer instead of storing junk", () => {
    expect(resolveDiscoverySource({ referer: "not a url" })).toBeNull();
  });

  it("never invents a catch-all bucket that would inflate one venue", () => {
    // A generic agent must not be silently attributed to whichever venue
    // happens to be first in the signature list.
    const r = resolveDiscoverySource({ userAgent: "Mozilla/5.0 generic" });
    expect(r).toBeNull();
  });
});

describe("referer matching is host-based, not substring-based", () => {
  it("does not let a URL path impersonate a known venue", () => {
    // The naive implementation greps the whole URL, so this would be
    // misattributed to GitHub — reassigning traffic to a venue that sent none.
    const r = resolveDiscoverySource({ referer: "https://evil.example/?next=github.com" });
    expect(r?.tag).not.toBe("github");
    expect(r?.tag).toBe("ref:evil.example");
  });

  it("keeps unrecognised referring hosts, because that is how we find new venues", () => {
    const r = resolveDiscoverySource({ referer: "https://some-new-directory.dev/list" });
    expect(r).toEqual({ tag: "ref:some-new-directory.dev", basis: "referer" });
  });
});

describe("stored values are bounded", () => {
  it("clips an over-long tag rather than storing it whole", () => {
    const r = resolveDiscoverySource({ src: "x".repeat(500) });
    expect(r!.tag.length).toBeLessThanOrEqual(64);
  });

  it("clips an over-long referring host too", () => {
    const host = "a".repeat(200) + ".com";
    const r = resolveDiscoverySource({ referer: `https://${host}/p` });
    expect(r!.tag.length).toBeLessThanOrEqual(64);
  });
});
