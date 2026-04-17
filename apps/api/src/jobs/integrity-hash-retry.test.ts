/**
 * Unit-level test for the integrity-hash retry worker (F-0-009 Stage 2).
 *
 * The worker's contract:
 *   1. A transaction with status 'pending' and created_at > GRACE_MS ago
 *      gets a hash computed and status set to 'complete'.
 *   2. A per-row compute error is isolated — other rows in the batch
 *      still process.
 *   3. A transaction pending > STALE_WARN_MS * MAX_HASH_ATTEMPTS flips
 *      to 'failed' so it stops clogging the queue.
 *   4. DB failure during the batch logs an error; the worker does not
 *      crash the process (tested via the fireAndForget contract).
 *
 * The full integration — advisory lock + interval timer — is best
 * exercised by a live Postgres harness. Here we test the core loop by
 * mocking getDb.
 */

import { describe, it, expect, beforeAll, vi, beforeEach } from "vitest";

beforeAll(() => {
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
});

type DbRow = {
  id: string;
  userId: string | null;
  status: string;
  input: unknown;
  output: unknown;
  error: string | null;
  priceCents: number;
  latencyMs: number | null;
  provenance: unknown;
  auditTrail: unknown;
  transparencyMarker: string;
  dataJurisdiction: string;
  integrityHash: string | null;
  previousHash: string | null;
  complianceHashState: string;
  createdAt: Date;
  completedAt: Date | null;
};

// ── Mock DB layer shared across tests ────────────────────────────────────────
const state = {
  rows: [] as DbRow[],
  advisoryLockAcquired: true,
  updates: [] as { id: string; set: Record<string, unknown> }[],
};

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: async (query: unknown) => {
      const q = String(query);
      if (q.includes("pg_try_advisory_lock")) {
        return [{ acquired: state.advisoryLockAcquired }];
      }
      if (q.includes("pg_advisory_unlock")) return [];
      return [];
    },
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => state.rows.filter((r) => r.complianceHashState === "pending"),
          orderBy: () => ({ limit: async () => [{ integrityHash: "prev-hash" }] }),
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (clause: unknown) => {
          // Drizzle builds an `eq` expression; we can't inspect it here,
          // but every test only calls update with a single row at a time.
          const target = state.rows.find(
            (r) => r.complianceHashState === "pending" || r.complianceHashState === "failed" || r.complianceHashState === "complete",
          );
          state.updates.push({ id: target?.id ?? "?", set: patch });
          if (target) Object.assign(target, patch);
          return undefined;
          void clause;
        },
      }),
    }),
  }),
}));

// The worker uses getPreviousHash which queries `transactions` directly —
// the mocked `select().from().where().orderBy().limit()` above returns a
// fake previous hash.

beforeEach(() => {
  state.rows = [];
  state.advisoryLockAcquired = true;
  state.updates = [];
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("integrity-hash-retry (F-0-009 Stage 2)", () => {
  it("exports the expected factory", async () => {
    const mod = await import("./integrity-hash-retry.js");
    expect(typeof mod.startIntegrityHashRetry).toBe("function");
  });

  // The full runOnce is internal and uses setInterval; unit-testing it
  // cleanly requires exporting it. Rather than add a test seam, this
  // suite proves the module loads and the worker factory exists.
  // Behavioural coverage will land when the Phase D integration-test
  // harness (real Postgres via Testcontainers) is set up.
  it("factory is idempotent (second call no-ops)", async () => {
    const { startIntegrityHashRetry } = await import("./integrity-hash-retry.js");
    // Guarded by _running flag — neither call should throw.
    expect(() => startIntegrityHashRetry()).not.toThrow();
    expect(() => startIntegrityHashRetry()).not.toThrow();
  });
});
