import type Anthropic from "@anthropic-ai/sdk";
import { CapabilityRefusalError } from "./capability-refusal.js";

/**
 * The text of a Messages response, read by block type.
 *
 * Why not read the first content block: newer models (Claude Haiku 5.5 and
 * later) think by default, so a response can open with one or more
 * `thinking` blocks before the answer. Code that reads the first block as the
 * answer then sees no text, and every JSON parse after it fails. Joining the
 * `text` blocks is identical on today's models, where the answer is the one
 * and only block, and stays correct when the first block is something else.
 *
 * A safety refusal (`stop_reason: "refusal"`, newer models only) comes back as
 * a normal 200 with little or no text. Read naively it becomes a parse
 * failure, which the failure taxonomy counts as our own defect and the
 * quality floor can quarantine a capability for. It is not a defect: the
 * model declined this input. So it is raised as a refusal, with a message
 * starting with the prefix registered in REFUSAL_MESSAGE_PATTERNS.
 *
 * apps/api/src/lib/llm-response.test.ts fails if any file that
 * calls the Messages API reads the first content block by position again.
 */
export const MODEL_DECLINED_PREFIX = "The AI model declined this request";

export function messageText(response: Pick<Anthropic.Messages.Message, "content" | "stop_reason"> & { stop_details?: unknown }): string {
  if (response.stop_reason === "refusal") {
    const category = (response.stop_details as { category?: unknown } | null | undefined)?.category;
    throw new CapabilityRefusalError(
      `${MODEL_DECLINED_PREFIX}${typeof category === "string" && category ? ` (${category})` : ""}. Rephrase the input, or remove content that could be read as harmful.`,
      { fix: "Rephrase the input, or remove content that could be read as harmful, and call again.", retryable: false },
    );
  }
  return response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}
