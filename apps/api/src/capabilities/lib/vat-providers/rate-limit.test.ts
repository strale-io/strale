/**
 * Outbound rate limits for vat-validate's providers.
 *
 * The Swiss UID register's permission for Strale's commercial use holds only
 * while Strale stays inside the register's published limit of 20 requests a
 * minute. These tests pin that the limit is enforced before the call is sent,
 * that the budget fails closed, that no 60-second span can exceed 20 under
 * the counter's fixed windows, and that a refusal of Strale's own making
 * never counts against the capability.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("../../../lib/db-rate-limit.js", () => ({
  takeUpstreamSlot: vi.fn(async () => {
    throw new Error("tests pass their own take function");
  }),
}));

import { PROVIDER_RATE_LIMITS, withProviderRateLimit } from "./rate-limit.js";
import { UpstreamUnavailableError } from "../../../lib/upstream-result.js";
import { outcomeFromError, shouldCountAgainstCapability } from "../../../lib/execution-outcome.js";

const REGISTER_LIMIT_PER_MINUTE = 20;

function allow() {
  return vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 }));
}

describe("withProviderRateLimit", () => {
  it("passes an unlimited provider straight through without reading the budget", async () => {
    const take = allow();
    const fn = vi.fn(async () => "answer");
    await expect(withProviderRateLimit("vies", fn, take)).resolves.toBe("answer");
    expect(take).not.toHaveBeenCalled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("takes a uid-ch slot from the shared budget before calling the register", async () => {
    const order: string[] = [];
    const take = vi.fn(async (bucket: string, windowSeconds: number, max: number) => {
      order.push(`take ${bucket} ${windowSeconds}/${max}`);
      return { allowed: true, retryAfterSeconds: 0 };
    });
    const fn = vi.fn(async () => {
      order.push("call");
      return "answer";
    });
    await expect(withProviderRateLimit("uid-ch", fn, take)).resolves.toBe("answer");
    expect(order).toEqual(["take uid-ch 15/3", "call"]);
  });

  it("does not call the register when the budget is spent, and says when to retry", async () => {
    const take = vi.fn(async () => ({ allowed: false, retryAfterSeconds: 7 }));
    const fn = vi.fn(async () => "answer");
    const err = await withProviderRateLimit("uid-ch", fn, take).catch((e: unknown) => e);
    expect(fn).not.toHaveBeenCalled();
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    const e = err as UpstreamUnavailableError;
    expect(e.code).toBe("rate_budget_spent");
    expect(e.retryable).toBe(true);
    expect(e.ownBudget).toBe(true);
    expect(e.message).toMatch(/^Upstream unavailable: Swiss UID register: /);
    expect(e.message).toContain("retry in 7 seconds");
  });

  it("fails closed when the budget cannot be read", async () => {
    const take = vi.fn(async () => {
      throw new Error("connection terminated");
    });
    const fn = vi.fn(async () => "answer");
    const err = await withProviderRateLimit("uid-ch", fn, take).catch((e: unknown) => e);
    expect(fn).not.toHaveBeenCalled();
    expect(err).toBeInstanceOf(UpstreamUnavailableError);
    expect((err as UpstreamUnavailableError).code).toBe("rate_budget_unreadable");
    expect((err as UpstreamUnavailableError).ownBudget).toBe(true);
  });

  it.each(["rate_budget_spent", "rate_budget_unreadable"])(
    "words the %s refusal so no string classifier files it as the caller's fault",
    async (code) => {
      const take =
        code === "rate_budget_spent"
          ? vi.fn(async () => ({ allowed: false, retryAfterSeconds: 3 }))
          : vi.fn(async () => {
              throw new Error("db down");
            });
      const err = (await withProviderRateLimit("uid-ch", async () => 1, take).catch((e: unknown) => e)) as Error;
      expect(err.message).not.toMatch(/not found|invalid|missing|required|401|403/i);
    },
  );
});

describe("a refusal of Strale's own making", () => {
  // Failure family F1: a burst of Swiss demand must not push vat-validate
  // under its quality floor or open the breaker that would also stop the
  // EU, Norwegian and UK paths. The breaker and the floor both read
  // shouldCountAgainstCapability.
  it.each(["rate_budget_spent", "rate_budget_unreadable"])("%s is unbilled, ours, and not counted", async (code) => {
    const take =
      code === "rate_budget_spent"
        ? vi.fn(async () => ({ allowed: false, retryAfterSeconds: 3 }))
        : vi.fn(async () => {
            throw new Error("db down");
          });
    const err = await withProviderRateLimit("uid-ch", async () => 1, take).catch((e: unknown) => e);
    const outcome = outcomeFromError(err);
    expect(outcome).toMatchObject({ billable: false, fault: "strale", counts_against_capability: false });
    expect(shouldCountAgainstCapability(err)).toBe(false);
  });

  it("leaves a real register outage counted against the capability", () => {
    const err = new UpstreamUnavailableError("Swiss UID register", "HTTP 503; retry shortly.", { code: "HTTP 503" });
    expect(outcomeFromError(err)).toMatchObject({ fault: "provider", counts_against_capability: true });
  });
});

describe("the uid-ch budget against the register's limit of 20 a minute", () => {
  const { windowSeconds, max } = PROVIDER_RATE_LIMITS["uid-ch"]!;

  it("cannot exceed the limit in any 60 seconds, whatever the window alignment", () => {
    // A 60-second span touches at most ceil(60 / window) + 1 fixed windows.
    const windowsTouched = Math.ceil(60 / windowSeconds) + 1;
    expect(windowsTouched * max).toBeLessThan(REGISTER_LIMIT_PER_MINUTE);
  });

  it("holds under a simulated flood against the counter's epoch-aligned windows", () => {
    // Model of incrementAndCheck: one counter per epoch-aligned window,
    // allowed while the post-increment count is <= max. Attempts arrive every
    // 50 ms for ten minutes from an unaligned start.
    const counts = new Map<number, number>();
    const allowedAt: number[] = [];
    for (let t = 1_234; t < 1_234 + 600_000; t += 50) {
      const start = Math.floor(t / (windowSeconds * 1000));
      const count = (counts.get(start) ?? 0) + 1;
      counts.set(start, count);
      if (count <= max) allowedAt.push(t);
    }
    let worst = 0;
    for (let i = 0, j = 0; i < allowedAt.length; i++) {
      while (allowedAt[i]! - allowedAt[j]! >= 60_000) j++;
      worst = Math.max(worst, i - j + 1);
    }
    expect(worst).toBeLessThanOrEqual(REGISTER_LIMIT_PER_MINUTE);
    expect(worst).toBeGreaterThan(0);
  });
});

describe("wiring", () => {
  it("vat-validate sends every provider call through the limiter", () => {
    const src = readFileSync(fileURLToPath(new URL("../../vat-validate.ts", import.meta.url)), "utf8");
    const calls = src.match(/provider\.validate\(/g) ?? [];
    expect(calls.length).toBe(1);
    expect(src).toMatch(/withProviderRateLimit\(provider\.name, \(\) =>\s*provider\.validate\(parsed\)/);
  });

  it("the uid-ch provider's name matches the limits map", () => {
    const src = readFileSync(fileURLToPath(new URL("./uid-ch.ts", import.meta.url)), "utf8");
    expect(src).toMatch(/name: "uid-ch"/);
  });
});
