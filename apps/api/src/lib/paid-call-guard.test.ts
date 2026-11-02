import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PaidCallBlockedError,
  assertPaidCallAllowed,
  isPaidCallBlockedMessage,
  runWithoutPaidCalls,
} from "./paid-call-guard.js";
import { createAnthropicClient } from "./anthropic-client.js";
import { meteredVendorFetch } from "./metered-vendor-fetch.js";
import { classifyFailure } from "./failure-classifier.js";
import { MODELS } from "./models.js";
import { getExecutor } from "../capabilities/index.js";
import "../capabilities/canadian-company-data.js";

describe("paid-call guard", () => {
  it("allows paid calls outside a non-customer scope", () => {
    expect(() => assertPaidCallAllowed("anthropic")).not.toThrow();
  });

  it("refuses paid calls inside a non-customer scope, across awaits", async () => {
    await expect(
      runWithoutPaidCalls("internal_test", async () => {
        await new Promise((r) => setTimeout(r, 1));
        assertPaidCallAllowed("anthropic");
      }),
    ).rejects.toBeInstanceOf(PaidCallBlockedError);
  });

  it("a concurrent customer call is never caught by a test's scope", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const scoped = runWithoutPaidCalls("internal_test", async () => {
      await gate;
      assertPaidCallAllowed("anthropic");
    });
    const customer = (async () => {
      await gate;
      assertPaidCallAllowed("anthropic");
      return "ok";
    })();
    release();
    await expect(scoped).rejects.toBeInstanceOf(PaidCallBlockedError);
    await expect(customer).resolves.toBe("ok");
  });

  it("stops an Anthropic request before any network traffic", async () => {
    const fetchSpy = vi.fn();
    const client = createAnthropicClient({ apiKey: "test-key", fetch: fetchSpy as never });
    await expect(
      runWithoutPaidCalls("internal_test", async () =>
        client.messages.create({
          model: MODELS.capability_default.id,
          max_tokens: 10,
          messages: [{ role: "user", content: "hi" }],
        }),
      ),
    ).rejects.toBeInstanceOf(PaidCallBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("stops a billable metered vendor call, lets a free-quota vendor through", async () => {
    const fetchSpy = vi.fn(async () => new Response("{}", { status: 200 }));
    await expect(
      runWithoutPaidCalls("internal_test", () =>
        meteredVendorFetch("serper", "https://google.serper.dev/search", {}, 1, fetchSpy),
      ),
    ).rejects.toBeInstanceOf(PaidCallBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();

    const ok = await runWithoutPaidCalls("internal_test", () =>
      meteredVendorFetch("openregister", "https://example.invalid/", {}, 1, fetchSpy),
    );
    expect(ok.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("classifies a blocked test as test_infrastructure, not a capability failure", () => {
    const message = new PaidCallBlockedError("anthropic", "internal_test").message;
    expect(isPaidCallBlockedMessage(message)).toBe(true);
    expect(isPaidCallBlockedMessage(`Execution error: ${message}`)).toBe(true);
    for (const testType of ["known_answer", "negative", "edge_case"]) {
      expect(classifyFailure(message, false, false, testType, {}).verdict).toBe("test_infrastructure");
    }
  });
});

// Incident 2026-11-02: canadian-company-data is classified free_unlimited, so
// the scheduler runs it, but its name path calls Claude Haiku. Its second
// known_answer suite looks up "Shopify" by name, so every scheduled run paid
// Anthropic. Since then a plain company_name goes to the free registry
// search first (canadian-company-data.name-path.test.ts); free text in `task`
// still reaches the Claude extraction step, so that is what this pins.
describe("canadian-company-data name lookup inside a non-customer scope", () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  const fetchSpy = vi.fn();
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
    vi.unstubAllGlobals();
    fetchSpy.mockReset();
  });

  it("refuses before reaching Anthropic", async () => {
    const executor = getExecutor("canadian-company-data");
    expect(executor).toBeDefined();
    await expect(
      runWithoutPaidCalls("internal_test", () => executor!({ task: "look up Shopify" })),
    ).rejects.toBeInstanceOf(PaidCallBlockedError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
