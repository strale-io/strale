import { registerCapability, type CapabilityInput } from "./index.js";

// PatentsView API (USPTO) — free, no key required
const API = "https://api.patentsview.org/patents/query";

registerCapability("patent-search", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.keyword as string) ?? (input.task as string) ?? "").trim();
  if (!query) throw new Error("'query' (patent search term, keyword, or patent number) is required.");

  const maxResults = Math.min(Number(input.max_results ?? 10), 25);

  // Check if input looks like a patent number
  const isPatentNumber = /^(US|EP|WO|GB|DE|FR|JP|CN|KR)?\d{5,12}[A-Z]?\d?$/i.test(query.replace(/[\s,/-]/g, ""));

  let queryObj: any;
  if (isPatentNumber) {
    const cleaned = query.replace(/[\s,/-]/g, "");
    queryObj = { patent_number: cleaned };
  } else {
    queryObj = { _text_any: { patent_title: query } };
  }

  const body = {
    q: queryObj,
    f: [
      "patent_number", "patent_title", "patent_date", "patent_abstract",
      "patent_type", "patent_num_claims",
      "inventor_first_name", "inventor_last_name",
      "assignee_organization",
    ],
    o: { per_page: maxResults },
    s: [{ patent_date: "desc" }],
  };

  const response = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`PatentsView API returned HTTP ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as any;
  const patents = data.patents ?? [];

  const results = patents.map((p: any) => ({
    patent_number: p.patent_number,
    title: p.patent_title,
    date: p.patent_date,
    abstract: p.patent_abstract?.slice(0, 500) ?? null,
    type: p.patent_type,
    num_claims: p.patent_num_claims,
    inventors: p.inventors?.map((i: any) => `${i.inventor_first_name} ${i.inventor_last_name}`.trim()) ?? [],
    assignees: p.assignees?.map((a: any) => a.assignee_organization).filter(Boolean) ?? [],
    url: `https://patents.google.com/patent/US${p.patent_number}`,
  }));

  return {
    output: {
      query,
      total_found: data.total_patent_count ?? results.length,
      returned_count: results.length,
      patents: results,
    },
    provenance: { source: "api.patentsview.org", fetched_at: new Date().toISOString() },
  };
});
