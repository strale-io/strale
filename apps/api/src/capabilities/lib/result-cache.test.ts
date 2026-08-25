/**
 * Tests for the shared result cache and competitor-compare's key derivation.
 *
 * The clock is injected throughout — no `setTimeout`, no real waiting, so TTL
 * and eviction are exercised deterministically rather than approximately.
 */
import { describe, it, expect } from "vitest";
import { ResultCache } from "./result-cache.js";
import { comparisonCacheKey } from "../competitor-compare.js";

/** A controllable clock, so expiry is asserted rather than slept for. */
function clock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("ResultCache", () => {
  it("returns a miss for an unknown key", () => {
    const c = new ResultCache<string>({ ttlMs: 1000, maxEntries: 10 });
    expect(c.get("nope")).toBeNull();
  });

  it("serves a stored value inside the TTL, with the age it was actually held", () => {
    const k = clock();
    const c = new ResultCache<string>({ ttlMs: 1000, maxEntries: 10, now: k.now });

    c.set("a", "value");
    k.advance(400);

    const hit = c.get("a");
    expect(hit).not.toBeNull();
    expect(hit!.value).toBe("value");
    expect(hit!.ageMs).toBe(400);
  });

  it("reports cachedAt as the ORIGINAL write time, not the hit time", () => {
    // This is the field competitor-compare puts into provenance.fetched_at.
    // If it drifted to "now", every cache hit would claim it fetched the
    // sites at the moment of the hit — a false freshness statement.
    const k = clock(500_000);
    const c = new ResultCache<string>({ ttlMs: 10_000, maxEntries: 10, now: k.now });

    c.set("a", "v");
    k.advance(7_000);

    expect(c.get("a")!.cachedAt).toBe(500_000);
  });

  it("misses once the TTL has elapsed, and drops the entry on read", () => {
    const k = clock();
    const c = new ResultCache<string>({ ttlMs: 1000, maxEntries: 10, now: k.now });

    c.set("a", "value");
    k.advance(1001);

    expect(c.get("a")).toBeNull();
    // Deleted on read, not merely hidden — an expired value must be
    // unreachable even with no sweep running.
    expect(c.size).toBe(0);
  });

  it("serves right up to the TTL boundary and not past it", () => {
    const k = clock();
    const c = new ResultCache<string>({ ttlMs: 1000, maxEntries: 10, now: k.now });

    c.set("a", "v");
    k.advance(1000);
    expect(c.get("a")).not.toBeNull(); // exactly at TTL: still good

    c.set("b", "v");
    k.advance(1001);
    expect(c.get("b")).toBeNull();
  });

  it("evicts the oldest entry when full, keeping the cap", () => {
    const k = clock();
    const c = new ResultCache<string>({ ttlMs: 100_000, maxEntries: 2, now: k.now });

    c.set("a", "1"); k.advance(1);
    c.set("b", "2"); k.advance(1);
    c.set("c", "3");

    expect(c.size).toBe(2);
    expect(c.get("a")).toBeNull();
    expect(c.get("b")!.value).toBe("2");
    expect(c.get("c")!.value).toBe("3");
  });

  it("re-writing a key refreshes its position, so a hot key is not evicted first", () => {
    const k = clock();
    const c = new ResultCache<string>({ ttlMs: 100_000, maxEntries: 2, now: k.now });

    c.set("a", "1"); k.advance(1);
    c.set("b", "2"); k.advance(1);
    c.set("a", "1-again"); k.advance(1); // 'a' is now the newest
    c.set("c", "3");

    // 'b' was the oldest write at eviction time, so it goes — not 'a'.
    expect(c.get("b")).toBeNull();
    expect(c.get("a")!.value).toBe("1-again");
    expect(c.get("c")!.value).toBe("3");
  });

  it("sweep removes only expired entries and reports how many", () => {
    const k = clock();
    const c = new ResultCache<string>({ ttlMs: 1000, maxEntries: 10, now: k.now });

    c.set("old", "1");
    k.advance(1500);
    c.set("new", "2");

    expect(c.sweep()).toBe(1);
    expect(c.size).toBe(1);
    expect(c.get("new")).not.toBeNull();
  });
});

describe("comparisonCacheKey", () => {
  it("treats protocol, www, case and trailing slash as the same site", () => {
    const canonical = comparisonCacheKey("github.com", "gitlab.com");
    for (const [a, b] of [
      ["https://github.com", "https://gitlab.com"],
      ["http://www.GitHub.com/", "WWW.GitLab.com"],
      ["  GITHUB.COM  ", "gitlab.com///"],
    ]) {
      expect(comparisonCacheKey(a, b)).toBe(canonical);
    }
  });

  it("keys the reversed pair separately — a flipped hit would mislabel findings", () => {
    // The output labels one site company_a and the other company_b. Serving
    // (b,a) from the (a,b) entry would attribute every finding to the wrong
    // company: a wrong answer, not a stale one.
    expect(comparisonCacheKey("gitlab.com", "github.com"))
      .not.toBe(comparisonCacheKey("github.com", "gitlab.com"));
  });

  it("does not collide two different pairs", () => {
    expect(comparisonCacheKey("a.com", "b.com"))
      .not.toBe(comparisonCacheKey("a.com", "c.com"));
  });
});
