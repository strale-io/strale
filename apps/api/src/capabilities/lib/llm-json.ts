/**
 * Parse the JSON object an LLM was asked to return as its entire response.
 *
 * Capabilities that prompt Claude with "Return ONLY valid JSON" share two
 * recurring failure modes that the naive
 * `JSON.parse(text.match(/\{[\s\S]*\}/)![0])` pattern turns into an
 * unactionable 500 (raw `SyntaxError` bubbling out of the executor):
 *
 *   1. Truncation — the model ran into `max_tokens` and the JSON is cut off
 *      mid-string ("Unterminated string in JSON at position N"). PR #145 fixed
 *      this for prompt-optimize by scaling the output budget and checking
 *      `stop_reason`; readme-generate carried the identical latent bug
 *      (3/3 production failures, 2026-06-17→24).
 *
 *   2. Trailing prose — the model appends an explanation after the object, and
 *      when that prose contains a `}` the greedy `\{[\s\S]*\}` regex
 *      over-captures, so JSON.parse chokes on
 *      "Unexpected non-whitespace character after JSON at position N".
 *      (price-compare, same traffic window.)
 *
 * This helper surfaces truncation as a distinct, retryable error and extracts
 * the first *balanced* top-level JSON object (brace-aware, string literals and
 * escapes respected) so trailing prose — even prose containing braces — is
 * dropped instead of breaking the parse.
 */

/** Minimal structural view of an Anthropic Messages response. */
interface LlmResponse {
  stop_reason: string | null;
  content: Array<{ type: string; text?: string }>;
}

/**
 * Return the first balanced `{...}` object in `text`, or `null` if none is
 * present or the object is never closed (truncated mid-object). Brace counting
 * ignores braces inside string literals and respects backslash escapes, so a
 * `}` inside a string value — or in prose after the object — does not end the
 * scan early.
 */
export function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null; // unbalanced — object was never closed (likely truncated)
}

/**
 * Extract and parse the JSON object from an LLM response.
 *
 * @param response The Anthropic Messages response (or any object exposing
 *   `stop_reason` and a `content` array of text blocks). Only the first content
 *   block is inspected; multi-block responses (e.g. a tool-use block alongside
 *   text) are not supported — these capabilities use text-only, tool-less
 *   prompts.
 * @param label Human-readable subject for error messages, e.g. "The README
 *   generator" — phrased so the error reads "<label> returned malformed JSON".
 * @throws Error with an actionable, retryable message on truncation, missing
 *   JSON, or a parse failure — never a raw `SyntaxError`.
 */
export function parseLlmJsonObject(
  response: LlmResponse,
  label: string,
): Record<string, unknown> {
  // Truncation: the model hit its output ceiling and the JSON is incomplete.
  // Surface it as a clear, actionable error instead of a cryptic
  // "Unterminated string in JSON" from JSON.parse. The advice is deliberately
  // output-neutral — for readme-generate the output size is driven by the
  // generated README, not the input, so "shorten your input" would be wrong
  // guidance for an agent retrying the call.
  if (response.stop_reason === "max_tokens") {
    throw new Error(
      `${label} produced more output than the model's limit allows, so the result was truncated. Retry with a smaller or more focused request.`,
    );
  }

  const block = response.content[0];
  const text =
    block?.type === "text" && typeof block.text === "string" ? block.text.trim() : "";

  const objectText = extractFirstJsonObject(text);
  if (!objectText) {
    throw new Error(`${label} did not return JSON. Please retry.`);
  }

  try {
    return JSON.parse(objectText) as Record<string, unknown>;
  } catch (err) {
    // Keep the caller-facing message clean, but preserve the underlying
    // SyntaxError as `cause` so logs can tell a genuinely-malformed model
    // response apart from an extractFirstJsonObject bug.
    throw new Error(`${label} returned malformed JSON. Please retry.`, { cause: err });
  }
}
