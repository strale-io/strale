/**
 * Shared create-call → truncation-refusal → safe-parse sequence for LLM
 * executors that ask Claude to return a single JSON object.
 *
 * Extracted 2026-08-17 from web-extract.ts and product-reviews-extract.ts
 * (PR #314, merged same day). Those two executors had a fixed max_tokens
 * budget and never checked `stop_reason`: a response cut off mid-object
 * produced an unbalanced-brace string that `extractJsonObject` correctly
 * returned null for, and the executor fell through to a generic
 * "Failed to parse ... as JSON" error. That message contains "failed to
 * parse", which `transaction-failure-taxonomy.ts`'s INTERNAL_RE classifies
 * as `internal` — our fault, not the caller's — so the armed quality floor
 * (DEC-20260812-A) counted the truncation as a capability defect and
 * quarantined web-extract in production after six paid x402 calls hit it in
 * five minutes, all six a single ~100-name roster page that legitimately
 * needed more output tokens than the old budget allowed.
 *
 * The fix has two parts, both encoded here so every JSON-extracting
 * executor gets them for free instead of re-deriving them per file:
 *
 *   1. Check `stop_reason === "max_tokens"` BEFORE attempting to parse, and
 *      throw a `CapabilityRefusalError` whose message starts with the exact
 *      prefix registered in `REFUSAL_MESSAGE_PATTERNS`
 *      ("Extraction result too large for one call") — so the truncation is
 *      attributed to the request's scope (caller_input) rather than to us,
 *      and the caller gets actionable guidance instead of a raw parse error.
 *   2. Parse with `extractJsonObject` (real brace-matching), never the
 *      greedy `/\{[\s\S]*\}/` regex several older executors used — that
 *      regex runs to the LAST `}` in the string, so trailing prose
 *      containing a brace silently pulls unrelated text into the "parsed"
 *      object instead of failing loudly.
 *
 * `parseFailureError` stays a caller-supplied callback (not a helper-branded
 * message) so each executor keeps its own byte-identical non-truncation
 * parse-failure wording — those strings are load-bearing: several already
 * feed capability-specific guidance to the caller, and the transaction
 * failure taxonomy keys off exact substrings, so a helper-standardized
 * message would silently reclassify existing failures.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { CapabilityRefusalError } from "../../lib/capability-refusal.js";
import { extractJsonObject } from "./llm-json.js";

export interface ExtractJsonWithLlmArgs {
  /** Caller-constructed client — keeps API-key/env handling in the executor. */
  client: Anthropic;
  model: string;
  /** Per-executor output-token budget. Unrelated executors may legitimately use different values. */
  maxTokens: number;
  /** The single user-message content. Every current caller uses one plain-text user message. */
  prompt: string;
  /**
   * Sampling temperature, forwarded to the API only when set. Left unset, the
   * API default (1.0) applies — which is what every executor did before this
   * field existed, so omitting it keeps a caller's behaviour byte-identical.
   *
   * Why it exists (2026-08-25): the first card-paying customer ran the same
   * competitor-compare input four times and got four different analyses —
   * trust-signal counts 11/13/10/9, analysis prose 180–294 chars — because no
   * LLM call on the platform set a temperature. Measured decomposition: on
   * identical input at the default, three runs produced three different
   * outputs with exactly that wobble; at temperature 0, three runs were
   * byte-identical. Extraction-shaped capabilities should pass 0; generative
   * ones (fake-data-generate, blog-post-outline, …) may legitimately want
   * sampling and should leave it unset. Note the honest limit: temperature 0
   * is near-deterministic within a model version, not a notarised guarantee —
   * a model update can still change the answer.
   */
  temperature?: number;
  /**
   * Caller-actionable sentence appended after the shared refusal prefix
   * sentence, e.g. "Narrow the request or process fewer items per call."
   */
  truncationGuidance: string;
  /**
   * Thrown when `extractJsonObject` returns null for a non-truncated
   * response. Receives the raw response text so the caller can include a
   * slice of it, matching what several executors already did inline.
   * Passing the caller's EXISTING error (same message, same Error subclass)
   * keeps taxonomy classification exactly where it was before migration.
   */
  parseFailureError: (responseText: string) => Error;
}

export async function extractJsonWithLlm(
  args: ExtractJsonWithLlmArgs,
): Promise<Record<string, unknown>> {
  const { client, model, maxTokens, prompt, truncationGuidance, parseFailureError, temperature } = args;

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    // Spread rather than `temperature: temperature` so an unset field sends
    // no key at all — the request body stays identical to the pre-field era
    // for the ~70 callers that do not pass one.
    ...(temperature !== undefined ? { temperature } : {}),
    messages: [{ role: "user", content: prompt }],
  });

  // Check BEFORE attempting to parse — see module docstring. A response cut
  // off at max_tokens is truncated mid-JSON, so extractJsonObject correctly
  // returns null (the object never closes), and falling through to the
  // generic parse-failure error would misclassify the failure as ours.
  if (response.stop_reason === "max_tokens") {
    throw new CapabilityRefusalError(
      "Extraction result too large for one call: the output exceeded the per-call budget before completing. " +
        truncationGuidance,
    );
  }

  const responseText =
    response.content[0]?.type === "text" ? response.content[0].text : "";

  const parsed = extractJsonObject(responseText);
  if (!parsed) {
    // Genuinely malformed (non-truncation) output. Stays whatever error
    // class the caller supplies — this is the executor's own parsing/
    // prompting problem, not the caller's request being too large.
    throw parseFailureError(responseText);
  }

  return parsed;
}
