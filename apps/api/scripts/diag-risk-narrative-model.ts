/**
 * Read-only diagnostic: find the actual Anthropic snapshot resolved
 * for recent risk-narrative-generate calls. The capability now records
 * provenance.model_resolved (cert-audit Y-10); this script surfaces
 * the most-recent value so we can pin RISK_NARRATIVE_MODEL to a real,
 * known-valid snapshot ID.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
const db = getDb();

const r = await db.execute(sql`
  SELECT
    t.id,
    t.created_at,
    t.provenance->>'model_requested' AS model_requested,
    t.provenance->>'model_resolved'  AS model_resolved,
    t.provenance->>'source'          AS source
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
  WHERE c.slug = 'risk-narrative-generate'
    AND t.status = 'completed'
    AND t.created_at >= NOW() - INTERVAL '30 days'
  ORDER BY t.created_at DESC
  LIMIT 10
`);
const rows = (Array.isArray(r) ? r : (r as { rows?: unknown[] })?.rows ?? []) as Array<{
  id: string; created_at: string | Date; model_requested: string | null; model_resolved: string | null; source: string | null;
}>;

if (rows.length === 0) {
  console.log("No risk-narrative-generate calls in the last 30 days.");
  console.log("Suggest: run a smoke test against prod, or query the Anthropic API directly.");
  process.exit(0);
}

console.log(`Found ${rows.length} recent call(s):\n`);
for (const row of rows) {
  console.log(`  ${row.created_at}  source=${row.source ?? "—"}`);
  console.log(`    requested: ${row.model_requested ?? "(field absent — pre-Y-10)"}`);
  console.log(`    resolved:  ${row.model_resolved ?? "(field absent — pre-Y-10)"}`);
}

const resolved = [...new Set(rows.map((r) => r.model_resolved).filter((v): v is string => !!v))];
console.log(`\nDistinct resolved snapshots: ${resolved.length === 0 ? "(none — Y-10 not yet shipped or no LLM-path calls)" : resolved.join(", ")}`);
process.exit(0);
