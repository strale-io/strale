/**
 * Regression test for the MCP-funnel / x402-payer-hash addition
 * (migration 0083, 2026-08-15 readiness P0).
 *
 * No HTTP harness exists for x402-gateway-v2.ts (same DEC-20260504-A
 * test-harness exemption as x402-gateway-v2.settlement-order.test.ts), so
 * this is a structural source-static check. It pins two things a future
 * refactor could silently break:
 *
 *   1. `recordX402Transaction`'s INSERT populates `x402PayerHash` from
 *      `hashX402Payer(args.payerAddress)` — NOT the raw `args.payerAddress`.
 *      Writing the raw address into this column would defeat the whole
 *      point of the column (see db/schema.ts's comment on
 *      `transactions.x402PayerHash` and attribution.ts's `hashX402Payer`
 *      docstring for the privacy rationale).
 *   2. `hashX402Payer` is imported from `../lib/attribution.js` — the
 *      canonical hashing module — rather than a locally re-implemented hash
 *      (which would drift from the stable-vs-daily-rotating distinction
 *      `saltedIpHash` and `hashX402Payer` are built to keep separate).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SOURCE_PATH =
  process.env.X402_GATEWAY_V2_PATH ?? resolve(__dirname, "x402-gateway-v2.ts");

let source: string;

beforeAll(() => {
  source = readFileSync(SOURCE_PATH, "utf-8");
});

describe("x402-gateway-v2 — x402_payer_hash wiring", () => {
  it("imports hashX402Payer from the canonical attribution module", () => {
    expect(source).toMatch(
      /import\s*\{[^}]*\bhashX402Payer\b[^}]*\}\s*from\s*["']\.\.\/lib\/attribution\.js["']/,
    );
  });

  it("recordX402Transaction's INSERT sets x402PayerHash from hashX402Payer(...), never the raw address", () => {
    expect(source, "recordX402Transaction INSERT must exist").toContain(
      "await db.insert(transactions).values({",
    );
    // A single anchored regex is enough here (unlike settlement-order.test.ts,
    // which needs handler-body scoping to check RELATIVE ORDERING of several
    // calls) — `x402PayerHash: hashX402Payer(args.payerAddress)` is a unique
    // call shape that can't plausibly appear anywhere else in the file, so no
    // brace-walk extraction is needed to scope the match. Catches both "field
    // dropped" and "raw address assigned directly" regressions.
    expect(source).toMatch(/x402PayerHash:\s*hashX402Payer\(args\.payerAddress\)/);
  });
});
