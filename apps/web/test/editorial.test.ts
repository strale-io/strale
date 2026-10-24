// Editorial files and helpers checked against the repository's manifests, so a
// new category, country or renamed tool fails here instead of silently dropping
// off a page. Run: npm test (node --test with type stripping).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { CATEGORY_GROUP, JOB_GROUPS, SLUG_GROUP, jobFor } from "../src/content/jobs.ts";
import { COUNTRY_BY_PREFIX, companyDataPrefix } from "../src/content/countries.ts";
import { deactivatedSlugs } from "../src/lib/load-preview.ts";
import { highlightJson, highlightShell, escapeHtml } from "../src/lib/highlight.ts";
import { FREE_TIER_DAILY_LIMIT, MIN_TOPUP_CENTS, MAX_PRICE_CAP_CENTS, executorSource } from "../src/lib/code-facts.ts";
import { formatEur, formatUsd, usdcAtomic } from "../src/lib/format.ts";

const repo = resolve(import.meta.dirname, "../../..");
const manifests = readdirSync(resolve(repo, "manifests"))
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => parse(readFileSync(resolve(repo, "manifests", f), "utf8")) as { slug: string; category: string });
const slugs = new Set(manifests.map((m) => m.slug));

test("every manifest category is placed in a job group", () => {
  const unplaced = [...new Set(manifests.map((m) => m.category))].filter((c) => !(c in CATEGORY_GROUP));
  assert.deepEqual(unplaced, []);
  for (const m of manifests) assert.ok(jobFor(m.slug, m.category), m.slug);
});

test("slug overrides and job examples name real tools", () => {
  assert.deepEqual(Object.keys(SLUG_GROUP).filter((s) => !slugs.has(s)), []);
  assert.deepEqual(JOB_GROUPS.flatMap((g) => g.examples).filter((s) => !slugs.has(s)), []);
  const ids = new Set(JOB_GROUPS.map((g) => g.id));
  for (const id of [...Object.values(CATEGORY_GROUP), ...Object.values(SLUG_GROUP)]) assert.ok(ids.has(id), id);
});

test("every company-registry tool maps to a country", () => {
  const prefixes = manifests.map((m) => companyDataPrefix(m.slug)).filter((p): p is string => p !== null);
  assert.ok(prefixes.length > 20);
  assert.deepEqual(prefixes.filter((p) => !COUNTRY_BY_PREFIX[p]), []);
  assert.equal(companyDataPrefix("us-company-data-cobalt"), "us");
  assert.equal(companyDataPrefix("company-enrich"), null);
});

test("the preview loader reads the API's deactivation list", () => {
  const off = deactivatedSlugs(readFileSync(resolve(repo, "apps/api/src/capabilities/auto-register.ts"), "utf8"));
  for (const s of ["keyword-suggest", "token-security-check", "wallet-risk-score"]) assert.ok(off.has(s), s);
});

test("highlighting escapes before it decorates", () => {
  const html = highlightJson(JSON.stringify({ "<k>": "<script>", n: 1, ok: true }));
  assert.ok(!html.includes("<script>"));
  assert.match(html, /<span class="tk-p">&quot;&lt;k&gt;&quot;<\/span>/);
  assert.match(html, /<span class="tk-n">1<\/span>/);
  assert.match(highlightShell("curl -X POST 'x<y'"), /tk-s">&#39;x&lt;y&#39;/);
  assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
});

test("code facts are read from the API source", () => {
  for (const n of [FREE_TIER_DAILY_LIMIT, MIN_TOPUP_CENTS, MAX_PRICE_CAP_CENTS]) assert.ok(Number.isInteger(n) && n > 0);
  assert.equal(executorSource("iban-validate"), "iban-validate:algorithmic");
});

test("money formatting follows the wire-shape rule (cents in, display out)", () => {
  assert.equal(formatEur(5), "€0.05");
  assert.equal(formatEur(250), "€2.50");
  assert.equal(formatUsd(0.0216), "$0.0216");
  assert.equal(usdcAtomic(0.0216), "21600");
});
