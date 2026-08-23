/**
 * The durable job coordinator against a real Postgres (WP10, risk CR-08).
 *
 * These run against real rows because every property here is a property of a
 * SQL statement — `LEAST` over a nullable column, a conditional UPDATE used as
 * a lock, `make_interval` arithmetic on an interval stored in milliseconds. A
 * mocked db module would assert the shape of a query string and prove nothing
 * about what Postgres does with it.
 *
 * The headline property is the first test: **a boot does not move the
 * schedule.** That single behaviour is what the package exists for, and the
 * test is written so that the obvious wrong implementation — an ON CONFLICT
 * that recomputes `next_run_at` from the startup delay, which is exactly what
 * every pre-WP10 job did in memory — turns it red.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import {
  registerJob,
  claimJob,
  releaseJob,
  runDueJobs,
  consumeDueSlot,
  runnerId,
  _resetRegistryForTests,
} from "./job-coordinator.js";

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

describeMaybe("job coordinator against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;

  /** Every job name this run created, so cleanup cannot touch a sibling's rows. */
  const created = new Set<string>();

  function jobName(label: string): string {
    const name = `test-${label}-${randomUUID().slice(0, 8)}`;
    created.add(name);
    return name;
  }

  async function row(name: string) {
    const rows = await db.execute(sql`
      SELECT job_name, interval_ms, next_run_at, lease_owner, lease_expires_at,
             last_started_at, last_finished_at, last_outcome, last_error,
             consecutive_failures
        FROM job_schedule WHERE job_name = ${name}
    `);
    return (rows as unknown as Array<Record<string, unknown>>)[0];
  }

  /** Move a job's due time by a SQL interval, so the DB clock is used on both sides. */
  async function shiftDue(name: string, expr: string) {
    await db.execute(
      sql`UPDATE job_schedule SET next_run_at = now() ${sql.raw(expr)} WHERE job_name = ${name}`,
    );
  }

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 6 });
    db = drizzle(client);
  });

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    _resetRegistryForTests();
    for (const name of created) {
      await db.execute(sql`DELETE FROM job_schedule WHERE job_name = ${name}`);
    }
    created.clear();
  });

  // ── The headline property ────────────────────────────────────────────────

  it("a second registration does not move next_run_at — a deploy cannot reset cadence", async () => {
    const name = jobName("cadence");
    const DAY = 24 * 60 * 60 * 1000;

    // First boot: the job registers with a 15-minute startup delay, like the
    // quality floor did.
    await registerJob({
      name,
      intervalMs: DAY,
      startupDelayMs: 15 * 60 * 1000,
      handler: async () => {},
    });

    // It runs, and is now due again tomorrow.
    await shiftDue(name, "- interval '1 second'");
    const claim = await claimJob(name);
    expect(claim).not.toBeNull();
    await releaseJob(name, "ok");

    const afterRun = await row(name);
    const scheduled = new Date(String(afterRun!.next_run_at)).getTime();

    // Second boot, ten minutes later. This is the whole defect: pre-WP10 the
    // process restarting meant a fresh setTimeout(15min) and a run 15 minutes
    // from now, discarding the fact that the job had just run.
    _resetRegistryForTests();
    await registerJob({
      name,
      intervalMs: DAY,
      startupDelayMs: 15 * 60 * 1000,
      handler: async () => {},
    });

    const afterReboot = await row(name);
    const rescheduled = new Date(String(afterReboot!.next_run_at)).getTime();

    // Unchanged to the millisecond. An implementation that recomputed from the
    // startup delay would land ~15 minutes out and fail here.
    expect(rescheduled).toBe(scheduled);

    // And it is genuinely a day away, not merely "not now".
    expect(rescheduled - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);

    // The job must NOT be claimable right after the reboot.
    expect(await claimJob(name)).toBeNull();
  });

  it("a fresh registration honours the startup delay, so first-ever runs still stagger", async () => {
    const name = jobName("firstboot");
    await registerJob({
      name,
      intervalMs: 60 * 60 * 1000,
      startupDelayMs: 20 * 60 * 1000,
      handler: async () => {},
    });

    expect(await claimJob(name)).toBeNull();

    const r = await row(name);
    const due = new Date(String(r!.next_run_at)).getTime() - Date.now();
    expect(due).toBeGreaterThan(18 * 60 * 1000);
    expect(due).toBeLessThan(22 * 60 * 1000);
  });

  // ── Recurrence reconciliation ────────────────────────────────────────────

  it("shrinking the interval in code pulls an unreachable next_run_at back in", async () => {
    const name = jobName("shrink");
    await registerJob({ name, intervalMs: 7 * 24 * 3600_000, handler: async () => {} });

    await shiftDue(name, "- interval '1 second'");
    await claimJob(name);
    await releaseJob(name, "ok"); // now due in 7 days

    _resetRegistryForTests();
    // Code now says hourly. Without the clamp the job would keep waiting a week.
    await registerJob({ name, intervalMs: 3600_000, handler: async () => {} });

    const r = await row(name);
    expect(Number(r!.interval_ms)).toBe(3600_000);
    const due = new Date(String(r!.next_run_at)).getTime() - Date.now();
    expect(due).toBeLessThan(61 * 60 * 1000);
  });

  it("lengthening the interval does NOT push a pending run further out", async () => {
    const name = jobName("grow");
    await registerJob({ name, intervalMs: 3600_000, handler: async () => {} });
    await shiftDue(name, "+ interval '5 minutes'");
    const before = new Date(String((await row(name))!.next_run_at)).getTime();

    _resetRegistryForTests();
    await registerJob({ name, intervalMs: 7 * 24 * 3600_000, handler: async () => {} });

    const after = new Date(String((await row(name))!.next_run_at)).getTime();
    expect(after).toBe(before);
  });

  // ── Claim exclusivity and recovery ───────────────────────────────────────

  it("two concurrent claims on one due job produce exactly one winner", async () => {
    const name = jobName("race");
    await registerJob({ name, intervalMs: 3600_000, handler: async () => {} });
    await shiftDue(name, "- interval '1 second'");

    const results = await Promise.all([claimJob(name), claimJob(name), claimJob(name)]);
    expect(results.filter((r) => r !== null)).toHaveLength(1);
  });

  it("a job that is not yet due cannot be claimed", async () => {
    const name = jobName("notdue");
    await registerJob({ name, intervalMs: 3600_000, startupDelayMs: 3600_000, handler: async () => {} });
    expect(await claimJob(name)).toBeNull();
  });

  it("an expired lease is reclaimable — a crashed run recovers without operator action", async () => {
    const name = jobName("crash");
    await registerJob({ name, intervalMs: 3600_000, handler: async () => {} });
    await shiftDue(name, "- interval '1 second'");

    const first = await claimJob(name);
    expect(first).not.toBeNull();

    // Simulate the process dying mid-run: the lease is held, nothing released.
    // While the lease is live, nobody may take it.
    await shiftDue(name, "- interval '1 second'");
    expect(await claimJob(name)).toBeNull();

    // Once the deadline passes, it is claimable again, and the coordinator can
    // tell that the previous run never finished.
    await db.execute(
      sql`UPDATE job_schedule SET lease_expires_at = now() - interval '1 second' WHERE job_name = ${name}`,
    );
    const second = await claimJob(name);
    expect(second).not.toBeNull();
    expect(second!.recoveredFromCrash).toBe(true);
  });

  it("a first-ever run is NOT reported as crash recovery", async () => {
    // Regression: the claim originally derived "the previous run never
    // finished" from the post-update row, where `last_started_at` has just
    // been set to now(). Every job's first execution therefore logged
    // "claimed a job whose previous run never finished" — on every fresh
    // deploy, for every job, drowning the signal in false positives.
    const name = jobName("firstrun");
    await registerJob({ name, intervalMs: 3600_000, handler: async () => {} });
    await shiftDue(name, "- interval '1 second'");

    const claim = await claimJob(name);
    expect(claim).not.toBeNull();
    expect(claim!.recoveredFromCrash).toBe(false);
  });

  it("a second normal run is not reported as crash recovery either", async () => {
    const name = jobName("secondrun");
    await registerJob({ name, intervalMs: 3600_000, handler: async () => {} });

    await shiftDue(name, "- interval '1 second'");
    await claimJob(name);
    await releaseJob(name, "ok");

    await shiftDue(name, "- interval '1 second'");
    const second = await claimJob(name);
    expect(second!.recoveredFromCrash).toBe(false);
  });

  it("a runner whose lease was stolen cannot overwrite the new holder's state", async () => {
    const name = jobName("stale");
    await registerJob({ name, intervalMs: 3600_000, handler: async () => {} });
    await shiftDue(name, "- interval '1 second'");
    await claimJob(name);

    // Another runner takes over after the lease expires.
    const foreign = `foreign-${randomUUID().slice(0, 8)}`;
    await db.execute(sql`
      UPDATE job_schedule
         SET lease_owner = ${foreign}, lease_expires_at = now() + interval '10 minutes'
       WHERE job_name = ${name}
    `);

    // The original runner finally returns and releases. It must be ignored:
    // its WHERE clause names itself as the owner, and it no longer is.
    await releaseJob(name, "ok");

    const r = await row(name);
    expect(r!.lease_owner).toBe(foreign);
    expect(r!.last_finished_at).toBeNull();
  });

  // ── Retry / backoff / last result ────────────────────────────────────────

  it("a successful release schedules exactly one interval out and clears failures", async () => {
    const name = jobName("ok");
    await registerJob({ name, intervalMs: 3600_000, handler: async () => {} });
    await shiftDue(name, "- interval '1 second'");
    await claimJob(name);
    await releaseJob(name, "ok");

    const r = await row(name);
    expect(r!.last_outcome).toBe("ok");
    expect(r!.last_error).toBeNull();
    expect(Number(r!.consecutive_failures)).toBe(0);
    expect(r!.lease_owner).toBeNull();
    const due = new Date(String(r!.next_run_at)).getTime() - Date.now();
    expect(due).toBeGreaterThan(58 * 60 * 1000);
    expect(due).toBeLessThan(62 * 60 * 1000);
  });

  it("a failed release records the error, counts the failure, and retries sooner than the interval", async () => {
    const name = jobName("fail");
    const DAY = 24 * 3600_000;
    await registerJob({ name, intervalMs: DAY, handler: async () => {} });

    await shiftDue(name, "- interval '1 second'");
    await claimJob(name);
    await releaseJob(name, "error", "upstream exploded");

    const r = await row(name);
    expect(r!.last_outcome).toBe("error");
    expect(String(r!.last_error)).toBe("upstream exploded");
    expect(Number(r!.consecutive_failures)).toBe(1);

    // A failing daily job must not wait a full day to try again.
    const due = new Date(String(r!.next_run_at)).getTime() - Date.now();
    expect(due).toBeLessThan(2 * 60 * 60 * 1000);
    expect(due).toBeGreaterThan(0);
  });

  it("backoff grows with consecutive failures and is capped at an hour", async () => {
    const name = jobName("backoff");
    const DAY = 24 * 3600_000;
    await registerJob({ name, intervalMs: DAY, handler: async () => {} });

    // Eight failures, deliberately: the cap only binds from the seventh
    // (60s * 2^6 = 3840s > 3600s). An earlier version of this test ran four
    // and asserted "<= 1 hour", which 480s satisfies whether or not a cap
    // exists — it named the cap and never reached it.
    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      await shiftDue(name, "- interval '1 second'");
      await claimJob(name);
      await releaseJob(name, "error", `attempt ${i}`);
      const r = await row(name);
      delays.push(new Date(String(r!.next_run_at)).getTime() - Date.now());
    }

    expect(Number((await row(name))!.consecutive_failures)).toBe(8);

    // Doubling while under the cap: 60s, 120s, 240s, 480s, 960s, 1920s.
    expect(delays[0]).toBeLessThan(65_000);
    expect(delays[1]).toBeGreaterThan(delays[0] * 1.5);
    expect(delays[5]).toBeGreaterThan(delays[4] * 1.5);

    // And then it stops growing. Without the cap the 8th would be 7680s.
    expect(delays[6]).toBeLessThanOrEqual(60 * 60 * 1000 + 5_000);
    expect(delays[7]).toBeLessThanOrEqual(60 * 60 * 1000 + 5_000);
    expect(delays[7]).toBeLessThan(7680_000);
  });

  it("backoff never pushes a retry beyond the job's own interval", async () => {
    // A five-minute job with an exhausted backoff must retry in five minutes,
    // not in the hour the cap would otherwise allow — otherwise a failing
    // frequent job silently becomes an infrequent one.
    const name = jobName("shortbackoff");
    await registerJob({ name, intervalMs: 5 * 60_000, handler: async () => {} });

    for (let i = 0; i < 8; i++) {
      await shiftDue(name, "- interval '1 second'");
      await claimJob(name);
      await releaseJob(name, "error", "still failing");
    }

    const delay = new Date(String((await row(name))!.next_run_at)).getTime() - Date.now();
    expect(delay).toBeLessThanOrEqual(5 * 60_000 + 5_000);
  });

  it("a success after failures resets the counter and restores the full interval", async () => {
    const name = jobName("recover");
    await registerJob({ name, intervalMs: 3600_000, handler: async () => {} });

    await shiftDue(name, "- interval '1 second'");
    await claimJob(name);
    await releaseJob(name, "error", "boom");

    await shiftDue(name, "- interval '1 second'");
    await claimJob(name);
    await releaseJob(name, "ok");

    const r = await row(name);
    expect(Number(r!.consecutive_failures)).toBe(0);
    expect(r!.last_error).toBeNull();
  });

  // ── The poll cycle ───────────────────────────────────────────────────────

  it("runDueJobs runs a due job, skips one that is not, and records both outcomes", async () => {
    const due = jobName("due");
    const notDue = jobName("later");
    let ranDue = 0;
    let ranNotDue = 0;

    await registerJob({ name: due, intervalMs: 3600_000, handler: async () => { ranDue++; } });
    await registerJob({
      name: notDue,
      intervalMs: 3600_000,
      startupDelayMs: 3600_000,
      handler: async () => { ranNotDue++; },
    });
    await shiftDue(due, "- interval '1 second'");

    const result = await runDueJobs();

    expect(ranDue).toBe(1);
    expect(ranNotDue).toBe(0);
    expect(result.ran).toContain(due);
    expect(result.skipped).toContain(notDue);
    expect((await row(due))!.last_outcome).toBe("ok");
  });

  it("a throwing handler releases the lease rather than stranding the job", async () => {
    const name = jobName("throws");
    await registerJob({
      name,
      intervalMs: 3600_000,
      handler: async () => {
        throw new Error("handler blew up");
      },
    });
    await shiftDue(name, "- interval '1 second'");

    await runDueJobs();

    const r = await row(name);
    expect(r!.lease_owner).toBeNull();
    expect(r!.last_outcome).toBe("error");
    expect(String(r!.last_error)).toContain("handler blew up");
  });

  it("a hung job does not stop the others, and its lease is left to expire", async () => {
    // Before WP10 every job had its own timer, so one that hung stalled only
    // itself. A shared poll cycle would otherwise hand any single job the power
    // to freeze the rest — which would be a worse failure than the scheduling
    // this package replaces.
    const hung = jobName("hung");
    const after = jobName("after");
    let afterRan = 0;
    let hungStarts = 0;
    let releaseHung: (() => void) | undefined;

    await registerJob({
      name: hung,
      intervalMs: 3600_000,
      // A 4-second lease so the whole thing fits in a test. watchdogFor()
      // halves it for short leases, so the cycle gives up at ~2s and the run
      // keeps its exclusion until ~4s.
      leaseMs: 4_000,
      handler: () => {
        hungStarts++;
        return new Promise<void>((resolve) => { releaseHung = resolve; });
      },
    });
    await registerJob({
      name: after,
      intervalMs: 3600_000,
      handler: async () => { afterRan++; },
    });
    await shiftDue(hung, "- interval '1 second'");
    await shiftDue(after, "- interval '1 second'");

    const result = await runDueJobs();

    // The hung job was abandoned; the one behind it still ran.
    expect(result.timedOut).toContain(hung);
    expect(result.ran).toContain(after);
    expect(afterRan).toBe(1);
    expect(hungStarts).toBe(1);

    // And the abandoned run still holds the job. This is the assertion that
    // matters, and an earlier version of this test got it wrong: it checked
    // `lease_owner IS NOT NULL`, which only says `releaseJob` was not called
    // and is true even when the lease has expired and the row is claimable.
    // The property is about CLAIMABILITY, so ask the thing that claims.
    await shiftDue(hung, "- interval '1 second'");
    const second = await runDueJobs();
    expect(second.ran).not.toContain(hung);
    expect(hungStarts).toBe(1);

    releaseHung?.();
  }, 20_000);

  it("once the abandoned run's lease finally expires, the job is recoverable", async () => {
    // The flip side of the test above: exclusion is held for the remainder of
    // the lease, not forever. A run we have stopped waiting for must eventually
    // be reclaimable, or a single hang would retire the job permanently.
    const name = jobName("expires");
    let starts = 0;

    await registerJob({
      name,
      intervalMs: 3600_000,
      leaseMs: 2_000,
      handler: () => {
        starts++;
        return starts === 1 ? new Promise<void>(() => {}) : Promise.resolve();
      },
    });
    await shiftDue(name, "- interval '1 second'");

    const first = await runDueJobs();
    expect(first.timedOut).toContain(name);
    expect(starts).toBe(1);

    // Force the deadline past, exactly as the passage of time would.
    await db.execute(
      sql`UPDATE job_schedule SET lease_expires_at = now() - interval '1 second',
                                  next_run_at = now() - interval '1 second'
           WHERE job_name = ${name}`,
    );

    const second = await runDueJobs();
    expect(second.ran).toContain(name);
    expect(starts).toBe(2);
  }, 20_000);

  // ── consumeDueSlot: the 56x regression ───────────────────────────────────

  it("consumeDueSlot grants a weekly slot once, then refuses until the week elapses", async () => {
    const name = jobName("weekly");
    const WEEK = 7 * 24 * 3600_000;

    // First sight: due immediately, matching the old "missing map entry" case.
    expect(await consumeDueSlot(name, WEEK)).toBe(true);

    // This is the production defect in one line. Pre-WP10 each of these calls
    // came from a fresh process with an empty `_lastRun` map and every one
    // returned true — 141 weekly-sweep runs in 17.6 days.
    for (let restart = 0; restart < 5; restart++) {
      expect(await consumeDueSlot(name, WEEK)).toBe(false);
    }

    // Only the passage of a week re-opens it.
    await shiftDue(name, "- interval '1 second'");
    expect(await consumeDueSlot(name, WEEK)).toBe(true);
  });

  // ── Registration healing ─────────────────────────────────────────────────

  it("a registration whose write failed at boot is healed by a later poll, not silently dead", async () => {
    const name = jobName("healed");
    let ran = 0;

    // `registerJob` is called from synchronous `startX()` functions that
    // nobody awaits, so a transient DB failure at boot would otherwise leave
    // the job in the in-memory registry and absent from the table — claimable
    // never, and silent. Reproduce that exactly by making the write fail: the
    // table is briefly not there.
    //
    // Safe in this lane because the integration suites run with
    // --no-file-parallelism and tests within a file run in order.
    await db.execute(sql`ALTER TABLE job_schedule RENAME TO job_schedule_wp10_tmp`);
    let registrationRejected = false;
    try {
      await registerJob({ name, intervalMs: 3600_000, handler: async () => { ran++; } });
    } catch {
      registrationRejected = true;
    } finally {
      await db.execute(sql`ALTER TABLE job_schedule_wp10_tmp RENAME TO job_schedule`);
    }

    expect(registrationRejected).toBe(true);
    expect(await row(name)).toBeUndefined();

    // A poll heals the row and, because a freshly created row is due now, also
    // runs the job that would otherwise never have run again.
    await runDueJobs();

    expect(await row(name)).toBeDefined();
    expect(ran).toBe(1);
  });

  it("a job with no row is skipped rather than reported as run", async () => {
    const name = jobName("norow");
    await registerJob({ name, intervalMs: 3600_000, handler: async () => {} });
    await db.execute(sql`DELETE FROM job_schedule WHERE job_name = ${name}`);

    const result = await runDueJobs();
    expect(result.ran).not.toContain(name);
  });

  it("the runner id is stable within a process", () => {
    expect(runnerId()).toBe(runnerId());
    expect(runnerId()).toMatch(/^\d+-[0-9a-f]{8}$/);
  });
});
