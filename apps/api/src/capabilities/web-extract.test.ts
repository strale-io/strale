import { describe, expect, it } from "vitest";
// Side-effect import registers just this executor (see
// approval-security-check.test.ts for why not autoRegisterCapabilities).
import "./web-extract.js";
import { getExecutor } from "./index.js";
import { TOS_REFUSAL_MARKER } from "./lib/tos-blocklist.js";

// Regression test for the web-extract ToS bypass (P1, 2026-08-12): the
// per-source policy blocklist gated product-reviews-extract and
// domain-contact-extract but NOT the generic web-extract path, so a caller
// refused on a prohibited source could re-run the identical extraction with a
// raw prompt. The assertion runs before any env/Browserless access, so this
// test needs no credentials and makes no network calls.

describe("web-extract ToS enforcement", () => {
  it("refuses a blocklisted source with the standard refusal marker", async () => {
    const fn = getExecutor("web-extract")!;
    await expect(
      fn({ url: "https://www.trustpilot.com/review/example.com", extract: "all reviews and ratings" }),
    ).rejects.toThrow(TOS_REFUSAL_MARKER);
  });

  it("still requires a url", async () => {
    const fn = getExecutor("web-extract")!;
    await expect(fn({ extract: "anything" })).rejects.toThrow(/'url' is required/);
  });
});
