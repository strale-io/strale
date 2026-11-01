import { registerCapability, type CapabilityInput } from "./index.js";
import { meteredVendorFetch } from "../lib/metered-vendor-fetch.js";
import {
  resolveSerperLinks,
  startSerperBudget,
  stripUnresolvedGotoLinks,
  usableResultUrl,
} from "../lib/serper-links.js";
import { resolveCountryOrThrow } from "./lib/iso-3166.js";
import { resolveLanguageOrThrow } from "./lib/language-tag.js";

// Uses Serper.dev API (free tier: 2,500 queries/month, no CAPTCHA issues)
// Requires SERPER_API_KEY env var
registerCapability("google-search", async (input: CapabilityInput) => {
  // One budget for the whole Serper leg, taken before any input work.
  // Round-2 review: the search used to ask for the entire 15 s
  // SYNC_TRANSACTION_WALL_MS and resolution then added its own slice on
  // top, so a slow pair could exceed the wall and the caller would get an
  // infrastructure error instead of this capability's designed answer.
  const budget = startSerperBudget();
  const query = ((input.query as string) ?? (input.q as string) ?? (input.search as string) ?? "").trim();
  if (!query) throw new Error("'query' is required.");
  if (query.length < 2) throw new Error("'query' must be at least 2 characters.");

  const numResults = Math.min((input.num_results as number) ?? 10, 20);
  // Same silent-ignore behaviour as `country` below — Google drops an
  // unrecognised `hl` and bills the call anyway.
  const language = resolveLanguageOrThrow(input.language);

  // Validate before spending a Serper call. An unresolvable country used to be
  // forwarded verbatim as `gl`, which Serper ignores — the caller paid for a
  // search silently unscoped to the country they asked for. Observed in
  // production 2026-08-09: 50 consecutive calls passing gl="墨西".
  // No fallback here: omitting `country` means an unscoped global search.
  const country = resolveCountryOrThrow(input.country);

  const serperKey = process.env.SERPER_API_KEY;
  if (!serperKey) {
    throw new Error("SERPER_API_KEY is required. Sign up at https://serper.dev (free tier: 2,500 queries/month).");
  }

  const body: Record<string, unknown> = { q: query, num: numResults };
  if (language) body.hl = language;
  if (country) body.gl = country.toLowerCase(); // Serper expects lowercase gl

  const res = await meteredVendorFetch("serper", "https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": serperKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(budget.searchTimeoutMs),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Serper API error: HTTP ${res.status} ${errText.slice(0, 200)}`);
  }

  const data = await res.json() as Record<string, unknown>;

  // Google wraps every organic link past the top three in an opaque
  // `google.com/goto` redirect (2026-10-30), and Serper passes it through.
  // Serper's free `/resolve` endpoint turns them back into real URLs.
  const resolution = await resolveSerperLinks(data, serperKey, undefined, budget.resolveDeadline);


  // Map Serper response to our format
  const organic = (data.organic as Array<Record<string, unknown>>) ?? [];
  const results = organic.map((r, i) => ({
    position: i + 1,
    title: r.title as string,
    // `null` with a flag, never the wrapper: a caller that cannot tell a
    // redirect from an address will fetch Google instead of the result.
    url: usableResultUrl(r.link),
    url_unresolved: usableResultUrl(r.link) === null,
    snippet: r.snippet as string,
    date: (r.date as string) ?? null,
    sitelinks: r.sitelinks ?? null,
  }));

  const knowledgeGraph = data.knowledgeGraph ?? null;
  const answerBox = data.answerBox ?? null;
  const peopleAlsoAsk = (data.peopleAlsoAsk as Array<Record<string, unknown>>) ?? [];

  // Round-2 review: resolution is not suppression. These three are forwarded
  // WHOLESALE, so when `/resolve` fails they still carried the wrapper — and
  // a wrapped `knowledgeGraph.website` (Google's own "Website" button) was
  // invisible to the walk entirely until `website`/`descriptionLink` joined
  // its key set. Nulling what stayed wrapped is the only honest shape for a
  // field this capability does not itself project.
  //
  // Only these, and only now: stripping the whole response would also null
  // `organic[].link`, which `results` above has already turned into its own
  // `url` / `url_unresolved` pair — and the same wrapper would then be
  // counted twice below.
  const strippedElsewhere =
    stripUnresolvedGotoLinks(knowledgeGraph) +
    stripUnresolvedGotoLinks(answerBox) +
    organic.reduce((total, r) => total + stripUnresolvedGotoLinks(r.sitelinks), 0);

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
        link: usableResultUrl(q.link),
      })),
      // How many links in THIS output Google would not let us open — the
      // nulls the caller can actually see. Round-2 review: reporting
      // `resolution.unresolved.length` counted wrappers anywhere in Serper's
      // response, including surfaces this output never emits, so the number
      // did not match the nulls. Nonzero is not an error.
      unresolved_url_count:
        results.filter((r) => r.url_unresolved).length +
        peopleAlsoAsk.filter((q) => q.link !== undefined && usableResultUrl(q.link) === null).length +
        strippedElsewhere,
      link_resolution_attempted: resolution.attempted,
      search_parameters: {
        language: language || (searchInfo?.hl as string) || null,
        // Lowercase, matching the `gl` actually sent and matching what
        // serp-analyze / keyword-rank-check echo for the same field.
        country: country?.toLowerCase() || (searchInfo?.gl as string) || null,
      },
    },
    provenance: { source: "google-serper", fetched_at: new Date().toISOString() },
  };
});
