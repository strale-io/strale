/**
 * Regression tests for the 2026-08-17 LLM output-truncation bug — the
 * product-reviews-extract half of the fix.
 *
 * See web-extract-truncation.test.ts for the production incident this class
 * of bug caused on web-extract. product-reviews-extract had the same latent
 * bug (fixed max_tokens, no stop_reason check) plus a second, independent
 * defect: it parsed with the greedy regex `/\{[\s\S]*\}/`, which is exactly
 * the over-capture bug lib/llm-json.ts's docstring warns about — the regex
 * runs to the LAST `}` in the string, so trailing prose containing a brace
 * silently pulls unrelated text into the "parsed" object instead of failing.
 *
 * Mocking pattern matches the existing product-reviews-extract.test.ts file
 * (mock ./lib/browserless-extract.js and @anthropic-ai/sdk directly).
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
import { CapabilityRefusalError } from "../lib/capability-refusal.js";
import { classifyTransactionFailure, CALLER_ATTRIBUTABLE } from "../lib/transaction-failure-taxonomy.js";

describe("product-reviews-extract output-truncation handling", () => {
  beforeEach(() => {
    fetchRenderedHtml.mockReset();
    messagesCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
    fetchRenderedHtml.mockResolvedValue("<html>lots of reviews</html>");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const exec = () => getDirectExecutor("product-reviews-extract")!;

  it("requests an 8000 max_tokens budget (raised from 2000)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"average_rating":4.2}' }],
    });

    await exec()({ url: "https://www.consumerlab.com/example/" });

    expect(messagesCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ max_tokens: 8000 }),
    );
  });

  it("throws the truncation refusal (not a parse error) when stop_reason is max_tokens — the bug case", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"recent_reviews": [{"rating": 5, "text": "great product but the box was' }],
    });

    let error: unknown;
    try {
      await exec()({ url: "https://www.consumerlab.com/example/" });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CapabilityRefusalError);
    expect((error as Error).message).toMatch(/too large for one call/);
    expect((error as Error).message).toMatch(/fewer reviews/i);
    expect((error as Error).message).not.toMatch(/Failed to extract product review data/);
  });

  it("the truncation refusal classifies as caller_input under the quality floor", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "{" }],
    });

    let message = "";
    try {
      await exec()({ url: "https://www.consumerlab.com/example/" });
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
      content: [{ type: "text", text: "Sorry, I could not read this page." }],
    });

    let error: unknown;
    try {
      await exec()({ url: "https://www.consumerlab.com/example/" });
    } catch (e) {
      error = e;
    }

    expect(error).not.toBeInstanceOf(CapabilityRefusalError);
    expect((error as Error).message).toMatch(/Failed to extract product review data/);
  });

  it("now parses via extractJsonObject — does not over-capture trailing prose the old greedy regex would have grabbed", async () => {
    // The exact shape lib/llm-json.ts's docstring warns about: a well-formed
    // object followed by prose containing a brace. The old
    // `/\{[\s\S]*\}/` regex runs to the LAST `}` in the string, which is the
    // one in "{missing}" below — pulling the trailing sentence's brace into
    // the "parsed" span and making JSON.parse throw (or worse, silently
    // succeed on a mangled object) instead of returning the real result.
    const raw =
      '{"product_name":"Widget","average_rating":4.5,"review_count":10,' +
      '"recent_reviews":[{"rating":5,"title":"Great","text":"Loved it","date":"2024-01-15","verified":true}],' +
      '"common_pros":["Durable"],"common_cons":[],"sentiment_summary":"Positive"}\n\n' +
      "Note: some fields were left as {missing} because the page truncated the review list.";

    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: raw }],
    });

    const result = await exec()({ url: "https://www.consumerlab.com/widget/" });

    expect(result.output).toMatchObject({
      product_name: "Widget",
      average_rating: 4.5,
      review_count: 10,
      sentiment_summary: "Positive",
    });
    expect(result.output.url).toBe("https://www.consumerlab.com/widget/");
  });

  it("still succeeds normally when the response completes within budget (no over-triggering)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"average_rating":4.1,"review_count":5}' }],
    });

    const result = await exec()({ url: "https://www.consumerlab.com/example/" });

    expect(result.output).toMatchObject({ average_rating: 4.1, review_count: 5 });
  });
});
