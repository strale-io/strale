// Tests for scripts/web-design-lib.mjs and scripts/generate-web-tokens.mjs:
// the website's styles may use tokens only, and the generated token CSS must
// match design/tokens/active.json. Each failure is planted in a throwaway
// copy of the files the check reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { repoRootFrom } from "./design-lib.mjs";
import { checkWebTokens, extractStyles, lintWebStyles } from "./web-design-lib.mjs";
import { generate, WEB_TOKENS_PATH } from "./generate-web-tokens.mjs";

const realRoot = repoRootFrom(import.meta.url);

function fixture(files, { withTokens = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "strale-web-design-"));
  mkdirSync(join(root, "design/tokens"), { recursive: true });
  cpSync(resolve(realRoot, "design/tokens/active.json"), join(root, "design/tokens/active.json"));
  mkdirSync(join(root, "apps/web/src/styles"), { recursive: true });
  if (withTokens) writeFileSync(join(root, WEB_TOKENS_PATH), generate(realRoot, { check: true }).content);
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}
function run(files, fn, opts) {
  const root = fixture(files, opts);
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}

test("token-only styles pass", () => {
  run({
    "apps/web/src/styles/site.css": ".a { color: var(--text); padding: var(--space-16); }\n@media (min-width: 1024px) { .a { padding: var(--space-24); } }\n",
    "apps/web/src/components/B.astro": '<div class="b" style="max-width: 62ch"></div>\n<style>.b { --_gap: var(--space-8); gap: var(--_gap); }</style>\n',
  }, (root) => assert.deepEqual(lintWebStyles(root), []));
});

test("planted off-token values in .css, <style> and style=\"\" are each caught", () => {
  run({
    "apps/web/src/styles/site.css": ".a { padding: 13px; }\n",
    "apps/web/src/components/B.astro": '<div style="margin: 7px"></div>\n<style>.b { color: var(--nope); transition: color 150ms; }\n@media (min-width: 900px) { .b { display: none; } }</style>\n',
  }, (root) => {
    const details = lintWebStyles(root).map((f) => f.detail).join("\n");
    assert.match(details, /site\.css: off-token length 13px/);
    assert.match(details, /style="": off-token length 7px/);
    assert.match(details, /unknown token --nope/);
    assert.match(details, /off-token length 150ms/);
    assert.match(details, /900px is not a token breakpoint/);
  });
});

test("the generated token file itself is not linted", () => {
  run({}, (root) => assert.deepEqual(lintWebStyles(root), []));
});

test("expression style attributes are left to review; only literal ones are extracted", () => {
  assert.deepEqual(extractStyles("x.astro", '<a style={`--_w: ${w}%`}></a><b style="gap: var(--space-8)"></b>').map((b) => b.css), ["gap: var(--space-8)"]);
});

test("a stale or missing generated token file fails; regenerating fixes it", () => {
  run({}, (root) => {
    assert.deepEqual(checkWebTokens(root), []);
    writeFileSync(join(root, WEB_TOKENS_PATH), "/* edited */\n");
    assert.deepEqual(checkWebTokens(root).map((f) => f.code), ["WEB_TOKENS_STALE"]);
    generate(root);
    assert.deepEqual(checkWebTokens(root), []);
  });
  run({}, (root) => assert.match(checkWebTokens(root)[0].detail, /missing/), { withTokens: false });
});

test("the committed generated token file matches active.json", () => {
  assert.equal(generate(realRoot, { check: true }).stale, false);
});
