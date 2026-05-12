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
      envVar: rule.envVar,
      declared: manifest.cost_class,
      allowed: rule.allowedCostClasses,
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
  console.error(`    Executor reads: ${v.envVar}`);
  console.error(`    Allowed cost_class: ${v.allowed.join(" | ")}`);
  console.error(`    Reason: ${v.reason}`);
  console.error(`    Manifest: ${v.manifestPath}`);
  console.error(`    Executor: ${v.executorPath}`);
}
console.error("");
console.error("[lint] Fix by editing the manifest's cost_class to match the");
console.error("[lint] upstream vendor's pricing shape, or remove the env-var");
console.error("[lint] dependency from the executor if it was unintended.");
process.exit(1);
