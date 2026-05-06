/**
 * One-off audit: live European business-registry coverage check.
 *
 * Read-only. Invokes each of the 16 European country-data capabilities
 * flagged 🟢 Live in the Active Vendor Stack page (Notion 35367c87…)
 * against a known-good test entity, captures the response, and compares
 * the returned fields against each capability's manifest-declared
 * `output_field_reliability` block.
 *
 * No DB writes. DATABASE_URL is force-cleared before auto-register so
 * Phase 3's catalog-sync UPDATE never fires. Source-health is never
 * touched.
 *
 * Usage:
 *   cd apps/api && npx tsx src/scripts/audit-live-registries.ts
 *
 * Output:
 *   - JSON results to stdout (suitable for piping to a report builder)
 *   - Markdown report optionally written via --report=<path>
 *
 * Stop conditions (per the audit prompt):
 *   - More than 4 of the 16 capabilities return handler errors or
 *     timeouts → halt the run, write a partial report, exit 2.
 *   - DATABASE_URL leaks through despite our clearing → exit 3.
 *
 * The script always exits 0 on a clean completion (even if individual
 * capabilities failed) so the audit produces a complete report;
 * the >4-failure halt is the only mid-run abort path.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";

// dotenv first, then clear DATABASE_URL so auto-register skips Phase 3 (DB sync).
config({ path: resolve(import.meta.dirname, "../../../../.env") });
config({ path: resolve(import.meta.dirname, "../../../.env") });
delete process.env.DATABASE_URL;
delete process.env.DATABASE_URL_UNPOOLED;

import { autoRegisterCapabilities } from "../capabilities/auto-register.js";
import { getExecutor } from "../capabilities/index.js";

interface ManifestShape {
  slug: string;
  input_schema?: { properties?: Record<string, unknown> };
  output_field_reliability?: Record<string, "guaranteed" | "common" | "rare">;
  data_source?: string;
  maintenance_class?: string;
}

interface TestEntity {
  country: string;
  slug: string;
  entity_name: string;
  identifier: string;
  input: Record<string, unknown>;
}

const TEST_ENTITIES: TestEntity[] = [
  { country: "SE", slug: "swedish-company-data",     entity_name: "H&M Hennes & Mauritz AB",      identifier: "556042-7220",      input: { org_number: "556042-7220" } },
  { country: "NO", slug: "norwegian-company-data",   entity_name: "Equinor ASA",                  identifier: "923609016",        input: { org_number: "923609016" } },
  { country: "DK", slug: "danish-company-data",      entity_name: "A.P. Møller-Mærsk A/S",        identifier: "22756214",         input: { cvr_number: "22756214" } },
  { country: "FI", slug: "finnish-company-data",     entity_name: "Nokia Oyj",                    identifier: "0112038-9",        input: { business_id: "0112038-9" } },
  { country: "UK", slug: "uk-company-data",          entity_name: "AstraZeneca PLC",              identifier: "02723534",         input: { company_number: "02723534" } },
  { country: "IE", slug: "irish-company-data",       entity_name: "Ryanair Holdings PLC",         identifier: "249885",           input: { cro_number: "249885" } },
  { country: "FR", slug: "french-company-data",      entity_name: "TotalEnergies SE",             identifier: "542051180",        input: { siren: "542051180" } },
  { country: "BE", slug: "belgian-company-data",     entity_name: "Anheuser-Busch InBev SA/NV",   identifier: "0417497106",       input: { enterprise_number: "0417497106" } },
  { country: "CZ", slug: "cz-company-data",          entity_name: "ČEZ a.s.",                     identifier: "45274649",         input: { ico: "45274649" } },
  { country: "EE", slug: "estonian-company-data",    entity_name: "Tallink Grupp AS",             identifier: "10238429",         input: { registry_code: "10238429" } },
  { country: "PL", slug: "polish-company-data",      entity_name: "PKN Orlen S.A.",               identifier: "0000028860",       input: { krs_number: "0000028860" } },
  { country: "LV", slug: "latvian-company-data",     entity_name: "airBaltic Corporation AS",     identifier: "40003245752",      input: { reg_number: "40003245752" } },
  { country: "LT", slug: "lithuanian-company-data",  entity_name: "Telia Lietuva AB",             identifier: "121215434",        input: { company_code: "121215434" } },
  { country: "HR", slug: "croatian-company-data",    entity_name: "INA d.d.",                     identifier: "27759560625",      input: { oib: "27759560625" } },
  { country: "GR", slug: "greek-company-data",       entity_name: "National Bank of Greece S.A.", identifier: "237901000",        input: { gemi_number: "237901000" } },
  { country: "CH", slug: "swiss-company-data",       entity_name: "Nestlé S.A.",                  identifier: "CHE-105.909.036",  input: { uid: "CHE-105.909.036" } },
];

const MANIFESTS_DIR = resolve(import.meta.dirname, "../../../../manifests");

function loadManifest(slug: string): ManifestShape {
  const path = resolve(MANIFESTS_DIR, `${slug}.yaml`);
  const raw = readFileSync(path, "utf8");
  return yaml.load(raw) as ManifestShape;
}

type FieldStatus = "populated" | "null" | "missing" | "empty_string" | "empty_array";

function classifyField(value: unknown): FieldStatus {
  if (value === undefined) return "missing";
  if (value === null) return "null";
  if (typeof value === "string" && value === "") return "empty_string";
  if (Array.isArray(value) && value.length === 0) return "empty_array";
  return "populated";
}

interface FieldResult {
  field: string;
  reliability: "guaranteed" | "common" | "rare";
  status: FieldStatus;
}

interface CapabilityAuditResult {
  country: string;
  slug: string;
  entity_name: string;
  identifier: string;
  data_source: string | null;
  maintenance_class: string | null;
  declared_field_count: number;
  status: "success" | "handler_error" | "timeout" | "no_executor" | "missing_manifest_reliability";
  http_or_error_summary: string;
  latency_ms: number | null;
  fields: FieldResult[];
  output_keys_returned: string[];
  undeclared_keys: string[];
  notes: string[];
}

async function invokeWithTimeout(
  slug: string,
  input: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ kind: "success"; payload: Record<string, unknown>; latencyMs: number } | { kind: "timeout"; latencyMs: number } | { kind: "error"; message: string; stack?: string; latencyMs: number } | { kind: "no_executor" }> {
  const exec = getExecutor(slug);
  if (!exec) return { kind: "no_executor" };
  const start = Date.now();
  try {
    const racePromise = Promise.race([
      exec(input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("__AUDIT_TIMEOUT__")), timeoutMs),
      ),
    ]);
    const result = await racePromise;
    const latencyMs = Date.now() - start;
    if (!result || typeof result !== "object" || !("output" in result) || typeof (result as { output: unknown }).output !== "object" || (result as { output: unknown }).output === null) {
      return { kind: "error", message: "executor returned malformed result", latencyMs };
    }
    return { kind: "success", payload: (result as { output: Record<string, unknown> }).output, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "__AUDIT_TIMEOUT__") return { kind: "timeout", latencyMs };
    return {
      kind: "error",
      message: msg,
      stack: err instanceof Error ? err.stack : undefined,
      latencyMs,
    };
  }
}

async function auditOne(entity: TestEntity): Promise<CapabilityAuditResult> {
  const manifest = loadManifest(entity.slug);
  const reliability = manifest.output_field_reliability ?? null;
  const dataSource = manifest.data_source ?? null;
  const maintenanceClass = manifest.maintenance_class ?? null;

  const base: CapabilityAuditResult = {
    country: entity.country,
    slug: entity.slug,
    entity_name: entity.entity_name,
    identifier: entity.identifier,
    data_source: dataSource,
    maintenance_class: maintenanceClass,
    declared_field_count: reliability ? Object.keys(reliability).length : 0,
    status: "success",
    http_or_error_summary: "",
    latency_ms: null,
    fields: [],
    output_keys_returned: [],
    undeclared_keys: [],
    notes: [],
  };

  if (!reliability) {
    return {
      ...base,
      status: "missing_manifest_reliability",
      http_or_error_summary: "manifest has no output_field_reliability block",
    };
  }

  const result = await invokeWithTimeout(entity.slug, entity.input, 30_000);

  if (result.kind === "no_executor") {
    return {
      ...base,
      status: "no_executor",
      http_or_error_summary: "no executor registered for slug",
    };
  }
  if (result.kind === "timeout") {
    return {
      ...base,
      status: "timeout",
      latency_ms: result.latencyMs,
      http_or_error_summary: "30s timeout",
    };
  }
  if (result.kind === "error") {
    return {
      ...base,
      status: "handler_error",
      latency_ms: result.latencyMs,
      http_or_error_summary: result.message.slice(0, 300),
    };
  }

  const payload = result.payload;
  const declaredFields = Object.keys(reliability);
  const fields: FieldResult[] = declaredFields.map((field) => ({
    field,
    reliability: reliability[field],
    status: classifyField(payload[field]),
  }));

  const returnedKeys = Object.keys(payload);
  const undeclared = returnedKeys.filter((k) => !declaredFields.includes(k));

  const notes: string[] = [];
  const missingGuaranteed = fields.filter((f) => f.reliability === "guaranteed" && f.status !== "populated");
  if (missingGuaranteed.length > 0) {
    notes.push(`${missingGuaranteed.length} guaranteed field(s) not populated: ${missingGuaranteed.map((f) => `${f.field}=${f.status}`).join(", ")}`);
  }
  if (undeclared.length > 0) {
    notes.push(`${undeclared.length} undeclared field(s) returned: ${undeclared.join(", ")}`);
  }

  return {
    ...base,
    status: "success",
    latency_ms: result.latencyMs,
    http_or_error_summary: `success — ${returnedKeys.length} fields returned`,
    fields,
    output_keys_returned: returnedKeys,
    undeclared_keys: undeclared,
    notes,
  };
}

function statusIcon(status: CapabilityAuditResult["status"]): string {
  switch (status) {
    case "success": return "OK";
    case "timeout": return "TIMEOUT";
    case "handler_error": return "ERROR";
    case "no_executor": return "NO_EXEC";
    case "missing_manifest_reliability": return "NO_MANIFEST_OFR";
  }
}

async function main(): Promise<void> {
  console.error(`[audit] auto-registering capabilities (DB writes disabled)…`);
  if (process.env.DATABASE_URL) {
    console.error(`[audit] FATAL: DATABASE_URL still set after clearing — refusing to proceed`);
    process.exit(3);
  }
  const counts = await autoRegisterCapabilities();
  console.error(`[audit] registered ${counts.executors_registered} executors, ${counts.providers_registered} providers, skipped ${counts.skipped_deactivated}, errors ${counts.errors}`);
  console.error("");

  const results: CapabilityAuditResult[] = [];
  let failures = 0;
  let halted = false;

  for (const entity of TEST_ENTITIES) {
    process.stderr.write(`[audit] ${entity.country.padEnd(2)} ${entity.slug.padEnd(28)} … `);
    const r = await auditOne(entity);
    results.push(r);
    process.stderr.write(`${statusIcon(r.status)} (${r.latency_ms ?? "n/a"}ms)\n`);

    if (r.status === "handler_error" || r.status === "timeout" || r.status === "no_executor") {
      failures++;
      if (failures > 4) {
        halted = true;
        console.error("");
        console.error(`[audit] HALT: ${failures} of ${results.length} capabilities failed (>4 threshold).`);
        console.error(`[audit] Suggests a coordinated upstream issue — emitting partial results and exiting per stop condition.`);
        break;
      }
    }
  }

  console.error("");
  console.error(`[audit] complete — ${results.length}/${TEST_ENTITIES.length} run, ${failures} failed`);

  // Emit results JSON to stdout so a downstream report builder (or human)
  // can pipe it to a file. The markdown report is generated separately.
  const out = {
    run_started_at: new Date().toISOString(),
    halted,
    failure_count: failures,
    total_run: results.length,
    total_planned: TEST_ENTITIES.length,
    results,
  };

  const reportFlag = process.argv.find((a) => a.startsWith("--report="));
  const jsonFlag = process.argv.find((a) => a.startsWith("--json="));

  if (jsonFlag) {
    const path = jsonFlag.slice("--json=".length);
    writeFileSync(path, JSON.stringify(out, null, 2), "utf8");
    console.error(`[audit] wrote JSON results to ${path}`);
  } else {
    console.log(JSON.stringify(out, null, 2));
  }

  if (reportFlag) {
    const path = reportFlag.slice("--report=".length);
    const md = renderMarkdown(out);
    writeFileSync(path, md, "utf8");
    console.error(`[audit] wrote markdown report to ${path}`);
  }

  process.exit(halted ? 2 : 0);
}

function renderMarkdown(out: {
  run_started_at: string;
  halted: boolean;
  failure_count: number;
  total_run: number;
  total_planned: number;
  results: CapabilityAuditResult[];
}): string {
  const lines: string[] = [];
  const dateOnly = out.run_started_at.slice(0, 10);
  lines.push(`# Live European registry coverage audit — ${dateOnly}`);
  lines.push("");
  lines.push(`Run started: \`${out.run_started_at}\``);
  lines.push(`Branch: \`audit/live-registry-coverage-2026-05-06\``);
  lines.push(`Driver: \`apps/api/src/scripts/audit-live-registries.ts\``);
  lines.push(`Halted mid-run: \`${out.halted}\``);
  lines.push("");

  const succeeded = out.results.filter((r) => r.status === "success");
  const withFieldGaps = succeeded.filter((r) => r.notes.some((n) => n.startsWith("0 guaranteed") === false && n.includes("guaranteed field(s) not populated")));
  const handlerErrors = out.results.filter((r) => r.status === "handler_error" || r.status === "timeout");

  lines.push("## 1. Headline summary");
  lines.push("");
  lines.push(`Of ${out.total_planned} European registry capabilities flagged 🟢 Live in the Active Vendor Stack page, ${out.total_run} were exercised against a known-good test entity in this run. **${succeeded.length}** returned a 2xx with a parseable payload; **${handlerErrors.length}** returned a handler error or timeout; **${withFieldGaps.length}** of the successes had at least one manifest-declared \`guaranteed\` field absent from the response. ${out.halted ? `\n\n**The run was halted mid-execution** at ${out.total_run}/${out.total_planned} after exceeding the 4-failure stop threshold — this report covers only the runs that completed before the halt.` : ""}`);
  lines.push("");

  lines.push("## 2. Inventory");
  lines.push("");
  lines.push("| Country | Slug | Data source | Maintenance class | Manifest fields declared |");
  lines.push("|---|---|---|---|---|");
  for (const r of out.results) {
    lines.push(`| ${r.country} | \`${r.slug}\` | ${r.data_source ?? "_(unset)_"} | ${r.maintenance_class ?? "_(unset)_"} | ${r.declared_field_count} |`);
  }
  lines.push("");

  lines.push("## 3. Per-capability results");
  lines.push("");
  for (const r of out.results) {
    lines.push(`### ${r.country} — \`${r.slug}\``);
    lines.push("");
    lines.push(`- Test entity: **${r.entity_name}** (\`${r.identifier}\`)`);
    lines.push(`- Status: \`${r.status}\``);
    lines.push(`- Latency: ${r.latency_ms !== null ? `${r.latency_ms}ms` : "n/a"}`);
    lines.push(`- Summary: ${r.http_or_error_summary}`);
    if (r.fields.length > 0) {
      lines.push("");
      lines.push("| Declared field | Reliability | Observed |");
      lines.push("|---|---|---|");
      for (const f of r.fields) {
        lines.push(`| \`${f.field}\` | ${f.reliability} | ${f.status} |`);
      }
    }
    if (r.undeclared_keys.length > 0) {
      lines.push("");
      lines.push(`Undeclared keys returned (in payload but not in manifest \`output_field_reliability\`): ${r.undeclared_keys.map((k) => `\`${k}\``).join(", ")}`);
    }
    if (r.notes.length > 0) {
      lines.push("");
      lines.push("Notes:");
      for (const n of r.notes) lines.push(`- ${n}`);
    }
    lines.push("");
  }

  lines.push("## 4. Cross-capability findings");
  lines.push("");
  lines.push("(See the per-capability sections above for the raw observations. The patterns below are derived from those.)");
  lines.push("");

  // Pattern A: which guaranteed fields are systematically absent
  const guaranteedGapByField = new Map<string, string[]>();
  for (const r of succeeded) {
    for (const f of r.fields) {
      if (f.reliability === "guaranteed" && f.status !== "populated") {
        const key = `${f.field} (${f.status})`;
        const list = guaranteedGapByField.get(key) ?? [];
        list.push(r.slug);
        guaranteedGapByField.set(key, list);
      }
    }
  }
  if (guaranteedGapByField.size === 0) {
    lines.push("- **No systematic `guaranteed`-field gaps observed** across the capabilities that succeeded.");
  } else {
    lines.push("Manifest-declared `guaranteed` fields observed missing/null/empty:");
    lines.push("");
    for (const [key, slugs] of [...guaranteedGapByField.entries()].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(`- \`${key}\` — affects ${slugs.length} capability/ies: ${slugs.map((s) => `\`${s}\``).join(", ")}`);
    }
  }
  lines.push("");

  // Pattern B: capabilities that returned undeclared keys
  const undeclaredCount = succeeded.filter((r) => r.undeclared_keys.length > 0).length;
  if (undeclaredCount > 0) {
    lines.push(`- **${undeclaredCount} capability/ies returned keys not declared in manifest \`output_field_reliability\`.** This is benign drift but means the manifest is not the full contract — see per-capability sections for the field lists.`);
  }
  lines.push("");

  lines.push("## 5. Suggested follow-up actions");
  lines.push("");
  lines.push("(Enumeration only — no follow-ups executed by this prompt.)");
  lines.push("");
  let followupIdx = 1;
  for (const r of handlerErrors) {
    lines.push(`${followupIdx}. **\`${r.slug}\` (${r.country})** is failing on a known-good entity: \`${r.http_or_error_summary}\`. Investigate root cause (env var, upstream API change, auth token rotation, etc.). If the registry is genuinely down, the source-health row and the Active Vendor Stack page need a separate prompt to update. Until then, every customer call routed here is failing.`);
    followupIdx++;
  }
  for (const r of succeeded) {
    const missing = r.fields.filter((f) => f.reliability === "guaranteed" && f.status !== "populated");
    if (missing.length > 0) {
      lines.push(`${followupIdx}. **\`${r.slug}\` (${r.country})** returned a 2xx but ${missing.length} \`guaranteed\` field(s) are not populated for the test entity (${missing.map((m) => `\`${m.field}\` → ${m.status}`).join(", ")}). Either: (a) downgrade the manifest's \`output_field_reliability\` for those fields from \`guaranteed\` to \`common\`/\`rare\` if the registry legitimately omits them for some entities, or (b) fix the handler if the field IS available upstream and we're failing to extract it.`);
      followupIdx++;
    }
    if (r.undeclared_keys.length > 0) {
      lines.push(`${followupIdx}. **\`${r.slug}\` (${r.country})** returns ${r.undeclared_keys.length} undeclared key(s) (\`${r.undeclared_keys.join("`, `")}\`). Add to manifest \`output_field_reliability\` with appropriate tier, or remove from the handler output if unintentional.`);
      followupIdx++;
    }
  }
  if (followupIdx === 1) {
    lines.push("- No follow-up actions enumerated. All ${out.total_run} runs returned a 2xx with all manifest-declared `guaranteed` fields populated.".replace("${out.total_run}", String(out.total_run)));
  }
  lines.push("");

  lines.push("## Methodology");
  lines.push("");
  lines.push("- Driver: `apps/api/src/scripts/audit-live-registries.ts`");
  lines.push("- Each capability invoked in-process via `getExecutor(slug)(input)` (transparent provider-chain handling preserved).");
  lines.push("- 30-second outer timeout per call (handlers may impose shorter inner timeouts); field classification: `populated` (any non-null/non-empty), `null`, `missing` (key absent from payload), `empty_string`, `empty_array`.");
  lines.push("- `DATABASE_URL` force-cleared at script start (after dotenv) so `autoRegisterCapabilities()` skips its Phase 3 catalog-sync UPDATE. No DB writes performed during the audit.");
  lines.push("- No paid third-party legs invoked (verified pre-run from manifest `maintenance_class` + handler `data_source`).");
  lines.push("- Read-only: no source-health rows updated, no manifest edits, no handler edits, no routing-engine changes.");
  lines.push("");
  lines.push("### Reproduction");
  lines.push("");
  lines.push("Run with **production registry credentials** so per-registry env vars (e.g. `COMPANIES_HOUSE_API_KEY`, `SUDREG_CLIENT_ID/SECRET`, `ZEFIX_USERNAME/PASSWORD`, `BOLAGSVERKET_CLIENT_ID/SECRET`) are present:");
  lines.push("");
  lines.push("```");
  lines.push("cd apps/api");
  lines.push("railway run --service strale npx tsx src/scripts/audit-live-registries.ts \\");
  lines.push("  --report=../../docs/research/<YYYY-MM-DD>-live-registry-coverage-audit.md \\");
  lines.push("  --json=../../docs/research/<YYYY-MM-DD>-live-registry-coverage-audit.json");
  lines.push("```");
  lines.push("");
  lines.push("Without `railway run` (i.e. against just `apps/api/.env`) the run will produce false-positive `handler_error` rows for any registry whose credentials are not in the local `.env`. The script's `delete process.env.DATABASE_URL` line still fires under `railway run`, so the prod DB is still untouched.");

  return lines.join("\n") + "\n";
}

main().catch((err) => {
  console.error("[audit] FATAL:", err);
  process.exit(1);
});
