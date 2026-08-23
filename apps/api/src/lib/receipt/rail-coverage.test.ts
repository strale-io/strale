/**
 * Every production site that writes a transaction must settle its receipt.
 *
 * Fail-closed source lint, in the same shape as
 * `jobs/no-boot-relative-timers.test.ts`. A new rail, or a new settlement path
 * inside an existing one, is a file that writes `transactions` - and the
 * failure mode this guards is that nobody remembers to build a receipt there.
 *
 * The epoch (migration 0109) already makes that failure VISIBLE rather than
 * silent: `receipt_status` defaults to `pending`, so an unwired site produces
 * rows the sweeper reports instead of rows that look pre-epoch. This lint makes
 * it visible at build time instead, which is cheaper than finding it in a
 * backlog counter.
 *
 * The exemption map is the point. A file can be excused, but only by writing
 * down why, which is a decision someone made rather than a gap nobody noticed.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..", "..");

/**
 * Files that write `transactions` and legitimately produce no receipt.
 * Key: path relative to `src/`, using forward slashes.
 */
const EXEMPT: Record<string, string> = {
  "lib/startup-migrations.ts":
    "block 0109's behavioural self-check. It inserts an ordinary row inside a " +
    "plpgsql subtransaction and unwinds it, to prove that the receipt defaults " +
    "and the reason-required CHECK actually permit a write - the defect that " +
    "would otherwise have stopped every INSERT in production. Nothing is " +
    "executed and no row survives the statement.",
  "app.ts":
    "the /health/deep write-path probe. It inserts a status='health_probe' row " +
    "and DELETEs it in the same transaction - it is a database liveness check, " +
    "not an execution of anything, and there is no result to commit to.",
};

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, acc);
    } else if (entry.endsWith(".ts")) {
      acc.push(full);
    }
  }
  return acc;
}

function isTestFile(path: string): boolean {
  return /\.(test|spec)\.ts$/.test(path) || path.includes("test-support");
}

const WRITES_TRANSACTIONS = /insert\(transactions\)|INSERT\s+INTO\s+transactions/;

/**
 * The rule, as a pure function, so it can be tested on inputs we control.
 *
 * A source lint that scans a clean repository finds nothing, and "found
 * nothing" is indistinguishable from "cannot find anything". Disabling the
 * detection entirely left this file green -- caught by the mutation battery,
 * which is exactly the hollow-guard shape this repo has been bitten by before.
 * The positive controls below feed it a file that SHOULD be flagged.
 */
export function classify(
  rel: string,
  source: string,
): "not-a-writer" | "exempt" | "offender" | "wired" {
  if (!WRITES_TRANSACTIONS.test(source)) return "not-a-writer";
  if (EXEMPT[rel]) return "exempt";
  return source.includes("settleExecutionReceipt") ? "wired" : "offender";
}

describe("receipt rail coverage", () => {
  const offenders: Array<{ file: string; reason: string }> = [];
  const exemptSeen = new Set<string>();

  for (const abs of walk(SRC)) {
    if (isTestFile(abs)) continue;
    const rel = abs.slice(SRC.length + 1).split("\\").join("/");
    const source = readFileSync(abs, "utf8");
    if (!WRITES_TRANSACTIONS.test(source)) continue;

    const verdict = classify(rel, source);
    if (verdict === "exempt") {
      exemptSeen.add(rel);
      continue;
    }
    if (verdict === "offender") {
      offenders.push({ file: rel, reason: "writes transactions, never settles a receipt" });
    }
  }

  it("every file that writes a transaction settles its receipt, or is exempt", () => {
    expect(
      offenders,
      "These files write to `transactions` but never call settleExecutionReceipt. " +
        "Either wire the rail, or add it to EXEMPT with the reason it produces no " +
        "execution to commit to:\n" +
        offenders.map((o) => `  - ${o.file}: ${o.reason}`).join("\n"),
    ).toEqual([]);
  });

  it("every exemption still corresponds to a file that writes transactions", () => {
    // A stale exemption is worse than none: it reads as a considered decision
    // while guarding a file that no longer exists or no longer writes.
    const stale = Object.keys(EXEMPT).filter((k) => !exemptSeen.has(k));
    expect(stale, `Stale exemptions: ${stale.join(", ")}`).toEqual([]);
  });

  it("the lint actually found the known rails, so it cannot pass vacuously", () => {
    // The failure mode of a source lint is matching nothing at all and
    // reporting success. Naming the rails we know exist keeps that honest.
    const wired = walk(SRC)
      .filter((p) => !isTestFile(p))
      .filter((p) => WRITES_TRANSACTIONS.test(readFileSync(p, "utf8")))
      .map((p) => p.slice(SRC.length + 1).split("\\").join("/"));

    for (const expected of [
      "routes/do.ts",
      "routes/solution-execute.ts",
      "routes/x402-gateway-v2.ts",
      "lib/test-runner.ts",
      "jobs/settlement-reconciler.ts",
      "app.ts",
    ]) {
      expect(wired, `${expected} was not scanned; the lint's file walk is broken`).toContain(
        expected,
      );
    }
  });

  describe("the rule itself, on inputs we control", () => {
    // Without these the lint proves only that the repository is currently
    // clean, which it would also "prove" if the detection did nothing at all.
    it("flags a file that writes transactions and never settles", () => {
      expect(
        classify("routes/new-rail.ts", "await db.insert(transactions).values({});"),
      ).toBe("offender");
    });

    it("flags a raw-SQL writer too, not just the drizzle form", () => {
      expect(
        classify("routes/new-rail.ts", "await db.execute(sql`INSERT INTO transactions (id) ...`);"),
      ).toBe("offender");
    });

    it("does not flag a file that settles", () => {
      expect(
        classify(
          "routes/new-rail.ts",
          "await db.insert(transactions).values({}); await settleExecutionReceipt(db, {});",
        ),
      ).toBe("wired");
    });

    it("does not flag a file that never touches transactions", () => {
      expect(classify("lib/whatever.ts", "export const x = 1;")).toBe("not-a-writer");
    });

    it("honours an exemption, and only for the exact path", () => {
      expect(classify("app.ts", "INSERT INTO transactions (id)")).toBe("exempt");
      expect(classify("app2.ts", "INSERT INTO transactions (id)")).toBe("offender");
    });
  });
});
