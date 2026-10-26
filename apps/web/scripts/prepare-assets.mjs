// Copies the adopted Open Flow fonts and vector brand files from design/ into
// public/ before dev and build. design/brand-kit/open-flow is the only source
// (hashes in its provenance.json); public/fonts and public/brand are ignored by git.
// Raster artwork is not copied: pages import it through astro:assets, which
// emits resized WebP/AVIF from the same masters.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const kit = resolve(web, "../../design/brand-kit/open-flow");
// The flowing-S favicon set is the retained logo's existing export (design/brand-kit/quiet-material/foundations/exports).
const marks = resolve(web, "../../design/brand-kit/quiet-material/foundations/exports");
const copies = [
  ["fonts/SpaceGrotesk.ttf", "fonts/SpaceGrotesk.ttf"],
  ["fonts/InstrumentSans.ttf", "fonts/InstrumentSans.ttf"],
  ["fonts/IBMPlexMono-Regular.ttf", "fonts/IBMPlexMono-Regular.ttf"],
  ["assets/logo/lockup-ink.svg", "brand/lockup-ink.svg"],
  ["assets/logo/lockup-inverse.svg", "brand/lockup-inverse.svg"],
  ["assets/imagery/bands.svg", "brand/bands.svg"],
  [`${marks}/favicon.ico`, "favicon.ico"],
  [`${marks}/mark-ink.svg`, "favicon.svg"],
  [`${marks}/favicon-32.png`, "favicon-32.png"],
];
for (const [from, to] of copies) {
  const dest = resolve(web, "public", to);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(resolve(kit, from), dest);
}
// Subset WOFF2 copies of the fonts, served before the TTF masters (see static/fonts/README.md).
const woff2 = ["SpaceGrotesk", "InstrumentSans", "IBMPlexMono-Regular"];
for (const f of woff2) copyFileSync(resolve(web, "static/fonts", `${f}.woff2`), resolve(web, "public/fonts", `${f}.woff2`));
console.log(`prepared ${copies.length + woff2.length} brand files in public/`);
