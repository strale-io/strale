#!/usr/bin/env node
/**
 * Verify the x402-gateway-v2 settlement-order regression test actually
 * catches the original DEC-14 bug shapes. For each mutation, we copy the
 * real source to a tmp file, apply the mutation, then point the regression
 * test at it via X402_GATEWAY_V2_PATH and assert the test FAILS.
 *
 * Run:   node scripts/verify-settlement-order-mutations.mjs
 * Cleans up tmp files. Does not touch the real source.
 */

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const REAL = resolve("src/routes/x402-gateway-v2.ts");
const TEST_FILE = "src/routes/x402-gateway-v2.settlement-order.test.ts";
const original = readFileSync(REAL, "utf-8");

const mutations = [
  {
    name: "settle BEFORE executor (the original 2026-04-15 bug shape)",
    apply: (src) => {
      // Inject a stray settleX402Payment() call right after `verified = verification.verified;`
      // inside the wildcard capability handler — the pre-fix code path.
      // Find the wildcard handler's start first, then the anchor *within it*,
      // so a future reorder of the two handlers can't silently target the
      // solutions handler instead.
      const wildcardHandlerStart = src.indexOf('x402GatewayV2.on(["GET", "POST"], "/:slug"');
      if (wildcardHandlerStart === -1)
        throw new Error("wildcard handler registration not found — anchor stale");
      const anchor = "verified = verification.verified;";
      const anchorIdx = src.indexOf(anchor, wildcardHandlerStart);
      if (anchorIdx === -1)
        throw new Error("anchor `verified = verification.verified;` not found inside wildcard handler");
      const insertAt = anchorIdx + anchor.length;
      return (
        src.slice(0, insertAt) +
        "\n    await settleX402Payment(verified);\n" +
        src.slice(insertAt)
      );
    },
  },
  {
    name: "settle inside executor's catch block",
    apply: (src) => {
      // Insert a settle call inside the catch{} after `await executor(inputs)`.
      const catchAnchor = "logError(\"x402-failure-record-failed\", recordErr, { slug: cap.slug });";
      const idx = src.indexOf(catchAnchor);
      if (idx === -1) throw new Error("catch anchor not found");
      const insertAt = idx + catchAnchor.length;
      return (
        src.slice(0, insertAt) +
        "\n      if (verified) await settleX402Payment(verified);\n" +
        src.slice(insertAt)
      );
    },
  },
  {
    name: "validation moved AFTER settle",
    apply: (src) => {
      // Drop the 'Missing required fields' guard from the wildcard handler.
      // This string is currently unique to the wildcard handler (the solution
      // handler uses 'no steps produced output' instead). Assert uniqueness
      // explicitly so a future edit that adds the same string to the solutions
      // handler can't silently make this mutation target the wrong handler.
      const occurrences = src.match(/Missing required fields/g) ?? [];
      if (occurrences.length !== 1) {
        throw new Error(
          `expected exactly 1 occurrence of 'Missing required fields' (wildcard handler only); found ${occurrences.length}. Tighten the anchor.`,
        );
      }
      return src.replace("Missing required fields", "Missing reqd flds__MUTATED");
    },
  },
];

const tmp = mkdtempSync(join(tmpdir(), "x402-mut-"));
let allCaught = true;

try {
  for (const { name, apply } of mutations) {
    const mutatedPath = join(tmp, `mutated-${name.replace(/[^a-z0-9]/gi, "_")}.ts`);
    writeFileSync(mutatedPath, apply(original), "utf-8");

    let failed = false;
    try {
      execSync(`npx vitest run ${TEST_FILE} --reporter=basic`, {
        env: { ...process.env, X402_GATEWAY_V2_PATH: mutatedPath },
        stdio: "pipe",
      });
    } catch {
      failed = true;
    }

    console.log(
      `[${failed ? "✓" : "✗"}] mutation: ${name} — test ${failed ? "FAILED (as expected)" : "PASSED (BUG: not caught)"}`,
    );
    if (!failed) allCaught = false;
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (!allCaught) {
  console.error("\nFAIL: at least one mutation was not caught. The regression test is not load-bearing.");
  process.exit(1);
}
console.log("\nOK: every mutation was caught. Regression test verified.");
