/**
 * Post-deploy verification: hits production /v1/verify on known
 * unhashed_legacy + non-legacy rows; confirms the new code paths
 * are live.
 *
 * Run: cd apps/api && npx tsx scripts/verify-deploy-2026-04-29.ts
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";

config({ path: resolve(import.meta.dirname, "../../../.env") });

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
const API = "https://strale-production.up.railway.app";

async function main() {
  console.log(`=== Post-deploy verification — ${new Date().toISOString()} ===\n`);

  // Find one unhashed_legacy row (should report legacy: true with new code)
  const legacyRows = await sql`
    SELECT id FROM transactions
    WHERE compliance_hash_state = 'unhashed_legacy'
    LIMIT 1
  `;
  // Find one real complete row with hash (should report verified or hash_valid)
  const completeRows = await sql`
    SELECT id FROM transactions
    WHERE compliance_hash_state = 'complete' AND integrity_hash IS NOT NULL
    LIMIT 1
  `;

  const legacyId = legacyRows[0]?.id as string | undefined;
  const completeId = completeRows[0]?.id as string | undefined;

  if (!legacyId) {
    console.log("FAIL: no unhashed_legacy row found");
  } else {
    console.log(`Probe 1: GET /v1/verify/${legacyId} (expect legacy: true)`);
    const res = await fetch(`${API}/v1/verify/${legacyId}`);
    const body = await res.json();
    const ok = body.legacy === true && body.hash_valid === null;
    console.log(`  status=${res.status} legacy=${body.legacy} hash_valid=${body.hash_valid}`);
    console.log(`  legacy_reason: ${(body.legacy_reason ?? "").slice(0, 80)}...`);
    console.log(`  ${ok ? "✓ NEW CODE LIVE" : "✗ OLD CODE OR ERROR"}`);
  }

  console.log("");
  if (!completeId) {
    console.log("Skip probe 2: no complete-with-hash row");
  } else {
    console.log(`Probe 2: GET /v1/verify/${completeId} (expect hash_valid + redacted_links field)`);
    const res = await fetch(`${API}/v1/verify/${completeId}`);
    const body = await res.json();
    const hasRedactedLinks = body.chain && "redacted_links" in body.chain;
    console.log(`  status=${res.status} verified=${body.verified} hash_valid=${body.hash_valid}`);
    console.log(`  chain.redacted_links present: ${hasRedactedLinks}`);
    console.log(`  ${hasRedactedLinks ? "✓ NEW CODE LIVE (deletion-aware verify shipped)" : "✗ OLD CODE"}`);
  }

  console.log("");
  console.log("Probe 3: confirm health_monitor_events table reachable (for chain-health writes after first tick)");
  const recentEvents = await sql`
    SELECT event_type, COUNT(*)::int AS n FROM health_monitor_events
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY event_type ORDER BY n DESC LIMIT 8
  `;
  for (const r of recentEvents) console.log(`  ${(r.event_type as string).padEnd(28)} ${r.n}`);
  if (recentEvents.length === 0) console.log("  (no events in last 24h yet)");

  console.log("");
  console.log("Probe 4: x402_orphan_settlements table is reachable (was created by migration 0053)");
  const orphans = await sql`SELECT COUNT(*)::int AS n FROM x402_orphan_settlements`;
  console.log(`  rows: ${orphans[0].n} (0 expected — table is new)`);

  console.log("");
  console.log("Probe 5: append-only trigger (already verified live in post-flight; rechecking)");
  const trg = await sql`
    SELECT tgenabled FROM pg_trigger WHERE tgname = 'strale_chain_append_only_trigger' AND NOT tgisinternal
  `;
  console.log(`  trigger active: ${trg.length > 0 ? `tgenabled=${trg[0].tgenabled}` : "MISSING"}`);

  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
