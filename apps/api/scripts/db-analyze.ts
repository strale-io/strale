import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");
  const sql = postgres(url, { max: 1, connect_timeout: 20 });
  try {
    console.log("Running ANALYZE on all public tables...");
    await sql.unsafe(`ANALYZE`);
    console.log("Done. Real row counts:");
    const tables = ["test_results", "transactions", "transaction_quality", "health_monitor_events", "test_run_log", "failed_requests", "capabilities"];
    for (const t of tables) {
      try {
        const [{ count }] = await sql.unsafe(`SELECT COUNT(*)::int AS count FROM ${t}`);
        console.log(`  ${t.padEnd(32)} ${String(count).padStart(10)}`);
      } catch (e: any) {
        console.log(`  ${t.padEnd(32)} (error: ${e.message})`);
      }
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
