// Review pass over a built site (dist/): full-page screenshots at 1440 and 390
// in light and dark, an axe-core accessibility scan of each, and a check that
// nothing scrolls sideways. Writes review/<out>/report.json and the screenshots.
//
//   node scripts/review.mjs [--pages /,/tools] [--out review/latest] [--playwright path/to/playwright]
//
// Needs a Playwright with Chromium (not a dependency of the site; CI and the
// cloud sandbox provide one). Exits 1 if any page has an axe violation or
// horizontal overflow.
import { createServer } from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(web, "dist");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const require = createRequire(import.meta.url);
const pwPath = arg("playwright", process.env.PLAYWRIGHT_PATH);
const { chromium } = pwPath ? require(resolve(pwPath)) : require("playwright");
const axeSource = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const out = resolve(web, arg("out", "review/latest"));
const { REVIEW_PAGES } = await import("./review-pages.mjs");
const pages = arg("pages", REVIEW_PAGES.join(",")).split(",");

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".ttf": "font/ttf", ".ico": "image/x-icon", ".json": "application/json", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml" };

// Serves dist/ the way Cloudflare Pages does for build.format "file": /tools/x → tools/x.html.
function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const candidates = clean === "/" ? ["index.html"] : [clean.slice(1), `${clean.slice(1)}.html`, `${clean.slice(1)}/index.html`];
  for (const c of candidates) {
    const p = join(dist, c);
    if (p.startsWith(dist) && existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}
const server = createServer((req, res) => {
  const file = resolveFile(req.url ?? "/");
  if (!file) {
    res.writeHead(404, { "content-type": "text/html" });
    const notFound = join(dist, "404.html");
    return existsSync(notFound) ? createReadStream(notFound).pipe(res) : res.end("not found");
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const VIEWPORTS = [{ name: "desktop-1440", width: 1440, height: 900 }, { name: "mobile-390", width: 390, height: 844 }];
const THEMES = ["light", "dark"];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const report = { built_from: existsSync(join(dist, "index.html")) ? "dist" : null, generated_at: new Date().toISOString(), pages: [] };
let failures = 0;

for (const path of pages) {
  const slug = path === "/" ? "home" : path.replace(/^\//, "").replace(/\//g, "-");
  for (const vp of VIEWPORTS) {
    for (const theme of THEMES) {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: theme, reducedMotion: "reduce" });
      const page = await context.newPage();
      const consoleErrors = [];
      page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
      page.on("pageerror", (e) => consoleErrors.push(String(e)));
      const resp = await page.goto(base + path, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      await page.addScriptTag({ content: axeSource });
      const axe = await page.evaluate(async () => {
        // eslint-disable-next-line no-undef
        const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"] } });
        return { violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 5).map((n) => ({ target: n.target.join(" "), summary: n.failureSummary })) })), passes: r.passes.length, incomplete: r.incomplete.map((v) => ({ id: v.id, nodes: v.nodes.length })) };
      });
      const shot = `${slug}--${vp.name}-${theme}.jpg`;
      await page.screenshot({ path: join(out, shot), fullPage: true, type: "jpeg", quality: 72 });
      const entry = { path, viewport: vp.name, theme, status: resp?.status(), overflow_px: overflow, console_errors: consoleErrors, axe, screenshot: shot };
      if (axe.violations.length || overflow > 0 || consoleErrors.length || resp?.status() !== 200) failures++;
      report.pages.push(entry);
      console.log(`${axe.violations.length || overflow > 0 || consoleErrors.length ? "FAIL" : "ok  "} ${path} ${vp.name} ${theme}: ${axe.violations.length} axe violations (${axe.violations.map((v) => v.id).join(", ")}), ${axe.passes} rule passes, overflow ${overflow}px, ${consoleErrors.length} console errors`);
      await context.close();
    }
  }
}
await browser.close();
server.close();
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
console.log(`${report.pages.length} checks, ${failures} failing; report at ${join(out, "report.json")}`);
process.exit(failures ? 1 : 0);
