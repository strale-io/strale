/**
 * WP11 / CR-09 — the crediting decision is read from Stripe, not from our own
 * metadata echo.
 *
 * Every case here is written against the pre-WP11 rule, which was:
 *
 *     const amountCents = parseInt(session.metadata?.amount_cents ?? "0", 10);
 *     if (!userId || !amountCents) return;   // ...otherwise credit
 *
 * so `payment_status`, `amount_total` and `currency` were never consulted. The
 * assertions below therefore fail against that rule by construction: each one
 * varies a field the old code did not read, or asserts a credited amount the
 * old code would have taken from metadata instead.
 */

import { describe, expect, it } from "vitest";

import { assessTopUpSession } from "./stripe-settlement.js";

const PAID = {
  id: "cs_test_wp11",
  payment_status: "paid",
  currency: "eur",
  amount_total: 2500,
  metadata: { user_id: "u-1", amount_cents: "2500" },
} as const;

describe("assessTopUpSession — payment_status is the settlement authority", () => {
  it("does not credit an unpaid completed session", () => {
    // The case that makes this a money bug rather than a tidiness one.
    // `checkout.session.completed` fires for delayed-notification methods with
    // payment_status "unpaid"; the pre-WP11 handler credited on it because it
    // only looked at metadata, which is fully populated either way.
    const result = assessTopUpSession({ ...PAID, payment_status: "unpaid" });
    expect(result.kind).toBe("ignore");
  });

  it("does not credit a session with no payment_status at all", () => {
    const result = assessTopUpSession({ ...PAID, payment_status: null });
    expect(result.kind).toBe("ignore");
  });

  it("treats not-yet-paid as benign, never as an incident", () => {
    // The distinction the three-way return exists for: an unpaid session is
    // Stripe telling us to wait, not money we failed to credit. Classifying it
    // as an incident would page on every SEPA checkout.
    const result = assessTopUpSession({ ...PAID, payment_status: "unpaid" });
    expect(result.kind).not.toBe("escalate");
  });

  it("credits a paid session", () => {
    const result = assessTopUpSession(PAID);
    expect(result).toMatchObject({
      kind: "credit",
      userId: "u-1",
      amountCents: 2500,
      sessionId: "cs_test_wp11",
    });
  });
});

describe("assessTopUpSession — amount_total is the amount authority", () => {
  it("credits amount_total, not the metadata the session was created with", () => {
    // Pinned as a value assertion rather than a shape one: metadata says 9999,
    // Stripe says 2500. The pre-WP11 handler credited 9999.
    const result = assessTopUpSession({
      ...PAID,
      amount_total: 2500,
      metadata: { user_id: "u-1", amount_cents: "9999" },
    });
    expect(result).toMatchObject({ kind: "credit", amountCents: 2500 });
  });

  it("reports the divergence so a metadata/charge mismatch is not silent", () => {
    const result = assessTopUpSession({
      ...PAID,
      amount_total: 2500,
      metadata: { user_id: "u-1", amount_cents: "9999" },
    });
    expect(result).toMatchObject({ metadataMismatchCents: 9999 });
  });

  it("does not report a divergence when the two agree", () => {
    const result = assessTopUpSession(PAID);
    expect(result).not.toHaveProperty("metadataMismatchCents");
  });

  it("escalates a paid session with no amount_total", () => {
    const result = assessTopUpSession({ ...PAID, amount_total: null });
    expect(result).toMatchObject({ kind: "escalate" });
  });

  it("escalates a paid session with a non-positive amount_total", () => {
    const result = assessTopUpSession({ ...PAID, amount_total: 0 });
    expect(result).toMatchObject({ kind: "escalate" });
  });
});

describe("assessTopUpSession — currency must match the wallet", () => {
  it("refuses to credit a non-EUR session 1:1", () => {
    // The wallet is EUR cents. 2500 USD cents is not 2500 EUR cents, and the
    // pre-WP11 ledger description hardcoded "EUR" while crediting whatever
    // metadata said.
    const result = assessTopUpSession({ ...PAID, currency: "usd" });
    expect(result).toMatchObject({ kind: "escalate" });
    expect((result as { reason: string }).reason).toContain("usd");
  });

  it("accepts EUR case-insensitively", () => {
    const result = assessTopUpSession({ ...PAID, currency: "EUR" });
    expect(result.kind).toBe("credit");
  });

  it("escalates when currency is absent", () => {
    const result = assessTopUpSession({ ...PAID, currency: null });
    expect(result).toMatchObject({ kind: "escalate" });
  });
});

describe("assessTopUpSession — a paid session that cannot be credited is an incident", () => {
  it("escalates rather than ignoring a paid session with no user_id", () => {
    // The pre-WP11 handler logged this and returned {received:true}, which
    // consumes the Stripe event. The money is collected and the wallet never
    // hears about it, with no retry and nothing paged.
    const result = assessTopUpSession({ ...PAID, metadata: { amount_cents: "2500" } });
    expect(result).toMatchObject({ kind: "escalate", sessionId: "cs_test_wp11" });
  });

  it("escalates a session with no id", () => {
    const result = assessTopUpSession({ ...PAID, id: null });
    expect(result).toMatchObject({ kind: "escalate", sessionId: null });
  });

  it("does not escalate an unpaid session missing metadata — nothing was collected", () => {
    const result = assessTopUpSession({
      ...PAID,
      payment_status: "unpaid",
      metadata: null,
    });
    expect(result.kind).toBe("ignore");
  });
});
