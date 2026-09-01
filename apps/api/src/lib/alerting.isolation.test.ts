/**
 * Alert isolation — incident 2026-08-22, "STARVE-SET-1".
 *
 * A test run emailed the production alert inbox. The body read:
 *
 *   "Settlement STARVE-SET-1 (slug=real-cap, 99 cents) moved USDC and lost its
 *    transaction row to a crash. […] the customer did not receive their result
 *    and may be owed a refund."
 *
 * Every identifier in it was synthetic — no such settlement intent, orphan
 * settlement, transaction, payment hash or capability has ever existed in
 * production — but the email is indistinguishable from the real thing, and it
 * was acted on as real.
 *
 * These tests pin the two controls that stop it recurring. Both fail against
 * the un-applied fix:
 *
 *   1. Remove the isTestRunner() gate from sendAlert → "does not reach Resend"
 *      and "critical is not exempt" fail: Resend receives the send.
 *   2. Remove the `delete process.env.RESEND_API_KEY` from test-env-setup.ts →
 *      "the suite holds no live alerting credential" fails whenever the
 *      developer's shell or a transitive dotenv.config() has supplied one,
 *      which is the condition that produced the incident.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn(async () => ({ data: { id: "test" }, error: null }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

/** Fresh module instance so alerting.ts re-reads env and re-creates its client. */
async function loadAlerting() {
  vi.resetModules();
  return await import("./alerting.js");
}

describe("sendAlert is isolated from the test runner", () => {
  const saved = { ...process.env };

  beforeEach(() => {
    send.mockClear();
    // Simulate the leak precisely: a live key present in the worker, exactly as
    // a transitive `dotenv.config()` against the repo-root .env would leave it.
    process.env.RESEND_API_KEY = "re_live_key_shaped_value";
    delete process.env.ALERT_ALLOW_IN_TEST;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it("does not reach Resend for a warning, the severity that escaped", async () => {
    const { sendAlert } = await loadAlerting();

    const sent = await sendAlert({
      subject: "x402 settlement recovered — customer paid but received no output",
      body: "Settlement STARVE-SET-1 (slug=real-cap, 99 cents) moved USDC…",
      severity: "warning",
    });

    expect(sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not exempt critical — the loudest severity is the worst to fake", async () => {
    const { sendAlert } = await loadAlerting();

    await sendAlert({ subject: "s", body: "b", severity: "critical" });

    expect(send).not.toHaveBeenCalled();
  });

  it("suppresses regardless of how many times it is called", async () => {
    // alertOnce's cooldown fails OPEN and reads whichever database the test
    // points at, so it suppressed nothing here. Under scripts/mutation-test.mjs
    // one call site became one email per mutant. The boundary gate must hold
    // without any help from dedup.
    const { sendAlert } = await loadAlerting();

    for (let i = 0; i < 25; i++) {
      await sendAlert({ subject: `s${i}`, body: "b", severity: "warning" });
    }

    expect(send).not.toHaveBeenCalled();
  });

  it("still sends when a caller explicitly opts in", async () => {
    // The gate must not make real delivery untestable — otherwise someone
    // removes it to test delivery and the protection leaves with them.
    process.env.ALERT_ALLOW_IN_TEST = "true";
    const { sendAlert } = await loadAlerting();

    const sent = await sendAlert({ subject: "s", body: "b", severity: "warning" });

    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("the suite holds no live alerting credential", () => {
  it("test-env-setup scrubbed the keys before any test file was imported", () => {
    // Second layer, independent of runner detection: a worker with no key
    // cannot email anyone even if the gate above is wrong or bypassed.
    // NOT `toBeUndefined()` on a value we just set in the other describe —
    // this reads the pristine process env captured at setup time.
    expect(process.env.RESEND_API_KEY).toBeUndefined();
    expect(process.env.BETTER_STACK_SOURCE_TOKEN).toBeUndefined();
    expect(process.env.NODE_ENV).toBe("test");
  });
});
