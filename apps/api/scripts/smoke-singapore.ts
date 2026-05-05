/**
 * One-off smoke test: call the singapore-company-data executor directly
 * with a known-good UEN. Confirms the new data.gov.sg implementation
 * actually works against the live upstream.
 *
 * Read-only. No DB writes.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

// Import the capability for its side-effect registration.
import "../src/capabilities/singapore-company-data.js";
import { getExecutor } from "../src/capabilities/index.js";

async function main() {
  const exec = getExecutor("singapore-company-data");
  if (!exec) {
    console.error("No executor registered for 'singapore-company-data'");
    process.exit(2);
  }

  // DBS Bank Ltd UEN (publicly known SG entity).
  const cases: Array<{ label: string; input: Record<string, unknown> }> = [
    { label: "DBS Bank UEN (196800306E)", input: { uen: "196800306E" } },
    { label: "Name search (DBS BANK)",     input: { company_name: "DBS BANK" } },
  ];

  for (const c of cases) {
    const t0 = Date.now();
    try {
      const result = await exec(c.input);
      const ms = Date.now() - t0;
      console.log(`\n=== ${c.label}  (${ms}ms) ===`);
      console.log("output:", JSON.stringify(result.output, null, 2));
      console.log("provenance.acquisition_method:", (result.provenance as any)?.acquisition_method);
    } catch (err) {
      const ms = Date.now() - t0;
      console.log(`\n=== ${c.label}  (${ms}ms — FAILED) ===`);
      console.log("error:", err instanceof Error ? err.message : String(err));
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
