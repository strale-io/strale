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
// OpenRegister incident post-mortem named as root cause).
//
// Follow-up to the follow-up (2026-08-14, same day): the first version of
// this dimension buried the documented rate *and* its source URL inside
// each rule's `reason` prose string — machine-unreadable, and duplicated
// the same ~10 vendor facts that also live in startup-migrations.ts
// Block 0082's per-cap citations and (redundantly) in the manifest's
// already-derived `quota_cap`. Nothing forced the prose to be revisited
// when a vendor changed its documented limit.
//
// Fixed by splitting the two facts onto two owners instead of merging
// them onto one:
//   - THROTTLED_HOST_RULES (below) is now a pure DETECTOR: "this host is
//     throttled — any manifest touching it must declare a
//     known_rate_limit." No numbers, no URLs. This is deliberate, not an
//     oversight — see the trap this avoids, next paragraph.
//   - The manifest's `known_rate_limit: {value, unit, source_url}` field
//     (capability-manifest-types.ts) is the CANONICAL vendor fact — the
//     number and its citation, authored once per capability.
//
// Why not just put known_rate_limit on the manifest and delete this host
// list entirely (self-consistency-only lint)? Because that removes the
// gate's actual safety property. This dimension's job is: catch a
// capability whose executor calls a KNOWN-throttled host while its
// manifest carries no rate-limit declaration at all (whatever its
// cost_class says). If the only check were "does known_rate_limit agree
// with cost_class/quota_cap," a capability that simply never got a
// known_rate_limit field — hitting receitaws.com.br, declaring
// free_unlimited, zero rate-limit metadata anywhere — would pass clean.
// That's the exact failure mode Block 0082 was created to close. The
// host list is what makes "undeclared" a detectable state instead of a
// silent gap; it doesn't need the number to do that job, so it doesn't
// carry one anymore.
//
// Two independent checks now run per manifest:
//   (a) executor touches a THROTTLED_HOST_RULES host, manifest has no
//       known_rate_limit at all → violation ("undeclared throttling").
//   (b) manifest HAS known_rate_limit → its own cost_class/quota_cap
//       must be internally consistent with it → violation ("inconsistent
//       declaration"). This check is NOT gated on the host list — it
//       runs for every manifest carrying the field, so a capability
//       whose vendor isn't in THROTTLED_HOST_RULES yet still gets its
//       self-declared number checked for internal consistency.
//
// known_rate_limit accepts a single object OR an array (same
// single-or-array convention as test_fixtures.known_answer) — a
// capability can touch more than one throttled vendor (e.g.
// officer-search: UK Companies House + SEC EDGAR). When it's an array,
// the ceiling is the MINIMUM of each entry's derived value — the most
// restrictive vendor governs actual call volume, not the sum or average.
//
// quota_cap consistency is a CEILING check (quota_cap <= derived), not
// equality. Two reasons: (1) a manifest is free to declare a more
// conservative quota_cap than the vendor technically permits — that's a
// legitimate operator choice, not drift; only exceeding the vendor's
// actual limit is a bug. (2) equality would force a manifest edit every
// time a vendor restates the same limit in different units. See
// deriveQuotaCapFromRateLimit's doc comment in
// capability-manifest-types.ts for the officer-search example (declares
// quota_cap: 600 — Companies House's own literal 5-minute window figure
// — well under its derived 7,200/hr ceiling).
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

// Vendor hostnames with a KNOWN documented rate limit or daily cap on
// their free tier, keyed by a substring that appears in the executor's
// fetch URL. This is a DETECTOR ONLY — no numbers, no source URLs. Every
// capability calling one of these hosts must declare a
// `known_rate_limit` on its manifest (checked below); the actual
// documented value + citation lives there, not here. See the file
// header for why the two facts are split onto two owners.
const THROTTLED_HOST_RULES = [
  { host: "receitaws.com.br", reason: "ReceitaWS documents a rate limit on its free tier." },
  { host: "nominatim.openstreetmap.org", reason: "OSM Nominatim's Usage Policy caps bulk/automated use." },
  { host: "api.open-meteo.com", reason: "Open-Meteo's free non-commercial tier has a documented daily call cap." },
  { host: "ip-api.com", reason: "ip-api.com's free endpoint is rate-limited." },
  { host: "data.sec.gov", reason: "SEC's fair-access policy caps automated request rate." },
  { host: "api.etherscan.io", reason: "Etherscan's free tier has a documented per-second and daily call cap." },
  { host: "world.openfoodfacts.org", reason: "Open Food Facts caps read product queries per IP." },
  { host: "api.coingecko.com", reason: "CoinGecko's public/keyless plan is rate-limited." },
  { host: "api.gdeltproject.org", reason: "GDELT enforces a documented per-IP request interval." },
  { host: "api.gopluslabs.io", reason: "GoPlus Labs' free tier (no access token) is rate-limited." },
  {
    host: "api.company-information.service.gov.uk",
    reason: "UK Companies House's public API is rate-limited.",
  },
];

// Mirror of deriveQuotaCapFromRateLimit in
// src/lib/capability-manifest-types.ts. This .mjs script runs via plain
// `node` (see ci.yml) and reads manifests/*.yaml directly — it can't
// import compiled TS (same constraint check-identity-fixture-shape.mjs
// documents), so the derivation is duplicated here. If the TS function's
// derivation changes, this copy must change with it — both directions
// are covered by test/check-cost-class-coherence.test.ts.
const KNOWN_RATE_LIMIT_UNITS = ["per_second", "per_minute", "per_day"];
function deriveQuotaCapFromRateLimit(rateLimit) {
  switch (rateLimit.unit) {
    case "per_second":
      return rateLimit.value * 3600;
    case "per_minute":
      return rateLimit.value * 60;
    case "per_day":
      return rateLimit.value;
    default:
      throw new Error(`Unknown known_rate_limit.unit: ${rateLimit.unit}`);
  }
}

// Mirror of getKnownRateLimits in src/lib/capability-manifest-types.ts —
// normalizes the single-object-or-array known_rate_limit field to an
// array. `[]` means "not declared," not an error.
function getKnownRateLimits(manifest) {
  const rl = manifest.known_rate_limit;
  if (!rl) return [];
  return Array.isArray(rl) ? rl : [rl];
}

// Check (b): a manifest that HAS declared known_rate_limit (one entry or
// several) must be internally consistent — every entry shape-valid,
// cost_class not free_unlimited, and quota_cap (if set) no greater than
// the derived ceiling (the MINIMUM across entries when there's more than
// one — the most restrictive vendor governs). Runs independently of
// THROTTLED_HOST_RULES so a capability's self-declared number is checked
// even before/without its vendor being added to that list.
function findKnownRateLimitConsistencyViolation(manifest) {
  const rateLimits = getKnownRateLimits(manifest);
  if (rateLimits.length === 0) return null;

  for (const [i, rl] of rateLimits.entries()) {
    const label = rateLimits.length > 1 ? ` [entry ${i + 1}]` : "";
    if (
      typeof rl.value !== "number" ||
      !Number.isFinite(rl.value) ||
      rl.value <= 0 ||
      !KNOWN_RATE_LIMIT_UNITS.includes(rl.unit) ||
      !rl.source_url ||
      typeof rl.source_url !== "string"
    ) {
      return `known_rate_limit is malformed${label} (expected {value: positive number, unit: ${KNOWN_RATE_LIMIT_UNITS.join("|")}, source_url: string}), got ${JSON.stringify(rl)}`;
    }
  }

  if (manifest.cost_class === "free_unlimited") {
    return `known_rate_limit is declared but cost_class is free_unlimited — a documented vendor limit can never be free_unlimited`;
  }

  const derived = Math.min(...rateLimits.map(deriveQuotaCapFromRateLimit));
  if (manifest.quota_cap != null && manifest.quota_cap > derived) {
    return `quota_cap (${manifest.quota_cap}) exceeds the ceiling derived from known_rate_limit (${derived}) — quota_cap must be <= the vendor-documented limit, not just any value`;
  }

  return null;
}

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

  // Check (a): executor touches a known-throttled host with no
  // known_rate_limit declared at all — undeclared throttling. This is
  // the detector; it does not care what cost_class says, because the
  // failure mode it catches is "nobody ever looked at this vendor's
  // limits," not "somebody looked and got the classification wrong"
  // (that's check (b), below).
  for (const rule of THROTTLED_HOST_RULES) {
    if (!combinedSource.includes(rule.host)) continue;
    // Per-host exemption, same escape hatch shape as the env-var rules:
    //   `// cost-class-coherence-exempt: <host>`
    const exemptRe = new RegExp(
      `cost-class-coherence-exempt:\\s*${rule.host.replace(/\./g, "\\.")}\\b`,
    );
    if (exemptRe.test(combinedSource)) continue;
    if (getKnownRateLimits(manifest).length > 0) continue; // declared — check (b) covers correctness
    violations.push({
      slug: manifest.slug,
      manifestPath: `manifests/${manifestFile}`,
      executorPath: `apps/api/src/capabilities/${manifest.slug}.ts`,
      trigger: rule.host,
      declared: manifest.cost_class,
      allowed: ["<manifest must declare known_rate_limit>"],
      reason: rule.reason,
    });
  }

  // Check (b): manifest declares known_rate_limit — verify it's
  // internally consistent with cost_class/quota_cap. Independent of the
  // host list above (see file header).
  const consistencyIssue = findKnownRateLimitConsistencyViolation(manifest);
  if (consistencyIssue) {
    violations.push({
      slug: manifest.slug,
      manifestPath: `manifests/${manifestFile}`,
      executorPath: `apps/api/src/capabilities/${manifest.slug}.ts`,
      trigger: "known_rate_limit",
      declared: manifest.cost_class,
      allowed: ["<known_rate_limit must be internally consistent>"],
      reason: consistencyIssue,
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
