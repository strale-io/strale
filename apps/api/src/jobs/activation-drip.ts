/**
 * Activation Drip — sends timed nudge emails to users who haven't made their first API call.
 *
 * Schedule: every 6 hours + once 90s after startup.
 * Uses pg_try_advisory_lock to prevent duplicate sends in multi-instance deployments.
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
import { logError } from "../lib/log.js";

const DRIP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const STARTUP_DELAY_MS = 90_000; // 90 seconds
const ADVISORY_LOCK_ID = 20260402; // unique lock ID for this job

let _running = false;

async function runActivationDrip(): Promise<void> {
  const db = getDb();

  // Advisory lock: prevent duplicate runs across instances
  const [lock] = await db.execute(sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_ID}) AS acquired`);
  if (!(lock as any)?.acquired) {
    console.log("[activation-drip] Another instance holds the lock — skipping");
    return;
  }

  try {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const fiveDaysAgo = new Date(now.getTime() - 120 * 60 * 60 * 1000);

    // Find users needing day-2 nudge: signed up 48h+ ago, stage 0, not activated
    const day2Users = await db
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
        await db.update(users).set({ activationEmailStage: 1, updatedAt: now }).where(eq(users.id, user.id));
        console.log(`[activation-drip] Day-2 nudge sent to ${user.email}`);
      } catch (err) {
        console.warn(`[activation-drip] Day-2 failed for ${user.email}:`, err instanceof Error ? err.message : err);
      }
    }

    // Find users needing day-5 reminder: signed up 120h+ ago, stage 1, not activated
    const day5Users = await db
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
        await db.update(users).set({ activationEmailStage: 2, updatedAt: now }).where(eq(users.id, user.id));
        console.log(`[activation-drip] Day-5 reminder sent to ${user.email}`);
      } catch (err) {
        console.warn(`[activation-drip] Day-5 failed for ${user.email}:`, err instanceof Error ? err.message : err);
      }
    }

    const total = day2Users.length + day5Users.length;
    if (total > 0) {
      console.log(`[activation-drip] Sent ${day2Users.length} day-2 + ${day5Users.length} day-5 emails`);
    }
  } finally {
    // Release advisory lock
    await db
      .execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_ID})`)
      .catch((err) => logError("advisory-unlock-failed", err, { job: "activation-drip" }));
  }
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
