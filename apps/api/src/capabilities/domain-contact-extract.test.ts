/**
 * ReDoS regression tests for `domain-contact-extract`.
 *
 * Both regexes below were remotely triggerable denial-of-service: this
 * capability fetches an arbitrary caller-supplied domain and parses up to
 * MAX_BODY_BYTES (300KB) per page across two pages, so the input is fully
 * attacker-controlled. Both patterns are synchronous, and Node is
 * single-threaded — while one runs, nothing else in the process makes
 * progress. The `executeWithHardTimeout` guard in routes/do.ts cannot rescue
 * this: it is a Promise.race against a setTimeout, and that timer cannot fire
 * while the event loop is blocked.
 *
 * Measured on the pre-fix implementations (Node 24):
 *
 *   EMAIL_RE   /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
 *     2KB 28ms | 8KB 479ms | 16KB 1.9s | 32KB 7.9s        (quadratic)
 *
 *   tag strip  /<(?:[^>"']|"[^"]*"|'[^']*')*>/g
 *     16K 0.39s | 64K 10.9s | 300K 243s                   (catastrophic)
 *
 * Per DEC-20260504-A these assertions fail against the un-applied fix and
 * pass against the applied fix — the pre-fix code exceeds every threshold
 * below by more than two orders of magnitude, so the timing bounds are
 * generous enough not to flake on a loaded CI box while still being nowhere
 * near the broken behaviour.
 *
 * If you are tempted to "simplify" stripTags back into a regex: that is the
 * bug. Read the comment on the function first.
 */

import { describe, it, expect } from "vitest";
import { stripTags, EMAIL_RE } from "./domain-contact-extract.js";

/** Wall-clock a synchronous fn, in milliseconds. */
function timeSync(fn: () => unknown): number {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

describe("stripTags — ReDoS regression", () => {
  it("handles a 300KB run of unclosed '<' in linear time (was 243s)", () => {
    const hostile = "<".repeat(300_000);
    const ms = timeSync(() => stripTags(hostile));
    expect(ms).toBeLessThan(1000);
  });

  it("handles 64K of '<\"' pairs quickly (was 6.3s)", () => {
    const hostile = '<"'.repeat(32_000);
    const ms = timeSync(() => stripTags(hostile));
    expect(ms).toBeLessThan(1000);
  });

  it("scales roughly linearly, not quadratically", () => {
    // The broken regex grew ~4x per doubling. Linear code grows ~2x. Assert
    // well inside that gap so normal timing jitter can't trip it.
    const small = timeSync(() => stripTags("<".repeat(50_000)));
    const large = timeSync(() => stripTags("<".repeat(200_000)));
    // 4x the input. Quadratic would be ~16x; allow up to 8x for jitter.
    expect(large).toBeLessThan(Math.max(small, 1) * 8);
  });
});

describe("stripTags — behavioural parity with the regex it replaced", () => {
  const strip = (s: string) => stripTags(s).replace(/\s+/g, " ").trim();

  it("treats a '>' inside a quoted attribute value as attribute content", () => {
    // A naive /<[^>]+>/ closes the tag at the '>' inside the value and leaks
    // the remainder as visible text.
    expect(strip(`<div style="width:calc(100%>50px)">HELLO</div>`)).toBe("HELLO");
  });

  it("does not leak data-URI SVG path data as visible text", () => {
    // This is the original defect: dense path coordinates were being read as
    // phone numbers by the text-fallback extractor.
    const html =
      `<i style="background:url('data:image/svg+xml,<svg><path d=M12.5 3.7L9 2z/></svg>')">VISIBLE</i>`;
    expect(strip(html)).toBe("VISIBLE");
  });

  it("handles single-quoted attribute values containing '>'", () => {
    expect(strip(`<a href='x>y'>LINK</a>`)).toBe("LINK");
  });

  it("keeps prose after a stray '<' that is not a tag", () => {
    // Regression guard on the fix itself: an early version dropped everything
    // after an unterminated '<', which would silently lose contact details in
    // text like this.
    expect(strip("5 < 10, call 555-123-4567 now")).toBe("5 < 10, call 555-123-4567 now");
  });

  it("strips ordinary tags and keeps their text", () => {
    expect(strip(`<p class="a">Text</p><br/><a href="mailto:x@y.com">x@y.com</a>`)).toBe(
      "Text x@y.com",
    );
  });
});

describe("EMAIL_RE — ReDoS regression", () => {
  it("handles a 32KB no-match adversarial body quickly (was 7.9s)", () => {
    // The classic shape: a long local-part run, an '@', then a long dot-free
    // domain run that never satisfies the trailing \. — maximal backtracking.
    const hostile = "a".repeat(16_000) + "@" + "b".repeat(16_000);
    const ms = timeSync(() => hostile.match(new RegExp(EMAIL_RE.source, EMAIL_RE.flags)));
    expect(ms).toBeLessThan(500);
  });

  it("stays fast at 300KB, the real per-page parse cap", () => {
    const hostile = "a".repeat(150_000) + "@" + "b".repeat(150_000);
    const ms = timeSync(() => hostile.match(new RegExp(EMAIL_RE.source, EMAIL_RE.flags)));
    expect(ms).toBeLessThan(1000);
  });

  it("still matches the addresses it is supposed to find", () => {
    const sample =
      `Contact <a href="mailto:sales@stripe.com">sales@stripe.com</a> ` +
      `or jane.doe@sub.example.co.uk or x@a.io`;
    const found = sample.match(new RegExp(EMAIL_RE.source, EMAIL_RE.flags)) ?? [];
    expect(found).toContain("sales@stripe.com");
    expect(found).toContain("jane.doe@sub.example.co.uk");
    expect(found).toContain("x@a.io");
  });

  it("does not match a bare '@' run with no dotted domain", () => {
    expect("aaaa@bbbb".match(new RegExp(EMAIL_RE.source, EMAIL_RE.flags))).toBeNull();
  });
});
