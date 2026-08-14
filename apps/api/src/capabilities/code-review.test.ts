/**
 * Regression test for code-review.ts's control-character sanitizer.
 *
 * Claude occasionally emits raw (unescaped) control characters — most often
 * a literal newline — inside a JSON string value (e.g. embedding the
 * reviewed code snippet or a multi-line fix suggestion verbatim rather than
 * escaping it as \n). `JSON.parse` rejects any 0x00-0x1F byte inside a
 * string literal, so the naive `JSON.parse(jsonMatch[0])` throws and the
 * executor 500s. The fix retries once against a sanitized copy that escapes
 * \n/\r/\t and strips any other control byte before giving up.
 *
 * This test fails against the un-applied fix (bare `JSON.parse`, no catch)
 * and passes with it.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

import { getDirectExecutor } from "./index.js";
import "./code-review.js";

function textResponse(text: string) {
  return { content: [{ type: "text", text }], stop_reason: "end_turn" };
}

beforeEach(() => {
  messagesCreate.mockReset();
  process.env.ANTHROPIC_API_KEY = "test-key";
});

describe("code-review — control-character sanitizer", () => {
  it("recovers when the model embeds a raw newline inside a JSON string value", async () => {
    // Compact (single-line) JSON except for one literal newline embedded
    // inside the "description" string value — an unescaped control byte,
    // invalid per the JSON spec, but everything else on the line is
    // structurally fine so the sanitizer's blanket control-char escape
    // doesn't also corrupt formatting whitespace outside string literals.
    const raw =
      '{"language_detected":"javascript","overall_score":72,"issues":' +
      '[{"severity":"medium","category":"readability","line_number":3,' +
      '"description":"line one\nline two","fix_suggestion":"rename it"}],' +
      '"security_flags":[],"quick_wins":[],"positive_aspects":[],"summary":"ok"}';
    messagesCreate.mockResolvedValueOnce(textResponse(raw));

    const executor = getDirectExecutor("code-review")!;
    const result = await executor({ code: "const x = 1;", language: "javascript" });

    expect(result.output.overall_score).toBe(72);
    expect(result.output.focus).toBe("all");
  });

  it("still throws an actionable error when the sanitized text is unparseable", async () => {
    // Matches the outer `/\{[\s\S]*\}/` (braces present) but the body is not
    // valid JSON even after control-character sanitization — no bytes in
    // 0x00-0x1F range to strip, so the second parse attempt fails the same
    // way the first one did.
    messagesCreate.mockResolvedValueOnce(
      textResponse('{ this is not valid json at all }'),
    );

    const executor = getDirectExecutor("code-review")!;
    await expect(executor({ code: "const x = 1;" })).rejects.toThrow(
      /malformed JSON/,
    );
  });
});
