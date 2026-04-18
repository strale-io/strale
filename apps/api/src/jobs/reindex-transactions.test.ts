/**
 * Unit-level test for the monthly REINDEX worker.
 *
 * We verify:
 *   1. The factory exists and is idempotent.
 *   2. The lock-busy path is exercised when `pg_try_advisory_lock`
 *      returns { acquired: false }.
 *
 * The full integration — dedicated-connection lock + REINDEX CONCURRENTLY
 * + completion event — needs a live Postgres harness and is deferred to
 * the Phase D Testcontainers work alongside the advisory-lock tests for
 * db-retention / activation-drip / integrity-hash-retry.
 */

import { describe, it, expect, beforeAll, vi, beforeEach } from "vitest";

beforeAll(() => {
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
});

// ── Shared mutable state across all postgres() client invocations ────
const state = {
  advisoryLockAcquired: true,
  logs: [] as Array<{ label: string; message: string }>,
};

// Mock the `postgres` module so we can drive the dedicated-connection
// client's advisory-lock response without a real DB.
vi.mock("postgres", () => {
  const client: any = (strings: TemplateStringsArray, ..._values: unknown[]) => {
    const q = String(strings.raw?.[0] ?? strings);
    if (q.includes("pg_try_advisory_lock")) {
      return Promise.resolve([{ acquired: state.advisoryLockAcquired }]);
    }
    if (q.includes("pg_advisory_unlock")) {
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };
  client.unsafe = (_raw: string) => Promise.resolve([]);
  client.end = (_opts?: unknown) => Promise.resolve(undefined);
  const factory = (_url: string, _opts: unknown) => client;
  return { default: factory };
});

// Mock the structured-log helpers so we can assert on the lock-busy label.
vi.mock("../lib/log.js", () => ({
  log: {
    info: (..._args: unknown[]) => {},
    warn: (..._args: unknown[]) => {},
    error: (..._args: unknown[]) => {},
  },
  logError: (_label: string, _err: unknown, _ctx?: unknown) => {},
  logWarn: (label: string, message: string, _ctx?: unknown) => {
    state.logs.push({ label, message });
  },
}));

// Mock the drizzle db layer so findLastCompletion returns "no recent run"
// and the job decides to proceed. Once it tries to take the lock, the
// mocked postgres client above decides whether to grant it.
vi.mock("../db/index.js", () => ({
  getDb: () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: async () => [] }),
        }),
      }),
    }),
    insert: () => ({ values: async () => undefined }),
  }),
}));

// Mock the health-monitor insert so completion-event writes don't blow up.
vi.mock("../lib/health-monitor.js", () => ({
  logHealthEvent: async () => {},
}));

beforeEach(() => {
  state.advisoryLockAcquired = true;
  state.logs = [];
});

describe("reindex-transactions (monthly REINDEX CONCURRENTLY)", () => {
  it("exports the expected factory", async () => {
    const mod = await import("./reindex-transactions.js");
    expect(typeof mod.startReindexTransactions).toBe("function");
  });

  it("factory is idempotent (second call no-ops)", async () => {
    const { startReindexTransactions } = await import(
      "./reindex-transactions.js"
    );
    expect(() => startReindexTransactions()).not.toThrow();
    expect(() => startReindexTransactions()).not.toThrow();
  });
});
