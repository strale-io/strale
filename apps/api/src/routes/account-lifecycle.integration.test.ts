/**
 * WP11 / CR-09 + CR-10 — account creation, trial entitlement and key rotation
 * against a real Postgres.
 *
 * These belong in the DB lane rather than the unit suite because every claim
 * they make is a property of the database, not of the TypeScript:
 *
 *   - "signup is atomic" is a statement about what a rolled-back transaction
 *     leaves behind. A mocked db that resolves every call cannot fail to be
 *     atomic, so a unit test of it asserts nothing.
 *   - "one trial per email address, forever" is enforced by a UNIQUE index.
 *     The application path can only produce the error message.
 *   - "a recovery token is single-use" is enforced by a conditional UPDATE
 *     under concurrency. Two `Promise.all`-ed redemptions against a mock both
 *     see `used_at IS NULL`.
 *
 * The routes are driven through `app.request`, so the whole stack runs —
 * rate limiters, middleware, handlers, wallet service, migrations-created
 * tables — with nothing stubbed between the HTTP request and the rows.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import {
  apiKeyRecoveryTokens,
  transactions,
  trialGrants,
  users,
  wallets,
  walletTransactions,
} from "../db/schema.js";

if (process.env.DATABASE_URL_TEST) {
  process.env.FRONTEND_URL ??= "https://strale.dev";
  process.env.STRIPE_SECRET_KEY ??= "sk_test_wp11_placeholder";
  process.env.AUDIT_HMAC_SECRET ??= "wp11-integration-secret-at-least-32-chars";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

/**
 * `example.test` is reserved by RFC 6761 and resolves nowhere, so the MX gate
 * would refuse every address here. The resolver is stubbed at the module
 * boundary rather than the domain being chosen to satisfy DNS — a suite whose
 * outcome depends on a live lookup is a suite that fails on a train.
 */
vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  return {
    ...actual,
    default: actual,
    resolveMx: async (domain: string) => {
      if (domain === "no-mx.test") {
        // What a real resolver does for a domain that does not exist: it
        // THROWS ENOTFOUND. Returning `[]` would be a friendlier stub and a
        // less faithful one, and the difference is exactly where the gate can
        // silently stop working.
        const err = new Error("queryMx ENOTFOUND no-mx.test") as Error & { code: string };
        err.code = "ENOTFOUND";
        throw err;
      }
      return [{ exchange: `mx.${domain}`, priority: 10 }];
    },
  };
});

describeMaybe("WP11 — account lifecycle against a real database", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let app: Awaited<typeof import("../app.js")>["app"];

  /** Unique per run so a shared database does not collide across suites. */
  const RUN = randomUUID().slice(0, 8);
  const emailFor = (label: string) => `wp11-${RUN}-${label}@lifecycle.test`;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 6 });
    db = drizzle(client);
    ({ app } = await import("../app.js"));
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  /**
   * Every user id this run created, including ones whose email the closure
   * endpoint has since replaced with a sentinel.
   *
   * Matching on the email prefix alone is not enough and the gap is not
   * theoretical: closure rewrites the address to `redacted-<uuid>@deleted.local`,
   * so a test that closes an account and then fails an assertion before its
   * own cleanup leaves a wallet and a `closure_forfeit` ledger row behind
   * forever. Three such rows accumulated during the fail-before runs here and
   * broke an unrelated suite whose assertion selects `closure_forfeit` rows
   * without scoping them to its own wallet.
   */
  const createdUserIds = new Set<string>();

  afterEach(async () => {
    const created = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `wp11-${RUN}-%`));
    for (const r of created) createdUserIds.add(r.id);
    const ids = [...createdUserIds];
    if (ids.length > 0) {
      const ws = await db
        .select({ id: wallets.id })
        .from(wallets)
        .where(inArray(wallets.userId, ids));
      const walletIds = ws.map((w) => w.id);
      if (walletIds.length > 0) {
        await db
          .delete(walletTransactions)
          .where(inArray(walletTransactions.walletId, walletIds));
        await db.delete(wallets).where(inArray(wallets.id, walletIds));
      }
      await db
        .delete(apiKeyRecoveryTokens)
        .where(inArray(apiKeyRecoveryTokens.userId, ids));
      await db.delete(trialGrants).where(inArray(trialGrants.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    // Grants whose user row is already gone (closure tests) plus any seeded by
    // hand — matched on the ip_hash namespace this suite owns.
    await db.delete(trialGrants).where(like(trialGrants.ipHash, `wp11-${RUN}%`));
  });

  /**
   * A fresh client IP for every call unless one is named.
   *
   * `/v1/auth/register` is limited to 3 requests per minute per IP (DEC-21),
   * and that limiter is DB-backed, so it persists across tests in the same
   * run. Sharing an IP across the suite therefore produces 429s that look like
   * assertion failures. Tests that need to exercise the per-IP TRIAL cap pass
   * an explicit IP and seed the prior grants directly — the two limits are
   * different rules and proving one must not depend on the other.
   */
  // The counter alone is not enough: the limiter's rows outlive the process,
  // so a second run inside the same 60-second window re-uses run one's
  // addresses and produces 429s that read as assertion failures. The high
  // octets are seeded from this run's identifier so the namespace is fresh
  // every time. Found while proving the fail-before state — two recovery
  // tests "failed" against the pre-fix code for the wrong reason.
  // 254 usable host octets per /24, so the mapping below is a bijection from
  // the counter onto distinct addresses.
  const IP_SEED = (Number.parseInt(RUN.slice(0, 6), 16) % 30000) * 64;
  let ipCounter = 0;
  function freshIp(): string {
    ipCounter += 1;
    const n = IP_SEED + ipCounter;
    const host = (n % 254) + 1;
    const third = Math.floor(n / 254) % 256;
    const second = Math.floor(n / (254 * 256)) % 128;
    return `10.${second}.${third}.${host}`;
  }

  /**
   * Registers, and records the created id for cleanup before the caller sees
   * the response.
   *
   * Recording at creation rather than in `afterEach` is what makes cleanup
   * survive a failing assertion: by the time the hook runs, a test that closed
   * the account has already had its email rewritten to a sentinel, and no
   * prefix match can find it.
   */
  async function register(body: unknown, ip = freshIp()): Promise<Response> {
    const res = await app.request("http://localhost/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify(body),
    });
    if (res.status === 201) {
      const peek = (await res.clone().json()) as { user_id?: string };
      if (peek.user_id) createdUserIds.add(peek.user_id);
    }
    return res;
  }

  async function walletOf(userId: string) {
    const [row] = await db
      .select({ id: wallets.id, balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);
    return row ?? null;
  }

  // ── Atomic signup ────────────────────────────────────────────────────────

  it("creates the user, wallet, opening ledger row and entitlement together", async () => {
    const email = emailFor("atomic");
    const res = await register({ email });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user_id: string; wallet_balance_cents: number };

    const wallet = await walletOf(body.user_id);
    expect(wallet).not.toBeNull();
    expect(wallet!.balanceCents).toBe(200);
    expect(body.wallet_balance_cents).toBe(200);

    const ledger = await db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, wallet!.id));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.type).toBe("trial_credit");
    expect(ledger[0]!.amountCents).toBe(200);

    const grants = await db
      .select()
      .from(trialGrants)
      .where(eq(trialGrants.userId, body.user_id));
    expect(grants).toHaveLength(1);
    expect(grants[0]!.channel).toBe("register");
  });

  it("leaves no user row behind when the wallet write fails", async () => {
    // The defect stated as a test. Pre-WP11 the users INSERT was its own
    // commit, so a failure in the wallet step left an account that owned its
    // email address and could never spend — 409 forever on re-registration,
    // no wallet to debit, and nothing sweeping it.
    //
    // The failure is injected at the database rather than by stubbing the
    // wallet service, because what is being proved is that the two writes
    // share a transaction, and only the database can say whether they do.
    const email = emailFor("rollback");
    await db.execute(sql`
      CREATE OR REPLACE FUNCTION wp11_block_wallet_insert() RETURNS trigger AS $fn$
      BEGIN
        RAISE EXCEPTION 'wp11 injected wallet failure';
      END;
      $fn$ LANGUAGE plpgsql`);
    // Unconditional, and scoped by the `finally` below rather than by a WHEN
    // clause. A trigger's WHEN predicate is stored in the catalog and cannot
    // carry a bind parameter at all — the attempt fails with "could not
    // determine data type of parameter $1", which reads like a driver bug and
    // is not one. The lane runs `--no-file-parallelism` and tests within a
    // file are sequential, so nothing else inserts a wallet inside this window.
    await db.execute(sql`
      CREATE TRIGGER wp11_block_wallet_insert_trg
        BEFORE INSERT ON wallets
        FOR EACH ROW
        EXECUTE FUNCTION wp11_block_wallet_insert()`);

    try {
      const res = await register({ email });
      expect(res.status).toBeGreaterThanOrEqual(500);

      const orphans = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email));
      expect(orphans).toHaveLength(0);

      // The entitlement must roll back with everything else, or the address
      // burns its one trial on a signup that produced no account.
      const { hashEmail } = await import("../lib/trial-eligibility.js");
      const forEmail = await db
        .select({ id: trialGrants.id })
        .from(trialGrants)
        .where(eq(trialGrants.emailHash, hashEmail(email)));
      expect(forEmail).toHaveLength(0);
    } finally {
      await db.execute(sql`DROP TRIGGER IF EXISTS wp11_block_wallet_insert_trg ON wallets`);
      await db.execute(sql`DROP FUNCTION IF EXISTS wp11_block_wallet_insert()`);
    }
  });

  it("answers 409 for a duplicate email even when the pre-check races", async () => {
    // Both handlers used to SELECT-then-INSERT. Under concurrency the loser
    // hit the unique index and surfaced as a raw 500.
    const email = emailFor("dup-race");
    const results = await Promise.all([register({ email }), register({ email })]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 409]);

    const rows = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
  });

  // ── One trial authority ──────────────────────────────────────────────────

  it("withholds the grant from an address that has already had one, even after closure", async () => {
    // The delete → re-register loop. Closure anonymises the users row, so any
    // entitlement recorded there is destroyed by the very action it is meant
    // to survive; the entitlement is keyed on a one-way hash of the address
    // instead.
    const email = emailFor("reclaim");
    const first = await register({ email });
    expect(first.status).toBe(201);
    const { api_key: apiKey, user_id: firstUserId } = (await first.json()) as {
      api_key: string;
      user_id: string;
    };

    const closed = await app.request("http://localhost/v1/auth/me", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reason: "wp11 test" }),
    });
    expect(closed.status).toBe(200);

    const again = await register({ email });
    expect(again.status).toBe(201);
    const body = (await again.json()) as {
      user_id: string;
      wallet_balance_cents: number;
      trial_credits?: { granted: boolean; reason: string };
    };

    // Account: yes. Second EUR 2.00: no.
    expect(body.wallet_balance_cents).toBe(0);
    expect(body.trial_credits).toMatchObject({
      granted: false,
      reason: "email_already_granted",
    });

    const wallet = await walletOf(body.user_id);
    expect(wallet).not.toBeNull();
    expect(wallet!.balanceCents).toBe(0);

    // Clean up the redacted first account, which no longer matches the
    // afterEach email prefix.
    const w = await walletOf(firstUserId);
    if (w) {
      await db.delete(walletTransactions).where(eq(walletTransactions.walletId, w.id));
      await db.delete(wallets).where(eq(wallets.id, w.id));
    }
    await db.delete(trialGrants).where(eq(trialGrants.userId, firstUserId));
    await db.delete(users).where(eq(users.id, firstUserId));
  });

  it("grants up to the per-IP cap and withholds beyond it", async () => {
    // Production evidence for this one: eight accounts share signup IP hash
    // d5ab85828d59fa6f, created over 44 hours in May 2026, each granted
    // EUR 2.00 — all through the register path, which ran no gate at all.
    // Neither domain involved is on the disposable list, so this cap is the
    // gate that would have stopped it.
    //
    // The prior grants are seeded rather than registered, because `/register`
    // is separately limited to 3/min/IP. Driving the trial cap through the
    // rate limiter would prove whichever of the two bit first, which is not
    // the question.
    const { hashIp } = await import("../lib/middleware.js");
    const { MAX_TRIAL_GRANTS_PER_IP } = await import("../lib/trial-eligibility.js");
    // Fixed for this test but still drawn from the run-unique namespace, so
    // a rerun inside the register limiter window does not collide with itself.
    const ip = freshIp();
    const ipHash = hashIp(ip);

    // One below the cap: still granted.
    const { hashEmail } = await import("../lib/trial-eligibility.js");
    for (let i = 0; i < MAX_TRIAL_GRANTS_PER_IP - 1; i++) {
      await db.insert(trialGrants).values({
        emailHash: hashEmail(emailFor(`ipcap-seed-${i}`)),
        ipHash,
        grantedCents: 200,
        channel: "register",
      });
    }
    const under = await register({ email: emailFor("ipcap-under") }, ip);
    expect(under.status).toBe(201);
    expect(((await under.json()) as { wallet_balance_cents: number }).wallet_balance_cents)
      .toBe(200);

    // That registration was itself the cap-th grant, so the next one is over.
    const over = await register({ email: emailFor("ipcap-over") }, ip);
    expect(over.status).toBe(201);
    const body = (await over.json()) as {
      user_id: string;
      wallet_balance_cents: number;
      trial_credits?: { granted: boolean; reason: string };
    };
    expect(body.wallet_balance_cents).toBe(0);
    expect(body.trial_credits).toMatchObject({ granted: false, reason: "ip_trial_cap" });

    // Withholding money is not refusing service: a shared office NAT must not
    // lock a paying customer out of signing up at all.
    const wallet = await walletOf(body.user_id);
    expect(wallet).not.toBeNull();
    expect(wallet!.balanceCents).toBe(0);

    await db.delete(trialGrants).where(eq(trialGrants.ipHash, ipHash));
  });

  it("refuses the account for a domain with no mail exchanger", async () => {
    // Previously applied on /v1/signup only. A validity failure refuses;
    // an entitlement failure withholds. This is the former.
    const res = await register({ email: `wp11-${RUN}-nomx@no-mx.test` });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { details?: { reason?: string } };
    expect(body.details?.reason).toBe("no_mail_exchanger");
  });

  it("applies the same entitlement authority to the agent self-signup channel", async () => {
    // The channels used to disagree by construction: `/v1/signup` ran four
    // gates and `/v1/auth/register` ran none. Now both consult one module, so
    // an entitlement already spent is visible from either. Proved on the
    // agent channel with an address whose grant exists but whose account does
    // not — the shape a closed-then-reopened account leaves behind.
    const { hashEmail } = await import("../lib/trial-eligibility.js");
    const { hashIp } = await import("../lib/middleware.js");
    const email = emailFor("agent-spent");
    // /v1/signup is limited to 1 per DAY per IP, so a repeated address is a
    // 429 tomorrow as well as today. Drawn from the run-unique namespace.
    const ip = freshIp();

    await db.insert(trialGrants).values({
      emailHash: hashEmail(email),
      ipHash: `wp11-${RUN}c`,
      grantedCents: 200,
      channel: "register",
    });

    // The agent channel's own gate — one prior successful free-tier call from
    // this IP — is a channel rule, not a trial rule, and stays where it is.
    // Satisfied here rather than bypassed, so the assertion below is about the
    // entitlement and not about which gate happened to answer first.
    await db.insert(transactions).values({
      capabilitySlug: "email-validate",
      status: "completed",
      isFreeTier: true,
      priceCents: 0,
      pricePaidCents: 0,
      input: { email: "someone@example.com" },
      auditTrail: { request_context: { ipHash: hashIp(ip) } },
    });

    const res = await app.request("http://localhost/v1/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ email }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      balance_cents: number;
      trial_credits?: { granted: boolean; reason: string };
    };
    expect(body.balance_cents).toBe(0);
    expect(body.trial_credits).toMatchObject({
      granted: false,
      reason: "email_already_granted",
    });

    await db
      .delete(transactions)
      .where(
        sql`${transactions.auditTrail}->'request_context'->>'ipHash' = ${hashIp(ip)}`,
      );
  });

  it("the unique index, not the handler, is what makes one-trial-per-email true", async () => {
    // The application read is advisory: two concurrent signups can both pass
    // it. Asserted against the constraint directly so a schema drift that
    // dropped the index fails here rather than in production.
    const emailHash = "f".repeat(64);
    await db.insert(trialGrants).values({
      emailHash,
      ipHash: `wp11-${RUN}a`,
      grantedCents: 200,
      channel: "register",
    });
    await expect(
      db.insert(trialGrants).values({
        emailHash,
        ipHash: `wp11-${RUN}b`,
        grantedCents: 200,
        channel: "register",
      }),
    ).rejects.toThrow();
    await db.delete(trialGrants).where(eq(trialGrants.emailHash, emailHash));
  });

  it("the migration backfills entitlements for accounts that predate the rule", async () => {
    // Without the backfill the rule grandfathers in every existing account:
    // each of the 59 production wallets holding a trial_credit entry could
    // close and re-register for a second grant on the day this ships. Proved
    // against the real block rather than the SQL text, because the hash has to
    // agree with `hashEmail` for the entitlement to apply to anything.
    const { hashEmail } = await import("../lib/trial-eligibility.js");
    const { runMigration0102_accountLifecycleTables } = await import(
      "../lib/startup-migrations.js"
    );
    const email = emailFor("legacy");

    // An account exactly as it looked before WP11: user, wallet, trial ledger
    // entry, and no entitlement row anywhere.
    const legacyId = randomUUID();
    createdUserIds.add(legacyId);
    await db.insert(users).values({
      id: legacyId,
      email,
      apiKeyHash: `hash-${legacyId}`,
      keyPrefix: "sk_live_wp11",
    });
    const [legacyWallet] = await db
      .insert(wallets)
      .values({ userId: legacyId, balanceCents: 200 })
      .returning({ id: wallets.id });
    await db.insert(walletTransactions).values({
      walletId: legacyWallet!.id,
      amountCents: 200,
      type: "trial_credit",
      description: "Welcome trial credits",
    });
    expect(
      await db.select().from(trialGrants).where(eq(trialGrants.emailHash, hashEmail(email))),
    ).toHaveLength(0);

    // Re-arm the one-shot gate so the block's backfill runs again here.
    await db.execute(
      sql`DELETE FROM startup_migration_ledger WHERE block = '0102_account_lifecycle_tables'`,
    );
    await runMigration0102_accountLifecycleTables(db as never);

    const backfilled = await db
      .select()
      .from(trialGrants)
      .where(eq(trialGrants.emailHash, hashEmail(email)));
    expect(backfilled).toHaveLength(1);
    expect(backfilled[0]!.channel).toBe("backfill");
    expect(backfilled[0]!.grantedCents).toBe(200);
    expect(backfilled[0]!.userId).toBe(legacyId);

    // And the entitlement now bites: the same address cannot take a second
    // grant, which is the whole point of seeding it.
    await db.delete(walletTransactions).where(eq(walletTransactions.walletId, legacyWallet!.id));
    await db.delete(wallets).where(eq(wallets.id, legacyWallet!.id));
    await db.delete(users).where(eq(users.id, legacyId));

    const res = await register({ email });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      wallet_balance_cents: number;
      trial_credits?: { reason: string };
    };
    expect(body.wallet_balance_cents).toBe(0);
    expect(body.trial_credits).toMatchObject({ reason: "email_already_granted" });

    await db.delete(trialGrants).where(eq(trialGrants.emailHash, hashEmail(email)));
  });

  // ── Proof before rotation ────────────────────────────────────────────────

  it("requesting recovery does not rotate the key", async () => {
    // The revocation denial-of-service, stated as a test. Pre-WP11 an
    // unauthenticated request naming an address invalidated that account's
    // working key immediately.
    const email = emailFor("dos");
    const created = await register({ email });
    const { api_key: apiKey } = (await created.json()) as { api_key: string };

    const before = await app.request("http://localhost/v1/wallet/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(before.status).toBe(200);

    const recover = await app.request("http://localhost/v1/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": freshIp() },
      body: JSON.stringify({ email }),
    });
    expect(recover.status).toBe(200);

    const after = await app.request("http://localhost/v1/wallet/balance", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    expect(after.status).toBe(200);
  });

  it("rotates only on redemption, and the old key stops working", async () => {
    const email = emailFor("rotate");
    const created = await register({ email });
    const { api_key: oldKey, user_id } = (await created.json()) as {
      api_key: string;
      user_id: string;
    };

    const requested = await app.request("http://localhost/v1/auth/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": freshIp() },
      body: JSON.stringify({ email }),
    });
    expect(requested.status).toBe(200);

    // The plaintext token never leaves the process, so the test reconstructs
    // the redemption the way the mailbox holder would: by knowing it. Read
    // back through the same hash the issuer wrote.
    const [row] = await db
      .select({ id: apiKeyRecoveryTokens.id })
      .from(apiKeyRecoveryTokens)
      .where(eq(apiKeyRecoveryTokens.userId, user_id));
    expect(row).toBeDefined();

    const { generateRecoveryToken, hashRecoveryToken } = await import(
      "../lib/key-recovery.js"
    );
    const knownToken = generateRecoveryToken();
    await db
      .update(apiKeyRecoveryTokens)
      .set({ tokenHash: hashRecoveryToken(knownToken) })
      .where(eq(apiKeyRecoveryTokens.id, row!.id));

    const confirm = await app.request("http://localhost/v1/auth/recover/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": freshIp() },
      body: JSON.stringify({ email, token: knownToken }),
    });
    expect(confirm.status).toBe(200);
    const { api_key: newKey } = (await confirm.json()) as { api_key: string };
    expect(newKey).not.toBe(oldKey);

    const withOld = await app.request("http://localhost/v1/wallet/balance", {
      headers: { Authorization: `Bearer ${oldKey}` },
    });
    expect(withOld.status).toBe(401);

    const withNew = await app.request("http://localhost/v1/wallet/balance", {
      headers: { Authorization: `Bearer ${newKey}` },
    });
    expect(withNew.status).toBe(200);
  });

  it("a token redeems exactly once, even under concurrent redemption", async () => {
    // The single-use property is a conditional UPDATE inside a transaction,
    // not a read-then-write. Two overlapping redemptions must produce one
    // rotation — otherwise the customer is handed a key that the second
    // redemption has already replaced.
    const email = emailFor("once");
    const created = await register({ email });
    const { user_id } = (await created.json()) as { user_id: string };

    const { issueRecoveryToken, redeemRecoveryToken } = await import(
      "../lib/key-recovery.js"
    );
    const { token } = await issueRecoveryToken(db, { userId: user_id, ipHash: null });

    const results = await Promise.all([
      redeemRecoveryToken(db, { token, email }),
      redeemRecoveryToken(db, { token, email }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
  });

  it("a token issued for one account cannot rotate another", async () => {
    const victimEmail = emailFor("victim");
    const attackerEmail = emailFor("attacker");
    const victim = await register({ email: victimEmail });
    const { user_id: victimId, api_key: victimKey } = (await victim.json()) as {
      user_id: string;
      api_key: string;
    };
    await register({ email: attackerEmail });

    const { issueRecoveryToken } = await import("../lib/key-recovery.js");
    const { token } = await issueRecoveryToken(db, { userId: victimId, ipHash: null });

    const res = await app.request("http://localhost/v1/auth/recover/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": freshIp() },
      body: JSON.stringify({ email: attackerEmail, token }),
    });
    expect(res.status).toBe(401);

    const stillWorks = await app.request("http://localhost/v1/wallet/balance", {
      headers: { Authorization: `Bearer ${victimKey}` },
    });
    expect(stillWorks.status).toBe(200);
  });

  it("an expired token does not rotate", async () => {
    const email = emailFor("expired");
    const created = await register({ email });
    const { user_id, api_key } = (await created.json()) as {
      user_id: string;
      api_key: string;
    };

    const { issueRecoveryToken, redeemRecoveryToken } = await import(
      "../lib/key-recovery.js"
    );
    const { token } = await issueRecoveryToken(db, { userId: user_id, ipHash: null });
    await db
      .update(apiKeyRecoveryTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(apiKeyRecoveryTokens.userId, user_id));

    const result = await redeemRecoveryToken(db, { token, email });
    expect(result.ok).toBe(false);

    const stillWorks = await app.request("http://localhost/v1/wallet/balance", {
      headers: { Authorization: `Bearer ${api_key}` },
    });
    expect(stillWorks.status).toBe(200);
  });

  it("a new request invalidates the previous outstanding token", async () => {
    const email = emailFor("supersede");
    const created = await register({ email });
    const { user_id } = (await created.json()) as { user_id: string };

    const { issueRecoveryToken, redeemRecoveryToken } = await import(
      "../lib/key-recovery.js"
    );
    const first = await issueRecoveryToken(db, { userId: user_id, ipHash: null });
    const second = await issueRecoveryToken(db, { userId: user_id, ipHash: null });

    expect((await redeemRecoveryToken(db, { token: first.token, email })).ok).toBe(false);
    expect((await redeemRecoveryToken(db, { token: second.token, email })).ok).toBe(true);
  });

  it("a closed account cannot be recovered into", async () => {
    const email = emailFor("closed-recover");
    const created = await register({ email });
    const { api_key, user_id } = (await created.json()) as {
      api_key: string;
      user_id: string;
    };

    const { issueRecoveryToken, redeemRecoveryToken } = await import(
      "../lib/key-recovery.js"
    );
    const { token } = await issueRecoveryToken(db, { userId: user_id, ipHash: null });

    await app.request("http://localhost/v1/auth/me", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "wp11 test" }),
    });

    // Art. 17 erasure is one-way. A token issued before closure must not
    // resurrect access to the redacted row.
    const result = await redeemRecoveryToken(db, { token, email });
    expect(result.ok).toBe(false);

    const w = await walletOf(user_id);
    if (w) {
      await db.delete(walletTransactions).where(eq(walletTransactions.walletId, w.id));
      await db.delete(wallets).where(eq(wallets.id, w.id));
    }
    await db
      .delete(apiKeyRecoveryTokens)
      .where(eq(apiKeyRecoveryTokens.userId, user_id));
    await db.delete(trialGrants).where(eq(trialGrants.userId, user_id));
    await db.delete(users).where(eq(users.id, user_id));
  });

  // ── Closure stays ledger-consistent (WP2's invariant, re-proved here) ─────

  it("closure forfeits the balance through the ledger, not by zeroing it", async () => {
    const email = emailFor("closure-ledger");
    const created = await register({ email });
    const { api_key, user_id } = (await created.json()) as {
      api_key: string;
      user_id: string;
    };
    const wallet = await walletOf(user_id);

    await app.request("http://localhost/v1/auth/me", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "wp11 test" }),
    });

    const after = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.id, wallet!.id));
    expect(after[0]!.balanceCents).toBe(0);

    const [sum] = await db
      .select({ total: sql<number>`COALESCE(SUM(amount_cents), 0)::int` })
      .from(walletTransactions)
      .where(eq(walletTransactions.walletId, wallet!.id));
    // The property: the ledger still sums to the balance. Before WP2 the
    // closure wrote no entry at all, so this wallet's ledger and balance
    // disagreed permanently.
    expect(Number(sum!.total)).toBe(0);

    const forfeits = await db
      .select({ id: walletTransactions.id })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.walletId, wallet!.id),
          eq(walletTransactions.type, "closure_forfeit"),
        ),
      );
    expect(forfeits).toHaveLength(1);

    await db.delete(walletTransactions).where(eq(walletTransactions.walletId, wallet!.id));
    await db.delete(wallets).where(eq(wallets.id, wallet!.id));
    await db.delete(trialGrants).where(eq(trialGrants.userId, user_id));
    await db.delete(users).where(eq(users.id, user_id));
  });
});
