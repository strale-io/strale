/**
 * One reader for list-shaped capability input.
 *
 * `readStringArray` is only an authority if nothing is allowed to hand-roll
 * the thing it replaced. The 2026-09-04 incident was not one bug in one
 * executor: the same line, `(input.x as T[]) ?? []`, had been copy-pasted into
 * eight files, and three of them were crashing in production simultaneously
 * for the same reason. The other five were latent, waiting for a caller to
 * send the wrong shape.
 *
 * A cast is invisible to the compiler by construction — `as` is an assertion,
 * not a check — so tsc will never catch the next copy. This guard is what
 * makes the shared reader an authority rather than a convention.
 *
 * Scope note: the pattern is only a defect when the value comes from `input`,
 * the caller-supplied object. The identical shape applied to an upstream API
 * response (cve-lookup reading OSV's `aliases`, package-security-audit reading
 * a vulnerability's `ranges`) is a different risk with a different owner, and
 * flagging it here would produce an allowlist longer than the guard.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const CAPABILITIES_DIR = join(import.meta.dirname, "..", "capabilities");

/**
 * A cast of a caller-supplied `input.<field>` to an array type, defaulted with
 * `?? []` — the exact shape that let a bare string through five `.length`
 * guards and into `.map`.
 */
const RAW_INPUT_ARRAY_CAST =
  /\binput\.[A-Za-z0-9_]+\s+as\s+[A-Za-z0-9_<>,{}\[\]| ]*\[\]\s*\)?\s*\?\?\s*\[\]/;

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
      "Use readStringArray(input.x, \"x\") from lib/capability-input.ts.\n" +
        "`as T[]` is an assertion the compiler cannot verify: a bare string\n" +
        "survives it, passes .length checks, and crashes on .map at runtime.\n" +
        "Offending lines:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("the guard's pattern actually matches the shape it claims to catch", () => {
    // A guard nobody has proved can fail is not a guard. These are the exact
    // lines removed from the tree in this change.
    const historical = [
      'const languages = (input.languages as string[]) ?? [];',
      'const timezones = (input.timezones as string[]) ?? [];',
      'const keywords = (input.keywords as string[]) ?? [];',
      'const goodExamples = (input.good_examples as string[]) ?? [];',
      'const testStrings = (input.test_strings as string[]) ?? [];',
    ];

    for (const line of historical) {
      expect(RAW_INPUT_ARRAY_CAST.test(line), `should flag: ${line}`).toBe(true);
    }
  });

  it("the guard does not flag the fixed shape or upstream-response reads", () => {
    const allowed = [
      'const languages = readStringArray(input.languages, "languages");',
      // Upstream API response, not caller input — different owner.
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
