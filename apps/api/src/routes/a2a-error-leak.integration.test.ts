/**
 * The A2A rail must not serve a raw internal error.
 *
 * `tasks/get` returned `transactions.error` verbatim, and `a2a.ts` did not
 * import `sanitizeFailureReason` at all. The same column has always been
 * sanitised by `GET /v1/transactions/:id`; PR #383 closed this boundary inside
 * the sanitiser's canned branches and #384 closed it for the audit copy. This
 * rail was simply never wired to it.
 *
 * Measured read-only against production before the fix: of the failed
 * transactions reachable here — scoped to the authenticated user's own rows —
 * 69 distinct messages across 41,027 rows differ from their sanitised form
 * (14.3%), window 2026-05-25 to 2026-08-24.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { hashApiKey, getKeyPrefix } from "../lib/auth.js";
import { transactions, users, wallets } from "../db/schema.js";
import { sanitizeFailureReason } from "../lib/sanitize.js";

if (process.env.DATABASE_URL_TEST) {
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.AUDIT_HMAC_SECRET ??= "a2a-leak-secret-at-least-32-chars-long-0000";
  process.env.ADMIN_SECRET ??= "a2a-leak-admin-secret-at-least-32-chars-000";
  process.env.STRIPE_SECRET_KEY ??= "sk_test_a2a_placeholder";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_a2a_placeholder";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

/**
 * A message the sanitiser genuinely rewrites — credentials, a URL, a hostname
 * and a provider name. A fixture it leaves unchanged would make every
 * assertion below vacuous, which is a mistake this repo has already made once.
 */
const LEAKY =
  "Browserless call to https://svc:hunter2@internal.example.com/render failed " +
  "for host api.some-vendor.example";
const FORBIDDEN = ["internal.example.com", "hunter2", "api.some-vendor.example", "Browserless"];

describeMaybe("A2A tasks/get does not serve a raw internal error", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];
  const seeded: { userId: string; walletId: string }[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);
    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    for (const { userId, walletId } of seeded) {
      await db.delete(transactions).where(eq(transactions.userId, userId));
      await db.delete(wallets).where(eq(wallets.id, walletId));
      await db.delete(users).where(eq(users.id, userId));
    }
    seeded.length = 0;
  });

  async function seedUser(): Promise<string> {
    const userId = randomUUID();
    const walletId = randomUUID();
    const apiKey = `sk_live_${randomUUID().replace(/-/g, "")}`;
    seeded.push({ userId, walletId });
    await db.insert(users).values({
      id: userId,
      email: `a2a-leak-${userId}@example.test`,
      apiKeyHash: hashApiKey(apiKey),
      keyPrefix: getKeyPrefix(apiKey),
    });
    await db.insert(wallets).values({ id: walletId, userId, balanceCents: 10_000 });
    return apiKey;
  }

  async function seedFailedTxn(userId: string): Promise<string> {
    const id = randomUUID();
    await db.insert(transactions).values({
      id,
      userId,
      status: "failed",
      input: {},
      error: LEAKY,
      priceCents: 0,
      transparencyMarker: "algorithmic",
      dataJurisdiction: "EU",
      solutionSlug: "_a2a_leak_probe",
      completedAt: new Date(),
    });
    return id;
  }

  function tasksGet(apiKey: string, taskId: string) {
    return app.request("http://localhost/a2a", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tasks/get",
        params: { id: taskId },
      }),
    });
  }

  /** Every string anywhere in a response, so nothing hides in a nested part. */
  function allStrings(v: unknown, acc: string[] = []): string[] {
    if (typeof v === "string") acc.push(v);
    else if (Array.isArray(v)) v.forEach((x) => allStrings(x, acc));
    else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, acc));
    return acc;
  }

  it("the fixture really is leaky, so the assertions below are not vacuous", () => {
    const clean = sanitizeFailureReason(LEAKY);
    expect(clean).not.toBe(LEAKY);
    for (const f of FORBIDDEN) expect(clean).not.toContain(f);
  });

  it("serves the SANITISED error, not the stored raw one", async () => {
    const apiKey = await seedUser();
    const userId = seeded[seeded.length - 1].userId;
    const taskId = await seedFailedTxn(userId);

    const res = await tasksGet(apiKey, taskId);
    const body: any = await res.json();

    const text = body?.result?.status?.message?.parts?.[0]?.text;
    expect(text, JSON.stringify(body).slice(0, 300)).toBe(sanitizeFailureReason(LEAKY));
    expect(text).not.toBe(LEAKY);
  });

  it("no forbidden material survives ANYWHERE in the A2A response", async () => {
    const apiKey = await seedUser();
    const userId = seeded[seeded.length - 1].userId;
    const taskId = await seedFailedTxn(userId);

    const body = await (await tasksGet(apiKey, taskId)).json();
    for (const forbidden of FORBIDDEN) {
      const offenders = allStrings(body).filter((x) => x.includes(forbidden));
      expect(offenders, `"${forbidden}" survived through the A2A rail`).toEqual([]);
    }
  });

  it("leaves the stored row raw, so operators keep the diagnostic", async () => {
    // Same posture as every other surface: sanitise on the way out, keep the
    // raw text at rest where operators expect it.
    const apiKey = await seedUser();
    const userId = seeded[seeded.length - 1].userId;
    const taskId = await seedFailedTxn(userId);
    await tasksGet(apiKey, taskId);

    const [row] = await db.select().from(transactions).where(eq(transactions.id, taskId));
    expect(row?.error).toBe(LEAKY);
  });
});
