import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0083: MCP funnel + x402 payer hash ───────────────────────────────
//
// Readiness P0 (2026-08-15): "Strale can see agents arriving and can see
// revenue, but nothing in between." Two additions, both write-only at
// execution time (no hot-path query cost):
//
//   1. transactions.x402_payer_hash — see the column comment in db/schema.ts
//      for the full rationale (stable, keyed HMAC; deliberately NOT the
//      daily-rotating shape discovery_hits.ip_hash uses). Populated going
//      forward by recordX402Transaction (routes/x402-gateway-v2.ts) via
//      hashX402Payer (lib/attribution.ts). NULL on existing rows and on
//      wallet-paid rows — no backfill: DEC-20260504-B's backlog-drain
//      requirement doesn't apply because there's nothing to drain (a NULL
//      column addition, same shape as Block 0081's client_meta).
//   2. No discovery_hits schema change. The MCP funnel (initialize,
//      tools/list, each tools/call, and auth/payment rejections) reuses the
//      existing table unmodified — funnel step + tool name + rejection
//      reason are all encoded into the `endpoint` text column
//      (`/mcp:tools/call:{tool}`, `/mcp:reject:{type}:{tool}`), the same
//      pattern `/mcp:initialize` already established. See routes/mcp.ts and
//      packages/mcp-server/src/tools.ts (onFunnelEvent hook).
export async function runMigration0083_x402PayerHash(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS x402_payer_hash VARCHAR(16)
  `);

  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS transactions_x402_payer_hash_idx
      ON transactions (x402_payer_hash) WHERE x402_payer_hash IS NOT NULL
  `);

  return {
    block: "0083_x402_payer_hash",
    outcome: "x402_payer_hash column + index ensured (idempotent); no discovery_hits schema change",
    duration_ms: Date.now() - startedAt,
  };
}
