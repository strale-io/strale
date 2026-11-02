// Sends the sample table to production exactly as the Clay columns would and
// prints the cells Clay would add. Costs EUR 0.26 for the sample table
// (one VAT check at 2 cents and three status checks at 8 cents; prices from the
// manifests). Calls carry src=clay-template, so they count in the D9 metric:
// record the transaction ids printed here as test traffic.
//
// Run: STRALE_API_KEY=... node examples/clay-enrichment/run-sample.mjs
import { extractColumns, loadRecipes, loadSampleTable, renderRequest, shouldRun } from "./template.mjs";

const key = process.env.STRALE_API_KEY;
if (!key) {
  console.error("Set STRALE_API_KEY to a Strale API key.");
  process.exit(2);
}

let failures = 0;
for (const recipe of loadRecipes().recipes) {
  for (const row of loadSampleTable()) {
    if (!shouldRun(recipe, row)) continue;
    const { url, init } = renderRequest(recipe, row, key);
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      failures++;
      console.log(`${recipe.id} | ${row.Company} | HTTP ${res.status} ${json.error_code ?? ""}`);
      continue;
    }
    const cells = extractColumns(recipe, json);
    const blank = Object.entries(recipe.output_columns)
      .filter(([name, col]) => !col.conditional && cells[name] === "")
      .map(([name]) => name);
    if (blank.length) failures++;
    console.log(`${recipe.id} | ${row.Company} | ${JSON.stringify(cells)}${blank.length ? ` | BLANK: ${blank.join(", ")}` : ""}`);
  }
}
process.exit(failures ? 1 : 0);
