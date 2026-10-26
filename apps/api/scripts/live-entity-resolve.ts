/** Read-only public GLEIF check; no database or Strale credentials. */
import { writeFile } from "node:fs/promises";
import { resolveEntity } from "../src/capabilities/entity-resolve.js";
const cases = [
  { identifier: "HWUPKR0MPOU8FGXBT394", type: "lei" },
  { identifier: "US0378331005", type: "isin" },
  { identifier: "DEUTDEFF", type: "bic" },
  { identifier: "00048839", type: "registry", country: "GB" },
];
const outputs = [];
for (const input of cases) {
  const started = Date.now();
  const result = await resolveEntity(input);
  outputs.push({ input, ...result });
  console.log(JSON.stringify({ input, elapsed_ms: Date.now() - started, output: result.output }));
}
if (process.argv.includes("--fixtures")) {
  await writeFile(new URL("../src/capabilities/__fixtures__/entity-resolve.live.json", import.meta.url), JSON.stringify(outputs, null, 2) + "\n");
}
