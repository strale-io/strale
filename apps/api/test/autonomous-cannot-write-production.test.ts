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

import {
  assertCannotMintGrants,
  autonomousAuthority,
  AUTONOMOUS_PURPOSES,
  ProductionAuthorityError,
  requireFounderGrant,
} from "../src/lib/production-authority.js";

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

  // The cases below inject the environment directly rather than spawning.
  // requireFounderGrant and assertCannotMintGrants both take `env`, so a child
  // process buys nothing here — and sixteen spawns across this package's tests
  // pushed a neighbouring file past its 30s bootstrap hookTimeout in a serial
  // run. The end-to-end proof above still runs in a real process.

  it("a string that claims founder approval has zero authority", () => {
    // Verbatim from the audit rows the incident produced. Prose is not a grant.
    expect(() =>
      requireFounderGrant("close_stranded_executing_rows", {
        env: {
          STRALE_FOUNDER_GRANT:
            "founder approval, 2026-08-21 stranded-row reconciliation",
        },
      }),
    ).toThrow(ProductionAuthorityError);
  });

  it("even a well-formed but unsigned grant token is refused", () => {
    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const token = `v1.g1.close_stranded_executing_rows.${expiry}.${Buffer.from(
      "not-a-real-signature",
    ).toString("base64url")}`;

    expect(() =>
      requireFounderGrant("close_stranded_executing_rows", {
        env: { STRALE_FOUNDER_GRANT: token },
      }),
    ).toThrow(ProductionAuthorityError);
  });

  it("refuses outright in a process that could mint its own grants", () => {
    // The assumption the whole model rests on. If a signing key is reachable,
    // a verified grant proves nothing, and the module must say so rather than
    // hand back an authority record that looks trustworthy.
    for (const key of [
      "STRALE_FOUNDER_GRANT_PRIVATE_KEY",
      "STRALE_FOUNDER_GRANT_SECRET",
      "STRALE_FOUNDER_GRANT_SIGNING_KEY",
    ]) {
      expect(() =>
        assertCannotMintGrants({ [key]: "-----BEGIN PRIVATE KEY-----" }),
        `${key} must make verification refuse`,
      ).toThrow(ProductionAuthorityError);
    }
    // …and an environment without one is fine.
    expect(() => assertCannotMintGrants({})).not.toThrow();
  });
});

describe("autonomous and founder-gated are distinct capabilities", () => {
  it("a delegated purpose yields authority", () => {
    // The boundary is a boundary, not a wall: delegated work must still run
    // without the founder, or the platform stops operating and the control
    // gets removed for being in the way.
    const ok = autonomousAuthority("quality_floor_quarantine", "DEC-20260812-A");
    expect(ok.kind).toBe("AUTONOMOUS_POLICY");
  });

  it("a reserved action cannot be reached by relabelling it as delegated", () => {
    expect(() =>
      autonomousAuthority("issue_wallet_refund" as never, "DEC-20260815-A"),
    ).toThrow(ProductionAuthorityError);
  });

  it("nor by asking for a grant this session cannot produce", () => {
    expect(() => requireFounderGrant("issue_wallet_refund", { env: {} })).toThrow(
      ProductionAuthorityError,
    );
  });

  it("money and lifecycle purposes are absent from the delegated list", () => {
    // Founder-gated by OMISSION is the design. Assert the omission, so adding
    // one of these to AUTONOMOUS_PURPOSES has to break a test and be argued for
    // in review rather than slipped in.
    for (const reserved of [
      "issue_wallet_refund",
      "close_stranded_executing_rows",
      "wallet_topup",
      "seed_sellable_solutions",
      "reverse_x402_settlement",
    ]) {
      expect(
        (AUTONOMOUS_PURPOSES as readonly string[]).includes(reserved),
        `${reserved} must not be delegated`,
      ).toBe(false);
    }
  });
});
