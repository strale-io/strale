/**
 * Compare a model role's current entry with its candidate on real inputs,
 * before the candidate is promoted (models.ts MODEL_CANDIDATES).
 *
 * For every capability that reaches the role and has a manifest, it runs the
 * manifest's known_answer input (or health_check_input) on the current model
 * and on the candidate, through the real executor and the real client
 * wrapper, so the candidate's request settings apply. Per run it records:
 * success, the manifest's enforced known-answer checks, the guaranteed-field
 * sentinel, whether the model under test was actually called, latency and
 * metered cost.
 *
 * Spends real money on the Anthropic API (about EUR 0.01 per Haiku 4.5 call)
 * and needs ANTHROPIC_API_KEY. By default it skips capabilities whose input is
 * a URL or domain, or whose code calls a paid vendor (Browserless, Serper,
 * Dilisense and the other metered vendors), so only Anthropic is paid for;
 * --include-paid adds them. Some executors read the database the repo-root
 * .env names (SELECT only); use a .env that points at a local or read-only
 * database. "Active" means not on the DEACTIVATED list in auto-register.ts,
 * not the database's is_active flag.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/compare-models.ts --role capability_default --list --out /tmp/plan.json   (no calls, no key)
 *   npx tsx scripts/compare-models.ts --role capability_default --repeat 2 --out /tmp/compare.json
 *   npx tsx scripts/compare-models.ts --role capability_default --slugs summarize,translate
 * Then record the result:
 *   npm run receipt -- --kind audit --topic model-compare-capability-default --from /tmp/compare.json
 *
 * Output: {ok, failures[], warnings[], ...counts, results[]} (the repo's
 * check --json shape). A run counts only when the model under test was
 * called on both sides. `failures` are regressions: the candidate fails where
 * the current model passes, other than on a transient API error (429, 5xx,
 * overload, timeout), which is inconclusive. `ok` needs at least one
 * exercised comparison, no regression, and the candidate passing at least as
 * often as the current model.
 */
import { config } from "dotenv";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import yaml from "js-yaml";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { MODELS, MODEL_PRICES, MODEL_CANDIDATES, type ModelEntry, type ModelRole, type TokenPrice } from "../src/lib/models.js";
import { getDirectExecutor } from "../src/capabilities/index.js";
import { getDeactivatedCapabilities } from "../src/capabilities/auto-register.js";
import { withCallCost, snapshotCallCost } from "../src/lib/call-cost.js";
import { EUR_USD_RATE } from "../src/lib/currency.js";
import { checkGuaranteedFieldsPresent } from "../src/lib/guaranteed-fields-sentinel.js";
import { expectedFieldsToChecks, isCheckEnforced, runKnownAnswerCheck } from "../src/lib/known-answer-checks.js";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const role = (arg("role") ?? "capability_default") as ModelRole;
const out = arg("out");
const onlySlugs = arg("slugs")?.split(",").map((s) => s.trim()).filter(Boolean);
const includePaid = process.argv.includes("--include-paid");
const listOnly = process.argv.includes("--list");
const repeat = Math.max(1, Number(arg("repeat") ?? 1) || 1);

const apiRoot = resolve(import.meta.dirname, "..");
const capabilitiesDir = join(apiRoot, "src/capabilities");
const manifestsDir = resolve(apiRoot, "../../manifests");

/** Shared helpers that call the role on a capability's behalf. */
const ROLE_HELPERS = ["extractJsonWithLlm", "extractCompanyName", "extractCompanyFromText", "resolveName"];
/** Code that spends money with a vendor other than Anthropic. */
const PAID_VENDOR = /fetchRenderedHtml|browserless|BROWSERLESS|meteredVendorFetch|SERPER_API_KEY|DILISENSE_API_KEY|openapi-resolver|COBALT|SEC_API|EINSEARCH/;

interface Manifest {
  output_field_reliability?: Record<string, string>;
  test_fixtures?: {
    known_answer?: KnownAnswer | KnownAnswer[];
    health_check_input?: Record<string, unknown>;
  };
}
interface KnownAnswer { input?: Record<string, unknown>; expected_fields?: Parameters<typeof expectedFieldsToChecks>[0] }
interface Side { entry: ModelEntry; price: TokenPrice }
type Verdict = "pass" | "fail" | "api_error" | "not_exercised";
interface Run {
  model: string;
  verdict: Verdict;
  error?: string;
  checks_failed: string[];
  ms: number;
  cost_cents: number | null;
  vendors: string[];
  output?: unknown;
}

/** Put a side's entry and price into the live registry objects the executors and cost meter read. */
function use(side: Side): void {
  const entry = MODELS[role] as unknown as Record<string, unknown>;
  for (const key of Object.keys(entry)) delete entry[key];
  Object.assign(entry, structuredClone(side.entry));
  const price = MODEL_PRICES[role] as unknown as Record<string, unknown>;
  for (const key of Object.keys(price)) delete price[key];
  Object.assign(price, structuredClone(side.price));
}

function fetchesAPage(input: Record<string, unknown>): boolean {
  return Object.entries(input).some(
    ([key, value]) => /(^|_)(url|domain\d*|website|site|repo)(_|$)/i.test(key)
      || (typeof value === "string" && /^(https?:\/\/|www\.)/i.test(value.trim())),
  );
}

/** A transient API failure says nothing about the model's answers. */
function isTransientApiError(message: string): boolean {
  return /\b(429|500|502|503|504|529)\b|overloaded|rate.?limit|timed? ?out|ECONNRESET|ETIMEDOUT|fetch failed/i.test(message);
}

/** Capability-level caches (ResultCache) would serve the second side the first side's answer. */
function clearCaches(module: Record<string, unknown>): void {
  for (const value of Object.values(module)) {
    if (value && typeof (value as { clear?: unknown }).clear === "function") (value as { clear: () => void }).clear();
  }
}

async function runOnce(slug: string, input: Record<string, unknown>, known: KnownAnswer | undefined, manifest: Manifest, model: string): Promise<Run> {
  const executor = getDirectExecutor(slug)!;
  const started = Date.now();
  return withCallCost(async () => {
    const finish = (run: Omit<Run, "ms" | "cost_cents" | "vendors">): Run => {
      const snapshot = snapshotCallCost();
      const breakdown = snapshot.cost_breakdown as { llm?: Array<{ model: string }>; vendors?: Array<{ provider: string }> };
      const calledModel = (breakdown.llm ?? []).some((item) => item.model === model);
      const verdict: Verdict = run.verdict === "api_error" ? "api_error" : calledModel ? run.verdict : "not_exercised";
      return {
        ...run,
        verdict,
        ms: Date.now() - started,
        cost_cents: snapshot.cost_cents === null ? null : Number(snapshot.cost_cents),
        vendors: (breakdown.vendors ?? []).map((v) => v.provider),
      };
    };
    try {
      const result = await executor(structuredClone(input));
      const output = result.output as Record<string, unknown>;
      const failed: string[] = [];
      const sentinel = checkGuaranteedFieldsPresent(output, manifest.output_field_reliability);
      if (!sentinel.passed) failed.push(sentinel.failureReason ?? "guaranteed_field_missing");
      for (const check of expectedFieldsToChecks(known?.expected_fields ?? [])) {
        if (!isCheckEnforced(check, manifest.output_field_reliability)) continue;
        const r = runKnownAnswerCheck(check, output);
        if (!r.passed) failed.push(r.reason);
      }
      return finish({ model, verdict: failed.length === 0 ? "pass" : "fail", checks_failed: failed, output });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 300) : String(error);
      return finish({ model, verdict: isTransientApiError(message) ? "api_error" : "fail", error: message, checks_failed: [] });
    }
  }, EUR_USD_RATE);
}

async function main() {
  const candidate = MODEL_CANDIDATES[role];
  if (!candidate) throw new Error(`No candidate for role ${role} in MODEL_CANDIDATES (models.ts).`);
  const current: Side = { entry: structuredClone(MODELS[role]) as ModelEntry, price: structuredClone(MODEL_PRICES[role]) };
  const proposed: Side = { entry: candidate.entry, price: candidate.price };

  const markers = [`MODELS.${role}`, ...(role === "capability_default" ? ROLE_HELPERS : [])];
  const slugs = readdirSync(capabilitiesDir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .filter((f) => {
      const src = readFileSync(join(capabilitiesDir, f), "utf8");
      return markers.some((marker) => src.includes(marker));
    })
    .map((f) => f.replace(/\.ts$/, ""))
    .filter((slug) => !onlySlugs || onlySlugs.includes(slug));

  const skipped: Array<{ slug: string; reason: string }> = [];
  const plan: Array<{ slug: string; input: Record<string, unknown>; known?: KnownAnswer; manifest: Manifest; module: Record<string, unknown> }> = [];
  for (const slug of slugs) {
    if (getDeactivatedCapabilities().has(slug)) { skipped.push({ slug, reason: "deactivated" }); continue; }
    const manifestPath = join(manifestsDir, `${slug}.yaml`);
    if (!existsSync(manifestPath)) { skipped.push({ slug, reason: "no manifest" }); continue; }
    const manifest = yaml.load(readFileSync(manifestPath, "utf8")) as Manifest;
    const ka = manifest.test_fixtures?.known_answer;
    const known = Array.isArray(ka) ? ka[0] : ka;
    const input = known?.input ?? manifest.test_fixtures?.health_check_input;
    if (!input) { skipped.push({ slug, reason: "no test input" }); continue; }
    const src = readFileSync(join(capabilitiesDir, `${slug}.ts`), "utf8");
    if (!includePaid && fetchesAPage(input)) { skipped.push({ slug, reason: "input fetches a page (use --include-paid)" }); continue; }
    if (!includePaid && PAID_VENDOR.test(src)) { skipped.push({ slug, reason: "calls a paid vendor (use --include-paid)" }); continue; }
    const module = (await import(join(capabilitiesDir, `${slug}.ts`))) as Record<string, unknown>;
    if (!getDirectExecutor(slug)) { skipped.push({ slug, reason: "no executor registered under this slug" }); continue; }
    plan.push({ slug, input, known, manifest, module });
  }
  if (listOnly) {
    const listing = JSON.stringify({ role, current_model: current.entry.id, candidate_model: proposed.entry.id, would_compare: plan.map((p) => p.slug), skipped }, null, 2);
    if (out) writeFileSync(out, listing);
    else console.log(listing);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");

  const results: Array<{ slug: string; runs: Array<{ current: Run; candidate: Run }> }> = [];
  for (const { slug, input, known, manifest, module } of plan) {
    const runs: Array<{ current: Run; candidate: Run }> = [];
    for (let i = 0; i < repeat; i++) {
      clearCaches(module);
      use(current);
      const a = await runOnce(slug, input, known, manifest, current.entry.id);
      clearCaches(module);
      use(proposed);
      const b = await runOnce(slug, input, known, manifest, proposed.entry.id);
      use(current);
      runs.push({ current: a, candidate: b });
      console.error(`${slug.padEnd(34)} current ${a.verdict.padEnd(13)} ${String(a.ms).padStart(6)}ms | candidate ${b.verdict.padEnd(13)} ${String(b.ms).padStart(6)}ms${b.verdict === "pass" ? "" : `  ${b.error ?? b.checks_failed.join("; ")}`}`);
    }
    results.push({ slug, runs });
  }

  const all = results.flatMap((r) => r.runs.map((run) => ({ slug: r.slug, ...run })));
  const exercised = all.filter((r) => r.current.verdict !== "not_exercised" && r.candidate.verdict !== "not_exercised");
  const failures = exercised
    .filter((r) => r.current.verdict === "pass" && r.candidate.verdict === "fail")
    .map((r) => `${r.slug}: candidate fails where current passes (${r.candidate.error ?? r.candidate.checks_failed.join("; ")})`);
  const warnings = [
    ...exercised.filter((r) => r.current.verdict === "fail" && r.candidate.verdict === "fail")
      .map((r) => `${r.slug}: both models fail (current: ${r.current.error ?? r.current.checks_failed.join("; ")})`),
    ...all.filter((r) => r.current.verdict === "api_error" || r.candidate.verdict === "api_error")
      .map((r) => `${r.slug}: transient API error, inconclusive (${r.candidate.error ?? r.current.error})`),
    ...all.filter((r) => r.current.verdict === "not_exercised" || r.candidate.verdict === "not_exercised")
      .map((r) => `${r.slug}: the model under test was not called on ${r.current.verdict === "not_exercised" ? "current" : "candidate"}; not counted`),
    ...all.filter((r) => r.current.vendors.length || r.candidate.vendors.length)
      .map((r) => `${r.slug}: also paid ${[...new Set([...r.current.vendors, ...r.candidate.vendors])].join(", ")}`),
  ];
  const passes = (side: "current" | "candidate") => exercised.filter((r) => r[side].verdict === "pass").length;
  // Only runs whose cost is known on both sides, so a failing side cannot look cheaper.
  const costed = all.filter((r) => r.current.cost_cents !== null && r.candidate.cost_cents !== null);
  const cost = (side: "current" | "candidate") => Number(costed.reduce((sum, r) => sum + (r[side].cost_cents as number), 0).toFixed(4));
  const report = {
    ok: exercised.length > 0 && failures.length === 0 && passes("candidate") >= passes("current"),
    role,
    current_model: current.entry.id,
    candidate_model: proposed.entry.id,
    capabilities: results.length,
    runs: all.length,
    exercised_runs: exercised.length,
    current_passes: passes("current"),
    candidate_passes: passes("candidate"),
    candidate_regressions: failures.length,
    cost_compared_runs: costed.length,
    current_cost_cents: cost("current"),
    candidate_cost_cents: cost("candidate"),
    failures,
    warnings,
    skipped,
    results,
  };
  const json = JSON.stringify(report, null, 2);
  if (out) writeFileSync(out, json);
  else console.log(json);
  console.error(`\n${results.length} capabilities, ${exercised.length}/${all.length} runs exercised both models, ${skipped.length} skipped; passes: current ${report.current_passes}, candidate ${report.candidate_passes}; regressions ${failures.length}; cost over ${costed.length} runs (EUR cents): current ${report.current_cost_cents}, candidate ${report.candidate_cost_cents}`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
