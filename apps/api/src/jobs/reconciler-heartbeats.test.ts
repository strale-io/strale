import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ acquired: true, fail: false, mark: vi.fn() }));
vi.mock("../lib/job-heartbeats.js", () => ({ markJobSuccess: state.mark }));
vi.mock("../db/index.js", () => ({ getDb: () => ({
  transaction: async (fn: (tx: unknown) => unknown) => {
    if (state.fail) throw new Error("database unavailable");
    return fn({ execute: async () => [{ acquired: state.acquired }] });
  },
}) }));
vi.mock("../lib/wallet-reservations.js", () => ({ findAbandoned: async () => [] }));
vi.mock("../lib/x402-settlement-intent.js", () => ({ findAbandonedIntents: async () => [], countEscalated: async () => 0 }));
vi.mock("../lib/alert-once.js", () => ({ alertOnce: vi.fn() }));
vi.mock("../lib/log.js", () => ({ log: { info: vi.fn() }, logError: vi.fn() }));
import { runReservationReconcilerOnce } from "./reservation-reconciler.js";
import { reconcileSettlementsOnce } from "./settlement-reconciler.js";

describe("reconciler success clocks", () => {
  beforeEach(() => { state.acquired = true; state.fail = false; state.mark.mockClear(); });
  for (const [id, run] of [["reservation-reconciler", runReservationReconcilerOnce], ["settlement-reconciler", reconcileSettlementsOnce]] as const) {
    it(`${id}: a successful empty tick is fresh, a skipped lock or DB failure is not`, async () => {
      await run();
      expect(state.mark).toHaveBeenCalledWith(id);
      state.mark.mockClear(); state.acquired = false;
      await run();
      expect(state.mark).not.toHaveBeenCalled();
      state.fail = true;
      await expect(run()).rejects.toThrow("database unavailable");
      expect(state.mark).not.toHaveBeenCalled();
    });
  }
});
