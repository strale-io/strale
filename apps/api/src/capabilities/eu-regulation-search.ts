import { registerCapability, type CapabilityInput } from "./index.js";

/**
 * EU regulation search via the Publications Office CELLAR SPARQL endpoint.
 *
 * Rebuilt 2026-08-15. The previous implementation rendered the EUR-Lex
 * search page through Browserless and extracted results with an LLM; it had
 * zero lifetime successes (results-region anchor drifted, then EUR-Lex
 * started answering the search URL with HTTP 400) and was quarantined.
 * CELLAR is the official machine interface to the same corpus — no auth, no
 * browser render, no LLM, ~300ms observed latency (DEC-20260813-A preference
 * order: official API > per-call parsing).
 *
 * Search semantics: query text is tokenized to lowercase alphanumeric words;
 * stop/instrument words are dropped; remaining tokens are AND-matched
 * against English document titles via Virtuoso's full-text index
 * (bif:contains). Results are restricted to CELEX sector 3 legislation
 * (regulations R, directives L, decisions D); corrigenda entries
 * ("…R(02)") are excluded. An empty result set is a VALID answer
 * ({ result_count: 0 }), never an error — a correct "nothing matches" must
 * not trip the circuit breaker.
 */

const SPARQL_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";
const ENG = "http://publications.europa.eu/resource/authority/language/ENG";

/** Words that carry no discriminating power in a title full-text AND-match. */
const DROP_WORDS = new Set([
  "a", "an", "the", "of", "on", "for", "and", "or", "in", "to", "by", "with",
  "about", "regarding", "concerning", "search", "find", "lookup",
  "eu", "european", "union", "commission", "council", "parliament",
  "law", "laws", "act", "acts",
  "regulation", "regulations", "directive", "directives", "decision", "decisions",
]);

const TYPE_TO_CELEX_LETTER: Record<string, string> = {
  regulation: "R",
  directive: "L",
  decision: "D",
};

const CELEX_LETTER_TO_TYPE: Record<string, string> = {
  R: "Regulation",
  L: "Directive",
  D: "Decision",
};

/**
 * Lowercase alphanumeric tokens, minus noise words. Tokens are guaranteed to
 * match /^[a-z0-9]{2,}$/, which is what makes interpolating them into the
 * bif:contains argument injection-safe.
 */
export function tokenizeQuery(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    // Length-capped as well as count-capped: an unbounded token would ride
    // into the SPARQL GET URL and turn caller input into an upstream 414
    // misread as a service failure (cross-provider review, 2026-08-15).
    .filter((t) => t.length >= 2 && t.length <= 40 && !DROP_WORDS.has(t));
  return [...new Set(tokens)].slice(0, 6);
}

interface SparqlBinding {
  celex?: { value: string };
  title?: { value: string };
  date?: { value: string };
  inforce?: { value: string };
}

function buildSparql(tokens: string[], typeLetter: string | null, year: string | null, limit: number): string {
  const containsArg = tokens.map((t) => `'${t}'`).join(" AND ");
  const celexPrefix = year ? `3${year}` : "3";
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?celex ?title ?date ?inforce WHERE {
  ?work cdm:resource_legal_id_celex ?celex .
  OPTIONAL { ?work cdm:work_date_document ?date . }
  OPTIONAL { ?work cdm:resource_legal_in-force ?inforce . }
  ?exp cdm:expression_belongs_to_work ?work .
  ?exp cdm:expression_uses_language <${ENG}> .
  ?exp cdm:expression_title ?title .
  FILTER( bif:contains(?title, "${containsArg}") )
  FILTER( REGEX(STR(?celex), "^${celexPrefix}[0-9]*[${typeLetter ?? "RLD"}]") )
  FILTER( !CONTAINS(STR(?celex), "(") )
} ORDER BY DESC(?date) LIMIT ${limit}`;
}

registerCapability("eu-regulation-search", async (input: CapabilityInput) => {
  const query = ((input.query as string) ?? (input.topic as string) ?? "").trim();
  if (!query) {
    throw new Error("'query' or 'topic' is required. Describe the regulation topic to search.");
  }

  const rawType = ((input.type as string) ?? "").trim().toLowerCase();
  if (rawType && !(rawType in TYPE_TO_CELEX_LETTER)) {
    throw new Error(`'type' must be one of: regulation, directive, decision (got '${rawType}').`);
  }
  const typeLetter = rawType ? TYPE_TO_CELEX_LETTER[rawType] : null;

  const rawYear = String((input.year as string | number) ?? "").trim();
  if (rawYear && !/^\d{4}$/.test(rawYear)) {
    throw new Error(`'year' must be a 4-digit year (got '${rawYear}').`);
  }

  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    throw new Error(
      "The query contains no searchable words after removing generic terms " +
        "(e.g. 'regulation', 'EU'). Name the subject matter — e.g. 'artificial intelligence' or 'data protection'.",
    );
  }

  const sparql = buildSparql(tokens, typeLetter, rawYear || null, 10);
  const url = `${SPARQL_ENDPOINT}?${new URLSearchParams({ query: sparql })}`;
  const response = await fetch(url, {
    headers: { Accept: "application/sparql-results+json" },
    signal: AbortSignal.timeout(25000),
  });
  if (!response.ok) {
    throw new Error(`EU Publications Office SPARQL endpoint returned HTTP ${response.status}.`);
  }

  const data = (await response.json()) as { results?: { bindings?: SparqlBinding[] } };
  // A response that parses but lacks the SPARQL results shape is an
  // endpoint/protocol failure, not a zero-result answer — defaulting it to
  // [] would manufacture a valid-looking "nothing matches" (cross-provider
  // review, 2026-08-15). Only a real bindings array may say "no results".
  if (!Array.isArray(data.results?.bindings)) {
    throw new Error(
      "EU Publications Office SPARQL endpoint returned an unexpected response shape — " +
        "this is a service fault, not an answer about EU law.",
    );
  }
  const bindings = data.results.bindings;

  const regulations = bindings
    .filter((b) => b.celex?.value && b.title?.value)
    .map((b) => {
      const celex = b.celex!.value;
      const letter = celex.match(/^\d{5}([A-Z])/)?.[1] ?? "";
      return {
        title: b.title!.value,
        celex_number: celex,
        type: CELEX_LETTER_TO_TYPE[letter] ?? "Other",
        date: b.date?.value ?? null,
        in_force: b.inforce ? b.inforce.value === "1" || b.inforce.value === "true" : null,
        eur_lex_url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${encodeURIComponent(celex)}`,
      };
    });

  return {
    output: {
      query,
      matched_terms: tokens,
      result_count: regulations.length,
      regulations,
    },
    provenance: {
      source: "publications.europa.eu (CELLAR SPARQL)",
      fetched_at: new Date().toISOString(),
    },
  };
});
