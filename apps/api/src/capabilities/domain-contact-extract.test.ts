/**
 * Regression tests for `domain-contact-extract`.
 *
 * ## ReDoS (EMAIL_RE)
 *
 * This capability fetches an arbitrary caller-supplied domain and parses up
 * to MAX_BODY_BYTES (300KB) per page across two pages, so its input is fully
 * attacker-controlled. The pre-fix pattern
 *
 *     /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
 *
 * backtracked quadratically because its domain class contained the `.` that
 * the following `\.` also had to match. Measured on Node 24:
 * 2KB 28ms | 8KB 479ms | 16KB 1.9s | 32KB 7.9s.
 *
 * That is a remote DoS, not merely a slow path: the regex is synchronous and
 * Node is single-threaded, and `executeWithHardTimeout` in routes/do.ts is a
 * Promise.race against a setTimeout — a timer that cannot fire while the
 * event loop is blocked.
 *
 * Per DEC-20260504-A these assertions fail against the un-applied fix. Ran
 * the pre-fix regex against the thresholds below: 1956ms vs the 500ms limit.
 * Two orders of magnitude of headroom, so a loaded CI box will not flake it.
 *
 * ## Phone extraction
 *
 * `extractPhones` used to fall back to a visible-text digit heuristic when a
 * page had no `tel:` links. It shipped fabricated numbers on its first real
 * production call (see the note in the function). The fallback is gone; only
 * authoritative markup is trusted. These tests pin that boundary so it does
 * not get "helpfully" restored.
 *
 * A previous version of this file also tested a `stripTags` scanner that had
 * its own catastrophic-backtracking bug. That code existed only to feed the
 * text heuristic and was deleted along with it — a vulnerability in code that
 * no longer exists needs no regression test.
 */

import { describe, it, expect } from "vitest";
import { EMAIL_RE, extractPhones, decodeJsonUnicodeEscapes } from "./domain-contact-extract.js";

// Built from char codes so nothing in the toolchain can silently interpret the
// escape sequences this module exists to handle.
const BACKSLASH = String.fromCharCode(92);
const ESCAPED_GT = BACKSLASH + "u003e";
const ESCAPED_LT = BACKSLASH + "u003c";
const ESCAPED_NUL = BACKSLASH + "u0000";
const ESCAPED_EMOJI = BACKSLASH + "ud83d" + BACKSLASH + "ude00";
const EMOJI = String.fromCharCode(0xd83d, 0xde00);


function timeSync(fn: () => unknown): number {
  const t0 = process.hrtime.bigint();
  fn();
  return Number(process.hrtime.bigint() - t0) / 1e6;
}

const fresh = () => new RegExp(EMAIL_RE.source, EMAIL_RE.flags);

describe("EMAIL_RE — ReDoS regression", () => {
  it("handles a 32KB no-match adversarial body quickly (pre-fix: 7.9s)", () => {
    // Long local-part run, an '@', then a long dot-free domain run that never
    // satisfies the trailing \. — maximal backtracking for the old pattern.
    const hostile = "a".repeat(16_000) + "@" + "b".repeat(16_000);
    expect(timeSync(() => hostile.match(fresh()))).toBeLessThan(500);
  });

  it("stays fast at 300KB, the real per-page parse cap", () => {
    const hostile = "a".repeat(150_000) + "@" + "b".repeat(150_000);
    expect(timeSync(() => hostile.match(fresh()))).toBeLessThan(1000);
  });

  it("scales linearly, not quadratically", () => {
    const small = timeSync(() => ("a".repeat(25_000) + "@" + "b".repeat(25_000)).match(fresh()));
    const large = timeSync(() => ("a".repeat(100_000) + "@" + "b".repeat(100_000)).match(fresh()));
    // 4x the input. Quadratic would be ~16x; allow 8x for timing jitter.
    expect(large).toBeLessThan(Math.max(small, 1) * 8);
  });

  it("still matches the addresses it is supposed to find", () => {
    const sample =
      `Contact <a href="mailto:sales@stripe.com">sales@stripe.com</a> ` +
      `or jane.doe@sub.example.co.uk or x@a.io`;
    const found = sample.match(fresh()) ?? [];
    expect(found).toContain("sales@stripe.com");
    expect(found).toContain("jane.doe@sub.example.co.uk");
    expect(found).toContain("x@a.io");
  });

  it("does not match an '@' run with no dotted domain", () => {
    expect("aaaa@bbbb".match(fresh())).toBeNull();
  });
});

describe("extractPhones — authoritative markup only", () => {
  it("extracts tel: links", () => {
    const html = `<a href="tel:+46812345678">Call us</a>`;
    expect(extractPhones(html)).toEqual(["+46812345678"]);
  });

  it("URL-decodes and dedupes tel: links", () => {
    const html = `<a href="tel:%2B46%20812%20345%20678">a</a><a href="tel:%2B46%20812%20345%20678">b</a>`;
    expect(extractPhones(html)).toEqual(["+46 812 345 678"]);
  });

  it("extracts schema.org telephone from JSON-LD", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Organization","name":"Acme","telephone":"+1-555-123-4567"}
    </script>`;
    expect(extractPhones(html)).toContain("+1-555-123-4567");
  });

  it("finds telephone nested inside JSON-LD sub-objects", () => {
    const html = `<script type="application/ld+json">
      {"@type":"Organization","contactPoint":{"@type":"ContactPoint","telephone":"+44 20 7946 0958"}}
    </script>`;
    expect(extractPhones(html)).toContain("+44 20 7946 0958");
  });

  it("extracts microdata telephone in both element and meta form", () => {
    expect(extractPhones(`<span itemprop="telephone">+61 2 9374 4000</span>`)).toContain(
      "+61 2 9374 4000",
    );
    expect(extractPhones(`<meta itemprop="telephone" content="+81 3 6367 6000">`)).toContain(
      "+81 3 6367 6000",
    );
  });

  it("survives malformed JSON-LD without throwing", () => {
    const html = `<script type="application/ld+json">{ not valid json </script>
                  <a href="tel:+15551234567">x</a>`;
    expect(extractPhones(html)).toEqual(["+15551234567"]);
  });

  it("rejects values outside the ITU-T E.164 7-15 digit range", () => {
    expect(extractPhones(`<a href="tel:12345">x</a>`)).toEqual([]);
    expect(extractPhones(`<a href="tel:+1234567890123456789">x</a>`)).toEqual([]);
  });

  // The regression that motivated removing the heuristic. Every case below is
  // digit noise of the kind that reaches this function after a bot-served,
  // mid-document-truncated page — and every one was previously returned as a
  // phone number.
  describe("returns nothing rather than inventing numbers", () => {
    const noise: Array<[string, string]> = [
      ["the exact prod false positives", "<p>72-9098-2766 and 24155-3298-4</p>"],
      ["SVG path coordinates", `<p>M12.5 3.7 L9 2 24155 3298 4</p>`],
      ["a decimal-looking number", "<p>41056.391</p>"],
      ["an order/tracking id", "<p>Order 1234567890123</p>"],
      ["hyphenated non-phone digits", "<p>2024-08-09-114523</p>"],
      ["plain visible text digits", "<p>Call 555 123 4567 today</p>"],
    ];
    for (const [label, html] of noise) {
      it(label, () => {
        expect(extractPhones(html)).toEqual([]);
      });
    }
  });

  it("still returns tel: links even when digit noise is present alongside", () => {
    const html = `<p>72-9098-2766</p><a href="tel:+46812345678">real</a>`;
    expect(extractPhones(html)).toEqual(["+46812345678"]);
  });
});

describe("decodeJsonUnicodeEscapes", () => {
  const emails = (s: string) => s.match(new RegExp(EMAIL_RE.source, EMAIL_RE.flags)) ?? [];

  it("fixes the exact production failure", () => {
    // Railway (US East) is served the escaped form immediately before the
    // address; the same URL fetched from Sweden has a literal ">".
    const html = "<p>" + ESCAPED_GT + "sales@stripe.com</p>";

    // Without decoding, the bug reproduces — this is what shipped to prod.
    expect(emails(html)).toEqual(["u003esales@stripe.com"]);

    // With decoding, the address is clean.
    expect(emails(decodeJsonUnicodeEscapes(html))).toEqual(["sales@stripe.com"]);
  });

  it("is a no-op on content with no escapes", () => {
    const plain = '<a href="mailto:sales@stripe.com">sales@stripe.com</a>';
    expect(decodeJsonUnicodeEscapes(plain)).toBe(plain);
  });

  it("decodes several escapes in one pass", () => {
    const html = ESCAPED_LT + "div" + ESCAPED_GT + "hi" + ESCAPED_LT + "/div" + ESCAPED_GT;
    expect(decodeJsonUnicodeEscapes(html)).toBe("<div>hi</div>");
  });

  it("leaves C0 control escapes encoded", () => {
    expect(decodeJsonUnicodeEscapes(ESCAPED_NUL)).toBe(ESCAPED_NUL);
  });

  it("decodes surrogate pairs back into the original character", () => {
    expect(decodeJsonUnicodeEscapes(ESCAPED_EMOJI)).toBe(EMOJI);
  });

  it("ignores malformed escapes", () => {
    const malformed = BACKSLASH + "u12";
    expect(decodeJsonUnicodeEscapes(malformed)).toBe(malformed);
  });
});
