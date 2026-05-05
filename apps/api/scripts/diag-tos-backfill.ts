import { sql } from "drizzle-orm";
import { getDb } from "../src/db/index.js";
const db = getDb();
const r = await db.execute(sql`
  SELECT
    COUNT(*)::int AS total,
    COUNT(tos_accepted_at)::int AS with_tos,
    COUNT(*) FILTER (WHERE tos_version = 'pre-2026-04-30-implicit')::int AS legacy_backfill,
    COUNT(*) FILTER (WHERE tos_version = '2026-04-30')::int AS new_signups
  FROM users
`);
const rows = (Array.isArray(r) ? r : (r as { rows?: unknown[] })?.rows ?? []) as Array<Record<string, number>>;
console.log(rows[0]);
process.exit(0);
