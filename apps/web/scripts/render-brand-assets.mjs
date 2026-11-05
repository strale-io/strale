// Renders apps/web/public/og-image.png (1200x630) and apple-touch-icon.png (180x180)
// from code, so they can be reproduced: typographic, no generated imagery.
// Inputs: the website surface of design/tokens/active.json (colours), the Open Flow
// kit's wordmark and fonts, apps/web/src/content/positioning.ts (L1 headline), and
// the S mark the favicon uses (quiet-material exports/mark-ink.svg, see prepare-assets.mjs).
// Run from apps/web:  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/render-brand-assets.mjs
// Needs Playwright (resolved from the global install if not local). Output provenance:
// scripts/brand-assets.provenance.json (written here, hashes of the PNGs).
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(web, "../..");
const kit = resolve(root, "design/brand-kit/open-flow");
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); } catch { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); }

const { L1 } = await import(resolve(web, "src/content/positioning.ts"));
const pal = JSON.parse(readFileSync(resolve(root, "design/tokens/active.json"), "utf8")).surfaces.website.palette;
const c = { canvas: pal["light.canvas"], ink: pal["brand.ink"], blue: pal["brand.blue"], violet: pal["brand.violet"], teal: pal["brand.teal"] };

const b64 = (p) => readFileSync(p).toString("base64");
// Fonts are registered in the page through the FontFace API (see below), so the CSS only refers to them by variable.
const fonts = [
  ["Space Grotesk", "SpaceGrotesk.ttf", "300 700"],
  ["Instrument Sans", "InstrumentSans.ttf", "400 700"],
].map(([family, file, weight]) => ({ family, weight, data: b64(resolve(kit, "fonts", file)) }));
const wordmark = readFileSync(resolve(kit, "assets/logo/wordmark.svg"), "utf8");
const markFile = resolve(root, "design/brand-kit/quiet-material/foundations/exports/mark-ink.svg");
const mark = readFileSync(markFile, "utf8").replace(/fill="#[0-9a-f]{6}"/gi, `fill="${c.ink}"`);

const ogHtml = `<!doctype html><meta charset="utf-8"><style>
:root{--display:"Space Grotesk";--body:"Instrument Sans";}
html,body{margin:0;width:1200px;height:630px;background:${c.canvas};}
.card{position:relative;width:1200px;height:630px;color:${c.ink};font-family:var(--display);}
.bar{position:absolute;left:0;top:0;width:100%;height:10px;background:linear-gradient(90deg,${c.blue} 0 40%,${c.violet} 40% 70%,${c.teal} 70% 100%);}
.wm{position:absolute;left:80px;top:72px;width:300px;color:${c.ink};} .wm svg{display:block;width:100%;height:auto;}
h1{position:absolute;left:80px;top:235px;width:1040px;margin:0;text-wrap:balance;font-weight:600;font-size:84px;line-height:1.06;letter-spacing:-0.025em;}
.url{position:absolute;left:80px;bottom:64px;font-family:var(--body);font-weight:600;font-size:34px;color:${c.blue};}
</style><div class="card"><div class="bar"></div><div class="wm">${wordmark}</div><h1>${L1.headline}</h1><div class="url">strale.io</div></div>`;

const iconHtml = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:180px;height:180px;background:${c.canvas};}
.m{position:absolute;left:30px;top:30px;width:120px;height:120px;} .m svg{width:100%;height:100%;display:block;}
</style><div class="m">${mark}</div>`;

const browser = await chromium.launch();
const out = {};
for (const [name, html, w, h] of [["og-image.png", ogHtml, 1200, 630], ["apple-touch-icon.png", iconHtml, 180, 180]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html);
  await page.evaluate(async (list) => {
    for (const f of list) {
      const face = new FontFace(f.family, `url(data:font/ttf;base64,${f.data})`, { weight: f.weight });
      document.fonts.add(await face.load());
    }
    await document.fonts.ready;
  }, fonts);
  const buf = await page.screenshot({ type: "png", omitBackground: false });
  writeFileSync(resolve(web, "public", name), buf);
  out[name] = createHash("sha256").update(buf).digest("hex");
  await page.close();
}
await browser.close();

writeFileSync(resolve(web, "scripts/brand-assets.provenance.json"), JSON.stringify({
  what: "Open Flow share card and iOS home-screen icon for the website (SWITCH-OVER-READINESS row 12). Typographic, rendered from code; no image generation.",
  script: "apps/web/scripts/render-brand-assets.mjs",
  rendered_on: "2026-11-05",
  sources: {
    tokens: "design/tokens/active.json, surfaces.website.palette (light.canvas, brand.ink, brand.blue, brand.violet, brand.teal)",
    headline: "apps/web/src/content/positioning.ts L1.headline",
    wordmark: "design/brand-kit/open-flow/assets/logo/wordmark.svg",
    fonts: "design/brand-kit/open-flow/fonts/SpaceGrotesk.ttf (display), InstrumentSans.ttf (body)",
    icon_mark: "design/brand-kit/quiet-material/foundations/exports/mark-ink.svg (the S mark the favicon uses), fill recoloured to brand.ink",
  },
  sha256: out,
}, null, 2) + "\n");
console.log(out);
