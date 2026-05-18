/**
 * Live capture pass for the tier-coverage gate.
 *
 * For each in-scope capability, invokes its executor against the manifest's
 * `health_check_input` and writes the resulting `output` object to
 *   apps/api/tests/fixtures/tier-coverage/<slug>.json
 *
 * The captured fixture is what `check-tier-coverage.mjs` reads to compare
 * empirical wire-shape against manifest declarations.
 *
 * Default scope is --company-data: every manifest whose slug ends in
 * `-company-data`. As of 2026-05-17 that's 37 manifests (the EU30
 * registry surface + AU/BR/CA/JP/SG/US peers). Note that several non-EU
 * peers route through paid executors (Anthropic, Browserless) — scope
 * with care.
 *
 * Cost (as of the 2026-05-17 capture run): free for the ~19 functional
 * direct-registry capabilities; ~€0.14/call × 11 = ~€1.56 for the
 * Openapi-routed countries (AT/BG/CY/HU/LU/MT/NL/RO/ES/PT/IT). The Openapi
 * calls go through the resolver, which is itself flag-gated — set
 * OPENAPI_ENABLED=true in the shell environment for this script run only.
 *
 * PII scrubbing: every captured fixture is run through `scrubFixture()`
 * before write. Two scrub passes apply:
 *   (a) PII_ARRAY_FIELDS — fields whose values are arrays of natural-
 *       person records (directors, partners, shareholders, owners,
 *       beneficial_owners). The array is replaced with a single
 *       "[REDACTED]" string. The gate only cares about populated-ness,
 *       not values, so this preserves the structural signal without
 *       committing real people's names + roles to a public repo.
 *   (b) EPHEMERAL_FIELDS — fields whose value is a live wall-clock
 *       timestamp from the capture run itself (retrieved_at,
 *       source_as_of, fetched_at, captured_at, generated_at). Replaced
 *       with the literal "[CAPTURE_TIMESTAMP]" so re-captures produce
 *       byte-identical fixtures and `git diff` stays meaningful.
 *
 * Failures do not abort the run: each capability is captured independently
 * and any executor that errors is logged + skipped. Re-run with --slug to
 * retry an individual capability after fixing whatever blocked it.
 *
 * Usage:
 *   npx tsx apps/api/scripts/capture-tier-fixtures.ts                 # error — requires explicit scope
 *   npx tsx apps/api/scripts/capture-tier-fixtures.ts --company-data  # all *-company-data manifests
 *   npx tsx apps/api/scripts/capture-tier-fixtures.ts --slug uk-company-data
 *   npx tsx apps/api/scripts/capture-tier-fixtures.ts --slug uk-company-data,french-company-data
 *
 * `--registry-only` is accepted as a backward-compatible alias for
 * --company-data but the name is misleading (it selects all company-data
 * manifests including non-EU peers like US/AU/BR) — prefer --company-data.
 *
 * The explicit-scope requirement is a guardrail against accidentally
 * mass-spending on paid executors (Anthropic, Browserless, Openapi) by
 * running this with no args.
 */

import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");

// .env lives at the repo root (same convention as smoke-test.ts).
config({ path: resolve(repoRoot, ".env") });

// Auto-registers every capability executor. Must run before getExecutor().
import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";
import { getExecutor } from "../src/capabilities/index.js";

const manifestsDir = resolve(repoRoot, "manifests");
const fixturesDir = resolve(repoRoot, "apps", "api", "tests", "fixtures", "tier-coverage");

// Fields whose values are arrays of natural-person records — committing
// real director/partner names + roles to a public repo is a GDPR exposure
// the gate doesn't need (it only checks populated-ness). Replace the entire
// array value with a single literal "[REDACTED]" string so the field still
// reads as populated to isPopulated() in check-tier-coverage.mjs but
// carries no real PII.
const PII_ARRAY_FIELDS = new Set([
  "directors",
  "partners",
  "shareholders",
  "owners",
  "beneficial_owners",
  "shareHolders",
  "share_holders",
  "managers",
  "officers",
  "legal_representatives",
]);

// Fields whose value is a live wall-clock timestamp from the capture run.
// Without scrubbing, every re-capture writes a different timestamp and
// `git diff` floods with noise. Replace with the literal sentinel so
// fixtures are byte-stable across runs.
const EPHEMERAL_FIELDS = new Set([
  "retrieved_at",
  "fetched_at",
  "source_as_of",
  "captured_at",
  "generated_at",
]);

function scrubFixture(output: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(output)) {
    if (PII_ARRAY_FIELDS.has(k) && Array.isArray(v) && v.length > 0) {
      out[k] = "[REDACTED]";
      continue;
    }
    if (EPHEMERAL_FIELDS.has(k) && typeof v === "string" && v.length > 0) {
      out[k] = "[CAPTURE_TIMESTAMP]";
      continue;
    }
    out[k] = v;
  }
  return out;
}

interface ParsedArgs {
  slugs: string[] | null;        // explicit slug filter (null = no filter)
  companyDataScope: boolean;     // shorthand for "all *-company-data"
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = { slugs: null, companyDataScope: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // --registry-only is the legacy alias; --company-data is the preferred
    // form since the filter actually selects all *-company-data slugs
    // (including non-EU peers), not "registry" capabilities specifically.
    if (a === "--company-data" || a === "--registry-only") {
      out.companyDataScope = true;
    } else if (a === "--slug" && argv[i + 1]) {
      out.slugs = argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean);
      i++;
    }
  }
  return out;
}

interface ManifestSummary {
  slug: string;
  file: string;
  healthCheckInput: Record<string, unknown> | null;
}

function loadManifests(): ManifestSummary[] {
  const files = readdirSync(manifestsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const out: ManifestSummary[] = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = yaml.load(readFileSync(resolve(manifestsDir, file), "utf8"));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    const m = parsed as Record<string, unknown>;
    const slug = (m.slug as string) ?? file.replace(/\.ya?ml$/, "");
    const fixtures = m.test_fixtures as Record<string, unknown> | undefined;
    const hci = fixtures?.health_check_input as Record<string, unknown> | undefined;
    out.push({ slug, file, healthCheckInput: hci ?? null });
  }
  return out;
}

function filterScope(all: ManifestSummary[], args: ParsedArgs): ManifestSummary[] {
  if (args.slugs && args.slugs.length > 0) {
    const wanted = new Set(args.slugs);
    return all.filter((m) => wanted.has(m.slug));
  }
  if (args.companyDataScope) {
    return all.filter((m) => m.slug.endsWith("-company-data"));
  }
  return [];
}

interface CaptureOutcome {
  slug: string;
  status: "captured" | "skipped-no-executor" | "skipped-no-input" | "errored";
  detail?: string;
  durationMs?: number;
}

async function captureOne(m: ManifestSummary): Promise<CaptureOutcome> {
  if (!m.healthCheckInput) {
    return { slug: m.slug, status: "skipped-no-input", detail: "manifest has no test_fixtures.health_check_input" };
  }
  const executor = getExecutor(m.slug);
  if (!executor) {
    return {
      slug: m.slug,
      status: "skipped-no-executor",
      detail: "no executor registered (capability deactivated or import failed)",
    };
  }
  const start = Date.now();
  try {
    const result = await executor(m.healthCheckInput);
    const durationMs = Date.now() - start;
    if (!result || typeof result !== "object" || !("output" in result)) {
      return { slug: m.slug, status: "errored", detail: "executor returned non-CapabilityResult shape", durationMs };
    }
    const fixturePath = resolve(fixturesDir, `${m.slug}.json`);
    const scrubbed = scrubFixture(result.output);
    writeFileSync(fixturePath, JSON.stringify(scrubbed, null, 2) + "\n", "utf8");
    return { slug: m.slug, status: "captured", durationMs };
  } catch (err) {
    // String(non-Error throw) produces "[object Object]" and loses the
    // payload. Fall through to JSON.stringify so structured executor
    // errors ({error_code, message}) survive into the run summary.
    let detail: string;
    if (err instanceof Error) {
      detail = err.message;
    } else {
      try {
        detail = JSON.stringify(err);
      } catch {
        detail = String(err);
      }
    }
    const durationMs = Date.now() - start;
    return { slug: m.slug, status: "errored", detail: detail.slice(0, 400), durationMs };
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.slugs && !args.companyDataScope) {
    console.error(
      "capture-tier-fixtures: refusing to run with no scope. Use --registry-only or --slug <slug[,slug...]>.",
    );
    console.error("This guardrail exists because some executors call paid external APIs.");
    process.exit(2);
  }

  if (!existsSync(fixturesDir)) {
    mkdirSync(fixturesDir, { recursive: true });
  }

  const counts = await autoRegisterCapabilities();
  console.log(
    `auto-register: ${counts.executors_registered} executors registered (${counts.skipped_deactivated} deactivated, ${counts.errors} errors)`,
  );

  const all = loadManifests();
  const scoped = filterScope(all, args);
  console.log(`capture-tier-fixtures: ${scoped.length} manifest(s) in scope`);

  if (scoped.length === 0) {
    console.error("no manifests matched the requested scope");
    process.exit(1);
  }

  const outcomes: CaptureOutcome[] = [];
  for (const m of scoped) {
    process.stdout.write(`  ${m.slug} ... `);
    const o = await captureOne(m);
    outcomes.push(o);
    const tag = o.durationMs !== undefined ? ` (${o.durationMs}ms)` : "";
    console.log(`${o.status}${tag}${o.detail ? ` — ${o.detail}` : ""}`);
  }

  const summary = {
    captured: outcomes.filter((o) => o.status === "captured").length,
    skippedNoExecutor: outcomes.filter((o) => o.status === "skipped-no-executor").length,
    skippedNoInput: outcomes.filter((o) => o.status === "skipped-no-input").length,
    errored: outcomes.filter((o) => o.status === "errored").length,
  };
  console.log(
    `\nsummary: captured=${summary.captured}, skipped-no-executor=${summary.skippedNoExecutor}, ` +
      `skipped-no-input=${summary.skippedNoInput}, errored=${summary.errored}`,
  );
  console.log(`fixtures written to ${fixturesDir}`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
