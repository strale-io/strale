/**
 * The content-redaction sweep must be gated on a DAILY interval.
 *
 * It ran weekly against a 50,000-row-per-run ceiling while ~68,800 rows/week
 * crossed the 90-day line, so it fell ~18,800 behind every week and never
 * caught up. Production 2026-09-06: 87,718 rows past the window, oldest 102
 * days against a published 90-day claim.
 *
 * Those figures are the re-measured ones. An earlier draft of this header
 * carried ~60,000/week and a ~10,000 deficit — 13% low — in the very file
 * whose job is to be the arithmetic of record. Independent review caught it.
 *
 * The cadence is one constant, which is exactly the kind of thing a later edit
 * reverts without noticing. This pins it to the arithmetic rather than to the
 * literal, so the test explains itself if it ever fails.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(resolve(import.meta.dirname, "./test-scheduler.ts"), "utf8");

/** Read a top-level `const NAME = <expr>;` and evaluate its arithmetic. */
function intervalMs(name: string): number {
  const m = SOURCE.match(new RegExp(`^const ${name}\\s*=\\s*([^;]+);`, "m"));
  if (!m) throw new Error(`${name} not found in test-scheduler.ts`);
  const expr = m[1].trim();
  if (!/^[\d\s*+()]+$/.test(expr)) throw new Error(`${name} is not a plain arithmetic literal: ${expr}`);
  return Function(`"use strict"; return (${expr});`)() as number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe("retention sweep cadence", () => {
  it("runs at least daily", () => {
    expect(intervalMs("RETENTION_INTERVAL_MS")).toBeLessThanOrEqual(DAY);
  });

  // The real constraint. Capacity per run is fixed by data-retention.ts's
  // BATCH_SIZE * MAX_BATCHES_PER_RUN; the cadence has to make capacity exceed
  // the rate rows become eligible, with headroom for a run that is skipped or
  // fails. At ~9,830/day observed, daily gives 5.1x.
  it("gives capacity comfortably above the rate rows become due", () => {
    const CAP_PER_RUN = 1000 * 50; // data-retention.ts BATCH_SIZE * MAX_BATCHES_PER_RUN
    const OBSERVED_DUE_PER_DAY = 9_827; // production, 2026-09-06 (68,790 over 7 days)
    const runsPerDay = DAY / intervalMs("RETENTION_INTERVAL_MS");
    const capacityPerDay = CAP_PER_RUN * runsPerDay;
    expect(capacityPerDay).toBeGreaterThan(OBSERVED_DUE_PER_DAY * 3);
  });

  it("still gates the weekly health sweep weekly — the two are not the same job", () => {
    expect(intervalMs("WEEKLY_SWEEP_INTERVAL_MS")).toBe(7 * DAY);
  });

  // Pinning the constant alone leaves the obvious regression green: point the
  // call site at WEEKLY_SWEEP_INTERVAL_MS and every assertion above still
  // passes while the sweep is weekly again. So pin the wiring too.
  it("gates the retention task on RETENTION_INTERVAL_MS, not another constant", () => {
    expect(SOURCE).toMatch(/shouldRun\(\s*"retention"\s*,\s*RETENTION_INTERVAL_MS\s*\)/);
  });
});
