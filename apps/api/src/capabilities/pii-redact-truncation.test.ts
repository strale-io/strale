/**
 * Regression test for pii-redact's instance of the 2026-08-17 output-
 * truncation bug class (see web-extract-truncation.test.ts for the
 * production incident on web-extract, and llm-extract.ts's module docstring
 * for the shared fix).
 *
 * Before this migration, pii-redact had no `stop_reason` check at all — a
 * response cut off at max_tokens would fail to parse and fall through to the
 * generic "Failed to parse redaction result as JSON" error, which
 * transaction-failure-taxonomy.ts's INTERNAL_RE classifies as `internal`
 * (matches "failed to parse"). Redaction requests scale with input text
 * length (up to 100k chars accepted), so a long input with many detected PII
 * entities is a realistic way to exceed the 4000-token output budget.
 *
 * Mocking pattern follows web-extract-truncation.test.ts: mock
 * @anthropic-ai/sdk directly (pii-redact makes no other network calls).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { messagesCreate } = vi.hoisted(() => ({ messagesCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

import { getDirectExecutor } from "./index.js";
import "./pii-redact.js";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";
import { classifyTransactionFailure, CALLER_ATTRIBUTABLE } from "../lib/transaction-failure-taxonomy.js";

describe("pii-redact output-truncation handling", () => {
  beforeEach(() => {
    messagesCreate.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const exec = () => getDirectExecutor("pii-redact")!;

  it("requests a 4000 max_tokens budget", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: '{"redacted_text":"hi","entities":[],"entity_counts":{"PERSON_NAME":0,"EMAIL":0,"PHONE":0,"SSN":0,"ADDRESS":0,"IBAN":0,"CREDIT_CARD":0,"PASSPORT":0,"ID_NUMBER":0}}',
        },
      ],
    });

    await exec()({ text: "Call me at 555-0100" });

    expect(messagesCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ max_tokens: 4000 }),
    );
  });

  it("throws the truncation refusal (not a parse error) when stop_reason is max_tokens — the bug case", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      // Deliberately truncated mid-object — before this fix, extractJsonObject
      // (now via extractJsonWithLlm) would return null and the executor fell
      // through to the generic parse-failure error.
      content: [{ type: "text", text: '{"redacted_text": "Call [REDACTED_PHONE], my name is [REDACTED' }],
    });

    let error: unknown;
    try {
      await exec()({ text: "Call 555-0100, my name is Alice Andersson" });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CapabilityRefusalError);
    expect((error as Error).message).toMatch(/too large for one call/);
    expect((error as Error).message).toMatch(/shorter text excerpt/i);
    // Must NOT be the old generic parse-failure wording.
    expect((error as Error).message).not.toMatch(/Failed to parse redaction result as JSON/);
  });

  it("the truncation refusal classifies as caller_input under the quality floor (the actual production fix)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "{" }],
    });

    let message = "";
    try {
      await exec()({ text: "some text with PII" });
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
      content: [{ type: "text", text: "I cannot process this request." }],
    });

    let error: unknown;
    try {
      await exec()({ text: "some text" });
    } catch (e) {
      error = e;
    }

    expect(error).not.toBeInstanceOf(CapabilityRefusalError);
    expect((error as Error).message).toMatch(/Failed to parse redaction result as JSON/);
    const cls = classifyTransactionFailure((error as Error).message);
    expect(cls).toBe("internal");
  });

  it("still succeeds normally when the response completes within budget (no over-triggering)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [
        {
          type: "text",
          text: '{"redacted_text":"Call [REDACTED_PHONE]","entities":[{"type":"PHONE","start":5,"end":13,"redacted_as":"[REDACTED_PHONE]"}],"entity_counts":{"PERSON_NAME":0,"EMAIL":0,"PHONE":1,"SSN":0,"ADDRESS":0,"IBAN":0,"CREDIT_CARD":0,"PASSPORT":0,"ID_NUMBER":0}}',
        },
      ],
    });

    const result = await exec()({ text: "Call 555-0100" });

    expect((result.output as Record<string, unknown>).redacted_text).toBe("Call [REDACTED_PHONE]");
  });
});
