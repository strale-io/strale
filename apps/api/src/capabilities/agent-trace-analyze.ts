import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("agent-trace-analyze", async (input: CapabilityInput) => {
  const trace = ((input.trace as string) ?? (input.log as string) ?? (input.task as string) ?? "").trim();
  if (!trace) throw new Error("'trace' (agent log output) is required.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Analyze this AI agent execution trace/log and diagnose failures. Return ONLY valid JSON.

Trace:
${trace.slice(0, 12000)}

Return JSON:
{
  "failure_point": "description of where the agent failed or stalled",
  "failure_type": "hallucination/loop/tool_error/context_overflow/wrong_tool_selection/timeout/none",
  "root_cause": "detailed explanation of why the failure occurred",
  "suggested_fix": "specific actionable fix",
  "token_usage_breakdown": {"estimated_input_tokens": <number>, "estimated_output_tokens": <number>, "total": <number>},
  "step_count": <number of distinct agent steps>,
  "steps_summary": [{"step": <number>, "action": "brief description", "status": "success/failure/warning"}],
  "severity": "critical/warning/info",
  "patterns_detected": ["loop_detected", "excessive_retries", "context_growing", etc]
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to analyze trace.");

  const output = JSON.parse(jsonMatch[0]);
  output.trace_length = trace.length;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
