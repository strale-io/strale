/**
 * The known_answer contract, judged with the production runner's own rules
 * (`isCheckEnforced`, `runKnownAnswerCheck` and the Gate 3 guaranteed-field
 * sentinel), not a copy of them. Shared by the offline contract test, the
 * upstream replay test and the upstream recorder so all three judge alike.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { expectedFieldsToChecks, isCheckEnforced, runKnownAnswerCheck } from "../lib/known-answer-checks.js";
import { checkGuaranteedFieldsPresent } from "../lib/guaranteed-fields-sentinel.js";
import { CAPABILITY_OUTPUT_CONTRACTS } from "../lib/capability-output-contracts.js";
import type { ManifestExpectedField } from "../lib/capability-manifest-types.js";
import type { CapabilityExecutor } from "../capabilities/index.js";

export const MANIFESTS_DIR = resolve(import.meta.dirname, "../../../../manifests");

export interface ContractManifest {
  slug: string;
  data_source_type?: string;
  data_access?: unknown;
  output_field_reliability?: Record<string, string>;
  test_fixtures?: { known_answer?: { input?: Record<string, unknown>; expected_fields?: ManifestExpectedField[] } };
}

export function loadManifest(slug: string): ContractManifest {
  return yaml.load(readFileSync(resolve(MANIFESTS_DIR, `${slug}.yaml`), "utf8")) as ContractManifest;
}

function reliabilityOf(manifest: ContractManifest): Record<string, string> | undefined {
  // The runner reads reliability from the DB, which carries the corrected
  // contract where one exists (startup-migrations applies it).
  return CAPABILITY_OUTPUT_CONTRACTS[manifest.slug]?.reliability ?? manifest.output_field_reliability;
}

/** Number of known_answer checks the runner enforces; zero means it asserts nothing. */
export function knownAnswerCheckCount(manifest: ContractManifest): number {
  const reliability = reliabilityOf(manifest);
  return expectedFieldsToChecks(manifest.test_fixtures?.known_answer?.expected_fields ?? [])
    .filter((check) => isCheckEnforced(check, reliability)).length;
}

/** Every reason the output fails the slug's known_answer contract; empty when it passes. */
export function judgeKnownAnswer(manifest: ContractManifest, output: unknown): string[] {
  const checks = expectedFieldsToChecks(manifest.test_fixtures?.known_answer?.expected_fields ?? []);
  const reliability = reliabilityOf(manifest);
  const failures = checks
    .filter((check) => isCheckEnforced(check, reliability))
    .map((check) => runKnownAnswerCheck(check, output as Record<string, unknown>))
    .filter((r) => !r.passed)
    .map((r) => r.reason);
  const sentinel = checkGuaranteedFieldsPresent(output as Record<string, unknown>, reliability);
  if (!sentinel.passed) failures.push(sentinel.failureReason ?? "guaranteed field missing");
  return failures;
}

/**
 * Load an executor the way production does: the registry from a fresh
 * import, with the manifest's data_access registered, so getExecutor wraps
 * the call in the manifest's acquisition method (honest user agent and
 * robots.txt on page reads). Dynamic imports keep this correct after
 * `vi.resetModules()`.
 */
export async function loadExecutor(manifest: ContractManifest): Promise<CapabilityExecutor | undefined> {
  const { parseDataAccess, registerDataAccess } = await import("../lib/data-access.js");
  const access = manifest.data_access === undefined ? undefined : parseDataAccess(manifest.data_access);
  if (access && !access.ok) throw new Error(`${manifest.slug}: invalid data_access: ${access.errors.join("; ")}`);
  if (access?.ok) registerDataAccess(manifest.slug, access.value);
  await import(/* @vite-ignore */ `../capabilities/${manifest.slug}.js`);
  const { getExecutor } = await import("../capabilities/index.js");
  return getExecutor(manifest.slug);
}
