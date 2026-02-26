import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("env-template-generate", async (input: CapabilityInput) => {
  const code = ((input.code as string) ?? "").trim();
  const projectDescription = ((input.project_description as string) ?? (input.task as string) ?? "").trim();

  if (!code && !projectDescription) {
    throw new Error("'code' (source code) or 'project_description' is required.");
  }

  // If code is provided, do algorithmic extraction first
  const detectedVars: Array<{ name: string; source_line: number | null }> = [];

  if (code) {
    const lines = code.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // process.env.VAR_NAME (Node.js)
      const nodeMatches = line.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g);
      for (const m of nodeMatches) {
        detectedVars.push({ name: m[1], source_line: i + 1 });
      }

      // process.env["VAR_NAME"] or process.env['VAR_NAME']
      const bracketMatches = line.matchAll(/process\.env\[['"]([A-Z_][A-Z0-9_]*)['"]\]/g);
      for (const m of bracketMatches) {
        detectedVars.push({ name: m[1], source_line: i + 1 });
      }

      // os.environ["VAR"] or os.environ.get("VAR") (Python)
      const pyMatches = line.matchAll(/os\.(?:environ(?:\[|\.get\())['"]([\w]+)['"]/g);
      for (const m of pyMatches) {
        detectedVars.push({ name: m[1], source_line: i + 1 });
      }

      // os.Getenv("VAR") (Go)
      const goMatches = line.matchAll(/os\.Getenv\(["'](\w+)["']\)/g);
      for (const m of goMatches) {
        detectedVars.push({ name: m[1], source_line: i + 1 });
      }

      // env::var("VAR") (Rust)
      const rustMatches = line.matchAll(/env::var\(["'](\w+)["']\)/g);
      for (const m of rustMatches) {
        detectedVars.push({ name: m[1], source_line: i + 1 });
      }

      // System.getenv("VAR") (Java)
      const javaMatches = line.matchAll(/System\.getenv\(["'](\w+)["']\)/g);
      for (const m of javaMatches) {
        detectedVars.push({ name: m[1], source_line: i + 1 });
      }

      // ${VAR} in config files
      const templateMatches = line.matchAll(/\$\{([A-Z_][A-Z0-9_]*)\}/g);
      for (const m of templateMatches) {
        detectedVars.push({ name: m[1], source_line: i + 1 });
      }
    }
  }

  // Deduplicate
  const uniqueVars = [...new Map(detectedVars.map((v) => [v.name, v])).values()];

  // Use Claude to enhance with descriptions and examples
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const sourceContext = code
    ? `Source code (env vars found: ${uniqueVars.map((v) => v.name).join(", ")}):\n${code.slice(0, 6000)}`
    : `Project description:\n${projectDescription.slice(0, 3000)}`;

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Generate a .env template with descriptions and examples for these environment variables. Return ONLY valid JSON.

${sourceContext}

Return JSON:
{
  "variables": [
    {
      "name": "VAR_NAME",
      "description": "what this variable is for",
      "example_value": "realistic example value",
      "required": true/false
    }
  ]
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to generate env template.");

  const parsed = JSON.parse(jsonMatch[0]);
  const variables = (parsed.variables as Array<{ name: string; description: string; example_value: string; required: boolean }>) ?? [];

  // Merge source_line info
  const varMap = new Map(uniqueVars.map((v) => [v.name, v.source_line]));
  const enrichedVars = variables.map((v) => ({
    ...v,
    source_line: varMap.get(v.name) ?? null,
  }));

  // Generate .env template string
  const envLines = enrichedVars.map((v) =>
    `# ${v.description}${v.required ? " (required)" : " (optional)"}\n${v.name}=${v.example_value}`
  );
  const envTemplate = envLines.join("\n\n") + "\n";

  return {
    output: {
      env_template: envTemplate,
      variables: enrichedVars,
      total_variables: enrichedVars.length,
    },
    provenance: { source: "code-analysis+claude-haiku", fetched_at: new Date().toISOString() },
  };
});
