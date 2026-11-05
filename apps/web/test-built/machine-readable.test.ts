// The machine-readable files in dist/ of a PREVIEW build (STRALE_SITE_DATA=manifests npm run build).
// They must exist, equal what the renderers produce for the build's site URL, parse, and be
// clean of forbidden claims. Run: npm run test:built, after the build.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allMachineReadableText } from "../src/lib/machine-readable.ts";
import { checkSchema, compileMatcher } from "../../../scripts/claims-lib.mjs";

const dist = resolve(import.meta.dirname, "../dist");
assert.ok(existsSync(resolve(dist, "index.html")), "dist/ is missing: run STRALE_SITE_DATA=manifests npm run build first");
const site = process.env.STRALE_SITE_URL ?? "https://strale.io";
const built = allMachineReadableText(site).map((f) => ({ ...f, actual: existsSync(resolve(dist, f.file)) ? readFileSync(resolve(dist, f.file), "utf8") : null }));

test("llms.txt and both cards are in dist/ and are what the renderers produce for the site URL", () => {
  for (const f of built) {
    assert.notEqual(f.actual, null, `dist/${f.file} is missing`);
    assert.equal(f.actual, f.text, f.file);
  }
});

test("the built cards parse and the built host is the site URL", () => {
  for (const f of built.filter((b) => b.file.endsWith(".json"))) {
    const j = JSON.parse(f.actual!);
    assert.equal(j.documentation ?? j.links.documentation, `${site.replace(/\/$/, "")}/docs`, f.file);
  }
  assert.match(built[0].actual!, new RegExp(`${site.replace(/\/$/, "").replace(/\./g, "\\.")}/tools`));
});

test("the built files contain no forbidden claim, retired framing, universal x402 claim or typed count", () => {
  const { register } = checkSchema(resolve(import.meta.dirname, "../../.."));
  for (const row of register.filter((r: { status: string }) => r.status === "forbidden")) {
    const m = compileMatcher(row);
    for (const f of built) assert.ok(!m!.test(f.actual!), `dist/${f.file} matches forbidden claim ${row.id}`);
  }
  for (const f of built) {
    assert.doesNotMatch(f.actual!, /trust layer|independently tested/i, f.file);
    assert.doesNotMatch(f.actual!, /\b\d{2,}\+?\s/, f.file);
  }
});
