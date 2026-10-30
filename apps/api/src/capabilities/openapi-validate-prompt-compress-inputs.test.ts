/**
 * Regression tests for two defects a paying customer's QA sweep hit in
 * production on 2026-10-29/30:
 *  - openapi-validate threw "(input.spec ?? input.task ?? "").trim is not a
 *    function" when `spec` was a parsed object instead of a string.
 *  - prompt-compress failed with "Failed to compress prompt. Raw: ```json..."
 *    when the model's fenced JSON carried raw line breaks inside the
 *    compressed_prompt string (readable, but invalid for JSON.parse), and the
 *    error echoed the raw model output.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

import { getDirectExecutor } from "./index.js";
import "./openapi-validate.js";
import "./prompt-compress.js";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";

const spec = {
  openapi: "3.0.0",
  info: { title: "T", version: "1" },
  paths: { "/a": { get: { responses: { "200": { description: "ok" } } } } },
};

describe("openapi-validate input types", () => {
  const exec = () => getDirectExecutor("openapi-validate")!;

  it("validates a spec passed as a parsed object", async () => {
    const r = await exec()({ spec });
    expect(r.output.valid).toBe(true);
    expect(r.output.endpoint_count).toBe(1);
  });

  it("still validates a JSON string", async () => {
    const r = await exec()({ spec: JSON.stringify(spec) });
    expect(r.output.valid).toBe(true);
  });

  it.each([42, true, ["x"]])("refuses non-string non-object spec %j with a structured error", async (bad) => {
    const p = exec()({ spec: bad as never });
    await expect(p).rejects.toBeInstanceOf(CapabilityRefusalError);
  });
});

describe("prompt-compress model output handling", () => {
  const exec = () => getDirectExecutor("prompt-compress")!;
  beforeEach(() => {
    messagesCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("parses fenced JSON whose string contains raw line breaks", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: '```json\n{ "compressed_prompt": "Line one\nLine two", "removed_content": ["a"], "preserved_instructions": ["b"] }\n```',
        },
      ],
    });
    const r = await exec()({ prompt_text: "Please could you kindly write two lines of text for me, thanks." });
    expect(r.output.compressed_prompt).toBe("Line one\nLine two");
  });

  it("does not echo raw model output on a genuine parse failure", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: "```json\nSECRET-RAW-OUTPUT not json\n```" }],
    });
    const p = exec()({ prompt_text: "Compress this prompt please." });
    await expect(p).rejects.toThrow(/Failed to compress prompt/);
    await expect(p).rejects.not.toThrow(/SECRET-RAW-OUTPUT/);
  });
});
