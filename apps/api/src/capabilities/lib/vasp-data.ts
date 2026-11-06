/**
 * Shared VASP/CASP data cache from ESMA's interim MiCA register.
 *
 * Source (official, public): the five CSV files ESMA publishes on its MiCA
 * page under "Interim MiCA Register" (https://www.esma.europa.eu/esmas-activities/
 * digital-finance-and-innovation/markets-crypto-assets-regulation-mica). ESMA
 * overwrites them in place at a fixed path, "latest version", weekly:
 *
 *   CASPS.csv  authorised / notified crypto-asset service providers
 *   NCASP.csv  non-compliant entities
 *
 * Until 2026-11 this module guessed a dated folder per month
 * (`<YYYY-MM>/CASPS.csv`, `<YYYY-MM>/Non_compliant_CASPs.csv`). Those paths
 * were never ESMA's stable ones, and every month from 2026-06 answers 404, so
 * the tools had no data. The fixed path below is the one ESMA's own page links
 * to. If ESMA moves it again, the page's link is read (one extra request, only
 * after a 404 or a non-CSV answer) before giving up.
 *
 * Failure and age rules:
 *
 * - When ESMA cannot be read and there is no cache, the getters THROW
 *   `UpstreamUnavailableError`. They used to return `[]`, which vasp-verify
 *   billed as `authorized: false` and vasp-non-compliant-check billed as
 *   `on_non_compliant_list: false`: a compliance negative fabricated from an
 *   outage (2026-11-06 swallowed-failures audit, rows 1 and 2).
 * - Age is measured from the file's own publication date (HTTP Last-Modified;
 *   the newest record date when the header is absent). Past `STALE_AFTER_DAYS`
 *   the answer carries `stale: true`; past `MAX_REGISTER_AGE_DAYS` it throws,
 *   because a file ESMA stopped republishing (the failure class that made this
 *   module go blind) would otherwise keep answering from frozen data.
 * - The file is parsed by header name, never by column position, and a file
 *   whose columns changed throws instead of misreading its rows.
 */

import { logWarn } from "../../lib/log.js";
import { MAX_FETCHED_API_RESPONSE_BYTES, readTextWithLimit } from "../../lib/resource-limits.js";
import { discardBody } from "../../lib/safe-fetch.js";
import { STRALE_USER_AGENT } from "../../lib/site-access.js";
import { UpstreamUnavailableError } from "../../lib/upstream-result.js";

export interface CASPRecord {
  nca: string;
  country: string;
  entityName: string;
  lei: string;
  homeMemberState: string;
  commercialName: string;
  address: string;
  website: string;
  authorizationDate: string;
  /** Date the authorisation was withdrawn, as ESMA wrote it; "" when none is recorded. */
  authorizationEndDate: string;
  services: string[];
  passportingCountries: string[];
  legalBasis: string;
  lastUpdate: string;
}

export interface NonCompliantRecord {
  nca: string;
  entityName: string;
  commercialName: string;
  lei: string;
  homeMemberState: string;
  website: string;
  /** ESMA's "non compliancy reason" text. */
  infringement: string;
  decisionDate: string;
  lastUpdate: string;
}

/** What a getter returns: the rows and how old they are. */
export interface RegisterSnapshot<T> {
  records: T[];
  sourceUrl: string;
  /** ISO timestamp of the file's publication (Last-Modified), else of its newest record; null when neither is known. */
  registerLastUpdated: string | null;
  /** When this process read the file. */
  fetchedAt: string;
  /** Whole days between `registerLastUpdated` and now; null when that is unknown. */
  ageDays: number | null;
  /** True past STALE_AFTER_DAYS, or when the age cannot be established. */
  stale: boolean;
  /** True when ESMA could not be read and the previous read was served. */
  servedFromCache: boolean;
}

// ─── Source ─────────────────────────────────────────────────────────────────

export const ESMA_MICA_PAGE_URL =
  "https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica";
export const CASP_REGISTER_URL = "https://www.esma.europa.eu/sites/default/files/2024-12/CASPS.csv";
export const NON_COMPLIANT_REGISTER_URL = "https://www.esma.europa.eu/sites/default/files/2024-12/NCASP.csv";

/** ESMA republishes weekly. Six weeks without a republish is worth saying out loud. */
export const STALE_AFTER_DAYS = 45;
/** Four months without a republish means the file is frozen or abandoned: no answer is safer than an old one. */
export const MAX_REGISTER_AGE_DAYS = 120;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const FETCH_TIMEOUT_MS = 30_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── CSV parsing ────────────────────────────────────────────────────────────

/**
 * RFC 4180 parser. ESMA's files carry a UTF-8 BOM, CRLF line ends, doubled
 * quotes, and quoted cells that span lines (addresses), so splitting on
 * newlines is wrong.
 */
export function parseCsv(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ",") { row.push(field); field = ""; continue; }
    if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

/** Collapse the tabs, line breaks and runs of spaces ESMA's cells contain. */
function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function parsePipeList(val: string): string[] {
  return clean(val).split("|").map((s) => s.trim()).filter(Boolean);
}

/** ESMA writes "dd/mm/yyyy". Returns a UTC date, or null for anything else. */
export function parseRegisterDate(value: string): Date | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d : null;
}

function columnIndex(header: string[]): Map<string, number> {
  const map = new Map<string, number>();
  header.forEach((name, i) => {
    const key = name.trim().toLowerCase();
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

class FormatChangedError extends Error {}

function requireColumns(columns: Map<string, number>, required: string[]): void {
  const absent = required.filter((name) => !columns.has(name.toLowerCase()));
  if (absent.length > 0) throw new FormatChangedError(`the file's columns changed (absent: ${absent.join(", ")})`);
}

interface Parsed<T> {
  records: T[];
  newestUpdate: Date | null;
}

function newest(a: Date | null, value: string): Date | null {
  const d = parseRegisterDate(value);
  return d && (!a || d > a) ? d : a;
}

function parseCaspCsv(text: string): Parsed<CASPRecord> {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new FormatChangedError("the file has no header row");
  const columns = columnIndex(rows[0]);
  requireColumns(columns, [
    "ae_lei_name", "ae_lei", "ae_homeMemberState", "ae_website",
    "ac_authorisationNotificationDate", "ac_authorisationEndDate", "ac_serviceCode",
  ]);
  const cell = (row: string[], name: string) => row[columns.get(name.toLowerCase()) ?? -1] ?? "";

  const records: CASPRecord[] = [];
  let newestUpdate: Date | null = null;
  for (const row of rows.slice(1)) {
    const entityName = clean(cell(row, "ae_lei_name"));
    if (!entityName) continue;
    const lastUpdate = clean(cell(row, "ac_lastupdate"));
    newestUpdate = newest(newestUpdate, lastUpdate);
    records.push({
      nca: clean(cell(row, "ae_competentAuthority")),
      country: clean(cell(row, "ae_lei_cou_code")),
      entityName,
      lei: clean(cell(row, "ae_lei")),
      homeMemberState: clean(cell(row, "ae_homeMemberState")),
      commercialName: clean(cell(row, "ae_commercial_name")),
      address: clean(cell(row, "ae_address")),
      website: clean(cell(row, "ae_website")),
      authorizationDate: clean(cell(row, "ac_authorisationNotificationDate")),
      authorizationEndDate: clean(cell(row, "ac_authorisationEndDate")),
      services: parsePipeList(cell(row, "ac_serviceCode")),
      passportingCountries: [...new Set(parsePipeList(cell(row, "ac_serviceCode_cou")).map((c) => c.toUpperCase()))],
      legalBasis: clean(cell(row, "ac_legal_basis")),
      lastUpdate,
    });
  }
  return { records, newestUpdate };
}

function parseNonCompliantCsv(text: string): Parsed<NonCompliantRecord> {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new FormatChangedError("the file has no header row");
  const columns = columnIndex(rows[0]);
  requireColumns(columns, ["ae_lei_name", "ae_homeMemberState", "ae_website", "ae_reason"]);
  const cell = (row: string[], name: string) => row[columns.get(name.toLowerCase()) ?? -1] ?? "";

  const records: NonCompliantRecord[] = [];
  let newestUpdate: Date | null = null;
  for (const row of rows.slice(1)) {
    const entityName = clean(cell(row, "ae_lei_name"));
    if (!entityName) continue;
    const lastUpdate = clean(cell(row, "ae_lastupdate"));
    newestUpdate = newest(newestUpdate, lastUpdate);
    records.push({
      nca: clean(cell(row, "ae_competentAuthority")),
      entityName,
      commercialName: clean(cell(row, "ae_commercial_name")),
      lei: clean(cell(row, "ae_lei")),
      homeMemberState: clean(cell(row, "ae_homeMemberState")),
      website: clean(cell(row, "ae_website")),
      infringement: clean(cell(row, "ae_reason")),
      decisionDate: clean(cell(row, "ae_decision_date")),
      lastUpdate,
    });
  }
  return { records, newestUpdate };
}

// ─── Fetching ───────────────────────────────────────────────────────────────

type FileFetch =
  | { ok: true; text: string; url: string; lastModified: Date | null }
  | { ok: false; failure: string; moved: boolean };

function shortName(url: string): string {
  try {
    return new URL(url).pathname.split("/").slice(-2).join("/");
  } catch {
    return url;
  }
}

function isHtml(text: string): boolean {
  const head = text.trimStart().slice(0, 15).toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html");
}

/**
 * One GET with the honest user agent. `moved` marks the answers that mean the
 * path no longer serves the file (404, 410, an HTML page instead of CSV), the
 * only ones that justify reading ESMA's page for a new link.
 */
async function fetchText(url: string, accept: string): Promise<FileFetch> {
  const name = shortName(url);
  let resp: Response;
  try {
    resp = await fetch(url, {
      headers: { "User-Agent": STRALE_USER_AGENT, Accept: accept },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    return {
      ok: false,
      failure: `${name}: ${err instanceof Error && err.name === "TimeoutError" ? "timeout" : "network error"}`,
      moved: false,
    };
  }
  if (!resp.ok) {
    await discardBody(resp, "vasp-data: non-2xx");
    return { ok: false, failure: `${name}: HTTP ${resp.status}`, moved: resp.status === 404 || resp.status === 410 };
  }
  let text: string;
  try {
    text = await readTextWithLimit(resp, MAX_FETCHED_API_RESPONSE_BYTES, "ESMA register file");
  } catch (err) {
    return {
      ok: false,
      failure: `${name}: ${err instanceof Error && err.name === "TimeoutError" ? "timeout" : "unreadable response body"}`,
      moved: false,
    };
  }
  const modified = Date.parse(resp.headers.get("last-modified") ?? "");
  return { ok: true, text, url, lastModified: Number.isNaN(modified) ? null : new Date(modified) };
}

/**
 * ESMA's MiCA page lists the current download links. Read the one for `file`
 * ("CASPS.csv" or "NCASP.csv"), and only accept a link that stays on ESMA's
 * own file store.
 */
async function discoverFileUrl(file: string, failures: string[]): Promise<string | null> {
  const page = await fetchText(ESMA_MICA_PAGE_URL, "text/html");
  if (!page.ok) {
    failures.push(`MiCA page: ${page.failure.replace(/^[^:]*: /, "")}`);
    return null;
  }
  const re = new RegExp(`href\\s*=\\s*"([^"]*/${file.replace(".", "\\.")})"`, "i");
  const href = re.exec(page.text)?.[1];
  if (!href) {
    failures.push(`MiCA page: no link to ${file}`);
    return null;
  }
  try {
    const url = new URL(href, ESMA_MICA_PAGE_URL);
    if (url.protocol !== "https:" || url.hostname !== "www.esma.europa.eu" || !url.pathname.startsWith("/sites/default/files/")) {
      failures.push(`MiCA page: link to ${file} leaves ESMA's file store`);
      return null;
    }
    return url.href;
  } catch {
    failures.push(`MiCA page: unusable link to ${file}`);
    return null;
  }
}

async function fetchRegisterFile(primaryUrl: string): Promise<FileFetch & { failures: string[] }> {
  const failures: string[] = [];
  const first = await fetchText(primaryUrl, "text/csv,*/*;q=0.5");
  let moved: boolean;
  if (first.ok && !isHtml(first.text)) return { ...first, failures };
  if (first.ok) { failures.push(`${shortName(primaryUrl)}: HTML page instead of CSV`); moved = true; }
  else { failures.push(first.failure); moved = first.moved; }

  if (moved) {
    const file = primaryUrl.split("/").pop() ?? "";
    const discovered = await discoverFileUrl(file, failures);
    if (discovered && discovered !== primaryUrl) {
      const second = await fetchText(discovered, "text/csv,*/*;q=0.5");
      if (second.ok && !isHtml(second.text)) return { ...second, failures };
      failures.push(second.ok ? `${shortName(discovered)}: HTML page instead of CSV` : second.failure);
    }
  }
  return { ok: false, failure: failures.join("; "), moved, failures };
}

/** A failure that a retry could plausibly clear: not a path ESMA no longer serves. */
function isTransientFailure(f: string): boolean {
  return /: (timeout|network error|unreadable response body|HTTP 5\d\d|HTTP 429)$/.test(f);
}

/**
 * The same failure without the codes that error-text classifiers key on. The
 * failure taxonomy (`categorizeFailureReason`) files any message containing
 * "404" as `endpoint_gone` and "401"/"403" as `auth_expired`, which is right
 * when every source answered that way and wrong for a mix: a 404 on one source
 * and a timeout on another would trip the breaker at maximum backoff for what
 * is a transient fault. The exact per-source codes stay on `error.failures`.
 */
function plainFailure(f: string): string {
  return f
    .replace(/HTTP (?:404|410)\b/, "path no longer served")
    .replace(/HTTP (?:401|403)\b/, "request refused");
}

type RegisterUnavailable = UpstreamUnavailableError & { failures: string[] };

/**
 * The register could not be read.
 *
 * - Every source answered 404: the files moved, not ESMA down. The codes are
 *   printed (the taxonomy files it as `endpoint_gone`) and it is not retryable.
 * - Anything transient among the failures: retryable, and the message carries
 *   no 404/401/403, so it classifies as transient. A mix is not a moved file.
 * - Otherwise (a changed format, a frozen file, an HTML page, a missing link):
 *   not retryable, codes kept off the message.
 */
function registerUnavailable(register: string, failures: string[], detail?: string): RegisterUnavailable {
  const allGone = detail === undefined && failures.length > 0 && failures.every((f) => f.endsWith("HTTP 404"));
  const transient = detail === undefined && failures.some(isTransientFailure);
  const listed = allGone ? failures.join("; ") : failures.map(plainFailure).join("; ");
  const what = detail ?? `no copy of the register could be read (${listed})`;
  const message =
    `${what}. This is not an answer about the entity; retry later.` +
    (transient ? " Treated as a temporary failure (a timeout, network error or server error)." : "");
  const err = new UpstreamUnavailableError(`ESMA ${register}`, message, {
    code: allGone ? "HTTP 404" : null,
    retryable: transient,
  });
  return Object.assign(err, { failures });
}

// ─── Loading, cache and age ─────────────────────────────────────────────────

interface Spec<T> {
  label: string;
  url: string;
  parse: (text: string) => Parsed<T>;
  /** The published non-compliant list may be empty; the CASP register may not. */
  mayBeEmpty: boolean;
}

interface CacheEntry<T> {
  records: T[];
  sourceUrl: string;
  asOf: Date | null;
  fetchedAtMs: number;
}

const CASP_SPEC: Spec<CASPRecord> = {
  label: "MiCA CASP register",
  url: CASP_REGISTER_URL,
  parse: parseCaspCsv,
  mayBeEmpty: false,
};

const NC_SPEC: Spec<NonCompliantRecord> = {
  label: "MiCA non-compliant entities register",
  url: NON_COMPLIANT_REGISTER_URL,
  parse: parseNonCompliantCsv,
  mayBeEmpty: true,
};

let _caspCache: CacheEntry<CASPRecord> | null = null;
let _ncCache: CacheEntry<NonCompliantRecord> | null = null;

function snapshot<T>(spec: Spec<T>, entry: CacheEntry<T>, servedFromCache: boolean, nowMs: number): RegisterSnapshot<T> {
  const ageDays = entry.asOf ? Math.max(0, Math.floor((nowMs - entry.asOf.getTime()) / DAY_MS)) : null;
  if (ageDays !== null && ageDays > MAX_REGISTER_AGE_DAYS) {
    throw registerUnavailable(
      spec.label,
      [],
      `the register file was last published ${entry.asOf!.toISOString().slice(0, 10)} (about ${Math.floor(ageDays / 7)} weeks ago); ` +
        `ESMA republishes weekly, so the file looks frozen and answering from it would be unsafe`,
    );
  }
  return {
    records: entry.records,
    sourceUrl: entry.sourceUrl,
    registerLastUpdated: entry.asOf ? entry.asOf.toISOString() : null,
    fetchedAt: new Date(entry.fetchedAtMs).toISOString(),
    ageDays,
    stale: ageDays === null || ageDays > STALE_AFTER_DAYS,
    servedFromCache,
  };
}

async function loadRegister<T>(
  spec: Spec<T>,
  cached: CacheEntry<T> | null,
  store: (entry: CacheEntry<T>) => void,
): Promise<RegisterSnapshot<T>> {
  const nowMs = Date.now();
  if (cached && (cached.records.length > 0 || spec.mayBeEmpty) && nowMs - cached.fetchedAtMs < CACHE_TTL_MS) {
    return snapshot(spec, cached, false, nowMs);
  }

  const useCache = (reason: string): RegisterSnapshot<T> | null => {
    if (!cached) return null;
    logWarn("vasp-data-stale-cache", `ESMA ${spec.label}: ${reason}, using the previous read`);
    return snapshot(spec, cached, true, nowMs);
  };

  const fetched = await fetchRegisterFile(spec.url);
  if (!fetched.ok) {
    const fallback = useCache("unavailable");
    if (fallback) return fallback;
    throw registerUnavailable(spec.label, fetched.failures);
  }

  let parsed: Parsed<T>;
  try {
    parsed = spec.parse(fetched.text);
  } catch (err) {
    if (!(err instanceof FormatChangedError)) throw err;
    const fallback = useCache("format changed");
    if (fallback) return fallback;
    throw registerUnavailable(spec.label, [], err.message);
  }

  // The authorised-CASP register is not empty, so a file that parsed to no
  // rows changed shape; reporting "not authorised" from it would be the same
  // fabricated negative as an outage. A published non-compliant list with a
  // header and no rows is a real answer.
  if (parsed.records.length === 0 && !spec.mayBeEmpty) {
    const fallback = useCache("parsed to no rows");
    if (fallback) return fallback;
    throw registerUnavailable(spec.label, [], "the file parsed to no register rows");
  }

  const entry: CacheEntry<T> = {
    records: parsed.records,
    sourceUrl: fetched.url,
    asOf: fetched.lastModified ?? parsed.newestUpdate,
    fetchedAtMs: nowMs,
  };
  // Age is judged before the read is kept: a frozen file must not displace a
  // fresher cached read.
  const result = snapshot(spec, entry, false, nowMs);
  store(entry);
  return result;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function getCASPRegister(): Promise<RegisterSnapshot<CASPRecord>> {
  return loadRegister(CASP_SPEC, _caspCache, (e) => { _caspCache = e; });
}

export function getNonCompliantRegister(): Promise<RegisterSnapshot<NonCompliantRecord>> {
  return loadRegister(NC_SPEC, _ncCache, (e) => { _ncCache = e; });
}

// ─── Authorisation status ───────────────────────────────────────────────────

/**
 * ESMA keeps a withdrawn authorisation in the file and records the date the
 * withdrawal took effect, so a row's presence is not authorisation. A row is
 * in force when no end date is recorded or the recorded date is still ahead.
 * An end-date cell that is not a date (the file has one such row) cannot be
 * read as "no withdrawal", so it counts as not in force.
 */
export function isAuthorisationActive(record: CASPRecord, now: Date = new Date()): boolean {
  if (!record.authorizationEndDate) return true;
  const end = parseRegisterDate(record.authorizationEndDate);
  return end !== null && end.getTime() > now.getTime();
}

// ─── Search helpers ─────────────────────────────────────────────────────────

/** ESMA's website cells hold one or several addresses, sometimes mistyped ("https.//"). */
function domainsOf(url: string): string[] {
  return url
    .toLowerCase()
    .split(/[|\s,;]+/)
    .map((part) =>
      part
        .replace(/^https?[:.]\/\//, "")
        .replace(/^www\./, "")
        .replace(/[/?#].*$/, "")
        .trim(),
    )
    .filter((d) => d.includes("."));
}

function sameSite(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

function websiteMatches(recordWebsite: string, wanted: string): boolean {
  const wantedDomains = domainsOf(wanted);
  if (wantedDomains.length === 0) return false;
  const recordDomains = domainsOf(recordWebsite);
  return recordDomains.some((r) => wantedDomains.some((w) => sameSite(r, w)));
}

function nameMatches(searchLower: string, ...names: string[]): boolean {
  return names.some((raw) => {
    const name = raw.toLowerCase();
    if (!name) return false;
    // The reverse direction ("Coinbase Global Inc" finds "Coinbase") needs a
    // name long enough to mean something; an empty one would match everything.
    return name.includes(searchLower) || (name.length >= 3 && searchLower.includes(name));
  });
}

export function searchCASP(
  records: CASPRecord[],
  entityName: string,
  website?: string,
  lei?: string,
  now: Date = new Date(),
): CASPRecord[] {
  // Rows in force first, so a withdrawn duplicate cannot crowd out the live one.
  const take = (rows: CASPRecord[]) =>
    [...rows].sort((a, b) => Number(isAuthorisationActive(b, now)) - Number(isAuthorisationActive(a, now))).slice(0, 3);

  // Exact LEI match first
  if (lei) {
    const leiMatches = records.filter((r) => r.lei.toLowerCase() === lei.toLowerCase());
    if (leiMatches.length > 0) return take(leiMatches);
  }

  // Website domain match
  if (website) {
    const webMatches = records.filter((r) => websiteMatches(r.website, website));
    if (webMatches.length > 0) return take(webMatches);
  }

  // Name search (case-insensitive contains on both entityName and commercialName)
  const searchLower = entityName.toLowerCase().replace(/\s+/g, " ").trim();
  return take(records.filter((r) => nameMatches(searchLower, r.entityName, r.commercialName)));
}

export function searchNonCompliant(
  records: NonCompliantRecord[],
  entityName: string,
  website?: string,
): NonCompliantRecord[] {
  if (website) {
    const webMatches = records.filter((r) => websiteMatches(r.website, website));
    if (webMatches.length > 0) return webMatches.slice(0, 3);
  }

  const searchLower = entityName.toLowerCase().replace(/\s+/g, " ").trim();
  return records
    .filter((r) => r.entityName.toLowerCase().includes(searchLower) || r.commercialName.toLowerCase().includes(searchLower))
    .slice(0, 3);
}
