import type { CapabilityInput, CapabilityResult } from "../../capabilities/index.js";
import { classifyUpstreamMessage, weakestSignal, type ComposeDeps } from "../company-status/compose.js";
import { getRoute } from "../company-status/routing.js";
import { COMPANY_STATUSES } from "../company-status/normalise.js";
import { InvoiceCheckError, parseInvoiceInput, registryIdFromTaxId } from "./input.js";
import { compareCompanyNames, decodeViesText, legalFormDiffers, sanitiseSourceName } from "./name.js";

import { isCapabilityRefusal } from "../capability-refusal.js";
import { logWarn } from "../log.js";

type CheckName = "tax_id" | "registry_status" | "sanctions" | "name_match";
interface Check extends Record<string, unknown> {
  status: "completed" | "not_available" | "error";
  source: string;
  reason?: string;
}
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const name = (v: unknown): string | undefined =>
  typeof v === "string" && /[\p{L}\p{N}]/u.test(sanitiseSourceName(v)) ? sanitiseSourceName(v) : undefined;

/** No wallet calls, guardedExecute, breaker mutations, LLMs or name searches. */
export async function runInvoiceCounterpartyCheck(input: CapabilityInput, deps: ComposeDeps): Promise<CapabilityResult> {
  const parsed = parseInvoiceInput(input); // Complete validation before looking up even one executor.
  const fetchedAt = deps.now().toISOString();
  const checks: Partial<Record<CheckName, Check>> = Object.fromEntries(
    ["tax_id", "registry_status", "sanctions", ...(parsed.companyName ? ["name_match"] : [])]
      .map(key => [key, { status: "not_available", source: key, reason: "Not attempted because an earlier required check has not completed." }]),
  );
  const summary = () => {
    const entries = Object.entries(checks);
    return {
      checks_completed: entries.filter(([, c]) => c.status === "completed").map(([key]) => key),
      checks_not_available: entries.filter(([, c]) => c.status === "not_available").map(([key]) => key),
      checks_errored: entries.filter(([, c]) => c.status === "error").map(([key]) => key),
    };
  };
  const signals: Array<{ check: CheckName; capability_slug: string; provenance: CapabilityResult["provenance"] }> = [];
  const findings: string[] = [];
  const incomplete = (check: CheckName): never => {
    throw new InvoiceCheckError("execution_failed", `${check} check did not complete. No result is billed. Retry when the source is available, or supply a company name if none was returned.`, { check, checks, ...summary(), findings });
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
    } catch (err) {
      const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
      // company-status wraps the shared classifier's not-found replies in a refusal.
      // Do not mistake validation or access-policy refusals for a missing company.
      const notFound = check === "registry_status" && (classifyUpstreamMessage(message) === "not_found"
        || (isCapabilityRefusal(err) && /^[^\n]+ has no record that was found for this [A-Z]{2} identifier \(not found\):/.test(message)));
      if (notFound) {
        const r: CapabilityResult = { output: { found: false }, provenance: {
          source: slug, fetched_at: deps.now().toISOString(), acquisition_method: "unknown", data_access_lane: "allowed_with_checks", data_access_checks: "pending",
        } };
        signals.push({ check, capability_slug: slug, provenance: r.provenance });
        return r;
      }
      // Classify, never log arbitrary upstream text: it can contain input, HTML or credentials.
      const cause = err instanceof Error && ["AbortError", "TimeoutError"].includes(err.name) || /\b(?:timeout|timed out)\b/i.test(message)
        ? "timeout" : /\bHTTP 50[0-9]\b/i.test(message) ? "upstream_unavailable"
        : /\bHTTP (?:401|403)\b/i.test(message) ? "upstream_access_denied"
        : /\bHTTP 429\b/i.test(message) ? "upstream_rate_limited"
        : message === "Incomplete evidence" ? "incomplete_evidence"
        : isCapabilityRefusal(err) ? "capability_refusal" : "upstream_failure";
      logWarn("invoice-counterparty-lookup-failed", "Underlying counterparty lookup failed.", { check, capability_slug: slug, cause });
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
  const viesName = parsed.euVat && tax.valid === true && typeof tax.company_name === "string" ? name(tax.company_name) : undefined;
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
  const identifiers = {
    ...(derived && parsed.companyId ? { company_id_matches_tax_id:
      (parsed.registryId ?? parsed.companyId.replace(/[ .()-]/g, "")) === (route?.normalise_identifier(derived) ?? derived.replace(/[ .()-]/g, "")) } : {}),
  };
  if (identifiers.company_id_matches_tax_id === false) findings.push("The registry number on the invoice does not match the registry number derived from the VAT number");
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
      if (out.found === false) {
        checks.registry_status = {
          status: "completed", source: registryResult.provenance.source, found: false,
          identifier: registryId, identifier_source: parsed.companyId ? "company_id" : "tax_id_mapping",
          checked_at: registryResult.provenance.fetched_at,
        };
        findings.push("The registry returned no record for this identifier");
      } else if (!COMPANY_STATUSES.includes(out.status as typeof COMPANY_STATUSES[number]) || !out.insolvency || typeof out.insolvency !== "object") {
        malformed("registry_status", registryResult.provenance.source);
      } else {
        registeredName = name(out.company_name);
        checks.registry_status = {
          status: "completed", source: registryResult.provenance.source, found: true,
          company_status: out.status, registry_status_raw: out.registry_status_raw ?? null,
          registered_name: registeredName ?? null, identifier: registryId,
          identifier_source: parsed.companyId ? "company_id" : "tax_id_mapping",
          registry: out.registry, insolvency: out.insolvency, checked_at: out.as_of ?? registryResult.provenance.fetched_at,
        };
        findings.push(`The registry reports the company status as ${String(out.status).replace(/_/g, " ")}.`);
      }
    }
  }
  if (checks.registry_status?.status !== "completed") findings.push("The registry lookup did not complete.");
  const namesDiffer = registeredName && viesName && compareCompanyNames(viesName, registeredName) === "different";
  if (namesDiffer) findings.push("The VIES name differs from the registry name.");
  if (registeredName && viesName && legalFormDiffers(viesName, registeredName)) findings.push("The legal form in the VIES name differs from the registry name.");
  const screenedName = registeredName ?? viesName ?? parsed.companyName;
  const nameSource = registeredName ? "registry_status" : viesName ? "tax_id" : "company_name";
  if (!screenedName) {
    checks.sanctions = { status: "not_available", source: "sanctions-check", reason: "No registered or invoice company name is available. Supply company_name." };
    incomplete("sanctions");
  }
  const requiredNames = [{ screened_name: screenedName, name_source: nameSource },
    ...(namesDiffer ? [{ screened_name: viesName!, name_source: "tax_id" }] : [])];
  const screenings: Check[] = [];
  for (const target of requiredNames) {
    const sanctionsResult = await call("sanctions", "sanctions-check", { name: target.screened_name, entity_type: "company", country: parsed.country });
    if (!sanctionsResult) {
      checks.sanctions!.screenings = screenings;
      return incomplete("sanctions");
    }
    const screening = sanctionsResult.output;
    const matches = Array.isArray(screening.matches) ? screening.matches.map(record) : undefined;
    // Retain the full count and disclose the upstream ten-match cap. A string
    // match name, even a short or entirely invisible one, must not hide a hit.
    if (!Number.isInteger(screening.match_count) || (screening.match_count as number) < 0 || !matches
      || matches.length !== Math.min(screening.match_count as number, 10)
      || matches.some(m => typeof m.name !== "string" || !Array.isArray(m.datasets) || m.datasets.length === 0 || m.datasets.some(d => typeof d !== "string"))
      || !screening.lists_queried || typeof screening.lists_queried !== "object" || Array.isArray(screening.lists_queried) || !screening.queried_at) {
      malformed("sanctions", sanctionsResult.provenance.source);
      checks.sanctions!.screenings = screenings;
      incomplete("sanctions");
    }
    screenings.push({
      status: "completed", source: sanctionsResult.provenance.source, ...target,
      potential_match_count: screening.match_count,
      matches: matches!.map(m => ({ name: sanitiseSourceName(m.name as string), entity_id: m.entity_id, datasets: m.datasets,
        countries: m.countries, sanction_details: m.sanction_details, last_updated_at: m.last_updated_at })),
      matches_truncated: matches!.length < (screening.match_count as number),
      lists_queried: screening.lists_queried, checked_at: screening.queried_at,
    });
  }
  checks.sanctions = {
    ...screenings[0], screenings,
    potential_match_count: screenings.reduce((sum, s) => sum + (s.potential_match_count as number), 0),
    matches: screenings.flatMap(s => s.matches as unknown[]),
    matches_truncated: screenings.some(s => s.matches_truncated),
  };
  findings.push(`Sanctions screening checks found ${checks.sanctions.potential_match_count} potential matches.`);

  if (parsed.companyName) {
    const registered = registeredName ?? viesName;
    checks.name_match = registered ? {
      status: "completed", source: "deterministic string comparison",
      match: compareCompanyNames(parsed.companyName, registered),
      legal_form_differs: legalFormDiffers(parsed.companyName, registered),
      invoice_name: parsed.companyName, registered_name: registered,
    } : { status: "not_available", source: "deterministic string comparison", reason: "No registered name was returned; the invoice name cannot be compared." };
    if (checks.name_match.legal_form_differs) findings.push("The legal form on the invoice differs from the registered name.");
    if (checks.name_match.match === "different") findings.push("The name on the invoice differs from the registered name.");
  }
  const weakest = weakestSignal(signals.map(s => {
    const p = s.provenance;
    const str = (v: unknown): string | null => typeof v === "string" && v ? v : null;
    return { role: "registry" as const, capability_slug: s.capability_slug,
      source: p.source, fetched_at: p.fetched_at, acquisition_method: str(p.acquisition_method),
      data_access_lane: str(p.data_access_lane), data_access_checks: str(p.data_access_checks), upstream_vendor: str(p.upstream_vendor) };
  }));
  return {
    output: { ...checks, identifiers, ...summary(), findings },
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
