/**
 * Phase 3 (Harden) regression test for the May 2026 Haiku cost-leak.
 * Audit PR #84 + follow-up: PR #46 (2026-05-04) coupled scheduler
 * dispatch to `test_suites.external_cost_cents`, so any LLM-using
 * capability whose suite cost was 0 was scheduled hourly with real
 * Anthropic billing. PR #49 + PR #55 closed 6 caps; this PR's
 * migration block 0064 closes 73 more.
 *
 * The compound-PR failure pattern that produced the leak (cadence
 * change ships while compensating cost-bump deferred, deferral isn't a
 * hard merge-block) can recur unless we make "LLM capability with cost
 * = 0" a structural impossibility in CI. This test is that gate.
 *
 * Every file under `apps/api/src/capabilities/` that imports
 * `@anthropic-ai/sdk` must be registered in one of:
 *   - ALWAYS_LLM_CAPABILITY_COSTS (with value > 0)
 *   - CONDITIONAL_LLM_CAPABILITIES (with documented bypass)
 *   - DEACTIVATED in capabilities/auto-register.ts
 *
 * A new LLM-using capability whose author forgets to register a cost
 * fails this test with an actionable message naming the slug.
 *
 * The test reads the capability source tree directly via fs — no DB
 * connection required, runs in CI under the standard `vitest run`.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ALWAYS_LLM_CAPABILITY_COSTS,
  BLOCK_0064_SLUGS,
  CONDITIONAL_LLM_CAPABILITIES,
} from "./llm-capability-costs.js";
import { getDeactivatedCapabilities } from "../capabilities/auto-register.js";

/** Resolve the capabilities source directory from the running test file. */
function capabilitiesDir(): string {
  // __dirname equivalent for ESM via import.meta.dirname.
  // apps/api/src/lib/ + ../capabilities/ → apps/api/src/capabilities/
  return resolve(import.meta.dirname, "..", "capabilities");
}

/**
 * Walk apps/api/src/capabilities/*.ts (top level only — skip lib/,
 * providers/, *.test.ts, index.ts, auto-register.ts) and return every
 * file that imports `@anthropic-ai/sdk`.
 *
 * Slug = filename without `.ts`. Matches the registry's `registerCapability`
 * key convention (every capability file is named `<slug>.ts`).
 */
function findAnthropicSdkImporters(): string[] {
  const dir = capabilitiesDir();
  const entries = readdirSync(dir, { withFileTypes: true });
  const importers: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue; // skip lib/, providers/
    if (!entry.name.endsWith(".ts")) continue;
    if (entry.name.endsWith(".test.ts")) continue;
    if (entry.name === "index.ts") continue;
    if (entry.name === "auto-register.ts") continue;

    const filePath = resolve(dir, entry.name);
    const contents = readFileSync(filePath, "utf8");
    // Match `import ... from "@anthropic-ai/sdk"` (any quote style, any
    // import shape — default, named, namespace).
    if (/from\s+["']@anthropic-ai\/sdk["']/.test(contents)) {
      importers.push(entry.name.replace(/\.ts$/, ""));
    }
  }

  return importers.sort();
}

describe("llm-capability-costs — Phase 3 CI gate", () => {
  it("every Anthropic-SDK-importing capability is registered as always-LLM, conditional-LLM, or deactivated", () => {
    const importers = findAnthropicSdkImporters();
    const deactivated = getDeactivatedCapabilities();

    const unregistered: string[] = [];
    for (const slug of importers) {
      if (slug in ALWAYS_LLM_CAPABILITY_COSTS) continue;
      if (CONDITIONAL_LLM_CAPABILITIES.has(slug)) continue;
      if (deactivated.has(slug)) continue;
      unregistered.push(slug);
    }

    if (unregistered.length > 0) {
      const message = unregistered
        .map(
          (slug) =>
            `  - "${slug}" imports @anthropic-ai/sdk but is not registered. ` +
            `Add to ALWAYS_LLM_CAPABILITY_COSTS in apps/api/src/lib/llm-capability-costs.ts ` +
            `(with cost in cents, typically 1 for Haiku), OR to CONDITIONAL_LLM_CAPABILITIES ` +
            `(with a comment naming the bypass), OR to DEACTIVATED in auto-register.ts.`,
        )
        .join("\n");
      throw new Error(
        `${unregistered.length} LLM-using capabilities have no registered cost or status:\n${message}\n\n` +
          `This gate exists because the test scheduler dispatches on \`test_suites.external_cost_cents = 0\` ` +
          `and an LLM-using capability at cost 0 is scheduled hourly with real Anthropic billing. ` +
          `See PR #84 (audit) and the May 2026 Haiku cost-leak follow-up.`,
      );
    }

    expect(unregistered).toEqual([]);
  });

  it("every always-LLM cost entry has a value > 0", () => {
    const zeroOrNegative = Object.entries(ALWAYS_LLM_CAPABILITY_COSTS).filter(
      ([, cost]) => cost <= 0,
    );
    expect(zeroOrNegative).toEqual([]);
  });

  it("ALWAYS_LLM and CONDITIONAL_LLM sets are disjoint", () => {
    const overlap = Object.keys(ALWAYS_LLM_CAPABILITY_COSTS).filter((slug) =>
      CONDITIONAL_LLM_CAPABILITIES.has(slug),
    );
    expect(overlap).toEqual([]);
  });

  it("BLOCK_0064_SLUGS excludes the slugs owned by earlier blocks (0062 risk-narrative, 0063 invoice-extract)", () => {
    expect(BLOCK_0064_SLUGS).not.toContain("risk-narrative-generate");
    expect(BLOCK_0064_SLUGS).not.toContain("invoice-extract");
  });

  it("BLOCK_0064_SLUGS covers exactly the Haiku always-LLM caps (Object.keys(ALWAYS_LLM_CAPABILITY_COSTS) minus the two earlier-block slugs)", () => {
    const expected = Object.keys(ALWAYS_LLM_CAPABILITY_COSTS)
      .filter((s) => s !== "risk-narrative-generate" && s !== "invoice-extract")
      .sort();
    expect([...BLOCK_0064_SLUGS]).toEqual(expected);
  });
});
