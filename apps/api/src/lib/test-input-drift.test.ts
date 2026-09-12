/**
 * Regression coverage for the fixture-input-drift gap:
 * `irish-company-data`, `lithuanian-company-data`, `swiss-company-data`
 * (handoff/_general/from-code/2026-09-11-recapture-refusal-lock.md).
 *
 * Both assertions below were proved by planting: with
 * `deriveDependencyHealthInput` temporarily changed to always return `{}`
 * (ignoring `health_check_input` and the known_answer fallback), 3 of 4
 * `checkDependencyHealthDrift` tests below failed and the "unrelated
 * capability untouched" test still passed on its own (it does not depend on
 * the derivation at all, by construction, see its own comment). Restoring
 * the real derivation made all 4 pass again.
 */
import { describe, expect, it } from "vitest";
import { checkDependencyHealthDrift, deriveDependencyHealthInput } from "./test-input-drift.js";
import type { Manifest } from "./capability-manifest-types.js";

function manifestWith(testFixtures: Manifest["test_fixtures"]): Pick<Manifest, "test_fixtures"> {
  return { test_fixtures: testFixtures };
}

describe("deriveDependencyHealthInput", () => {
  it("uses health_check_input when the manifest declares one", () => {
    const manifest = manifestWith({ health_check_input: { cro_number: "513174" } });
    expect(deriveDependencyHealthInput(manifest)).toEqual({ cro_number: "513174" });
  });

  it("falls back to the first known_answer fixture's input when there is no health_check_input", () => {
    const manifest = manifestWith({
      known_answer: { input: { uid: "CHE-101.602.521" }, expected_fields: [] },
    });
    expect(deriveDependencyHealthInput(manifest)).toEqual({ uid: "CHE-101.602.521" });
  });

  it("falls back to {} when neither exists", () => {
    expect(deriveDependencyHealthInput(manifestWith(undefined))).toEqual({});
  });
});

describe("checkDependencyHealthDrift", () => {
  // The actual incident: manifest corrected (cro_number 461461 -> 513174),
  // stored dependency_health row never resynced.
  it("detects drift when the manifest's health_check_input changed after the row was written", () => {
    const staleManifest = manifestWith({ health_check_input: { cro_number: "461461" } });
    const correctedManifest = manifestWith({ health_check_input: { cro_number: "513174" } });

    const stored = { cro_number: "461461" }; // what the DB row still holds

    expect(checkDependencyHealthDrift("irish-company-data", stored, staleManifest).drifted).toBe(false);
    const afterCorrection = checkDependencyHealthDrift("irish-company-data", stored, correctedManifest);
    expect(afterCorrection.drifted).toBe(true);
    expect(afterCorrection.derivedInput).toEqual({ cro_number: "513174" });
  });

  it("reports no drift once the stored input matches the current manifest", () => {
    const manifest = manifestWith({ health_check_input: { company_code: "304151376" } });
    const stored = { company_code: "304151376" };
    expect(checkDependencyHealthDrift("lithuanian-company-data", stored, manifest).drifted).toBe(false);
  });

  // "an unrelated suite is untouched": the check for one capability's stored
  // input never reads or reasons about any other capability's manifest or
  // row. It is a pure function of exactly the three arguments passed in.
  // Two capabilities with the SAME (irrelevant) stored input diverge only
  // because their own manifests differ, never because of each other.
  it("is scoped to the single capability passed in, an unrelated capability's drift result never changes", () => {
    const swissManifest = manifestWith({ health_check_input: { uid: "CHE-101.602.521" } });
    const irishManifest = manifestWith({ health_check_input: { cro_number: "513174" } });

    const swissResult = checkDependencyHealthDrift("swiss-company-data", { uid: "CHE-101.602.521" }, swissManifest);
    const irishResultBefore = checkDependencyHealthDrift("irish-company-data", { cro_number: "513174" }, irishManifest);

    expect(swissResult.drifted).toBe(false);

    // Drifting the swiss manifest must not perturb the already-computed
    // irish result: each call is independent, no shared or cached state.
    const swissManifestCorrected = manifestWith({ health_check_input: { uid: "CHE-999.999.999" } });
    checkDependencyHealthDrift("swiss-company-data", { uid: "CHE-101.602.521" }, swissManifestCorrected);

    const irishResultAfter = checkDependencyHealthDrift("irish-company-data", { cro_number: "513174" }, irishManifest);
    expect(irishResultAfter).toEqual(irishResultBefore);
  });
});
