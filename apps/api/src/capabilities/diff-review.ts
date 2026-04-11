import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("diff-review", async (input: CapabilityInput) => {
  const diff = ((input.diff as string) ?? (input.code as string) ?? (input.task as string) ?? "").trim();
  if (!diff || diff.length < 10) {
    throw new Error("'diff' is required. Provide a unified diff (output of `git diff`).");
  }

  const context = ((input.context as string) ?? "").trim();
  const focus = ((input.focus as string) ?? "all").trim();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  // Parse diff metadata before sending to LLM
  const files = parseDiffFiles(diff);
  const stats = {
    files_changed: files.length,
    lines_added: files.reduce((s, f) => s + f.added, 0),
    lines_removed: files.reduce((s, f) => s + f.removed, 0),
    file_list: files.map((f) => f.path),
  };

  const focusInstruction = focus !== "all"
    ? `Focus specifically on: ${focus}.`
    : "Review for bugs, security issues, missing error handling, test gaps, and code quality.";

  const contextInstruction = context
    ? `\nProject context: ${context}`
    : "";

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Review this code diff for a pre-merge check. ${focusInstruction}${contextInstruction}

This is a unified diff (git diff format). Focus ONLY on what changed (+ and - lines). Return ONLY valid JSON.

\`\`\`diff
${diff.slice(0, 12000)}
\`\`\`

Return JSON:
{
  "summary": "1-2 sentence summary of what this diff does",
  "risk_level": "low|medium|high|critical",
  "issues": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "bug|security|error-handling|test-gap|performance|style|config",
      "file": "path/to/file.ts",
      "line": "approximate line or null",
      "description": "what the issue is",
      "suggestion": "how to fix it"
    }
  ],
  "missing_tests": ["list of new functions/paths that lack test coverage"],
  "hardcoded_values": ["any hardcoded URLs, IPs, credentials, magic numbers found in added lines"],
  "todos_added": ["any TODO/FIXME/HACK comments in added lines"],
  "approval_recommendation": "approve|request_changes|needs_discussion",
  "approval_reason": "why"
}

Rules:
- Only flag issues in ADDED lines (+ prefix), not removed lines
- Be specific about file paths and line numbers when possible
- "info" severity is for style nits only — don't pad the list
- If the diff looks clean, return an empty issues array and approve`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to analyze diff.");

  const analysis = JSON.parse(jsonMatch[0]);

  return {
    output: {
      ...analysis,
      diff_stats: stats,
    },
    provenance: { source: "claude-haiku-diff-analysis", fetched_at: new Date().toISOString() },
  };
});

// ─── Diff parser ────────────────────────────────────────────────────────────

interface DiffFile {
  path: string;
  added: number;
  removed: number;
}

function parseDiffFiles(diff: string): DiffFile[] {
  const files: DiffFile[] = [];
  let current: DiffFile | null = null;

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git") || line.startsWith("--- a/") || line.startsWith("+++ b/")) {
      if (line.startsWith("+++ b/")) {
        const path = line.slice(6);
        if (path && path !== "/dev/null") {
          current = { path, added: 0, removed: 0 };
          files.push(current);
        }
      }
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+") && !line.startsWith("+++")) current.added++;
    if (line.startsWith("-") && !line.startsWith("---")) current.removed++;
  }

  return files;
}
