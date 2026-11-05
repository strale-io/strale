// The guides (src/data/guides/*.md) checked against the repository: tools exist, packages exist,
// the example calls match the tools' inputs and prices, the index lists everything, and every old
// guide address is accounted for. Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";
import { GROUPS, indexGroups, loadGuides, parseBlocks, renderInline, resolveGuide, resolveTokens, guidesForCountry, type Block, type Guide } from "../src/lib/guides.ts";
import { FOLDED, OLD_GUIDES, OLD_LEARN, PRUNED, guideRedirects } from "../src/content/guide-fates.ts";
import { COUNTRY_BY_PREFIX } from "../src/content/countries.ts";
import { loadPreview } from "../src/lib/load-preview.ts";
import type { ManifestExtras, SiteData } from "../src/lib/types.ts";

const repo = resolve(import.meta.dirname, "../../..");
const guides = loadGuides();
const manifest = (slug: string) => parse(readFileSync(resolve(repo, "manifests", `${slug}.yaml`), "utf8")) as Record<string, any>;
const manifestSlugs = new Set(readdirSync(resolve(repo, "manifests")).filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, "")));

function previewData(): SiteData {
  const p = loadPreview(repo);
  const manifests = new Map<string, ManifestExtras>();
  for (const c of p.capabilities) {
    const m = p.raw.get(c.slug) as Record<string, any>;
    manifests.set(c.slug, { output_field_reliability: m?.output_field_reliability ?? {}, example_input: m?.test_fixtures?.known_answer?.input ?? m?.test_fixtures?.health_check_input ?? null, gdpr_art_22_classification: m?.gdpr_art_22_classification });
  }
  return { mode: "manifests", source: "repository manifests", loaded_at: "", facts: p.facts, capabilities: p.capabilities, solutions: [], x402: p.x402, trust: new Map(), manifests, limitations: p.limitations, solutionLimitations: new Map(), };
}

const blocks = (g: Guide): Block[] => g.sections.flatMap((s) => s.blocks);
const codeOf = (g: Guide) => blocks(g).flatMap((b) => (b.kind === "code" ? b.panels.map((p) => p.code) : []));
/** All prose of a guide: summary, steps, headings and non-code blocks. */
const proseOf = (g: Guide): string[] => [
  g.summary, ...g.steps,
  ...g.sections.flatMap((s) => [s.heading, ...s.blocks.flatMap((b): string[] => (b.kind === "p" || b.kind === "h3" ? [b.text] : b.kind === "ul" || b.kind === "ol" ? b.items : b.kind === "table" ? [...b.head, ...b.rows.flat()] : []))]),
];
const textOf = (g: Guide) => [g.title, g.description, ...proseOf(g), ...codeOf(g)].join("\n");

test("every guide has a unique slug, a known group, a one-line description and a short answer", () => {
  assert.ok(guides.length >= 40);
  assert.equal(new Set(guides.map((g) => g.slug)).size, guides.length);
  for (const g of guides) {
    assert.ok(GROUPS.some((x) => x.id === g.group), g.slug);
    assert.ok(g.description.length >= 40 && g.description.length <= 200, `${g.slug}: description length ${g.description.length}`);
    assert.ok(g.summary.length > 40, `${g.slug}: needs a short answer`);
    assert.ok(g.sections.length >= 2, g.slug);
    assert.ok(g.tools.length >= 1, g.slug);
  }
});

test("every guide renders: tokens resolve against the catalogue and no markup or token is left over", () => {
  const d = previewData();
  for (const g of guides) {
    const r = resolveGuide(g, d);
    const all = [r.summary, ...r.steps, ...r.sections.flatMap((s) => s.blocks.flatMap((b): string[] => (b.kind === "p" || b.kind === "h3" ? [b.text] : b.kind === "ul" || b.kind === "ol" ? b.items : b.kind === "table" ? [...b.head, ...b.rows.flat()] : b.panels.map((p) => p.code))))];
    for (const t of all) {
      assert.doesNotMatch(t, /\{\{\w+:[\w.-]+\}\}/, `${g.slug}: unresolved token in "${t.slice(0, 60)}"`);
      assert.ok(!/<script|<iframe|javascript:/i.test(renderInline(t)), g.slug);
    }
    assert.equal(r.toolRows.length, g.tools.length);
  }
});

test("a token that names a tool the catalogue lacks, or a free tool priced, fails the build", () => {
  const d = previewData();
  assert.throws(() => resolveTokens("{{price:no-such-tool}}", d, "t"), /not a visible tool/);
  assert.throws(() => resolveTokens("{{price:iban-validate}}", d, "t"), /free tool/);
  assert.match(resolveTokens("{{cost:iban-validate}} {{price:vat-validate}}", d, "t"), /^free €0\.02$/);
  assert.throws(() => resolveTokens("{{fact:nope}}", d, "t"), /unknown fact/);
});

test("every tool a guide names, and every /tools/ link in its text, is a manifest slug", () => {
  for (const g of guides) {
    for (const s of g.tools) assert.ok(manifestSlugs.has(s), `${g.slug}: tools: ${s}`);
    const links = [...textOf(g).matchAll(/\/tools\/([a-z0-9-]+)/g)].map((m) => m[1]);
    for (const s of links) assert.ok(manifestSlugs.has(s), `${g.slug}: links to /tools/${s}`);
    for (const slug of [...codeOf(g).join("\n").matchAll(/(?:capability_slug|slug)["']?\s*[:=]\s*["']([a-z0-9-]+)["']/g)].map((m) => m[1])) assert.ok(manifestSlugs.has(slug), `${g.slug}: code calls ${slug}`);
  }
});

// Packages -------------------------------------------------------------------------------------

function packageNames(): { all: Set<string>; deprecated: Set<string> } {
  const all = new Set<string>(), deprecated = new Set<string>();
  for (const dir of readdirSync(resolve(repo, "packages"))) {
    const base = resolve(repo, "packages", dir);
    let name: string | undefined;
    if (existsSync(resolve(base, "package.json"))) name = JSON.parse(readFileSync(resolve(base, "package.json"), "utf8")).name;
    else if (existsSync(resolve(base, "pyproject.toml"))) name = readFileSync(resolve(base, "pyproject.toml"), "utf8").match(/^name\s*=\s*"([^"]+)"/m)?.[1];
    if (!name) continue;
    all.add(name);
    if (existsSync(resolve(base, "DEPRECATED.md"))) deprecated.add(name);
  }
  return { all, deprecated };
}
/** Third-party packages the examples may install or import (frameworks and model clients). */
const THIRD_PARTY = new Set(["langchain-openai", "crewai", "pydantic-ai", "httpx", "openai", "viem", "@x402/core", "@x402/evm"]);
const normalise = (s: string) => s.replace(/_/g, "-");

/** Package names a guide installs (pip, npm, npx) or imports. */
export function namedPackages(code: string): string[] {
  const out: string[] = [];
  for (const m of code.matchAll(/(?:pip install|npm install|npm i)\s+([^\n]+)/g)) out.push(...m[1].trim().split(/\s+/).filter((t) => !t.startsWith("-")));
  for (const m of code.matchAll(/npx\s+(?:-y\s+)?([@\w./-]+)/g)) out.push(m[1]);
  for (const m of code.matchAll(/^\s*(?:from|import)\s+([\w.]+)/gm)) out.push(m[1].split(".")[0]);
  for (const m of code.matchAll(/from\s+["']([^"']+)["']/g)) out.push(m[1]);
  return out.map(normalise);
}

test("no guide names a package that is not under packages/, or one that is deprecated", () => {
  const { all, deprecated } = packageNames();
  const known = new Set([...all].map(normalise));
  const stdlibOrFramework = new Set(["os", "datetime", "json", "re", "time", "agents"]);
  let checked = 0;
  for (const g of guides) {
    for (const name of namedPackages(codeOf(g).join("\n"))) {
      checked++;
      if (/strale/.test(name)) assert.ok(known.has(name), `${g.slug}: names ${name}, which is not a package under packages/`);
      else assert.ok(THIRD_PARTY.has(name) || stdlibOrFramework.has(name), `${g.slug}: names ${name}, which is not a Strale package or a listed framework`);
      assert.ok(![...deprecated].map(normalise).includes(name), `${g.slug}: names deprecated package ${name}`);
    }
    // Prose and steps too: a Strale package name written in words.
    for (const m of proseOf(g).join("\n").matchAll(/`([\w@/.-]*strale[\w-]*)`/g)) {
      const n = normalise(m[1]);
      if (/^(strale-mcp|straleio|langchain-strale|crewai-strale)$/.test(n)) continue;
      if (/^strale_/.test(m[1]) || /^STRALE_/.test(m[1])) continue;
      assert.ok(known.has(n) && !deprecated.has(m[1]), `${g.slug}: prose names ${m[1]}`);
    }
  }
  assert.ok(checked > 40);
});

test("the package-name check catches an invented or deprecated package", () => {
  const { all, deprecated } = packageNames();
  const bad = namedPackages("# pip install straleio strale-fallback pydantic-ai-strale");
  assert.ok(bad.includes("strale-fallback") && !new Set([...all].map(normalise)).has("strale-fallback"));
  assert.ok([...deprecated].map(normalise).includes("pydantic-ai-strale") && bad.includes("pydantic-ai-strale"));
});

// Endpoints ------------------------------------------------------------------------------------

test("API paths in guides are routes the API mounts, and nothing from the deleted quality endpoints", () => {
  const app = readFileSync(resolve(repo, "apps/api/src/app.ts"), "utf8");
  const mounts = [...app.matchAll(/app\.route\("(\/[^"]+)"/g)].map((m) => m[1]);
  for (const g of guides) {
    const t = textOf(g);
    for (const m of t.matchAll(/(?:api\.strale\.io)?(\/(?:v1|x402)\/[\w/{}<>:.-]*)/g)) {
      const p = m[1].replace(/\/$/, "");
      if (p.startsWith("/x402")) continue;
      assert.ok(mounts.some((x) => p === x || p.startsWith(x + "/")), `${g.slug}: ${p} is not a mounted route`);
      assert.ok(!/\/quality|min_sqs|\/trust\//.test(p), `${g.slug}: ${p}`);
    }
  }
});

// Example calls --------------------------------------------------------------------------------

/** Each capability_slug in code with the keys of the inputs object that follows it. */
function calls(code: string): { slug: string; keys: string[]; ceiling: number | null; text: string }[] {
  const out: { slug: string; keys: string[]; ceiling: number | null; text: string }[] = [];
  for (const m of code.matchAll(/capability_slug["']?\s*[:=]\s*["']([a-z0-9-]+)["']/g)) {
    const rest = code.slice(m.index!, m.index! + 600);
    const at = rest.search(/inputs["']?\s*[:=]\s*/);
    let keys: string[] = [];
    if (at >= 0) {
      const open = rest.indexOf("{", at);
      let depth = 0, end = open;
      for (let i = open; i < rest.length; i++) {
        if (rest[i] === "{") depth++;
        if (rest[i] === "}" && --depth === 0) { end = i; break; }
      }
      const body = rest.slice(open + 1, end);
      keys = [...body.matchAll(/(?:^|[,{\s])["']?([a-z_]+)["']?\s*:/g)].map((k) => k[1]);
      // keys of nested objects are not inputs
      keys = depth === 0 && !body.includes("{") ? keys : keys.slice(0, 1);
    }
    const cap = rest.match(/max_price_cents["']?\s*[:=]\s*(\d+)/);
    out.push({ slug: m[1], keys, ceiling: cap ? Number(cap[1]) : null, text: rest });
  }
  return out;
}

test("example calls send inputs the tool's schema has, and every SDK call carries a price ceiling that covers the price", () => {
  const d = previewData();
  const price = new Map(d.capabilities.map((c) => [c.slug, c.price_cents]));
  let n = 0;
  for (const g of guides) {
    for (const block of codeOf(g)) for (const c of calls(block)) {
      n++;
      // Without a key, only free tools run and the ceiling is optional (docs: max_price_cents).
      const keyless = /curl/.test(block) && !/Authorization/.test(block);
      const props = Object.keys(manifest(c.slug).input_schema?.properties ?? {});
      for (const k of c.keys) assert.ok(props.includes(k), `${g.slug}: ${c.slug} has no input "${k}" (has ${props.join(", ")})`);
      if (keyless) continue;
      assert.ok(c.ceiling !== null, `${g.slug}: the call to ${c.slug} has no max_price_cents`);
      assert.ok(c.ceiling! >= (price.get(c.slug) ?? 0), `${g.slug}: ceiling ${c.ceiling} is below ${c.slug}'s price ${price.get(c.slug)}`);
    }
  }
  assert.ok(n > 15, `only ${n} calls checked`);
});

test("Python DoRequest calls always carry max_price_cents (the dataclass requires it)", () => {
  for (const g of guides) {
    for (const code of codeOf(g)) {
      for (const part of code.split("DoRequest(").slice(1)) {
        if (/^\s*$/.test(part.split("\n")[0]) || part.startsWith(")")) continue;
        const close = part.search(/\)\)?\s*(\.output)?\s*$|\n\)|\)\)/m);
        assert.match(part.slice(0, close > 0 ? close : 400), /max_price_cents/, `${g.slug}: DoRequest without max_price_cents`);
      }
    }
  }
});

// Content rules --------------------------------------------------------------------------------

test("catalogue facts are tokens: no price, count or retention period typed into prose", () => {
  for (const g of guides) {
    for (const t of [g.description, ...proseOf(g)]) {
      const plain = t.replace(/\{\{[^}]+\}\}/g, "").replace(/`[^`]*`/g, "");
      assert.doesNotMatch(plain, /[€$]\s?\d/, `${g.slug}: a price in "${plain.slice(0, 80)}"`);
      assert.doesNotMatch(plain, /\b\d{2,}\s+(tools|capabilities|countries|solutions|free calls|days)\b/i, `${g.slug}: a count in "${plain.slice(0, 80)}"`);
    }
  }
});

test("retired framing and deleted features stay out of the guides", () => {
  const banned = [/\bSQS\b/, /quality score/i, /trust layer/i, /min_sqs/, /free[- ]tier/i, /\bscrap(e|es|ing|ed|er|ers)\b/i, /anti-bot/i, /allabolag/i, /\bsign in\b/i, /Colorado AI Act/i, /immutable/i];
  for (const g of guides) for (const re of banned) assert.doesNotMatch(textOf(g), re, `${g.slug}: ${re}`);
});

test("guide text does not hard-code the site's address", () => {
  for (const g of guides) assert.doesNotMatch(textOf(g), /strale\.(dev|io)(?!\/(v1|x402|mcp|llms|openapi))/, g.slug);
});

test("screening guides keep a person in the loop", () => {
  for (const slug of ["sanctions-check-langchain", "pep-check-ai-agent", "adverse-media-check-agent", "full-kyc-pipeline-python", "aml-screening-agent-workflow", "compliance-agent-strale-fallback"]) {
    const g = guides.find((x) => x.slug === slug)!;
    assert.match(textOf(g), /person|human/i, slug);
    assert.match(textOf(g), /review|decid|verdict/i, slug);
  }
});

// Index, countries, old addresses --------------------------------------------------------------

test("the index lists every guide exactly once, under a group that exists", () => {
  const listed = indexGroups().flatMap((g) => g.guides.map((x) => x.slug));
  assert.deepEqual([...listed].sort(), guides.map((g) => g.slug).sort());
  assert.equal(new Set(listed).size, listed.length);
});

test("the carried guides are the old set minus the seven pruned", () => {
  const old = new Set<string>([...OLD_LEARN, ...OLD_GUIDES]);
  assert.equal(old.size, 55);
  assert.equal(Object.keys(PRUNED).length, 7);
  const carried = [...old].filter((s) => !Object.keys(PRUNED).includes(`/learn/${s}`));
  assert.deepEqual(carried.sort(), guides.map((g) => g.slug).sort());
});

test("folded country guides are linked from their country page data", () => {
  const isoByPath = new Map(Object.values(COUNTRY_BY_PREFIX).map((c) => [`/company-data/${c.path}`, c.iso]));
  for (const [from, f] of Object.entries(FOLDED)) {
    const iso = isoByPath.get(f.to);
    assert.ok(iso, `${from} -> ${f.to} is not a country page`);
    assert.ok(guidesForCountry(iso!).some((g) => g.slug === f.guide), `${f.guide} is not linked from ${f.to}`);
  }
});

test("every old guide address has a redirect or keeps its path, and every target exists", () => {
  const redirects = guideRedirects();
  const from = new Set(redirects.map((r) => r.from));
  for (const s of OLD_LEARN) assert.ok(from.has(`/learn/${s}`), s);
  const slugs = new Set(guides.map((g) => g.slug));
  const pages = new Set(["/guides", "/docs/mcp", "/docs/sdks", "/docs/x402"]);
  for (const r of redirects) {
    const t = r.to;
    const ok = pages.has(t) || (t.startsWith("/guides/") && slugs.has(t.slice(8))) || (t.startsWith("/tools/") && manifestSlugs.has(t.slice(7))) || (t.startsWith("/company-data/") && [...Object.values(COUNTRY_BY_PREFIX)].some((c) => t === `/company-data/${c.path}`));
    assert.ok(ok, `${r.from} -> ${t} does not exist`);
    assert.notEqual(r.from, r.to);
  }
  for (const s of OLD_GUIDES) assert.ok(from.has(`/guides/${s}`) || slugs.has(s) , s);
});

test("the parser reads the Markdown subset: tabs, tables, lists and questions", () => {
  const { summary, sections } = parseBlocks("Answer.\n\n## A\n\n```python One\nx\n```\n```bash Two\ny\n```\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n- one\n- two\n\n## Questions\n\n### Why?\n\nBecause.\n");
  assert.equal(summary, "Answer.");
  assert.equal(sections.length, 2);
  const kinds = sections[0].blocks.map((b) => b.kind);
  assert.deepEqual(kinds, ["code", "table", "ul"]);
  assert.equal((sections[0].blocks[0] as any).panels.length, 2);
  assert.throws(() => parseBlocks("## A\n\n```python\nnever closed"), /never closed/);
});
