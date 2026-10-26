import type { CapabilityInput, CapabilityResult } from "../../capabilities/index.js";
import { weakestSignal, type ComposeDeps } from "../company-status/compose.js";
import { getRoute } from "../company-status/routing.js";
import { COMPANY_STATUSES } from "../company-status/normalise.js";
import { InvoiceCheckError, parseInvoiceInput, registryIdFromTaxId } from "./input.js";
import { compareCompanyNames, decodeViesText } from "./name.js";

type CheckName = "tax_id" | "registry_status" | "sanctions" | "name_match";
interface Check extends Record<string, unknown> {
  status: "completed" | "not_available" | "error";
  source: string;
  reason?: string;
}
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const name = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim().length >= 2 && /[\p{L}\p{N}]/u.test(v) && !/[\p{Cc}\p{Cf}]/u.test(v) ? v.trim() : undefined;

/** No wallet calls, guardedExecute, breaker mutations, LLMs or name searches. */
export async function runInvoiceCounterpartyCheck(input: CapabilityInput, deps: ComposeDeps): Promise<CapabilityResult> {
  const parsed = parseInvoiceInput(input); // Complete validation before looking up even one executor.
  const fetchedAt = deps.now().toISOString();
  const checks: Partial<Record<CheckName, Check>> = {};
  const signals: Array<{ check: CheckName; capability_slug: string; provenance: CapabilityResult["provenance"] }> = [];
  const findings: string[] = [];
  const incomplete = (check: CheckName): never => {
    throw new InvoiceCheckError("execution_failed", `${check} check did not complete. No result is billed. Retry when the source is available, or supply a company name if none was returned.`, { check, checks });
  };
  const call = async (check: CheckName, slug: string, args: CapabilityInput): Promise<CapabilityResult | undefined> => {
    checks[check] = { status: "not_available", source: slug, reason: "The underlying executor is not available." };
    const executor = deps.getExecutor(slug);
    if (!executor) return undefined;
    try {
      if (await deps.isCircuitOpen(slug)) {
        checks[check]!.reason = "The underlying circuit breaker is open. Retry later.";
        return undefined;
      }
      const r = await executor(args);
      if (!r || !r.output || !r.provenance?.source || !r.provenance.fetched_at) throw new Error("Incomplete evidence");
      signals.push({ check, capability_slug: slug, provenance: r.provenance });
      return r;
    } catch {
      // Never forward HTML, vendor errors, credentials or stack traces.
      checks[check] = { status: "error", source: slug, reason: "The underlying lookup failed. Retry later." };
      return undefined;
    }
  };
  const malformed = (check: CheckName, source: string): void => {
    checks[check] = { status: "error", source, reason: "The source returned incomplete or stale evidence. Retry later." };
  };

  const taxSlug = parsed.euVat ? "vat-validate" : "tax-id-validate";
  const taxResult = await call("tax_id", taxSlug, parsed.euVat
    ? { vat_number: parsed.taxId }
    : { tax_id: parsed.taxId, country_code: parsed.country });
  if (!taxResult) return incomplete("tax_id");
  const tax = taxResult.output;
  if (typeof tax.valid !== "boolean" || tax.stale === true || tax.error) {
    malformed("tax_id", taxResult.provenance.source);
    incomplete("tax_id");
  }
  // Format checks never supply a registered name. A VIES invalid-number
  // response completes the check but cannot supply a registered identity.
  const viesName = parsed.euVat && tax.valid === true && typeof tax.company_name === "string" ? name(decodeViesText(tax.company_name)) : undefined;
  checks.tax_id = {
    status: "completed", source: taxResult.provenance.source, valid: tax.valid,
    verification: parsed.euVat ? "vies" : "format_only",
    tax_id: parsed.taxId, country: parsed.country, checked_at: taxResult.provenance.fetched_at,
    ...(viesName ? { registered_name: viesName } : {}),
    ...(parsed.euVat && tax.valid === true && typeof tax.company_address === "string" && tax.company_address.trim() && tax.company_address.trim() !== "---"
      ? { registered_address: decodeViesText(tax.company_address) } : {}),
  };
  if (parsed.euVat) findings.push(`VIES reports the VAT number as ${tax.valid ? "valid" : "not valid"}.`);
  else findings.push(`The tax ID ${tax.valid ? "matches" : "does not match"} the supported format; this is a format-only check, not registry confirmation.`);

  const route = getRoute(parsed.country);
  const derived = registryIdFromTaxId(parsed.taxId);
  const registryId = parsed.registryId ?? (!parsed.companyId && derived ? route?.normalise_identifier(derived) ?? undefined : undefined);
  let registeredName: string | undefined;
  if (!route || !registryId) {
    checks.registry_status = {
      status: "not_available", source: "company-status-check",
      reason: !route ? `company-status-check does not cover ${parsed.country}.`
        : "No documented deterministic mapping to a company registry identifier is available. Supply company_id; name guessing is not used.",
    };
  } else {
    const registryResult = await call("registry_status", "company-status-check", { country: parsed.country, identifier: registryId });
    if (registryResult) {
      const out = registryResult.output;
      if (!COMPANY_STATUSES.includes(out.status as typeof COMPANY_STATUSES[number]) || !out.insolvency || typeof out.insolvency !== "object") {
        malformed("registry_status", registryResult.provenance.source);
      } else {
        registeredName = name(out.company_name);
        checks.registry_status = {
          status: "completed", source: registryResult.provenance.source,
          company_status: out.status, registry_status_raw: out.registry_status_raw ?? null,
          registered_name: registeredName ?? null, identifier: registryId,
          identifier_source: parsed.companyId ? "company_id" : "tax_id_mapping",
          registry: out.registry, insolvency: out.insolvency, checked_at: out.as_of ?? registryResult.provenance.fetched_at,
        };
        findings.push(`The registry reports the company status as ${String(out.status).replace(/_/g, " ")}.`);
      }
    }
  }
  const screenedName = registeredName ?? viesName ?? parsed.companyName;
  const nameSource = registeredName ? "registry_status" : viesName ? "tax_id" : "company_name";
  if (!screenedName) {
    checks.sanctions = { status: "not_available", source: "sanctions-check", reason: "No registered or invoice company name is available. Supply company_name." };
    incomplete("sanctions");
  }
  const sanctionsResult = await call("sanctions", "sanctions-check", { name: screenedName, entity_type: "company", country: parsed.country });
  if (!sanctionsResult) return incomplete("sanctions");
  const screening = sanctionsResult.output;
  const matches = Array.isArray(screening.matches) ? screening.matches.map(record) : undefined;
  // sanctions-check caps its returned matches at ten. Retain the full count
  // and explicitly disclose truncation; an empty/malformed response is never
  // evidence of zero matches. Dilisense supplies no scores in today's adapter.
  if (!Number.isInteger(screening.match_count) || (screening.match_count as number) < 0 || !matches
    || matches.length !== Math.min(screening.match_count as number, 10)
    || matches.some(m => !name(m.name) || !Array.isArray(m.datasets) || m.datasets.length === 0 || m.datasets.some(d => typeof d !== "string"))
    || !screening.lists_queried || typeof screening.lists_queried !== "object" || !screening.queried_at) {
    malformed("sanctions", sanctionsResult.provenance.source);
    incomplete("sanctions");
  }
  checks.sanctions = {
    status: "completed", source: sanctionsResult.provenance.source,
    screened_name: screenedName, name_source: nameSource,
    potential_match_count: screening.match_count,
    matches: matches!.map(m => ({ name: m.name, entity_id: m.entity_id, datasets: m.datasets,
      countries: m.countries, sanction_details: m.sanction_details, last_updated_at: m.last_updated_at })),
    matches_truncated: matches!.length < (screening.match_count as number),
    lists_queried: screening.lists_queried, checked_at: screening.queried_at,
  };
  findings.push(`Sanctions screening checks found ${screening.match_count} potential matches.`);

  if (parsed.companyName) {
    const registered = registeredName ?? viesName;
    checks.name_match = registered ? {
      status: "completed", source: "deterministic string comparison",
      match: compareCompanyNames(parsed.companyName, registered),
      invoice_name: parsed.companyName, registered_name: registered,
    } : { status: "not_available", source: "deterministic string comparison", reason: "No registered name was returned; the invoice name cannot be compared." };
    if (checks.name_match.match === "different") findings.push("The name on the invoice differs from the registered name.");
  }
  const entries = Object.entries(checks);
  const weakest = weakestSignal(signals.map(s => {
    const p = s.provenance;
    const str = (v: unknown): string | null => typeof v === "string" && v ? v : null;
    return { role: "registry" as const, capability_slug: s.capability_slug,
      source: p.source, fetched_at: p.fetched_at, acquisition_method: str(p.acquisition_method),
      data_access_lane: str(p.data_access_lane), data_access_checks: str(p.data_access_checks), upstream_vendor: str(p.upstream_vendor) };
  }));
  return {
    output: { ...checks,
      checks_completed: entries.filter(([, c]) => c.status === "completed").map(([key]) => key),
      checks_not_available: entries.filter(([, c]) => c.status === "not_available").map(([key]) => key), findings,
    },
    provenance: {
      source: [...new Set(signals.map(s => s.provenance.source))].join("; "), fetched_at: fetchedAt,
      acquisition_method: weakest.acquisition_method ?? "vendor_aggregation",
      data_access_lane: weakest.data_access_lane ?? "allowed_with_checks",
      ...(!weakest.data_access_lane || weakest.data_access_lane === "allowed_with_checks"
        ? { data_access_checks: weakest.data_access_checks === "recorded" ? "recorded" : "pending" } : {}),
      ...(weakest.upstream_vendor ? { upstream_vendor: weakest.upstream_vendor } : {}), signals,
    },
  };
}
