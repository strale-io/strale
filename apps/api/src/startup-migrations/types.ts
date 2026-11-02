import type { SQL } from "drizzle-orm";

/**
 * Minimal executor surface — matches what `getDb().execute()` returns
 * but lets the regression tests inject a stub without touching prod.
 */
export interface MigrationExecutor {
  execute(query: SQL): Promise<unknown>;
}

export interface BlockResult {
  /** Stable label, also the log line's `label` field. */
  block: string;
  /** Human-readable description of what changed (or "skipped"). */
  outcome: string;
  /** Rows affected by the block's primary write, if applicable. */
  rows_affected?: number;
  duration_ms: number;
}
