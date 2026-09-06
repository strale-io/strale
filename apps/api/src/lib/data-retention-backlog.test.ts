/**
 * The content-redaction sweep must say so when it hits its per-run ceiling.
 *
 * Found in production 2026-09-06: the sweep is capped at
 * BATCH_SIZE * MAX_BATCHES_PER_RUN = 50,000 rows and ran WEEKLY, against
 * 68,790 rows/week crossing the 90-day line — 18,790/week behind. Nothing
 * said so: a run that stops at the ceiling returned the same shape as a run
 * that finished the work, so the only visible difference was a number in a
 * log line nobody reads against a threshold nobody had. 87,718 eligible rows,
 * oldest 102 days against a published 90-day window.
 *
 * It began on 2026-08-23, when PR #376 moved job cadence out of an
 * in-process map and into job_schedule. Before that the sweep ran many times
 * a day because the map reset on every deploy; after it, the declared weekly
 * interval was real for the first time.
 *
 * The cadence fix is one constant in test-scheduler.ts. This file guards the
 * part that makes the fix verifiable rather than merely applied: if capacity
 * is ever exceeded again, the sweep warns and reports the remaining backlog.
 *
 * Unit tests over the emitted SQL and the log, per the CLAUDE.md test-harness
 * exemption — the repo has no Postgres-backed retention harness.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 50;

/** SQL text of every query the sweep issued, in order. */
let issued: string[] = [];
/** Rows the fake driver reports for the content-redaction UPDATE. */
let contentRowsPerBatch = 0;
/** What the diagnostic COUNT reports, or a thrown error. */
let remainingRows: number | Error = 0;

function sqlTextOf(query: unknown): string {
  const parts: string[] = [];
  const walk = (chunks: unknown[]): void => {
    for (const chunk of chunks) {
      const value = (chunk as { value?: unknown } | null)?.value;
      const nested = (chunk as { queryChunks?: unknown[] } | null)?.queryChunks;
      if (Array.isArray(value) && value.every((v) => typeof v === "string")) parts.push(value.join(""));
      else if (Array.isArray(nested)) walk(nested);
    }
  };
  walk((query as { queryChunks?: unknown[] }).queryChunks ?? []);
  return parts.join(" ");
}

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: (query: unknown) => {
      const text = sqlTextOf(query);
      issued.push(text);
      // The diagnostic backlog count, taken only when the ceiling was hit.
      if (text.includes("AS remaining")) {
        if (remainingRows instanceof Error) return Promise.reject(remainingRows);
        return Promise.resolve([{ remaining: remainingRows }]);
      }
      // The content-redaction UPDATE is the only one stamping this reason.
      if (text.includes("content_retention_purge")) {
        return Promise.resolve({ count: contentRowsPerBatch });
      }
      return Promise.resolve({ count: 0 });
    },
  }),
}));

const warn = vi.fn();
vi.mock("./log.js", () => ({ log: { info: vi.fn(), warn, error: vi.fn() } }));

const { cleanupOldTestData } = await import("./data-retention.js");

/** Run the sweep with the 100ms inter-batch delays collapsed. */
async function runSweep(): Promise<void> {
  vi.useFakeTimers();
  try {
    const done = cleanupOldTestData();
    await vi.runAllTimersAsync();
    await done;
  } finally {
    vi.useRealTimers();
  }
}

beforeEach(() => {
  issued = [];
  warn.mockClear();
  contentRowsPerBatch = 0;
  remainingRows = 0;
});
afterEach(() => { vi.useRealTimers(); });

describe("content redaction reports its own backlog", () => {
  it("warns with the remaining count when the run hits the per-run ceiling", async () => {
    contentRowsPerBatch = BATCH_SIZE; // every batch full => the loop runs to the cap
    remainingRows = 37_300;

    await runSweep();

    const backlog = warn.mock.calls.find((c) => c[0]?.label === "retention-cleanup-backlog");
    expect(backlog, "no backlog warning was emitted at the ceiling").toBeDefined();
    expect(backlog![0].cap_rows).toBe(BATCH_SIZE * MAX_BATCHES_PER_RUN);
    expect(backlog![0].redacted_this_run).toBe(BATCH_SIZE * MAX_BATCHES_PER_RUN);
    expect(backlog![0].remaining_after_run).toBe(37_300);
  });

  it("stops at exactly the ceiling rather than draining the table", async () => {
    contentRowsPerBatch = BATCH_SIZE;
    await runSweep();
    const updates = issued.filter((t) => t.includes("content_retention_purge"));
    expect(updates).toHaveLength(MAX_BATCHES_PER_RUN);
  });

  // The fake driver ignores predicates, so nothing above would notice the
  // diagnostic COUNT drifting away from the UPDATE's selection — and then the
  // operator acts on a backlog figure for a different set of rows than the one
  // the sweep is draining. Compare the two WHERE clauses as emitted text.
  it("counts the backlog over exactly the rows the update selects", async () => {
    contentRowsPerBatch = BATCH_SIZE;
    await runSweep();

    const clauses = (text: string): string[] =>
      (text.match(/t\.\w+ (?:<|IS NULL|= false|IS NOT NULL)[^\n]*/g) ?? []).map((c) => c.trim());

    const update = issued.find((t) => t.includes("content_retention_purge"))!;
    const count = issued.find((t) => t.includes("AS remaining"))!;
    expect(clauses(count)).toEqual(clauses(update));
    // And the selection is the one the retention window actually means.
    for (const c of ["t.created_at <", "t.legal_hold = false", "t.redacted_at IS NULL", "t.deleted_at IS NULL"]) {
      expect(count, `backlog count lost ${c}`).toContain(c);
    }
  });

  // The ordinary case: a sweep that clears the backlog must stay quiet, or the
  // warning becomes noise and stops meaning anything.
  it("says nothing when the sweep finishes the work", async () => {
    contentRowsPerBatch = 0; // first batch short => loop ends immediately
    await runSweep();
    expect(warn.mock.calls.find((c) => c[0]?.label === "retention-cleanup-backlog")).toBeUndefined();
    expect(issued.some((t) => t.includes("AS remaining")), "took a backlog count it did not need").toBe(false);
  });

  // A final batch that comes back exactly full stops at the ceiling even when
  // it cleared the table. Warning "rows remain past the retention window"
  // against remaining_after_run: 0 trains the reader to ignore the signal.
  it("stays quiet when the capped run happened to clear the backlog", async () => {
    contentRowsPerBatch = BATCH_SIZE; // runs to the ceiling
    remainingRows = 0; // ...and nothing is left

    await runSweep();

    expect(issued.some((t) => t.includes("AS remaining")), "should still take the count").toBe(true);
    expect(
      warn.mock.calls.find((c) => c[0]?.label === "retention-cleanup-backlog"),
      "warned about a backlog of zero",
    ).toBeUndefined();
  });

  // A failed diagnostic count must not be reported as "no backlog", and must
  // not take the sweep down with it.
  it("reports an unavailable count as null, not zero, and still completes", async () => {
    contentRowsPerBatch = BATCH_SIZE;
    remainingRows = new Error("statement timeout");

    await expect(runSweep()).resolves.toBeUndefined();

    const backlog = warn.mock.calls.find((c) => c[0]?.label === "retention-cleanup-backlog");
    expect(backlog).toBeDefined();
    expect(backlog![0].remaining_after_run).toBeNull();
  });
});
