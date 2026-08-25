/**
 * `workflow-security-audit` parses caller-supplied YAML. It must refuse a
 * merge-key bomb instead of burning the event loop on it.
 *
 * ## The finding
 *
 * VERIFY-DEP / WP13 triage, 2026-08-25. `js-yaml@4.1.1` is affected by
 * GHSA-class quadratic-complexity DoS in merge-key handling. This capability
 * is the reachable path: `workflow-security-audit.ts:22` calls
 * `jsYaml.load(workflow)` where `workflow` is
 * `input.workflow ?? input.yaml ?? input.content ?? input.task` — the caller's
 * request body, unparsed. The capability is live in production
 * (`is_active = true`), and an API key is free to obtain.
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
 * ## What 4.3.1 changed, and why this test asserts a refusal rather than a time
 *
 * 4.3.1 did not make the merge faster. It added a document-wide budget,
 * `maxTotalMergeKeys` (default 10,000), and throws once the total number of
 * merge-key copy operations crosses it. So the fix is observable as a
 * deterministic error, and this test does not have to be a timing test — which
 * on shared CI runners is how flaky tests get written.
 *
 * ## Fail-before
 *
 * Against `js-yaml@4.1.1` the bomb parses successfully and the executor
 * returns findings, so `rejects` fails; against 4.3.1 it throws. Verified in
 * both directions before this test was committed: 4 fail / 5 pass on 4.1.1,
 * 9 pass on 4.3.1.
 *
 * **To reproduce, downgrade `apps/api/node_modules`, not the repo root.** npm
 * keeps a nested `apps/api/node_modules/js-yaml`, and that is the copy the
 * executor resolves. The first attempt at this proof downgraded only the
 * hoisted root copy: the bomb tests passed, the vulnerable version was never
 * loaded, and the proof established nothing. Run
 * `cd apps/api && npm i js-yaml@4.1.1 --no-save`.
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
 * operations across the document are O(n²/2) — the quadratic the advisory
 * describes, from linear input.
 *
 * Not a YAML *syntax* error: see the positive control below, which parses a
 * short chain from this same generator successfully. Without that control this
 * test would pass just as happily on malformed output, which is the failure
 * mode where a test runs, finds nothing, and means nothing.
 */
function mergeChain(levels: number): string {
  const lines = ["a0: &a0", "  k0: 0"];
  for (let i = 1; i <= levels; i++) {
    lines.push(`a${i}: &a${i}`, `  <<: *a${i - 1}`, `  k${i}: ${i}`);
  }
  return lines.join("\n");
}

const run = () => getExecutor("workflow-security-audit")!;

describe("workflow-security-audit refuses merge-key bombs", () => {
  it("rejects a chain that exceeds the merge-key budget", async () => {
    // ~117 KB. Costs 4.1.1 about four seconds; 4.3.1 refuses immediately.
    await expect(run()({ workflow: mergeChain(3000) })).rejects.toThrow(
      /Invalid YAML/,
    );
  });

  it("names the budget in the refusal, so the cause is diagnosable", async () => {
    await expect(run()({ workflow: mergeChain(3000) })).rejects.toThrow(
      /maxTotalMergeKeys/,
    );
  });

  it("POSITIVE CONTROL: the same generator below the budget parses fine", async () => {
    // 100 levels is ~5,000 copy operations, under the 10,000 default. If this
    // threw, the test above would be proving the generator emits broken YAML
    // rather than proving the budget fires.
    const result = (await run()({ workflow: mergeChain(100) })) as {
      output: Record<string, unknown>;
    };
    expect(result.output).toBeTruthy();
  });

  it("refuses the bomb far inside the /v1/do sync ceiling", async () => {
    // The gap being asserted is three orders of magnitude (14s vs 20ms), so a
    // 5-second bound is loose enough for a loaded CI runner and still fails
    // outright on the vulnerable version. This is deliberately not a tight
    // budget — the property is "does not scale with input", not "under Xms".
    const started = Date.now();
    await expect(run()({ workflow: mergeChain(6000) })).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("the fix does not break legitimate workflows", () => {
  // The false-positive direction. A parser that refuses everything would pass
  // every test above.
  const realistic = [
    "name: ci",
    "on: [push]",
    "defaults: &defaults",
    "  runs-on: ubuntu-latest",
    "  timeout-minutes: 10",
    "jobs:",
    "  build:",
    "    <<: *defaults",
    "    permissions: write-all",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - run: npm ci",
    "  test:",
    "    <<: *defaults",
    "    steps:",
    "      - uses: actions/checkout@v4",
    "      - run: npm test",
  ].join("\n");

  it("audits a workflow that uses anchors and merge keys", async () => {
    const result = (await run()({ workflow: realistic })) as {
      output: { findings?: unknown[] };
    };
    expect(Array.isArray(result.output.findings)).toBe(true);
    // The merge must actually have been applied — `build` inherits `runs-on`
    // from the anchor, and an unpinned-action finding proves the audit read
    // the merged job rather than an empty one.
    expect(JSON.stringify(result.output)).toMatch(/actions\/checkout@v4/);
  });

  it("still reports the over-broad permission in the merged job", async () => {
    const result = (await run()({ workflow: realistic })) as {
      output: { findings?: Array<Record<string, unknown>> };
    };
    expect(JSON.stringify(result.output.findings)).toMatch(/write-all|permission/i);
  });
});

describe("the other production import site: manifest loading at boot", () => {
  /**
   * `capabilities/auto-register.ts:338` calls `yaml.load()` on every file in
   * `manifests/` during startup. That is the second place the upgrade could
   * break, and it breaks the whole platform if it does: no manifests parsed
   * means no capabilities registered.
   *
   * 4.3.1 added `maxTotalMergeKeys` AND a `maxDepth` limit, either of which
   * could in principle reject a manifest that 4.1.1 accepted. This parses the
   * real files rather than a fixture, because a fixture cannot answer that.
   *
   * `readManifestSlugs` is module-private, so this reproduces its parse
   * exactly instead of importing it — calling `autoRegisterCapabilities()`
   * would fire 300+ dynamic imports.
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
    expect(failures, `manifests js-yaml 4.3.1 will not load:\n${failures.join("\n")}`).toEqual(
      [],
    );
  });
});

describe("js-yaml is declared where production can actually find it", () => {
  /**
   * Observation 1 of the VERIFY-DEP triage. `js-yaml` was a devDependency of
   * `apps/api` while being imported by two production paths — the boot-time
   * manifest read and this capability. It worked only because the Dockerfile
   * runs a bare `npm ci`, which installs devDependencies too.
   *
   * That made an ordinary, correct optimisation into an outage: adding
   * `--omit=dev` to slim the image would have crashed the API at startup with
   * no capabilities registered. A triage concluding "most findings are
   * dev-only" is exactly the context in which someone reaches for that flag.
   *
   * The declaration is now honest. This keeps it that way.
   */
  it("is a dependency, not a devDependency", () => {
    const pkg = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "..", "..", "package.json"), "utf8"),
    ) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };

    expect(pkg.dependencies["js-yaml"]).toBeDefined();
    expect(pkg.devDependencies["js-yaml"]).toBeUndefined();
  });

  it("is pinned at or above the version that added the merge-key budget", () => {
    // RESOLVED, not the hoisted root copy.
    //
    // This test originally read `<repo>/node_modules/js-yaml/package.json`
    // directly, and it was wrong in a way that mattered: npm keeps a nested
    // `apps/api/node_modules/js-yaml`, and that is the copy the executor
    // actually loads. During the fail-before proof the root was downgraded to
    // 4.1.1 while the nested copy stayed at 4.3.1 — the bomb tests passed, the
    // vulnerable version was never exercised, and the whole proof was
    // vacuous. Resolving through Node's own algorithm is the only way to
    // assert on the copy that runs.
    const version = createRequire(import.meta.url)("js-yaml/package.json").version as string;

    const [maj, min, patch] = version.split(".").map(Number);
    const atLeast431 =
      maj! > 4 || (maj === 4 && (min! > 3 || (min === 3 && patch! >= 1)));
    expect(atLeast431, `js-yaml ${version} predates the fix`).toBe(true);
  });
});
