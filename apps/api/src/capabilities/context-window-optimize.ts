import { registerCapability, type CapabilityInput } from "./index.js";
import Anthropic from "@anthropic-ai/sdk";

registerCapability("context-window-optimize", async (input: CapabilityInput) => {
  const documents = input.documents as Array<{ id: string; text: string }> | undefined;
  const query = ((input.query as string) ?? "").trim();
  const maxTokens = (input.max_tokens as number) ?? 4000;

  if (!documents || !Array.isArray(documents) || documents.length === 0) {
    throw new Error("'documents' (array of {id, text} objects) is required.");
  }
  if (!query) throw new Error("'query' is required.");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  // Estimate tokens for each document
  const docsWithTokens = documents.map((d) => ({
    ...d,
    token_count: Math.ceil((d.text ?? "").length / 4),
  }));

  // Build summary of docs for Claude to rank
  const docSummaries = docsWithTokens.map((d) =>
    `ID: ${d.id} | Tokens: ${d.token_count} | Preview: ${(d.text ?? "").slice(0, 200)}`
  ).join("\n\n");

  const client = new Anthropic({ apiKey });
  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1000,
    messages: [
      {
        role: "user",
        content: `Rank these documents by relevance to the query. Return ONLY valid JSON.

Query: "${query}"
Token budget: ${maxTokens}

Documents:
${docSummaries.slice(0, 6000)}

Return JSON:
{
  "rankings": [{"id": "doc id", "relevance_score": <0.0-1.0>, "reason": "brief reason"}]
}`,
      },
    ],
  });

  const responseText = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to rank documents.");

  const ranked = JSON.parse(jsonMatch[0]);
  const rankings = (ranked.rankings as Array<{ id: string; relevance_score: number; reason: string }>) ?? [];

  // Select documents fitting within token budget, ordered by relevance
  const rankMap = new Map(rankings.map((r) => [r.id, r]));
  const sortedDocs = [...docsWithTokens].sort((a, b) => {
    const scoreA = rankMap.get(a.id)?.relevance_score ?? 0;
    const scoreB = rankMap.get(b.id)?.relevance_score ?? 0;
    return scoreB - scoreA;
  });

  const selected: Array<{ id: string; relevance_score: number; token_count: number }> = [];
  const excluded: Array<{ id: string; reason: string }> = [];
  let tokensUsed = 0;

  for (const doc of sortedDocs) {
    const score = rankMap.get(doc.id)?.relevance_score ?? 0;
    if (score < 0.1) {
      excluded.push({ id: doc.id, reason: "low relevance" });
      continue;
    }
    if (tokensUsed + doc.token_count <= maxTokens) {
      selected.push({ id: doc.id, relevance_score: score, token_count: doc.token_count });
      tokensUsed += doc.token_count;
    } else {
      excluded.push({ id: doc.id, reason: "exceeds token budget" });
    }
  }

  return {
    output: {
      query,
      max_tokens: maxTokens,
      selected,
      total_tokens_used: tokensUsed,
      tokens_remaining: maxTokens - tokensUsed,
      excluded,
      total_documents: documents.length,
      selected_count: selected.length,
    },
    provenance: { source: "claude-haiku", fetched_at: new Date().toISOString() },
  };
});
