/**
 * Regression tests for the Trustpilot rejection (2026-08-05).
 *
 * Production 2026-07-20 → 2026-08-05: 28 of 31 x402 calls to this capability
 * failed, every one a `trustpilot.com/review/*` URL returning HTTP 403 bot
 * protection. Each failure had already paid for a Browserless render before
 * the 403 came back, and the caller got the target's blocking message rather
 * than a straight answer — so several retried the identical URL 3-4 times.
 *
 * The fix rejects prohibited targets before any network work. These tests
 * assert the *ordering* (no fetch at all), not just the throw, because
 * throwing after the render would leave the wasted cost in place.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { fetchRenderedHtml, messagesCreate } = vi.hoisted(() => ({
  fetchRenderedHtml: vi.fn(),
  messagesCreate: vi.fn(),
}));

vi.mock("./lib/browserless-extract.js", () => ({
  fetchRenderedHtml,
  htmlToText: (h: string) => h,
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

import { getDirectExecutor } from "./index.js";
import "./product-reviews-extract.js";

describe("product-reviews-extract ToS rejection", () => {
  beforeEach(() => {
    fetchRenderedHtml.mockReset();
    messagesCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const exec = () => getDirectExecutor("product-reviews-extract")!;

  it("rejects a Trustpilot review URL without rendering it (the bug case)", async () => {
    await expect(
      exec()({ url: "https://www.trustpilot.com/review/bemancandles.co.uk" }),
    ).rejects.toThrow(/Trustpilot is not a supported source/);

    expect(fetchRenderedHtml).not.toHaveBeenCalled();
  });

  it("rejects the uk. subdomain form callers also sent", async () => {
    await expect(
      exec()({ url: "https://uk.trustpilot.com/review/imaanactive.co.uk" }),
    ).rejects.toThrow(/Terms of Service prohibit automated access/);

    expect(fetchRenderedHtml).not.toHaveBeenCalled();
  });

  it("tells the caller retrying will not help and names an alternative", async () => {
    let message = "";
    try {
      await exec()({ url: "https://www.trustpilot.com/review/stripe.com" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/retrying .* will not succeed/i);
    expect(message).toContain("Reviews.io");
  });

  it("still extracts from an allowed source (no over-blocking)", async () => {
    // consumerlab.com completed successfully in the same production window.
    fetchRenderedHtml.mockResolvedValueOnce("<html>reviews</html>");
    messagesCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: '{"product_name":"Primaforce","average_rating":4.1}' }],
    });

    const result = await exec()({ url: "https://www.consumerlab.com/primaforce/" });

    expect(fetchRenderedHtml).toHaveBeenCalledExactlyOnceWith(
      "https://www.consumerlab.com/primaforce/",
    );
    expect(result.output).toMatchObject({
      product_name: "Primaforce",
      url: "https://www.consumerlab.com/primaforce/",
    });
    expect(result.provenance.source).toBe("consumerlab.com");
  });

  it("still requires a url, with guidance that no longer names Trustpilot", async () => {
    let message = "";
    try {
      await exec()({});
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/'url' or 'product_url' is required/);
    expect(message).not.toMatch(/Trustpilot/i);
  });
});
