import { registerCapability, type CapabilityInput } from "./index.js";

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
    if (!res.ok) throw new Error(`Spinta classifier fetch HTTP ${res.status}`);
    const page = (await res.json()) as SpintaPage<T>;
    all.push(...(page._data ?? []));
    next = page._page?.next;
    if (!next || (page._data ?? []).length === 0) break;
  }
  return all;
}

async function ensureClassifiers(): Promise<void> {
  if (Date.now() - classifiersLoadedAt < CLASSIFIER_TTL_MS && formaCache.size > 0) return;
  if (classifiersInflight) return classifiersInflight;
  classifiersInflight = (async () => {
    const [formas, statuses] = await Promise.all([
      fetchAllPages<ClassifierRecord>(FORMA_MODEL),
      fetchAllPages<ClassifierRecord>(STATUSAS_MODEL),
    ]);
    formaCache.clear();
    statusCache.clear();
    for (const f of formas) formaCache.set(f._id, f);
    for (const s of statuses) statusCache.set(s._id, s);
    classifiersLoadedAt = Date.now();
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
        "Real-time query against the Lithuanian Open Data Portal (data.gov.lt) via the Spinta JSON API.",
    },
  };
});
