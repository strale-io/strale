import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";

// Crossref REST API — free, no key. Crossref asks callers to identify
// themselves in the User-Agent for the "polite pool"; doing so gets better
// latency and is a condition of the open access policy.
// Verified live 2026-09-05 (10.1038/nature12373 -> Nature, 2013-07-31).
const CROSSREF = "https://api.crossref.org/works";
const DATACITE = "https://api.datacite.org/dois";
const USER_AGENT = "Strale/1.0 (mailto:support@strale.io)";

interface CrossrefAuthor { given?: string; family?: string; name?: string; ORCID?: string; sequence?: string }
interface CrossrefWork {
  DOI?: string;
  type?: string;
  title?: string[];
  subtitle?: string[];
  "container-title"?: string[];
  publisher?: string;
  author?: CrossrefAuthor[];
  issued?: { "date-parts"?: number[][] };
  volume?: string;
  issue?: string;
  page?: string;
  ISSN?: string[];
  "is-referenced-by-count"?: number;
  "reference-count"?: number;
  abstract?: string;
  URL?: string;
  language?: string;
  license?: Array<{ URL?: string }>;
}
interface DataCiteAttrs {
  doi?: string;
  titles?: Array<{ title?: string }>;
  publisher?: string | { name?: string };
  publicationYear?: number;
  types?: { resourceTypeGeneral?: string };
  creators?: Array<{ name?: string; givenName?: string; familyName?: string }>;
  url?: string;
  citationCount?: number;
}

// A DOI is "10." followed by a registrant prefix, a slash, and a suffix.
// Accept a bare DOI, a doi: scheme, or any resolver URL wrapping one.
const DOI_RE = /10\.\d{4,9}\/[-._;()/:a-z0-9<>[\]+]+/i;

/** Pull a bare DOI out of a URL, `doi:` prefix, or raw string. */
export function extractDoi(raw: string): string | null {
  const m = raw.match(DOI_RE);
  if (!m) return null;
  // Trailing punctuation is common when a DOI is copied out of prose.
  return m[0].replace(/[.,;)\]]+$/, "");
}

/** Crossref issue dates arrive as [[yyyy, mm, dd]] with month/day optional. */
export function formatIssued(parts?: number[][]): string | null {
  const p = parts?.[0];
  if (!p || typeof p[0] !== "number") return null;
  const [y, m, d] = p;
  if (typeof m !== "number") return String(y);
  if (typeof d !== "number") return `${y}-${String(m).padStart(2, "0")}`;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Crossref abstracts are JATS XML fragments; strip tags for a plain summary. */
export function stripJats(abstract?: string): string | null {
  if (!abstract) return null;
  const text = abstract.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
}

function authorName(a: CrossrefAuthor): string | null {
  if (a.name) return a.name;
  const parts = [a.given, a.family].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

registerCapability("doi-resolve", async (input: CapabilityInput) => {
  const raw = typeof input.doi === "string" ? input.doi.trim() : "";
  if (raw.length === 0) {
    throw new Error("'doi' is required — a bare DOI (10.1038/nature12373) or any doi.org URL containing one.");
  }
  const doi = extractDoi(raw);
  if (!doi) {
    throw new Error(`'${raw}' does not contain a DOI. A DOI looks like 10.1038/nature12373.`);
  }

  const headers = { "User-Agent": USER_AGENT, Accept: "application/json" };

  const res = await fetch(`${CROSSREF}/${encodeURIComponent(doi)}`, {
    headers,
    signal: AbortSignal.timeout(12_000),
  });

  // Crossref registers journal articles; datasets and software are registered
  // with DataCite instead. A 404 at Crossref is not "no such DOI".
  if (res.status === 404) {
    const dc = await fetch(`${DATACITE}/${encodeURIComponent(doi)}`, {
      headers,
      signal: AbortSignal.timeout(12_000),
    });
    if (dc.status === 404) {
      throw new Error(`DOI '${doi}' is not registered with Crossref or DataCite.`);
    }
    if (!dc.ok) throw new Error(`DataCite returned HTTP ${dc.status} for DOI '${doi}'.`);
    const body = await readJsonWithLimit<{ data?: { attributes?: DataCiteAttrs } }>(dc);
    const a = body.data?.attributes ?? {};
    const publisher = typeof a.publisher === "string" ? a.publisher : (a.publisher?.name ?? null);
    return {
      output: {
        doi,
        registration_agency: "DataCite",
        title: a.titles?.[0]?.title ?? null,
        type: a.types?.resourceTypeGeneral ?? null,
        container_title: null,
        publisher,
        authors: (a.creators ?? [])
          .map((c) => c.name ?? [c.givenName, c.familyName].filter(Boolean).join(" "))
          .filter((n) => n.length > 0),
        published: a.publicationYear ? String(a.publicationYear) : null,
        volume: null,
        issue: null,
        pages: null,
        issn: [],
        referenced_by_count: typeof a.citationCount === "number" ? a.citationCount : null,
        reference_count: null,
        abstract: null,
        language: null,
        license_url: null,
        url: a.url ?? `https://doi.org/${doi}`,
      },
      provenance: { source: "DataCite REST API", fetched_at: new Date().toISOString() },
    };
  }

  if (res.status === 429) throw new Error("Crossref is rate-limiting requests right now. Retry shortly.");
  if (!res.ok) throw new Error(`Crossref returned HTTP ${res.status} for DOI '${doi}'.`);

  const body = await readJsonWithLimit<{ message?: CrossrefWork }>(res);
  const w = body.message ?? {};
  const title = [w.title?.[0], w.subtitle?.[0]].filter(Boolean).join(": ") || null;

  return {
    output: {
      doi: w.DOI ?? doi,
      registration_agency: "Crossref",
      title,
      type: w.type ?? null,
      container_title: w["container-title"]?.[0] ?? null,
      publisher: w.publisher ?? null,
      authors: (w.author ?? []).map(authorName).filter((n): n is string => n !== null),
      published: formatIssued(w.issued?.["date-parts"]),
      volume: w.volume ?? null,
      issue: w.issue ?? null,
      pages: w.page ?? null,
      issn: w.ISSN ?? [],
      referenced_by_count: typeof w["is-referenced-by-count"] === "number" ? w["is-referenced-by-count"] : null,
      reference_count: typeof w["reference-count"] === "number" ? w["reference-count"] : null,
      abstract: stripJats(w.abstract),
      language: w.language ?? null,
      license_url: w.license?.[0]?.URL ?? null,
      url: w.URL ?? `https://doi.org/${doi}`,
    },
    provenance: { source: "Crossref REST API", fetched_at: new Date().toISOString() },
  };
});
