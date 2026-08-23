/**
 * Every migrated job really registers a durable schedule (WP10, risk CR-08).
 *
 * The other WP10 suites prove the coordinator behaves. This one proves each
 * job is actually wired to it, with the period the code declares.
 *
 * It does NOT prove the absence of a second scheduler — a job that registers
 * here and also keeps its own `setInterval` passes this unchanged. That half is
 * `no-boot-relative-timers.test.ts`, which reads the same MIGRATED_JOBS list.
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
import { MIGRATED_JOBS } from "./migrated-jobs.js";

const HOUR = 60 * 60 * 1000;

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

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
    for (const { job } of MIGRATED_JOBS) {
      await db.execute(sql`DELETE FROM job_schedule WHERE job_name = ${job}`);
    }
  });

  for (const { module, start, job, intervalMs } of MIGRATED_JOBS) {
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
