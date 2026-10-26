/**
 * company-status-check orchestration (portfolio plan 1C.1).
 *
 * Pure of module state: the executor lookup and the breaker peek are injected,
 * so the unit tests run with the underlying registries mocked.
 *
 * Why `getExecutor` and not `getDirectExecutor` (index.ts): getExecutor runs a
 * registry's DataProvider chain (Finnish, Norwegian and Swiss registries have
 * one) and stamps the manifest's data-access lane onto provenance; the direct
 * executor skips both. Neither bills or logs: billing, the transaction row and
 * the breaker record live in routes/do.ts and guardedExecute, keyed on the slug
 * the caller invoked, so an intra-capability call is charged once, to
 * company-status-check (the rule guarded-executor.ts states for such calls).
 * The underlying breakers are read, not written: a registry whose breaker is
 * open is refused up front, and the composite's own breaker records the outcome.
 */

import type { CapabilityExecutor, CapabilityInput, CapabilityResult } from "../../capabilities/index.js";
import { CapabilityRefusalError } from "../capability-refusal.js";
import { normaliseStatus, type CompanyStatus } from "./normalise.js";
import {
  SUPPORTED_COUNTRIES,
  canonicalCountry,
  getRoute,
  type CountryRoute,
} from "./routing.js";

export interface ComposeDeps {
  getExecutor: (slug: string) => CapabilityExecutor | undefined;
  /** True when the slug's circuit breaker is open and not yet due a retry. Read-only. */
  isCircuitOpen: (slug: string) => Promise<boolean>;
  now: () => Date;
}

export interface InsolvencyNotice {
  date: string | null;
  type: string;
  source_url: string | null;
}

interface Signal {
  role: "registry" | "insolvency";
  capability_slug: string;
  source: string | null;
  fetched_at: string | null;
  acquisition_method: string | null;
  data_access_lane: string | null;
  data_access_checks: string | null;
  upstream_vendor: string | null;
}

// ─── Weakest-lane rule ───────────────────────────────────────────────────────

/**
 * Lower is stronger. A signal whose provenance carries no lane at all (an
 * executor with no data_access block) is ranked weakest, so a gap in the
 * record can never raise the composite's claim.
 */
function signalRank(s: Signal): number {
  if (s.data_access_lane === "preferred") return 0;
  if (s.data_access_lane === "not_applicable") return 0;
  if (s.data_access_lane === "allowed_with_checks") return s.data_access_checks === "recorded" ? 1 : 2;
  return 3;
}

/**
 * The composite's data-access stamp is the weakest of its inputs: lane first,
 * and on the allowed-with-checks lane "recorded" beats "pending". Ties keep the
 * earlier signal (the registry). Method and vendor come from that same signal,
 * so the three fields describe one real path rather than a blend.
 */
export function weakestSignal(signals: readonly Signal[]): Signal {
  let weakest = signals[0];
  for (const s of signals) if (signalRank(s) > signalRank(weakest)) weakest = s;
  return weakest;
}

function signalFrom(role: Signal["role"], slug: string, r: CapabilityResult): Signal {
  const p = r.provenance as Record<string, unknown>;
  const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  return {
    role,
    capability_slug: slug,
    source: str(p.source),
    fetched_at: str(p.fetched_at),
    acquisition_method: str(p.acquisition_method),
    data_access_lane: str(p.data_access_lane),
    data_access_checks: str(p.data_access_checks),
    upstream_vendor: str(p.upstream_vendor),
  };
}

// ─── Insolvency adapters ─────────────────────────────────────────────────────

const asRecord = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {};
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);

/** Companies House proceedings (insolvency-check, GB). */
function gbNotices(out: Record<string, unknown>, companyNumber: string): InsolvencyNotice[] {
  const url = `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}/insolvency`;
  return asArray(out.proceedings).map((p) => {
    const r = asRecord(p);
    return { date: str(r.date_started), type: str(r.type) ?? "insolvency proceeding", source_url: url };
  });
}

// The BODACC API (Opendatasoft v2.1) rejects limit > 100 with HTTP 400, verified 2026-10-26.
const BODACC_WINDOW = 100;

/** BODACC collective-proceedings announcements (fr-bodacc-lookup, FR). */
function frNotices(out: Record<string, unknown>): { notices: InsolvencyNotice[]; truncated: boolean } {
  const notices = asArray(out.announcements)
    .map(asRecord)
    .filter((a) => a.family === "collective")
    .map((a) => ({
      date: str(a.date),
      type: str(asRecord(a.judgment).nature) ?? str(a.family_label) ?? "collective proceeding",
      source_url: str(a.url),
    }));
  const total = typeof out.total_announcements === "number" ? out.total_announcements : 0;
  return { notices, truncated: total > BODACC_WINDOW };
}

/** Brønnøysund flags (no-bankruptcy-check, NO). */
function noNotices(out: Record<string, unknown>, orgNumber: string): InsolvencyNotice[] {
  const url = `https://data.brreg.no/enhetsregisteret/api/enheter/${encodeURIComponent(orgNumber)}`;
  const notices: InsolvencyNotice[] = [];
  if (out.has_bankruptcy_filing === true) notices.push({ date: str(out.bankruptcy_date), type: "bankruptcy", source_url: url });
  if (out.is_under_compulsory_dissolution === true) notices.push({ date: null, type: "compulsory dissolution", source_url: url });
  if (out.is_under_dissolution === true) notices.push({ date: null, type: "dissolution", source_url: url });
  return notices;
}

/** Bolagsverket pending proceedings, read from the registry output itself (SE). */
function seNotices(registryOut: Record<string, unknown>): InsolvencyNotice[] {
  const seen = new Set<string>();
  const notices: InsolvencyNotice[] = [];
  for (const p of asArray(registryOut.ongoing_procedures).map(asRecord)) {
    const type = str(p.description) ?? str(p.code);
    if (!type) continue;
    const date = str(p.from_date);
    const k = `${type}|${date}`;
    if (seen.has(k)) continue; // Bolagsverket can list one proceeding twice.
    seen.add(k);
    notices.push({ date, type, source_url: "https://gw.api.bolagsverket.se/vardefulla-datamangder/v1/organisationer" });
  }
  return notices;
}

/** Singapore's executor names the field entity_name; the others use company_name. */
function registryName(out: Record<string, unknown>): string | null {
  return str(out.company_name) ?? str(out.entity_name) ?? str(out.legal_name);
}

// ─── Errors ──────────────────────────────────────────────────────────────────

const shorten = (s: string): string => s.replace(/\s+/g, " ").slice(0, 200);

function upstreamError(route: CountryRoute, slug: string, label: string, err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  // A registry that says the entity does not exist, or refuses the ask, is a
  // caller-attributable answer: keep it a refusal so it does not open the breaker.
  if (err instanceof CapabilityRefusalError) {
    return new CapabilityRefusalError(`${label} lookup for ${route.iso} (${slug}) was refused: ${shorten(msg)}`);
  }
  return new Error(`${label} lookup failed for ${route.iso}: ${route.registry.name} via ${slug} did not answer (${shorten(msg)}). No status is returned.`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function runCompanyStatusCheck(input: CapabilityInput, deps: ComposeDeps): Promise<CapabilityResult> {
  const country = canonicalCountry(input.country);
  if (!country) {
    throw new CapabilityRefusalError(
      `'country' must be an ISO 3166-1 alpha-2 code; supported: ${SUPPORTED_COUNTRIES.join(", ")}.`,
    );
  }
  const route = getRoute(country);
  if (!route) {
    throw new CapabilityRefusalError(
      `'country' must be one of the supported countries; '${country}' is not. Supported: ${SUPPORTED_COUNTRIES.join(", ")}.`,
    );
  }
  const rawIdentifier = typeof input.identifier === "string" ? input.identifier.trim() : "";
  const identifier = rawIdentifier === "" ? null : route.normalise_identifier(rawIdentifier);
  if (identifier === null) {
    throw new CapabilityRefusalError(`'identifier' must be ${route.identifier_help} for ${route.iso}.`);
  }

  const registryExec = deps.getExecutor(route.registry.slug);
  if (!registryExec) {
    throw new Error(`Registry lookup unavailable for ${route.iso}: ${route.registry.slug} is not registered.`);
  }
  const insolvencySlug = route.insolvency?.kind === "separate" ? route.insolvency.slug : undefined;
  const insolvencyExec = insolvencySlug ? deps.getExecutor(insolvencySlug) : undefined;
  if (insolvencySlug && !insolvencyExec) {
    throw new Error(`Insolvency lookup unavailable for ${route.iso}: ${insolvencySlug} is not registered.`);
  }
  for (const slug of [route.registry.slug, insolvencySlug]) {
    if (slug && (await deps.isCircuitOpen(slug))) {
      throw new Error(`Lookup unavailable for ${route.iso}: ${slug} is temporarily suspended after repeated failures. No status is returned.`);
    }
  }

  // Registry first: its answer decides whether there is anything to add.
  let registryResult: CapabilityResult;
  try {
    registryResult = await registryExec({ [route.registry.input_field]: identifier });
  } catch (err) {
    throw upstreamError(route, route.registry.slug, "Registry", err);
  }
  const registryOut = asRecord(registryResult?.output);
  const normalised = normaliseStatus(route.registry.slug, registryOut.status);

  const signals: Signal[] = [signalFrom("registry", route.registry.slug, registryResult)];

  let insolvency: Record<string, unknown>;
  if (!route.insolvency) {
    insolvency = {
      checked: false,
      reason: `No official insolvency source is connected for ${route.iso}.`,
    };
  } else if (route.insolvency.kind === "same_record") {
    const notices = seNotices(registryOut);
    insolvency = {
      checked: true,
      source: route.insolvency.name,
      notices_found: notices.length,
      notices,
    };
  } else {
    const slug = route.insolvency.slug as string;
    let r: CapabilityResult;
    try {
      r = await (insolvencyExec as CapabilityExecutor)(insolvencyInput(route, slug, identifier, registryOut));
    } catch (err) {
      throw upstreamError(route, slug, "Insolvency", err);
    }
    const out = asRecord(r?.output);
    let notices: InsolvencyNotice[];
    let truncated = false;
    if (route.iso === "GB") {
      // `found: false` means the company could not be resolved, which is a failed lookup, not "no notices".
      if (out.found === false) {
        throw new Error(`Insolvency lookup failed for GB: ${slug} could not resolve company ${identifier}. No status is returned.`);
      }
      notices = gbNotices(out, identifier);
    } else if (route.iso === "FR") {
      ({ notices, truncated } = frNotices(out));
    } else {
      notices = noNotices(out, identifier);
    }
    signals.push(signalFrom("insolvency", slug, r));
    insolvency = {
      checked: true,
      source: route.insolvency.name,
      notices_found: notices.length,
      notices,
      ...(truncated ? { window_note: `Only the ${BODACC_WINDOW} most recent BODACC announcements for this company were read.` } : {}),
    };
  }

  const weakest = weakestSignal(signals);
  // Checks apply only on the allowed-with-checks lane; a signal with no lane at all counts as pending.
  const checks =
    weakest.data_access_lane === "preferred" || weakest.data_access_lane === "not_applicable"
      ? null
      : weakest.data_access_lane === "allowed_with_checks" && weakest.data_access_checks === "recorded"
        ? "recorded"
        : "pending";
  const fetchedAt = deps.now().toISOString();

  const status: CompanyStatus = normalised.status;
  return {
    output: {
      status,
      registry_status_raw: normalised.registry_status_raw,
      company_name: registryName(registryOut),
      registry: { name: route.registry.name, slug: route.registry.slug },
      identifier,
      country: route.iso,
      insolvency,
      as_of: fetchedAt,
    },
    provenance: {
      source: [...new Set(signals.map((s) => s.source ?? s.capability_slug))].join("; "),
      fetched_at: fetchedAt,
      acquisition_method: weakest.acquisition_method ?? "vendor_aggregation",
      data_access_lane: weakest.data_access_lane ?? "allowed_with_checks",
      ...(checks ? { data_access_checks: checks } : {}),
      ...(weakest.upstream_vendor ? { upstream_vendor: weakest.upstream_vendor } : {}),
      signals,
    },
  };
}

function insolvencyInput(
  route: CountryRoute,
  slug: string,
  identifier: string,
  registryOut: Record<string, unknown>,
): CapabilityInput {
  if (slug === "insolvency-check") {
    return { country_code: "GB", company_number: identifier, company_name: registryName(registryOut) ?? identifier };
  }
  if (slug === "fr-bodacc-lookup") return { siren: identifier, limit: BODACC_WINDOW };
  if (slug === "no-bankruptcy-check") return { org_number: identifier };
  throw new Error(`No input mapping for insolvency source ${slug} (${route.iso}).`);
}
