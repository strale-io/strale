/**
 * The write-credential guard must be discriminating, and it must be checking
 * the real tree rather than a fixture.
 *
 * The property under test is the one the whole authorization model rests on:
 * the production write credential is readable in exactly one module, and that
 * module demands an Authority before releasing it. If any other file can read
 * it, a writable connection can be opened with no authority attached.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(import.meta.dirname, "..", "..", "..");
const SCRIPT = resolve(REPO, "scripts", "guard-production-write-access.mjs");

function runGuard(...flags: string[]): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [SCRIPT, ...flags], {
      cwd: REPO,
      encoding: "utf8",
      stdio: "pipe",
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, out: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}

/**
 * Spawn the guard ONCE and share the result.
 *
 * Four separate invocations, each shelling out to git across the whole
 * repository, made this file take 39 seconds under full-suite parallel load and
 * time out — three failures that were purely the test being expensive. The
 * guard itself was rewritten onto a single `git grep` for the same reason.
 */
let report: { code: number; out: string };

beforeAll(() => {
  report = runGuard("--report");
}, 60_000);

describe("the production write credential has one door", () => {
  it("passes against the real repository", () => {
    expect(report.code, report.out).toBe(0);
  });

  it("reports exactly one authorised reader", () => {
    expect(report.code).toBe(0);
    expect(report.out).toContain("apps/api/src/lib/production-authority.ts");
    expect(report.out).toContain("offenders          : 0");
  });

  it("the authorised reader really is the only one — verified independently", () => {
    // Do not take the guard's word for its own subject. Re-derive the answer
    // with git grep, which is a different mechanism, and require it to agree.
    // A guard whose only evidence is itself is the shape this repo keeps
    // shipping by accident.
    const needle = ["DATABASE", "URL", "WRITE"].join("_");
    let hits: string[] = [];
    try {
      hits = execFileSync("git", ["grep", "-l", needle, "--", "*.ts", "*.mjs"], {
        cwd: REPO,
        encoding: "utf8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);
    } catch {
      hits = []; // git grep exits 1 on no matches
    }

    // Kept in step with AUTHORISED_READERS + AUTHORISED_MENTIONS in the guard.
    // Only production-authority.ts READS the variable; the rest name it — two
    // in prose, and operator-db.test.ts by asserting it is ABSENT, which is how
    // the refusal path gets coverage.
    const allowed = new Set([
      "apps/api/src/lib/production-authority.ts",
      "apps/api/src/lib/production-authority.test.ts",
      "apps/api/src/lib/operator-db.ts",
      "apps/api/src/lib/operator-db.test.ts",
      "scripts/guard-production-write-access.mjs",
      "apps/api/test/guard-production-write-access.test.ts",
    ]);
    const unexpected = hits.filter((p) => !allowed.has(p));
    expect(unexpected, `unexpected readers: ${unexpected.join(", ")}`).toEqual([]);
  });

  it("no operator script reaches for the application read-write pool", () => {
    expect(report.out).toContain("scripts using getDb: 0");
  });

  it("adoption is real — scripts do use the operator handle", () => {
    // A guard proving absence is only half the claim. If every script simply
    // stopped touching the database the guard would also pass, so assert the
    // positive: the boundary has actual call sites.
    let adopters: string[] = [];
    try {
      adopters = execFileSync(
        "git",
        ["grep", "-l", "openOperator", "--", "apps/api/scripts/*.ts"],
        { cwd: REPO, encoding: "utf8" },
      )
        .trim()
        .split("\n")
        .filter(Boolean);
    } catch {
      adopters = [];
    }
    expect(adopters.length).toBeGreaterThanOrEqual(15);
  });

  it("the one reader gates the credential behind an Authority", () => {
    // The guard proves exclusivity. Exclusivity is worthless if the exclusive
    // reader hands the value out unconditionally, so assert the gate is there.
    const src = readFileSync(
      resolve(REPO, "apps/api/src/lib/production-authority.ts"),
      "utf8",
    );
    expect(src).toContain("export function productionWriteUrl(authority: Authority)");
    // The refusal path for a missing/!object authority must precede the read.
    const fnStart = src.indexOf("export function productionWriteUrl");
    const body = src.slice(fnStart, fnStart + 1200);
    const refuseAt = body.indexOf("A production write requires an Authority");
    const readAt = body.indexOf(["DATABASE", "URL", "WRITE"].join("_"));
    expect(refuseAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(-1);
    expect(
      refuseAt,
      "the authority check must run before the credential is read",
    ).toBeLessThan(readAt);
  });
});
