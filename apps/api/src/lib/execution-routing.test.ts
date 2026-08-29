/**
 * #436 — the sync/async routing policy, and the band where it goes wrong.
 *
 * DEC-22's decision was an inline expression in `routes/do.ts`, so the only
 * way to check a capability against it was to reason about a line number.
 * Naming it made these assertions possible; they are cheap, and one of them
 * is the thing nobody had written down: the routing threshold and the wall
 * the sync path dies at are DIFFERENT numbers, five seconds apart.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  ASYNC_THRESHOLD_MS,
  SYNC_TRANSACTION_WALL_MS,
  shouldExecuteAsync,
} from "./execution-routing.js";

describe("shouldExecuteAsync", () => {
  it("routes sync below the threshold", () => {
    expect(shouldExecuteAsync(ASYNC_THRESHOLD_MS - 1)).toBe(false);
  });

  it("routes sync AT the threshold — the comparison is strictly greater", () => {
    expect(shouldExecuteAsync(ASYNC_THRESHOLD_MS)).toBe(false);
  });

  it("routes async above the threshold", () => {
    expect(shouldExecuteAsync(ASYNC_THRESHOLD_MS + 1)).toBe(true);
  });

  it("routes an UNMEASURED capability sync, which is the risky default", () => {
    // Not an accident worth silently preserving — it is the reason 36 active
    // capabilities with a null latency are all on the sync path, one of them
    // (`company-news`) with a p95 of 29.4s. Pinned so a change to it is
    // deliberate rather than incidental.
    expect(shouldExecuteAsync(null)).toBe(false);
    expect(shouldExecuteAsync(undefined)).toBe(false);
  });

  it("page-speed-test's OLD declared latency routed it sync", () => {
    // 8000 ms, the value in production when #434 measured it.
    expect(shouldExecuteAsync(8000)).toBe(false);
  });

  it("the value the operator UPDATE sets routes it async", () => {
    expect(shouldExecuteAsync(20_000)).toBe(true);
  });
});

describe("the threshold and the wall", () => {
  it("leaves a band where a capability is routed sync but can be killed", () => {
    // The defect in one assertion. Anything whose executions land between
    // these two numbers is routed into a wall it may not clear, and the
    // decision is made on an average against a hard limit.
    expect(ASYNC_THRESHOLD_MS).toBeLessThan(SYNC_TRANSACTION_WALL_MS);
  });

  it("the wall constant matches the one the sync path actually sets", () => {
    // A restated constant that drifts from the SET LOCAL it describes would
    // make the audit script quietly wrong, which is worse than not having it.
    const doSrc = readFileSync(resolve(__dirname, "../routes/do.ts"), "utf-8");
    const seconds = SYNC_TRANSACTION_WALL_MS / 1000;
    expect(doSrc).toContain(`SET LOCAL idle_in_transaction_session_timeout = '${seconds}s'`);
  });

  it("do.ts reads the policy from here rather than restating it", () => {
    const doSrc = readFileSync(resolve(__dirname, "../routes/do.ts"), "utf-8");
    expect(doSrc).toMatch(/shouldExecuteAsync\(capability\.avgLatencyMs\)/);
    expect(doSrc, "do.ts kept its own copy of the threshold").not.toMatch(
      /const ASYNC_THRESHOLD_MS\s*=/,
    );
  });
});
