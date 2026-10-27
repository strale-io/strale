/** Public freshness contains only clock data. No job payloads or errors. */
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import JOB_WATCH_CONTRACT from "./job-watch-contract.json" with { type: "json" };

const HOUR = 3600;
export const AUXILIARY_INTERVALS: Readonly<Record<string, number>> = {
  "chromium-probe": 1800, "health-check": 6 * HOUR,
  "meta-hourly": HOUR, "meta-daily": 24 * HOUR,
  diagnostics: 24 * HOUR, "weekly-sweep": 168 * HOUR,
  retention: 24 * HOUR, "external-outage-digest": 24 * HOUR,
};
export const JOB_INTERVALS: Readonly<Record<string, number>> = JOB_WATCH_CONTRACT;
// Only these timers lack a durable success row; startup grace must never
// hide a stale durable job. Delays match the workers' first tick delays.
export const MEMORY_FIRST_TICK: Readonly<Record<string, number>> = {
  "job-coordinator": 20, "test-scheduler": 90, "reservation-reconciler": 45,
  "settlement-reconciler": 60, "integrity-hash-retry": 10,
};
const memory = new Map<string, number>();
export function markJobSuccess(id: string, at = Date.now()): void {
  if (!(id in JOB_INTERVALS)) throw new Error("Unknown job heartbeat");
  memory.set(id, at);
}

/** Separate rows in the existing schedule table retain SUCCESS across failures.
 * They are never registered/claimed by the coordinator; cadence stays unchanged.
 * No migration, customer data, or per-run history is needed. */
export async function persistJobSuccess(id: string): Promise<void> {
  if (!(id in JOB_INTERVALS)) throw new Error("Unknown job heartbeat");
  const db = getDb();
  await db.execute(sql`
    INSERT INTO job_schedule (job_name, interval_ms, next_run_at, last_finished_at, last_outcome)
    VALUES (${`heartbeat:${id}`}, ${JOB_INTERVALS[id] * 1000}, now(), now(), 'ok')
    ON CONFLICT (job_name) DO UPDATE SET last_finished_at = now(), last_outcome = 'ok'
  `);
  markJobSuccess(id);
}

export interface JobFreshness {
  id: string;
  ok: boolean;
  last_success_age_seconds: number | null;
  expected_interval_seconds: number;
}
export function jobFreshness(successes: ReadonlyMap<string, number>, now = Date.now(), uptime = process.uptime(), graceStartedAt?: number, durableIds: ReadonlySet<string> = new Set()): JobFreshness[] {
  return Object.entries(JOB_INTERVALS).map(([id, interval]) => {
    const at = successes.get(id);
    const age = at === undefined ? null : (now - at) / 1000;
    return {
      id, ok: at === undefined
        ? (id in MEMORY_FIRST_TICK && uptime < interval * 3 + MEMORY_FIRST_TICK[id]) ||
          (id in AUXILIARY_INTERVALS && !durableIds.has(id) && graceStartedAt !== undefined &&
            now >= graceStartedAt && now - graceStartedAt < (interval + 300) * 1000)
        : age !== null && Number.isFinite(age) && age >= 0 && age <= interval * 3,
      last_success_age_seconds: age !== null && Number.isFinite(age) && age >= 0 ? Math.floor(age) : null,
      expected_interval_seconds: interval,
    };
  });
}

export async function initializeHeartbeatGrace(): Promise<void> {
  const db = getDb();
  // A write-once feature epoch survives restarts; unlike consumeDueSlot this
  // row is never scheduled or refreshed. No schema change or fake success.
  await db.execute(sql`
    INSERT INTO job_schedule (job_name, interval_ms, next_run_at, last_finished_at, last_outcome)
    VALUES ('heartbeat-feature-start', 0, now(), now(), 'ok')
    ON CONFLICT (job_name) DO NOTHING
  `);
}

export async function readJobFreshness(): Promise<JobFreshness[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT substring(job_name from 11) AS id, last_finished_at AS at, 'durable' AS source
      FROM job_schedule WHERE job_name LIKE 'heartbeat:%'
    UNION ALL
    SELECT job_name AS id, last_finished_at AS at, 'legacy' AS source FROM job_schedule s
      WHERE last_outcome = 'ok' AND job_name NOT LIKE 'heartbeat:%'
        AND job_name <> 'heartbeat-feature-start'
        AND NOT EXISTS (SELECT 1 FROM job_schedule h WHERE h.job_name = 'heartbeat:' || s.job_name)
    UNION ALL
    SELECT 'heartbeat-feature-start' AS id, last_finished_at AS at, 'epoch' AS source
      FROM job_schedule WHERE job_name = 'heartbeat-feature-start'

  `);
  const successes = new Map(memory);
  const records = rows as unknown as { id: string; at: string | null; source: string }[];
  const durableIds = new Set(records.filter((r) => r.source === "durable").map((r) => r.id));
  const epoch = records.find((row) => row.source === "epoch")?.at;
  const graceStartedAt = epoch ? new Date(epoch).getTime() : undefined;
  const now = Date.now();
  for (const row of records) {
    if (row.source === "epoch") continue;
    // Auxiliary schedule slots record attempts, never evidence of success.
    if (row.source === "legacy" && (durableIds.has(row.id) || row.id in AUXILIARY_INTERVALS || row.id in MEMORY_FIRST_TICK ||
      !(row.id in JOB_INTERVALS) || graceStartedAt === undefined || !Number.isFinite(graceStartedAt) ||
      now < graceStartedAt || now - graceStartedAt >= Math.max(JOB_INTERVALS[row.id] * 3, JOB_INTERVALS[row.id] + 300) * 1000)) continue;
    if (row.source === "durable") successes.delete(row.id);
    if (row.at) {
      const at = new Date(row.at).getTime();
      if (Number.isFinite(at)) successes.set(row.id, Math.max(successes.get(row.id) ?? 0, at));
    }
  }
  return jobFreshness(successes, now, process.uptime(), graceStartedAt, durableIds);
}
