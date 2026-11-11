import { describe, expect, it, vi } from "vitest";
import { currentCallerKey, runAsCaller } from "./caller-scope.js";

vi.mock("./invocation-facts.js", () => ({ recordAnonymousInvocation: vi.fn(), computeServedFree: vi.fn() }));
vi.mock("./shutdown.js", () => ({ trackBackgroundTask: vi.fn() }));

describe("caller scope", () => {
  it("is absent by default and retains the outer caller through nesting", async () => {
    expect(currentCallerKey()).toBeNull();
    await runAsCaller("ip:hashed-not-raw", async () => {
      expect(currentCallerKey()).toBe("ip:hashed-not-raw");
      await runAsCaller("acct:other", async () => expect(currentCallerKey()).toBe("ip:hashed-not-raw"));
    });
    expect(currentCallerKey()).toBeNull();
  });

  it("executeWithRetry derives opaque account and anonymous caller keys", async () => {
    const { anonymousCallerKey, executeWithRetry } = await import("./do/dispatch.js");
    const { hashIp } = await import("./middleware.js");
    const seen: Array<string | null> = [];
    const executor = async () => { seen.push(currentCallerKey()); return { output: {} }; };
    const capability = { slug: "caller-scope-test", capabilityType: "deterministic" } as never;
    await executeWithRetry(executor, {}, capability, { kind: "account", userId: "user-1" });
    const rawIp = "203.0.113.9";
    await executeWithRetry(executor, {}, capability, { kind: "anonymous", servedFree: true, callerKey: anonymousCallerKey(hashIp(rawIp)) });
    expect(seen).toEqual(["acct:user-1", `ip:${hashIp(rawIp)}`]);
    expect(seen.join(" ")).not.toContain("203.0.113.9");
  });
});
