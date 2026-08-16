/**
 * Budget alerts must not train their reader to ignore them.
 *
 * On 2026-08-16 four `[Strale WARNING] [budget]` emails arrived overnight, for
 * capabilities whose daily caps were doing exactly what they exist to do. The
 * window resets every day, so a harness that reliably consumes 80% of it
 * produces an identical warning every morning, for ever. Measured that week:
 * 107,007 test executions against 674 customer calls — 159 tests per customer
 * call — every one of the alerting capabilities on a `free_quota` vendor with
 * zero external cost.
 *
 * None of that was a customer-facing problem. The cap protected customer
 * traffic from our own testing, and it worked. But an inbox that receives the
 * same correct warning daily stops being an alerting channel, and the next
 * genuine one arrives in a stream the reader has learned to skip.
 *
 * These tests pin the fix at the level that matters — the alert path is
 * rate-limited, the per-window record is not — rather than asserting on
 * behaviour a stub could fake either way.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = readFileSync(
  resolve(process.cwd(), "src/capabilities/guarded-executor.ts"),
  "utf8",
);

describe("repeated budget alerts are rate-limited", () => {
  it("sends threshold alerts through the cooldown, not straight to the mailer", () => {
    // `sendAlert` emails immediately; `alertOnce` consults a cooldown first.
    // A daily-resetting window makes the difference between one email and
    // 365.
    const block = SRC.slice(SRC.indexOf("const tryFire"), SRC.indexOf("// Mark fired"));
    expect(block).toContain("alertOnce(");
    expect(block, "the un-throttled mailer must not be used here").not.toContain("sendAlert(");
  });

  it("rate-limits the hard-stop alert too", () => {
    const block = SRC.slice(SRC.indexOf("async function fireBudgetHardStopAlert"));
    expect(block.slice(0, 900)).toContain("alertOnce(");
  });

  it("keys the cooldown per capability and per threshold", () => {
    // A single shared key would let one noisy capability mask every other
    // capability's first alert — the failure mode this fix exists to prevent,
    // reintroduced one level up.
    expect(SRC).toMatch(/budget-threshold:\$\{slug\}:\$\{threshold\}/);
    expect(SRC).toMatch(/budget-hard-stop:\$\{slug\}/);
  });

  it("uses a week, which is longer than the window that resets daily", () => {
    const m = SRC.match(/ALERT_COOLDOWN_DAYS\s*=\s*(\d+)/);
    expect(m, "cooldown constant must exist").not.toBeNull();
    expect(Number(m![1]), "must exceed a daily window or dailies still get through")
      .toBeGreaterThan(1);
  });
});

describe("suppressing the email does not suppress the record", () => {
  it("still marks the per-window flag, so history stays queryable", () => {
    // The database flags are the audit trail. Rate-limiting the inbox must not
    // cost us the ability to ask "how often did this actually happen".
    const block = SRC.slice(SRC.indexOf("const tryFire"), SRC.indexOf("await tryFire(30"));
    expect(block).toContain("alert_30_fired_at = NOW()");
  });

  it("tells the reader why a repeat did not arrive", () => {
    // Otherwise a suppressed alert looks like the problem stopped.
    expect(SRC).toMatch(/logged\\n\s*\+\s*`but not emailed|are logged/);
  });
});
