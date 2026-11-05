// Renders apps/web/public/og-image.png (1200x630) and apple-touch-icon.png (180x180)
// from code, so they can be reproduced: typographic, no generated imagery.
// Inputs: the website surface of design/tokens/active.json (colours), the Open Flow
// kit's wordmark and fonts, apps/web/src/content/positioning.ts (L1 headline), and
// the flowing A cut from the wordmark (Petter, 2026-11-05, candidate c; replaces the retired S mark).
// Also writes design/brand-kit/open-flow/assets/logo/mark-flow-a.svg and assets/icon/ (favicon.svg, .ico, PNGs),
// which prepare-assets.mjs copies into public/.
// Run from apps/web:  PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node scripts/render-brand-assets.mjs
// Needs Playwright (resolved from the global install if not local). Output provenance:
// scripts/brand-assets.provenance.json (written here, hashes of the PNGs).
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(web, "../..");
const kit = resolve(root, "design/brand-kit/open-flow");
const require = createRequire(import.meta.url);
let chromium;
// Prefer the global install that matches the preinstalled browser; fall back to a local one.
try { ({ chromium } = require("/opt/node22/lib/node_modules/playwright")); } catch { ({ chromium } = require("playwright")); }

const { L1 } = await import(resolve(web, "src/content/positioning.ts"));
const pal = JSON.parse(readFileSync(resolve(root, "design/tokens/active.json"), "utf8")).surfaces.website.palette;
const c = { canvas: pal["light.canvas"], violet_deep: pal["brand.deep-violet"], inverse: pal["light.text-inverse"], ink: pal["brand.ink"], blue: pal["brand.blue"], violet: pal["brand.violet"], teal: pal["brand.teal"] };

const b64 = (p) => readFileSync(p).toString("base64");
// Fonts are registered in the page through the FontFace API (see below), so the CSS only refers to them by variable.
const fonts = [
  ["Space Grotesk", "SpaceGrotesk.ttf", "300 700"],
  ["Instrument Sans", "InstrumentSans.ttf", "400 700"],
].map(([family, file, weight]) => ({ family, weight, data: b64(resolve(kit, "fonts", file)) }));
const wordmark = readFileSync(resolve(kit, "assets/logo/wordmark.svg"), "utf8");
// The flowing A: the wordmark's single path, clipped to the A (x 958..1328), written as a reusable vector mark.
const glyphPath = wordmark.match(/ d="([^"]+)"/)[1];
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="935 -45 405 420"><title>Strale</title><defs><clipPath id="a"><rect x="958" y="0" width="370" height="338"/></clipPath></defs><path clip-path="url(#a)" fill="currentColor" fill-rule="evenodd" d="${glyphPath}"/></svg>\n`;
const iconDir = resolve(kit, "assets/icon");
mkdirSync(iconDir, { recursive: true });
writeFileSync(resolve(kit, "assets/logo/mark-flow-a.svg"), markSvg);
// Self-contained favicon: rounded deep-violet tile, white glyph; square viewBox centred on the glyph, larger glyph than the app icon for small sizes.
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="903 -71 480 480"><title>Strale</title><rect x="903" y="-71" width="480" height="480" rx="104" fill="${c.violet_deep}"/><defs><clipPath id="a"><rect x="958" y="0" width="370" height="338"/></clipPath></defs><path clip-path="url(#a)" fill="${c.inverse}" fill-rule="evenodd" d="${glyphPath}"/></svg>\n`;
writeFileSync(resolve(iconDir, "favicon.svg"), faviconSvg);
const mark = markSvg.replace("currentColor", c.inverse);

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
html,body{margin:0;width:180px;height:180px;background:${c.violet_deep};}
.m{position:absolute;left:26px;top:26px;width:128px;height:128px;} .m svg{width:100%;height:100%;display:block;}
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

// Favicons: the SVG rasterised at each size (opaque tile corners stay transparent for the browser tab).
const png = {};
for (const n of [16, 32, 48]) {
  const page = await browser.newPage({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:${n}px;height:${n}px}</style><img src="data:image/svg+xml;base64,${Buffer.from(faviconSvg).toString("base64")}">`);
  await page.evaluate(() => new Promise((r) => { const i = document.images[0]; i.complete ? r() : (i.onload = r); }));
  png[n] = await page.screenshot({ type: "png", omitBackground: true });
  await page.close();
}
writeFileSync(resolve(iconDir, "favicon-16.png"), png[16]);
writeFileSync(resolve(iconDir, "favicon-32.png"), png[32]);
// ICO container holding PNG images (16, 32, 48).
const sizes = [16, 32, 48];
const head = Buffer.alloc(6 + 16 * sizes.length);
head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let off = head.length;
sizes.forEach((n, i) => {
  const e = 6 + 16 * i;
  head[e] = n; head[e + 1] = n; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
  head.writeUInt32LE(png[n].length, e + 8); head.writeUInt32LE(off, e + 12);
  off += png[n].length;
});
const ico = Buffer.concat([head, ...sizes.map((n) => png[n])]);
writeFileSync(resolve(iconDir, "favicon.ico"), ico);
for (const [name, buf] of [["favicon.svg", Buffer.from(faviconSvg)], ["favicon.ico", ico], ["favicon-16.png", png[16]], ["favicon-32.png", png[32]]]) out[`design/brand-kit/open-flow/assets/icon/${name}`] = createHash("sha256").update(buf).digest("hex");
out["design/brand-kit/open-flow/assets/logo/mark-flow-a.svg"] = createHash("sha256").update(markSvg).digest("hex");
await browser.close();

writeFileSync(resolve(web, "scripts/brand-assets.provenance.json"), JSON.stringify({
  what: "Open Flow share card, iOS home-screen icon and favicons for the website (SWITCH-OVER-READINESS row 12). Typographic, rendered from code; no image generation.",
  script: "apps/web/scripts/render-brand-assets.mjs",
  rendered_on: "2026-11-05",
  sources: {
    tokens: "design/tokens/active.json, surfaces.website.palette (light.canvas, brand.ink, brand.blue, brand.violet, brand.teal)",
    headline: "apps/web/src/content/positioning.ts L1.headline",
    wordmark: "design/brand-kit/open-flow/assets/logo/wordmark.svg",
    fonts: "design/brand-kit/open-flow/fonts/SpaceGrotesk.ttf (display), InstrumentSans.ttf (body)",
    icon_mark: "design/brand-kit/open-flow/assets/logo/wordmark.svg, the A clipped to x 958..1328 (mark-flow-a.svg); white (light.text-inverse) on brand.deep-violet; chosen by Petter on 2026-11-05 (candidate c), replacing the retired quiet-material S mark",
    decision: "Petter, 2026-11-05: the S mark is an old logo no longer in use; candidate c, the flowing A",
  },
  sha256: out,
}, null, 2) + "\n");
console.log(out);
