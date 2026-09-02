import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("github-actions-generate", async (input: CapabilityInput) => {
  const language = ((input.language as string) ?? (input.task as string) ?? "").trim();
  if (!language) throw new Error("'language' is required.");

  const framework = ((input.framework as string) ?? "").trim();
  const triggers = (input.triggers as string[]) ?? ["push", "pull_request"];
  const steps = (input.steps as string[]) ?? ["install", "lint", "test", "build"];
  const nodeVersion = ((input.node_version as string) ?? "").trim();
  const pythonVersion = ((input.python_version as string) ?? "").trim();
  const deployTarget = ((input.deploy_target as string) ?? "").trim();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 2000,
    prompt: `Generate a GitHub Actions CI/CD workflow YAML. Return ONLY valid JSON.

Language: ${language}
Framework: ${framework || "none"}
Triggers: ${triggers.join(", ")}
Steps: ${steps.join(", ")}
${nodeVersion ? `Node version: ${nodeVersion}` : ""}
${pythonVersion ? `Python version: ${pythonVersion}` : ""}
${deployTarget ? `Deploy target: ${deployTarget}` : "No deployment step"}

Requirements:
- Use latest action versions (actions/checkout@v4, actions/setup-node@v4, etc.)
- Cache dependencies (npm, pip, etc.)
- Separate jobs for lint/test/build where appropriate
- Fail fast on test failures
${deployTarget ? `- Deploy to ${deployTarget} on main branch only, after tests pass` : ""}

Return JSON:
{
  "workflow_yaml": "the complete YAML content as a string",
  "jobs": ["list of job names"],
  "estimated_run_minutes": <number>,
  "secrets_needed": ["list of required GitHub secrets"],
  "triggers_configured": ["list of triggers"]
}`,
    truncationGuidance: "Request fewer steps per call.",
    parseFailureError: () => new Error("Failed to generate workflow."),
  });
  output.language = language;
  output.framework = framework || null;
  output.deploy_target = deployTarget || null;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
