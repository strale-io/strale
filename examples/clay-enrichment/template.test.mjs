// Checks the Clay template against what Strale actually serves: every input it
// sends is in the tool's input schema, every column it maps is a documented
// output field, and the sample table renders and maps the way Clay would.
// Run: node --test examples/clay-enrichment/template.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import {
  HERE,
  KEY_PLACEHOLDER,
  extractColumns,
  loadRecipes,
  loadSampleTable,
  readPath,
  referencedColumns,
  renderRequest,
  shouldRun,
} from "./template.mjs";

const REPO = join(HERE, "..", "..");
const template = loadRecipes();
const table = loadSampleTable();
const envelope = JSON.parse(readFileSync(join(HERE, "fixtures", "v1-do-envelope.json"), "utf8"));
const manifest = (slug) => parse(readFileSync(join(REPO, "manifests", `${slug}.yaml`), "utf8"));

test("every call is attributable to the template", () => {
  for (const r of template.recipes) {
    const url = new URL(r.request.url);
    assert.equal(url.origin + url.pathname, "https://api.strale.io/v1/do", r.id);
    assert.equal(url.searchParams.get("src"), "clay-template", r.id);
    assert.equal(r.request.headers["X-Strale-Client"], `clay-template/${template.version}`, r.id);
    assert.equal(r.request.headers.Authorization, `Bearer ${KEY_PLACEHOLDER}`, `${r.id}: key is pasted, never a column`);
  }
});

test("inputs match each tool's input schema, and the price cap covers the price", () => {
  for (const r of template.recipes) {
    const m = manifest(r.capability_slug);
    assert.equal(r.request.body.capability_slug, r.capability_slug);
    const props = Object.keys(m.input_schema.properties);
    for (const k of Object.keys(r.request.body.inputs)) assert.ok(props.includes(k), `${r.id}: input ${k} not in schema`);
    for (const k of m.input_schema.required ?? []) assert.ok(k in r.request.body.inputs, `${r.id}: required ${k} missing`);
    assert.ok(r.request.body.max_price_cents >= m.price_cents, `${r.id}: cap below price ${m.price_cents}`);
    assert.ok(r.request.body.max_price_cents <= 2 * m.price_cents + 2, `${r.id}: cap far above price`);
    assert.deepEqual([...r.run_only_if_present].sort(), referencedColumns(r).sort(), `${r.id}: run condition`);
  }
});

test("every mapped column is a documented output field", () => {
  for (const r of template.recipes) {
    const m = manifest(r.capability_slug);
    for (const [name, col] of Object.entries(r.output_columns)) {
      if (col.path.startsWith("result.output.")) {
        const rest = col.path.slice("result.output.".length);
        const top = rest.split(".")[0];
        assert.ok(top in m.output_field_reliability, `${r.id}/${name}: ${top} undocumented`);
        if (col.conditional) {
          assert.ok(col.conditional.length > 20, `${r.id}/${name}: conditional column needs its note`);
        } else {
          assert.equal(m.output_field_reliability[top], "guaranteed", `${r.id}/${name}: ${top} not guaranteed`);
          assert.notEqual(readPath(m.output_schema.example, rest), undefined, `${r.id}/${name}: ${rest} not in example`);
        }
      } else {
        assert.notEqual(readPath(envelope, col.path), undefined, `${r.id}/${name}: ${col.path} not in the served envelope`);
      }
    }
  }
});

test("the sample table renders and maps the way Clay would", async () => {
  for (const r of template.recipes) {
    const example = manifest(r.capability_slug).output_schema.example;
    let ran = 0;
    for (const row of table) {
      if (!shouldRun(r, row)) continue;
      ran++;
      const { url, init } = renderRequest(r, row, "sk_test_dummy");
      assert.equal(init.headers.Authorization, "Bearer sk_test_dummy");
      const body = JSON.parse(init.body);
      for (const [k, v] of Object.entries(r.request.body.inputs)) {
        const col = v.slice(2, -2);
        assert.equal(body.inputs[k], row[col], `${r.id}: ${k} must carry ${col} verbatim (leading zeros kept)`);
        assert.equal(typeof body.inputs[k], "string");
      }
      const fakeFetch = async () => ({ ...envelope, result: { ...envelope.result, output: example } });
      const cells = extractColumns(r, await fakeFetch(url, init));
      for (const [name, col] of Object.entries(r.output_columns)) {
        if (!col.conditional) assert.notEqual(cells[name], "", `${r.id}/${name} blank for ${row.Company}`);
      }
    }
    assert.ok(ran > 0, `${r.id}: no sample row runs`);
  }
});

test("rows missing an input are skipped, and an unknown column is refused", () => {
  const vat = template.recipes.find((r) => r.id === "vat-check");
  assert.equal(shouldRun(vat, { "VAT number": "" }), false);
  assert.throws(() => renderRequest(vat, { Company: "x" }, "k"), /lacks/);
});

test("a conditional column stays blank rather than reading as zero", () => {
  const status = template.recipes.find((r) => r.id === "registry-status");
  const cells = extractColumns(status, {
    result: { output: { insolvency: { checked: false, reason: "No official insolvency source" } } },
  });
  assert.equal(cells["Insolvency checked"], false);
  assert.equal(cells["Insolvency notices found"], "");
});
