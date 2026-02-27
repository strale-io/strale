import { registerCapability, type CapabilityInput } from "./index.js";

registerCapability("keyword-suggest", async (input: CapabilityInput) => {
  const keyword = (
    (input.keyword as string) ??
    (input.seed_keyword as string) ??
    (input.task as string) ??
    ""
  ).trim();
  if (!keyword) throw new Error("'keyword' is required. Provide a seed keyword for suggestions.");

  const language = ((input.language as string) ?? "en").trim().toLowerCase();
  const country = ((input.country as string) ?? "us").trim().toLowerCase();

  // Google Autocomplete API (free, no key required)
  async function fetchSuggestions(query: string): Promise<string[]> {
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}&hl=${language}&gl=${country}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": "Strale/1.0" },
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      // Response format: ["query", ["suggestion1", "suggestion2", ...]]
      if (Array.isArray(data) && Array.isArray(data[1])) {
        return data[1] as string[];
      }
      return [];
    } catch {
      return [];
    }
  }

  // Build all query variants
  const queries: string[] = [
    keyword,
    // Alphabet soup (a, b, c, h, w for speed)
    ...["a", "b", "c", "h", "w"].map((letter) => `${keyword} ${letter}`),
    // Question / modifier variants
    `how to ${keyword}`,
    `what is ${keyword}`,
    `best ${keyword}`,
    `${keyword} vs`,
  ];

  // Fetch all in parallel
  const results = await Promise.allSettled(queries.map((q) => fetchSuggestions(q)));

  // Collect unique suggestions
  const seen = new Set<string>();
  const allSuggestions: string[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      for (const suggestion of result.value) {
        const lower = suggestion.toLowerCase().trim();
        if (!seen.has(lower) && lower !== keyword.toLowerCase()) {
          seen.add(lower);
          allSuggestions.push(suggestion.trim());
        }
      }
    }
  }

  // Categorize
  const questionWords = /^(how|what|why|when|where|which|can|does|is|do|should|will|are)\b/i;
  const comparisonWords = /\b(vs\.?|versus|compared|or)\b/i;

  const questions = allSuggestions.filter((s) => questionWords.test(s));
  const comparisons = allSuggestions.filter((s) => comparisonWords.test(s));
  const longTail = allSuggestions.filter((s) => s.split(/\s+/).length >= 4);

  return {
    output: {
      seed_keyword: keyword,
      language,
      country,
      suggestions: allSuggestions,
      questions,
      comparisons,
      long_tail: longTail,
      total_suggestions: allSuggestions.length,
    },
    provenance: { source: "google.com/complete", fetched_at: new Date().toISOString() },
  };
});
