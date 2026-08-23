/**
 * The two properties the handler watchdog must hold (WP10, risk CR-08).
 *
 * Both were violated by earlier versions of this package, in opposite
 * directions, and each violation was caught by a different reader:
 *
 *   1. The first version set the watchdog EQUAL to the lease. Abandoning a hung
 *      handler then made the row instantly claimable, and the next poll started
 *      a second copy on top of live work — inside the same process, within one
 *      poll interval, for five jobs that hold no advisory lock. Found in review.
 *   2. The fix for (1) derived the watchdog from the lease alone, which made the
 *      wait for a hung handler as long as the LEASE. Jobs are awaited one after
 *      another, so the three 2h-lease jobs would have stopped every other job
 *      for 118 minutes. `reindex-transactions` makes that concrete: it runs
 *      REINDEX with neither an AbortSignal nor a statement_timeout. Before WP10
 *      each job had its own timer and could not delay any other, so this would
 *      have been a regression the package introduced.
 *
 * These are unit tests because `watchdogFor` is a pure function and the
 * properties are arithmetic. The behavioural consequences are proven against a
 * real database in `job-coordinator.integration.test.ts`.
 */

import { describe, expect, it } from "vitest";
import { watchdogFor } from "./job-coordinator.js";

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

/** Every lease this codebase actually asks for, plus the extremes around them. */
const LEASES = [
  2 * SECOND, // integration tests
  4 * SECOND, // integration tests
  30 * SECOND,
  5 * MINUTE,
  30 * MINUTE, // DEFAULT_LEASE_MS
  60 * MINUTE,
  120 * MINUTE, // ingest-cy-directors, ingest-ee-directors, reindex-transactions
  24 * 60 * MINUTE,
];

describe("handler watchdog", () => {
  it.each(LEASES)("fires strictly before a %ims lease expires", (lease) => {
    // If these were ever equal, abandoning a run would hand the row to the very
    // next poll while the handler was still running.
    expect(watchdogFor(lease)).toBeLessThan(lease);
  });

  it.each(LEASES)("never makes one job block the others for more than 15 minutes (%ims lease)", (lease) => {
    expect(watchdogFor(lease)).toBeLessThanOrEqual(15 * MINUTE);
  });

  it("leaves a margin of at least one poll interval for the leases in real use", () => {
    // The margin is the window in which the abandoned run still holds the job.
    // It must exceed the poll interval, or a poll could land exactly in the gap
    // and find the lease already gone.
    for (const lease of [30 * MINUTE, 120 * MINUTE]) {
      expect(lease - watchdogFor(lease)).toBeGreaterThan(60 * SECOND);
    }
  });

  it("is monotonic and positive", () => {
    let previous = 0;
    for (const lease of [...LEASES].sort((a, b) => a - b)) {
      const w = watchdogFor(lease);
      expect(w).toBeGreaterThan(0);
      expect(w).toBeGreaterThanOrEqual(previous);
      previous = w;
    }
  });

  it("caps at exactly 15 minutes once the lease is long enough to reach it", () => {
    expect(watchdogFor(120 * MINUTE)).toBe(15 * MINUTE);
    expect(watchdogFor(24 * 60 * MINUTE)).toBe(15 * MINUTE);
    // And is NOT capped below that, so short leases keep a proportional wait.
    expect(watchdogFor(4 * SECOND)).toBe(2 * SECOND);
  });
});
