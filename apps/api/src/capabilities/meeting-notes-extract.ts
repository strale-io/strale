import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";
import { extractJsonWithLlm } from "./lib/llm-extract.js";

registerCapability("meeting-notes-extract", async (input: CapabilityInput) => {
  const transcript = ((input.transcript as string) ?? (input.text as string) ?? (input.task as string) ?? "").trim();
  if (!transcript) throw new Error("'transcript' is required. Provide meeting transcript text.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const output = await extractJsonWithLlm({
    client,
    model: "claude-haiku-4-5-20251001",
    maxTokens: 1500,
    prompt: `Extract structured meeting notes from this transcript. Return ONLY valid JSON.

Transcript:
"""
${transcript.slice(0, 12000)}
"""

Return JSON:
{
  "summary": "2-3 sentence meeting summary",
  "meeting_type": "standup/planning/review/brainstorm/1on1/all-hands/other",
  "attendees_mentioned": ["names mentioned in the transcript"],
  "decisions_made": [
    {"decision": "what was decided", "context": "brief context"}
  ],
  "action_items": [
    {"description": "task description", "owner": "person responsible or 'unassigned'", "deadline": "deadline or null", "priority": "high/medium/low"}
  ],
  "key_discussion_points": ["main topics discussed"],
  "questions_raised": ["unresolved questions"],
  "follow_up_needed": ["items that need follow-up"],
  "sentiment": "productive/neutral/contentious/unclear"
}`,
    truncationGuidance: "Provide a shorter transcript excerpt per call.",
    parseFailureError: () => new Error("Failed to extract meeting notes."),
  });
  output.transcript_length = transcript.length;
  output.word_count = transcript.split(/\s+/).length;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
