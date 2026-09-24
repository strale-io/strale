import { registerCapability, type CapabilityInput } from "./index.js";
import { logWarn } from "../lib/log.js";
import {
  CLASSIFIER_SNAPSHOT_FETCHED_AT,
  FORMA_SNAPSHOT,
  STATUSAS_SNAPSHOT,
} from "./lib/lithuanian-classifiers.js";

/**
 * Lithuanian company data via the data.gov.lt Spinta API
 * (Registrų centras / JAR — Juridinių asmenų registras).
 *
 * Free, real-time JSON, no signup required. Data is published by
 * Lithuania's Centre of Registers under CC-BY 4.0 (commercial reuse
 * permitted with attribution).
 *
 * Replaces the prior northdata.com aggregator scraper, which was a
 * Tier-1 violation per DEC-20260428-A. This implementation is
 * `acquisition_method: direct_api`.
 */

const SPINTA_BASE = "https://get.data.gov.lt/datasets/gov/rc/jar";
const JA_MODEL = `${SPINTA_BASE}/iregistruoti/JuridinisAsmuo/:format/json`;
const FORMA_MODEL = `${SPINTA_BASE}/formos_statusai/Forma/:format/json`;
const STATUSAS_MODEL = `${SPINTA_BASE}/formos_statusai/Statusas/:format/json`;

// LT entity registration code: 7-9 digits (modern codes are 9 digits).
const JA_KODAS_RE = /^\d{7,9}$/;

interface JaRecord {
  _id: string;
  ja_kodas: number;
  ja_pavadinimas: string;
  pilnas_adresas: string | null;
  reg_data: string | null;
  isreg_data: string | null;
  forma: { _id: string } | null;
  statusas: { _id: string } | null;
  stat_data: string | null;
}

interface ClassifierRecord {
  _id: string;
  pavadinimas: string;
  name: string;
  tipas?: string;
  type?: string;
}

interface SpintaPage<T> {
  _data: T[];
  _page?: { next?: string };
}

// Module-level lazy classifier cache. Refreshed on next call after TTL expiry.
const CLASSIFIER_TTL_MS = 24 * 60 * 60 * 1000;
const formaCache = new Map<string, ClassifierRecord>();
const statusCache = new Map<string, ClassifierRecord>();
let classifiersLoadedAt = 0;
let classifiersInflight: Promise<void> | null = null;

async function fetchAllPages<T>(url: string): Promise<T[]> {
  const all: T[] = [];
  let next: string | undefined;
  for (let i = 0; i < 20; i++) {
    const params = ["limit(100)"];
    if (next) params.push(`page('${next}')`);
    const u = `${url}?${params.join("&")}`;
    const res = await fetch(u, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Spinta classifier fetch HTTP ${res.status} (page ${i + 1})`);
    const page = (await res.json()) as SpintaPage<T>;
    all.push(...(page._data ?? []));
    next = page._page?.next;
    if (!next || (page._data ?? []).length === 0) break;
  }
  return all;
}

// Where the labels in the current cache came from. "snapshot" means the live
// read failed and the bundled copy is standing in; provenance says so.
let classifierSource: "live" | "snapshot" = "live";
// After a failed live read, try again sooner than the full TTL.
const CLASSIFIER_RETRY_MS = 60 * 60 * 1000;

function loadSnapshot(): void {
  formaCache.clear();
  statusCache.clear();
  for (const [id, f] of Object.entries(FORMA_SNAPSHOT)) formaCache.set(id, { _id: id, ...f });
  for (const [id, s] of Object.entries(STATUSAS_SNAPSHOT)) statusCache.set(id, { _id: id, ...s });
  classifierSource = "snapshot";
}

async function ensureClassifiers(): Promise<void> {
  if (Date.now() - classifiersLoadedAt < CLASSIFIER_TTL_MS && formaCache.size > 0) return;
  if (classifiersInflight) return classifiersInflight;
  classifiersInflight = (async () => {
    try {
      const [formas, statuses] = await Promise.all([
        fetchAllPages<ClassifierRecord>(FORMA_MODEL),
        fetchAllPages<ClassifierRecord>(STATUSAS_MODEL),
      ]);
      formaCache.clear();
      statusCache.clear();
      for (const f of formas) formaCache.set(f._id, f);
      for (const s of statuses) statusCache.set(s._id, s);
      classifierSource = "live";
      classifiersLoadedAt = Date.now();
    } catch (err) {
      // The classifiers only turn a legal-form or status id into its label.
      // From production they answered HTTP 500 on every run from 2026-08-21
      // while the same requests succeeded from elsewhere, and failing here
      // failed every lookup. The labels change rarely, so a bundled copy
      // stands in, and the live read is retried after CLASSIFIER_RETRY_MS.
      logWarn("lithuanian-classifier-fallback", "classifier read failed; using bundled snapshot", {
        snapshot: CLASSIFIER_SNAPSHOT_FETCHED_AT,
        error: err instanceof Error ? err.message : String(err),
      });
      loadSnapshot();
      classifiersLoadedAt = Date.now() - CLASSIFIER_TTL_MS + CLASSIFIER_RETRY_MS;
    }
  })();
  try {
    await classifiersInflight;
  } finally {
    classifiersInflight = null;
  }
}

async function spintaQuery(filter: string): Promise<JaRecord[]> {
  const url = `${JA_MODEL}?${filter}&limit(10)`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    throw new Error(`Lithuanian Open Data Portal returned HTTP ${res.status}`);
  }
  const data = (await res.json()) as SpintaPage<JaRecord>;
  return data._data ?? [];
}

async function lookupByCode(code: string): Promise<JaRecord> {
  const records = await spintaQuery(`eq(ja_kodas,${code})`);
  if (!records.length) {
    throw new Error(`No Lithuanian company found for code ${code}.`);
  }
  return records[0];
}

async function lookupByName(name: string): Promise<JaRecord> {
  // Spinta `contains()` requires a quoted string literal.
  const escaped = name.replace(/'/g, "");
  const records = await spintaQuery(`contains(ja_pavadinimas,'${escaped}')`);
  if (!records.length) {
    throw new Error(`No Lithuanian company found matching "${name}".`);
  }
  // Prefer entries that are still registered.
  const sorted = [...records].sort((a, b) => {
    const aActive = a.isreg_data ? 1 : 0;
    const bActive = b.isreg_data ? 1 : 0;
    return aActive - bActive;
  });
  return sorted[0];
}

function findCode(input: string): string | null {
  const cleaned = input.replace(/[\s.-]/g, "");
  if (JA_KODAS_RE.test(cleaned)) return cleaned;
  const match = input.match(/\d{7,9}/);
  return match && JA_KODAS_RE.test(match[0]) ? match[0] : null;
}

function clean(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const trimmed = s.trim();
  return trimmed.length > 0 ? trimmed : null;
}

registerCapability("lithuanian-company-data", async (input: CapabilityInput) => {
  const raw =
    (input.company_code as string) ??
    (input.ja_kodas as string) ??
    (input.company_name as string) ??
    (input.task as string) ??
    "";
  if (typeof raw !== "string" || !raw.trim()) {
    throw new Error(
      "'company_code' or 'company_name' is required. Provide a Lithuanian company code (7-9 digits) or company name.",
    );
  }

  const trimmed = raw.trim();
  if (trimmed.length < 2) {
    throw new Error("Input must be at least 2 characters.");
  }

  await ensureClassifiers();

  const code = findCode(trimmed);
  const record = code ? await lookupByCode(code) : await lookupByName(trimmed);

  const forma = record.forma ? formaCache.get(record.forma._id) : undefined;
  const statusas = record.statusas ? statusCache.get(record.statusas._id) : undefined;
  // legal_form and status are guaranteed fields; an id the active cache does
  // not know (e.g. a form added after the bundled snapshot) would null them.
  if ((record.forma && !forma) || (record.statusas && !statusas)) {
    logWarn("lithuanian-classifier-miss", "classifier id not in cache", {
      source: classifierSource,
      forma_id: record.forma && !forma ? record.forma._id : undefined,
      statusas_id: record.statusas && !statusas ? record.statusas._id : undefined,
    });
  }

  // Override status to a derived label when the entity is deregistered: the
  // canonical statusas can lag in some records (e.g. statusas == "neįregistruotas"
  // even though isreg_data is set, which is a Centre-of-Registers data quirk).
  const isDeregistered = !!record.isreg_data;
  const statusLt = statusas?.pavadinimas ?? null;
  const statusEn = statusas?.name ?? null;

  const output = {
    company_name: clean(record.ja_pavadinimas),
    company_code: String(record.ja_kodas),
    legal_form: forma?.pavadinimas ?? null,
    legal_form_en: forma?.name ?? null,
    legal_form_type: forma?.tipas ?? null,
    status: isDeregistered ? "Išregistruotas" : statusLt,
    status_en: isDeregistered ? "Removed" : statusEn,
    status_date: record.stat_data ?? null,
    registration_date: record.reg_data ?? null,
    deregistration_date: record.isreg_data ?? null,
    is_active: !isDeregistered,
    jurisdiction: "LT",
  };

  const primarySourceUrl = `${JA_MODEL}?eq(ja_kodas,${record.ja_kodas})`;

  // Evidence Tier framework labels + Tier 1 canonical aliases (DEC-20260518-A).
  // Resolves alias keys at runtime; only sets a canonical if not already present.
  {
    const o = output as Record<string, unknown>;
    if (o.legal_name === undefined) o.legal_name = (o.company_name ?? o.name);
    if (o.primary_registration_id === undefined) o.primary_registration_id = (o.company_number ?? o.registration_number ?? o.uen ?? o.fn_number ?? o.ico ?? o.krs_number ?? o.org_number ?? o.cnpj ?? o.reg_number);
    if (o.status === undefined) {
    if (typeof o.company_status === "string") o.status = o.company_status;
    else if (o.is_active === true || o.active === true) o.status = "active";
    else if (o.is_active === false || o.active === false) o.status = "inactive";
  }
    if (o.legal_form === undefined) o.legal_form = (o.business_type ?? o.company_type ?? o.entity_type ?? o.legal_form_code ?? o.legal_form_id);
    if (o.registered_address === undefined) o.registered_address = (o.address ?? o.office_address);
    if (o.date_incorporated === undefined) o.date_incorporated = (o.incorporation_date ?? o.registered_date ?? o.registration_date ?? o.founded ?? o.uen_issue_date ?? o.registered_at);
    o.tier_2_available = false;
    o.tier_2_available_reason = "handler does not currently extract legal representatives from upstream registry; follow-up extraction task tracked";
    o.ubo_availability = "unavailable_no_registry";
    o.ubo_availability_reason = "Programmatic UBO access not yet operational at v1; verification pending public-source confirmation";
  }

  return {
    output,
    provenance: {
      source: "data.gov.lt",
      source_url: "https://data.gov.lt/datasets/gov/rc/jar/iregistruoti/",
      fetched_at: new Date().toISOString(),
      acquisition_method: "direct_api" as const,
      primary_source_reference: primarySourceUrl,
      license: "CC-BY 4.0",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      attribution:
        "VĮ Registrų centras (Lithuanian Centre of Registers) — Juridinių asmenų registras, via data.gov.lt",
      source_note:
        classifierSource === "live"
          ? "Real-time query against the Lithuanian Open Data Portal (data.gov.lt) via the Spinta JSON API."
          : `Real-time query against the Lithuanian Open Data Portal (data.gov.lt) via the Spinta JSON API. Legal-form and status labels come from a copy of the registry's classifiers taken ${CLASSIFIER_SNAPSHOT_FETCHED_AT}, because the live classifier read failed.`,
    },
  };
});
