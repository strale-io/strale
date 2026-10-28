/**
 * Offline contract tests for the computed executors (H7c, architecture review
 * §7.4 item 4).
 *
 * Every manifest whose data_source_type is `computed` or `reference` claims its
 * executor answers without calling anything outside the process. This file
 * holds each one to that claim before deploy: it runs the executor on its
 * manifest's known_answer input with the network blocked, and judges the
 * output with the production runner's own rules (`isCheckEnforced`,
 * `runKnownAnswerCheck` and the Gate 3 guaranteed-field sentinel) — not a copy
 * of them. A regression in one of these executors fails CI instead of the
 * next scheduled test run in production.
 *
 * Executors that call the network are out of scope here; their contract needs
 * recorded upstream responses, which come in later batches.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { getExecutor } from "./index.js";
import { getDeactivatedCapabilities } from "./auto-register.js";
import { expectedFieldsToChecks, isCheckEnforced, runKnownAnswerCheck } from "../lib/known-answer-checks.js";
import { checkGuaranteedFieldsPresent } from "../lib/guaranteed-fields-sentinel.js";
import { CAPABILITY_OUTPUT_CONTRACTS } from "../lib/capability-output-contracts.js";
import type { ManifestExpectedField } from "../lib/capability-manifest-types.js";

const OFFLINE_SOURCE_TYPES = new Set(["computed", "reference"]);

/**
 * Labelled computed or reference, but not offline. Each entry is a slug this
 * file cannot judge without the network; the test below fails if an entry goes
 * stale, so the list cannot quietly grow a dead row.
 */
const NOT_OFFLINE = new Map<string, string>([
  ["business-day-check", "fetches the public-holiday calendar; the expected answer depends on it"],
  ["c2pa-inspect", "fetches the asset at the input URL"],
  ["company-industry-classify", "classifies with an LLM call"],
]);

/**
 * Floor on the number of executors judged here. A gate whose input set
 * shrinks to nothing passes vacuously (LESSONS.md F5); this keeps it honest.
 * Raise it as coverage grows; never lower it to make a red run green.
 */
const MIN_COVERED = 80;

interface Manifest {
  slug: string;
  data_source_type?: string;
  output_field_reliability?: Record<string, string>;
  test_fixtures?: { known_answer?: { input?: Record<string, unknown>; expected_fields?: ManifestExpectedField[] } };
}

const manifestsDir = resolve(import.meta.dirname, "../../../../manifests");
const deactivated = getDeactivatedCapabilities();
const offlineManifests: Manifest[] = readdirSync(manifestsDir)
  .filter((f) => f.endsWith(".yaml"))
  .sort()
  .map((f) => yaml.load(readFileSync(resolve(manifestsDir, f), "utf8")) as Manifest)
  .filter((m) => OFFLINE_SOURCE_TYPES.has(String(m.data_source_type)));
const covered = offlineManifests.filter((m) => !deactivated.has(m.slug) && !NOT_OFFLINE.has(m.slug));

const fetchMock = vi.fn(async (url: unknown) => {
  throw new Error(`network blocked in offline contract test: ${String(url)}`);
});
beforeAll(() => vi.stubGlobal("fetch", fetchMock));
afterAll(() => vi.unstubAllGlobals());

describe("offline contract: computed executors", () => {
  it(`judges at least ${MIN_COVERED} executors`, () => {
    expect(covered.length).toBeGreaterThanOrEqual(MIN_COVERED);
  });

  it("has no stale NOT_OFFLINE entry", () => {
    const candidates = new Set(offlineManifests.filter((m) => !deactivated.has(m.slug)).map((m) => m.slug));
    expect([...NOT_OFFLINE.keys()].filter((slug) => !candidates.has(slug))).toEqual([]);
  });

  it.each(covered.map((m) => [m.slug, m] as const))("%s meets its known answer offline", async (slug, manifest) => {
    const knownAnswer = manifest.test_fixtures?.known_answer;
    expect(knownAnswer?.input, `${slug}: manifest has no known_answer input`).toBeTruthy();
    const checks = expectedFieldsToChecks(knownAnswer?.expected_fields ?? []);
    expect(checks.length, `${slug}: known_answer asserts nothing`).toBeGreaterThan(0);

    await import(`./${slug}.js`);
    const executor = getExecutor(slug);
    expect(executor, `${slug}: no executor registered`).toBeTruthy();

    fetchMock.mockClear();
    const result = await executor!(structuredClone(knownAnswer!.input!));
    expect(fetchMock, `${slug}: called the network`).not.toHaveBeenCalled();

    // The runner reads reliability from the DB, which carries the corrected
    // contract where one exists (startup-migrations applies it).
    const reliability = CAPABILITY_OUTPUT_CONTRACTS[slug]?.reliability ?? manifest.output_field_reliability;
    const failures = checks
      .filter((check) => isCheckEnforced(check, reliability))
      .map((check) => runKnownAnswerCheck(check, result.output))
      .filter((r) => !r.passed)
      .map((r) => r.reason);
    const sentinel = checkGuaranteedFieldsPresent(result.output, reliability);
    if (!sentinel.passed) failures.push(sentinel.failureReason ?? "guaranteed field missing");
    expect(failures, slug).toEqual([]);
  });
});
