import Anthropic from "@anthropic-ai/sdk";

/**
 * Shared LLM-backed candidate resolver for name-based registry lookups.
 *
 * Problem it solves: registry/search endpoints return many candidates when
 * given a natural-language name. Naive pickers (first result, prefix match,
 * string-similarity) silently return the wrong entity — e.g. "PKN Orlen"
 * resolving to "PKN Orlik" because both start with "PKN".
 *
 * This resolver sends the query + full candidate list to Haiku and asks
 * which candidate best matches. If none is a clear match, it returns
 * `id: null` so the caller can fail loudly instead of returning wrong data.
 */

export interface Candidate {
  /** Stable identifier to return if this candidate is chosen (KRS, KVK, HRB, VAT, etc.) */
  id: string;
  /** Entity display name as seen by the user */
  name: string;
  /** Optional disambiguating context (city, country, legal form, register) */
  extra?: string;
}

export interface ResolveResult {
  id: string | null;
  confidence: "high" | "low" | "none";
  reasoning: string;
}

export interface ResolveOptions {
  query: string;
  candidates: Candidate[];
  entityType?: "company" | "person" | "entity";
  /** Extra hints for the model (e.g. "expected jurisdiction: Poland") */
  hint?: string;
}

/**
 * Pick the best candidate for a query. Returns `id: null` when no candidate
 * is a clear match — callers should surface this as an error rather than
 * guessing.
 */
export async function resolveCandidate(opts: ResolveOptions): Promise<ResolveResult> {
  const { query, candidates, entityType = "company", hint } = opts;

  if (candidates.length === 0) {
    return { id: null, confidence: "none", reasoning: "No candidates provided." };
  }
  if (candidates.length === 1) {
    return { id: candidates[0].id, confidence: "high", reasoning: "Only one candidate." };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required for name resolution.");
  const client = new Anthropic({ apiKey });

  const numbered = candidates
    .map((c, i) => `${i + 1}. ${c.name}${c.extra ? ` — ${c.extra}` : ""} [id=${c.id}]`)
    .join("\n");

  const prompt = `A user is looking up a ${entityType} in a registry. Their query: "${query}"${hint ? `\nHint: ${hint}` : ""}

Candidates returned by the registry:
${numbered}

Pick the candidate that is clearly the ${entityType} the user meant. Consider:
- Well-known trade names, historical names, and abbreviations (e.g. "PKN Orlen" → "ORLEN S.A.", "Facebook" → "Meta Platforms")
- Exact or near-exact name matches outrank candidates that merely contain the query as a substring
- Unions, associations, or subsidiaries that happen to include the query in their name are NOT matches for the parent entity
- If multiple candidates could plausibly be right, or none is a clear match, answer NONE

Respond in strict JSON on a single line:
{"id": "<candidate id or null>", "confidence": "high" | "low" | "none", "reasoning": "<one short sentence>"}`;

  const r = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const text = r.content[0].type === "text" ? r.content[0].text.trim() : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { id: null, confidence: "none", reasoning: `Unparseable model output: ${text.slice(0, 100)}` };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { id: string | null; confidence: string; reasoning: string };
    const id = parsed.id && candidates.some((c) => c.id === parsed.id) ? parsed.id : null;
    const confidence =
      parsed.confidence === "high" || parsed.confidence === "low" || parsed.confidence === "none"
        ? parsed.confidence
        : "none";
    return {
      id,
      confidence: id ? confidence : "none",
      reasoning: parsed.reasoning || "",
    };
  } catch {
    return { id: null, confidence: "none", reasoning: `Invalid JSON: ${text.slice(0, 100)}` };
  }
}
