/**
 * Both customer rails run a capability executor through the same
 * transient-retry policy (lib/retry.ts executeWithTransientRetry).
 *
 * Until 2026-10-19 POST /v1/do retried a non-deterministic executor once on
 * HTTP 429/502/503/504 while the x402 gateway called it bare, so a wallet
 * buyer lost requests an account buyer would have been served: on 2026-10-05
 * eight paid french-company-data calls failed on the registry's HTTP 429 in
 * three minutes, unbilled and unserved.
 *
 * Two halves. The behavioural half drives the shared policy with a real
 * executor double. The structural half (no HTTP harness exists for
 * x402-gateway-v2.ts; DEC-20260504-A exemption, same as the
 * settlement-order test) proves each rail reaches the executor only through
 * that policy — against the pre-fix gateway it fails on the bare
 * `await executor(inputs)`.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { executeWithTransientRetry } from "./retry.js";

vi.mock("./log.js", () => ({ logWarn: vi.fn(), logError: vi.fn(), log: vi.fn() }));

const here = dirname(fileURLToPath(import.meta.url));

function flaky(failures: string[], value = { output: { ok: true } }) {
  let n = 0;
  return vi.fn(async (_input: Record<string, unknown>) => {
    if (n < failures.length) throw new Error(failures[n++]);
    return value;
  });
}

describe("executeWithTransientRetry — the shared policy", () => {
  it("serves a non-deterministic capability whose upstream said HTTP 429 once", async () => {
    const executor = flaky(["French API returned HTTP 429"]);
    const result = await executeWithTransientRetry(executor, { name: "x" }, {
      slug: "french-company-data", capabilityType: "data",
    });
    expect(result).toEqual({ output: { ok: true } });
    expect(executor).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("retries once only: a second 429 fails with the original error", async () => {
    const executor = flaky(["French API returned HTTP 429", "French API returned HTTP 503"]);
    await expect(executeWithTransientRetry(executor, {}, {
      slug: "french-company-data", capabilityType: "data",
    })).rejects.toThrow("HTTP 429");
    expect(executor).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("never retries a refusal", async () => {
    const executor = flaky(['No French company found matching "X".']);
    await expect(executeWithTransientRetry(executor, {}, {
      slug: "french-company-data", capabilityType: "data",
    })).rejects.toThrow("No French company found");
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it("never retries a deterministic capability", async () => {
    const executor = flaky(["HTTP 429"]);
    await expect(executeWithTransientRetry(executor, {}, {
      slug: "iban-validate", capabilityType: "deterministic",
    })).rejects.toThrow("HTTP 429");
    expect(executor).toHaveBeenCalledTimes(1);
  });
});

describe("both rails reach the executor only through the shared policy", () => {
  const gateway = readFileSync(resolve(here, "../routes/x402-gateway-v2.ts"), "utf-8");
  // The /v1/do route delegates to lib/do/dispatch.ts; scan both so a bare
  // executor call cannot creep back into the route file either.
  const doRoute = [resolve(here, "../routes/do.ts"), resolve(here, "./do/dispatch.ts")]
    .map((path) => readFileSync(path, "utf-8"))
    .join("\n");

  it("x402 gateway: no bare executor call; the capability handler uses the policy", () => {
    expect(gateway).not.toMatch(/await\s+executor\s*\(/);
    expect(gateway).toMatch(/await executeWithTransientRetry\(async input => \{[\s\S]*?await beginX402Execution\(claimId, paymentHash\);[\s\S]*?return executor\(input\);[\s\S]*?\}, inputs, cap\)/);
  });

  it("POST /v1/do: no bare executor call or private retry; executeWithRetry uses the policy", () => {
    expect(doRoute).not.toMatch(/await\s+executor\s*\(/);
    expect(doRoute).not.toMatch(/withRetry\s*\(/);
    expect(doRoute).toMatch(/await executeWithTransientRetry\(executor, input, capability\)/);
  });
});
