/**
 * Regression test for translate's instance of the 2026-08-17 output-
 * truncation bug class (see web-extract-truncation.test.ts for the
 * production incident on web-extract, and llm-extract.ts's module docstring
 * for the shared fix).
 *
 * Before this migration, translate had no `stop_reason` check and parsed
 * with a greedy `/\{[\s\S]*\}/` regex + JSON.parse — both the truncation gap
 * AND the over-capture bug lib/llm-json.ts's docstring warns about (the
 * regex runs to the LAST `}` in the string). translate accepts unbounded
 * input text (no length cap in the executor), so a long source text can
 * plausibly produce a long-enough translation to exceed the 2000-token
 * output budget.
 *
 * Mocking pattern follows web-extract-truncation.test.ts: mock
 * @anthropic-ai/sdk directly (translate makes no other network calls).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

import { getDirectExecutor } from "./index.js";
import "./translate.js";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";
import { classifyTransactionFailure, CALLER_ATTRIBUTABLE } from "../lib/transaction-failure-taxonomy.js";

describe("translate output-truncation handling", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const exec = () => getDirectExecutor("translate")!;

  it("requests a 2000 max_tokens budget", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"translated_text":"hej","source_language":"English","target_language":"Swedish","confidence":"high"}' }],
    });

    await exec()({ text: "hello", target_language: "Swedish" });

    expect(messagesCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ max_tokens: 2000 }),
    );
  });

  it("throws the truncation refusal (not a parse error) when stop_reason is max_tokens — the bug case", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      // Deliberately truncated mid-string — before this fix, the greedy
      // regex would find no balanced object and JSON.parse would throw.
      content: [{ type: "text", text: '{"translated_text": "Detta är en mycket lång text som forts' }],
    });

    let error: unknown;
    try {
      await exec()({ text: "a very long text to translate", target_language: "Swedish" });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CapabilityRefusalError);
    expect((error as Error).message).toMatch(/too large for one call/);
    expect((error as Error).message).toMatch(/shorter text excerpt/i);
    // Must NOT be the old generic failure wording.
    expect((error as Error).message).not.toMatch(/^Translation failed\.$/);
  });

  it("the truncation refusal classifies as caller_input under the quality floor (the actual production fix)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "{" }],
    });

    let message = "";
    try {
      await exec()({ text: "hello", target_language: "Swedish" });
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
      content: [{ type: "text", text: "I'm not sure how to translate that." }],
    });

    let error: unknown;
    try {
      await exec()({ text: "hello", target_language: "Klingon" });
    } catch (e) {
      error = e;
    }

    expect(error).not.toBeInstanceOf(CapabilityRefusalError);
    expect((error as Error).message).toBe("Translation failed.");
    const cls = classifyTransactionFailure((error as Error).message);
    expect(cls).toBe("internal");
  });

  it("still succeeds normally when the response completes within budget (no over-triggering)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"translated_text":"hej","source_language":"English","target_language":"Swedish","confidence":"high"}' }],
    });

    const result = await exec()({ text: "hello", target_language: "Swedish" });

    expect(result.output).toMatchObject({ translated_text: "hej" });
  });
});
