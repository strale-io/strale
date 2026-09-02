#!/usr/bin/env node
// Regenerates apps/api/scripts/lib/design-tokens.generated.ts from the
// `internal-reports` surface of design/tokens/active.json. Mirrors
// regenerate-coverage-matrix-summary.mjs and generate-research-index.mjs:
//
//   (default) — write design-tokens.generated.ts
//   --check   — diff against the committed file, exit 2 on drift
//
// Only the flat token values (TOKENS) are generated. The stylesheet
// (DESIGN_SYSTEM_CSS) stays authored in design-system.ts, which imports
// TOKENS from the generated file and re-exports it unchanged — the
// stylesheet's component classes (.card, .kpi, .frow, ...) have no
// representation in the token schema, only the color values they
// interpolate do. See design/README.md.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDirectInvocation, repoRootFrom } from "./design-lib.mjs";

export const ACTIVE_TOKENS_PATH = "design/tokens/active.json";
export const GENERATED_PATH = "apps/api/scripts/lib/design-tokens.generated.ts";

/** Loads the `internal-reports` surface's palette from active.json. */
export function loadInternalReportsPalette(root) {
  const active = JSON.parse(readFileSync(resolve(root, ACTIVE_TOKENS_PATH), "utf8"));
  const surface = active.surfaces?.["internal-reports"];
  if (!surface) throw new Error(`${ACTIVE_TOKENS_PATH} has no surfaces["internal-reports"]`);
  return surface.palette;
}

function quote(value) {
  return JSON.stringify(value);
}

export function render(palette) {
  const keys = Object.keys(palette);
  const lines = keys.map((key) => `  ${key}: ${quote(palette[key])},`);
  return [
    "// GENERATED FILE — do not edit by hand.",
    "// Source: design/tokens/active.json, surfaces[\"internal-reports\"].palette.",
    "// Regenerate: npm run design:tokens:generate (checked by npm run design:check).",
    "//",
    "// design-system.ts imports TOKENS from here and re-exports it unchanged;",
    "// DESIGN_SYSTEM_CSS stays authored there, built from these values.",
    "",
    "export const TOKENS = {",
    ...lines,
    "} as const;",
    "",
  ].join("\n");
}

export function generate(root, { check = false } = {}) {
  const palette = loadInternalReportsPalette(root);
  const content = render(palette);
  const outPath = resolve(root, GENERATED_PATH);

  if (check) {
    if (!existsSync(outPath)) {
      return { stale: true, missing: true, content };
    }
    const committed = readFileSync(outPath, "utf8").replace(/\r\n/g, "\n");
    const normalized = content.replace(/\r\n/g, "\n");
    return { stale: committed !== normalized, missing: false, content };
  }

  writeFileSync(outPath, content, "utf8");
  return { stale: false, missing: false, content };
}

if (isDirectInvocation(import.meta.url)) {
  const root = repoRootFrom(import.meta.url);
  const check = process.argv.includes("--check");
  const result = generate(root, { check });

  if (check) {
    if (result.stale) {
      console.error(
        result.missing
          ? `${GENERATED_PATH} is missing — fix: npm run design:tokens:generate`
          : `${GENERATED_PATH} is stale against ${ACTIVE_TOKENS_PATH} — fix: npm run design:tokens:generate (then commit it)`,
      );
      process.exit(2);
    }
    console.log(`${GENERATED_PATH} up to date`);
  } else {
    console.log(`Wrote ${GENERATED_PATH}`);
  }
}
