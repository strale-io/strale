import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("meeting-notes-extract", async (input: CapabilityInput) => {
  const transcript = ((input.transcript as string) ?? (input.text as string) ?? (input.task as string) ?? "").trim();
  if (!transcript) throw new Error("'transcript' is required. Provide meeting transcript text.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `Extract structured meeting notes from this transcript. Return ONLY valid JSON.

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
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to extract meeting notes.");

  const output = JSON.parse(jsonMatch[0]);
  output.transcript_length = transcript.length;
  output.word_count = transcript.split(/\s+/).length;

  return {
    output,
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
