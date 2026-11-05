// Every path of today's strale.dev (strale-frontend src/App.tsx routes, src/data/learnGuides.ts and
// guides.ts slugs, public/sitemap.xml) must end in a page of the new site or a redirect to one
// (SWITCH-OVER-READINESS item 4). Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRedirects, resolveRedirect } from "../src/lib/redirects.ts";
import { EXCLUDED_PATHS, pagePaths } from "../src/lib/sitemap.ts";
import { loadPreview } from "../src/lib/load-preview.ts";
import { coverage } from "../src/lib/site-data.ts";

const web = resolve(import.meta.dirname, "..");
const rules = parseRedirects(readFileSync(resolve(web, "public/_redirects"), "utf8"));

// strale-frontend src/data/learnGuides.ts (49 slugs, served at /learn/:slug) and guides.ts (6, at /guides/:slug).
const LEARN = [
  "iban-validation-langchain-python", "iban-validation-pydantic-ai", "iban-validation-crewai", "vat-validation-python-agent",
  "vat-validation-openai-agents", "swift-bic-validation-agent", "iban-validation-mcp", "multi-currency-iban-validation",
  "financial-data-validation-pipeline", "eori-number-validation-agent", "swedish-company-lookup-agent", "uk-company-verification-agent",
  "german-company-data-agent", "kyb-workflow-crewai", "company-verification-multiple-countries", "beneficial-ownership-lookup-agent",
  "lei-code-lookup-agent", "vat-registration-check-agent", "company-data-openai-agents", "kyb-mcp-claude", "sanctions-check-langchain",
  "sanctions-check-pydantic-ai", "pep-check-ai-agent", "adverse-media-check-agent", "full-kyc-pipeline-python", "gdpr-compliance-check-agent",
  "eu-ai-act-classification-agent", "aml-screening-agent-workflow", "compliance-agent-strale-fallback", "kyc-mcp-cursor",
  "url-to-markdown-langchain", "dns-lookup-agent-python", "ssl-certificate-check-agent", "tech-stack-detection-agent",
  "domain-reputation-check-agent", "json-repair-ai-agent", "email-validation-langchain", "web-scraping-agent-anti-bot", "seo-audit-agent-python",
  "url-to-markdown-mcp", "strale-fallback-middleware-agent", "agent-resilience-patterns", "multi-step-due-diligence-agent",
  "strale-do-natural-language", "mcp-server-claude-code-setup", "mcp-server-cursor-setup", "strale-openai-agents-sdk",
  "audit-trail-compliance-agent", "google-adk-strale-agent",
];
const GUIDES = ["swedish-company-lookup-api", "norwegian-company-lookup-api", "vat-number-validation-api", "free-apis-for-ai-agents", "x402-pay-per-call-api", "sanctions-pep-adverse-media-comparison"];
// SITE-STRUCTURE.md section 11: pruned (deprecated packages, scraping framing) point at the closest guide or page.
const PRUNED_TO: Record<string, string> = {
  "iban-validation-pydantic-ai": "/guides/financial-data-validation-pipeline", "sanctions-check-pydantic-ai": "/guides/sanctions-check-langchain",
  "google-adk-strale-agent": "/docs/mcp", "vat-validation-openai-agents": "/guides/vat-validation-python-agent",
  "company-data-openai-agents": "/guides/company-verification-multiple-countries", "strale-openai-agents-sdk": "/docs/sdks",
  "web-scraping-agent-anti-bot": "/tools/web-extract",
};
const PRUNED = Object.keys(PRUNED_TO);
// Country guides stay built pages at /guides/<slug>, linked from their country page. The old /learn address
// points at the guide, not at the country page; the two /guides/ pages are live and get no rule.
const FOLDED_LEARN: Record<string, string> = { "swedish-company-lookup-agent": "sweden", "uk-company-verification-agent": "united-kingdom", "german-company-data-agent": "germany" };
const FOLDED_GUIDES: Record<string, string> = { "swedish-company-lookup-api": "sweden", "norwegian-company-lookup-api": "norway" };
// The guides the other lane is expected to build: every old slug minus the pruned and the folded.
const CARRY_OVER_LEARN = [
  "iban-validation-langchain-python", "iban-validation-crewai", "vat-validation-python-agent", "swift-bic-validation-agent", "iban-validation-mcp",
  "multi-currency-iban-validation", "financial-data-validation-pipeline", "eori-number-validation-agent", "kyb-workflow-crewai",
  "company-verification-multiple-countries", "beneficial-ownership-lookup-agent", "lei-code-lookup-agent", "vat-registration-check-agent",
  "kyb-mcp-claude", "sanctions-check-langchain", "pep-check-ai-agent", "adverse-media-check-agent", "full-kyc-pipeline-python",
  "gdpr-compliance-check-agent", "eu-ai-act-classification-agent", "aml-screening-agent-workflow", "compliance-agent-strale-fallback",
  "kyc-mcp-cursor", "url-to-markdown-langchain", "dns-lookup-agent-python", "ssl-certificate-check-agent", "tech-stack-detection-agent",
  "domain-reputation-check-agent", "json-repair-ai-agent", "email-validation-langchain", "seo-audit-agent-python", "url-to-markdown-mcp",
  "strale-fallback-middleware-agent", "agent-resilience-patterns", "multi-step-due-diligence-agent", "strale-do-natural-language",
  "mcp-server-claude-code-setup", "mcp-server-cursor-setup", "audit-trail-compliance-agent", ...Object.keys(FOLDED_LEARN),
];
const CARRY_OVER_GUIDES = [...Object.keys(FOLDED_GUIDES), "vat-number-validation-api", "free-apis-for-ai-agents", "x402-pay-per-call-api", "sanctions-pep-adverse-media-comparison"];
const CARRY_OVER = [...CARRY_OVER_LEARN, ...CARRY_OVER_GUIDES];
const COUNTRY_PATHS = ["sweden", "norway", "germany", "united-kingdom"].map((c) => `/company-data/${c}`);

/** A page the build emits: src/pages/<path>.astro or <path>/index.astro, or a generated family. */
function hasPage(path: string): boolean {
  if (path === "/") return true;
  const p = path.replace(/^\//, "");
  if (existsSync(resolve(web, "src/pages", `${p}.astro`)) || existsSync(resolve(web, "src/pages", p, "index.astro"))) return true;
  return /^\/(tools|solutions|use-cases)\/[^/]+$/.test(path) || COUNTRY_PATHS.includes(path);
}
// /guides is built in another lane: only the slugs listed above are expected there.
const planned = (path: string) => path === "/guides" || CARRY_OVER.some((s) => path === `/guides/${s}`);

function outcome(path: string): { kind: "page" | "rewrite" | "redirect" | "external" | "none"; to?: string } {
  const r = resolveRedirect(rules, path);
  if (r) {
    if (r.status === 200) return hasPage(r.to) ? { kind: "rewrite", to: r.to } : { kind: "none" };
    if (/^https:\/\//.test(r.to)) return { kind: "external", to: r.to };
    return hasPage(r.to) || planned(r.to) ? { kind: "redirect", to: r.to } : { kind: "none", to: r.to };
  }
  return hasPage(path) || planned(path) ? { kind: "page" } : { kind: "none" };
}

// Today's routes (App.tsx) with a representative slug for each parameter.
const OLD_PATHS: [string, string][] = [
  ["/", "page"], ["/topup", "page"], ["/integrations", "redirect"], ["/capabilities", "redirect"],
  ["/capabilities/iban-validate", "redirect"], ["/solutions", "redirect"], ["/solutions/kyb-essentials-se", "page"],
  ["/pricing", "page"], ["/docs", "page"], ["/security", "page"], ["/privacy", "page"], ["/terms", "page"],
  ["/signup", "page"], ["/trust", "redirect"], ["/trust/methodology", "redirect"], ["/design-system", "redirect"],
  ["/learn", "redirect"], ["/guides", "page"], ["/audit/0b7f2a9e-1c3d-4e5f-8a6b-7c8d9e0f1a2b", "rewrite"],
  ["/logo-explorations", "redirect"], ["/openapi.json", "external"],
];

test("every path of today's site resolves to a page, a rewrite or a redirect to a page", () => {
  for (const [path, kind] of OLD_PATHS) assert.equal(outcome(path).kind, kind, path);
});

test("all 49 /learn and 6 /guides slugs end in a built guide or the closest page, and a live guide is never redirected", () => {
  assert.equal(LEARN.length, 49);
  for (const s of LEARN) {
    const o = outcome(`/learn/${s}`);
    if (PRUNED_TO[s]) assert.deepEqual(o, { kind: "redirect", to: PRUNED_TO[s] }, s);
    else assert.deepEqual(o, { kind: "redirect", to: `/guides/${s}` }, s);
  }
  for (const s of GUIDES) {
    const o = outcome(`/guides/${s}`);
    assert.deepEqual(o, { kind: "page" }, s);
  }
});

test("the carry-over list is every old slug minus the pruned", () => {
  assert.equal(CARRY_OVER_LEARN.length, LEARN.length - PRUNED.length);
  assert.equal(CARRY_OVER_GUIDES.length, GUIDES.length);
  for (const s of CARRY_OVER_LEARN) assert.ok(LEARN.includes(s) && !PRUNED.includes(s), s);
  for (const s of CARRY_OVER_GUIDES) assert.ok(GUIDES.includes(s), s);
});

test("the country pages the guides fold into exist in the build's country list", () => {
  const preview = loadPreview(resolve(web, "../.."));
  const built = new Set(coverage({ capabilities: preview.capabilities, x402: preview.x402, facts: preview.facts, solutions: [] } as any).map((c) => `/company-data/${c.path}`));
  for (const p of COUNTRY_PATHS) assert.ok(built.has(p), p);
});

test("the redirect targets are the ones SITE-STRUCTURE.md names", () => {
  assert.deepEqual(outcome("/capabilities"), { kind: "redirect", to: "/tools" });
  assert.deepEqual(outcome("/capabilities/iban-validate"), { kind: "redirect", to: "/tools/iban-validate" });
  assert.deepEqual(outcome("/trust/methodology"), { kind: "redirect", to: "/security" });
  assert.deepEqual(outcome("/integrations"), { kind: "redirect", to: "/docs" });
  assert.deepEqual(outcome("/design-system"), { kind: "redirect", to: "/" });
  assert.deepEqual(outcome("/openapi.json"), { kind: "external", to: "https://api.strale.io/openapi.json" });
});

test("redirects are permanent and /audit/* is a rewrite that keeps the address", () => {
  for (const r of rules) assert.ok(r.status === 301 || (r.status === 200 && r.from === "/audit/*"), `${r.from} has status ${r.status}`);
  assert.deepEqual(resolveRedirect(rules, "/audit/abc"), { status: 200, to: "/audit" });
});

test("a line with no status code is read as Cloudflare reads it: a temporary redirect", () => {
  assert.equal(parseRedirects("/a /b")[0].status, 302);
});

test("no rule shadows any page the build emits", () => {
  const preview = loadPreview(resolve(web, "../.."));
  const d = { mode: "manifests", capabilities: preview.capabilities, x402: preview.x402, facts: preview.facts, solutions: [{ slug: "kyb-essentials-se", capabilities: [] }] } as any;
  const paths = [...pagePaths(d), ...EXCLUDED_PATHS];
  assert.ok(paths.length > 100);
  for (const p of paths) {
    const r = resolveRedirect(rules, p);
    assert.ok(!r, `${p} is redirected to ${r?.to}`);
  }
});

test("assets and headers that live URLs depend on ship in public/", () => {
  for (const f of ["apple-touch-icon.png", "og-image.png"]) assert.ok(existsSync(resolve(web, "public", f)), f);
  // favicon-32x32.png is the S mark, copied from the brand kit before every build (not tracked).
  assert.match(readFileSync(resolve(web, "scripts/prepare-assets.mjs"), "utf8"), /`\$\{marks\}\/favicon-32\.png`, "favicon-32x32\.png"/);
  const headers = readFileSync(resolve(web, "public/_headers"), "utf8");
  assert.match(headers, /Strict-Transport-Security: max-age=31536000\b/);
  // No includeSubDomains until every strale.io subdomain is confirmed HTTPS-only (DEC-20261105-A).
  assert.doesNotMatch(headers, /includeSubDomains/);
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /Referrer-Policy: strict-origin-when-cross-origin/);
  assert.doesNotMatch(headers, /Content-Security-Policy/);
  // The pages.dev hosts are noindex; the site's own host never is.
  assert.match(headers, /^https:\/\/:project\.pages\.dev\/\*\n  X-Robots-Tag: noindex$/m);
  assert.match(headers, /^https:\/\/:version\.:project\.pages\.dev\/\*\n  X-Robots-Tag: noindex$/m);
  const siteWide = headers.split(/\n(?=\S)/).find((b) => b.startsWith("/*\n"))!;
  assert.doesNotMatch(siteWide, /X-Robots-Tag/);
});
