import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("changelog-generate", async (input: CapabilityInput) => {
  const commits = input.commits as Array<{ message: string; author?: string; date?: string }> | undefined;
  const rawLog = (input.raw_log as string)?.trim() ?? (input.git_log as string)?.trim();
  const format = ((input.format as string) ?? "keep_a_changelog").trim();

  if (!commits && !rawLog) throw new Error("'commits' (array) or 'raw_log' (git log text) is required.");

  let commitText = "";
  if (commits && Array.isArray(commits)) {
    commitText = commits.map((c) => {
      const parts = [c.message];
      if (c.author) parts.push(`by ${c.author}`);
      if (c.date) parts.push(`on ${c.date}`);
      return parts.join(" ");
    }).join("\n");
  } else if (rawLog) {
    commitText = rawLog.slice(0, 10000);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const formatInstruction = format === "semantic"
    ? "Use Semantic Versioning format (## [version] - date)"
    : format === "bullet"
      ? "Use simple bullet point format"
      : "Use Keep a Changelog format (## [Unreleased] with ### Added/Changed/Fixed/Removed sections)";

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Generate a user-facing changelog from these commits. ${formatInstruction}. Return ONLY valid JSON.

Commits:
${commitText}

Return JSON:
{
  "changelog_markdown": "the full changelog in markdown",
  "sections": [
    {
      "type": "added/changed/fixed/removed/breaking/chore",
      "entries": [
        {"description": "user-facing description", "commit_reference": "original commit message"}
      ]
    }
  ],
  "breaking_changes": ["list of breaking changes, or empty array"],
  "version_suggestion": "suggested version bump: major/minor/patch",
  "commit_count": <number of commits processed>
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate changelog.");

  const output = JSON.parse(jsonMatch[0]);
  output.format = format;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
