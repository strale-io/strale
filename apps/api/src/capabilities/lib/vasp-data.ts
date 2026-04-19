/**
 * Shared VASP/CASP data cache from ESMA CSV files.
 * Downloads and caches the EU MiCA register of authorized CASPs.
 * CSV is refreshed every 6 hours; stale cache used if ESMA is down.
 */

import { logWarn } from "../../lib/log.js";

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
  services: string[];
  passportingCountries: string[];
}

export interface NonCompliantRecord {
  entityName: string;
  commercialName: string;
  homeMemberState: string;
  website: string;
  infringement: string;
}

// ─── CSV parser (handles quoted fields with commas) ─────────────────────────

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === "," && !inQuotes) { fields.push(field.trim()); field = ""; continue; }
    field += char;
  }
  fields.push(field.trim());
  return fields;
}

function parsePipeList(val: string): string[] {
  if (!val) return [];
  return val.split("|").map((s) => s.trim()).filter(Boolean);
}

// ─── Cache state ────────────────────────────────────────────────────────────

let _caspCache: CASPRecord[] = [];
let _ncCache: NonCompliantRecord[] = [];
let _caspFetchedAt = 0;
let _ncFetchedAt = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ESMA updates the date folder periodically — try recent months
function getCASPUrls(): string[] {
  const now = new Date();
  const urls: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    urls.push(`https://www.esma.europa.eu/sites/default/files/${year}-${month}/CASPS.csv`);
  }
  return urls;
}

function getNonCompliantUrls(): string[] {
  const now = new Date();
  const urls: string[] = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    urls.push(`https://www.esma.europa.eu/sites/default/files/${year}-${month}/Non_compliant_CASPs.csv`);
  }
  return urls;
}

async function fetchCSV(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        headers: { "User-Agent": "Strale/1.0 (compliance-check)" },
        signal: AbortSignal.timeout(30000),
      });
      if (resp.ok) {
        const text = await resp.text();
        // Verify it's actually CSV, not an HTML error page
        if (text.length > 10 && !text.trimStart().startsWith("<!DOCTYPE") && !text.trimStart().startsWith("<html")) {
          return text;
        }
      }
    } catch {
      // Try next URL
    }
  }
  return null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getCASPData(): Promise<CASPRecord[]> {
  if (_caspCache.length > 0 && Date.now() - _caspFetchedAt < CACHE_TTL_MS) {
    return _caspCache;
  }

  const csv = await fetchCSV(getCASPUrls());
  if (!csv) {
    if (_caspCache.length > 0) {
      logWarn("vasp-data-stale-cache", "ESMA CSV unavailable, using stale cache");
      return _caspCache;
    }
    return [];
  }

  const lines = csv.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return _caspCache.length > 0 ? _caspCache : [];

  // Skip header row
  const records: CASPRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 5) continue;

    records.push({
      nca: fields[0] ?? "",
      country: fields[1] ?? "",
      entityName: fields[2] ?? "",
      lei: fields[3] ?? "",
      homeMemberState: fields[4] ?? "",
      commercialName: fields[5] ?? "",
      address: fields[6] ?? "",
      website: fields[7] ?? "",
      authorizationDate: fields[8] ?? "",
      services: parsePipeList(fields[9] ?? ""),
      passportingCountries: parsePipeList(fields[10] ?? ""),
    });
  }

  _caspCache = records;
  _caspFetchedAt = Date.now();
  return _caspCache;
}

export async function getNonCompliantData(): Promise<NonCompliantRecord[]> {
  if (_ncCache.length > 0 && Date.now() - _ncFetchedAt < CACHE_TTL_MS) {
    return _ncCache;
  }

  const csv = await fetchCSV(getNonCompliantUrls());
  if (!csv) {
    if (_ncCache.length > 0) return _ncCache;
    return []; // Non-compliant list may not exist yet
  }

  const lines = csv.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length < 2) return _ncCache.length > 0 ? _ncCache : [];

  const records: NonCompliantRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCSVLine(lines[i]);
    if (fields.length < 3) continue;

    records.push({
      entityName: fields[0] ?? "",
      commercialName: fields[1] ?? "",
      homeMemberState: fields[2] ?? "",
      website: fields[3] ?? "",
      infringement: fields[4] ?? "",
    });
  }

  _ncCache = records;
  _ncFetchedAt = Date.now();
  return _ncCache;
}

export function getCASPCacheAge(): string | null {
  if (_caspFetchedAt === 0) return null;
  return new Date(_caspFetchedAt).toISOString();
}

// ─── Search helpers ─────────────────────────────────────────────────────────

function normalizeDomain(url: string): string {
  return url.toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

export function searchCASP(
  records: CASPRecord[],
  entityName: string,
  website?: string,
  lei?: string,
): CASPRecord[] {
  // Exact LEI match first
  if (lei) {
    const leiMatches = records.filter((r) => r.lei.toLowerCase() === lei.toLowerCase());
    if (leiMatches.length > 0) return leiMatches.slice(0, 3);
  }

  // Website domain match
  if (website) {
    const domain = normalizeDomain(website);
    const webMatches = records.filter((r) => {
      const recDomain = normalizeDomain(r.website);
      return recDomain && (recDomain.includes(domain) || domain.includes(recDomain));
    });
    if (webMatches.length > 0) return webMatches.slice(0, 3);
  }

  // Name search (case-insensitive contains on both entityName and commercialName)
  const searchLower = entityName.toLowerCase();
  const nameMatches = records.filter((r) =>
    r.entityName.toLowerCase().includes(searchLower) ||
    r.commercialName.toLowerCase().includes(searchLower) ||
    searchLower.includes(r.entityName.toLowerCase()) ||
    searchLower.includes(r.commercialName.toLowerCase()),
  );

  return nameMatches.slice(0, 3);
}

export function searchNonCompliant(
  records: NonCompliantRecord[],
  entityName: string,
  website?: string,
): NonCompliantRecord[] {
  if (website) {
    const domain = normalizeDomain(website);
    const webMatches = records.filter((r) => {
      const recDomain = normalizeDomain(r.website);
      return recDomain && (recDomain.includes(domain) || domain.includes(recDomain));
    });
    if (webMatches.length > 0) return webMatches.slice(0, 3);
  }

  const searchLower = entityName.toLowerCase();
  return records.filter((r) =>
    r.entityName.toLowerCase().includes(searchLower) ||
    r.commercialName.toLowerCase().includes(searchLower),
  ).slice(0, 3);
}
