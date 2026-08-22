/**
 * What suppresses an alert, and what must never suppress one.
 *
 * The rules are asserted as a PURE PREDICATE with an injected environment, plus
 * ONE child process that proves the predicate is actually wired into sendAlert.
 *
 * An earlier revision spawned a `tsx` child per permutation. Together with this
 * package's other new tests that came to sixteen spawns, which loaded the
 * machine enough that `admin-apply-migrations.test.ts` hit its 30-second
 * registry-bootstrap hookTimeout in a serial run — a test failing three
 * directories away because of how this one was written. Environment properties
 * still get a real environment where it matters; they just do not each get
 * their own process.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { isTestRunner, suppressionReason } from "../src/lib/alerting.js";

describe("NODE_ENV is not a suppression signal", () => {
  it("NODE_ENV=test does NOT suppress", () => {
    // The footgun. A production deploy with NODE_ENV mis-set to "test" would
    // have silently swallowed every page — including the settlement-volume-drop
    // alert that exists to catch a total revenue stoppage — and
    // assertAlertingConfigured stays quiet too, because it returns early when
    // NODE_ENV is not "production".
    expect(suppressionReason({ NODE_ENV: "test" })).toBeNull();
    expect(isTestRunner({ NODE_ENV: "test" })).toBe(false);
  });

  it("NODE_ENV=production does not suppress either", () => {
    expect(suppressionReason({ NODE_ENV: "production" })).toBeNull();
  });

  it("an empty environment does not suppress", () => {
    // Default-deny is right for writes and wrong for alerting: the failure of a
    // paging channel must be loud, not silent.
    expect(suppressionReason({})).toBeNull();
  });
});

describe("what does suppress", () => {
  it("the vitest signal, in both spellings", () => {
    expect(suppressionReason({ VITEST: "true" })).toBe("test_runner");
    expect(suppressionReason({ VITEST: "1" })).toBe("test_runner");
  });

  it("an explicit ALERT_SUPPRESS, reported as asked-for", () => {
    expect(suppressionReason({ ALERT_SUPPRESS: "true", NODE_ENV: "production" })).toBe(
      "alert_suppress_requested",
    );
  });

  it("ALERT_ALLOW_IN_TEST overrides the vitest signal", () => {
    expect(
      suppressionReason({ VITEST: "true", ALERT_ALLOW_IN_TEST: "true" }),
    ).toBeNull();
  });

  it("a non-'true' ALERT_SUPPRESS does not suppress", () => {
    // Suppression is opt-in on an exact value, so `ALERT_SUPPRESS=false` or a
    // stray `0` cannot silence paging by accident.
    expect(suppressionReason({ ALERT_SUPPRESS: "false" })).toBeNull();
    expect(suppressionReason({ ALERT_SUPPRESS: "1" })).toBeNull();
  });
});

describe("the predicate is actually wired into sendAlert", () => {
  // One child process, because a predicate nothing calls is worth nothing. With
  // no RESEND_API_KEY, a call that reaches the backend logs `alerting-no-api-key`
  // and a call the gate stops logs `alerting-suppressed`. No network, no mock.
  let dir: string;
  let out: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "alert-env-"));
    const alerting = resolve(import.meta.dirname, "..", "src", "lib", "alerting.ts").replace(
      /\\/g,
      "/",
    );
    const file = join(dir, "probe.ts");
    writeFileSync(
      file,
      // No top-level await: a temp file outside the package gets tsx's CJS
      // transform, which rejects it with an opaque "Transform failed".
      `import { sendAlert } from "${alerting}";
async function main() {
  await sendAlert({ subject: "probe", body: "b", severity: "critical" });
}
main();
`,
    );
    const tsx = resolve(
      import.meta.dirname,
      "..",
      "..",
      "..",
      "node_modules",
      "tsx",
      "dist",
      "cli.mjs",
    );
    try {
      out = execFileSync(process.execPath, [tsx, file], {
        // NODE_ENV=test and NO VITEST: the exact shape of the footgun.
        env: {
          PATH: process.env.PATH ?? "",
          SystemRoot: process.env.SystemRoot ?? "",
          NODE_ENV: "test",
        },
        encoding: "utf8",
        stdio: "pipe",
        timeout: 60_000,
      });
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      out = (e.stdout ?? "") + (e.stderr ?? "");
    }
  }, 90_000);

  afterAll(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  });

  it("a real process with NODE_ENV=test still reaches the backend", () => {
    expect(out).toContain("alerting-no-api-key");
    expect(out).not.toContain("alerting-suppressed");
  });
});
