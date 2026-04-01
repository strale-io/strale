import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { digestSnapshots } from "../../db/schema.js";
import type { DigestData, Scoreboard } from "./types.js";

function toRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  return (result as any)?.rows ?? [];
}

export async function getYesterdaySnapshot(): Promise<Partial<Scoreboard> | null> {
  const db = getDb();
  try {
    const rows = await db.execute(sql`
      SELECT data FROM digest_snapshots
      ORDER BY snapshot_date DESC
      LIMIT 1
    `);
    const row = toRows(rows)[0];
    if (!row?.data) return null;
    const data = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
    return data.scoreboard ?? null;
  } catch {
    return null;
  }
}

export async function saveSnapshot(data: DigestData): Promise<void> {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  await db
    .insert(digestSnapshots)
    .values({
      snapshotDate: today,
      data: data as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: digestSnapshots.snapshotDate,
      set: { data: data as unknown as Record<string, unknown> },
    });
}
