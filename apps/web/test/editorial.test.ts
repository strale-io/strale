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
  for (const m of manifests) if (companyDataPrefix(m.slug)) assert.equal(jobFor(m.slug, m.category), "company", m.slug);
});

test("every company-registry tool names its data source (evidence for claims.yaml official-records-company-data)", () => {
  const registries = manifests.filter((m) => companyDataPrefix(m.slug) !== null) as { slug: string; data_source?: string }[];
  assert.deepEqual(registries.filter((m) => !m.data_source || m.data_source.trim().length < 3).map((m) => m.slug), []);
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

test("snippet and description helpers handle the edge cases the review found", async () => {
  const { pyValue } = await import("../src/lib/snippets.ts");
  const { firstSentence } = await import("../src/lib/describe.ts");
  assert.equal(pyValue({ email: "null@example.com", ok: true, n: null }), '{\n    "email": "null@example.com",\n    "ok": True,\n    "n": None,\n}');
  assert.equal(firstSentence("Checks a VAT number, e.g. DE123. Then more."), "Checks a VAT number, e.g. DE123.");
});

test("company-data views describe registers in words", async () => {
  const { accepts, returns } = await import("../src/lib/company-data.ts");
  const tool = (input_schema: object, output_schema: object = {}) => ({ input_schema, output_schema }) as never;
  assert.equal(accepts(tool({ properties: { vat_number: {} }, required: ["vat_number"] })), "VAT number");
  assert.equal(accepts(tool({ properties: { registration_number: {}, company_name: {}, task: {} } })), "registration number or company name");
  assert.equal(accepts(tool({ properties: { org_number: {}, country: {} }, required: ["org_number", "country"] })), "org number and country");
  assert.deepEqual(returns(tool({}, { properties: { status: {} }, example: { registered_address: "x", directors: [] } })), ["Name and number", "Status", "Address", "Officers"]);
});
