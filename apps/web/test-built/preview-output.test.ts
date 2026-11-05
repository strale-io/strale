// Checks over the built output of a PREVIEW build (STRALE_SITE_DATA=manifests npm run build), which
// is the only build that needs no production API. Run: npm run test:built, after the build.
// It fails, not skips, when dist/ is missing or was not built from manifests.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, relative } from "node:path";
import { EXCLUDED_PATHS, STATIC_PATHS, canonicalPath } from "../src/lib/sitemap.ts";

const dist = resolve(import.meta.dirname, "../dist");
assert.ok(existsSync(resolve(dist, "index.html")), "dist/ is missing: run STRALE_SITE_DATA=manifests npm run build first");
const site = (process.env.STRALE_SITE_URL ?? "https://strale.io").replace(/\/$/, "");

function htmlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = resolve(dir, e.name);
    return e.isDirectory() ? (e.name === "_astro" ? [] : htmlFiles(p)) : e.name.endsWith(".html") ? [p] : [];
  });
}
const pages = htmlFiles(dist).map((file) => ({ file, path: canonicalPath("/" + relative(dist, file)), html: readFileSync(file, "utf8") }));

test("the build is a preview build, and has pages of every family", () => {
  assert.match(pages.find((p) => p.path === "/")!.html, /Preview build/);
  for (const prefix of ["/tools/", "/company-data/", "/use-cases/", "/docs/"]) assert.ok(pages.some((p) => p.path.startsWith(prefix)), prefix);
});

test("every page's canonical is the sitemap's <loc> for it: no .html, /index is /", () => {
  for (const p of pages) {
    const canonical = p.html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    assert.equal(canonical, site + (p.path === "/" ? "/" : p.path), p.file);
    assert.doesNotMatch(canonical!, /\.html|\/index/);
    // A page that is not in the sitemap must be a family page or an excluded page.
    const known = STATIC_PATHS.includes(p.path) || EXCLUDED_PATHS.includes(p.path) || /^\/(tools|solutions|company-data|use-cases)\/[^/]+$/.test(p.path);
    assert.ok(known, `${p.path} is built but is neither in STATIC_PATHS, excluded, nor a known family`);
  }
});

test("a preview build carries no analytics and no search-console token, on any page", () => {
  for (const p of pages) {
    assert.doesNotMatch(p.html, /umami/i, p.file);
    assert.doesNotMatch(p.html, /<meta name="google-site-verification"/, p.file);
  }
});

test("a preview build is noindex on every page, and robots.txt and the sitemap block indexing", () => {
  for (const p of pages) assert.match(p.html, /<meta name="robots" content="noindex"/, p.file);
  assert.equal(readFileSync(resolve(dist, "robots.txt"), "utf8"), "User-agent: *\nDisallow: /\n");
  assert.doesNotMatch(readFileSync(resolve(dist, "sitemap.xml"), "utf8"), /<url>/);
});

test("pages carry the share image and the files Pages needs are in dist/", () => {
  const home = pages.find((p) => p.path === "/")!.html;
  assert.ok(home.includes(`<meta property="og:image" content="${site}/og-image.png"`));
  assert.match(home, /<meta name="twitter:card" content="summary_large_image"/);
  for (const f of ["_redirects", "_headers", "og-image.png", "apple-touch-icon.png", "favicon-32x32.png"]) assert.ok(existsSync(resolve(dist, f)), f);
});
