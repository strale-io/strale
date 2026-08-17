/**
 * Unit tests for the shared create-call -> truncation-refusal -> safe-parse
 * helper extracted from web-extract.ts / product-reviews-extract.ts
 * (2026-08-17, see llm-extract.ts's module docstring for the incident).
 *
 * Mocking pattern follows web-extract-truncation.test.ts: a fake Anthropic
 * client object is passed directly into the helper (the helper never
 * constructs its own client), so no module-level vi.mock is needed here.
 */
import { describe, it, expect, vi } from "vitest";
import { extractJsonWithLlm } from "./llm-extract.js";
import { CapabilityRefusalError } from "../../lib/capability-refusal.js";
import {
  classifyTransactionFailure,
  CALLER_ATTRIBUTABLE,
} from "../../lib/transaction-failure-taxonomy.js";

function fakeClient(response: unknown) {
  return {
    messages: { create: vi.fn().mockResolvedValue(response) },
  } as unknown as import("@anthropic-ai/sdk").default;
}

describe("extractJsonWithLlm", () => {
  it("returns the parsed object on a normal, within-budget response", async () => {
    const client = fakeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"headline":"hi","count":3}' }],
    });

    const result = await extractJsonWithLlm({
      client,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 4000,
      prompt: "extract things",
      truncationGuidance: "Narrow the request.",
      parseFailureError: () => new Error("should not fire"),
    });

    expect(result).toEqual({ headline: "hi", count: 3 });
  });

  it("calls messages.create with the exact model/maxTokens/prompt passed in", async () => {
    const client = fakeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "{}" }],
    });

    await extractJsonWithLlm({
      client,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 12345,
      prompt: "the exact prompt text",
      truncationGuidance: "guidance",
      parseFailureError: () => new Error("x"),
    });

    expect(client.messages.create).toHaveBeenCalledExactlyOnceWith({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 12345,
      messages: [{ role: "user", content: "the exact prompt text" }],
    });
  });

  it("throws CapabilityRefusalError with the registered prefix when stop_reason is max_tokens", async () => {
    const client = fakeClient({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: '{"partial": "cut off mid-obj' }],
    });

    let error: unknown;
    try {
      await extractJsonWithLlm({
        client,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 4000,
        prompt: "extract things",
        truncationGuidance: "Narrow the request or process fewer items per call.",
        parseFailureError: () => new Error("should not fire — truncation must be caught first"),
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CapabilityRefusalError);
    const message = (error as Error).message;
    // Byte-identical to the prefix registered in capability-refusal.ts's
    // REFUSAL_MESSAGE_PATTERNS (matched by startsWith).
    expect(message.startsWith("Extraction result too large for one call")).toBe(true);
    expect(message).toContain("Narrow the request or process fewer items per call.");
  });

  it("does not attempt to parse when truncated — parseFailureError never fires on the truncation path", async () => {
    const client = fakeClient({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "{" }],
    });

    const parseFailureError = vi.fn(() => new Error("must not be thrown"));

    await expect(
      extractJsonWithLlm({
        client,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 4000,
        prompt: "extract things",
        truncationGuidance: "guidance",
        parseFailureError,
      }),
    ).rejects.toBeInstanceOf(CapabilityRefusalError);

    expect(parseFailureError).not.toHaveBeenCalled();
  });

  it("handles an empty content array without throwing a TypeError (optional-chained)", async () => {
    const client = fakeClient({
      stop_reason: "end_turn",
      content: [],
    });

    let error: unknown;
    try {
      await extractJsonWithLlm({
        client,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 4000,
        prompt: "extract things",
        truncationGuidance: "guidance",
        parseFailureError: (responseText) => new Error(`parse failed, raw="${responseText}"`),
      });
    } catch (e) {
      error = e;
    }

    // Must be the caller's parse-failure error, not a raw TypeError from
    // indexing into an empty array.
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe('parse failed, raw=""');
  });

  it("throws the caller's exact parseFailureError for malformed (non-truncation) output", async () => {
    const client = fakeClient({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "Sorry, I could not find anything on this page." }],
    });

    const customError = new Error("Failed to parse extraction result as JSON. Raw response: <snip>");

    let error: unknown;
    try {
      await extractJsonWithLlm({
        client,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 4000,
        prompt: "extract things",
        truncationGuidance: "guidance",
        parseFailureError: () => customError,
      });
    } catch (e) {
      error = e;
    }

    expect(error).toBe(customError);
    expect(error).not.toBeInstanceOf(CapabilityRefusalError);
  });

  it("parses a fenced JSON block even with trailing prose after it", async () => {
    const client = fakeClient({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text:
            'Here is the result:\n```json\n{"a": 1, "b": "two"}\n```\n\n' +
            "Note: some fields were left as {missing} because the page was incomplete.",
        },
      ],
    });

    const result = await extractJsonWithLlm({
      client,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 4000,
      prompt: "extract things",
      truncationGuidance: "guidance",
      parseFailureError: () => new Error("should not fire"),
    });

    // The fenced block's own object, not over-captured by the trailing
    // prose's brace — the exact bug lib/llm-json.ts's docstring warns about.
    expect(result).toEqual({ a: 1, b: "two" });
  });

  it("the truncation refusal classifies as caller_input under the quality floor (integration pin)", async () => {
    const client = fakeClient({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "{" }],
    });

    let message = "";
    try {
      await extractJsonWithLlm({
        client,
        model: "claude-haiku-4-5-20251001",
        maxTokens: 4000,
        prompt: "extract things",
        truncationGuidance: "Narrow the request.",
        parseFailureError: () => new Error("should not fire"),
      });
    } catch (e) {
      message = (e as Error).message;
    }

    const cls = classifyTransactionFailure(message);
    expect(cls).toBe("caller_input");
    expect(CALLER_ATTRIBUTABLE.has(cls)).toBe(true);
  });
});
