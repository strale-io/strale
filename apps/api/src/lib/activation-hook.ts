/**
 * Activation hook — fires once on a user's first successful API call.
 * Sets first_transaction_at, activation_completed_at, activation_email_stage=3,
 * and sends the activation success email.
 * Fire-and-forget: never blocks the transaction response.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { users } from "../db/schema.js";

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

  console.log(`[activation] User ${user.email} made first API call (${capabilitySlug})`);

  // Send activation success email (fire-and-forget)
  try {
    const { sendActivationSuccessEmail } = await import("./activation-emails.js");
    await sendActivationSuccessEmail(user.email, capabilitySlug);
  } catch (err) {
    console.warn("[activation] Success email failed:", err instanceof Error ? err.message : err);
  }
}
