import { registerCapability, type CapabilityInput } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";
import { readBoundedInt } from "../lib/capability-input.js";

// openFDA enforcement (recall) reports — free, keyless. Covers the three
// product domains the FDA regulates; CPSC consumer goods are a different
// authority and are served by us-product-recall-search.
// Verified live 2026-09-05 (drug/device/food enforcement all answered; a
// no-match query returns HTTP 404 NOT_FOUND, which is a result, not a fault).
const API = "https://api.fda.gov";
const USER_AGENT = "Strale/1.0 (support@strale.io)";

const DOMAINS = new Set(["drug", "device", "food"]);
const CLASSIFICATIONS = new Map<string, string>([
  ["1", "Class I"], ["i", "Class I"], ["class i", "Class I"],
  ["2", "Class II"], ["ii", "Class II"], ["class ii", "Class II"],
  ["3", "Class III"], ["iii", "Class III"], ["class iii", "Class III"],
]);

interface Enforcement {
  recall_number?: string;
  status?: string;
  classification?: string;
  product_description?: string;
  reason_for_recall?: string;
  recalling_firm?: string;
  recall_initiation_date?: string;
  report_date?: string;
  distribution_pattern?: string;
  voluntary_mandated?: string;
  product_quantity?: string;
  city?: string;
  state?: string;
  country?: string;
  code_info?: string;
}
interface FdaResponse {
  meta?: { results?: { total?: number; skip?: number; limit?: number } };
  results?: Enforcement[];
  error?: { code?: string; message?: string };
}

/** openFDA dates are bare YYYYMMDD strings. */
export function formatFdaDate(v?: string): string | null {
  if (!v || !/^\d{8}$/.test(v)) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

/**
 * Build the `search` expression. openFDA's operators (`+AND+`, `+OR+`) must
 * stay literal, so the term is percent-encoded per clause and the clauses are
 * joined by hand — URLSearchParams would encode the operators too.
 */
export function buildSearch(term: string, classification: string | null): string {
  const quoted = `"${term.replace(/["\\]/g, " ").trim()}"`;
  const clauses = ["product_description", "reason_for_recall", "recalling_firm"]
    .map((f) => encodeURIComponent(`${f}:${quoted}`))
    .join("+OR+");
  const base = `(${clauses})`;
  if (!classification) return base;
  return `${base}+AND+${encodeURIComponent(`classification:"${classification}"`)}`;
}

registerCapability("fda-safety-search", async (input: CapabilityInput) => {
  const term = typeof input.query === "string" ? input.query.trim() : "";
  if (term.length < 2) {
    throw new Error("'query' is required (at least 2 characters) — a product name, ingredient, firm or recall reason.");
  }

  const domain = input.domain === undefined || input.domain === null || input.domain === ""
    ? "drug"
    : String(input.domain).trim().toLowerCase();
  if (!DOMAINS.has(domain)) {
    throw new Error("'domain' must be one of: drug, device, food.");
  }

  let classification: string | null = null;
  if (input.classification !== undefined && input.classification !== null && input.classification !== "") {
    const key = String(input.classification).trim().toLowerCase();
    const mapped = CLASSIFICATIONS.get(key);
    if (!mapped) {
      throw new Error("'classification' must be one of: 1, 2, 3 (or Class I, Class II, Class III).");
    }
    classification = mapped;
  }

  const limit = readBoundedInt(input.limit, "limit", { min: 1, max: 50, fallback: 10 });
  const url = `${API}/${domain}/enforcement.json?search=${buildSearch(term, classification)}&limit=${limit}`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });

  // openFDA signals an empty result set with 404 NOT_FOUND. Anything else at
  // 404 would be a genuinely missing endpoint, which the body distinguishes.
  if (res.status === 404) {
    const body = await readJsonWithLimit<FdaResponse>(res).catch(() => null);
    if (body?.error?.code === "NOT_FOUND") {
      return {
        output: {
          query: term,
          domain,
          classification,
          total_results: 0,
          returned: 0,
          recalls: [],
        },
        provenance: {
          source: `openFDA ${domain} enforcement reports (U.S. Food and Drug Administration)`,
          fetched_at: new Date().toISOString(),
        },
      };
    }
    throw new Error(`openFDA returned 404 for the ${domain} enforcement endpoint.`);
  }
  if (res.status === 429) {
    throw new Error("openFDA is rate-limiting requests right now (keyless allowance is 240/minute per IP). Retry shortly.");
  }
  if (!res.ok) throw new Error(`openFDA returned HTTP ${res.status}.`);

  const data = await readJsonWithLimit<FdaResponse>(res);
  const recalls = (data.results ?? []).map((r) => ({
    recall_number: r.recall_number ?? null,
    status: r.status ?? null,
    classification: r.classification ?? null,
    product_description: r.product_description ?? null,
    reason_for_recall: r.reason_for_recall ?? null,
    recalling_firm: r.recalling_firm ?? null,
    recall_initiation_date: formatFdaDate(r.recall_initiation_date),
    report_date: formatFdaDate(r.report_date),
    distribution_pattern: r.distribution_pattern ?? null,
    voluntary_or_mandated: r.voluntary_mandated ?? null,
    product_quantity: r.product_quantity ?? null,
    code_info: r.code_info ?? null,
    firm_city: r.city ?? null,
    firm_state: r.state ?? null,
    firm_country: r.country ?? null,
  }));

  return {
    output: {
      query: term,
      domain,
      classification,
      total_results: typeof data.meta?.results?.total === "number" ? data.meta.results.total : recalls.length,
      returned: recalls.length,
      recalls,
    },
    provenance: {
      source: `openFDA ${domain} enforcement reports (U.S. Food and Drug Administration)`,
      fetched_at: new Date().toISOString(),
    },
  };
});
