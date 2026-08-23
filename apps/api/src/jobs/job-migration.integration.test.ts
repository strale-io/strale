/**
 * Every migrated job really registers a durable schedule (WP10, risk CR-08).
 *
 * The other WP10 suites prove the coordinator behaves. This one proves the
 * jobs are actually wired to it — the gap that would otherwise let a future
 * author add a job with `setInterval` and have every coordinator test stay
 * green while the platform quietly went back to boot-relative scheduling.
 *
 * It asserts on rows, not on source text. A previous package in this program
 * shipped three guards that were green while asserting nothing, all three
 * because they inspected a representation of the behaviour rather than the
 * behaviour; the lesson was to make the guard read the same artifact the
 * production path writes.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";

import { useTestDatabase } from "../test-support/integration-db.js";
import { _resetRegistryForTests, registeredJobNames } from "../lib/job-coordinator.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * The jobs whose cadence is a business fact, with the period each declares.
 *
 * The cut is deliberate and stated: a job is migrated when its period exceeds
 * the observed median production process lifetime (1.0 hour), because those
 * are precisely the periods a `setInterval` could never reach. The sub-hour
 * tick loops — reservation-reconciler and settlement-reconciler at 60s,
 * integrity-hash-retry at 30s, and the test scheduler's own 60s poll — keep
 * their timers, because for them the poll cadence IS the point and a restart
 * costs at most one tick.
 */
const MIGRATED: Array<{ module: string; start: string; job: string; intervalMs: number }> = [
  { module: "./quality-floor.js", start: "startQualityFloor", job: "quality-floor", intervalMs: DAY },
  { module: "./capability-promotion.js", start: "startCapabilityPromotion", job: "capability-promotion", intervalMs: DAY },
  { module: "./db-retention.js", start: "startDbRetention", job: "db-retention", intervalMs: DAY },
  { module: "./activation-drip.js", start: "startActivationDrip", job: "activation-drip", intervalMs: 6 * HOUR },
  { module: "./invariant-checker.js", start: "startInvariantChecker", job: "invariant-checker", intervalMs: 2 * HOUR },
  { module: "./ingest-cy-directors.js", start: "startCyDirectorsIngest", job: "ingest-cy-directors", intervalMs: 7 * DAY },
  { module: "./ingest-ee-directors.js", start: "startEeDirectorsIngest", job: "ingest-ee-directors", intervalMs: DAY },
  { module: "./reindex-transactions.js", start: "startReindexTransactions", job: "reindex-transactions", intervalMs: DAY },
  { module: "./x402-settlement-watch.js", start: "startX402SettlementWatch", job: "x402-settlement-watch", intervalMs: HOUR },
  { module: "./revenue-heartbeat.js", start: "startRevenueHeartbeat", job: "revenue-heartbeat", intervalMs: HOUR },
  { module: "./onboarding-retry.js", start: "startOnboardingRetry", job: "onboarding-retry", intervalMs: HOUR },
];

describeMaybe("migrated jobs register a durable schedule", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    _resetRegistryForTests();
    for (const { job } of MIGRATED) {
      await db.execute(sql`DELETE FROM job_schedule WHERE job_name = ${job}`);
    }
  });

  for (const { module, start, job, intervalMs } of MIGRATED) {
    it(`${job} registers with a ${Math.round(intervalMs / HOUR)}h period`, async () => {
      const mod = (await import(module)) as Record<string, () => void>;
      expect(typeof mod[start]).toBe("function");

      mod[start]();

      // registerJobSync is fire-and-forget by design (the startX functions are
      // synchronous and nothing awaits them), so give the write a moment.
      await vi.waitFor(async () => {
        const rows = await db.execute(
          sql`SELECT interval_ms, next_run_at FROM job_schedule WHERE job_name = ${job}`,
        );
        expect((rows as unknown as Array<unknown>).length).toBe(1);
      });

      const rows = await db.execute(
        sql`SELECT interval_ms FROM job_schedule WHERE job_name = ${job}`,
      );
      const row = (rows as unknown as Array<{ interval_ms: string }>)[0];

      // The period in the table must be the period the job declares. A
      // mismatch means the code and the schedule disagree about recurrence,
      // which is the duplicated-authority shape this package removes.
      expect(Number(row.interval_ms)).toBe(intervalMs);

      expect(registeredJobNames()).toContain(job);
    });
  }
});
