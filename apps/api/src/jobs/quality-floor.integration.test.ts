/**
 * WP9 against a real Postgres — the acceptance gap fifteen review rounds could
 * not close.
 *
 * Every previous guard on this job is a source-text assertion, because no
 * DB-backed harness existed for it. Those assertions can say the SQL is what
 * was reviewed. They cannot say it PARSES, that its joins have the cardinality
 * anyone believed, or that the epoch arithmetic partitions evidence the way the
 * comments claim. Round 15 named that as the honest ceiling on the whole
 * review, its own included.
 *
 * So this suite runs the ACTUAL production code paths — `runMigration0101…` and
 * `runQualityFloorOnce()` — against the ephemeral Postgres the `integration-db`
 * lane provides. Nothing here re-implements or copies the SQL: a test that
 * pasted the query would prove only that the paste parses.
 *
 * The floor runs in DRY-RUN. That is not timidity — dry run writes the same
 * per-decision events with the same completion arithmetic and simply does not
 * flip the catalogue flags, so the decision is fully observable without the
 * suite needing permission to delist anything.
 *
 * Synthetic data only. Slugs are uuid-suffixed, the customer's email is on a
 * domain that is deliberately NOT in INTERNAL_EMAIL_SUFFIXES (so the fixture is
 * treated as external traffic), and no capability here is real, paid, or
 * reachable by an executor.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { runMigration0101_capabilityInvocations } from "../lib/startup-migrations.js";
import { runQualityFloorOnce } from "./quality-floor.js";

if (process.env.DATABASE_URL_TEST) {
  process.env.AUDIT_HMAC_SECRET ??= "wp9-integration-secret-at-least-32-chars";
  process.env.ADMIN_SECRET ??= "wp9-integration-admin-secret-32-chars0000";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

/** Not @strale.io / @strale.dev / @strale.internal / @example.com. */
const CUSTOMER_EMAIL_DOMAIN = "@wp9-fixture.test";

describeMaybe("WP9 — the quality floor against a real Postgres", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  let customerId: string;

  const run = "wp9" + randomUUID().slice(0, 8);
  const slug = (name: string) => `${run}-${name}`;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);

    const [u] = await client<{ id: string }[]>`
      INSERT INTO users (email, api_key_hash, key_prefix)
      VALUES (${run + CUSTOMER_EMAIL_DOMAIN}, ${run + "-hash"}, 'sk_wp9_')
      RETURNING id`;
    customerId = u.id;

    // The floor evaluates the WHOLE catalogue, so any capability another suite
    // left active would compete for the three-per-run quarantine budget and
    // make these assertions order-dependent. Parked, then restored in afterAll.
    await client`UPDATE capabilities SET is_active = false WHERE is_active = true`;
  });

  afterAll(async () => {
    await client`DELETE FROM health_monitor_events WHERE capability_slug LIKE ${run + "%"}`;
    await client`DELETE FROM transactions WHERE user_id = ${customerId}`;
    // TRUNCATE, not DELETE. The append-only trigger refuses a DELETE of any row
    // inside the floor's 35-day reading window -- which is the whole point of it
    // -- and a row-level BEFORE DELETE trigger does not fire on TRUNCATE. That
    // asymmetry is what makes this table both tamper-evident and testable.
    await client`TRUNCATE capability_invocations`;
    await client`DELETE FROM capabilities WHERE slug LIKE ${run + "%"}`;
    await client`DELETE FROM users WHERE id = ${customerId}`;
    await client.end();
  });

  beforeEach(async () => {
    await client`DELETE FROM health_monitor_events WHERE capability_slug LIKE ${run + "%"}`;
    await client`DELETE FROM transactions WHERE user_id = ${customerId}`;
    await client`TRUNCATE capability_invocations`;
    await client`UPDATE capabilities SET is_active = false WHERE slug LIKE ${run + "%"}`;
  });

  async function seedCapability(name: string): Promise<string> {
    const s = slug(name);
    await client`
      INSERT INTO capabilities
        (slug, name, description, category, input_schema, output_schema,
         price_cents, is_active, visible, x402_enabled, lifecycle_state, is_free_tier)
      VALUES (${s}, ${s}, 'wp9 fixture', 'validation', '{}'::jsonb, '{}'::jsonb,
              5, true, true, true, 'active', false)
      ON CONFLICT (slug) DO UPDATE SET is_active = true, visible = true,
              x402_enabled = true, lifecycle_state = 'active'`;
    return s;
  }

  async function capId(s: string): Promise<string> {
    const [r] = await client<{ id: string }[]>`SELECT id FROM capabilities WHERE slug = ${s}`;
    return r.id;
  }

  /** A billed call, `daysAgo` in the past. Pre-epoch evidence. */
  async function seedTransaction(
    s: string,
    opts: { daysAgo: number; status: "completed" | "failed"; error?: string },
  ) {
    await client`
      INSERT INTO transactions
        (user_id, capability_id, status, error, input, price_cents, is_free_tier, created_at)
      VALUES (${customerId}, ${await capId(s)}, ${opts.status}, ${opts.error ?? null},
              '{}'::jsonb, 5, false, NOW() - (${opts.daysAgo} || ' days')::interval)`;
  }

  /** An invocation fact, `daysAgo` in the past. Post-epoch evidence. */
  async function seedFact(
    s: string,
    opts: {
      daysAgo: number;
      success: boolean;
      counts: boolean;
      rail?: string;
      hoursOffset?: number;
    },
  ) {
    await client`
      INSERT INTO capability_invocations
        (capability_slug, rail, context_kind, user_id, is_free_tier,
         success, counts_against_capability, billable, latency_ms, created_at)
      VALUES (${s}, ${opts.rail ?? "v1_do"}, 'customer_paid', ${customerId}, false,
              ${opts.success}, ${opts.counts}, false, 5,
              NOW() - (${opts.daysAgo} || ' days')::interval
                    - (${opts.hoursOffset ?? 0} || ' hours')::interval)`;
  }

  /** The per-decision event the floor wrote for this slug, if any. */
  async function decisionFor(s: string) {
    const rows = await client<
      { action_taken: string; details: Record<string, unknown> }[]
    >`
      SELECT action_taken, details FROM health_monitor_events
      WHERE event_type = 'quality_floor' AND capability_slug = ${s}
      ORDER BY created_at DESC LIMIT 1`;
    return rows[0] ?? null;
  }

  // ── The migration ────────────────────────────────────────────────────────

  it("block 0101 creates the table and an immutable trigger that actually refuses", async () => {
    await client`DROP TABLE IF EXISTS capability_invocations CASCADE`;
    await client`DELETE FROM startup_migration_ledger WHERE block = '0101_capability_invocations'`;

    const result = await runMigration0101_capabilityInvocations({
      execute: (q) => db.execute(q),
    });
    expect(result.outcome, result.outcome).toContain("verified");

    const [{ present }] = await client<{ present: boolean }[]>`
      SELECT to_regclass('public.capability_invocations') IS NOT NULL AS present`;
    expect(present).toBe(true);

    const [{ n }] = await client<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM pg_trigger
      WHERE tgname = 'capability_invocations_immutable_trg'
        AND tgrelid = to_regclass('public.capability_invocations')`;
    expect(n).toBe(1);

    // The trigger's BEHAVIOUR, not its existence. Fifteen rounds asserted the
    // SQL text; nothing had ever made Postgres run it.
    const s = await seedCapability("trigger");
    await seedFact(s, { daysAgo: 1, success: true, counts: false });

    await expect(
      client`UPDATE capability_invocations SET success = false WHERE capability_slug = ${s}`,
    ).rejects.toThrow(/append-only/);

    await expect(
      client`DELETE FROM capability_invocations WHERE capability_slug = ${s}`,
    ).rejects.toThrow(/reading window/);
  });

  it("main's 0100 ledger row does not suppress 0101", async () => {
    // These share a ledger table whose `block` column is a PRIMARY KEY, and it
    // is what tells a one-shot block it has already fired. Production carries
    // 0100_relistUrlToMarkdown today, so a shared id would have made 0101's
    // purge gate read firstInstall=false on its very first boot. The branch
    // number was changed from 0100 to 0101 for exactly this reason; this proves
    // the two are independent in a real database rather than by inspection.
    await client`DROP TABLE IF EXISTS capability_invocations CASCADE`;
    await client`DELETE FROM startup_migration_ledger WHERE block LIKE '010%'`;
    await client`
      INSERT INTO startup_migration_ledger (block, rows_affected)
      VALUES ('0100_relistUrlToMarkdown', 1)`;

    const result = await runMigration0101_capabilityInvocations({
      execute: (q) => db.execute(q),
    });
    expect(result.outcome).toContain("verified");

    const rows = await client<{ block: string }[]>`
      SELECT block FROM startup_migration_ledger WHERE block LIKE '010%' ORDER BY block`;
    expect(rows.map((r) => r.block)).toEqual([
      "0100_relistUrlToMarkdown",
      "0101_capability_invocations",
    ]);
  });

  // ── The floor ────────────────────────────────────────────────────────────

  it("executes and reaches a verdict — the SQL parses and runs", async () => {
    const s = await seedCapability("runs");
    for (let i = 0; i < 12; i++) {
      await seedFact(s, { daysAgo: 2 + (i % 3), success: false, counts: true });
    }
    const outcome = await runQualityFloorOnce();
    expect(outcome.outcome, JSON.stringify(outcome)).toBe("ok");
    expect(outcome.mode).toBe("dry_run");
    const d = await decisionFor(s);
    expect(d, "the floor reached no verdict at all").not.toBeNull();
  });

  it("counts pre-epoch transactions and post-epoch facts exactly once each", async () => {
    const s = await seedCapability("bridge");
    // Both sides are COUNTED FAILURES on purpose. The floor only writes a
    // per-decision event for a capability below the threshold, so a healthy
    // fixture would produce nothing to read -- the first version of this test
    // asserted against an event that by design never existed.
    //
    // The epoch is MIN(created_at) over the facts table. Facts at 5 days,
    // transactions at 20, so the transactions are unambiguously pre-epoch.
    for (let i = 0; i < 6; i++) {
      await seedTransaction(s, {
        daysAgo: 20 + (i % 2), status: "failed", error: "upstream unavailable",
      });
    }
    for (let i = 0; i < 6; i++) {
      await seedFact(s, { daysAgo: 5 + (i % 2), success: false, counts: true, hoursOffset: i });
    }

    await runQualityFloorOnce();
    const d = await decisionFor(s);
    expect(d, "the floor saw neither source").not.toBeNull();
    // 12, not 6 (a branch lost -- the blind window) and not 18 (double-counted).
    expect(d!.details.eligible_calls_30d).toBe(12);
  });

  it("does not count a transaction that postdates the epoch twice", async () => {
    // The transaction branch is bounded ABOVE by the epoch and the fact branch
    // below it, so a transaction newer than the oldest fact must not be counted
    // at all -- it is the fact's job to represent that call.
    const s = await seedCapability("noverlap");
    for (let i = 0; i < 11; i++) {
      await seedFact(s, { daysAgo: 10 + (i % 2), success: false, counts: true, hoursOffset: i });
    }
    // Post-epoch. Counted once, via the fact, never twice.
    await seedTransaction(s, { daysAgo: 5, status: "failed", error: "upstream unavailable" });

    await runQualityFloorOnce();
    const d = await decisionFor(s);
    expect(d).not.toBeNull();
    expect(d!.details.eligible_calls_30d).toBe(11);
  });

  it("a counted post-epoch failure reduces the measured completion rate", async () => {
    const s = await seedCapability("counted");
    for (let i = 0; i < 5; i++) {
      await seedFact(s, { daysAgo: 6, success: true, counts: false, hoursOffset: i });
    }
    // Spread over two calendar days so the burst guard does not defer it.
    for (let i = 0; i < 10; i++) {
      await seedFact(s, { daysAgo: 3 + (i % 2), success: false, counts: true, hoursOffset: i });
    }

    await runQualityFloorOnce();
    const d = await decisionFor(s);
    expect(d!.details.eligible_calls_30d).toBe(15);
    expect(d!.details.completion).toBeCloseTo(5 / 15, 3);
    expect(d!.action_taken).toBe("dry_run_would_quarantine");
  });

  it("a caller-attributable or refused fact does not reduce it", async () => {
    // A refusal is not a fault. The armed floor has delisted capabilities for
    // refusing bad input before; the fact carries counts_against_capability so
    // that verdict is made once, by WP4, and never re-derived from a string.
    const s = await seedCapability("refusal");
    for (let i = 0; i < 7; i++) {
      await seedFact(s, { daysAgo: 6, success: true, counts: false, hoursOffset: i });
    }
    for (let i = 0; i < 5; i++) {
      await seedFact(s, { daysAgo: 3 + (i % 2), success: false, counts: true, hoursOffset: i });
    }
    // Forty refusals. If these counted, eligible would be 52 and completion
    // 7/52 -- a capability delisted for correctly refusing bad input.
    for (let i = 0; i < 40; i++) {
      await seedFact(s, { daysAgo: 4, success: false, counts: false, hoursOffset: i });
    }

    await runQualityFloorOnce();
    const d = await decisionFor(s);
    expect(d).not.toBeNull();
    expect(d!.details.eligible_calls_30d).toBe(12);
    expect(d!.details.completion).toBeCloseTo(7 / 12, 3);
  });

  it("sees a solution step even with no capability transaction at all", async () => {
    // The defect WP9 exists for. A bundle writes ONE transaction with
    // capability_id NULL, so before this table a capability invoked only as a
    // step had no row carrying its id and could not be quarantined however
    // badly it failed.
    const s = await seedCapability("bundleonly");
    const [{ n: direct }] = await client<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM transactions WHERE capability_id = ${await capId(s)}`;
    expect(direct, "fixture must have no direct capability traffic").toBe(0);

    for (let i = 0; i < 3; i++) {
      await seedFact(s, { daysAgo: 6, success: true, counts: false, rail: "solution_step", hoursOffset: i });
    }
    for (let i = 0; i < 9; i++) {
      await seedFact(s, {
        daysAgo: 3 + (i % 2), success: false, counts: true, rail: "solution_step", hoursOffset: i,
      });
    }

    await runQualityFloorOnce();
    const d = await decisionFor(s);
    expect(d, "a bundle-only capability was invisible to the floor").not.toBeNull();
    expect(d!.details.eligible_calls_30d).toBe(12);
    expect(d!.action_taken).toBe("dry_run_would_quarantine");
    expect(d!.details.deactivate_proposal).toBe(true);
  });

  it("suppresses rather than quarantines when the evidence is known to be holed", async () => {
    // A completion rate computed from an unknown fraction of the calls is not a
    // basis for withdrawing something from sale -- and the losses correlate with
    // the outages that produce the failures in the first place.
    const s = await seedCapability("holed");
    for (let i = 0; i < 12; i++) {
      await seedFact(s, { daysAgo: 3 + (i % 2), success: false, counts: true, hoursOffset: i });
    }
    await client`
      INSERT INTO health_monitor_events (event_type, capability_slug, tier, action_taken, details)
      VALUES ('invocation_fact_write_failed', ${s}, 2, 'fact_dropped', '{}'::jsonb)`;

    await runQualityFloorOnce();
    const d = await decisionFor(s);
    expect(d!.action_taken).toBe("suppressed_incomplete_evidence");
    expect(d!.details.evidence_holes).toBe(1);
    // The proposal still surfaces: suppressing the automatic action must not
    // also hide that something is badly wrong.
    expect(d!.details.deactivate_proposal).toBe(true);
  });
});
