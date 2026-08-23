/**
 * Stripe top-up crediting against a real Postgres (WP1).
 *
 * `webhook.ts` is the money-IN path and had no test of any kind. Its
 * idempotency depends on database behaviour a mocked db module cannot
 * reproduce — row locking, transaction isolation, and a partial unique index —
 * so the claim was unfalsifiable until this lane existed.
 *
 * What the evidence actually shows, having measured it rather than assumed it:
 * duplicate crediting is prevented by the in-transaction SELECT combined with
 * the row lock that `UPDATE wallets` takes, which serialises concurrent
 * deliveries for the same wallet. Dropping
 * `wallet_transactions_stripe_session_id_unique` does NOT produce a double
 * credit through this handler — five concurrent deliveries still credit once.
 * The index is a backstop against paths that bypass this transaction, not the
 * mechanism that makes this one safe. The separate constraint test below
 * covers the index itself.
 *
 * Signatures here are real. The payload is signed with the same HMAC scheme
 * Stripe uses (`t=<ts>,v1=<hmac sha256 of "<ts>.<payload>">`) and verified by
 * the actual `stripe.webhooks.constructEvent`, so the handler runs end to end
 * with nothing stubbed between the request and the database.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID, createHmac } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { users, wallets, walletTransactions } from "../db/schema.js";

const WEBHOOK_SECRET = "whsec_wp1_integration_secret";


// Environment is set only when the lane is actually going to run. These
// module-level assignments execute even when the suite skips, so applying them
// unconditionally leaked configuration into every other suite in a full-suite
// run and made an unrelated admin-auth test fail intermittently.
if (process.env.DATABASE_URL_TEST) {
  process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
  // getStripe() asserts on this at module load; the value is never used for a
  // network call because only signature verification runs in this path.
  process.env.STRIPE_SECRET_KEY ??= "sk_test_wp1_placeholder";
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.AUDIT_HMAC_SECRET ??= "wp1-integration-secret-at-least-32-chars-long";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

/** Sign a payload exactly the way Stripe does. */
function stripeSignature(payload: string, secret = WEBHOOK_SECRET): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

/**
 * WP11: the fixture now carries the fields Stripe actually settles on.
 *
 * It did not before, and it did not need to — the pre-WP11 handler read only
 * `metadata`, so a session object with no `payment_status`, no `amount_total`
 * and no `currency` credited a wallet exactly as a real one would. That is the
 * defect stated as a fixture: a test double this incomplete was
 * indistinguishable from a paid session, because the code could not tell the
 * difference either.
 */
function checkoutCompleted(opts: {
  sessionId: string;
  userId?: string;
  amountCents?: string;
  /** Defaults to the metadata amount, so the two agree unless a test varies them. */
  amountTotal?: number | null;
  paymentStatus?: string | null;
  currency?: string | null;
  eventType?: string;
}): string {
  const declared = opts.amountCents ? Number.parseInt(opts.amountCents, 10) : undefined;
  return JSON.stringify({
    id: `evt_${randomUUID()}`,
    object: "event",
    type: opts.eventType ?? "checkout.session.completed",
    data: {
      object: {
        id: opts.sessionId,
        object: "checkout.session",
        payment_status:
          opts.paymentStatus === undefined ? "paid" : opts.paymentStatus,
        currency: opts.currency === undefined ? "eur" : opts.currency,
        amount_total:
          opts.amountTotal === undefined ? (declared ?? null) : opts.amountTotal,
        metadata: {
          ...(opts.userId ? { user_id: opts.userId } : {}),
          ...(opts.amountCents ? { amount_cents: opts.amountCents } : {}),
        },
      },
    },
  });
}

describeMaybe("POST /webhooks/stripe — crediting against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];
  let userId: string;
  let walletId: string;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);
    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    if (walletId) {
      await db
        .delete(walletTransactions)
        .where(eq(walletTransactions.walletId, walletId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
    }
    if (userId) await db.delete(users).where(eq(users.id, userId));
  });

  async function seedUserWithWallet(startingBalance = 0) {
    userId = randomUUID();
    walletId = randomUUID();
    await db.insert(users).values({
      id: userId,
      email: `wp1-${userId}@example.test`,
      apiKeyHash: `hash-${userId}`,
      keyPrefix: "sk_test_wp1",
    });
    await db.insert(wallets).values({
      id: walletId,
      userId,
      balanceCents: startingBalance,
    });
  }

  async function postWebhook(
    payload: string,
    signature = stripeSignature(payload),
  ) {
    return app.request("http://localhost/webhooks/stripe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body: payload,
    });
  }

  async function balanceOf(id: string): Promise<number> {
    const [row] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.id, id))
      .limit(1);
    return row!.balanceCents;
  }

  it("credits the wallet and writes a matching ledger row", async () => {
    await seedUserWithWallet(500);
    const sessionId = `cs_test_${randomUUID()}`;

    const res = await postWebhook(
      checkoutCompleted({ sessionId, userId, amountCents: "2500" }),
    );
    expect(res.status).toBe(200);

    expect(await balanceOf(walletId)).toBe(3000);

    const ledger = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.amountCents).toBe(2500);
    expect(ledger[0]!.type).toBe("top_up");
    expect(ledger[0]!.stripeSessionId).toBe(sessionId);
  });

  it("is idempotent when Stripe retries the same session", async () => {
    await seedUserWithWallet(0);
    const sessionId = `cs_test_${randomUUID()}`;
    const payload = checkoutCompleted({
      sessionId,
      userId,
      amountCents: "1000",
    });

    // Stripe retries with the same session id but re-signs each delivery.
    for (let i = 0; i < 3; i++) {
      expect((await postWebhook(payload)).status).toBe(200);
    }

    // The property that actually matters: the customer is credited once.
    expect(await balanceOf(walletId)).toBe(1000);
    const ledger = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, walletId));
    expect(ledger).toHaveLength(1);
  });

  it("credits once when deliveries arrive concurrently", async () => {
    await seedUserWithWallet(0);
    const sessionId = `cs_test_${randomUUID()}`;
    const payload = checkoutCompleted({
      sessionId,
      userId,
      amountCents: "700",
    });

    // Stripe can deliver the same event more than once, and retries can
    // overlap. The SELECT-then-INSERT inside the handler is check-then-act, so
    // this is the shape that would double-credit if the transaction did not
    // serialise. Measured against a real database: it does serialise, on the
    // row lock that UPDATE wallets takes.
    const deliveries = await Promise.allSettled(
      Array.from({ length: 5 }, () => postWebhook(payload)),
    );

    // A loser surfacing as a 500 would be acceptable — Stripe retries and then
    // hits the idempotent path. Crediting more than once would not be.
    expect(deliveries.some((d) => d.status === "fulfilled")).toBe(true);

    expect(await balanceOf(walletId)).toBe(700);
    const ledger = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.stripeSessionId, sessionId));
    expect(ledger).toHaveLength(1);
  });

  it("the session-id unique index rejects a duplicate ledger row", async () => {
    // Asserted directly against the constraint rather than through the
    // handler, because the handler's own transaction serialises and therefore
    // never reaches the constraint. This is what protects any OTHER writer —
    // a backfill, a manual correction, a future code path — from recording the
    // same Stripe session twice. It fails if the index is missing from the
    // schema, which is the drift this lane exists to catch.
    await seedUserWithWallet(0);
    const sessionId = `cs_test_${randomUUID()}`;

    await db.insert(walletTransactions).values({
      walletId,
      amountCents: 100,
      type: "top_up",
      stripeSessionId: sessionId,
      description: "first",
    });

    await expect(
      db.insert(walletTransactions).values({
        walletId,
        amountCents: 100,
        type: "top_up",
        stripeSessionId: sessionId,
        description: "duplicate",
      }),
    ).rejects.toThrow();
  });

  it("does not credit when the signature is forged", async () => {
    await seedUserWithWallet(0);
    const payload = checkoutCompleted({
      sessionId: `cs_test_${randomUUID()}`,
      userId,
      amountCents: "9999",
    });

    const res = await postWebhook(
      payload,
      stripeSignature(payload, "whsec_wrong_secret"),
    );

    expect(res.status).toBe(400);
    expect(await balanceOf(walletId)).toBe(0);
  });

  it("credits by increment, not by absolute write", async () => {
    await seedUserWithWallet(12_345);
    const sessionId = `cs_test_${randomUUID()}`;
    await postWebhook(checkoutCompleted({ sessionId, userId, amountCents: "1" }));
    // An absolute write here is the failure mode that would clobber a
    // concurrent debit — the same class of bug as the solutions refund.
    expect(await balanceOf(walletId)).toBe(12_346);
  });

  // -- The two money-loss paths WP1 pinned, now inverted (WP11) --------------
  //
  // WP1 wrote these as PINS BUG tests asserting that both returned 200, so
  // Stripe stopped retrying and the payment was never credited. Its note said
  // "WP11 changes it to a retryable failure, at which point these expectations
  // must be inverted." They are inverted here — but not identically, because
  // the two cases are not the same kind of failure and treating them alike
  // would be cargo-culting the instruction rather than following it.

  it("a paid session for a user with no wallet is retried, not consumed", async () => {
    // Retryable: a wallet can appear between deliveries. A 200 here is what
    // made the money vanish — it told Stripe the event was handled.
    const orphanUserId = randomUUID();
    await db.insert(users).values({
      id: orphanUserId,
      email: `wp11-orphan-${orphanUserId}@example.test`,
      apiKeyHash: `hash-${orphanUserId}`,
      keyPrefix: "sk_test_wp1",
    });
    try {
      const sessionId = `cs_test_${randomUUID()}`;
      const res = await postWebhook(
        checkoutCompleted({
          sessionId,
          userId: orphanUserId,
          amountCents: "5000",
        }),
      );

      expect(res.status).toBe(503);
      const ledger = await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.stripeSessionId, sessionId));
      expect(ledger).toHaveLength(0);
    } finally {
      await db.delete(users).where(eq(users.id, orphanUserId));
    }
  });

  it("a paid session with missing metadata is not credited, and not retried either", async () => {
    // NOT retryable, deliberately. A session with no user_id will never
    // acquire one; redelivering the same object four more times over three
    // days ends in the same place. What was missing was never the retry — it
    // was that nobody found out, which the critical page now covers.
    await seedUserWithWallet(0);
    const sessionId = `cs_test_${randomUUID()}`;
    const res = await postWebhook(checkoutCompleted({ sessionId }));

    expect(res.status).toBe(200);
    expect(await balanceOf(walletId)).toBe(0);
  });

  // -- WP11: crediting is decided by Stripe's record, not by our metadata ----

  it("does not credit an unpaid completed session", async () => {
    // The delayed-notification case. Before WP11 this credited the wallet:
    // the handler read only metadata, which is fully populated whether or not
    // any money moved.
    await seedUserWithWallet(0);
    const sessionId = `cs_test_${randomUUID()}`;
    const res = await postWebhook(
      checkoutCompleted({
        sessionId,
        userId,
        amountCents: "5000",
        paymentStatus: "unpaid",
      }),
    );

    expect(res.status).toBe(200);
    expect(await balanceOf(walletId)).toBe(0);
  });

  it("credits the same session when it later settles via async_payment_succeeded", async () => {
    await seedUserWithWallet(0);
    const sessionId = `cs_test_${randomUUID()}`;

    await postWebhook(
      checkoutCompleted({ sessionId, userId, amountCents: "5000", paymentStatus: "unpaid" }),
    );
    expect(await balanceOf(walletId)).toBe(0);

    await postWebhook(
      checkoutCompleted({
        sessionId,
        userId,
        amountCents: "5000",
        eventType: "checkout.session.async_payment_succeeded",
      }),
    );
    expect(await balanceOf(walletId)).toBe(5000);
  });

  it("credits amount_total, not the metadata the session was created with", async () => {
    // A value assertion, not a shape one: metadata claims 9999 and Stripe
    // collected 2500. The pre-WP11 handler credited 9999 — a 74.96 EUR gift
    // per session to anyone who could influence metadata.
    await seedUserWithWallet(0);
    const sessionId = `cs_test_${randomUUID()}`;
    const res = await postWebhook(
      checkoutCompleted({
        sessionId,
        userId,
        amountCents: "9999",
        amountTotal: 2500,
      }),
    );

    expect(res.status).toBe(200);
    expect(await balanceOf(walletId)).toBe(2500);

    const [ledger] = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.stripeSessionId, sessionId));
    expect(ledger!.amountCents).toBe(2500);
  });

  it("does not credit a non-EUR session at 1:1", async () => {
    // The wallet holds EUR cents and the ledger description hardcodes EUR.
    // 5000 USD cents is not 5000 EUR cents.
    await seedUserWithWallet(0);
    const sessionId = `cs_test_${randomUUID()}`;
    const res = await postWebhook(
      checkoutCompleted({ sessionId, userId, amountCents: "5000", currency: "usd" }),
    );

    expect(res.status).toBe(200);
    expect(await balanceOf(walletId)).toBe(0);
  });
});
