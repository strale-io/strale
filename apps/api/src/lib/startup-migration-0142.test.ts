import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  CANADIAN_KNOWN_BAD_SUITE_ID,
  CANADIAN_NAME_PATH_SUITE_ID,
  runMigration0142_canadianPaidCallSuites,
} from "../startup-migrations/blocks/0142-canadian-paid-call-suites.js";
import { PAID_CALL_QUARANTINE_MARKER } from "./paid-call-guard.js";
import type { MigrationExecutor } from "../startup-migrations/types.js";

const dialect = new PgDialect();

function recordingTx(counts: number[]) {
  const queries: { sql: string; params: unknown[] }[] = [];
  let i = 0;
  const tx = {
    execute: async (q: SQL) => {
      queries.push(dialect.sqlToQuery(q));
      return { count: counts[i++] ?? 0 };
    },
  } as unknown as MigrationExecutor;
  return { tx, queries };
}

describe("block 0142: canadian paid-call suites", () => {
  it("un-parks only the named known_answer row while it carries the paid-call marker", async () => {
    const { tx, queries } = recordingTx([1, 1]);
    await runMigration0142_canadianPaidCallSuites(tx);
    const q = queries[0];
    expect(q.sql).toMatch(/SET test_status = 'normal',\s+quarantine_reason = NULL/);
    expect(q.sql).toContain("capability_slug = 'canadian-company-data'");
    expect(q.sql).toContain("test_type = 'known_answer'");
    expect(q.sql).toContain("test_status = 'quarantined'");
    expect(q.sql).toContain("starts_with(quarantine_reason,");
    expect(q.params).toEqual([CANADIAN_NAME_PATH_SUITE_ID, PAID_CALL_QUARANTINE_MARKER]);
  });

  it("deactivates only the named known_bad row while it is active", async () => {
    const { tx, queries } = recordingTx([1, 1]);
    await runMigration0142_canadianPaidCallSuites(tx);
    const q = queries[1];
    expect(q.sql).toMatch(/SET active = false\s+WHERE/);
    expect(q.sql).toContain("test_type = 'known_bad'");
    expect(q.sql).toContain("AND active = true");
    expect(q.params).toEqual([CANADIAN_KNOWN_BAD_SUITE_ID]);
  });

  it("never writes updated_at and binds no Date parameter (PR-43 class)", async () => {
    const { tx, queries } = recordingTx([0, 0]);
    await runMigration0142_canadianPaidCallSuites(tx);
    expect(queries).toHaveLength(2);
    for (const q of queries) {
      expect(q.sql).not.toContain("updated_at");
      for (const p of q.params) expect(p instanceof Date).toBe(false);
    }
  });

  it("reports the rows it changed, and no change on a re-run", async () => {
    expect((await runMigration0142_canadianPaidCallSuites(recordingTx([1, 1]).tx)).rows_affected).toBe(2);
    const again = await runMigration0142_canadianPaidCallSuites(recordingTx([0, 0]).tx);
    expect(again.rows_affected).toBe(0);
    expect(again.outcome).toContain("no change");
  });
});
