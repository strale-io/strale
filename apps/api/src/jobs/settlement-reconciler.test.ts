/**
 * Regression coverage for the drizzle-orm 0.44+ query-error wrapper inside
 * the x402 settlement reconciler (PR #510 round-three follow-up,
 * 2026-09-04 — see lib/db-error.ts's doc comment for the wrapper
 * incident).
 *
 * Pre-fix, the item-level catch block in `reconcileSettlementsOnce` read
 * `(err as { code?: string } | null)?.code` directly to recognize a
 * `23505` unique-violation race on the recovery insert (two replicas
 * racing to recreate the same orphaned settlement's transaction row) as
 * "already recovered by the other replica" rather than a real failure.
 * Since drizzle-orm 0.44+ wraps every driver error in `DrizzleQueryError`
 * (no `code` of its own — the real SQLSTATE is on `.cause`), that read
 * always returned `undefined` post-upgrade, so a benign race was
 * misclassified as `summary.failed` and logged as an error on every tick
 * two replicas happened to collide.
 *
 * No Postgres-backed integration harness exists for this job (it drives
 * a real `db.transaction` + advisory lock over several tables) — per the
 * CLAUDE.md test-harness exemption, this is a unit-level regression test
 * with a fake db, mirroring the fake-db pattern the do.core.test.ts
 * harness and the sibling job tests (`db-retention.test.ts`) use: real
 * schema tables, a hand-built db double shaped exactly like what
 * `reconcileSettlementsOnce` calls, and every other collaborator module
 * (`x402-settlement-intent.js`, `receipt/settle.js`,
 * `receipt/deploy-identity.js`, `alert-once.js`, `log.js`) mocked to a
 * no-op so the test is about the pgErrorCode routing, not the full
 * recovery/escalation machinery those modules already cover elsewhere.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { transactions } from "../db/schema.js";

const mocks = vi.hoisted(() => ({
  findAbandonedIntentsResult: [] as unknown[],
  insertRejection: null as unknown,
  logErrorCalls: [] as Array<{ label: string; err: unknown }>,
}));

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    transaction: async (cb: (tx: unknown) => unknown) =>
      cb({ execute: async () => [{ acquired: true }] }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [], // no existing transaction row for the settlement id
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: async () => {
          if (mocks.insertRejection) throw mocks.insertRejection;
          return [{ id: "recreated-txn-id" }];
        },
      }),
    }),
    update: () => ({
      set: () => ({
        where: async () => undefined,
      }),
    }),
  }),
}));

vi.mock("../lib/x402-settlement-intent.js", () => ({
  countEscalated: vi.fn(async () => 0),
  escalateIntent: vi.fn(async () => undefined),
  findAbandonedIntents: vi.fn(async () => mocks.findAbandonedIntentsResult),
  markRecordedBySettlement: vi.fn(async () => undefined),
}));

vi.mock("../lib/receipt/settle.js", () => ({
  settleExecutionReceipt: vi.fn(async () => undefined),
}));

vi.mock("../lib/receipt/deploy-identity.js", () => ({
  deployCommitOrNull: vi.fn(() => "abc1234"),
}));

vi.mock("../lib/alert-once.js", () => ({
  alertOnce: vi.fn(async () => undefined),
}));

vi.mock("../lib/log.js", () => ({
  log: { info: vi.fn() },
  logError: vi.fn((label: string, err: unknown) => {
    mocks.logErrorCalls.push({ label, err });
  }),
}));

import { reconcileSettlementsOnce } from "./settlement-reconciler.js";
import { logError } from "../lib/log.js";

const mockLogError = logError as unknown as ReturnType<typeof vi.fn>;

function pgError(message: string, code: string): Error {
  return Object.assign(new Error(message), {
    name: "PostgresError",
    code,
    severity: "ERROR",
    routine: "_bt_check_unique",
  });
}

const ABANDONED_INTENT = {
  id: "intent-1",
  state: "settled" as const,
  paymentHash: "0xpaymenthash",
  settlementId: "0xsettlementid",
  slug: "test-capability",
  solutionSlug: "some-solution", // truthy so the cap lookup select is skipped
  priceCents: 5,
};

beforeEach(() => {
  mocks.findAbandonedIntentsResult = [ABANDONED_INTENT];
  mocks.insertRejection = null;
  mocks.logErrorCalls = [];
  mockLogError.mockClear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("reconcileSettlementsOnce — 23505 race on the recovery insert", () => {
  it("increments discharged (not failed) and does NOT log the item as failed when the insert rejects with a wrapped 23505", async () => {
    const inner = pgError(
      'duplicate key value violates unique constraint "transactions_x402_settlement_id_key"',
      "23505",
    );
    mocks.insertRejection = new DrizzleQueryError("insert into transactions ...", [], inner);

    const summary = await reconcileSettlementsOnce();

    expect(summary.discharged).toBe(1);
    expect(summary.failed).toBe(0);
    // Swallow-visibility (DEC-20260504-A step 4): a benign race must not
    // surface through the same failure-logging path a real error would.
    expect(mockLogError).not.toHaveBeenCalledWith(
      "settlement-reconcile-item-failed",
      expect.anything(),
      expect.objectContaining({ intent_id: ABANDONED_INTENT.id }),
    );
  });

  it("still counts a non-23505 insert rejection as a real failure and logs it", async () => {
    const inner = pgError("connection terminated unexpectedly", "08006");
    mocks.insertRejection = new DrizzleQueryError("insert into transactions ...", [], inner);

    const summary = await reconcileSettlementsOnce();

    expect(summary.failed).toBe(1);
    expect(summary.discharged).toBe(0);
    expect(mockLogError).toHaveBeenCalledWith(
      "settlement-reconcile-item-failed",
      expect.anything(),
      expect.objectContaining({ intent_id: ABANDONED_INTENT.id }),
    );
  });
});

// Referenced only to keep the `transactions` import intentional (guards
// against an unused-import lint regression if the fake db above is ever
// simplified to stop needing schema-shaped select/insert targets).
void transactions;
