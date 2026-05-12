import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import "../src/capabilities/polish-company-data.js";
import { getExecutor } from "../src/capabilities/index.js";
import { guardedExecute } from "../src/capabilities/guarded-executor.js";

const fn = getExecutor("polish-company-data");
if (!fn) { console.log("NO EXECUTOR"); process.exit(1); }

for (const input of [
  { company_name: "Budimex SA" },
  { company_name: "PKN Orlen" },
  { krs_number: "0000033945" },
]) {
  console.log(`\n--- ${JSON.stringify(input)} ---`);
  try {
    // Phase A0b dispatcher gate.
    const r = await guardedExecute("polish-company-data", input, {
      kind: "internal_test",
      suiteId: "test-budimex",
      reason: "manual",
    });
    console.log(`  ${r.output.company_name} / ${r.output.krs_number} / ${r.output.status}`);
  } catch (e: any) {
    console.log(`  FAIL: ${e?.message}`);
  }
}
process.exit(0);
