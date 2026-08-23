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
  disputeRequests,
  failedRequests,
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
    // The implicit-MX fallback must be stubbed too, or a test whose MX lookup
    // fails silently reaches the real network and its outcome depends on DNS.
    resolve4: async (domain: string) => {
      if (domain === "no-mx.test") {
        const err = new Error("queryA ENOTFOUND no-mx.test") as Error & { code: string };
        err.code = "ENOTFOUND";
        throw err;
      }
      return ["203.0.113.10"];
    },
    resolve6: async () => {
      const err = new Error("queryAaaa ENODATA") as Error & { code: string };
      err.code = "ENODATA";
      throw err;
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

  /**
   * Every address this run created an account for.
   *
   * `trial_grants` deliberately outlives the account and closure NULLs its
   * `user_id`, so neither the id set above nor the email prefix can reach a
   * closed account's entitlement row. The hash can. Cleanup that only runs on
   * the happy path is not cleanup — a failing assertion leaves the row behind,
   * which is how this suite has now leaked into the shared lane database
   * twice.
   */
  const createdEmails = new Set<string>();

  /** Rows this suite seeds by hand into tables the afterEach cannot key on. */
  const RUN_TAG = `wp11-${RUN}`;

  /**
   * Transaction rows this suite inserts directly.
   *
   * Tracked by id rather than by a tagged column: `transactions` has no
   * `capability_slug` in the drizzle schema — it carries `capability_id` — so
   * tagging one silently did nothing on insert and rendered
   * `like(undefined, $1)` on delete, which Postgres rejects outright.
   */
  const createdTransactionIds = new Set<string>();

  afterEach(async () => {
    const created = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, `wp11-${RUN}-%`));
    for (const r of created) createdUserIds.add(r.id);
    const ids = [...createdUserIds];

    // Order is foreign keys, innermost first. `transactions` references
    // `users`, and `dispute_requests` references `transactions`, so deleting
    // users first raises `transactions_user_id_users_id_fk` and the whole hook
    // aborts — taking every later cleanup step with it.
    const txnIds = [...createdTransactionIds];
    if (txnIds.length > 0) {
      await db
        .delete(disputeRequests)
        .where(inArray(disputeRequests.transactionId, txnIds));
      await db.delete(transactions).where(inArray(transactions.id, txnIds));
    }
    await db.delete(disputeRequests).where(like(disputeRequests.reason, `${RUN_TAG}%`));
    await db.delete(failedRequests).where(like(failedRequests.task, `${RUN_TAG}%`));

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

    // Entitlements survive closure by design and lose their user_id to it, so
    // they are removed by hash. Runs unconditionally, including after a failed
    // assertion — cleanup that only runs on the happy path is not cleanup, and
    // this suite has leaked into the shared lane database twice by assuming
    // otherwise.
    const { hashEmail } = await import("../lib/trial-eligibility.js");
    const hashes = [...createdEmails].map(hashEmail);
    if (hashes.length > 0) {
      await db.delete(trialGrants).where(inArray(trialGrants.emailHash, hashes));
    }
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
      const peek = (await res.clone().json()) as { user_id?: string; email?: string };
      if (peek.user_id) createdUserIds.add(peek.user_id);
      if (peek.email) createdEmails.add(peek.email);
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

  it("answers 400, not 500, for an over-long name", async () => {
    // Measured by review at 300 characters: HTTP 500, `internal_error`. Both
    // `email` and `name` land on one INSERT against varchar columns, and an
    // over-long value raises Postgres 22001 — which is not a unique violation,
    // so `createAccount` rethrows it and the route reports a server fault for
    // what is plainly bad input. The email half of this was closed one review
    // round earlier; fixing one field of a two-field problem is how it comes
    // back.
    const res = await register({ email: emailFor("long-name"), name: "N".repeat(300) });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error_code: string; details?: { field?: string } };
    expect(body.error_code).toBe("invalid_request");
    expect(body.details?.field).toBe("name");
  });

  it("answers 400, not 500, for an over-long email", async () => {
    const long = `${"a".repeat(260)}@lifecycle.test`;
    const res = await register({ email: long });
    expect(res.status).toBe(400);
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
    // One undifferentiated public reason: a specific one would tell anyone who
    // registers an address whether it had previously held an account.
    expect(body.trial_credits).toMatchObject({
      granted: false,
      reason: "trial_not_available",
    });

    const wallet = await walletOf(body.user_id);
    expect(wallet).not.toBeNull();
    expect(wallet!.balanceCents).toBe(0);

    // The redacted first account no longer matches the afterEach email prefix,
    // so its id is registered explicitly; the entitlement row is removed by
    // hash there, because closure has already NULLed its user_id and ip_hash.
    createdUserIds.add(firstUserId);
    createdEmails.add(email);
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
    expect(body.trial_credits).toMatchObject({ granted: false, reason: "trial_not_available" });

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
    const [freeTierSeed] = await db
      .insert(transactions)
      .values({
      status: "completed",
      isFreeTier: true,
      priceCents: 0,
      pricePaidCents: 0,
      input: { email: "someone@example.com" },
      auditTrail: { request_context: { ipHash: hashIp(ip) } },
      })
      .returning({ id: transactions.id });
    createdTransactionIds.add(freeTierSeed!.id);

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
    // One undifferentiated public reason: a specific one would tell anyone who
    // registers an address whether it had previously held an account.
    expect(body.trial_credits).toMatchObject({
      granted: false,
      reason: "trial_not_available",
    });

    // Cleanup is handled by afterEach, keyed on the recorded id.
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
    createdEmails.add(email);
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
    //
    // The block's INSERT … SELECT is deliberately UNSCOPED — it has to be, it
    // seeds every pre-existing account — so re-running it in a shared lane
    // database writes entitlement rows for other suites' users too, and those
    // rows would then silently withhold trial credits from any later suite
    // registering those addresses. This suite has already been bitten once by
    // exactly that class of leak (the closure_forfeit rows that broke
    // wallet-service.integration).
    //
    // So the rows that existed before are recorded, and everything the re-run
    // added beyond this test's own account is removed afterwards.
    const before = new Set(
      (await db.select({ id: trialGrants.id }).from(trialGrants)).map((r) => r.id),
    );

    await db.execute(
      sql`DELETE FROM startup_migration_ledger WHERE block = '0102_account_lifecycle_tables'`,
    );
    try {
      await runMigration0102_accountLifecycleTables(db as never);
    } finally {
      const after = await db
        .select({ id: trialGrants.id, emailHash: trialGrants.emailHash })
        .from(trialGrants);
      const collateral = after
        .filter((r) => !before.has(r.id) && r.emailHash !== hashEmail(email))
        .map((r) => r.id);
      if (collateral.length > 0) {
        await db.delete(trialGrants).where(inArray(trialGrants.id, collateral));
      }
    }

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
    expect(body.trial_credits).toMatchObject({ reason: "trial_not_available" });

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

    // Expired with the DATABASE clock, because that is the clock the rule
    // uses. Writing `new Date(Date.now() - 1000)` here made this test flake
    // 2 in 8 runs even after the production code was fixed: measured skew
    // between this process and the database container swung by more than a
    // second, so a timestamp "one second ago" by the app clock is still in the
    // future to `now()`. A test that asserts an expiry has to agree with the
    // implementation about which clock decides it — the same mistake as the
    // one it is testing, one layer out.
    await db.execute(
      sql`UPDATE api_key_recovery_tokens
             SET expires_at = now() - interval '1 second'
           WHERE user_id = ${user_id}::uuid`,
    );

    const result = await redeemRecoveryToken(db, { token, email });
    expect(result.ok).toBe(false);

    const stillWorks = await app.request("http://localhost/v1/wallet/balance", {
      headers: { Authorization: `Bearer ${api_key}` },
    });
    expect(stillWorks.status).toBe(200);
  });

  it("a second request does not kill the first code — that would be a denial of service", async () => {
    // The first version expired every outstanding token on each new request,
    // and this test asserted that. Requesting a code is unauthenticated and
    // needs only the address, so an attacker could loop the endpoint and kill
    // the victim's code before they could paste it, indefinitely — and
    // /v1/auth/api-key needs the key they have already lost. Codes now stand
    // until they expire or are used.
    const email = emailFor("supersede");
    const created = await register({ email });
    const { user_id } = (await created.json()) as { user_id: string };

    const { issueRecoveryToken, redeemRecoveryToken } = await import(
      "../lib/key-recovery.js"
    );
    const first = await issueRecoveryToken(db, { userId: user_id, ipHash: null });
    await issueRecoveryToken(db, { userId: user_id, ipHash: null });

    expect((await redeemRecoveryToken(db, { token: first.token, email })).ok).toBe(true);
  });

  it("a flood of requests cannot displace a code the holder is already using", async () => {
    // The property that actually matters, and the one the previous version of
    // this test got backwards. Requesting a code is unauthenticated and needs
    // only the address, so an attacker can loop it. The first implementation
    // expired every outstanding code on each request; the second kept only the
    // newest five, which evicts the OLDEST — so five requests still killed the
    // code the victim was holding, while its docstring claimed the opposite.
    //
    // There is no eviction policy an attacker who controls the request rate
    // cannot turn against the account, so there is no per-user cap at all now.
    // Table growth is bounded by the 30-minute TTL, the rate limiter and the
    // 7-day retention rule instead.
    const email = emailFor("no-displacement");
    const created = await register({ email });
    const { user_id } = (await created.json()) as { user_id: string };

    const { issueRecoveryToken, redeemRecoveryToken } = await import(
      "../lib/key-recovery.js"
    );
    const victim = await issueRecoveryToken(db, { userId: user_id, ipHash: null });
    for (let i = 0; i < 10; i++) {
      await issueRecoveryToken(db, { userId: user_id, ipHash: null });
    }

    expect((await redeemRecoveryToken(db, { token: victim.token, email })).ok).toBe(true);
  });

  it("a wrong email does not burn the code", async () => {
    // The claim used to be an unconditional UPDATE that committed before the
    // ownership check, so a holder who typed a different address than the one
    // the code was issued to spent it and had to start over — behind a
    // 2-per-5-minutes limiter.
    const email = emailFor("wrong-email");
    const created = await register({ email });
    const { user_id } = (await created.json()) as { user_id: string };

    const { issueRecoveryToken, redeemRecoveryToken } = await import(
      "../lib/key-recovery.js"
    );
    const { token } = await issueRecoveryToken(db, { userId: user_id, ipHash: null });

    expect(
      (await redeemRecoveryToken(db, { token, email: emailFor("someone-else") })).ok,
    ).toBe(false);
    // Still spendable by its rightful holder.
    expect((await redeemRecoveryToken(db, { token, email })).ok).toBe(true);
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

    // Cleanup is afterEach's, which knows the foreign-key order and runs even
    // when an assertion above fails.
  });

  // ── Closure stays ledger-consistent (WP2's invariant, re-proved here) ─────

  it("closure actually clears every identifier its receipt says it clears", async () => {
    // Round 3: the four assertions that used to stand here string-matched the
    // response body, which is built from literals in the handler. Deleting the
    // UPDATE that nulls `client_meta`, or either of the two clearing helpers,
    // left all of them green. They proved the CLAIM, not the BEHAVIOUR — which
    // is the mechanism by which the same defect survived three review rounds.
    //
    // This one reads the database.
    const email = emailFor("closure-clears");
    const created = await register({ email });
    const { api_key, user_id } = (await created.json()) as {
      api_key: string;
      user_id: string;
    };

    // Seed one row in each table the plan says it touches, so a clearing step
    // that silently matched nothing would show up as a row still linked.
    const { hashIp } = await import("../lib/middleware.js");
    const { issueRecoveryToken } = await import("../lib/key-recovery.js");
    await issueRecoveryToken(db, { userId: user_id, ipHash: hashIp("203.0.113.9") });

    const [txn] = await db
      .insert(transactions)
      .values({
        userId: user_id,
        status: "completed",
        priceCents: 0,
        pricePaidCents: 0,
        isFreeTier: true,
        input: { email: "someone@example.com" },
        clientMeta: { src: "test", ip_day_hash: "deadbeef", client_header: "x" },
        auditTrail: { request_context: { ipHash: hashIp("203.0.113.9") } },
      })
      .returning({ id: transactions.id });
    createdTransactionIds.add(txn!.id);

    const [failedRow] = await db
      .insert(failedRequests)
      .values({
        userId: user_id,
        ipHash: hashIp("203.0.113.9"),
        task: `${RUN_TAG} something no capability serves`,
        userAgent: "wp11-test/1.0",
      })
      .returning({ id: failedRequests.id });
    const failedId = failedRow!.id;

    const [disputeRow] = await db
      .insert(disputeRequests)
      .values({
        transactionId: txn!.id,
        userId: user_id,
        reason: `${RUN_TAG} dispute`,
        contactEmail: email,
      })
      .returning({ id: disputeRequests.id });
    const disputeId = disputeRow!.id;

    const closed = await app.request("http://localhost/v1/auth/me", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "wp11 test" }),
    });
    expect(closed.status).toBe(200);

    const { countRemainingLinkage, countUnclearedColumns, clearedColumnsByTable } =
      await import("../lib/account-closure.js");

    // Nothing still points at the account, in any table the plan says it
    // clears. Derived from CLOSURE_PLAN, so a rule added there is checked
    // without anyone remembering to extend this list.
    const remaining = await countRemainingLinkage(db, user_id);
    expect(Object.keys(remaining).length).toBeGreaterThanOrEqual(4);
    for (const [table, count] of Object.entries(remaining)) {
      expect(count, `${table} still links to the closed account`).toBe(0);
    }

    // And every column the plan claims to clear alongside the linkage is
    // actually null on the rows we seeded. Round 4: the previous version
    // checked 5 of the 11 declared columns, so narrowing applyClosurePlan to
    // `set({ userId: null })` would have left three IP hashes and a plaintext
    // contact address in place with this test still green.
    for (const [table, ids] of [
      ["failed_requests", [failedId!]],
      ["dispute_requests", [disputeId!]],
      ["transactions", [txn!.id]],
    ] as const) {
      const uncleared = await countUnclearedColumns(db, table, [...ids]);
      expect(
        Object.keys(uncleared).length,
        `${table} has no cleared columns declared`,
      ).toBeGreaterThan(0);
      for (const [column, count] of Object.entries(uncleared)) {
        expect(count, `${column} survived closure`).toBe(0);
      }
    }
    expect(clearedColumnsByTable().get("failed_requests")).toEqual(
      expect.arrayContaining(["user_id", "ip_hash", "user_agent"]),
    );

    // And the entitlement itself survives — clearing the linkage must not
    // clear the rule, or closing an account hands back the trial grant.
    const { hashEmail } = await import("../lib/trial-eligibility.js");
    const surviving = await db
      .select({ id: trialGrants.id })
      .from(trialGrants)
      .where(eq(trialGrants.emailHash, hashEmail(email)));
    expect(surviving).toHaveLength(1);

    // The receipt has to agree with what just happened, rather than being
    // checked instead of it.
    const receipt = (await closed.json()) as {
      summary: {
        anonymized: string[];
        deleted: string[];
        retained: string[];
        retained_audit_trail_keys: string[];
      };
    };
    expect(receipt.summary.anonymized.join(" ")).toContain("client_meta");
    expect(receipt.summary.anonymized.join(" ")).toContain("failed_requests");
    expect(receipt.summary.anonymized.join(" ")).toContain("dispute_requests");
    expect(receipt.summary.deleted.join(" ")).toContain("api_key_recovery_tokens");
    expect(receipt.summary.retained.join(" ")).toContain("fingerprintHash");

    // Read from the account's own rows rather than from a list. Four review
    // rounds each found another writer putting another shape into audit_trail;
    // this reports what is actually there, so it cannot drift.
    expect(receipt.summary.retained_audit_trail_keys).toEqual(
      expect.arrayContaining(["request_context", "request_context.ipHash"]),
    );

    // No inline cleanup. `afterEach` owns it, and owns the ORDER — this test
    // seeds a transaction row, and deleting the user before that row exists no
    // longer raises `transactions_user_id_users_id_fk` only because the hook
    // does foreign keys innermost-first. Duplicating a subset of that here
    // reintroduces the ordering bug and, being inline, skips entirely when an
    // assertion above fails.
  });

  it("closure forfeits the balance through the ledger, not by zeroing it", async () => {
    const email = emailFor("closure-ledger");
    const created = await register({ email });
    const { api_key, user_id } = (await created.json()) as {
      api_key: string;
      user_id: string;
    };
    const wallet = await walletOf(user_id);

    const closureResponse = await app.request("http://localhost/v1/auth/me", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "wp11 test" }),
    });
    expect(closureResponse.status).toBe(200);

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

    // Cleanup is afterEach's.
  });
});
