/**
 * Shortening a consumeDueSlot task's interval must actually take effect.
 *
 * `consumeDueSlot` gates on `job_schedule.next_run_at`, not on the constant in
 * the caller. Its ON CONFLICT clamp used to pull `next_run_at` in only when
 * `last_finished_at` was set — but consumeDueSlot never writes that column
 * (deliberately: only the START is recorded, so a task that throws is not
 * booked as a success). The predicate was therefore permanently true for every
 * task using this helper, the clamp was a permanent no-op, and CHANGING AN
 * INTERVAL DID NOTHING until the task next fired on its old schedule.
 *
 * Found 2026-09-06 while moving the retention sweep from 7d to 24h. Production
 * that morning: `retention` had `last_finished_at = null`,
 * `last_started_at = 2026-09-06T09:11Z`, `next_run_at = 2026-09-13T09:11Z`.
 * Without the fallback the deploy would have written interval_ms alone and the
 * first daily run would have been a week later — a shipped fix doing nothing
 * while the backlog it exists to drain rebuilt at ~9,800 rows/day.
 *
 * A structural test over the emitted SQL, per the CLAUDE.md test-harness
 * exemption: the repo has no Postgres-backed coordinator harness, and the bug
 * is entirely in the shape of one CASE expression.
 */
import { describe, it, expect, vi } from "vitest";

const executed: string[] = [];

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: (query: unknown) => {
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
      executed.push(parts.join(" "));
      // Not due, and no row claimed: consumeDueSlot returns before running fn.
      return Promise.resolve([]);
    },
  }),
}));

const { consumeDueSlot } = await import("./job-coordinator.js");

describe("consumeDueSlot: an interval change reaches next_run_at", () => {
  it("clamps against last_started_at when last_finished_at is null", async () => {
    executed.length = 0;
    await consumeDueSlot("retention", 24 * 60 * 60 * 1000);

    const upsert = executed.find((s) => s.includes("ON CONFLICT (job_name)"));
    expect(upsert, "no registration upsert was issued").toBeDefined();

    // The whole bug: without the COALESCE the CASE short-circuits on a task
    // this helper never writes last_finished_at for, and next_run_at is left
    // wherever the old interval put it.
    expect(upsert, "the clamp still keys on last_finished_at alone — an interval change will not take effect")
      .toMatch(/COALESCE\(\s*job_schedule\.last_finished_at,\s*job_schedule\.last_started_at\s*\)\s*IS NULL/);
    expect(upsert, "the LEAST() arm must use the same fallback as the guard")
      .toMatch(/LEAST\([\s\S]*COALESCE\(\s*job_schedule\.last_finished_at,\s*job_schedule\.last_started_at\s*\)/);
  });

  // The behaviour the original predicate was protecting, which the fallback
  // must not break: a task that has never run keeps its staggered first run
  // rather than being dragged forward to now().
  it("still leaves a never-run task's staggered next_run_at alone", async () => {
    executed.length = 0;
    await consumeDueSlot("some-new-task", 60_000);
    const upsert = executed.find((s) => s.includes("ON CONFLICT (job_name)"))!;
    // Both columns null => the CASE returns the existing next_run_at untouched.
    expect(upsert).toMatch(/IS NULL\s*THEN job_schedule\.next_run_at/);
    // Scoped to the CASE: `COALESCE(last_finished_at, now())` was the first
    // attempt and collapsed to now(), dragging a staggered first run forward.
    // (An unrelated COALESCE elsewhere in the statement is fine, which is why
    // this looks at the clamp rather than the whole SQL.)
    const clamp = upsert.slice(upsert.indexOf("next_run_at = CASE"), upsert.indexOf("updated_at = now()"));
    expect(clamp, "a bare now() in the clamp would discard the stagger").not.toMatch(/now\(\)/);
  });
});
