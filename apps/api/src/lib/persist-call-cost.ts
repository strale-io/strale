import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { snapshotCallCost } from "./call-cost.js";
import { logError } from "./log.js";
import { fireAndForget } from "./fire-and-forget.js";

/** Call only AFTER the debit/terminal transaction commits. Capture the snapshot
 * now; schedule the UPDATE separately so no cost failure or latency reaches money.
 * Strings/null only at SQL bind sites: DEC-20260504-A, PR-43.
 */
export function persistCallCost(transactionId: string | null | undefined): void {
  if (!transactionId) return;
  try {
    const snapshot = snapshotCallCost();
    fireAndForget(async () => {
      await getDb().execute(sql`UPDATE transactions
        SET cost_cents = ${snapshot.cost_cents}::numeric,
            cost_breakdown = ${JSON.stringify(snapshot.cost_breakdown)}::jsonb
        WHERE id = ${transactionId}::uuid`);
    }, { label: "transaction-cost-write-failed", context: { transaction_id: transactionId } });
  } catch (error) {
    logError("transaction-cost-write-failed", error, { transaction_id: transactionId });
  }
}
