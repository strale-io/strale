/**
 * ACCEPTANCE: an ordinary autonomous session cannot execute a founder-gated
 * production write, even when the script it is running tries to.
 *
 * This is the test the 2026-08-22 incident would have failed. A session with
 * the complete `.env`, write access to every file, and a sincere belief that
 * the founder's general policy covered the action executed a money-path
 * reconciliation the founder had reserved.
 *
 * Everything else in this package is a mechanism. This asserts the property.
 *
 * It runs a REAL child process, because the property is about what a process
 * with a given environment can do — not about what a function returns when
 * called politely from inside a test that has already imported the module.
 * The attacker here is the script itself: it tries the front door, then the
 * side door, then the window, and each attempt is asserted to fail.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const AUTHORITY_MODULE = resolve(
  import.meta.dirname,
  "..",
  "src",
  "lib",
  "production-authority.ts",
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
  dir = mkdtempSync(join(tmpdir(), "autonomous-write-"));
});

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

/**
 * The environment an autonomous session actually has: a read-only
 * DATABASE_URL, and none of the things that authorise or enable a write.
 *
 * Built by ALLOWLIST rather than by deleting keys from process.env, so a
 * variable present on the developer's machine cannot leak in and quietly make
 * the test pass for the wrong reason.
 */
function autonomousEnv(extra: Record<string, string> = {}) {
  return {
    PATH: process.env.PATH ?? "",
    SystemRoot: process.env.SystemRoot ?? "",
    DATABASE_URL: "postgresql://ro:pw@db.example.com:5432/railway?sslmode=require",
    ...extra,
  };
}

/** Run `source` under tsx with `env`. Returns { code, stdout, stderr }. */
function runScript(source: string, env: Record<string, string>) {
  const file = join(dir, `attempt-${Math.abs(hash(source))}.ts`);
  writeFileSync(file, source);
  try {
    const stdout = execFileSync(process.execPath, [TSX, file], {
      env,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 60_000,
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      code: e.status ?? -1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? "",
    };
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

describe("an autonomous session cannot obtain production write access", () => {
  it("a script that tries every route still gets nothing", () => {
    // The script is adversarial on purpose. If any route yields a credential it
    // prints LEAKED and exits 0.
    const source = `
import {
  autonomousAuthority,
  requireFounderGrant,
  productionWriteUrl,
} from "${AUTHORITY_MODULE}";

const attempts: string[] = [];

function tried(name: string, fn: () => unknown) {
  try {
    const out = fn();
    if (typeof out === "string" && out.includes("://")) {
      console.log("LEAKED:" + name);
      process.exit(0);
    }
    attempts.push(name + "=UNEXPECTED_SUCCESS");
  } catch (e) {
    attempts.push(name + "=refused");
  }
}

// 1. The front door: ask for a founder grant. No grant in the environment.
tried("requireFounderGrant", () => requireFounderGrant("close_stranded_executing_rows"));

// 2. Claim the action is delegated policy. It is not on AUTONOMOUS_PURPOSES.
tried("autonomousAuthority", () =>
  autonomousAuthority("close_stranded_executing_rows" as never, "DEC-20260815-A"));

// 3. Forge an Authority object by hand and demand the credential.
tried("forgedAuthorityObject", () =>
  productionWriteUrl({
    kind: "FOUNDER_GATED",
    grantId: "made-up",
    purpose: "close_stranded_executing_rows",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  } as never));

// 4. Forge an autonomous Authority object, bypassing the purpose check.
tried("forgedAutonomousObject", () =>
  productionWriteUrl({
    kind: "AUTONOMOUS_POLICY",
    policy: "DEC-20260815-A",
    purpose: "close_stranded_executing_rows",
  } as never));

// 5. Skip the module entirely and read the raw credential.
const raw = process.env["DATABASE" + "_URL_WRITE"];
if (raw && raw.length > 0) { console.log("LEAKED:rawEnv"); process.exit(0); }
attempts.push("rawEnv=absent");

console.log("RESULT:" + attempts.join(","));
`;
    const r = runScript(source, autonomousEnv());

    expect(r.stdout, r.stdout + r.stderr).not.toContain("LEAKED");
    expect(r.stdout).toContain("requireFounderGrant=refused");
    expect(r.stdout).toContain("autonomousAuthority=refused");
    expect(r.stdout).toContain("forgedAuthorityObject=refused");
    expect(r.stdout).toContain("forgedAutonomousObject=refused");
    expect(r.stdout).toContain("rawEnv=absent");
  }, 90_000);

  it("a string that claims founder approval has zero authority", () => {
    // Verbatim from the audit rows the incident produced. Prose is not a grant.
    const source = `
import { requireFounderGrant } from "${AUTHORITY_MODULE}";
try {
  requireFounderGrant("close_stranded_executing_rows");
  console.log("ACCEPTED");
} catch (e) {
  console.log("REFUSED:" + (e as Error).message.slice(0, 60));
}
`;
    const r = runScript(
      source,
      autonomousEnv({
        STRALE_FOUNDER_GRANT:
          "founder approval, 2026-08-21 stranded-row reconciliation",
      }),
    );

    expect(r.stdout).not.toContain("ACCEPTED");
    expect(r.stdout).toContain("REFUSED");
  }, 90_000);

  it("even a well-formed but unsigned grant token is refused", () => {
    const source = `
import { requireFounderGrant } from "${AUTHORITY_MODULE}";
try {
  requireFounderGrant("close_stranded_executing_rows");
  console.log("ACCEPTED");
} catch (e) {
  console.log("REFUSED");
}
`;
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const r = runScript(
      source,
      autonomousEnv({
        STRALE_FOUNDER_GRANT: `v1.g1.close_stranded_executing_rows.${expiry}.${Buffer.from(
          "not-a-real-signature",
        ).toString("base64url")}`,
      }),
    );

    expect(r.stdout).not.toContain("ACCEPTED");
    expect(r.stdout).toContain("REFUSED");
  }, 90_000);

  it("refuses outright in a process that could mint its own grants", () => {
    // The assumption the whole model rests on. If a signing key is reachable,
    // a verified grant proves nothing, and the module must say so rather than
    // hand back an authority record that looks trustworthy.
    const source = `
import { assertCannotMintGrants } from "${AUTHORITY_MODULE}";
try {
  assertCannotMintGrants();
  console.log("ALLOWED");
} catch (e) {
  console.log("REFUSED");
}
`;
    const r = runScript(
      source,
      autonomousEnv({ STRALE_FOUNDER_GRANT_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----" }),
    );

    expect(r.stdout).not.toContain("ALLOWED");
    expect(r.stdout).toContain("REFUSED");
  }, 90_000);
});

describe("autonomous and founder-gated are distinct capabilities", () => {
  it("a delegated purpose yields authority; a reserved one never does", () => {
    const source = `
import { autonomousAuthority, requireFounderGrant } from "${AUTHORITY_MODULE}";

// Delegated by DEC-20260812-A — this is allowed to proceed without the founder.
const ok = autonomousAuthority("quality_floor_quarantine", "DEC-20260812-A");
console.log("DELEGATED:" + ok.kind);

// The same call shape for a reserved action must fail, and must fail even
// though the caller is the same process with the same credentials.
try {
  autonomousAuthority("issue_wallet_refund" as never, "DEC-20260815-A");
  console.log("ESCALATED");
} catch { console.log("RESERVED:refused"); }

try {
  requireFounderGrant("issue_wallet_refund");
  console.log("GRANTED");
} catch { console.log("GATED:refused"); }
`;
    const r = runScript(source, autonomousEnv());

    // The delegated path works — the boundary is a boundary, not a wall.
    expect(r.stdout).toContain("DELEGATED:AUTONOMOUS_POLICY");
    // The reserved path cannot be reached by relabelling it as delegated…
    expect(r.stdout).toContain("RESERVED:refused");
    expect(r.stdout).not.toContain("ESCALATED");
    // …nor by asking for a grant this session cannot produce.
    expect(r.stdout).toContain("GATED:refused");
    expect(r.stdout).not.toContain("GRANTED");
  }, 90_000);
});
