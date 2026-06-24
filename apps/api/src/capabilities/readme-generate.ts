import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { parseLlmJsonObject } from "./lib/llm-json.js";

// A comprehensive README (installation, usage, API docs, contributing) is the
// output regardless of how short the input description is, so the output budget
// can't be scaled to the input the way prompt-optimize does (#145) — it's a
// fixed, generous ceiling instead. ~8000 tokens ≈ 32KB of markdown: comfortably
// larger than any real README, well inside Haiku 4.5's 64K output limit, and
// below the ~16K non-streaming HTTP-timeout threshold. The old 3000-token cap
// truncated every comprehensive README mid-JSON, which 500'd all production
// calls (3/3 failures, 2026-06-17→24).
const MAX_OUTPUT_TOKENS = 8000;

registerCapability("readme-generate", async (input: CapabilityInput) => {
  const project = ((input.project_description as string) ?? (input.description as string) ?? (input.task as string) ?? "").trim();
  if (!project) throw new Error("'project_description' (description of the project) is required.");

  const name = ((input.project_name as string) ?? (input.name as string) ?? "").trim();
  const techStack = ((input.tech_stack as string) ?? "").trim();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      {
        role: "user",
        content: `Generate a comprehensive README.md for this project. Return ONLY valid JSON.

${name ? `Project Name: ${name}\n` : ""}${techStack ? `Tech Stack: ${techStack}\n` : ""}Description:
${project.slice(0, 4000)}

Return JSON:
{
  "markdown": "the complete README.md content in markdown",
  "sections": ["list of section headings included"],
  "badges_suggested": ["suggested shield.io badge markdown"],
  "has_installation": true,
  "has_usage": true,
  "has_api_docs": true,
  "has_contributing": true
}`,
      },
    ],
  });

  return {
    output: parseLlmJsonObject(r, "The README generator"),
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
