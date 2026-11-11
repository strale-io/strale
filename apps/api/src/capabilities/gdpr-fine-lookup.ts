import { createAnthropicClient } from "../lib/anthropic-client.js";
import { MODELS } from "../lib/models.js";
import { registerCapability, type CapabilityInput } from "./index.js";
import { fetchRenderedHtml } from "./lib/browserless-extract.js";
import { extractJsonWithLlm } from "./lib/llm-extract.js";
import { UpstreamUnavailableError } from "../lib/upstream-result.js";
import { inputRefusal } from "../lib/capability-refusal.js";

// GDPR fine lookup via enforcementtracker.com (Browserless + Claude)

/**
 * enforcementtracker.com is the source Strale chose, so a page that renders
 * without its case data is that source failing, and counts against this
 * capability's health (2026-11-06 swallowed-failures audit, row 6). Before,
 * a shell of 200 characters or more came back as a billed `fines: []` with
 * totals of 0, which reads as "no fines on record". Now it throws, unbilled.
 *
 * The search runs here, over the tracker's whole case list (PR #1018 review,
 * S4). Read live on 2026-11-11: the tracker's front page embeds every case as
 * JSON (`<script id="et-cases">`, 3,417 cases) and filters it in the browser;
 * its own script never reads `?query=`, so the old `?query=` URL rendered the
 * 50 newest cases whatever was asked, and `statistics.html?C=<code>` (the old
 * country URL) answers 404. A company outside the 50 newest therefore came
 * back as a billed "no fines". Matching follows the tracker's own search
 * (every word of the query in the country, authority, controller, sector,
 * articles or violation type); the model only shapes the matching rows.
 */
const TRACKER = "enforcementtracker.com";
const TRACKER_URL = "https://www.enforcementtracker.com/";
/** Rows handed to the model: the newest matching cases, as the tracker lists them. */
const MAX_CASES = 15;

/** ISO 3166-1 alpha-2 code (plus EL and UK) to the tracker's own country label. */
const TRACKER_COUNTRY: Record<string, string> = {
  AT: "AUSTRIA", BE: "BELGIUM", BG: "BULGARIA", HR: "CROATIA", CY: "CYPRUS",
  CZ: "CZECH REPUBLIC", DK: "DENMARK", EE: "ESTONIA", FI: "FINLAND", FR: "FRANCE",
  DE: "GERMANY", GR: "GREECE", EL: "GREECE", HU: "HUNGARY", IS: "ICELAND",
  IE: "IRELAND", IM: "ISLE OF MAN", IT: "ITALY", LV: "LATVIA", LI: "LIECHTENSTEIN",
  LT: "LITHUANIA", LU: "LUXEMBOURG", MT: "MALTA", NL: "THE NETHERLANDS", NO: "NORWAY",
  PL: "POLAND", PT: "PORTUGAL", RO: "ROMANIA", SK: "SLOVAKIA", SI: "SLOVENIA",
  ES: "SPAIN", SE: "SWEDEN", GB: "UNITED KINGDOM", UK: "UNITED KINGDOM",
};

/** One case as the tracker embeds it. */
interface TrackerCase {
  e: number;
  c?: string;
  a?: string;
  d?: string;
  f?: number | null;
  p?: string;
  s?: string;
  r?: string;
  t?: string;
}

function trackerUnavailable(detail: string, code: string): UpstreamUnavailableError {
  return new UpstreamUnavailableError(TRACKER, `${detail}; retry shortly.`, { code });
}

/** The tracker's case list, or an unbilled source failure when the page carries none. */
function readTrackerCases(html: string): TrackerCase[] {
  const match = /<script[^>]*\bid="et-cases"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!match) {
    throw trackerUnavailable("the page carried no case data (an error, maintenance or consent page, or a changed layout)", "no_case_data");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[1]);
  } catch (err) {
    throw new UpstreamUnavailableError(TRACKER, "the case data did not parse; retry shortly.", { code: "unparseable", cause: err });
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw trackerUnavailable("the page carried an empty case list", "no_case_data");
  }
  return parsed as TrackerCase[];
}

/** The tracker's own search normalisation: lower case, no accents, words only. */
function normalizeForSearch(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}+/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ");
}

/** Every word of the query appears in the case's searchable columns, as on the tracker. */
function matchesQuery(entry: TrackerCase, terms: string[]): boolean {
  const text = normalizeForSearch([entry.c, entry.a, entry.p, entry.s, entry.r, entry.t].join(" "));
  return terms.every((term) => text.includes(term));
}

function caseLine(entry: TrackerCase): string {
  return [
    `controller: ${entry.p ?? "unknown"}`,
    `fine_eur: ${entry.f ?? "unknown"}`,
    `authority: ${entry.a ?? "unknown"}`,
    `date: ${entry.d ?? "unknown"}`,
    `articles: ${entry.r ?? "unknown"}`,
    `violation: ${entry.t ?? "unknown"}`,
    `country: ${entry.c ?? "unknown"}`,
  ].join(" | ");
}

registerCapability("gdpr-fine-lookup", async (input: CapabilityInput) => {
  const company = ((input.company as string) ?? "").trim();
  const countryCode = ((input.country_code as string) ?? "").trim().toUpperCase();
  const task = ((input.task as string) ?? "").trim();

  if (!company && !countryCode && !task) {
    throw new Error("'company', 'country_code', or 'task' is required. Provide a company name or EU country code to search GDPR fines.");
  }

  // Company first, as before; a country code alone filters by country.
  const query = company || (countryCode ? "" : task);
  const trackerCountry = query ? null : TRACKER_COUNTRY[countryCode];
  if (!query && !trackerCountry) {
    throw inputRefusal(
      `'country_code' must be a country the GDPR Enforcement Tracker covers; ${countryCode} is not one of them.`,
      "country_code",
      "Send 'country_code' as a two-letter EEA or UK code, such as SE, DE, FR, IE, ES or GB.",
    );
  }

  const html = await fetchRenderedHtml(TRACKER_URL, { source: "strale" });
  const cases = readTrackerCases(html);

  const terms = query ? normalizeForSearch(query).trim().split(" ").filter(Boolean) : [];
  const matching = cases
    .filter((entry) => (trackerCountry ? entry.c === trackerCountry : matchesQuery(entry, terms)))
    .sort((a, b) => b.e - a.e);

  // The whole case list was searched, so no match is the tracker's answer.
  if (matching.length === 0) {
    return {
      output: { page_status: "no_results", fines: [], total_fines: 0, total_amount_eur: 0 },
      provenance: { source: TRACKER, fetched_at: new Date().toISOString() },
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required.");

  const client = createAnthropicClient({ apiKey });

  const searchContext = query
    ? `${company ? "company" : "query"} "${query}"`
    : `country code "${countryCode}"`;
  const rows = matching.slice(0, MAX_CASES).map(caseLine).join("\n");

  const output = await extractJsonWithLlm({
    client,
    model: MODELS.capability_default.id,
    maxTokens: 2000,
    prompt: `Turn these GDPR Enforcement Tracker cases into JSON. Search was for: ${searchContext}. The tracker has ${matching.length} matching case(s); the ${Math.min(matching.length, MAX_CASES)} newest are below, one per line.

Cases:
${rows}

Return ONLY valid JSON:
{
  "page_status": "results",
  "fines": [
    {
      "company": "Company or organization fined",
      "amount_eur": 0,
      "authority": "Data protection authority that issued the fine",
      "date": "Date of the fine",
      "article_violated": "GDPR article(s) violated",
      "description": "Brief description of the violation",
      "country": "Country code"
    }
  ],
  "total_fines": "number of fines listed",
  "total_amount_eur": "sum of the listed fine amounts"
}

One fine per case line, in the order given. Use only what the lines say; use null for a field marked unknown. Amounts should be numbers, not strings.`,
    truncationGuidance: "Narrow the search (specific company or country) so fewer fines are returned per call.",
    parseFailureError: () => new Error("Failed to extract GDPR fine data."),
  });

  return {
    output,
    provenance: { source: TRACKER, fetched_at: new Date().toISOString() },
  };
});
