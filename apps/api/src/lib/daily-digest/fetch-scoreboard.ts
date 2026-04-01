import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import type { Scoreboard } from "./types.js";

function toRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as any)?.rows ?? [];
}

export async function getScoreboard(totalBeaconScans: number = 0): Promise<Scoreboard> {
  const db = getDb();

  const [capsRaw, solsRaw, usersRaw, txnRaw] = await Promise.all([
    db.execute(sql`SELECT COUNT(*)::int AS cnt FROM capabilities WHERE is_active = true`),
    db.execute(sql`SELECT COUNT(*)::int AS cnt FROM solutions WHERE is_active = true`),
    db.execute(sql`SELECT COUNT(*)::int AS cnt FROM users`),
    db.execute(sql`SELECT COUNT(*)::int AS cnt FROM transactions WHERE status = 'completed'`),
  ]);

  return {
    totalCapabilities: toRows(capsRaw)[0]?.cnt ?? 0,
    totalSolutions: toRows(solsRaw)[0]?.cnt ?? 0,
    totalUsers: toRows(usersRaw)[0]?.cnt ?? 0,
    totalApiCalls: toRows(txnRaw)[0]?.cnt ?? 0,
    totalBeaconScans,
  };
}
