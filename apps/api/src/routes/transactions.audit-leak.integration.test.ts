/**
 * The response must not hand the caller a redacted string and an un-redacted
 * one in the same body.
 *
 * `GET /v1/transactions/:id` serves `error` through `sanitizeFailureReason`
 * and used to serve `audit_trail` verbatim — and `buildFailureAudit` wrote the
 * RAW `err.message` into `audit_trail.error_message`. Both halves were correct
 * in isolation; the response containing both was the defect.
 *
 * Unit coverage for the redaction itself is in `lib/sanitize.audit.test.ts`.
 * This drives the real route end to end, because the property that matters is
 * about a whole HTTP response, and because the deep walk below catches an
 * error-bearing audit field nobody has thought of yet — which is the failure
 * mode a named-key redactor has.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import { capabilities, transactions, users, wallets, walletTransactions } from "../db/schema.js";

if (process.env.DATABASE_URL_TEST) {
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.AUDIT_HMAC_SECRET ??= "audit-leak-secret-at-least-32-chars-long-00";
  process.env.ADMIN_SECRET ??= "audit-leak-admin-secret-at-least-32-chars-0";
  process.env.STRIPE_SECRET_KEY ??= "sk_test_audit_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_audit_placeholder";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

/**
 * The material that must not survive into the response.
 *
 * A hostname, a full URL with credentials, and a vendor name — one of each
 * class the sanitiser strips, in a single message, so a partial fix shows up
 * as a partial failure rather than passing.
 */
const LEAKY =
  "Browserless call to https://svc:hunter2@internal.example.com/render failed for host api.some-vendor.example";
const FORBIDDEN = [
  "internal.example.com",
  "api.some-vendor.example",
  "hunter2",
  "svc:hunter2",
  "Browserless",
];

/** Every string anywhere in a structure, however nested. */
function allStrings(value: unknown, acc: string[] = []): string[] {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, acc);
  else if (value && typeof value === "object")
    for (const v of Object.values(value)) allStrings(v, acc);
  return acc;
}

describeMaybe("GET /v1/transactions/:id does not leak the raw error", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];
  let registerCapability: (slug: string, fn: () => Promise<never>) => void;
  let boomSlug = "";
  const seeded: { userId: string; walletId: string }[] = [];
  const seededCaps: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 6 });
    db = drizzle(client);

    ({ registerCapability } = (await import("../capabilities/index.js")) as never);
    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    for (const { userId, walletId } of seeded) {
      await db.delete(transactions).where(eq(transactions.userId, userId));
      await db.delete(walletTransactions).where(eq(walletTransactions.walletId, walletId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
      await db.delete(users).where(eq(users.id, userId));
    }
    seeded.length = 0;
    for (const id of seededCaps) {
      await db.delete(transactions).where(eq(transactions.capabilityId, id));
      await db.delete(capabilities).where(eq(capabilities.id, id));
    }
    seededCaps.length = 0;
  });

  /**
   * A FRESH slug per test.
   *
   * The circuit breaker opens after three consecutive failures of the same
   * slug, and every test here fails the same capability on purpose — so a
   * shared slug meant the fourth test got a 503 from an open breaker and no
   * transaction row at all. Per-test slugs keep each case independent.
   */
  async function seedCapability(): Promise<string> {
    const id = randomUUID();
    seededCaps.push(id);
    boomSlug = `audit-leak-${randomUUID().slice(0, 8)}`;
    registerCapability(boomSlug, async () => {
      throw new Error(LEAKY);
    });
    await db.insert(capabilities).values({
      id,
      slug: boomSlug,
      name: `Audit leak probe ${boomSlug}`,
      description: "Seeded by the audit-trail leak test.",
      category: "developer-tools",
      inputSchema: { type: "object", properties: { probe: { type: "string" } } },
      outputSchema: { type: "object", properties: { ok: { type: "boolean" } } },
      priceCents: 25,
      isActive: true,
      transparencyTag: "algorithmic",
      avgLatencyMs: 50,
      lifecycleState: "active",
      visible: true,
    });
    return id;
  }

  async function seedUser(): Promise<string> {
    const userId = randomUUID();
    const walletId = randomUUID();
    const apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;
    seeded.push({ userId, walletId });
    await db.insert(users).values({
      id: userId,
      email: `audit-leak-${userId}@example.test`,
      apiKeyHash: hashApiKey(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
    });
    await db.insert(wallets).values({ id: walletId, userId, balanceCents: 10_000 });
    return apiKey;
  }

  /** Fail an execution, then fetch its transaction. Returns both responses. */
  async function failThenFetch(apiKey: string) {
    const doRes = await app.request("http://localhost/v1/do", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        capability_slug: boomSlug,
        inputs: { probe: "x" },
        max_price_cents: 25,
      }),
    });
    const doBody: any = await doRes.json();

    const [row] = await db
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.capabilityId, seededCaps[seededCaps.length - 1]));

    // Surface the /v1/do response when no row was created. Without this the
    // helper throws an opaque TypeError on `row.id` and hides the reason.
    if (!row) {
      throw new Error(
        `no transaction row was created; /v1/do answered ${doRes.status}: ` +
          JSON.stringify(doBody).slice(0, 400),
      );
    }

    const txRes = await app.request(`http://localhost/v1/transactions/${row.id}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return { doBody, txBody: (await txRes.json()) as any, txnId: row.id };
  }

  it("no leaked material survives ANYWHERE in the served body", async () => {
    // The deep walk is the point. A named-key redactor misses a field nobody
    // has invented yet; this walks every string in the whole response, so a
    // new error-bearing audit key fails here the day it is added.
    await seedCapability();
    const apiKey = await seedUser();
    const { txBody } = await failThenFetch(apiKey);

    const strings = allStrings(txBody);
    expect(strings.length).toBeGreaterThan(5); // the walk found a real body

    for (const forbidden of FORBIDDEN) {
      const offenders = strings.filter((s) => s.includes(forbidden));
      expect(
        offenders,
        `"${forbidden}" survived into the response: ${JSON.stringify(offenders).slice(0, 300)}`,
      ).toEqual([]);
    }
  });

  it("the audit copy is byte-identical to the caller-visible error", async () => {
    // The two must not merely both be safe — they must be the SAME string, or
    // there are two authorities for what the customer is told went wrong.
    await seedCapability();
    const apiKey = await seedUser();
    const { doBody, txBody } = await failThenFetch(apiKey);

    const servedByDo = String(doBody?.details?.error ?? "");
    const servedByGet = String(txBody.error ?? "");
    const inAudit = String(txBody.audit_trail?.error_message ?? "");

    expect(servedByDo, "the /v1/do response carried no error to compare").not.toBe("");
    expect(servedByGet).toBe(servedByDo);
    expect(inAudit).toBe(servedByDo);
  });

  it("the fixture really is leaky, so the assertions above are not vacuous", async () => {
    // If the raw message ever stops containing anything the sanitiser strips,
    // every assertion in this file passes while proving nothing. That is
    // exactly how the sibling receipt test went green over a real defect.
    await seedCapability();
    const apiKey = await seedUser();
    const { txBody, txnId } = await failThenFetch(apiKey);

    const [stored] = await db
      .select({ error: transactions.error })
      .from(transactions)
      .where(eq(transactions.id, txnId));

    expect(stored.error, "the raw message is not stored at rest any more").toContain(
      "internal.example.com",
    );
    expect(stored.error).toContain("hunter2");
    // ... and none of it reaches the caller.
    expect(String(txBody.audit_trail?.error_message ?? "")).not.toBe(stored.error);
  });

  it("WRITE SIDE: what is STORED in audit_trail is already sanitised", async () => {
    // Read from the database, not from the response, so this pins the write
    // half ON ITS OWN. The mutation battery found that reverting either half
    // alone left the end-to-end test green -- each independently prevents the
    // leak -- so neither was actually proven. This is the write half.
    //
    // It matters beyond belt-and-braces: sanitising at write is what makes the
    // row safe AT REST and on any future surface that reads audit_trail.
    await seedCapability();
    const apiKey = await seedUser();
    const { txnId } = await failThenFetch(apiKey);

    const [stored] = await db
      .select({ auditTrail: transactions.auditTrail })
      .from(transactions)
      .where(eq(transactions.id, txnId));

    const storedMsg = String(
      (stored.auditTrail as { error_message?: unknown } | null)?.error_message ?? "",
    );
    expect(storedMsg, "no error_message was stored at all").not.toBe("");
    for (const forbidden of FORBIDDEN) {
      expect(storedMsg, `"${forbidden}" is stored raw in audit_trail`).not.toContain(forbidden);
    }
  });

  it("SERVE SIDE: a legacy row stored RAW is redacted on the way out", async () => {
    // The other half, pinned on its own. The 51 rows written before the write
    // fix carry a raw error_message and CANNOT be rewritten -- audit_trail is
    // inside the integrity-chain payload, so editing one would invalidate its
    // hash. Serving is the only place left to fix them, and this is the case
    // that proves it happens.
    const capId = await seedCapability();
    const apiKey = await seedUser();
    const userId = seeded[seeded.length - 1].userId;

    // Written directly, exactly as a pre-fix row looks.
    const txnId = randomUUID();
    await db.insert(transactions).values({
      id: txnId,
      userId,
      capabilityId: capId,
      status: "failed",
      input: {},
      error: LEAKY,
      priceCents: 0,
      transparencyMarker: "algorithmic",
      dataJurisdiction: "EU",
      auditTrail: { status: "failed", error_message: LEAKY },
      completedAt: new Date(),
    });

    const res = await app.request(`http://localhost/v1/transactions/${txnId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const body: any = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(200);

    // The stored row is still raw -- history is not rewritten.
    const [stillStored] = await db
      .select({ auditTrail: transactions.auditTrail })
      .from(transactions)
      .where(eq(transactions.id, txnId));
    expect(
      String((stillStored.auditTrail as { error_message?: unknown }).error_message),
    ).toBe(LEAKY);

    // ...and none of it reaches the caller.
    for (const forbidden of FORBIDDEN) {
      const offenders = allStrings(body).filter((x) => x.includes(forbidden));
      expect(offenders, `"${forbidden}" survived from a legacy row`).toEqual([]);
    }
  });

  it("keeps the raw text at rest for operators, on the internal surface only", async () => {
    // Requirement: do not destroy diagnostic value. `transactions.error` still
    // holds the unredacted message; it is simply never served. That column is
    // the one internal surface, and every route that serves it sanitises.
    await seedCapability();
    const apiKey = await seedUser();
    const { txnId } = await failThenFetch(apiKey);

    const [stored] = await db
      .select({ error: transactions.error })
      .from(transactions)
      .where(eq(transactions.id, txnId));
    expect(stored.error).toBe(LEAKY);
  });
});
