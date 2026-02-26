import { registerCapability, type CapabilityInput } from "./index.js";

// Uses Serper.dev API (free tier: 2,500 queries/month, no CAPTCHA issues)
// Requires SERPER_API_KEY env var
registerCapability("google-search", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.q as string) ?? (input.task as string) ?? "").trim();
  if (!query) throw new Error("'query' is required.");

  const numResults = Math.min((input.num_results as number) ?? 10, 20);
  const language = ((input.language as string) ?? "").trim();
  const country = ((input.country as string) ?? "").trim();

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    throw new Error("SERPER_API_KEY is required. Sign up at https://serper.dev (free tier: 2,500 queries/month).");
  }

  const body: Record<string, unknown> = { q: query, num: numResults };
  if (language) body.hl = language;
  if (country) body.gl = country;

  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Serper API error: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as Record<string, unknown>;

  // Map Serper response to our format
  const organic = (data.organic as Array<Record<string, unknown>>) ?? [];
  const results = organic.map((r, i) => ({
    position: i + 1,
    title: r.title as string,
    url: r.link as string,
    snippet: r.snippet as string,
    date: (r.date as string) ?? null,
    sitelinks: r.sitelinks ?? null,
  }));

  const knowledgeGraph = data.knowledgeGraph ?? null;
  const answerBox = data.answerBox ?? null;
  const peopleAlsoAsk = (data.peopleAlsoAsk as Array<Record<string, unknown>>) ?? [];

  const searchInfo = data.searchParameters as Record<string, unknown> | undefined;

  return {
    output: {
      query,
      results,
      result_count: results.length,
      knowledge_graph: knowledgeGraph,
      answer_box: answerBox,
      people_also_ask: peopleAlsoAsk.map((q) => ({
        question: q.question,
        snippet: q.snippet,
        link: q.link,
      })),
      search_parameters: {
        language: language || (searchInfo?.hl as string) || null,
        country: country || (searchInfo?.gl as string) || null,
      },
    },
    provenance: { source: "google-serper", fetched_at: new Date().toISOString() },
  };
});
