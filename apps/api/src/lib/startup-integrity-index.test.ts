import { expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { BLOCKS, runMigration0030_complianceColumns, runMigration0127_integrityHashIndex } from "./startup-migrations.js";

const dialect = new PgDialect();
function fixture(index: { indisvalid: boolean } | undefined) {
  const statements: string[] = [];
  const execute = vi.fn(async (query: SQL) => {
    const { sql, params } = dialect.sqlToQuery(query);
    expect(params.some((p) => p instanceof Date || Buffer.isBuffer(p))).toBe(false);
    statements.push(sql.trim());
    if (sql.includes("information_schema.columns")) return [{ cnt: "1" }];
    return index ? [index] : [];
  });
  const release = vi.fn();
  const unsafe = vi.fn(async (text: string) => { statements.push(text); return []; });
  const reserve = vi.fn(async () => ({ unsafe, release }));
  return { tx: { execute, $client: { reserve } }, statements, reserve, release, unsafe };
}

it("skips the column-gated historical block and runs no DDL for an existing valid index", async () => {
  const f = fixture({ indisvalid: true });
  await runMigration0030_complianceColumns(f.tx);
  expect(f.statements).toHaveLength(1);
  expect(BLOCKS).toContain(runMigration0127_integrityHashIndex);
  f.statements.length = 0;
  const result = await runMigration0127_integrityHashIndex(f.tx);
  expect(result.outcome).toContain("skipped");
  expect(f.statements).toHaveLength(1);
  expect(f.statements[0]).toMatch(/^SELECT i.indisvalid FROM pg_index/);
  expect(f.statements[0]).toContain("i.indrelid = 'transactions'::regclass");
  expect(f.statements[0]).toContain("c.relname = 'transactions_integrity_hash_idx'");
  expect(f.reserve).not.toHaveBeenCalled();
});

for (const invalid of [false, true]) it(`${invalid ? "repairs an invalid" : "creates a missing"} index concurrently on a reserved session`, async () => {
  const f = fixture(invalid ? { indisvalid: false } : undefined);
  await runMigration0127_integrityHashIndex(f.tx);
  expect(f.tx.execute).toHaveBeenCalledTimes(1);
  expect(f.reserve).toHaveBeenCalledTimes(1);
  expect(f.statements.slice(1)).toEqual([
    "SET lock_timeout = '3s'", "SET statement_timeout = 0",
    ...(invalid ? ['DROP INDEX CONCURRENTLY IF EXISTS "transactions_integrity_hash_idx"'] : []),
    'CREATE INDEX CONCURRENTLY IF NOT EXISTS "transactions_integrity_hash_idx" ON "transactions" ("integrity_hash")',
    "RESET statement_timeout", "RESET lock_timeout",
  ]);
  expect(f.release).toHaveBeenCalledTimes(1);
});

it("resets timeouts and releases the reserved session after a failed build", async () => {
  const f = fixture(undefined);
  f.unsafe.mockImplementation(async (text) => {
    f.statements.push(text);
    if (text.startsWith("CREATE INDEX")) throw new Error("build failed");
    return [];
  });
  await expect(runMigration0127_integrityHashIndex(f.tx)).rejects.toThrow("build failed");
  expect(f.statements.slice(-2)).toEqual(["RESET statement_timeout", "RESET lock_timeout"]);
  expect(f.release).toHaveBeenCalledTimes(1);
});
