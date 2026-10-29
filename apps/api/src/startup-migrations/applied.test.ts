import { describe, expect, it } from "vitest";
import { planBlock, LEDGER_BY_FUNCTION, type LedgerRow } from "./applied.js";
import { BLOCK_RUN_POLICY } from "./run-policy.js";
import { BLOCKS } from "../lib/startup-migrations.js";
import { StartupFatalError } from "../lib/startup-fatal.js";

const row: LedgerRow = { id: "M999", function: "runMigration9999_x", sha256: "a".repeat(64) };

describe("planBlock", () => {
  it("skips a once block whose recorded hash equals its ledger hash", () => {
    expect(planBlock(row.function, row, row.sha256, "once", false)).toEqual({ action: "skip", ledgerId: "M999" });
  });

  it("runs a once block that has not been recorded yet", () => {
    expect(planBlock(row.function, row, undefined, "once", false)).toEqual({ action: "run" });
  });

  it("runs an every_boot block even when recorded", () => {
    expect(planBlock(row.function, row, row.sha256, "every_boot", false)).toEqual({ action: "run" });
  });

  it("runs a block with no declared policy (never a silent skip)", () => {
    expect(planBlock(row.function, row, row.sha256, undefined, false)).toEqual({ action: "run" });
  });

  it("force runs a recorded once block", () => {
    expect(planBlock(row.function, row, row.sha256, "once", true)).toEqual({ action: "run" });
  });

  it("an unledgered block runs and is never skipped", () => {
    expect(planBlock(row.function, undefined, undefined, "once", false)).toEqual({ action: "run" });
  });

  it("a recorded hash that differs from the ledger is a fatal boot error, not a skip", () => {
    expect(() => planBlock(row.function, row, "b".repeat(64), "once", false)).toThrow(StartupFatalError);
    expect(() => planBlock(row.function, row, "b".repeat(64), "every_boot", true)).toThrow(/ran with ledger hash/);
  });

  it("a recorded block whose ledger row is gone is a fatal boot error", () => {
    expect(() => planBlock(row.function, undefined, row.sha256, "once", false)).toThrow(/no ledger row/);
  });
});

describe("BLOCK_RUN_POLICY", () => {
  const names = BLOCKS.map((b) => b.name);

  it("declares a policy and a reason for every registered block, and nothing else", () => {
    expect(Object.keys(BLOCK_RUN_POLICY).sort()).toEqual([...names].sort());
    for (const [name, { policy, reason }] of Object.entries(BLOCK_RUN_POLICY)) {
      expect(["once", "every_boot"], name).toContain(policy);
      expect(reason.length, name).toBeGreaterThan(10);
    }
  });

  it("every registered block has a ledger row the runner can record", () => {
    expect(names.filter((n) => !LEDGER_BY_FUNCTION.has(n))).toEqual([]);
  });

  it("keeps the blocks that reconcile or defer every boot on every boot", () => {
    // The ones a wrong "once" would silently change in production: the
    // scheduled_testing_eligible rewrite CLAUDE.md documents, the live
    // dependency-manifest sync, and the defer-not-throw blocks.
    for (const name of [
      "runMigration0066_ensureEligibilityColumnAndReconcile",
      "runMigration0069_reconcileEligibilityFromCostClass",
      "runMigration0090_capabilityOutputContracts",
      "runMigration0095_walletReservations",
      "runMigration0098_perCustomerIdempotency",
      "runMigration0099_noHalfQuarantine",
      "runMigration0101_capabilityInvocations",
      "runMigration0111_vendorControlTower",
    ]) {
      expect(BLOCK_RUN_POLICY[name]?.policy, name).toBe("every_boot");
    }
  });
});
