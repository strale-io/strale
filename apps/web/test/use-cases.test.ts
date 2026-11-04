// The use-case editorial file (src/content/use-cases.ts) checked against the
// repository's catalogue, so a renamed tool, a dropped example field or a missing
// human-in-the-loop line fails here before it fails a build. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { USE_CASES, resolveUseCases } from "../src/content/use-cases.ts";
import { loadPreview } from "../src/lib/load-preview.ts";
import type { ManifestExtras, SiteData } from "../src/lib/types.ts";

const repo = resolve(import.meta.dirname, "../../..");

function previewData(): SiteData {
  const p = loadPreview(repo);
  const manifests = new Map<string, ManifestExtras>();
  for (const c of p.capabilities) {
    const m = p.raw.get(c.slug) as Record<string, any>;
    manifests.set(c.slug, {
      output_field_reliability: m?.output_field_reliability ?? {},
      example_input: m?.test_fixtures?.known_answer?.input ?? m?.test_fixtures?.health_check_input ?? null,
      gdpr_art_22_classification: m?.gdpr_art_22_classification,
    });
  }
  return { mode: "manifests", source: "repository manifests", loaded_at: "", facts: p.facts, capabilities: p.capabilities, solutions: [], x402: p.x402, trust: new Map(), manifests, limitations: p.limitations, solutionLimitations: new Map() };
}

test("the launch set is the six jobs SITE-STRUCTURE.md §8 names, each with one to five steps", () => {
  assert.equal(USE_CASES.length, 6);
  assert.equal(new Set(USE_CASES.map((u) => u.slug)).size, USE_CASES.length);
  for (const u of USE_CASES) assert.ok(u.steps.length >= 1 && u.steps.length <= 5, u.slug);
});

test("every use case resolves against the repository catalogue: tools, example fields, prices", () => {
  const d = previewData();
  const resolved = resolveUseCases(d);
  assert.equal(resolved.length, USE_CASES.length);
  for (const u of resolved) {
    for (const s of u.steps.filter((x) => !x.bundle)) {
      assert.ok(s.available && s.priceCents !== null, `${u.slug}: ${s.slug}`);
      assert.ok(s.output && Object.keys(s.output).length > 0, `${u.slug}: ${s.slug} has an example output`);
    }
    // Preview builds hold no bundled checks: the step stays, marked unavailable, and the total is unknown.
    if (u.steps.some((s) => s.bundle)) assert.equal(u.totalCents, null, u.slug);
    else assert.equal(u.totalCents, u.steps.reduce((a, s) => a + (s.free ? 0 : s.priceCents!), 0), u.slug);
  }
});

test("a free tool counts as free in the cost per run", () => {
  const d = previewData();
  const checking = resolveUseCases(d).find((u) => u.slug === "checking-data")!;
  const free = new Set(d.facts.capability_counts.free_tier_slugs);
  for (const s of checking.steps) assert.equal(s.priceCents, free.has(s.slug) ? 0 : d.capabilities.find((c) => c.slug === s.slug)!.price_cents, s.slug);
});

test("a tool missing from the catalogue fails the build, naming the slug", () => {
  const d = previewData();
  const gone = { ...d, capabilities: d.capabilities.filter((c) => c.slug !== "google-search") };
  assert.throws(() => resolveUseCases(gone), /tool "google-search" is not a visible tool/);
});

test("a bundled check missing from a live catalogue fails the build, naming the slug", () => {
  const live: SiteData = { ...previewData(), mode: "live", source: "test" };
  assert.throws(() => resolveUseCases(live), /bundled check "(invoice-verify-uk|kyb-complete-uk)" is not in the live catalogue/);
});

test("a published-example field the tool does not publish fails the build", () => {
  const d = previewData();
  const capabilities = d.capabilities.map((c) => (c.slug === "academic-paper-search" ? { ...c, output_schema: { ...c.output_schema, example: { query: "x" } } } : c));
  assert.throws(() => resolveUseCases({ ...d, capabilities }), /"academic-paper-search"'s published example has no papers, returned/);
});

test("an illustrative field the tool's schema does not have fails the build", () => {
  const d = previewData();
  const capabilities = d.capabilities.map((c) => (c.slug === "ssl-check" ? { ...c, output_schema: { type: "object", properties: { valid: {} } } } : c));
  assert.throws(() => resolveUseCases({ ...d, capabilities }), /illustrative output for "ssl-check" uses domain, is_expired, days_until_expiry/);
});

test("a use case calling screening tools must say where the person stays in the loop", () => {
  const onboarding = USE_CASES.find((u) => u.slug === "onboarding")!;
  const human = onboarding.human;
  try {
    delete onboarding.human;
    assert.throws(() => resolveUseCases(previewData()), /use case "onboarding": calls .*sanctions-check/);
  } finally {
    onboarding.human = human;
  }
});
