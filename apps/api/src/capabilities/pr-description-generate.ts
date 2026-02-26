import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("pr-description-generate", async (input: CapabilityInput) => {
  const diff = ((input.diff as string) ?? (input.changes as string) ?? (input.task as string) ?? "").trim();
  if (!diff) throw new Error("'diff' (git diff, commit log, or description of changes) is required.");

  const title = ((input.title as string) ?? "").trim();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Generate a pull request description for these changes. Return ONLY valid JSON.
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
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate PR description.");

  return {
    output: JSON.parse(jsonMatch[0]),
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
