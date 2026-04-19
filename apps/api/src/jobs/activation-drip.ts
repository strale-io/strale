/**
 * Activation Drip — sends timed nudge emails to users who haven't made their first API call.
 *
 * Schedule: every 6 hours + once 90s after startup.
 * Uses pg_try_advisory_xact_lock inside a db.transaction to prevent duplicate
 * sends in multi-instance deployments (xact-scoped so the lock sits on the
 * same connection as the work and auto-releases on commit/rollback).
 *
 * Stages:
 *   0 → 1: Day-2 nudge (48h after signup)
 *   1 → 2: Day-5 reminder (120h after signup)
 *   3: Activation complete (set by transaction hook, not this job)
 */

import { sql, eq, and, lt, isNull } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { randomUUID } from "node:crypto";
import { sendDay2NudgeEmail, sendDay5ReminderEmail } from "../lib/activation-emails.js";
import { log, logError, logWarn } from "../lib/log.js";

const DRIP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STARTUP_DELAY_MS = 90_000; // 90 seconds
const ADVISORY_LOCK_ID = 20260402; // unique lock ID for this job

let _running = false;

async function runActivationDrip(): Promise<void> {
  const db = getDb();
  const runId = randomUUID();
  const jobLog = log.child({ job: "activation-drip", job_run_id: runId });

  // Advisory lock + all work runs inside a single transaction so the
  // xact-scoped lock sits on the same connection as every statement
  // and auto-releases at commit/rollback. The session-scoped
  // pg_try_advisory_lock variant broke on pool reuse (see Phase C
  // deploy notes in PHASE_C_DEPLOY_OBSERVATIONS.md).
  await db.transaction(async (tx) => {
    const [lock] = await tx.execute(
      sql`SELECT pg_try_advisory_xact_lock(${ADVISORY_LOCK_ID}) AS acquired`,
    );
    if (!(lock as { acquired?: boolean })?.acquired) {
      logWarn("activation-drip-lock-busy", "another holder; skipping tick", { job_run_id: runId });
      return;
    }

    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 120 * 60 * 60 * 1000);

    // Find users needing day-2 nudge: signed up 48h+ ago, stage 0, not activated
    const day2Users = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.activationEmailStage, 0),
          isNull(users.activationCompletedAt),
          lt(users.createdAt, twoDaysAgo),
        ),
      );

    for (const user of day2Users) {
      try {
        await sendDay2NudgeEmail(user.email);
        await tx.update(users).set({ activationEmailStage: 1, updatedAt: now }).where(eq(users.id, user.id));
        // F-0-013: log user.id, not email.
        jobLog.info({ label: "activation-drip-day2-sent", user_id: user.id }, "activation-drip-day2-sent");
      } catch (err) {
        jobLog.warn(
          { label: "activation-drip-day2-failed", user_id: user.id, err: err instanceof Error ? err.message : String(err) },
          "activation-drip-day2-failed",
        );
      }
    }

    // Find users needing day-5 reminder: signed up 120h+ ago, stage 1, not activated
    const day5Users = await tx
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.activationEmailStage, 1),
          isNull(users.activationCompletedAt),
          lt(users.createdAt, fiveDaysAgo),
        ),
      );

    for (const user of day5Users) {
      try {
        await sendDay5ReminderEmail(user.email);
        await tx.update(users).set({ activationEmailStage: 2, updatedAt: now }).where(eq(users.id, user.id));
        jobLog.info({ label: "activation-drip-day5-sent", user_id: user.id }, "activation-drip-day5-sent");
      } catch (err) {
        jobLog.warn(
          { label: "activation-drip-day5-failed", user_id: user.id, err: err instanceof Error ? err.message : String(err) },
          "activation-drip-day5-failed",
        );
      }
    }

    const total = day2Users.length + day5Users.length;
    if (total > 0) {
      jobLog.info(
        { label: "activation-drip-summary", day2: day2Users.length, day5: day5Users.length },
        "activation-drip-summary",
      );
    }
  });
}

export function startActivationDrip(): void {
  if (_running) return;
  _running = true;

  log.info(
    { label: "activation-drip-started", interval_ms: DRIP_INTERVAL_MS, startup_delay_ms: STARTUP_DELAY_MS },
    "activation-drip-started",
  );

  setTimeout(() => {
    runActivationDrip().catch((err) => logError("activation-drip-startup-run-failed", err));
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    runActivationDrip().catch((err) => logError("activation-drip-scheduled-run-failed", err));
  }, DRIP_INTERVAL_MS);
}
