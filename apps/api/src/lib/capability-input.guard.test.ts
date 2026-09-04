/**
 * One reader for list-shaped capability input.
 *
 * `readStringArray` / `readArray` are only an authority if nothing is allowed
 * to hand-roll the thing they replaced. The 2026-09-04 incident was not one
 * bug in one executor: the same cast had been copy-pasted across the
 * capabilities directory, and several executors were crashing in production
 * simultaneously for the same reason while the rest sat latent, waiting for a
 * caller to send the wrong shape.
 *
 * A cast is invisible to the compiler by construction — `as` is an assertion,
 * not a check — so tsc will never catch the next copy. This guard is what
 * makes the shared reader an authority rather than a convention.
 *
 * WHAT THIS GUARD DOES NOT COVER. An earlier version of this test matched only
 * the exact `?? []` idiom, and independent review found two live capabilities
 * it missed for that reason alone: `classify-text` had no `??` clause at all,
 * and `github-actions-generate` defaulted to a non-empty literal. Both crashed
 * on `.join` for a bare-string input — the very defect this file exists to
 * stop — while this test stayed green. The pattern below is therefore keyed on
 * the CAST, not on the default expression that follows it.
 *
 * It is still a regex over source text, and these spellings would evade it:
 *   - a destructured local:  `const { languages } = input; languages as string[]`
 *   - an aliased variable:   `const raw = input.languages; raw as string[]`
 * Neither exists in the tree today (checked), and matching them needs real
 * type-aware analysis rather than a line scan. Saying so here is the honest
 * scope of the guarantee: this guard closes the copy-paste path, which is how
 * every instance actually arrived, not every conceivable one.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CAPABILITIES_DIR = join(import.meta.dirname, "..", "capabilities");

/**
 * A cast of a caller-supplied `input.<field>` to an array-shaped type —
 * `T[]`, `Array<T>` or `ReadonlyArray<T>` — however it is defaulted
 * afterwards, or not defaulted at all.
 */
const RAW_INPUT_ARRAY_CAST =
  /\binput\.[A-Za-z0-9_]+\s+as\s+[^;=)]*(?:\[\]|Array<)/;

function sourceFiles(): string[] {
  return readdirSync(CAPABILITIES_DIR)
    .filter((f) => f.endsWith(".ts"))
    .filter((f) => !f.endsWith(".test.ts") && !f.endsWith(".d.ts"));
}

describe("list-shaped capability input has exactly one reader", () => {
  it("no executor casts a caller-supplied input straight to an array", () => {
    const offenders: string[] = [];

    for (const file of sourceFiles()) {
      const source = readFileSync(join(CAPABILITIES_DIR, file), "utf8");

      source.split(/\r?\n/).forEach((line, i) => {
        if (RAW_INPUT_ARRAY_CAST.test(line)) {
          offenders.push(`${file}:${i + 1}  ${line.trim()}`);
        }
      });
    }

    expect(
      offenders,
      'Use readStringArray(input.x, "x") — or readArray for a list of\n' +
        "objects — from lib/capability-input.ts.\n" +
        "`as T[]` is an assertion the compiler cannot verify: a bare string\n" +
        "survives it, passes .length checks, and then either crashes on .map\n" +
        "/.join or, worse, iterates its own characters in a for…of.\n" +
        "An Array.isArray() check nearby is not enough — this guard keeps one\n" +
        "reader so there is no second place for the rule to drift to.\n" +
        "Offending lines:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("the pattern matches every shape actually found in the tree", () => {
    // A guard nobody has proved can fail is not a guard. Every line here was
    // removed from the tree by this change. The last four are the ones the
    // narrower `?? []` version of this regex silently let through.
    const historical = [
      'const languages = (input.languages as string[]) ?? [];',
      'const timezones = (input.timezones as string[]) ?? [];',
      'const keywords = (input.keywords as string[]) ?? [];',
      'const goodExamples = (input.good_examples as string[]) ?? [];',
      'const testStrings = (input.test_strings as string[]) ?? [];',
      // No `??` clause at all — classify-text, crashing on .join in production.
      'const categories = input.categories as string[] | undefined;',
      // Non-empty default literal — github-actions-generate, same crash.
      'const triggers = (input.triggers as string[]) ?? ["push", "pull_request"];',
      // Array<T> generic spelling, object element type — fake-data-generate.
      'const fields = input.fields as Array<{ name: string; type: string }> | undefined;',
      'const data = input.data as Array<Record<string, unknown>> | undefined;',
    ];

    for (const line of historical) {
      expect(RAW_INPUT_ARRAY_CAST.test(line), `should flag: ${line}`).toBe(true);
    }
  });

  it("the pattern does not flag the fixed shape or non-array casts", () => {
    const allowed = [
      'const languages = readStringArray(input.languages, "languages");',
      'const rules = readArray(input.rules, "rules") as Array<{ field: string }>;',
      // Scalar casts are not this guard's business.
      'const text = ((input.text as string) ?? "").trim();',
      'const maxTokens = (input.max_tokens as number) ?? 4000;',
      'const year = (input.year as string | number | undefined) ? String(input.year) : undefined;',
      // Upstream API response, not caller input — different owner, and the
      // reason this regex is anchored on `input.` rather than any `as T[]`.
      'const aliases = (v.aliases as string[]) ?? [];',
      'for (const range of a.ranges ?? []) {',
    ];

    for (const line of allowed) {
      expect(RAW_INPUT_ARRAY_CAST.test(line), `should allow: ${line}`).toBe(
        false,
      );
    }
  });
});
