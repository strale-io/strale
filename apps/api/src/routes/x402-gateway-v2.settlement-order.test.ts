/**
 * Regression test for DEC-14 / x402 verify→execute→settle invariant.
 *
 * On 2026-04-15 a probe burst (20 capabilities hit with `{}` input in 90s)
 * settled USDC on every validation failure because the original x402 path
 * verified-and-settled before executing. The 2026-04-17 fix split verify
 * and settle so the on-chain broadcast only happens after the executor
 * (or solution orchestrator) returns successfully. That fix shipped without
 * a regression test; this is the one.
 *
 * No HTTP harness exists for x402-gateway-v2.ts so this is a structural
 * source-static check (DEC-20260504-A test-harness exemption). Both
 * handlers in the file — the solution handler and the wildcard capability
 * handler — must satisfy:
 *
 *   1. Every `settleX402Payment(` call sits AFTER the first
 *      `executor(` / `executeSolution(` call in source order.
 *   2. The executor's catch block contains NO `settleX402Payment(` call —
 *      a thrown executor must never trigger settlement.
 *   3. Input-validation early-returns (`Missing required fields`,
 *      `Invalid request body`) precede every `settleX402Payment(` call.
 *
 * Re-running the un-fixed code (settle inside the verify block, before
 * executor) fails check 1. Wrapping the executor try/catch around the
 * settle call (so a thrown error settles anyway) fails check 2. Reordering
 * validation past settle fails check 3.
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

/**
 * Slice the body of a top-level handler registered as
 *   x402GatewayV2.<verb>(...args, async (c) => { … })
 * by walking braces from the first `{` after the marker.
 *
 * Limitation: the walker counts every `{` and `}` including those inside
 * template-literal expressions (`${…}`). The current handlers don't use
 * template literals at the top level, and a malformed extract is caught
 * downstream by `expect(settles.length).toBeGreaterThan(0)` — a body
 * that doesn't contain a settle call fails loudly. If a future refactor
 * pushes template literals into the handler body and the extract stops
 * reaching `settleX402Payment(`, the test errors rather than silently
 * passing. If that happens, swap this for ts.createSourceFile.
 */
function extractHandlerBody(src: string, marker: string): string {
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`marker not found: ${marker}`);
  const openBrace = src.indexOf("{", start);
  if (openBrace === -1) throw new Error(`no { after marker: ${marker}`);
  let depth = 0;
  for (let i = openBrace; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(openBrace, i + 1);
    }
  }
  throw new Error(`unterminated body for marker: ${marker}`);
}

/** Indices of every `settleX402Payment(` call in a handler body, in source order. */
function settleIndices(handlerBody: string): number[] {
  const re = /settleX402Payment\s*\(/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(handlerBody)) !== null) out.push(m.index);
  return out;
}

/**
 * Assert every settle call in the handler appears AFTER the validation
 * marker. Checks all settle calls, not just the first — a regression
 * that re-orders any settle (not just the earliest) trips this.
 */
function assertValidationPrecedesEverySettle(
  body: string,
  validationMarker: string,
  existsMessage: string,
): void {
  const validationIdx = body.indexOf(validationMarker);
  expect(validationIdx, existsMessage).toBeGreaterThan(-1);
  const settles = settleIndices(body);
  expect(settles.length, "expected at least one settle call").toBeGreaterThan(0);
  for (const idx of settles) {
    expect(
      idx,
      `settleX402Payment at offset ${idx} must come after "${validationMarker}" guard at ${validationIdx}`,
    ).toBeGreaterThan(validationIdx);
  }
}

/**
 * Walk every `catch (…) { … }` block in the handler body and return their
 * full source slices (including braces). Used by handlers that don't have
 * a single canonical catch block to extract — the assertion is generic:
 * no catch, anywhere, may call settleX402Payment.
 */
function allCatchBlocks(handlerBody: string): string[] {
  const re = /catch\s*\([^)]*\)\s*\{/g;
  const blocks: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(handlerBody)) !== null) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < handlerBody.length; i++) {
      const ch = handlerBody[i];
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          blocks.push(handlerBody.slice(open, i + 1));
          break;
        }
      }
    }
  }
  return blocks;
}

/**
 * Slice the catch block immediately following the first
 * `try { … result = await executor(inputs); … }` in the handler body.
 */
function extractExecutorCatchBlock(handlerBody: string): string {
  const execIdx = handlerBody.indexOf("await executor(inputs)");
  if (execIdx === -1) throw new Error("executor call not found in handler");
  const tryIdx = handlerBody.lastIndexOf("try {", execIdx);
  if (tryIdx === -1) throw new Error("no `try {` precedes executor call");

  let depth = 0;
  let tryEnd = -1;
  for (let i = handlerBody.indexOf("{", tryIdx); i < handlerBody.length; i++) {
    const ch = handlerBody[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) { tryEnd = i; break; }
    }
  }
  if (tryEnd === -1) throw new Error("unterminated try block");

  // No `^` anchor: tolerate intervening whitespace, comments, or newlines
  // between the try block's `}` and the `catch` keyword. The match index
  // is offset back into the full body. The trailing `-1` lands `catchOpen`
  // on the catch block's opening `{` so the brace walker below starts at
  // depth 0 and slices including the brace.
  const catchMatch = handlerBody.slice(tryEnd + 1).match(/\s*catch\s*\([^)]*\)\s*\{/);
  if (!catchMatch) throw new Error("no catch block after try");
  const catchOpen = tryEnd + 1 + catchMatch.index! + catchMatch[0].length - 1;

  depth = 0;
  for (let i = catchOpen; i < handlerBody.length; i++) {
    const ch = handlerBody[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return handlerBody.slice(catchOpen, i + 1);
    }
  }
  throw new Error("unterminated catch block");
}

describe("x402-gateway-v2 — DEC-14 settlement ordering", () => {
  describe("wildcard capability handler /:slug", () => {
    let body: string;
    beforeAll(() => {
      body = extractHandlerBody(
        source,
        'x402GatewayV2.on(["GET", "POST"], "/:slug"',
      );
    });

    it("settleX402Payment is called only after executor() returns", () => {
      const execIdx = body.indexOf("await executor(inputs)");
      expect(execIdx, "executor(inputs) call must exist").toBeGreaterThan(-1);

      const settles = settleIndices(body);
      expect(settles.length, "expected at least one settle call").toBeGreaterThan(0);
      for (const idx of settles) {
        expect(
          idx,
          `settleX402Payment at offset ${idx} must come after executor() at ${execIdx}`,
        ).toBeGreaterThan(execIdx);
      }
    });

    it("executor catch block does not call settleX402Payment", () => {
      const catchBlock = extractExecutorCatchBlock(body);
      expect(catchBlock).not.toMatch(/settleX402Payment\s*\(/);
    });

    it("'Missing required fields' validation precedes every settle call", () => {
      assertValidationPrecedesEverySettle(body, "Missing required fields", "validation branch must exist");
    });

    it("'Invalid request body' validation precedes every settle call", () => {
      assertValidationPrecedesEverySettle(body, "Invalid request body", "JSON-parse validation branch must exist");
    });

    it("recordX402Transaction failure-path passes settlementId: undefined", () => {
      // Belt-and-suspenders: even though settle isn't called on executor
      // failure, the failed-transaction record must explicitly pass
      // settlementId: undefined so a future copy-paste from the success
      // path can't accidentally backfill a real settlement id.
      const catchBlock = extractExecutorCatchBlock(body);
      expect(catchBlock).toMatch(/settlementId:\s*undefined/);
    });
  });

  describe("solution handler /solutions/:slug", () => {
    let body: string;
    beforeAll(() => {
      body = extractHandlerBody(
        source,
        'x402GatewayV2.on(["GET", "POST"], "/solutions/:slug"',
      );
    });

    it("settleX402Payment is called only after executeSolution() returns", () => {
      const execIdx = body.indexOf("await executeSolution(");
      expect(execIdx, "executeSolution() call must exist").toBeGreaterThan(-1);

      const settles = settleIndices(body);
      expect(settles.length, "expected at least one settle call").toBeGreaterThan(0);
      for (const idx of settles) {
        expect(
          idx,
          `settleX402Payment at offset ${idx} must come after executeSolution() at ${execIdx}`,
        ).toBeGreaterThan(execIdx);
      }
    });

    it("'no steps produced output' early-return precedes every settle call", () => {
      // The solution handler's equivalent of validation failure: if no
      // step succeeded the caller's authorization is left to expire.
      assertValidationPrecedesEverySettle(body, "no steps produced output", "all-failed guard must exist");
    });

    it("'Invalid request body' validation precedes every settle call", () => {
      assertValidationPrecedesEverySettle(body, "Invalid request body", "JSON-parse validation branch must exist");
    });

    it("no catch block in the solutions handler calls settleX402Payment", () => {
      // Forward-looking: today the solutions handler has no try/catch
      // around executeSolution() (errors propagate uncaught and the all-
      // failed-steps path returns 502 before settle). If a future edit
      // adds a try/catch and settles inside it on failure, this test trips.
      for (const catchBody of allCatchBlocks(body)) {
        expect(catchBody).not.toMatch(/settleX402Payment\s*\(/);
      }
    });
  });
});
