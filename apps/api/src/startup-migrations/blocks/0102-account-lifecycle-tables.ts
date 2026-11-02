import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0102: account lifecycle authority tables (WP11, CR-09/CR-10) ────
//
// Two tables, both new and both starting empty except for one bounded
// backfill.
//
// `trial_grants` is the durable record of "this identity has already been
// given trial credit". Before WP11 that fact was inferred per request from
// whichever gate the handler happened to run — `/v1/auth/register` ran none —
// so eight accounts behind one signup IP each took EUR 2.00 between
// 2026-05-25 and 2026-05-27. The UNIQUE index on `email_hash` is what makes
// "one trial per address" true under concurrency; the code path can only
// produce a good error message.
//
// It is a separate table rather than a column on `users` because the erasure
// endpoint anonymises the users row. An entitlement stored there is destroyed
// by exactly the delete → re-register loop it exists to close. A one-way hash
// survives Art. 17 anonymisation precisely because it is not the address.
//
// `api_key_recovery_tokens` backs proof-before-rotation. `/v1/auth/recover`
// used to rotate the account's key on an unauthenticated request whose only
// input was an email address.
//
// **Backfill.** 59 production wallets already hold a `trial_credit` ledger
// entry. Without seeding them, every existing customer could close their
// account and re-register for another grant on the day this ships — the
// migration would install the rule and grandfather in every account that
// predates it. The email hash is computed in SQL with
// `encode(sha256(convert_to(lower(btrim(email)), 'UTF8')), 'hex')`, a Postgres
// built-in needing no extension, and verified byte-for-byte against
// `hashEmail()` on five production rows.
//
// Bounded workload, so DEC-20260504-B's drain question is answered rather
// than skipped: one INSERT … SELECT over 60 users joined to 61 ledger rows,
// grouped to at most one row per wallet. This is not a resumed bulk operation.
//
// Already-redacted accounts are skipped: their address is gone, so no hash can
// be computed and their trial slot is unrecoverable. Production holds zero
// such rows today (`deleted_at IS NOT NULL` census = 0), so the exclusion
// costs nothing now and is stated so a later reader does not mistake it for an
// oversight.
//
// `ip_hash` is seeded from `users.signup_ip_hash`, which hashes the EXACT
// address. The live path hashes a bucket instead (IPv6 counted by /64, see
// `trialRateBucket`), so for an IPv6 signup the backfilled hash will not match
// the bucket a new signup from the same prefix produces. The two agree for
// IPv4 by construction, and the consequence for IPv6 is only that a historical
// grant does not count toward a new bucket's cap. Every backfilled row is
// already outside the 7-day window, so nothing counts today either way.
//
// Idempotent three ways: `IF NOT EXISTS` DDL, `ON CONFLICT (email_hash) DO
// NOTHING` on the backfill, and the block ledger gating the backfill to its
// first successful run.
export async function runMigration0102_accountLifecycleTables(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();
  const BLOCK = "0102_account_lifecycle_tables";

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS "trial_grants" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "email_hash" varchar(64) NOT NULL,
      "ip_hash" varchar(16),
      "user_id" uuid,
      "granted_cents" integer NOT NULL,
      "channel" varchar(32) NOT NULL,
      "granted_at" timestamptz NOT NULL DEFAULT now()
    )
  `);
  // The uniqueness IS the rule. Created as its own statement rather than
  // inline on the column so a table that somehow predates this block still
  // acquires the constraint.
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "trial_grants_email_hash_unique"
      ON "trial_grants" ("email_hash")
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "trial_grants_ip_granted_idx"
      ON "trial_grants" ("ip_hash", "granted_at")
  `);

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS "api_key_recovery_tokens" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users"("id"),
      "token_hash" varchar(64) NOT NULL,
      "expires_at" timestamptz NOT NULL,
      "used_at" timestamptz,
      "requested_ip_hash" varchar(16),
      "created_at" timestamptz NOT NULL DEFAULT now()
    )
  `);
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "api_key_recovery_tokens_token_hash_unique"
      ON "api_key_recovery_tokens" ("token_hash")
  `);
  await tx.execute(sql`
    CREATE INDEX IF NOT EXISTS "api_key_recovery_tokens_user_created_idx"
      ON "api_key_recovery_tokens" ("user_id", "created_at")
  `);

  // ── The Stripe replay guard, adopted into the migration path ─────────────
  //
  // `wallet_transactions_stripe_session_id_unique` exists in production and in
  // schema.ts, and is created by NO migration block — it survives only from the
  // original `drizzle-kit push`, which does not run against production. So a
  // database rebuilt from `startup-migrations.ts` alone would come up without
  // the one constraint standing between a duplicated Stripe delivery and a
  // double credit, and nothing would say so.
  //
  // WP11 owns the Stripe crediting decision, so it adopts the guard that
  // decision depends on. Idempotent, and a no-op wherever the index already
  // exists (verified against a database materialised by drizzle-kit push,
  // where the identically-named index is already present).
  await tx.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "wallet_transactions_stripe_session_id_unique"
      ON "wallet_transactions" ("stripe_session_id")
      WHERE "stripe_session_id" IS NOT NULL
  `);

  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS startup_migration_ledger (
      block text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now(),
      rows_affected integer NOT NULL DEFAULT 0
    )`);
  const priorRun = (await tx.execute(sql`
    SELECT block FROM startup_migration_ledger WHERE block = ${BLOCK}
  `)) as unknown as Array<{ block: string }>;
  const alreadyBackfilled = (Array.isArray(priorRun) ? priorRun : []).length > 0;

  let backfilled = 0;
  if (!alreadyBackfilled) {
    const inserted = await tx.execute(sql`
      INSERT INTO "trial_grants" (email_hash, ip_hash, user_id, granted_cents, channel, granted_at)
      SELECT encode(sha256(convert_to(lower(btrim(u.email)), 'UTF8')), 'hex'),
             u.signup_ip_hash,
             u.id,
             g.total_cents,
             'backfill',
             g.first_at
        FROM users u
        JOIN wallets w ON w.user_id = u.id
        JOIN (
          SELECT wallet_id,
                 SUM(amount_cents)::int AS total_cents,
                 MIN(created_at) AS first_at
            FROM wallet_transactions
           WHERE type = 'trial_credit'
           GROUP BY wallet_id
        ) g ON g.wallet_id = w.id
       WHERE u.deleted_at IS NULL
         AND u.email NOT LIKE 'redacted-%@deleted.local'
      ON CONFLICT (email_hash) DO NOTHING
    `);
    backfilled = (inserted as { count?: number }).count ?? 0;

    await tx.execute(sql`
      INSERT INTO startup_migration_ledger (block, rows_affected)
      VALUES (${BLOCK}, ${backfilled})
      ON CONFLICT (block) DO NOTHING
    `);
  }

  return {
    block: BLOCK,
    outcome: alreadyBackfilled
      ? "tables and indexes ensured; entitlement backfill already applied"
      : `tables and indexes ensured; backfilled ${backfilled} existing trial entitlement(s)`,
    rows_affected: backfilled,
    duration_ms: Date.now() - startedAt,
  };
}
