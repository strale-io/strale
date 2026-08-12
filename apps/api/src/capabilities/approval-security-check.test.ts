import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { autoRegisterCapabilities } from "./auto-register.js";
import { getExecutor } from "./index.js";

// GoPlus sends message:null for several error codes (2029 observed for
// addresses with pathological approval counts); the previous error text
// collapsed that to "unknown error" and hid a week of diagnosis (P1
// 2026-08-12). The numeric code must always surface.

beforeAll(async () => {
  await autoRegisterCapabilities();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("approval-security-check error surfacing", () => {
  it("includes the numeric GoPlus code when message is null", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ code: 2029, message: null, result: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const fn = getExecutor("approval-security-check")!;
    await expect(fn({ address: "0x28C6c06298d514Db089934071355E5743bf21d60", chain_id: "1" }))
      .rejects.toThrow(/GoPlus API error code 2029/);
  });
});
