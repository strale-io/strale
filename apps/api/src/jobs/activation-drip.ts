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
import { sendDay2NudgeEmail, sendDay5ReminderEmail } from "../lib/activation-emails.js";
import { logWarn } from "../lib/log.js";

const DRIP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STARTUP_DELAY_MS = 90_000; // 90 seconds
const ADVISORY_LOCK_ID = 20260402; // unique lock ID for this job

let _running = false;

async function runActivationDrip(): Promise<void> {
  const db = getDb();

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
      logWarn("activation-drip-lock-busy", "another holder; skipping tick");
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
        console.log(`[activation-drip] Day-2 nudge sent to ${user.email}`);
      } catch (err) {
        console.warn(`[activation-drip] Day-2 failed for ${user.email}:`, err instanceof Error ? err.message : err);
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
        console.log(`[activation-drip] Day-5 reminder sent to ${user.email}`);
      } catch (err) {
        console.warn(`[activation-drip] Day-5 failed for ${user.email}:`, err instanceof Error ? err.message : err);
      }
    }

    const total = day2Users.length + day5Users.length;
    if (total > 0) {
      console.log(`[activation-drip] Sent ${day2Users.length} day-2 + ${day5Users.length} day-5 emails`);
    }
  });
}

export function startActivationDrip(): void {
  if (_running) return;
  _running = true;

  console.log("[activation-drip] Started (6h interval, 90s initial delay)");

  setTimeout(() => {
    runActivationDrip().catch((err) =>
      console.error("[activation-drip] Startup run failed:", err),
    );
  }, STARTUP_DELAY_MS);

  setInterval(() => {
    runActivationDrip().catch((err) =>
      console.error("[activation-drip] Scheduled run failed:", err),
    );
  }, DRIP_INTERVAL_MS);
}
