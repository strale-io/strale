/**
 * What suppresses an alert, and what must never suppress one.
 *
 * These run in CHILD PROCESSES on purpose. The property is about the process
 * environment, and the only honest way to assert "NODE_ENV=test does not
 * suppress" is to run a process where NODE_ENV is test and VITEST is not set.
 *
 * An earlier revision asserted this in-process by deleting `process.env.VITEST`
 * inside a worker. That perturbed the runner's own state and took down seven
 * unrelated tests in files sharing the worker — the second time in this package
 * that mutating shared process state to test an environment property broke
 * something three directories away. Environment properties get a real
 * environment.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ALERTING = resolve(
  import.meta.dirname,
  "..",
  "src",
  "lib",
  "alerting.ts",
).replace(/\\/g, "/");

const TSX = resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "node_modules",
  "tsx",
  "dist",
  "cli.mjs",
);

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "alert-env-"));
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

/**
 * Send a critical alert with NO Resend key and report which branch was taken.
 *
 * With no key, a call that gets PAST the gate logs `alerting-no-api-key`; a
 * call the gate stops logs `alerting-suppressed`. That distinction is the whole
 * assertion, and it needs no network and no mock.
 */
function probe(env: Record<string, string>): string {
  const file = join(dir, `probe-${Object.keys(env).join("-") || "bare"}.ts`);
  writeFileSync(
    file,
    // No top-level await: a temp file outside the package gets tsx's CJS
    // transform, which rejects it with "Transform failed" rather than anything
    // that names the real problem.
    `import { sendAlert } from "${ALERTING}";
async function main() {
  await sendAlert({ subject: "probe", body: "b", severity: "critical" });
}
main();
`,
  );
  try {
    return execFileSync(process.execPath, [TSX, file], {
      env: {
        PATH: process.env.PATH ?? "",
        SystemRoot: process.env.SystemRoot ?? "",
        ...env,
      },
      encoding: "utf8",
      stdio: "pipe",
      timeout: 60_000,
    });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string };
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

describe("NODE_ENV is not a suppression signal", () => {
  it("NODE_ENV=test does NOT suppress a critical page", () => {
    // The footgun. A production deploy with NODE_ENV mis-set to "test" would
    // have silently swallowed every page — including the settlement-volume-drop
    // alert that exists to catch a total revenue stoppage — and
    // assertAlertingConfigured stays quiet too, because it returns early when
    // NODE_ENV is not "production". Only VITEST suppresses now.
    const out = probe({ NODE_ENV: "test" });
    expect(out).toContain("alerting-no-api-key");
    expect(out).not.toContain("alerting-suppressed");
  }, 90_000);

  it("NODE_ENV=production reaches the backend too", () => {
    const out = probe({ NODE_ENV: "production" });
    expect(out).toContain("alerting-no-api-key");
    expect(out).not.toContain("alerting-suppressed");
  }, 90_000);
});

describe("what does suppress", () => {
  it("the vitest signal suppresses", () => {
    const out = probe({ VITEST: "true", NODE_ENV: "production" });
    expect(out).toContain("alerting-suppressed");
    expect(out).toContain("test_runner");
  }, 90_000);

  it("an explicit ALERT_SUPPRESS suppresses, and says it was asked for", () => {
    // Suppression outside a test runner is now always something someone
    // requested, never something inferred from an ambient variable.
    const out = probe({ ALERT_SUPPRESS: "true", NODE_ENV: "production" });
    expect(out).toContain("alerting-suppressed");
    expect(out).toContain("alert_suppress_requested");
  }, 90_000);

  it("ALERT_ALLOW_IN_TEST overrides the vitest signal", () => {
    const out = probe({ VITEST: "true", ALERT_ALLOW_IN_TEST: "true" });
    expect(out).toContain("alerting-no-api-key");
    expect(out).not.toContain("alerting-suppressed");
  }, 90_000);
});
