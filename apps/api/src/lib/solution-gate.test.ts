import { describe, expect, it } from "vitest";
import { parseGateCondition, gateTrips } from "./solution-executor.js";
import { SOLUTIONS } from "../db/solution-catalogue.js";
import { runMigration0087_solutionGateCondition } from "./startup-migrations.js";
import { sql, type SQL } from "drizzle-orm";

/**
 * Gate conditions let a bundle stop early and refund.
 *
 * The gap they close: the platform refunds only when EVERY step fails, so a
 * bundle whose first step legitimately reports "there is nothing here"
 * succeeded — and one success was enough to bill in full for the wasted steps
 * behind it. `page-seo-check` on an unreachable URL is the worked example:
 * `url-health-check` returns `is_up: false` (a true answer), the other three
 * fail, the caller pays €0.30.
 *
 * Both directions matter. A gate that never trips leaves the billing bug in
 * place; a gate that trips too easily refunds work we actually did.
 */

describe("parseGateCondition", () => {
  it("accepts the documented shape", () => {
    expect(parseGateCondition({ field: "is_up", equals: false })).toEqual({
      field: "is_up", equals: false, reason: undefined,
    });
    expect(parseGateCondition({ field: "is_up", equals: false, reason: "down" })?.reason).toBe("down");
  });

  it("accepts it as persisted JSON text", () => {
    expect(parseGateCondition('{"field":"is_up","equals":false}')?.field).toBe("is_up");
  });

  it.each([
    [null, "absent"],
    [undefined, "absent"],
    ["not json", "unparseable"],
    [{}, "no field"],
    [{ field: "is_up" }, "no equals — would otherwise match every output"],
    [{ field: "", equals: false }, "empty field"],
    [{ equals: false }, "no field"],
    [[{ field: "is_up", equals: false }], "an array, not an object"],
  ])("treats %s as no gate (%s)", (raw) => {
    // A malformed gate must read as ABSENT, never as "trips". A gate that
    // fails open leaves one bundle billing wrongly; a gate that fails closed
    // silently stops every call to a working bundle and refunds all of it.
    expect(parseGateCondition(raw)).toBeNull();
  });
});

describe("gateTrips", () => {
  const gate = { field: "is_up", equals: false };

  it("trips on an exact match", () => {
    expect(gateTrips({ is_up: false, status_code: 0 }, gate)).toBe(true);
  });

  it("does not trip when the page is up — the ordinary case", () => {
    expect(gateTrips({ is_up: true, status_code: 200 }, gate)).toBe(false);
  });

  it("does not trip on a missing field", () => {
    // The step errored, or returned a different shape. That is a failure for
    // the normal path to handle, not a precondition result.
    expect(gateTrips({ status_code: 500 }, gate)).toBe(false);
    expect(gateTrips({ error: "boom" }, gate)).toBe(false);
  });

  it("compares strictly — falsy is not false", () => {
    // `undefined == false` and `0 == false` under loose equality. A step
    // returning is_up: 0 or omitting it must not refund the caller.
    expect(gateTrips({ is_up: 0 }, gate)).toBe(false);
    expect(gateTrips({ is_up: null }, gate)).toBe(false);
    expect(gateTrips({ is_up: undefined }, gate)).toBe(false);
    expect(gateTrips({ is_up: "false" }, gate)).toBe(false);
  });

  it("handles non-object outputs without throwing", () => {
    for (const out of [null, undefined, "string", 42, [1, 2]]) {
      expect(gateTrips(out, gate)).toBe(false);
    }
  });
});

describe("the catalogue's use of gates", () => {
  it("gates page-seo-check on reachability, and nothing else yet", () => {
    const gated = SOLUTIONS.filter((s) => s.steps.some((st) => st.gateCondition));
    expect(gated.map((s) => s.slug)).toEqual(["page-seo-check"]);

    const step = SOLUTIONS.find((s) => s.slug === "page-seo-check")!.steps
      .find((st) => st.gateCondition)!;
    expect(step.capabilitySlug).toBe("url-health-check");
    expect(step.gateCondition).toMatchObject({ field: "is_up", equals: false });
  });

  it("only ever gates on a step that runs before the ones it protects", () => {
    for (const sol of SOLUTIONS) {
      const ordered = [...sol.steps].sort((a, b) => a.stepOrder - b.stepOrder);
      ordered.forEach((step, i) => {
        if (!step.gateCondition) return;
        // A gate on the last step protects nothing, and a gate sharing a
        // parallel group with the steps behind it cannot stop them in time.
        expect(i, `${sol.slug}: gate on the final step protects nothing`).toBeLessThan(ordered.length - 1);
        expect(step.parallelGroup, `${sol.slug}: a gate step must not share a parallel group`).toBeNull();
      });
    }
  });

  it("declares a caller-facing reason wherever it gates", () => {
    for (const sol of SOLUTIONS) {
      for (const step of sol.steps) {
        if (!step.gateCondition) continue;
        expect(step.gateCondition.reason, `${sol.slug} gate reason`).toBeTruthy();
        // The caller's first question is whether they paid.
        expect(step.gateCondition.reason!.toLowerCase()).toContain("not charged");
      }
    }
  });
});

describe("migration block 0087", () => {
  it("is idempotent and additive", async () => {
    const executed: string[] = [];
    const stub = { execute: async (q: SQL) => { executed.push(JSON.stringify(q)); return []; } };
    const first = await runMigration0087_solutionGateCondition(stub);
    const second = await runMigration0087_solutionGateCondition(stub);
    expect(first.block).toBe("0087_solutionGateCondition");
    expect(second.outcome).toBe("applied");
    // Idempotency marker present — a re-run on a healthy database is a no-op.
    expect(executed[0]).toContain("ADD COLUMN IF NOT EXISTS");
    expect(executed[0]).toContain("gate_condition");
    // Additive only: no DROP, no NOT NULL, no DEFAULT that would rewrite rows.
    expect(executed.join(" ")).not.toMatch(/DROP|NOT NULL|SET DEFAULT/i);
  });

  it("is registered, or it never runs", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./startup-migrations.ts", import.meta.url), "utf8"));
    const registry = src.slice(src.indexOf("const BLOCKS"), src.indexOf("];", src.indexOf("const BLOCKS")));
    expect(registry).toContain("runMigration0087_solutionGateCondition");
  });
});
