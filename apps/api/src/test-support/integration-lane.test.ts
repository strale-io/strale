/**
 * Guards the integration lane against silently shrinking (WP1).
 *
 * The lane's whole reason for existing is that DB integration suites in this
 * repo were skipping on every CI run for months while the job stayed green.
 * Several ways that could recur, each closed by a check below:
 *
 *   1. A new `*.integration.test.ts` forgets `useTestDatabase()`. It then
 *      neither points DATABASE_URL at the test database nor throws when the
 *      lane demands one — so it either fails confusingly or skips silently.
 *   2. A suite imports `app.js` or `db/index.js` statically. ESM imports are
 *      HOISTED, so that module graph loads before any statement in the file,
 *      including the guard — with whatever DATABASE_URL was inherited.
 *   3. A suite is skipped outright. Vitest exits 0 for a fully skipped file,
 *      so CI cannot distinguish that from a pass.
 *   4. Files are renamed away from the `integration.test.ts` substring the CI
 *      step filters on, or deleted. Vitest only exits non-zero when NOTHING
 *      matches, so losing eight of nine files would still be green.
 *
 * This runs in the ordinary unit suite — no database required — so the check
 * itself cannot be skipped by the absence of one.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));

/**
 * Files currently in the lane. Raising this as the lane grows is expected;
 * lowering it means suites were removed and should be a deliberate, explained
 * edit rather than a silent one.
 */
const MINIMUM_LANE_FILES = 9;

/** Split on either line ending — these files are checked out CRLF on Windows. */
function splitLines(source: string): string[] {
  return source.split(/\r?\n/);
}

function integrationTestFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      integrationTestFiles(full, found);
    } else if (entry.endsWith(".integration.test.ts")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Every file whose NAME claims to be an integration test, however it is
 * spelled. Deliberately broader than integrationTestFiles(): asking whether
 * the strictly-matching set matches the CI filter would be tautological, since
 * that set is defined by the same suffix. The point is to catch a file called
 * `foo.integration.spec.ts`, which claims membership but would never run.
 */
function filesClaimingToBeIntegrationTests(
  dir: string,
  found: string[] = [],
): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      // test-support holds the lane's own guards. They are ordinary unit tests
      // that happen to have "integration" in the name, and they deliberately
      // do NOT run in the DB lane — that is what lets them police it.
      if (entry === "test-support") continue;
      filesClaimingToBeIntegrationTests(full, found);
    } else if (/integration/i.test(entry) && /\.(test|spec)\.ts$/.test(entry)) {
      found.push(full);
    }
  }
  return found;
}

describe("ephemeral-Postgres integration lane", () => {
  const files = integrationTestFiles(SRC);

  it("still contains the suites it is supposed to run", () => {
    expect(files.length).toBeGreaterThanOrEqual(MINIMUM_LANE_FILES);
  });

  it("routes every suite through the loopback safety guard", () => {
    // useTestDatabase() is what both points DATABASE_URL at the throwaway
    // database and refuses an unsafe target. A suite that skips it can write
    // to whatever DATABASE_URL happens to be set — and the repo-root .env
    // holds a production URL.
    const unguarded = files
      .filter((f) => !readFileSync(f, "utf8").includes("useTestDatabase()"))
      .map((f) => relative(SRC, f));

    expect(unguarded).toEqual([]);
  });

  it("defers app and db imports until after the guard has run", () => {
    // A top-level `import { app } from "../app.js"` executes before
    // useTestDatabase(), so anything touching getDb() during that import uses
    // the inherited DATABASE_URL. Suites must reach these modules through
    // `await import(...)` after the guard, which is what the existing files do.
    const offenders: string[] = [];
    for (const file of files) {
      for (const line of splitLines(readFileSync(file, "utf8"))) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("import ")) continue;
        const importsApp = /["'](\.\.?\/)+app\.js["']/.test(trimmed);
        const importsDb = /["'](\.\.?\/)+db\/index\.js["']/.test(trimmed);
        if (importsApp || importsDb) {
          offenders.push(`${relative(SRC, file)}: ${trimmed}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("contains no ad-hoc skips that would quietly empty the lane", () => {
    // The single sanctioned exception is the describeMaybe ternary, which
    // resolves to `describe` in CI because the lane always provides a database.
    const SANCTIONED = "DATABASE_URL_TEST ? describe : describe.skip";
    const offenders: string[] = [];
    for (const file of files) {
      const lines = splitLines(readFileSync(file, "utf8"));
      for (const [i, line] of lines.entries()) {
        if (line.includes(SANCTIONED)) continue;
        // skipIf/runIf evade a plain skip|todo match and can disable an entire
        // suite just as effectively.
        if (/\b(it|test|describe)\.(skip|todo|skipIf|runIf)\b/.test(line)) {
          offenders.push(`${relative(SRC, file)}:${i + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps every suite matchable by the CI filename filter", () => {
    // The CI step runs `vitest run integration.test.ts`, a substring filter.
    // A file named e.g. `foo.integration.spec.ts` claims to be part of the
    // lane but would never run, and nothing else would notice.
    const unmatched = filesClaimingToBeIntegrationTests(SRC)
      .filter((f) => !f.includes("integration.test.ts"))
      .map((f) => relative(SRC, f));

    expect(unmatched).toEqual([]);
  });
});
