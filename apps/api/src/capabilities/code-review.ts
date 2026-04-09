import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("code-review", async (input: CapabilityInput) => {
  const code = ((input.code as string) ?? (input.task as string) ?? "").trim();
  if (!code) throw new Error("'code' is required.");

  const language = ((input.language as string) ?? "auto-detect").trim();
  const focus = ((input.focus as string) ?? "all").trim();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const focusInstruction = focus !== "all"
    ? `Focus specifically on: ${focus} (security/performance/readability/bugs)`
    : "Review for security, performance, readability, and bugs.";

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-sonnet-4-6-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Review this code. ${focusInstruction} Return ONLY valid JSON.

Language: ${language}

\`\`\`
${code.slice(0, 8000)}
\`\`\`

Return JSON:
{
  "language_detected": "string",
  "overall_score": <1-100>,
  "issues": [
    {
      "severity": "critical/high/medium/low",
      "category": "security/performance/readability/bug/style",
      "line_number": <number or null>,
      "description": "what's wrong",
      "fix_suggestion": "how to fix it"
    }
  ],
  "security_flags": ["security-specific concerns"],
  "quick_wins": ["easy improvements that would help most"],
  "positive_aspects": ["things done well"],
  "summary": "1-2 sentence overall assessment"
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to review code.");

  const output = JSON.parse(jsonMatch[0]);
  output.focus = focus;
  output.code_length = code.length;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
