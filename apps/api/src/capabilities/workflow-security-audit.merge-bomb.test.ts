/**
 * `workflow-security-audit` parses caller-supplied YAML. It must refuse a
 * merge-key bomb instead of burning the event loop on it.
 *
 * ## The finding
 *
 * VERIFY-DEP / WP13 triage, 2026-08-25. `js-yaml@4.1.1` is affected by
 * quadratic-complexity DoS in merge-key handling. This capability is the
 * reachable path: `workflow-security-audit.ts:22` calls
 * `jsYaml.load(workflow)` where `workflow` is
 * `input.workflow ?? input.yaml ?? input.content ?? input.task` — the caller's
 * request body, unparsed, with the route allowing bodies up to 1 MB. The
 * capability is live in production (`is_active = true`), and an API key is
 * free to obtain.
 *
 * Measured on 4.1.1, single-threaded, with the generator below:
 *
 *     levels   bytes    4.1.1        4.3.1
 *      1000    35 KB     612 ms      refused in 18 ms
 *      3000   117 KB    3940 ms      refused in  9 ms
 *      6000   235 KB   14188 ms      refused in 20 ms
 *
 * 235 KB of request body costs 14 seconds of CPU on the shared event loop.
 * `/v1/do`'s synchronous ceiling is 15 seconds, so one request very nearly
 * saturates it — and the ceiling bounds a single call, not concurrent ones.
 *
 * **The tests below deliberately use a 200-level chain, not those sizes.** 200
 * exceeds the budget (~20,000 merge operations against a 10,000 default) while
 * costing about 15 ms on the vulnerable version. Reviewer-found: with 3,000-
 * and 6,000-level chains, a *regression* would have made this suite itself
 * burn ~22 seconds of synchronous CPU, and Vitest's 10-second per-test timeout
 * cannot interrupt a synchronous parser — so the regression would have stalled
 * or exhausted a worker instead of producing a clean failure. A test that
 * becomes the DoS when the DoS returns is the wrong shape.
 *
 * ## What actually changed upstream, and why this is not a timing test
 *
 * Neither release made the merge faster.
 *
 *   - **4.2.0** added `maxDepth` (default 100) and fixed the repeated-alias
 *     case named in the advisory.
 *   - **4.3.0** added `maxTotalMergeKeys` (default 10,000), a document-wide
 *     budget on merge-key copy operations, and throws when it is crossed.
 *   - **4.3.1** added the `!!omap` complexity fix.
 *
 * So the fix is observable as a deterministic error, and these tests do not
 * have to measure time — which on shared CI runners is how flaky tests get
 * written. (An earlier draft asserted a five-second wall-clock bound. It was
 * dropped: one sample does not establish scaling, and the named-budget
 * assertion already gives a deterministic bound.)
 *
 * ## Fail-before
 *
 * Verified in both directions before committing. On 4.1.1 the bomb parses
 * successfully and the executor returns findings, so `rejects` fails.
 *
 * To reproduce, check which copy Node actually resolves first —
 * `createRequire(import.meta.url).resolve("js-yaml")`. A first attempt
 * downgraded the hoisted root copy while `apps/api/node_modules` held the
 * fixed version; the bomb tests passed, the vulnerable parser was never
 * loaded, and the proof established nothing. The layout is not stable across
 * checkouts, which is why the version assertion below resolves rather than
 * building a path.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import jsYaml from "js-yaml";
// Side-effect import registers just this executor. A full
// autoRegisterCapabilities() here would fire 300+ dynamic imports and starve
// parallel collection — see the note in approval-security-check.test.ts.
import "./workflow-security-audit.js";
import { getExecutor } from "./index.js";

/**
 * A merge-key chain. Level `i` merges level `i-1` and adds one key, so level
 * `i` carries `i` keys and merging it copies `i` of them. Total copy
 * operations across the document are O(n²/2) — quadratic, from linear input.
 *
 * Not a YAML *syntax* error: the positive control below parses a short chain
 * from this same generator and checks the merge actually happened. Without
 * that control these tests would pass just as happily on malformed output,
 * which is the failure mode where a test runs, finds nothing, and means
 * nothing.
 */
function mergeChain(levels: number): string {
  const lines = ["a0: &a0", "  k0: 0"];
  for (let i = 1; i <= levels; i++) {
    lines.push(`a${i}: &a${i}`, `  <<: *a${i - 1}`, `  k${i}: ${i}`);
  }
  return lines.join("\n");
}

/** ~20,000 merge operations against a 10,000 default: over budget, cheap to run. */
const OVER_BUDGET = 200;
/** ~1,250 operations: comfortably under, and still deep enough to be a real merge. */
const UNDER_BUDGET = 50;

const run = () => getExecutor("workflow-security-audit")!;

describe("workflow-security-audit refuses merge-key bombs", () => {
  it("rejects a chain that exceeds the merge-key budget", async () => {
    await expect(run()({ workflow: mergeChain(OVER_BUDGET) })).rejects.toThrow(
      /Invalid YAML/,
    );
  });

  it("names the budget in the refusal, so the cause is diagnosable", async () => {
    // The load-bearing assertion. `/Invalid YAML/` alone would match any parse
    // error, including one from a malformed generator.
    await expect(run()({ workflow: mergeChain(OVER_BUDGET) })).rejects.toThrow(
      /maxTotalMergeKeys/,
    );
  });

  it("POSITIVE CONTROL: the same generator under budget parses AND merges", async () => {
    // `expect(output).toBeTruthy()` was the original assertion here and it was
    // worth nothing: the executor always returns an output object after any
    // successful parse, so it proved the generator emits loadable YAML and
    // stopped there. Reviewer-found.
    //
    // Parsing the generator's output directly is the honest check: every level
    // must have inherited every key below it. If merges silently stopped being
    // applied, the refusal tests above would still pass while meaning nothing.
    const parsed = jsYaml.load(mergeChain(UNDER_BUDGET)) as Record<
      string,
      Record<string, number>
    >;
    const top = parsed[`a${UNDER_BUDGET}`]!;
    expect(Object.keys(top)).toHaveLength(UNDER_BUDGET + 1);
    expect(top.k0).toBe(0); // inherited all the way from level 0
    expect(top[`k${UNDER_BUDGET}`]).toBe(UNDER_BUDGET); // its own key

    // And the executor accepts it rather than refusing everything.
    const result = (await run()({ workflow: mergeChain(UNDER_BUDGET) })) as {
      output: Record<string, unknown>;
    };
    expect(result.output).toBeTruthy();
  });
});

describe("the fix does not break legitimate workflows", () => {
  /**
   * The false-positive direction. A parser that refused everything would pass
   * every test above.
   *
   * `runs-on: self-hosted` and `permissions: write-all` are declared ONLY on
   * the anchor, never on the jobs. That matters: an earlier version of this
   * fixture declared both on the job itself and asserted on the resulting
   * findings, so the assertions passed whether or not `<<` was applied — they
   * proved the audit works, not that merge semantics survived the upgrade.
   * Reviewer-found. Declared only on the anchor, each finding appears if and
   * only if the merge happened.
   */
  const anchored = [
    "name: ci",
    "on: [push]",
    "defaults: &defaults",
    "  runs-on: self-hosted",
    "  permissions: write-all",
    "jobs:",
    "  build:",
    "    <<: *defaults",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - run: npm ci",
  ].join("\n");

  it("sees the runner that was inherited through the merge key", async () => {
    const result = (await run()({ workflow: anchored })) as {
      output: { findings?: Array<Record<string, unknown>> };
    };
    // checkRunner() returns early when `runs-on` is undefined, so this finding
    // exists only if `<<: *defaults` was applied to jobs.build.
    const runner = (result.output.findings ?? []).filter(
      (f) => f.category === "runner_security" && f.location === "jobs.build",
    );
    expect(runner, "runs-on was not inherited through the merge key").toHaveLength(1);
  });

  it("sees the permissions that were inherited through the merge key", async () => {
    const result = (await run()({ workflow: anchored })) as {
      output: { findings?: Array<Record<string, unknown>> };
    };
    const perms = (result.output.findings ?? []).filter(
      (f) => f.category === "permissions_scope" && f.location === "jobs.build",
    );
    expect(perms.length, "permissions were not inherited through the merge key")
      .toBeGreaterThan(0);
  });
});

describe("the new limits, and what they cost", () => {
  /**
   * 4.2.0 added `maxDepth` (default 100). Recording it deliberately: it is a
   * behaviour change on caller input that this PR accepts rather than one it
   * discovered afterwards. A GitHub Actions workflow nested more than 100
   * levels deep is not a thing anyone writes, but the boundary is now real and
   * belongs in the record rather than in a surprise.
   */
  it("refuses YAML nested past maxDepth", async () => {
    const deep = "a:\n" + Array.from({ length: 150 }, (_, i) => "  ".repeat(i + 1) + "b:").join("\n") + "\n" + "  ".repeat(151) + "c: 1";
    await expect(run()({ workflow: deep })).rejects.toThrow(/Invalid YAML/);
  });

  it("accepts nesting at a depth real workflows actually reach", async () => {
    // A GitHub Actions workflow bottoms out around 6-8 levels
    // (jobs > name > steps > item > with > key). 20 is generous headroom.
    const nested =
      "a:\n" + Array.from({ length: 20 }, (_, i) => "  ".repeat(i + 1) + "b:").join("\n") + "\n" + "  ".repeat(21) + "c: 1";
    const result = (await run()({ workflow: nested })) as { output: unknown };
    expect(result.output).toBeTruthy();
  });
});

describe("the other production import site: manifest loading at boot", () => {
  /**
   * `capabilities/auto-register.ts:338` calls `yaml.load()` on every file in
   * `manifests/` during startup. That is the second place the upgrade could
   * break, and it breaks the whole platform if it does: no manifests parsed
   * means no capabilities registered.
   *
   * This checks **parser compatibility over the real manifest corpus** — 4.2.0
   * and 4.3.0 both added limits, and either could in principle reject a file
   * 4.1.1 accepted. A fixture cannot answer that question; the real files can.
   *
   * It is deliberately not a claim to have tested the boot path itself. The
   * registration path is exercised by `ssrf-bucket-a.test.ts`, which calls
   * `autoRegisterCapabilities()` directly, and was additionally run by hand
   * against 4.3.1 for this change: 321 executors, 4 providers, 0 errors.
   */
  const manifestsDir = resolve(import.meta.dirname, "..", "..", "..", "..", "manifests");

  it("parses every real manifest, with a slug matching its filename", () => {
    const files = readdirSync(manifestsDir).filter(
      (f) => f.endsWith(".yaml") || f.endsWith(".yml"),
    );
    expect(files.length).toBeGreaterThan(100); // guards against an empty glob

    const failures: string[] = [];
    for (const file of files) {
      const raw = readFileSync(resolve(manifestsDir, file), "utf8");
      try {
        const parsed = jsYaml.load(raw) as { slug?: string } | null;
        if (typeof parsed?.slug !== "string" || parsed.slug.length === 0) {
          failures.push(`${file}: no slug`);
        } else if (parsed.slug !== file.replace(/\.(yaml|yml)$/, "")) {
          failures.push(`${file}: slug is ${parsed.slug}`);
        }
      } catch (e) {
        failures.push(`${file}: ${(e as Error).message.split("\n")[0]}`);
      }
    }
    expect(failures, `manifests js-yaml will not load:\n${failures.join("\n")}`).toEqual(
      [],
    );
  });
});

describe("js-yaml is declared where production code can rely on it", () => {
  /**
   * `js-yaml` was a devDependency of `apps/api` while two production paths
   * imported it: the boot-time manifest read and this capability.
   *
   * **The original justification for this move was wrong, and the correction
   * is worth more than the claim was.** The triage asserted that a production
   * install with `--omit=dev` would crash at boot with no capabilities
   * registered. It would not. There is a second, entirely production-side
   * chain to the same package:
   *
   *     apps/api → c2pa-node → @changesets/cli → @changesets/parse → js-yaml ^4.1.1
   *
   * No `dev: true` marker anywhere on it, so `npm ci --omit=dev` installs
   * js-yaml regardless. Reviewer-found, and verified against the pre-PR
   * lockfile before this comment was written.
   *
   * The real defect is quieter. With the direct declaration dev-only, the
   * version that lands at `node_modules/js-yaml` in a production install is
   * decided by `@changesets/parse`'s `^4.1.1` — a range belonging to a
   * changelog tool that `c2pa-node` should not be shipping as a runtime
   * dependency in the first place. Production parser behaviour was a
   * side-effect of someone else's build tooling, and dropping or bumping
   * `c2pa-node` could have changed or removed it with no signal here.
   *
   * That is why the declaration matters, and it is also why the upgrade
   * without the move would have been insufficient: the range would still have
   * permitted 4.1.1.
   */
  it("is a dependency, not a devDependency", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "..", "..", "package.json"), "utf8"),
    ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

    expect(pkg.dependencies["js-yaml"]).toBeDefined();
    expect(pkg.devDependencies["js-yaml"]).toBeUndefined();
  });

  it("resolves to a version at or above the one that added the merge-key budget", () => {
    // RESOLVED, not a hand-built path to the hoisted root copy. Which copy
    // wins is not stable across checkouts, and asserting on the wrong one is
    // what made the first fail-before proof vacuous.
    const version = createRequire(import.meta.url)("js-yaml/package.json")
      .version as string;

    const [maj, min, patch] = version.split(".").map(Number);
    const atLeast430 = maj! > 4 || (maj === 4 && (min! > 3 || (min === 3 && patch! >= 0)));
    expect(atLeast430, `js-yaml ${version} predates maxTotalMergeKeys`).toBe(true);
  });
});
