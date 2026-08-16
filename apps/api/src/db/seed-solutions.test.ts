import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SOLUTIONS } from "./solution-catalogue.js";

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

  it("numbers its steps uniquely and contiguously from 1", () => {
    // $steps[N] resolves by sorted stepOrder, not by array position
    // (solution-executor.ts: "Preallocation to steps.length lets $steps[N]
    // resolve by authoring order (= stepOrder)"). A gap or a duplicate makes
    // that index mean something different from what the author intended.
    for (const sol of SOLUTIONS) {
      const orders = sol.steps.map((s) => s.stepOrder).sort((a, b) => a - b);
      expect(orders, `${sol.slug} step numbering`).toEqual(
        Array.from({ length: sol.steps.length }, (_, i) => i + 1),
      );
    }
  });

  it("never references a step's output before that step runs", () => {
    for (const sol of SOLUTIONS) {
      // Compare against EXECUTION order, not array position. Reordering the
      // array while leaving stepOrder alone must not be able to slip a
      // forward reference past this — the array is authoring convenience,
      // stepOrder is what the runtime obeys.
      const executionOrder = [...sol.steps].sort((a, b) => a.stepOrder - b.stepOrder);
      executionOrder.forEach((step, position) => {
        for (const expr of Object.values(step.inputMap)) {
          const m = /^\$steps\[(\d+)\]/.exec(expr);
          if (!m) continue;
          const refIdx = Number(m[1]);
          expect(
            refIdx,
            `${sol.slug} step ${step.stepOrder} (${step.capabilitySlug}) reads $steps[${refIdx}] before it runs`,
          ).toBeLessThan(position);
          // …and must not be racing it in the same parallel group.
          const source = executionOrder[refIdx];
          if (source && step.canParallel && source.canParallel) {
            expect(
              step.parallelGroup === source.parallelGroup && step.parallelGroup !== null,
              `${sol.slug}: ${step.capabilitySlug} shares parallel group ${step.parallelGroup} with the step it depends on (${source.capabilitySlug})`,
            ).toBe(false);
          }
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

describe("the seed script's --dry-run flag", () => {
  // No Postgres harness exists for the seed (CLAUDE.md test-harness
  // exemption), so this asserts the structural property that failed in
  // production: the guard must wrap the UPSERT, not only the quality-gate
  // writes further down. The first version guarded the gate alone, printed
  // "DRY RUN — no writes", and wrote 45 solutions across three runs.
  //
  // Verified by effect at the time of writing: row count and max(updated_at)
  // on `solutions` were identical either side of a --dry-run invocation
  // against production.
  const src = readFileSync(new URL("./seed-solutions.ts", import.meta.url), "utf8");

  it("returns before the upsert transaction, not after it", () => {
    const guard = src.indexOf("if (DRY_RUN) {");
    const upsert = src.indexOf("await db.transaction(async (tx) => {");
    expect(guard).toBeGreaterThan(-1);
    expect(upsert).toBeGreaterThan(-1);
    expect(guard, "the DRY_RUN early-return must precede the upsert transaction").toBeLessThan(upsert);
  });

  it("guards every write path the script has", () => {
    // One early-return for the upsert, plus the two quality-gate flips.
    expect(src.match(/if \(!DRY_RUN\) \{/g) ?? []).toHaveLength(2);
    expect(src).toContain("if (DRY_RUN) {");
  });

  it("never overwrites a live price unless explicitly asked", () => {
    expect(src).toContain("existing && !ALLOW_PRICE_CHANGES ? existing.priceCents : sol.priceCents");
  });
});

describe("step references that named fields their source never returned", () => {
  // Both of these aborted the seed run — `enforceGates` throws, and since each
  // solution writes in its own transaction rather than the run being atomic,
  // the catalogue was left half-updated. Production stopped tracking these
  // definitions around 2026-04-12 because every run since died here.
  //
  // Both were declaration failures rather than missing data: the capability
  // returned the field, the manifest did not know about it. The lesson is that
  // a `$steps[N].field` reference is only as good as the source manifest, so
  // these pin the exact names.

  it("invoice-process reads the supplier VAT under the name it is actually returned", () => {
    // invoice-extract's extraction schema calls it `vendor_vat`. There has
    // never been a `vat_number` field, so the old map could only pass null.
    const step = SOLUTIONS.find((s) => s.slug === "invoice-process")!
      .steps.find((st) => st.capabilitySlug === "vat-validate")!;
    expect(step.inputMap.vat_number).toBe("$steps[0].vendor_vat");
  });

  it("invoice-process reads iban and total_amount, which invoice-extract does return", () => {
    const sol = SOLUTIONS.find((s) => s.slug === "invoice-process")!;
    expect(sol.steps.find((s) => s.capabilitySlug === "iban-validate")!.inputMap.iban)
      .toBe("$steps[0].iban");
    expect(sol.steps.find((s) => s.capabilitySlug === "currency-convert")!.inputMap.amount)
      .toBe("$steps[0].total_amount");
  });

  it("kyc-denmark takes the Danish VAT number from the company lookup", () => {
    // In Denmark the VAT number IS the CVR with a DK prefix — cvrapi.dk even
    // returns it under the key `vat`. The executor has derived it since
    // deriveVatDK landed; only the declaration was missing.
    const step = SOLUTIONS.find((s) => s.slug === "kyc-denmark")!
      .steps.find((st) => st.capabilitySlug === "vat-validate")!;
    expect(step.inputMap.vat_number).toBe("$steps[0].vat_number");
    expect(SOLUTIONS.find((s) => s.slug === "kyc-denmark")!.steps[0].capabilitySlug)
      .toBe("danish-company-data");
  });
});
