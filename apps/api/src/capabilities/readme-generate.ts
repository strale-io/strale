import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

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
    max_tokens: 3000,
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

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate README.");

  return {
    output: JSON.parse(jsonMatch[0]),
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
