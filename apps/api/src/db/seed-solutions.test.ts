import { describe, expect, it } from "vitest";
import { SOLUTIONS } from "./seed-solutions.js";

/**
 * Structural invariants over the bundle catalogue, checkable without a
 * database. The DB-backed gates (validateSolution) additionally verify every
 * `$steps[N].field` against the referenced capability's real output schema;
 * those run at seed time and were run by hand against production before these
 * definitions were committed.
 *
 * This file exists because importing the catalogue used to be impossible
 * without seeding it — `seed()` was called unconditionally at module load, so
 * any import wrote to whatever DATABASE_URL pointed at. The entry-point guard
 * added alongside these tests is what makes them possible, and the first test
 * here is the one that keeps it that way.
 */

const NEW_BUNDLES = ["competitor-read", "page-seo-check", "prospect-brief", "keyword-scout"];

describe("importing the catalogue is side-effect free", () => {
  it("exposes the definitions without having seeded anything", () => {
    // If this file ever seeds on import, this test still passes — but the
    // suite will hang or fail on a missing DATABASE_URL, which is the alarm.
    // The real guard is `invokedDirectly` in seed-solutions.ts.
    expect(Array.isArray(SOLUTIONS)).toBe(true);
    expect(SOLUTIONS.length).toBeGreaterThan(40);
  });
});

describe("every bundle, structurally", () => {
  /**
   * `token-project-dd` is declared twice, at very different prices (€2.00 with
   * five steps, €0.75 with six). Whichever the upsert reaches last silently
   * wins, and production currently matches neither — €0.62 over seven steps,
   * last written 2026-04-12. Found by this test on the day it was added.
   *
   * Not resolved here: picking the survivor is a pricing decision, which is
   * founder-gated, and production has drifted from both definitions so there
   * is no "restore the intended one" to fall back on. Named as a known
   * exception so this test still blocks the NEXT duplicate, and so the marker
   * does not disappear into a green suite.
   */
  const KNOWN_DUPLICATE = "token-project-dd";

  it("has no duplicate slugs beyond the one already known", () => {
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const s of SOLUTIONS) {
      if (seen.has(s.slug)) dupes.add(s.slug);
      seen.add(s.slug);
    }
    dupes.delete(KNOWN_DUPLICATE);
    expect([...dupes]).toEqual([]);
  });

  it("prices inside the €0.02–€1.00 band, except the deliberate multi-country compliance bundles", () => {
    // Pricing outside the band is founder-gated (charter § Authority), so a
    // new bundle drifting past €1.00 must be a conscious act, not an edit.
    const over = SOLUTIONS.filter((s) => s.priceCents > 100).map((s) => s.slug);
    for (const slug of NEW_BUNDLES) expect(over).not.toContain(slug);
  });

  it("never references a step's output before that step runs", () => {
    for (const sol of SOLUTIONS) {
      sol.steps.forEach((step, i) => {
        for (const expr of Object.values(step.inputMap)) {
          const m = /^\$steps\[(\d+)\]/.exec(expr);
          if (!m) continue;
          expect(
            Number(m[1]),
            `${sol.slug} step ${i + 1} (${step.capabilitySlug}) reads $steps[${m[1]}] before it runs`,
          ).toBeLessThan(i);
        }
      });
    }
  });

  it("only reads $input fields it declares", () => {
    for (const sol of SOLUTIONS) {
      const declared = Object.keys(
        (sol.inputSchema as { properties?: Record<string, unknown> }).properties ?? {},
      );
      for (const step of sol.steps) {
        for (const expr of Object.values(step.inputMap)) {
          const m = /^\$input\.([A-Za-z0-9_]+)/.exec(expr);
          if (!m) continue;
          expect(declared, `${sol.slug} (${step.capabilitySlug}) reads $input.${m[1]}`).toContain(m[1]);
        }
      }
    }
  });
});

describe("the growth bundles keep the shape that actually sells", () => {
  // lead-email-verify is the only bundle of the 98 built before 2026-08-16
  // that customers kept buying: 60 purchases, €0.20, three cheap steps,
  // 1.8× the component sum. Everything below is that shape, and these
  // assertions are what stop it drifting back toward the €1.54 bundle that
  // has never sold once.
  const bundles = NEW_BUNDLES.map((slug) => {
    const s = SOLUTIONS.find((x) => x.slug === slug);
    if (!s) throw new Error(`${slug} missing from SOLUTIONS`);
    return s;
  });

  it.each(bundles.map((b) => [b.slug, b] as const))("%s is narrow — at most four steps", (_slug, b) => {
    expect(b.steps.length).toBeGreaterThanOrEqual(3);
    expect(b.steps.length).toBeLessThanOrEqual(4);
  });

  it.each(bundles.map((b) => [b.slug, b] as const))("%s marks up ~1.8–2.0× over its parts", (_slug, b) => {
    const markup = b.priceCents / b.componentSumCents;
    expect(markup).toBeGreaterThanOrEqual(1.7);
    expect(markup).toBeLessThanOrEqual(2.1);
  });

  it("keeps three of the four at or under €0.30, the range that has sold", () => {
    const atProvenPrice = bundles.filter((b) => b.priceCents <= 30);
    expect(atProvenPrice).toHaveLength(3);
    // keyword-scout is deliberately above it, to find where the ceiling is.
    expect(SOLUTIONS.find((s) => s.slug === "keyword-scout")!.priceCents).toBe(55);
  });

  it("builds only from capabilities that were earning at the time of writing", () => {
    // Not an arbitrary allowlist: every slug here appeared in the top external
    // earners over the 30 days to 2026-08-16, or is a cheap zero-failure
    // component of one. A bundle assembled from things nobody buys is how the
    // first 98 happened.
    const earners = new Set([
      "google-search", "serp-analyze", "keyword-suggest", "email-validate",
      "email-deliverability-check", "tech-stack-detect", "domain-reputation",
      "meta-extract", "og-image-check", "page-speed-test", "url-health-check",
    ]);
    for (const b of bundles) {
      for (const step of b.steps) {
        expect(earners, `${b.slug} uses ${step.capabilitySlug}`).toContain(step.capabilitySlug);
      }
    }
  });

  it("prospect-brief chains from the resolved domain, exactly as the proven bundle does", () => {
    const b = bundles.find((x) => x.slug === "prospect-brief")!;
    expect(b.steps[0].capabilitySlug).toBe("email-validate");
    for (const step of b.steps.slice(1)) {
      expect(step.inputMap.domain).toBe("$steps[0].domain");
    }
  });
});
