// Clay HTTP API enrichment template for Strale (distribution track D9).
//
// The same rendering Clay performs on each row: substitute {{Column}}
// references with the row's values, send the request, then read each output
// column from its response path. template.test.mjs drives it over
// sample-table.csv; run-sample.mjs sends the sample table to production.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const HERE = dirname(fileURLToPath(import.meta.url));
export const KEY_PLACEHOLDER = "<STRALE_API_KEY>";
const COLUMN_REF = /\{\{([^}]+)\}\}/g;

export function loadRecipes() {
  return JSON.parse(readFileSync(join(HERE, "recipes.json"), "utf8"));
}

/** Minimal CSV reader for the sample table (no quoted commas in it). */
export function loadSampleTable() {
  const [header, ...lines] = readFileSync(join(HERE, "sample-table.csv"), "utf8").trim().split(/\r?\n/);
  const cols = header.split(",");
  return lines.map((line) => Object.fromEntries(line.split(",").map((v, i) => [cols[i], v.trim()])));
}

/** Column names a recipe references, in the order they appear. */
export function referencedColumns(recipe) {
  const text = JSON.stringify(recipe.request);
  return [...new Set([...text.matchAll(COLUMN_REF)].map((m) => m[1]))];
}

/** Clay's "only run if" condition: every referenced column has a value. */
export function shouldRun(recipe, row) {
  return recipe.run_only_if_present.every((col) => (row[col] ?? "") !== "");
}

function fill(value, row, apiKey) {
  if (typeof value === "string") {
    return value
      .replace(COLUMN_REF, (_, col) => {
        if (!(col in row)) throw new Error(`Recipe references column "${col}", which the table lacks`);
        return row[col];
      })
      .replace(KEY_PLACEHOLDER, apiKey);
  }
  if (Array.isArray(value)) return value.map((v) => fill(v, row, apiKey));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fill(v, row, apiKey)]));
  }
  return value;
}

/** The HTTP request Clay sends for one row. */
export function renderRequest(recipe, row, apiKey) {
  const r = fill(recipe.request, row, apiKey);
  return { url: r.url, init: { method: r.method, headers: r.headers, body: JSON.stringify(r.body) } };
}

export function readPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** The cells Clay adds from one response. Absent paths become blank cells. */
export function extractColumns(recipe, response) {
  return Object.fromEntries(
    Object.entries(recipe.output_columns).map(([name, col]) => [name, readPath(response, col.path) ?? ""]),
  );
}
