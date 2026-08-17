/**
 * Regression tests for the 2026-08-17 LLM output-truncation bug.
 *
 * web-extract called Claude Haiku with a fixed max_tokens and never checked
 * stop_reason. A paying x402 customer requested extraction of a ~100-name
 * roster page from ipt.org; the model's output hit the 4000-token cap,
 * truncated mid-JSON, extractJsonObject() correctly returned null
 * (unbalanced braces), and the capability threw a generic
 * "Failed to parse extraction result as JSON" error. That message contains
 * "failed to parse", which transaction-failure-taxonomy.ts's INTERNAL_RE
 * classifies as `internal` — our fault — so the armed quality floor
 * (DEC-20260812-A) counted six such failures in 5 minutes and quarantined a
 * revenue-earning capability over its own truncation bug.
 *
 * The fix raises the token budget (4000 -> 16000) and, when the model still
 * hits the cap, throws a distinct CapabilityRefusalError BEFORE attempting to
 * parse — instead of falling through to the generic parse-failure error.
 *
 * Mocking pattern follows product-reviews-extract.test.ts: mock
 * ./lib/browserless-extract.js (web-extract.ts's actual import) and
 * @anthropic-ai/sdk directly, rather than exercising the full web-provider
 * retry/cache machinery (that's covered separately by
 * web-extract-resilience.test.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { fetchRenderedHtml, messagesCreate } = vi.hoisted(() => ({
  fetchRenderedHtml: vi.fn(),
  messagesCreate: vi.fn(),
}));

vi.mock("./lib/browserless-extract.js", () => ({
  fetchRenderedHtml,
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: messagesCreate };
  },
}));

import { getDirectExecutor } from "./index.js";
import "./web-extract.js";
import { CapabilityRefusalError } from "../lib/capability-refusal.js";
import { classifyTransactionFailure, CALLER_ATTRIBUTABLE } from "../lib/transaction-failure-taxonomy.js";

describe("web-extract output-truncation handling", () => {
  beforeEach(() => {
    fetchRenderedHtml.mockReset();
    messagesCreate.mockReset();
    process.env.BROWSERLESS_URL = "https://chromium.test";
    process.env.BROWSERLESS_API_KEY = "test-token";
    process.env.ANTHROPIC_API_KEY = "test-key";
    fetchRenderedHtml.mockResolvedValue(
      `<html><head><title>Roster</title></head><body>${"Member name. ".repeat(200)}</body></html>`,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const exec = () => getDirectExecutor("web-extract")!;

  it("requests a 16000 max_tokens budget (raised from 4000)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"headline":"hi"}' }],
    });

    await exec()({ url: "https://example.com/roster", extract: "every member name" });

    expect(messagesCreate).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ max_tokens: 16000 }),
    );
  });

  it("throws the truncation refusal (not a parse error) when stop_reason is max_tokens — the bug case", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      // Deliberately truncated mid-object — extractJsonObject would return
      // null for this, and the old code fell through to the generic parse
      // error. The fix must never reach extractJsonObject at all here.
      content: [{ type: "text", text: '{"members": [{"name": "Alice"}, {"name": "Bob' }],
    });

    let error: unknown;
    try {
      await exec()({ url: "https://example.com/roster", extract: "every member name and title" });
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CapabilityRefusalError);
    expect((error as Error).message).toMatch(/too large for one call/);
    expect((error as Error).message).toMatch(/narrow your 'extract' instruction/i);
    // Must NOT be the old generic parse-failure wording.
    expect((error as Error).message).not.toMatch(/Failed to parse extraction result as JSON/);
  });

  it("the truncation refusal classifies as caller_input under the quality floor (the actual production fix)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "max_tokens",
      content: [{ type: "text", text: "{" }],
    });

    let message = "";
    try {
      await exec()({ url: "https://example.com/roster", extract: "every member" });
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
      content: [{ type: "text", text: "The page had no extractable data, sorry!" }],
    });

    let error: unknown;
    try {
      await exec()({ url: "https://example.com/empty", extract: "headline" });
    } catch (e) {
      error = e;
    }

    expect(error).not.toBeInstanceOf(CapabilityRefusalError);
    expect((error as Error).message).toMatch(/Failed to parse extraction result as JSON/);
    // This one is still ours — the floor must keep counting it.
    const cls = classifyTransactionFailure((error as Error).message);
    expect(cls).toBe("internal");
  });

  it("still succeeds normally when the response completes within budget (no over-triggering)", async () => {
    messagesCreate.mockResolvedValueOnce({
      stop_reason: "end_turn",
      content: [{ type: "text", text: '{"headline":"Example roster","count":3}' }],
    });

    const result = await exec()({ url: "https://example.com/roster", extract: "headline and count" });

    expect(result.output.data).toMatchObject({ headline: "Example roster", count: 3 });
  });
});
