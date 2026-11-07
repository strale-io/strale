import type Anthropic from "@anthropic-ai/sdk";
import { CapabilityRefusalError } from "./capability-refusal.js";
import { logWarn } from "./log.js";

/**
 * The text of a Messages response, read by block type.
 *
 * Why not read the first content block: newer models (Claude Haiku 5.5 and
 * later) think by default, so a response can open with one or more
 * `thinking` blocks before the answer. Code that reads the first block as the
 * answer then sees no text, and every JSON parse after it fails. Joining the
 * `text` blocks gives the same answer when the response is one text block,
 * and stays correct when the first block is something else.
 *
 * A safety refusal (`stop_reason: "refusal"`) comes back as a normal 200 with
 * little or no text. Read naively it becomes a parse failure, which the
 * failure taxonomy counts as our own defect and the quality floor can
 * quarantine a capability for. So it is raised as a refusal, with a message
 * starting with the prefix registered in REFUSAL_MESSAGE_PATTERNS.
 *
 * That classification is right when the caller's input caused the decline.
 * It would hide a decline caused by our own prompt or by a model change, which
 * then hits every call of a capability while the breaker and the quality
 * floor stay quiet. So every decline is also logged as `llm-refusal`, with its
 * category and model: a rate per capability there is ours to act on.
 * Capabilities that can still answer without the model (cookie-scan,
 * website-to-company, risk-narrative-generate) catch the refusal and degrade.
 *
 * apps/api/src/lib/llm-response.test.ts fails if any file that uses the
 * Anthropic SDK reads the first content block by position again.
 */
export const MODEL_DECLINED_PREFIX = "The AI model declined this request";

export function messageText(
  response: Pick<Anthropic.Messages.Message, "content" | "stop_reason"> & { model?: string; stop_details?: unknown },
): string {
  if (response.stop_reason === "refusal") {
    const category = (response.stop_details as { category?: unknown } | null | undefined)?.category;
    const named = typeof category === "string" && category ? category : null;
    logWarn("llm-refusal", "The model declined a request", { category: named, model: response.model ?? null });
    throw new CapabilityRefusalError(
      `${MODEL_DECLINED_PREFIX}${named ? ` (${named})` : ""}. Rephrase the input, or remove content that could be read as harmful.`,
      { fix: "Rephrase the input, or remove content that could be read as harmful, and call again.", retryable: false },
    );
  }
  return response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}
