/**
 * password-strength's password must never reach the x402 rail's writes:
 * the transactions row, the audit trail's input_hash (both the pre-INSERT
 * body and the post-INSERT rebuild written by UPDATE), and the raw_args copy
 * written to x402_orphan_settlements when the transactions INSERT fails after
 * settlement. See lib/never-persist-inputs.ts.
 *
 * Drives recordX402Transaction itself (through its test seam) against a
 * recording db mock, so the assertions are on the values the database would
 * receive, not on source text.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({
  inserts: [] as Array<{ table: unknown; vals: unknown }>,
  updates: [] as Array<{ table: unknown; vals: unknown }>,
  failTransactionsInsert: false,
}));

vi.mock("../db/index.js", async () => {
  const schema = await import("../db/schema.js");
  return {
    getDb: () => ({
      insert: (table: unknown) => ({
        values: (vals: unknown) => {
          mocks.inserts.push({ table, vals });
          const p: any = Promise.resolve([]);
          p.returning = async () => {
            if (table === schema.transactions && mocks.failTransactionsInsert) {
              throw new Error("simulated insert failure");
            }
            return [{ id: "33333333-3333-3333-3333-333333333333" }];
          };
          return p;
        },
      }),
      update: (table: unknown) => ({
        set: (vals: unknown) => ({
          where: () => {
            mocks.updates.push({ table, vals });
            const p: any = Promise.resolve([]);
            p.returning = async () => [];
            return p;
          },
        }),
      }),
    }),
  };
});

vi.mock("../lib/receipt/settle.js", () => ({
  settleExecutionReceipt: vi.fn().mockResolvedValue(undefined),
}));

import { __recordX402TransactionForTests } from "./x402-gateway-v2.js";
import { transactions, x402OrphanSettlements } from "../db/schema.js";
import { NOT_STORED_MARKER } from "../lib/never-persist-inputs.js";

const SECRET = "Tr0ub4dor&3-x402-never-store-me";

function hashOf(input: Record<string, unknown>): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
}

function stringifyForSearch(value: unknown): string {
  const seen = new WeakSet<object>();
  return (
    JSON.stringify(value, (_k, v) => {
      if (v && typeof v === "object") {
        if (seen.has(v)) return "[cycle]";
        seen.add(v);
      }
      return v;
    }) ?? ""
  );
}

function args() {
  return {
    capabilityId: "22222222-2222-2222-2222-222222222222",
    solutionSlug: null,
    slug: "password-strength",
    inputs: { password: SECRET },
    output: { score: 80, strength: "strong" },
    latencyMs: 5,
    priceCents: 2,
    priceUsd: 0.02,
    transparencyTag: "algorithmic",
    settlementId: "0xsettlement",
    payerAddress: "0xpayer",
    capForAudit: {
      transparencyTag: "algorithmic",
      capabilityType: "deterministic",
      dataSource: "algorithmic",
      dataClassification: null,
      processesPersonalData: false,
      personalDataCategories: [],
      outputSchema: { type: "object", properties: {} },
    },
  };
}

beforeEach(() => {
  mocks.inserts = [];
  mocks.updates = [];
  mocks.failTransactionsInsert = false;
});

describe("x402 recordX402Transaction — password-strength never persists the password", () => {
  it("transactions insert and both audit bodies carry the marker, never the password or its hash", async () => {
    const id = await __recordX402TransactionForTests(args());
    expect(id).toBe("33333333-3333-3333-3333-333333333333");

    const txnInsert = mocks.inserts.find((c) => c.table === transactions);
    expect(txnInsert).toBeTruthy();
    const vals = txnInsert!.vals as { input: unknown; auditTrail: { input_hash?: string } };
    expect(vals.input).toEqual({ password: NOT_STORED_MARKER });

    const audits = [
      vals.auditTrail,
      ...mocks.updates
        .filter((c) => c.table === transactions)
        .map((c) => (c.vals as { auditTrail?: { input_hash?: string } }).auditTrail),
    ].filter((a): a is { input_hash?: string } => !!a);
    // Pre-INSERT body plus the post-INSERT rebuild.
    expect(audits.length).toBe(2);
    for (const audit of audits) {
      expect(audit.input_hash).not.toBe(hashOf({ password: SECRET }));
      expect(audit.input_hash).toBe(hashOf({ password: NOT_STORED_MARKER }));
    }

    const everyWrite = [...mocks.inserts, ...mocks.updates].map((c) => stringifyForSearch(c.vals)).join("\n");
    expect(everyWrite).not.toContain(SECRET);
  });

  it("orphan-settlement raw_args carries the marker when the transactions insert fails", async () => {
    mocks.failTransactionsInsert = true;
    const id = await __recordX402TransactionForTests(args());
    expect(id).toBeNull();

    const orphan = mocks.inserts.find((c) => c.table === x402OrphanSettlements);
    expect(orphan).toBeTruthy();
    const rawArgs = (orphan!.vals as { rawArgs: { inputs: unknown; slug: string } }).rawArgs;
    expect(rawArgs.inputs).toEqual({ password: NOT_STORED_MARKER });
    expect(rawArgs.slug).toBe("password-strength");

    const everyWrite = mocks.inserts.map((c) => stringifyForSearch(c.vals)).join("\n");
    expect(everyWrite).not.toContain(SECRET);
  });
});
