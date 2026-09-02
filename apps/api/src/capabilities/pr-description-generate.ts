import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("pr-description-generate", async (input: CapabilityInput) => {
  const diff = ((input.diff as string) ?? (input.changes as string) ?? (input.task as string) ?? "").trim();
  if (!diff) throw new Error("'diff' (git diff, commit log, or description of changes) is required.");

  const title = ((input.title as string) ?? "").trim();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 1500,
    prompt: `Generate a pull request description for these changes. Return ONLY valid JSON.
${title ? `\nPR Title: ${title}` : ""}
Changes:
${diff.slice(0, 5000)}

Return JSON:
{
  "title": "PR title (max 72 chars)",
  "summary": "2-3 sentence overview",
  "changes": ["bullet list of specific changes"],
  "testing": ["how to test these changes"],
  "breaking_changes": [],
  "related_issues": [],
  "markdown": "the full PR body in markdown format"
}`,
    truncationGuidance: "Provide a smaller diff per call.",
    parseFailureError: () => new Error("Failed to generate PR description."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
