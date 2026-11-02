/**
 * classifyVolume, the pure decision behind the x402 settlement watch. The SQL
 * and the alert wiring are covered against real Postgres in
 * x402-settlement-watch.integration.test.ts; these pin the edge cases.
 */
import { describe, expect, it } from "vitest";
import { classifyVolume } from "./x402-settlement-watch.js";

const perDay = (payer: string | null, base: number, last24h: number) => ({ payer, prior7d: base * 7, last24h });

describe("classifyVolume", () => {
  it("is healthy at or above half the baseline, and silent under the minimum", () => {
    expect(classifyVolume([perDay("a", 100, 50)]).kind).toBe("healthy");
    expect(classifyVolume([perDay("a", 9, 0)]).kind).toBe("no_baseline");
  });

  it("excludes the top two buyers when one alone does not explain the drop", () => {
    const v = classifyVolume([perDay("a", 80, 0), perDay("b", 60, 0), perDay("c", 10, 10), perDay("d", 8, 8)]);
    expect(v.kind).toBe("concentrated");
    if (v.kind !== "concentrated") throw new Error("unreachable");
    expect(v.excluded).toBe(2);
    expect(v.othersLast24h).toBe(18);
  });

  it("never excludes more than two buyers", () => {
    const v = classifyVolume([perDay("a", 60, 0), perDay("b", 50, 0), perDay("c", 40, 0), perDay("d", 8, 8)]);
    expect(v.kind).toBe("broad");
  });

  it("stays critical when the other payers' own baseline is too small to prove the rail works", () => {
    // Review scenario: a v1 die-off takes out the big buyer; one v2 payer at ~1/day carries on.
    const v = classifyVolume([perDay("a", 150, 1), perDay("b", 1, 1)]);
    expect(v.kind).toBe("broad");
  });

  it("counts unattributed rows with the others and never as a buyer to exclude", () => {
    const v = classifyVolume([perDay(null, 150, 0), perDay("b", 9, 9)]);
    expect(v.kind).toBe("broad");
    if (v.kind !== "broad") throw new Error("unreachable");
    expect(v.topBuyers.map((b) => b.payerHashPrefix)).toEqual(["b"]);
    expect(v.distinctPayers24h).toBe(1);
  });
});
