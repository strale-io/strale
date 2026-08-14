// Phase A0b CI lint: assert manifest cost_class matches the upstream
// vendor's shape declared in the executor source code.
//
// Rules of thumb (the known fleet's shortlist):
//   * Reads ANTHROPIC_API_KEY or OPENAI_API_KEY → must be paid_prepaid or
//     paid_subscription (LLM calls bill per token; scheduler must never
//     hit these).
//   * Reads BROWSERLESS_API_KEY → must be paid_prepaid (Browserless bills
//     per minute of headless time).
//   * Reads OPENREGISTER_API_KEY → must be free_quota or paid_prepaid
//     (free tier has a hard monthly cap; paid tier is per-call).
//
// This is a *cross-check* between the YAML manifest and the executor.
// The CHECK constraint in Block 0067 enforces the enum at DB level; this
// script enforces the policy that paid-vendor executors must declare a
// paid cost_class, not a free one.
//
// Block 0082 follow-up (2026-08-14): a second rule dimension,
// THROTTLED_HOST_RULES, catches the mirror-image mistake — a
// *free*-vendor executor whose upstream documents a real rate limit or
// daily cap, but the manifest declares `free_unlimited` (which disarms
// guarded-executor.ts's ALLOW_MATRIX entirely: "allow, no constraint"
// for every invocation context, the exact conflation the 2026-05-11 DE
// OpenRegister incident post-mortem named as root cause). Same
// cross-check shape as the env-var rules, just keyed on a vendor
// hostname/URL substring in the executor source instead of an env var
// name, and the polarity is inverted (a match means `free_unlimited` is
// now DISALLOWED, not that some other classes are required — the
// correct free_quota quota_cap is a per-vendor number this script does
// not try to derive, see startup-migrations.ts Block 0082's citations).
//
// Exit codes:
//   0 — clean
//   1 — at least one capability has a coherence violation.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";

const REPO_ROOT = resolve(import.meta.dirname, "../../../");
const MANIFESTS_DIR = join(REPO_ROOT, "manifests");
const CAPABILITIES_DIR = join(REPO_ROOT, "apps/api/src/capabilities");

const RULES = [
  {
    envVar: "ANTHROPIC_API_KEY",
    allowedCostClasses: ["paid_prepaid", "paid_subscription"],
    reason: "Anthropic Claude bills per token. Scheduler/CI must never invoke.",
  },
  {
    envVar: "OPENAI_API_KEY",
    allowedCostClasses: ["paid_prepaid", "paid_subscription"],
    reason: "OpenAI bills per token. Scheduler/CI must never invoke.",
  },
  {
    envVar: "BROWSERLESS_API_KEY",
    allowedCostClasses: ["paid_prepaid"],
    reason: "Browserless bills per headless-browser minute.",
  },
  {
    envVar: "OPENREGISTER_API_KEY",
    allowedCostClasses: ["free_quota", "paid_prepaid"],
    reason: "OpenRegister free tier is 50 req/month; paid tier is per-call.",
  },
];

// Vendor hostnames/URLs with a documented rate limit or daily cap on
// their free tier, keyed by a substring that appears in the executor's
// fetch URL. Every capability calling one of these hosts is flagged if
// it declares `free_unlimited` — that's the only cost_class this rule
// set disallows, so there's no per-rule `disallowed` list to carry (see
// startup-migrations.ts Block 0082 for the full per-vendor citation —
// source URL + documented number — this list is sourced from).
const THROTTLED_HOST_RULES = [
  {
    host: "receitaws.com.br",
    reason: "ReceitaWS free tier is rate-limited to 3 req/min (receitaws.com.br/api).",
  },
  {
    host: "nominatim.openstreetmap.org",
    reason:
      "OSM Nominatim Usage Policy caps bulk/regular-interval automated use at 4 req/min " +
      "(operations.osmfoundation.org/policies/nominatim/).",
  },
  {
    host: "api.open-meteo.com",
    reason: "Open-Meteo free non-commercial tier is capped at 10,000 calls/day (open-meteo.com/en/pricing).",
  },
  {
    host: "ip-api.com",
    reason: "ip-api.com free endpoint is rate-limited to 45 req/min (ip-api.com/docs/api:json).",
  },
  {
    host: "data.sec.gov",
    reason: "SEC fair-access policy caps automated requests at 10 req/sec (sec.gov/os/webmaster-faq).",
  },
  {
    host: "api.etherscan.io",
    reason: "Etherscan free tier is rate-limited to 5 calls/sec, 100,000 calls/day (docs.etherscan.io).",
  },
  {
    host: "world.openfoodfacts.org",
    reason: "Open Food Facts read product queries are capped at 15 req/min/IP (openfoodfacts.github.io API docs).",
  },
  {
    host: "api.coingecko.com",
    reason: "CoinGecko public/keyless plan is rate-limited to 5-15 calls/min (CoinGecko official support).",
  },
  {
    host: "api.gdeltproject.org",
    reason: "GDELT enforces one request per 5 seconds per IP (blog.gdeltproject.org).",
  },
  {
    host: "api.gopluslabs.io",
    reason: "GoPlus Labs free tier (no access token) is rate-limited to 30 calls/min (docs.gopluslabs.io).",
  },
];

// Shared-lib source cache for the THROTTLED_HOST_RULES pass below.
// lib/etherscan-client.ts alone is imported by 5 capabilities and
// lib/browserless-extract.ts by 36 — without a cache, each importing
// manifest's iteration would re-read the same file from disk.
const libSourceCache = new Map();
function readLibSourceCached(libPath) {
  const cached = libSourceCache.get(libPath);
  if (cached !== undefined) return cached;
  const source = existsSync(libPath) ? readFileSync(libPath, "utf8") : "";
  libSourceCache.set(libPath, source);
  return source;
}

const violations = [];

for (const manifestFile of readdirSync(MANIFESTS_DIR)) {
  if (!manifestFile.endsWith(".yaml")) continue;
  if (manifestFile === "CLASSIFICATION.md") continue;

  const manifestPath = join(MANIFESTS_DIR, manifestFile);
  let manifest;
  try {
    manifest = yaml.load(readFileSync(manifestPath, "utf8"));
  } catch (err) {
    // Malformed YAML is not this lint's concern — capability-onboarding
    // gate catches that.
    continue;
  }
  if (!manifest || typeof manifest !== "object" || !manifest.slug) continue;
  if (!manifest.cost_class) continue; // unclassified caps not in scope

  const executorPath = join(CAPABILITIES_DIR, `${manifest.slug}.ts`);
  if (!existsSync(executorPath)) continue;

  const executorSource = readFileSync(executorPath, "utf8");

  for (const rule of RULES) {
    if (!executorSource.includes(rule.envVar)) continue;
    if (rule.allowedCostClasses.includes(manifest.cost_class)) continue;
    // Per-env-var exemption: capabilities can declare a secondary paid
    // dependency (e.g. an LLM fallback path that's not on the primary
    // request flow) by adding a comment near the env-var read:
    //   `// cost-class-coherence-exempt: <ENV_VAR> (<reason>)`
    const exemptRe = new RegExp(
      `cost-class-coherence-exempt:\\s*${rule.envVar}\\b`,
    );
    if (exemptRe.test(executorSource)) continue;
    violations.push({
      slug: manifest.slug,
      manifestPath: `manifests/${manifestFile}`,
      executorPath: `apps/api/src/capabilities/${manifest.slug}.ts`,
      trigger: rule.envVar,
      declared: manifest.cost_class,
      allowed: rule.allowedCostClasses,
      reason: rule.reason,
    });
  }

  // Also check the capability's shared-lib dependencies (e.g. the
  // Etherscan family imports lib/etherscan-client.ts rather than
  // calling api.etherscan.io directly), so the host string isn't
  // required to live in the top-level executor file itself.
  let combinedSource = executorSource;
  const importMatches = executorSource.matchAll(/from\s+["']\.\/(lib\/[a-zA-Z0-9_-]+)\.js["']/g);
  for (const m of importMatches) {
    const libPath = join(CAPABILITIES_DIR, `${m[1]}.ts`);
    combinedSource += "\n" + readLibSourceCached(libPath);
  }

  for (const rule of THROTTLED_HOST_RULES) {
    if (!combinedSource.includes(rule.host)) continue;
    if (manifest.cost_class !== "free_unlimited") continue;
    // Per-host exemption, same escape hatch shape as the env-var rules:
    //   `// cost-class-coherence-exempt: <host>`
    const exemptRe = new RegExp(
      `cost-class-coherence-exempt:\\s*${rule.host.replace(/\./g, "\\.")}\\b`,
    );
    if (exemptRe.test(combinedSource)) continue;
    violations.push({
      slug: manifest.slug,
      manifestPath: `manifests/${manifestFile}`,
      executorPath: `apps/api/src/capabilities/${manifest.slug}.ts`,
      trigger: rule.host,
      declared: manifest.cost_class,
      allowed: ["<anything except free_unlimited>"],
      reason: rule.reason,
    });
  }
}

if (violations.length === 0) {
  console.log("[lint] cost_class coherence: all classified capabilities OK.");
  process.exit(0);
}

console.error("[lint] cost_class coherence violations:");
for (const v of violations) {
  console.error(`\n  ${v.slug} (declared cost_class: ${v.declared})`);
  console.error(`    Executor references: ${v.trigger}`);
  console.error(`    Allowed cost_class: ${v.allowed.join(" | ")}`);
  console.error(`    Reason: ${v.reason}`);
  console.error(`    Manifest: ${v.manifestPath}`);
  console.error(`    Executor: ${v.executorPath}`);
}
console.error("");
console.error("[lint] Fix by editing the manifest's cost_class to match the");
console.error("[lint] upstream vendor's pricing shape, or remove the dependency");
console.error("[lint] from the executor if it was unintended.");
process.exit(1);
