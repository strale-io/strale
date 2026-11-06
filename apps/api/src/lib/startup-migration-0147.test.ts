import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  SERPER_RENEWAL,
  runMigration0147_reconcileSerperRenewal,
} from "../startup-migrations/blocks/0147-reconcile-serper-renewal.js";
import { BLOCKS } from "./startup-migrations.js";
import { BLOCK_RUN_POLICY } from "../startup-migrations/run-policy.js";
import type { MigrationExecutor } from "../startup-migrations/types.js";

const dialect = new PgDialect();
function recordingTx(count: number) {
  const queries: { sql: string; params: unknown[] }[] = [];
  const tx = {
    execute: async (q: SQL) => {
      queries.push(dialect.sqlToQuery(q));
      return { count };
    },
  } as unknown as MigrationExecutor;
  return { tx, queries };
}

describe("block 0147: Serper renewal reconciled into the vendor control tower", () => {
  it("is registered to run at startup, once", () => {
    expect(BLOCKS).toContain(runMigration0147_reconcileSerperRenewal);
    expect(BLOCK_RUN_POLICY.runMigration0147_reconcileSerperRenewal.policy).toBe("once");
  });

  it("updates only the Serper counter row that still carries the May pack's expiry", async () => {
    const { tx, queries } = recordingTx(1);
    const result = await runMigration0147_reconcileSerperRenewal(tx);
    expect(queries).toHaveLength(1);
    const text = queries[0].sql.replace(/\s+/g, " ").trim();
    expect(text).toMatch(/^UPDATE vendor_accounts SET /);
    expect(text).toContain("WHERE provider_name = $");
    expect(text).toContain("AND monitor_mode = 'internal_counter'");
    expect(text).toMatch(/AND expires_at = \$\d+::timestamptz$/);
    expect(queries[0].params).toContain("serper");
    expect(queries[0].params).toContain("2026-11-08T00:00:00Z");
    expect(queries[0].params).toContain("2027-05-05T00:00:00Z");
    expect(result.rows_affected).toBe(1);
  });

  it("counts only the new pack, less the margin, and never overstates the balance", async () => {
    const { tx, queries } = recordingTx(1);
    await runMigration0147_reconcileSerperRenewal(tx);
    const p = queries[0].params;
    expect(p).toContain(SERPER_RENEWAL.includedUnits);
    expect(p).toContain(SERPER_RENEWAL.marginUnits);
    expect(p).toContain(SERPER_RENEWAL.includedUnits - SERPER_RENEWAL.marginUnits);
    // 97,487 (old + new) must never be written: a lapsed May pack would make it a lie.
    for (const v of p) expect(v).not.toBe(97487);
  });

  it("binds no Date and reports a no-op when the row has moved on", async () => {
    const { tx, queries } = recordingTx(0);
    const result = await runMigration0147_reconcileSerperRenewal(tx);
    for (const v of queries[0].params) expect(v instanceof Date).toBe(false);
    expect(result.outcome).toMatch(/no change/);
  });
});
