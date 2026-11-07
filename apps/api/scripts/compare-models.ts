/**
 * Compare a model role's current entry with its candidate on real inputs,
 * before the candidate is promoted (models.ts MODEL_CANDIDATES).
 *
 * For every capability that calls the role and has a manifest, it runs the
 * manifest's known_answer input (or health_check_input) once on the current
 * model and once on the candidate, through the real executor and the real
 * client wrapper, so the candidate's request settings apply. It records, per
 * model: success, the manifest's enforced known-answer checks, the
 * guaranteed-field sentinel, latency and metered cost.
 *
 * Spends real money on the Anthropic API (two calls per capability, about
 * EUR 0.01 each on Haiku 4.5) and needs ANTHROPIC_API_KEY. By default it
 * skips capabilities whose input is a URL or domain, so no page fetches or
 * Browserless sessions are paid for; --include-fetch adds them.
 *
 * Usage (from apps/api):
 *   npx tsx scripts/compare-models.ts --role capability_default --out /tmp/compare.json
 *   npx tsx scripts/compare-models.ts --role capability_default --slugs summarize,translate
 *   npx tsx scripts/compare-models.ts --role capability_default --list --out /tmp/plan.json   (no calls, no key)
 * Then record the result:
 *   npm run receipt -- --kind audit --topic model-compare-capability-default --from /tmp/compare.json
 *
 * Output: {ok, failures[], warnings[], compared, skipped, results[]} (the
 * repo's check --json shape). `ok` is false when the candidate fails a
 * capability the current model passes; that is a regression.
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
const includeFetch = process.argv.includes("--include-fetch");
const listOnly = process.argv.includes("--list");

const apiRoot = resolve(import.meta.dirname, "..");
const capabilitiesDir = join(apiRoot, "src/capabilities");
const manifestsDir = resolve(apiRoot, "../../manifests");

interface Manifest {
  transparency_tag?: string;
  output_field_reliability?: Record<string, string>;
  test_fixtures?: {
    known_answer?: { input?: Record<string, unknown>; expected_fields?: Parameters<typeof expectedFieldsToChecks>[0] };
    health_check_input?: Record<string, unknown>;
  };
}

interface Side { entry: ModelEntry; price: TokenPrice }
interface Run {
  model: string;
  ok: boolean;
  error?: string;
  checks_failed: string[];
  ms: number;
  cost_cents: string | null;
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
    ([key, value]) => /^(url|domain|website|site|repo|repo_url|page_url)$/i.test(key)
      || (typeof value === "string" && /^(https?:\/\/|www\.)/i.test(value.trim())),
  );
}

async function runOnce(slug: string, input: Record<string, unknown>, manifest: Manifest, model: string): Promise<Run> {
  const executor = getDirectExecutor(slug)!;
  const started = Date.now();
  return withCallCost(async () => {
    try {
      const result = await executor(structuredClone(input));
      const output = result.output as Record<string, unknown>;
      const failed: string[] = [];
      const sentinel = checkGuaranteedFieldsPresent(output, manifest.output_field_reliability);
      if (!sentinel.passed) failed.push(sentinel.failureReason ?? "guaranteed_field_missing");
      for (const check of expectedFieldsToChecks(manifest.test_fixtures?.known_answer?.expected_fields ?? [])) {
        if (!isCheckEnforced(check, manifest.output_field_reliability)) continue;
        const r = runKnownAnswerCheck(check, output);
        if (!r.passed) failed.push(r.reason);
      }
      return { model, ok: failed.length === 0, checks_failed: failed, ms: Date.now() - started, cost_cents: snapshotCallCost().cost_cents, output };
    } catch (error) {
      return { model, ok: false, error: error instanceof Error ? error.message.slice(0, 300) : String(error), checks_failed: [], ms: Date.now() - started, cost_cents: snapshotCallCost().cost_cents };
    }
  }, EUR_USD_RATE);
}

async function main() {
  const candidate = MODEL_CANDIDATES[role];
  if (!candidate) throw new Error(`No candidate for role ${role} in MODEL_CANDIDATES (models.ts).`);
  const current: Side = { entry: structuredClone(MODELS[role]) as ModelEntry, price: structuredClone(MODEL_PRICES[role]) };
  const proposed: Side = { entry: candidate.entry, price: candidate.price };

  const marker = `MODELS.${role}`;
  const slugs = readdirSync(capabilitiesDir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .filter((f) => readFileSync(join(capabilitiesDir, f), "utf8").includes(marker))
    .map((f) => f.replace(/\.ts$/, ""))
    .filter((slug) => !onlySlugs || onlySlugs.includes(slug));

  const skipped: Array<{ slug: string; reason: string }> = [];
  const plan: Array<{ slug: string; input: Record<string, unknown>; manifest: Manifest }> = [];
  for (const slug of slugs) {
    const deactivated = getDeactivatedCapabilities().get(slug);
    if (deactivated) { skipped.push({ slug, reason: `deactivated: ${deactivated}` }); continue; }
    const manifestPath = join(manifestsDir, `${slug}.yaml`);
    if (!existsSync(manifestPath)) { skipped.push({ slug, reason: "no manifest" }); continue; }
    const manifest = yaml.load(readFileSync(manifestPath, "utf8")) as Manifest;
    const input = manifest.test_fixtures?.known_answer?.input ?? manifest.test_fixtures?.health_check_input;
    if (!input) { skipped.push({ slug, reason: "no test input" }); continue; }
    if (!includeFetch && fetchesAPage(input)) { skipped.push({ slug, reason: "input fetches a page (use --include-fetch)" }); continue; }
    await import(join(capabilitiesDir, `${slug}.ts`));
    if (!getDirectExecutor(slug)) { skipped.push({ slug, reason: "no executor registered under this slug" }); continue; }
    plan.push({ slug, input, manifest });
  }
  if (listOnly) {
    const listing = JSON.stringify({ role, current_model: current.entry.id, candidate_model: proposed.entry.id, would_compare: plan.map((p) => p.slug), skipped }, null, 2);
    if (out) writeFileSync(out, listing);
    else console.log(listing);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");

  const results: Array<{ slug: string; current: Run; candidate: Run }> = [];
  for (const { slug, input, manifest } of plan) {
    use(current);
    const a = await runOnce(slug, input, manifest, current.entry.id);
    use(proposed);
    const b = await runOnce(slug, input, manifest, proposed.entry.id);
    use(current);
    results.push({ slug, current: a, candidate: b });
    console.error(`${slug.padEnd(34)} current ${a.ok ? "ok  " : "FAIL"} ${String(a.ms).padStart(6)}ms ${a.cost_cents ?? "?"}c | candidate ${b.ok ? "ok  " : "FAIL"} ${String(b.ms).padStart(6)}ms ${b.cost_cents ?? "?"}c${b.ok ? "" : `  ${b.error ?? b.checks_failed.join("; ")}`}`);
  }

  const failures = results
    .filter((r) => r.current.ok && !r.candidate.ok)
    .map((r) => `${r.slug}: candidate fails where current passes (${r.candidate.error ?? r.candidate.checks_failed.join("; ")})`);
  const warnings = results
    .filter((r) => !r.current.ok)
    .map((r) => `${r.slug}: current model fails too (${r.current.error ?? r.current.checks_failed.join("; ")}); candidate ${r.candidate.ok ? "passes" : "fails"}`);
  const sum = (side: "current" | "candidate") =>
    results.reduce((total, r) => total + (r[side].cost_cents === null ? 0 : Number(r[side].cost_cents)), 0);
  const report = {
    ok: failures.length === 0 && results.length > 0,
    role,
    current_model: current.entry.id,
    candidate_model: proposed.entry.id,
    compared: results.length,
    candidate_regressions: failures.length,
    current_passes: results.filter((r) => r.current.ok).length,
    candidate_passes: results.filter((r) => r.candidate.ok).length,
    current_cost_cents: Number(sum("current").toFixed(4)),
    candidate_cost_cents: Number(sum("candidate").toFixed(4)),
    failures,
    warnings,
    skipped,
    results,
  };
  const json = JSON.stringify(report, null, 2);
  if (out) writeFileSync(out, json);
  else console.log(json);
  console.error(`\ncompared ${results.length}, skipped ${skipped.length}; passes: current ${report.current_passes}, candidate ${report.candidate_passes}; regressions ${failures.length}; cost (cents): current ${report.current_cost_cents}, candidate ${report.candidate_cost_cents}`);
  process.exit(report.ok ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
