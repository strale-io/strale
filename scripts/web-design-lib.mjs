// Website (apps/web) half of the design contract. design-lib.mjs already
// refuses hex, rgb/hsl, raw font stacks and off-scale spacing/radii in every
// apps/web source file. This adds what the Open Flow kit enforces on its own
// specimen, applied to the site's styles: every length, duration, colour and
// breakpoint comes from a token, and every var() names a token that exists.
//
// Styles are the .css files under apps/web/src plus the <style> blocks and
// literal style="" attributes in .astro files. The generated token file is the
// source of the tokens and is not linted; it is checked for staleness instead
// (scripts/generate-web-tokens.mjs).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { definedVars, lintCss } from "../design/brand-kit/open-flow/build.mjs";
import { WEB_TOKENS_GENERATED_PATH } from "./design-lib.mjs";
import { generate, loadWebsiteSurface, WEB_TOKENS_PATH } from "./generate-web-tokens.mjs";

export const WEB_SRC = "apps/web/src";
const SKIP = new Set(["node_modules", "dist", ".astro"]);

function walk(abs, rel, out) {
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(resolve(abs, e.name), `${rel}/${e.name}`, out);
    } else if (/\.(css|astro)$/.test(e.name) && `${rel}/${e.name}` !== WEB_TOKENS_GENERATED_PATH) {
      out.push(`${rel}/${e.name}`);
    }
  }
}

/** The CSS a file contributes, as [{ where, css }]. */
export function extractStyles(file, text) {
  if (file.endsWith(".css")) return [{ where: file, css: text }];
  const out = [];
  for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) out.push({ where: `${file} <style>`, css: m[1] });
  for (const m of text.matchAll(/\bstyle="([^"{}]*)"/g)) out.push({ where: `${file} style=""`, css: m[1] });
  return out;
}

/** Off-token findings across the website's styles. Empty when apps/web does not exist. */
export function lintWebStyles(root) {
  const findings = [];
  const srcAbs = resolve(root, WEB_SRC);
  if (!existsSync(srcAbs)) return findings;
  const tokensAbs = resolve(root, WEB_TOKENS_PATH);
  if (!existsSync(tokensAbs)) {
    findings.push({ code: "WEB_TOKENS_MISSING", file: WEB_TOKENS_PATH, detail: "fix: npm run design:web-tokens" });
    return findings;
  }
  const surface = loadWebsiteSurface(root);
  const files = [];
  walk(srcAbs, WEB_SRC, files);
  const blocks = files.flatMap((f) => extractStyles(f, readFileSync(resolve(root, f), "utf8")));
  // Component-local custom properties (--_name) may be defined in any block and used in any other.
  const defined = definedVars(readFileSync(tokensAbs, "utf8"), blocks.map((b) => b.css).join("\n"));
  for (const b of blocks) {
    for (const detail of lintCss(b.css, surface, defined, b.where)) findings.push({ code: "WEB_STYLE_OFF_TOKEN", file: b.where.split(" ")[0], detail });
  }
  return findings;
}

/** Staleness of the generated token CSS. Empty when apps/web does not exist. */
export function checkWebTokens(root) {
  if (!existsSync(resolve(root, "apps/web"))) return [];
  const r = generate(root, { check: true });
  if (!r.stale) return [];
  return [{ code: "WEB_TOKENS_STALE", file: WEB_TOKENS_PATH, detail: `${WEB_TOKENS_PATH} is ${r.missing ? "missing" : "stale against design/tokens/active.json"} — fix: npm run design:web-tokens` }];
}
