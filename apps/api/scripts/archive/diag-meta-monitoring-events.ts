import { config } from "dotenv";
import { resolve } from "node:path";
import postgres from "postgres";
config({ path: resolve(import.meta.dirname, "../../../.env") });
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

// Show full payload of the latest hourly summary
const latest = await sql`
  SELECT created_at, details
  FROM health_monitor_events
  WHERE event_type = 'meta_monitoring'
    AND details->>'frequency' = 'hourly'
  ORDER BY created_at DESC
  LIMIT 1
`;
console.log("=== Latest hourly summary FULL payload ===\n");
if (latest[0]) {
  console.log(`At ${(latest[0].created_at as Date).toISOString()}:`);
  console.log(JSON.stringify(latest[0].details, null, 2));
}

await sql.end();
process.exit(0);
