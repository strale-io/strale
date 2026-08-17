import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

async function main() {
  const res = await fetch("https://api.strale.io/v1/capabilities");
  const data = await res.json() as any;
  const eliminated = ["trust_grade", "reliability_warning", "sqs_score", "schema_conformance_rate", "avg_field_completeness_pct"];
  
  for (const c of data.capabilities) {
    // Only check top-level keys, not nested schemas
    const topKeys = Object.keys(c);
    const leaked = eliminated.filter(m => topKeys.includes(m));
    if (leaked.length > 0) console.log("LEAK in", c.slug, "->", leaked);
  }
  console.log("Top-level key check complete. Checked:", data.capabilities.length, "capabilities");
  
  // Show sample capability structure
  const sample = data.capabilities[0];
  console.log("Sample top-level keys:", Object.keys(sample));
}
main();
