import { beforeEach, describe, expect, it, vi } from "vitest";

const { assertVendorAvailable, recordVendorHttpFailure, recordVendorUsage } = vi.hoisted(() => ({
  assertVendorAvailable: vi.fn(),
  recordVendorHttpFailure: vi.fn(),
  recordVendorUsage: vi.fn(),
}));

vi.mock("./vendor-control-tower.js", () => ({
  assertVendorAvailable,
  recordVendorHttpFailure,
  recordVendorUsage,
}));
vi.mock("./log.js", () => ({ logWarn: vi.fn() }));

import { meteredVendorFetch, vendorReachabilityFetch } from "./metered-vendor-fetch.js";

describe("meteredVendorFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.VENDOR_CONTROL_TOWER_FORCE = "1";
  });

  it("blocks an exhausted Browserless account before any network request", async () => {
    assertVendorAvailable.mockRejectedValueOnce(new Error("exhausted"));
    const network = vi.fn();

    await expect(meteredVendorFetch("browserless", "https://production-sfo.browserless.io/content", {}, 1, network))
      .rejects.toThrow("exhausted");
    expect(network).not.toHaveBeenCalled();
  });

  it("records successful units exactly once", async () => {
    const response = new Response("{}", { status: 200 });
    const network = vi.fn().mockResolvedValue(response);

    await expect(meteredVendorFetch("serper", "https://google.serper.dev/search", {}, 1, network))
      .resolves.toBe(response);
    expect(recordVendorUsage).toHaveBeenCalledWith("serper", 1);
    expect(recordVendorHttpFailure).not.toHaveBeenCalled();
  });

  it("records a hard upstream refusal before returning it to the executor", async () => {
    const response = new Response("no credits", { status: 402 });
    const network = vi.fn().mockResolvedValue(response);

    await expect(meteredVendorFetch("openregister", "https://api.openregister.de/v1/company/id", {}, 10, network))
      .resolves.toBe(response);
    expect(recordVendorHttpFailure).toHaveBeenCalledWith("openregister", 402);
    expect(recordVendorUsage).not.toHaveBeenCalled();
  });

  it("passes eSortcode's response detail so ZeroCredits is not mistaken for bad credentials", async () => {
    const response = new Response(JSON.stringify({ message: "ZeroCredits" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
    const network = vi.fn().mockResolvedValue(response);

    await expect(meteredVendorFetch("esortcode", "https://wsp.esortcode.com/uk/v1/cop", {}, 1, network))
      .resolves.toBe(response);
    expect(recordVendorHttpFailure).toHaveBeenCalledWith("esortcode", 403, expect.stringContaining("ZeroCredits"));
    await expect(response.json()).resolves.toMatchObject({ message: "ZeroCredits" });
  });

  it("does not classify an expected unauthenticated reachability response as an account failure", async () => {
    const response = new Response("unauthorized", { status: 401 });
    const network = vi.fn().mockResolvedValue(response);

    await expect(vendorReachabilityFetch("browserless", "https://production-sfo.browserless.io", {}, network))
      .resolves.toBe(response);
    expect(assertVendorAvailable).toHaveBeenCalledWith("browserless");
    expect(recordVendorHttpFailure).not.toHaveBeenCalled();
    expect(recordVendorUsage).not.toHaveBeenCalled();
  });
});
