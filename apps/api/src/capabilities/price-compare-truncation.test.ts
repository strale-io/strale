/**
 * Regression test for price-compare's own instance of the 2026-08-17
 * output-truncation bug class (see web-extract-truncation.test.ts for the
 * production incident on web-extract, and llm-extract.ts's module docstring
 * for the shared fix).
 *
 * Unlike web-extract, price-compare already had a `stop_reason === "max_tokens"`
 * check before this migration — but it threw a plain `Error`, not a
 * `CapabilityRefusalError`. Per the file's own comment, the truncation this
 * guards against is not hypothetical: "Truncation surfaced as 'Unterminated
 * string in JSON' via the naive parser (production incident, 2026-06-17→24)."
 * The plain Error's message contained no phrase transaction-failure-taxonomy.ts
 * recognizes as caller-attributable, so it fell through to the `internal`
 * default — counting a busy-shopping-page truncation against the capability's
 * own completion rate under the armed quality floor (DEC-20260812-A), the
 * same misclassification class PR #314 fixed on web-extract.
 *
 * Mocking pattern follows web-extract-truncation.test.ts / product-reviews-
 * extract-truncation.test.ts: mock ./lib/browserless-extract.js and
 * @anthropic-ai/sdk directly.
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
import "./price-compare.js";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";
import { classifyTransactionFailure, CALLER_ATTRIBUTABLE } from "../lib/transaction-failure-taxonomy.js";

describe("price-compare output-truncation handling", () => {
  beforeEach(() => {
    fetchRenderedHtml.mockReset();
    messagesCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
    fetchRenderedHtml.mockResolvedValue("<html>lots of offers</html>");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const exec = () => getDirectExecutor("price-compare")!;

  it("requests a 4000 max_tokens budget", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"product_name":"Widget","prices":[]}' }],
    });

    await exec()({ product: "widget", country: "se" });

    expect(messagesCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ max_tokens: 4000 }),
    );
  });

  it("throws the truncation refusal (not a plain Error) when stop_reason is max_tokens — the bug case", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      // Deliberately truncated mid-array — the naive parser would have
      // thrown "Unterminated string in JSON", exactly the production
      // incident this capability's own comment documents.
      content: [{ type: "text", text: '{"prices": [{"merchant": "Elgiganten", "price": 299' }],
    });

    let error: unknown;
    try {
      await exec()({ product: "widget", country: "se" });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CapabilityRefusalError);
    expect((error as Error).message).toMatch(/too large for one call/);
    expect((error as Error).message).toMatch(/smaller or more focused request/i);
    // Must NOT be the old plain-Error wording this replaced.
    expect((error as Error).message).not.toMatch(
      /produced more output than the model's limit allows/,
    );
  });

  it("the truncation refusal classifies as caller_input under the quality floor (the actual production fix)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "{" }],
    });

    let message = "";
    try {
      await exec()({ product: "widget", country: "se" });
    } catch (e) {
      message = (e as Error).message;
    }

    const cls = classifyTransactionFailure(message);
    expect(cls).toBe("caller_input");
    expect(CALLER_ATTRIBUTABLE.has(cls)).toBe(true);
  });

  it("still throws the ordinary parse-failure error for genuinely malformed, non-truncation output (must not regress)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Sorry, no offers found on this page." }],
    });

    let error: unknown;
    try {
      await exec()({ product: "widget", country: "se" });
    } catch (e) {
      error = e;
    }

    expect(error).not.toBeInstanceOf(CapabilityRefusalError);
    expect((error as Error).message).toMatch(/Failed to extract price comparison data/);
    const cls = classifyTransactionFailure((error as Error).message);
    expect(cls).toBe("internal");
  });

  it("still succeeds normally when the response completes within budget (no over-triggering)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"product_name":"Widget","prices":[{"merchant":"Elgiganten","price":299}]}' }],
    });

    const result = await exec()({ product: "widget", country: "se" });

    expect(result.output).toMatchObject({ product_name: "Widget" });
  });
});
