// sitemap.xml, robots.txt and the Umami tag (SWITCH-OVER-READINESS items 5 and 7). Run: npm test.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { USE_CASES } from "../src/content/use-cases.ts";
import { loadPreview } from "../src/lib/load-preview.ts";
import { liveHead, UMAMI_WEBSITE_ID } from "../src/lib/analytics.ts";
import { EXCLUDED_PATHS, STATIC_PATHS, canonicalPath, pagePaths, renderRobots, renderSitemap, sitemapPaths } from "../src/lib/sitemap.ts";
import type { SiteData } from "../src/lib/types.ts";

const web = resolve(import.meta.dirname, "..");
const repo = resolve(web, "../..");

function data(mode: "live" | "manifests"): SiteData {
  const p = loadPreview(repo);
  return {
    mode, source: "test", loaded_at: "", facts: p.facts, capabilities: p.capabilities,
    solutions: [{ slug: "kyb-essentials-se", name: "KYB", capabilities: [] }] as any,
    x402: p.x402, trust: new Map(), manifests: new Map(), limitations: p.limitations, solutionLimitations: new Map(),
  };
}

test("the live sitemap lists every generated family and no excluded or preview page", () => {
  const paths = sitemapPaths(data("live"));
  assert.ok(paths.includes("/"));
  assert.ok(paths.some((p) => p.startsWith("/tools/")), "tool pages");
  assert.ok(paths.includes("/solutions/kyb-essentials-se"), "solution pages");
  assert.ok(paths.some((p) => p.startsWith("/company-data/")), "country pages");
  for (const u of USE_CASES) assert.ok(paths.includes(`/use-cases/${u.slug}`), u.slug);
  for (const p of EXCLUDED_PATHS) assert.ok(!paths.includes(p), p);
  assert.equal(new Set(paths).size, paths.length, "no duplicates");
  assert.ok(paths.every((p) => !/preview|noindex/.test(p)));
});

test("the not-found page is a built page that is excluded from the sitemap", () => {
  assert.ok(EXCLUDED_PATHS.includes("/404"));
  assert.ok(!STATIC_PATHS.includes("/404"));
  assert.ok(!pagePaths(data("live")).includes("/404"));
  assert.ok(existsSync(resolve(web, "src/pages/404.astro")));
});

test("a preview build lists nothing and robots.txt disallows everything", () => {
  assert.deepEqual(sitemapPaths(data("manifests")), []);
  const robots = renderRobots("manifests", "https://strale.dev");
  assert.match(robots, /^User-agent: \*\nDisallow: \/\n$/);
  assert.doesNotMatch(robots, /Allow|Sitemap/);
  assert.doesNotMatch(renderSitemap([], "https://strale.dev"), /<url>/);
});

test("the live robots.txt allows crawling and points at the configured site's sitemap", () => {
  const robots = renderRobots("live", "https://strale.dev/");
  assert.match(robots, /Allow: \//);
  assert.doesNotMatch(robots, /Disallow/);
  assert.match(robots, /Sitemap: https:\/\/strale\.dev\/sitemap\.xml\n$/);
  assert.match(renderSitemap(["/tools"], "https://strale.dev/"), /<loc>https:\/\/strale\.dev\/tools<\/loc>/);
});

test("every hand-written page is in the sitemap or deliberately excluded", () => {
  const found: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const e of readdirSync(resolve(web, "src/pages", dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`.replace(/^\//, ""), `${prefix}/${e.name}`);
      else if (e.name.endsWith(".astro") && !e.name.startsWith("[")) found.push(e.name === "index.astro" ? prefix || "/" : `${prefix}/${e.name.replace(/\.astro$/, "")}`);
    }
  };
  walk("", "");
  for (const p of found) assert.ok(STATIC_PATHS.includes(p) || EXCLUDED_PATHS.includes(p), `${p} is neither in the sitemap nor excluded`);
  for (const p of STATIC_PATHS) assert.ok(found.includes(p), `${p} is listed but no such page is built`);
});

test("every dynamic page family ([param].astro) is in the sitemap", () => {
  const paths = pagePaths(data("live"));
  const families: string[] = [];
  for (const e of readdirSync(resolve(web, "src/pages"), { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    if (readdirSync(resolve(web, "src/pages", e.name)).some((f) => /^\[.+\]\.astro$/.test(f))) families.push(e.name);
  }
  assert.ok(families.length >= 4, families.join());
  for (const f of families) assert.ok(paths.some((p) => p.startsWith(`/${f}/`)), `/${f}/[param] pages are built but not in the sitemap`);
});

test("canonicalPath turns the file-format paths into the sitemap's paths", () => {
  assert.equal(canonicalPath("/tools.html"), "/tools");
  assert.equal(canonicalPath("/tools/iban-validate.html"), "/tools/iban-validate");
  assert.equal(canonicalPath("/index.html"), "/");
  assert.equal(canonicalPath("/index"), "/");
  assert.equal(canonicalPath("/"), "/");
  assert.equal(canonicalPath("/tools"), "/tools");
});

test("live head: Umami tag with the strale-frontend website id, no query strings, own domain only", () => {
  assert.equal(liveHead("manifests", "https://strale.io").analytics, null);
  assert.equal(liveHead("manifests", "https://strale.io").verification, null);
  const a = liveHead("live", "https://strale.io").analytics!;
  assert.equal(a.src, "https://cloud.umami.is/script.js");
  assert.equal(a.websiteId, "9f534d25-6ff4-43e0-aa20-780c2e087db4");
  assert.equal(a.excludeSearch, "true");
  assert.equal(a.domains, "strale.io");
  assert.equal(UMAMI_WEBSITE_ID.length, 36);
  assert.ok(liveHead("live", "https://strale.io").verification);
});

test("preview builds are noindex; live pages are noindex only when they ask", () => {
  assert.equal(liveHead("manifests", "https://strale.io").noindex, true);
  assert.equal(liveHead("live", "https://strale.io").noindex, false);
  assert.equal(liveHead("live", "https://strale.io", true).noindex, true);
});

test("Base.astro renders the head only from liveHead (no literal tag, nothing unconditional)", () => {
  const base = readFileSync(resolve(web, "src/layouts/Base.astro"), "utf8");
  assert.doesNotMatch(base, /cloud\.umami|XQvx0pAg/);
  assert.match(base, /head\.analytics &&[^\n]*data-website-id/);
  assert.match(base, /head\.verification &&/);
  assert.match(base, /head\.noindex &&[^\n]*noindex/);
  assert.match(base, /data-exclude-search=\{head\.analytics\.excludeSearch\}/);
  assert.match(base, /data-domains=\{head\.analytics\.domains\}/);
  assert.match(base, /canonicalPath\(Astro\.url\.pathname\)/);
});
