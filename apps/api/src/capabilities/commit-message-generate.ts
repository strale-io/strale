import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("commit-message-generate", async (input: CapabilityInput) => {
  const diff = ((input.diff as string) ?? (input.changes as string) ?? (input.task as string) ?? "").trim();
  if (!diff) throw new Error("'diff' (git diff or description of changes) is required.");

  const style = ((input.style as string) ?? "conventional").trim().toLowerCase();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `Generate a git commit message for these changes. Style: ${style}. Return ONLY valid JSON.

Changes:
${diff.slice(0, 5000)}

Return JSON:
{
  "subject": "commit subject line (max 72 chars)",
  "body": "optional longer description or null",
  "type": "feat/fix/refactor/docs/test/chore/style/perf",
  "scope": "affected area or null",
  "breaking_change": false,
  "files_summary": "brief summary of files changed"
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate commit message.");

  const output = JSON.parse(jsonMatch[0]);
  const scope = output.scope ? `(${output.scope})` : "";
  const breaking = output.breaking_change ? "!" : "";
  output.conventional = `${output.type}${scope}${breaking}: ${output.subject}`;
  output.full_message = output.body ? `${output.conventional}\n\n${output.body}` : output.conventional;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
