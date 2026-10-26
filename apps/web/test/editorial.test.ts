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
import { FREE_TIER_DAILY_LIMIT, MIN_TOPUP_CENTS, MAX_PRICE_CAP_CENTS, TRIAL_CREDITS_CENTS, executorSource } from "../src/lib/code-facts.ts";
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
  for (const n of [FREE_TIER_DAILY_LIMIT, MIN_TOPUP_CENTS, MAX_PRICE_CAP_CENTS, TRIAL_CREDITS_CENTS]) assert.ok(Number.isInteger(n) && n > 0);
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
  const { accepts } = await import("../src/lib/company-data.ts");
  const tool = (input_schema: object, output_schema: object = {}) => ({ input_schema, output_schema }) as never;
  assert.equal(accepts(tool({ properties: { vat_number: {} }, required: ["vat_number"] })), "VAT number");
  assert.equal(accepts(tool({ properties: { registration_number: {}, company_name: {}, task: {} } })), "registration number or company name");
  assert.equal(accepts(tool({ properties: { org_number: {}, country: {} }, required: ["org_number", "country"] })), "org number and country");
  assert.equal(accepts(tool({ properties: { state: {}, company_name: {}, company_id: {}, deep: { type: "boolean" } }, required: ["state"] })), "state, plus company name or company ID");
});

test("Returns uses fields tools actually return, never availability flags", async () => {
  const { returns } = await import("../src/lib/company-data.ts");
  const t = { output_schema: { properties: { directors: {}, ubo_availability: {} } } } as never;
  // UK-like: ubo_availability says ownership is NOT available; it must not read as "Ownership".
  assert.deepEqual(returns(t, { company_name: "guaranteed", status: "guaranteed", registered_address: "common", ubo_availability: "guaranteed", ubo_availability_reason: "guaranteed" }), ["Name and number", "Status", "Address"]);
  // Canada-like: director_limits is not a list of officers.
  assert.deepEqual(returns(t, { company_name: "guaranteed", director_limits: "guaranteed" }), ["Name and number"]);
  // AU-like: state and postcode, not an address.
  assert.deepEqual(returns(t, { abn: "guaranteed", state: "common", postcode: "common" }), ["Name and number", "State and postcode"]);
  assert.deepEqual(returns(t, { name: "guaranteed", directors: "common", beneficial_owners: "rare" }), ["Name and number", "Officers"]);
});

test("use cases name real tools, and each sketch calls only tools its page lists", async () => {
  const { USE_CASES } = await import("../src/content/use-cases.ts");
  const { sketchSlugs } = await import("../src/lib/use-cases.ts");
  const { PACKAGES } = await import("../src/lib/snippets.ts");
  assert.equal(new Set(USE_CASES.map((u) => u.slug)).size, USE_CASES.length);
  for (const uc of USE_CASES) {
    assert.deepEqual(uc.steps.map((s) => s.slug).filter((s) => !slugs.has(s)), [], uc.slug);
    assert.ok(uc.steps.length >= 2 && uc.steps.length <= 5, `${uc.slug}: two to five tools (SITE-STRUCTURE page 8)`);
    assert.ok(uc.steps.some((s) => s.calls > 0), uc.slug);
    const code = uc.sketch(() => 7);
    const listed = new Set(uc.steps.filter((s) => s.calls > 0).map((s) => s.slug));
    assert.deepEqual(sketchSlugs(code).filter((s) => !listed.has(s)), [], `${uc.slug} sketch`);
    assert.ok(sketchSlugs(code).length > 0, uc.slug);
    assert.match(code, new RegExp(`from "${PACKAGES.typescript}"`), `${uc.slug} sketch imports the published TypeScript package`);
    assert.ok(!/max_price_cents: (?!7\b)\d/.test(code), `${uc.slug}: every cap comes from price()`);
  }
});

test("a use case that runs a screening tool says where a person stays in the loop", async () => {
  const { USE_CASES } = await import("../src/content/use-cases.ts");
  for (const uc of USE_CASES) {
    const screening = uc.steps.filter((s) => s.calls > 0).some((s) => {
      const m = parse(readFileSync(resolve(repo, "manifests", `${s.slug}.yaml`), "utf8")) as { gdpr_art_22_classification?: string };
      return m.gdpr_art_22_classification === "screening_signal" || m.gdpr_art_22_classification === "risk_synthesis";
    });
    if (screening) assert.ok(uc.human && uc.human.length > 40, uc.slug);
  }
});

test("use-case run cost counts free tools as free and needs every paid tool on x402 for a USD total", async () => {
  const { resolveUseCase } = await import("../src/lib/use-cases.ts");
  const cap = (slug: string, price_cents: number) => ({ slug, name: slug, description: "", category: "validation", price_cents, input_schema: null, output_schema: null, transparency_tag: "algorithmic", geography: null, data_source: null, is_free_tier: false });
  const d = {
    capabilities: [cap("email-validate", 3), cap("vat-validate", 2), cap("phone-validate", 2)],
    facts: { capability_counts: { free_tier_slugs: ["email-validate"] } },
    x402: { capabilities: [{ slug: "vat-validate", name: "", price_usd: 0.03, method: "POST", endpoint: "" }], solutions: [] },
    solutions: [],
    manifests: new Map(),
  } as never;
  const uc = { slug: "t", title: "t", summary: "", job: "check" as const, intro: "", example: { setup: "", run: [] }, sketch: () => "", steps: [{ slug: "email-validate", role: "", calls: 2 }, { slug: "vat-validate", role: "", calls: 1 }, { slug: "missing-tool", role: "", calls: 1 }] };
  const r = resolveUseCase(d, uc);
  assert.equal(r.runCents, 2);
  assert.equal(r.steps.length, 2, "a tool not in the catalogue is dropped");
  assert.equal(r.runUsd, 0.03, "a free tool not on x402 adds nothing to the x402 total");
  assert.deepEqual(r.freeOffX402.map((s) => s.tool.slug), ["email-validate"]);
  const r2 = resolveUseCase(d, { ...uc, steps: [...uc.steps, { slug: "phone-validate", role: "", calls: 1 }] });
  assert.equal(r2.runUsd, null, "a paid tool not on x402 rules the x402 route out");
  const r3 = resolveUseCase(d, { ...uc, steps: [...uc.steps, { slug: "phone-validate", role: "", calls: 0 }] });
  assert.equal(r3.runUsd, 0.03, "a listed tool outside the run does not affect the run's x402 total");
  // Over x402 free-tier tools are sold: when listed, they are counted.
  const d2 = { ...(d as object), x402: { capabilities: [{ slug: "vat-validate", name: "", price_usd: 0.03, method: "POST", endpoint: "" }, { slug: "email-validate", name: "", price_usd: 0.04, method: "POST", endpoint: "" }], solutions: [] } } as never;
  const r4 = resolveUseCase(d2, uc);
  assert.equal(Math.round(r4.runUsd! * 100) / 100, 0.11);
  assert.equal(r4.runCents, 2, "with a key the free tool is still not charged");
});

test("docs explain every error code the call routes return, and only real codes", async () => {
  const { ERROR_CODES, ERROR_STATUSES } = await import("../src/lib/code-facts.ts");
  const { ERROR_HELP } = await import("../src/content/docs.ts");
  assert.ok(ERROR_CODES.includes("insufficient_balance") && ERROR_CODES.includes("idempotency_key_reused"));
  assert.deepEqual(Object.keys(ERROR_HELP).filter((c) => !ERROR_CODES.includes(c)), []);
  const returned = [...ERROR_STATUSES].filter(([, s]) => s.length > 0).map(([c]) => c);
  assert.ok(returned.length >= 10, "the status scan found the call sites");
  assert.deepEqual(returned.filter((c) => !ERROR_HELP[c]), []);
  assert.deepEqual(ERROR_STATUSES.get("insufficient_balance"), [402]);
});

test("docs name only MCP tools the server registers, and only framework packages the integrity check verifies", async () => {
  const { MCP_TOOLS, FRAMEWORK_PACKAGES } = await import("../src/lib/code-facts.ts");
  const { MCP_TOOL_HELP, FRAMEWORK_LABEL } = await import("../src/content/docs.ts");
  assert.deepEqual(Object.keys(MCP_TOOL_HELP).filter((t) => !MCP_TOOLS.includes(t)), []);
  assert.ok(MCP_TOOLS.includes("strale_web3_assurance"), "tool names with digits are read");
  const { execFileSync } = await import("node:child_process");
  const out = execFileSync("node", ["apps/api/scripts/check-framework-packages.mjs"], { cwd: repo, encoding: "utf8" });
  const verified = [...out.matchAll(/^ok\s+(\S+)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(FRAMEWORK_PACKAGES.map((p) => p.dir), verified);
  assert.deepEqual(FRAMEWORK_PACKAGES.filter((p) => !FRAMEWORK_LABEL[p.dir]).map((p) => p.dir), []);
});

test("security labels cover every vendor role, cleared column and Article 22 class the code has", async () => {
  const { CONTENT_COLUMNS } = await import("../src/lib/code-facts.ts");
  const { VENDOR_ROLE, CONTENT_LABEL, ART22 } = await import("../src/content/security.ts");
  const facts = readFileSync(resolve(repo, "apps/api/src/lib/platform-facts.ts"), "utf8");
  const vendorBlock = facts.match(/vendors:\s*\{([\s\S]*?)\}\s*as const/)![1].replace(/\/\/.*$/gm, "");
  const roles = [...vendorBlock.matchAll(/^\s*([a-z0-9_]+):/gm)].map((m) => m[1]);
  assert.ok(roles.length > 5);
  assert.deepEqual(roles.filter((r) => !VENDOR_ROLE[r]), []);
  assert.ok(CONTENT_COLUMNS.includes("input") && CONTENT_COLUMNS.includes("output"));
  assert.deepEqual(CONTENT_COLUMNS.filter((c) => !CONTENT_LABEL[c]), []);
  const classes = new Set(readdirSync(resolve(repo, "manifests")).filter((f) => f.endsWith(".yaml")).map((f) => (parse(readFileSync(resolve(repo, "manifests", f), "utf8")) as { gdpr_art_22_classification?: string }).gdpr_art_22_classification ?? "data_lookup"));
  assert.deepEqual([...classes].filter((c) => !ART22[c]), []);
});
