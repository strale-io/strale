import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("dockerfile-generate", async (input: CapabilityInput) => {
  const language = ((input.language as string) ?? (input.task as string) ?? "").trim().toLowerCase();
  if (!language) throw new Error("'language' (node/python/go/rust/java) is required.");

  const framework = ((input.framework as string) ?? "").trim();
  const multiStage = (input.multi_stage as boolean) ?? true;
  const alpine = (input.alpine as boolean) ?? true;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 1500,
    prompt: `Generate an optimized, production-ready Dockerfile. Return ONLY valid JSON.

Language: ${language}
Framework: ${framework || "none specified"}
Multi-stage build: ${multiStage}
Use Alpine: ${alpine}

Requirements:
- Use official base images
- Copy dependency files first for layer caching
- Non-root user for security
- HEALTHCHECK if applicable
- .dockerignore recommendations
- Minimal final image size

Return JSON:
{
  "dockerfile": "the complete Dockerfile content",
  "stages": ["list of stage names if multi-stage"],
  "estimated_image_size": "estimated final image size (e.g. '150MB')",
  "security_notes": ["security considerations"],
  "build_args": ["any build arguments used"],
  "dockerignore_recommended": ["patterns to add to .dockerignore"]
}`,
    truncationGuidance: "Try without multi-stage, or ask for a smaller set of requirements.",
    parseFailureError: () => new Error("Failed to generate Dockerfile."),
  });
  output.language = language;
  output.framework = framework || null;
  output.multi_stage = multiStage;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
