/**
 * Activation hook — fires once on a user's first successful API call.
 * Sets first_transaction_at, activation_completed_at, activation_email_stage=3,
 * and sends the activation success email.
 * Fire-and-forget: never blocks the transaction response.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";
import { log, logWarn } from "./log.js";

export async function onFirstTransaction(userId: string, capabilitySlug: string): Promise<void> {
  const db = getDb();

  const [user] = await db
    .select({ firstTransactionAt: users.firstTransactionAt, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.firstTransactionAt) return; // Already activated

  const now = new Date();
  await db
    .update(users)
    .set({
      firstTransactionAt: now,
      activationCompletedAt: now,
      activationEmailStage: 3,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  log.info(
    { label: "activation-first-transaction", user_id: userId, capability_slug: capabilitySlug },
    "activation-first-transaction",
  );

  // Send activation success email (fire-and-forget)
  try {
    const { sendActivationSuccessEmail } = await import("./activation-emails.js");
    await sendActivationSuccessEmail(user.email, capabilitySlug);
  } catch (err) {
    logWarn("activation-success-email-failed", "activation success email failed", {
      user_id: userId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}
