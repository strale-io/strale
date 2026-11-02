import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0088 — gate conditions on solution steps.
 *
 * A bundle had no way to say "if this precondition fails, stop and do not
 * charge". Combined with the billing rule — refund only when EVERY step fails
 * — any bundle whose first step can legitimately report "there is nothing
 * here" billed in full for the remaining wasted steps. `page-seo-check` on an
 * unreachable URL is the worked example: url-health-check succeeds reporting
 * is_up=false, the other three fail, one success is enough to bill.
 *
 * Additive nullable column; existing rows keep NULL and behave exactly as
 * before. No backlog to drain (DEC-20260504-B does not apply).
 */
export async function runMigration0088_solutionGateCondition(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`ALTER TABLE solution_steps ADD COLUMN IF NOT EXISTS gate_condition JSONB`);
  return { block: "0088_solutionGateCondition", outcome: "applied", duration_ms: Date.now() - startedAt };
}
