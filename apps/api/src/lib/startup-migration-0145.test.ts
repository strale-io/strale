import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  VASP_ROUTING_LATENCY_MS,
  runMigration0145_vaspRoutingLatency,
} from "../startup-migrations/blocks/0145-vasp-routing-latency.js";
import { BLOCKS } from "./startup-migrations.js";
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

describe("block 0145: routing latency for the two vasp tools", () => {
  it("is registered to run at startup", () => {
    expect(BLOCKS).toContain(runMigration0145_vaspRoutingLatency);
  });

  it("fills only a NULL avg_latency_ms on the two named slugs", async () => {
    const { tx, queries } = recordingTx(2);
    const result = await runMigration0145_vaspRoutingLatency(tx);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql.replace(/\s+/g, " ").trim()).toBe(
      "UPDATE capabilities SET avg_latency_ms = $1 WHERE slug IN ($2, $3) AND avg_latency_ms IS NULL",
    );
    expect(queries[0].params).toEqual([VASP_ROUTING_LATENCY_MS, "vasp-verify", "vasp-non-compliant-check"]);
    expect(queries[0].sql).not.toContain("updated_at");
    expect(result.rows_affected).toBe(2);
  });

  it("stays on the sync path and binds no Date", async () => {
    expect(VASP_ROUTING_LATENCY_MS).toBeLessThan(10_000);
    const { tx, queries } = recordingTx(0);
    const result = await runMigration0145_vaspRoutingLatency(tx);
    for (const p of queries[0].params) expect(p instanceof Date).toBe(false);
    expect(result.outcome).toMatch(/no change/);
  });
});
