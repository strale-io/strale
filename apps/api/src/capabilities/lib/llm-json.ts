/**
 * Tolerant JSON extraction for LLM responses.
 *
 * Models asked for "ONLY valid JSON" comply most of the time, but the
 * failure modes are predictable: a ```json fence around the object, prose
 * before it ("Here is the extracted data:"), or — most commonly when the
 * page yielded nothing — a note appended *after* the closing fence
 * explaining what could not be found.
 *
 * The naive strip-the-fence-and-parse approach only survives the first of
 * those. A 2026-08-14 company-enrich call on openai.com returned a
 * well-formed fenced object and still 500'd, because anchored fence
 * stripping (/```\s*$/) can't remove a fence that isn't last.
 *
 * Brace matching here is a real scanner rather than /\{[\s\S]*\}/ — the
 * greedy regex runs to the last `}` in the string, which over-captures
 * whenever trailing prose contains one.
 */

/**
 * Return the first balanced `{...}` span in `text`, respecting string
 * literals and escapes. Returns null when there is no `{`, or when the
 * object never closes (i.e. the model output was cut off mid-object).
 */
function sliceBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null; // unbalanced — truncated output, nothing safe to salvage
}

/**
 * Parse a JSON object out of a raw LLM response.
 *
 * Tries the contents of a fenced block first (the fence is the model's own
 * delimiter, so it beats brace-scanning the whole string when commentary
 * surrounds it), then falls back to the raw text.
 *
 * Returns null when no complete object can be recovered — callers should
 * treat that as an extraction failure, never as an empty result.
 */
export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (!text) return null;

  const candidates: string[] = [];

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) candidates.push(fenced[1]);

  candidates.push(text);

  for (const candidate of candidates) {
    const span = sliceBalancedObject(candidate);
    if (!span) continue;
    try {
      // `span` always starts at `{` and is brace-balanced, so a successful
      // parse is necessarily a plain object.
      return JSON.parse(span) as Record<string, unknown>;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}
