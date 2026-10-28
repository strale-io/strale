import { DrizzleQueryError } from "drizzle-orm/errors";
import { PgDialect } from "drizzle-orm/pg-core";
import type { Sql } from "postgres";
import { pgErrorCode } from "./db-error.js";
import { startupErrorDetails } from "./startup-error.js";
import { log } from "./log.js";
import type { BlockResult, MigrationExecutor } from "./startup-migrations.js";

/** Shared across the pass: contended attempts and backoffs, not ordinary work. */
export interface MigrationLockBudget { remainingMs: number }
const dialect = new PgDialect();
type Block = (tx: MigrationExecutor) => Promise<BlockResult>;

async function executeReservedBlock(
  block: Block, pool: Sql, sessions: Sql, lockWaitMs: number,
  onResetFailure: () => void,
) {
  const connection = await sessions.reserve();
  let failure: unknown;
  try {
    // No transaction: some blocks require autocommit. A reserved postgres-js
    // session lacks drizzle()'s required options. Compile SQL with its dialect
    // and preserve drizzle's wrapping, keeping bind values out of diagnostics.
    await connection.unsafe("SELECT set_config('lock_timeout', $1, false)", [`${lockWaitMs}ms`]);
    return await block({
      $client: pool,
      async execute(query) {
        const compiled = dialect.sqlToQuery(query);
        try {
          return await connection.unsafe(compiled.sql,
            compiled.params as NonNullable<Parameters<typeof connection.unsafe>[1]>);
        } catch (err) {
          throw new DrizzleQueryError(compiled.sql, compiled.params, err as Error);
        }
      },
    } as MigrationExecutor & { $client: Sql });
  } catch (err) {
    failure = err;
    throw err;
  } finally {
    let reset = false;
    try {
      await connection.unsafe("RESET lock_timeout");
      reset = true;
    } catch (err) {
      log.error({ label: "startup-migration-session-reset-failed", block: block.name,
        ...startupErrorDetails(err) }, "startup-migration-session-reset-failed");
      // This pool belongs only to the runner. Kill its sessions rather than
      // return an altered session to any reusable pool; keep the primary error.
      onResetFailure();
      try { await sessions.end({ timeout: 0 }); }
      finally { throw failure ?? err; }
    } finally {
      if (reset) connection.release();
    }
  }
}

export async function runStartupMigrationBlock(
  block: Block, pool: Sql, sessions: Sql, budget: MigrationLockBudget,
): Promise<BlockResult> {
  let resetFailed = false;
  for (let attempt = 1; ; attempt++) {
    const startedAt = Date.now();
    try {
      // Every block's first attempt gets the full per-attempt wait, so an
      // exhausted budget never turns a brief lock wait into a boot failure;
      // the budget only limits retries. Short waits keep readers of the table
      // from queuing behind the ALTER for long.
      const lockWaitMs = attempt === 1 ? 2_000 : Math.max(500, Math.min(2_000, budget.remainingMs));
      const result = await executeReservedBlock(block, pool, sessions,
        lockWaitMs, () => { resetFailed = true; });
      // A successful retry can still have spent seconds waiting for the lock.
      if (attempt > 1) budget.remainingMs -= Date.now() - startedAt;
      return result;
    } catch (err) {
      const code = pgErrorCode(err);
      const lockContention = code === "55P03" || code === "40P01";
      if (lockContention) budget.remainingMs -= Date.now() - startedAt;
      const delayMs = 500 * 2 ** (attempt - 1);
      if (resetFailed || !lockContention || attempt >= 5 || budget.remainingMs <= delayMs) {
        log.error({ label: "startup-migration-block-failed", block: block.name,
          attempt, ...startupErrorDetails(err) }, "startup-migration-block-failed");
        if (typeof err === "object" && err !== null) {
          (err as { startupBlock?: string }).startupBlock = block.name;
        }
        throw err;
      }
      log.warn({ label: "startup-migration-block-retry", block: block.name,
        attempt, sqlstate: code, delay_ms: delayMs,
        ...startupErrorDetails(err) }, "startup-migration-block-retry");
      budget.remainingMs -= delayMs;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
