import { registerCapability, type CapabilityInput, type CapabilityResult } from "./index.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";

type Office = "SCB" | "SSB" | "STATFIN";
type Selection = string | string[];

export interface JsonStat2 {
  version?: string;
  class?: string;
  label?: string;
  updated?: string;
  id: string[];
  size: number[];
  value: Array<number | null> | Record<string, number | null>;
  dimension: Record<string, {
    label?: string;
    category: { index: string[] | Record<string, number>; label?: Record<string, string> };
  }>;
}

interface TableDefinition { path: string; label: string }
interface OfficeDefinition {
  name: string;
  baseUrl: string;
  licenceNote: string;
  tables: Record<string, TableDefinition>;
}

// The paths are deliberately data, rather than accepting caller-controlled URL fragments.
// Every host is fixed (no caller-supplied URL reaches fetch). All 24 paths were verified live on 2026-11-06
// (metadata GET plus a small json-stat2 POST); see docs/lanes/codex/nordic-statistics-report.md.
export const NORDIC_OFFICES: Record<Office, OfficeDefinition> = {
  SCB: {
    name: "Statistics Sweden",
    baseUrl: "https://api.scb.se/OV0104/v1/doris/en/ssd/",
    licenceNote: "SCB API data is provided under CC0. Attribution is not required; if given, use ‘Source: Statistics Sweden’. Statistics credited to another agency retain that agency’s attribution requirement.",
    tables: {
      "BE0101N1": { path: "BE/BE0101/BE0101A/BefolkningNy", label: "Population by region, marital status, age and sex, 1968-2024" },
      "BE0101N2": { path: "BE/BE0101/BE0101G/BefUtvKon1749", label: "Population and population changes in Sweden by sex, 1749-2025" },
      "NR0103N1": { path: "NR/NR0103/NR0103E/NR0103ENS2010T01NA", label: "GDP, expenditure approach (ESA2010), annual" },
      "PR0101N1": { path: "PR/PR0101/PR0101A/KPI2020M", label: "Consumer Price Index, total, 2020=100, monthly" },
      "AM0401N1": { path: "AM/AM0401/AM0401A/AKURLBefAr", label: "Labour force survey, population aged 15-74 by labour status, annual" },
      "AM0110N1": { path: "AM/AM0110/AM0110A/LonYrkeRegion4AN", label: "Average basic salary and monthly salary by region, sector, occupation and sex" },
      "BO0501N1": { path: "BO/BO0501/BO0501B/FastprisSHRegionAr", label: "Sold one- and two-dwelling buildings by region, annual" },
      "HA0101N1": { path: "NR/NR0103/NR0103E/NR0103ENS2010T03NAN", label: "Household consumption expenditure by purpose (COICOP), annual" },
    },
  },
  SSB: {
    name: "Statistics Norway",
    baseUrl: "https://data.ssb.no/api/v0/en/table/",
    licenceNote: "Statistics Norway API data is licensed under CC BY 4.0. Attribute Statistics Norway, link the licence, and identify Strale’s reshaping.",
    tables: {
      "07459": { path: "07459", label: "Population by region, sex and age" },
      "05110": { path: "05110", label: "Population by labour force status, sex and age, quarterly" },
      "14700": { path: "14700", label: "Consumer Price Index by goods and services, monthly" },
      "09189": { path: "09189", label: "Final expenditure and gross domestic product, annual" },
      "05803": { path: "05803", label: "Population 1 January and population changes by year" },
      "13760": { path: "13760", label: "Labour force, employment and unemployment, persons aged 15-74, monthly" },
      "11418": { path: "11418", label: "Monthly earnings by occupation, sector and sex, annual" },
      "07221": { path: "07221", label: "Price index for existing dwellings by region and dwelling type, quarterly" },
    },
  },
  STATFIN: {
    name: "Statistics Finland",
    baseUrl: "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin/",
    licenceNote: "Statistics Finland open data is licensed under CC BY 4.0. Attribute Statistics Finland, name the table and material date, link the licence, and indicate Strale’s reshaping.",
    tables: {
      "vaerak_11ra": { path: "vaerak/11ra.px", label: "Key figures on population by region, 1990-2025" },
      "synt_12dx": { path: "synt/12dx.px", label: "Vital statistics and population, 1749-2025" },
      "ntp_15a9": { path: "ntp/15a9.px", label: "Gross domestic product and national income, supply and demand, annual" },
      "khi_11xt": { path: "khi/11xt.px", label: "Consumer Price Indices, overall index, yearly" },
      "tyti_13al": { path: "tyti/13al.px", label: "Population aged 15-74 by labour force status and region, annual" },
      "ktps_14n2": { path: "ktps/14n2.px", label: "Wage and salary indices by industry, annual (2021=100)" },
      "ashi_13mw": { path: "ashi/13mw.px", label: "Prices per square metre of old dwellings by region and plot ownership, yearly" },
      "ntp_15ag": { path: "ntp/15ag.px", label: "Household final consumption expenditure (COICOP2018), annual" },
    },
  },
};

export class NordicStatisticsError extends Error {
  constructor(public code: string, message: string, public details?: Record<string, unknown>, public retryable = false) {
    super(message); this.name = "NordicStatisticsError";
  }
  toJSON() { return { error_code: this.code, message: this.message, retryable: this.retryable, ...(this.details ? { details: this.details } : {}) }; }
}

const fail = (code: string, message: string, details?: Record<string, unknown>): never => { throw new NordicStatisticsError(code, message, details); };
const periodPattern = /^\d{4}(?:-Q[1-4]|-(?:0[1-9]|1[0-2]))?$/;

export function validateNordicInput(input: CapabilityInput) {
  const allowed = new Set(["office", "table", "filters", "since_period", "until_period"]);
  const extra = Object.keys(input).filter(k => !allowed.has(k));
  if (extra.length) fail("invalid_input", `Unknown input field: ${extra[0]}`);
  if (typeof input.office !== "string" || !(input.office in NORDIC_OFFICES)) fail("invalid_office", "office must be SCB, SSB or STATFIN");
  const office = input.office as Office;
  if (typeof input.table !== "string" || !input.table.trim()) fail("invalid_input", "table must be a non-empty string");
  const tableId = input.table as string;
  const definition = NORDIC_OFFICES[office];
  const table = definition.tables[tableId];
  if (!table) fail("table_not_supported", `Table is not in the curated ${office} allowlist`, { supported_tables: Object.keys(definition.tables) });
  if (!input.filters || typeof input.filters !== "object" || Array.isArray(input.filters)) fail("invalid_input", "filters must be a non-empty object");
  const entries = Object.entries(input.filters as Record<string, unknown>);
  if (!entries.length) fail("invalid_input", "filters must contain at least one variable");
  let total = 0; let cells = 1;
  const filters: Record<string, string[]> = {};
  for (const [code, raw] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(code)) fail("invalid_input", `Invalid variable code: ${code}`);
    const values = Array.isArray(raw) ? raw : [raw];
    if (!values.length || values.some(v => typeof v !== "string" || !v.trim())) fail("invalid_input", `Filter ${code} must contain non-empty strings`);
    total += values.length; cells *= values.length;
    filters[code] = values as string[];
  }
  if (total > 50) fail("invalid_input", "At most 50 filter values are allowed", { selected_values: total });
  if (cells > 5000) fail("cell_limit_exceeded", "Selection exceeds the 5,000-cell limit", { cells });
  for (const key of ["since_period", "until_period"] as const) if (input[key] !== undefined && (typeof input[key] !== "string" || !periodPattern.test(input[key] as string))) fail("invalid_input", `${key} must be YYYY, YYYY-Qn or YYYY-MM`);
  if (input.since_period && input.until_period && input.since_period > input.until_period) fail("invalid_input", "since_period must not follow until_period");
  return { office, definition, tableId, table, filters, since: input.since_period as string | undefined, until: input.until_period as string | undefined };
}

// Offices write periods as 2024, 2024K1 / 2024Q1 and 2024M01; callers use YYYY, YYYY-Qn and YYYY-MM.
export function normalisePeriod(value: string): string {
  const q = /^(\d{4})[KQ]([1-4])$/.exec(value);
  if (q) return `${q[1]}-Q${q[2]}`;
  const m = /^(\d{4})M(\d{2})$/.exec(value);
  if (m) return `${m[1]}-${m[2]}`;
  return value;
}

function orderedCategories(index: string[] | Record<string, number>): string[] {
  if (Array.isArray(index)) return index;
  return Object.entries(index).sort((a, b) => a[1] - b[1]).map(([code]) => code);
}

export function flattenNordic(data: JsonStat2) {
  if (data.class !== "dataset" || !Array.isArray(data.id) || !Array.isArray(data.size) || data.id.length !== data.size.length) fail("upstream_invalid_response", "Upstream returned invalid JSON-stat 2.0");
  const count = data.size.reduce((a, b) => a * b, 1);
  if (!Number.isSafeInteger(count) || count > 5000) fail("cell_limit_exceeded", "Upstream selection exceeds the 5,000-cell limit", { cells: count });
  const codes = data.id.map(id => orderedCategories(data.dimension[id]?.category?.index ?? []));
  if (codes.some((list, i) => list.length !== data.size[i])) fail("upstream_invalid_response", "Upstream returned inconsistent JSON-stat dimensions");
  const observations = Array.from({ length: count }, (_, position) => {
    let remaining = position; const row: Record<string, string | number | null> = {};
    for (let i = data.id.length - 1; i >= 0; i--) { const category = remaining % data.size[i]; remaining = Math.floor(remaining / data.size[i]); row[data.id[i]] = codes[i][category]; }
    const raw = Array.isArray(data.value) ? data.value[position] : data.value[String(position)];
    const timeId = data.id.find(id => /^(time|tid|år|year|vuosi)$/i.test(id)) ?? data.id.find(id => /time|year|period/i.test(id));
    return { ...row, period: timeId ? String(row[timeId]) : "", value: typeof raw === "number" ? raw : null };
  });
  const dimensions = data.id.map((id, i) => ({ id, label: data.dimension[id].label ?? id, categories: codes[i].map(code => ({ code, label: data.dimension[id].category.label?.[code] ?? code })) }));
  return { observations, dimensions };
}

function retryAfter(response: Response): string | undefined { return response.headers.get("retry-after") ?? response.headers.get("x-ratelimit-reset") ?? undefined; }
function enforceRateLimit(response: Response): void {
  const remaining = response.headers.get("ratelimit-remaining") ?? response.headers.get("x-ratelimit-remaining") ?? response.headers.get("x-rate-limit-remaining");
  if (remaining !== null && Number.isFinite(Number(remaining)) && Number(remaining) <= 0) throw new NordicStatisticsError("rate_limited", "The statistics office rate limit was reached; retry later", { retry_after: retryAfter(response) }, true);
}
async function getJson(response: Response): Promise<unknown> {
  try {
    return await readJsonWithLimit(response);
  } catch (error) {
    // A body over the limit keeps readJsonWithLimit's own refusal; only a parse failure is relabelled.
    if (error instanceof SyntaxError) fail("upstream_invalid_response", "Upstream returned a non-JSON response");
    throw error;
  }
}

export async function executeNordicStatistics(input: CapabilityInput): Promise<CapabilityResult> {
  const valid = validateNordicInput(input);
  const url = `${valid.definition.baseUrl}${valid.table.path}`;
  const request = (init?: RequestInit) => fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(12_000), headers: { "User-Agent": "Strale/1.0 (+https://strale.io)", ...(init?.headers ?? {}) } });
  try {
    const metadataResponse = await request();
    if (metadataResponse.status === 429) throw new NordicStatisticsError("rate_limited", "The statistics office rate limit was reached; retry later", { retry_after: retryAfter(metadataResponse) }, true);
    enforceRateLimit(metadataResponse);
    if (!metadataResponse.ok) throw new NordicStatisticsError("upstream_unavailable", "The statistics office metadata service is unavailable", { status: metadataResponse.status }, metadataResponse.status >= 500);
    const metadata = await getJson(metadataResponse) as { title?: string; updated?: string; variables?: Array<{ code: string; time?: boolean; values?: string[] }> };
    if (!Array.isArray(metadata.variables)) fail("upstream_invalid_response", "Upstream returned invalid table metadata");
    const variables = metadata.variables as Array<{ code: string; time?: boolean; values?: string[] }>;
    const query = Object.entries(valid.filters).map(([code, values]) => ({ code, selection: { filter: "item", values } }));
    const time = variables.find(v => v.time || /^(time|tid|år|year|vuosi)$/i.test(v.code));
    if (time && (valid.since || valid.until) && !valid.filters[time.code]) {
      const values = (time.values ?? []).filter(v => (!valid.since || normalisePeriod(v).slice(0, valid.since.length) >= valid.since) && (!valid.until || normalisePeriod(v).slice(0, valid.until.length) <= valid.until));
      if (!values.length) fail("invalid_input", "No periods match the requested bounds");
      query.push({ code: time.code, selection: { filter: "item", values } });
    }
    const selectedCells = query.reduce((n, q) => n * q.selection.values.length, 1);
    if (selectedCells > 5000) fail("cell_limit_exceeded", "Selection exceeds the 5,000-cell limit", { cells: selectedCells });
    const dataResponse = await request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, response: { format: "json-stat2" } }) });
    if (dataResponse.status === 429) throw new NordicStatisticsError("rate_limited", "The statistics office rate limit was reached; retry later", { retry_after: retryAfter(dataResponse) }, true);
    enforceRateLimit(dataResponse);
    if (!dataResponse.ok) throw new NordicStatisticsError("upstream_unavailable", "The statistics office data service is unavailable", { status: dataResponse.status }, dataResponse.status >= 500);
    const data = await getJson(dataResponse) as JsonStat2;
    const flat = flattenNordic(data); const now = new Date();
    const units = flat.dimensions.find(d => /^unit$/i.test(d.id))?.categories;
    const output: Record<string, unknown> = { office: valid.office, table: valid.tableId, label: data.label ?? metadata.title ?? valid.table.label, updated: data.updated ? new Date(data.updated).toISOString() : null, dimensions: flat.dimensions, observations: flat.observations, observation_count: flat.observations.length, source: valid.definition.name, licence_note: valid.definition.licenceNote, source_url: url, accessed_at: now.toISOString().slice(0, 10), as_of: now.toISOString() };
    if (units?.length === 1) output.unit = units[0].code;
    return { output, provenance: { source: valid.definition.name, fetched_at: now.toISOString() } };
  } catch (error) {
    if (error instanceof NordicStatisticsError) throw error;
    if (error instanceof DOMException && ["AbortError", "TimeoutError"].includes(error.name)) throw new NordicStatisticsError("timeout_exceeded", "The statistics office did not respond in time", undefined, true);
    throw new NordicStatisticsError("upstream_unavailable", "The statistics office could not be reached", undefined, true);
  }
}

registerCapability("nordic-statistics", executeNordicStatistics);
