/**
 * The write-credential guard must be discriminating, and it must be checking
 * the real tree rather than a fixture.
 *
 * The property under test is the one the whole authorization model rests on:
 * the production write credential is readable in exactly one module, and that
 * module demands an Authority before releasing it. If any other file can read
 * it, a writable connection can be opened with no authority attached.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

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

/**
 * The `handoff/` prose exemption, tested against a throwaway repository.
 *
 * Why a fixture and not an import: the guard is a top-level script that calls
 * `exit(1)` while loading, so importing it to unit-test the predicate would
 * kill the test worker the first time the real tree had an offender. It
 * resolves its own root from the working directory, so pointing it at a
 * scratch repository exercises the real code path — the same `git grep`, the
 * same allowlists — with a tree we control.
 *
 * Added 2026-08-30. Two session records that named the variable in prose, while
 * correctly describing an operator action that is genuinely outstanding, failed
 * CI. The fix that must NOT be made is editing the records; see the predicate's
 * comment in the guard.
 */
describe("prose exceptions stay narrow", () => {
  const needle = ["DATABASE", "URL", "WRITE"].join("_");
  let dir: string;
  let result: { code: number; out: string };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "guard-prose-"));
    const git = (...args: string[]) =>
      execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: "pipe" });

    git("init", "-q");
    git("config", "user.email", "t@t.invalid");
    git("config", "user.name", "t");

    const write = (rel: string, body: string) => {
      mkdirSync(dirname(join(dir, rel)), { recursive: true });
      writeFileSync(join(dir, rel), body);
    };

    // Prose in a session record — legitimate, must be allowed.
    write(
      "handoff/_general/from-code/2026-08-30-record.md",
      `Manifest limitations still need a \`${needle}\`-granted backfill.\n`,
    );
    // A SCRIPT in the same directory — a script can actually read the
    // variable, so the exemption must not follow the directory alone.
    write("handoff/_general/from-code/helper.ts", `const u = process.env.${needle};\n`);
    // Markdown outside handoff/ — still requires an explicit allowlist entry.
    write("docs/notes/stray.md", `We should use ${needle} here.\n`);
    // One immutable imported record has an exact-path exception. A sibling in
    // the same evidence directory must not inherit it.
    write(
      "archive/imports/context-pack/2026-08-31/expanded/02-CURRENT-STATE-AND-ROADMAP.md",
      `Operator writes require an ephemeral \`${needle}\`.\n`,
    );
    write(
      "archive/imports/context-pack/2026-08-31/expanded/NOT-ALLOWLISTED.md",
      `A copied note names \`${needle}\`.\n`,
    );

    git("add", "-A");
    git("commit", "-qm", "fixture");

    try {
      const out = execFileSync(process.execPath, [SCRIPT, "--report"], {
        cwd: dir,
        encoding: "utf8",
        stdio: "pipe",
      });
      result = { code: 0, out };
    } catch (err) {
      const e = err as { status?: number; stdout?: string; stderr?: string };
      result = { code: e.status ?? -1, out: (e.stdout ?? "") + (e.stderr ?? "") };
    }
  }, 60_000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("does not flag prose in a handoff record", () => {
    expect(result.out).not.toContain("2026-08-30-record.md");
  });

  it("still flags a script sitting in the same handoff directory", () => {
    // This is what makes the exemption narrow rather than a directory hole.
    expect(result.out).toContain("handoff/_general/from-code/helper.ts");
  });

  it("still flags markdown outside handoff/", () => {
    expect(result.out).toContain("docs/notes/stray.md");
  });

  it("allows only the exact imported evidence path", () => {
    expect(result.out).not.toContain("02-CURRENT-STATE-AND-ROADMAP.md");
    expect(result.out).toContain("NOT-ALLOWLISTED.md");
  });

  it("refuses overall, on the three real offenders only", () => {
    expect(result.code).toBe(1);
    expect(result.out).toContain("offenders          : 3");
  });
});
