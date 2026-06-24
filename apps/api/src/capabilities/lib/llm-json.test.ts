/**
 * Regression tests for the LLM-JSON-envelope parser.
 *
 * Trigger: production x402 traffic (2026-06-17→24) showed two capabilities
 * 500-ing on the naive `JSON.parse(text.match(/\{[\s\S]*\}/)![0])` pattern:
 *   - readme-generate (3/3): "Unterminated string in JSON at position ~7800"
 *     — output truncated at the 3000-token cap (same shape as #145's
 *     prompt-optimize fix).
 *   - price-compare (3/3): "Unexpected non-whitespace character after JSON" —
 *     the greedy regex over-captured trailing prose containing a `}`.
 *
 * Each test below fails against the pre-fix code path and passes against the
 * applied fix:
 *   - "truncation" cases fail without the `stop_reason === "max_tokens"` guard.
 *   - "trailing prose" cases fail against the greedy `\{[\s\S]*\}` regex.
 */

import { describe, it, expect } from "vitest";
import { extractFirstJsonObject, parseLlmJsonObject } from "./llm-json.js";

function textResponse(text: string, stop_reason: string | null = "end_turn") {
  return { stop_reason, content: [{ type: "text", text }] };
}

describe("extractFirstJsonObject", () => {
  it("returns the object verbatim when the response is a clean object", () => {
    expect(extractFirstJsonObject('{"a":1,"b":2}')).toBe('{"a":1,"b":2}');
  });

  it("drops trailing prose after the object (price-compare repro)", () => {
    // The greedy /\{[\s\S]*\}/ regex would capture through the `}` in the
    // trailing sentence and JSON.parse would throw "Unexpected non-whitespace
    // character after JSON". The balanced scan stops at the object's own close.
    const raw = '{"product_name":"Headphones","total_offers":3}\n\nNote: prices update hourly {check store}.';
    expect(extractFirstJsonObject(raw)).toBe('{"product_name":"Headphones","total_offers":3}');
  });

  it("ignores braces inside string values (README markdown with code blocks)", () => {
    const raw = '{"markdown":"# Title\\n\\nUse `const x = {a: 1}` in config {here}.","has_usage":true}';
    const extracted = extractFirstJsonObject(raw);
    expect(extracted).toBe(raw);
    expect(JSON.parse(extracted!).has_usage).toBe(true);
  });

  it("strips a leading markdown code fence / preamble before the object", () => {
    const raw = 'Here is the JSON:\n```json\n{"ok":true}\n```';
    expect(extractFirstJsonObject(raw)).toBe('{"ok":true}');
  });

  it("returns null when the object is never closed (truncated mid-object)", () => {
    expect(extractFirstJsonObject('{"markdown":"# A very long readme that got cut off mid-str')).toBeNull();
  });

  it("returns null when truncated mid-string even though that string contains braces (real prod shape)", () => {
    // The exact readme-generate failure: the markdown string holds a code
    // sample with braces, then the response is cut at the token cap. The greedy
    // regex matched to the last in-string `}` and JSON.parse threw
    // "Unterminated string in JSON"; the brace-aware scan stays inside the
    // unterminated string and reports no closeable object instead.
    const raw = '{"markdown":"# App\\n\\nRun `export CFG=${HOME}/x` then call foo({bar}) and never clo';
    expect(extractFirstJsonObject(raw)).toBeNull();
  });

  it("returns null when there is no object at all", () => {
    expect(extractFirstJsonObject("no json here")).toBeNull();
  });
});

describe("parseLlmJsonObject", () => {
  it("parses a clean object", () => {
    const out = parseLlmJsonObject(textResponse('{"markdown":"# Hi","has_usage":true}'), "The README generator");
    expect(out).toEqual({ markdown: "# Hi", has_usage: true });
  });

  it("throws an actionable truncation error on stop_reason=max_tokens (readme-generate repro)", () => {
    // Pre-fix: no stop_reason check, so a truncated body reached JSON.parse and
    // threw a raw "Unterminated string in JSON" that surfaced as a 500.
    const truncated = textResponse('{"markdown":"# README\\nThis got cut off mid-str', "max_tokens");
    expect(() => parseLlmJsonObject(truncated, "The README generator")).toThrowError(/truncated/i);
  });

  it("recovers the object even when prose follows it (price-compare repro)", () => {
    const raw = '{"lowest_price":{"price":279},"total_offers":5}\n\nNote: see {store} for details.';
    const out = parseLlmJsonObject(textResponse(raw), "The price extractor");
    expect(out.total_offers).toBe(5);
  });

  it("throws a clean error (not a raw SyntaxError) when no JSON is present", () => {
    expect(() => parseLlmJsonObject(textResponse("I cannot help with that."), "The README generator")).toThrowError(
      /did not return JSON/i,
    );
  });

  it("throws a clean error when the extracted object is malformed JSON", () => {
    // Balanced braces but invalid contents (unquoted key) — caught and reworded.
    const out = textResponse("{markdown: not valid}");
    expect(() => parseLlmJsonObject(out, "The README generator")).toThrowError(/malformed JSON/i);
  });

  it("degrades to a clean error (never a raw SyntaxError) when a preamble holds an unbalanced brace", () => {
    // Not a production shape — the prompt asks for JSON only — but documents the
    // known limit of a single-pass brace scan: a misleading preamble such as
    // "call f({x})" makes it capture "{x}", which fails JSON.parse. The contract
    // that matters is that the caller gets an actionable error, not a 500.
    const raw = "Example: call f({x}) first.\n{\"ok\":true}";
    expect(() => parseLlmJsonObject(textResponse(raw), "The README generator")).toThrowError(
      /malformed JSON|did not return JSON/i,
    );
  });

  it("treats a non-text first block as empty (no crash)", () => {
    const weird = { stop_reason: "end_turn", content: [{ type: "tool_use" }] };
    expect(() => parseLlmJsonObject(weird, "The README generator")).toThrowError(/did not return JSON/i);
  });
});
