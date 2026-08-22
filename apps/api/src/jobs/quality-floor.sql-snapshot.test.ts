/**
 * WP9 — every SQL statement the quality floor issues, snapshotted whole.
 *
 * Thirteen review rounds found the same defect thirteen times, each one a
 * single token in this file's SQL that no assertion reached. The fixes kept
 * escalating and kept being escaped by one step:
 *
 *   round 10  pinned four of the fact query's seven projected values
 *             -> round 12 found the other three, each a total silent disarm
 *   round 12  pinned both projections WHOLE, "no column one over left"
 *             -> round 13 found the scope CTE above them, the LATERAL beside
 *                them, and the neighbouring CTE in another function
 *
 * The reviewer's own summary: the round-12 fix removed the column one over; it
 * did not remove the CLAUSE one over. There is always another clause, so the
 * only assertion that terminates the sequence is the statement itself.
 *
 * So each statement is snapshotted to a committed fixture and compared
 * verbatim. A deliberate change updates the fixture in the same commit and the
 * diff shows exactly which SQL moved — which is the point, because every
 * finding in this series was a change nobody could see.
 *
 * This is not a substitute for a Postgres harness. It cannot tell you the SQL
 * is CORRECT; it tells you the SQL is what was reviewed. Given there is no
 * DB-backed harness for this job, that is the difference between a change being
 * caught and a change being invisible.
 *
 * All EIGHT statements the module issues, not a chosen subset. The coverage
 * test below counts the tagged-template calls in the source and requires a
 * fixture for each, because a snapshot suite that silently stops covering a new
 * query is this same failure one level up -- and it earned its place
 * immediately: written for the five that obviously feed a delisting decision,
 * it failed at once and named the three that had been missed.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Line endings normalised on BOTH sides. `.gitattributes` is `* text=auto` and
 * `core.autocrlf` is true on Windows, so the source arrives CRLF there and LF
 * elsewhere. An assertion that passes on one OS and fails on the other is
 * indistinguishable from one that is simply wrong — round 12 hit exactly that
 * and normalised only the source.
 */
const lf = (t: string) => t.replace(/\r\n/g, "\n");

const SOURCE = lf(readFileSync(join(HERE, "quality-floor.ts"), "utf8"));
const fixture = (name: string) =>
  lf(readFileSync(join(HERE, "__fixtures__", name), "utf8"));

const STATEMENTS: Array<[string, string, string]> = [
  [
    "advisory-lock.sql",
    "makes the tick single-instance",
    "Without it two instances evaluate and delist concurrently, each unaware " +
      "of the other's quarantine budget.",
  ],
  [
    "min-epoch.sql",
    "is the epoch bridge itself",
    "MIN to MAX moves it to the newest fact, so the fact branch matches " +
      "nothing and the floor silently reverts to pre-WP9 behaviour behind a " +
      "plausible-looking heartbeat.",
  ],
  [
    "holed-markers.sql",
    "is the first completeness defence",
    "Names the cause when a fact write fails. Absent exactly when the cause " +
      "is that the database was unreachable, which is why it is not the " +
      "load-bearing one.",
  ],
  [
    "epoch-probe.sql",
    "decides which source the floor reads",
    "Asked in its own round trip because Postgres resolves relations at parse " +
      "time, so a query merely naming a missing table raises however it is " +
      "guarded. It also decides whether an UNPROTECTED table is trusted.",
  ],
  [
    "transaction-query.sql",
    "the pre-epoch evidence",
    "Bounded above by the epoch so it retires itself once the fact table " +
      "outlives the window.",
  ],
  [
    "fact-query.sql",
    "the post-epoch evidence, and the reason WP9 exists",
    "Its scope CTE, its promotion-clamp LATERAL, its filters and its " +
      "projection have each been found unguarded in a separate review round.",
  ],
  [
    "revenue-query.sql",
    "decides whether a deactivation proposal is founder-only",
    "Carries the same internal-account, free-tier and clamp filters the fold " +
      "used to apply; dropping them made 205 capabilities look revenue-earning " +
      "on the strength of our own test harness.",
  ],
  [
    "shortfall-query.sql",
    "the completeness defence the module calls load-bearing",
    "Found unguarded in a new place in four consecutive rounds.",
  ],
];

describe("WP9 — the floor's SQL is what was reviewed", () => {
  for (const [name, role, why] of STATEMENTS) {
    it(`${name} is unchanged — ${role}`, () => {
      const expected = fixture(name);
      // Sanity: a fixture that emptied itself would make this vacuous.
      expect(expected.trim().length, `${name} fixture is empty`).toBeGreaterThan(40);
      expect(
        SOURCE.includes(expected),
        `${name} no longer matches src/jobs/quality-floor.ts.\n\n` +
          `${why}\n\n` +
          "If the change is deliberate, update " +
          `src/jobs/__fixtures__/${name} in the same commit so the diff shows ` +
          "which SQL moved. If it is not, this is the defect thirteen review " +
          "rounds kept finding.",
      ).toBe(true);
    });
  }

  it("covers every statement the floor issues", () => {
    // A snapshot suite that silently stops covering a new query is the same
    // failure one level up. Count the tagged-template SQL calls in the module
    // and require a fixture for each.
    const issued = (SOURCE.match(/await sql</g) ?? []).length;
    expect(
      issued,
      "A new SQL statement was added to jobs/quality-floor.ts without a " +
        "snapshot fixture. Add one to src/jobs/__fixtures__/ and list it in " +
        "STATEMENTS above.",
    ).toBe(STATEMENTS.length);
  });
});
