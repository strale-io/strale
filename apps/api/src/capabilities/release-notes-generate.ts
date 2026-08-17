import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("release-notes-generate", async (input: CapabilityInput) => {
  const commits = ((input.commits as string) ?? (input.changelog as string) ?? (input.task as string) ?? "").trim();
  if (!commits) throw new Error("'commits' (git log, commit messages, or changelog) is required.");

  const version = ((input.version as string) ?? "").trim();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 2000,
    prompt: `Generate release notes from these commits/changes. Use Keep a Changelog format. Return ONLY valid JSON.
${version ? `\nVersion: ${version}` : ""}
Commits/Changes:
${commits.slice(0, 5000)}

Return JSON:
{
  "version": "${version || "NEXT"}",
  "date": "${new Date().toISOString().split("T")[0]}",
  "summary": "one-sentence release summary",
  "sections": {
    "added": ["new features"],
    "changed": ["changes to existing functionality"],
    "fixed": ["bug fixes"],
    "removed": ["removed features"],
    "deprecated": ["deprecated features"],
    "security": ["security fixes"]
  },
  "breaking_changes": [],
  "contributors": [],
  "markdown": "the full release notes in markdown format"
}`,
    truncationGuidance: "Provide fewer commits per call.",
    parseFailureError: () => new Error("Failed to generate release notes."),
  });

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
