/**
 * The x402 settlement-volume watch against a real Postgres.
 *
 * Incident 2026-10-28: the watch paged CRITICAL ("78 in 24h vs ~158/day") when
 * one buyer that made almost all of the volume paused; the rail was fine. The
 * job now groups by `x402_payer_hash` in SQL, and a GROUP BY plus FILTER over
 * the real table is exactly what a mocked rendering cannot prove (LESSONS F5
 * incident 10). Each scenario seeds rows inside a transaction that is rolled
 * back, so nothing leaks into other suites and leftovers from them are cleared
 * inside the same transaction first.
 *
 * sendAlert is replaced so the test can read the body it would have sent; the
 * cooldown ledger (alertOnce → health_monitor_events) still runs on the server.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { useTestDatabase } from "../test-support/integration-db.js";
import type { Database } from "../db/index.js";

const sent: Array<{ subject: string; body: string; severity: string }> = [];
vi.mock("../lib/alerting.js", () => ({
  sendAlert: vi.fn(async (opts: { subject: string; body: string; severity: string }) => {
    sent.push(opts);
    return true;
  }),
}));

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

let getDb: typeof import("../db/index.js")["getDb"];
let closeDbPool: typeof import("../db/index.js")["closeDbPool"];
let checkX402SettlementVolume: typeof import("./x402-settlement-watch.js")["checkX402SettlementVolume"];

class Rollback extends Error {}

type Seed = { payer: string | null; prior7d: number; last24h: number };

/** Insert settled x402 rows: prior7d spread over days 2–7 back, last24h in the last few hours. */
async function seed(tx: Database, seeds: Seed[]): Promise<void> {
  for (const [i, s] of seeds.entries()) {
    if (s.prior7d > 0) {
      await tx.execute(sql`
        INSERT INTO transactions (status, input, price_cents, payment_method, x402_settlement_id, x402_payer_hash, created_at)
        SELECT 'completed', '{}'::jsonb, 1, 'x402', ${`watch-test-${i}-prior-`} || g, ${s.payer},
               now() - interval '2 days' - (g % 5) * interval '1 day' - (g % 23) * interval '1 hour'
          FROM generate_series(1, ${s.prior7d}) g
      `);
    }
    if (s.last24h > 0) {
      await tx.execute(sql`
        INSERT INTO transactions (status, input, price_cents, payment_method, x402_settlement_id, x402_payer_hash, created_at)
        SELECT 'completed', '{}'::jsonb, 1, 'x402', ${`watch-test-${i}-recent-`} || g, ${s.payer},
               now() - (g % 20) * interval '1 hour'
          FROM generate_series(1, ${s.last24h}) g
      `);
    }
  }
}

/** Run the watch on seeded data inside a transaction that is always rolled back. */
async function runScenario(seeds: Seed[]) {
  let result: { verdict: Awaited<ReturnType<typeof checkX402SettlementVolume>>; ledger: Array<{ key: string; severity: string }> } | undefined;
  await getDb()
    .transaction(async (tx) => {
      const db = tx as unknown as Database;
      // dispute_requests references transactions without a cascade; clear it first (rolled back with the rest).
      await db.execute(sql`DELETE FROM dispute_requests WHERE transaction_id IN (SELECT id FROM transactions WHERE x402_settlement_id IS NOT NULL)`);
      await db.execute(sql`DELETE FROM transactions WHERE x402_settlement_id IS NOT NULL`);
      await db.execute(sql`DELETE FROM health_monitor_events WHERE event_type = 'alert_sent' AND details->>'alert_key' LIKE 'x402-settlement-volume-drop%'`);
      await seed(db, seeds);
      const verdict = await checkX402SettlementVolume({ db });
      const ledger = (await db.execute(sql`
        SELECT details->>'alert_key' AS key, details->>'severity' AS severity
          FROM health_monitor_events
         WHERE event_type = 'alert_sent' AND details->>'alert_key' LIKE 'x402-settlement-volume-drop%'
      `)) as unknown as Array<{ key: string; severity: string }>;
      result = { verdict, ledger: [...ledger] };
      throw new Rollback();
    })
    .catch((err) => {
      if (!(err instanceof Rollback)) throw err;
    });
  return result!;
}

// The 2026-10-28 shape: ~158/day baseline, one wallet making ~140 of it.
const BIG = "a1b2c3d4e5f60718";
const SMALL_1 = "0011223344556677";
const SMALL_2 = "8899aabbccddeeff";

describeMaybe("x402 settlement watch against disposable Postgres", () => {
  beforeAll(async () => {
    ({ getDb, closeDbPool } = await import("../db/index.js"));
    ({ checkX402SettlementVolume } = await import("./x402-settlement-watch.js"));
  });

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    await closeDbPool();
  });

  it("one buyer pausing is a warning that names the buyer share, not a critical page", async () => {
    const { verdict, ledger } = await runScenario([
      { payer: BIG, prior7d: 7 * 140, last24h: 10 },
      { payer: SMALL_1, prior7d: 7 * 9, last24h: 9 },
      { payer: SMALL_2, prior7d: 7 * 9, last24h: 9 },
    ]);
    expect(verdict.kind).toBe("concentrated");
    expect(ledger).toEqual([{ key: "x402-settlement-volume-drop-concentrated", severity: "warning" }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.severity).toBe("warning");
    expect(sent[0]!.subject).toMatch(/explained by the top buyer \(89% of baseline\)/);
    expect(sent[0]!.body).toContain("Distinct paying wallets: 3 in the last 24h, 3 in the 7 days before.");
    expect(sent[0]!.body).toContain(`#1 payer ${BIG.slice(0, 8)} (keyed hash): 89% of baseline`);
    // The pseudonymous hash is truncated; the full value never leaves the DB.
    expect(sent[0]!.body).not.toContain(BIG);
  }, 60_000);

  it("a broad drop across buyers stays critical and carries the payer breakdown", async () => {
    const { verdict, ledger } = await runScenario([
      { payer: BIG, prior7d: 7 * 140, last24h: 10 },
      { payer: SMALL_1, prior7d: 7 * 9, last24h: 1 },
      { payer: SMALL_2, prior7d: 7 * 9, last24h: 0 },
    ]);
    expect(verdict.kind).toBe("broad");
    expect(ledger).toEqual([{ key: "x402-settlement-volume-drop", severity: "critical" }]);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.severity).toBe("critical");
    expect(sent[0]!.body).toContain("Distinct paying wallets: 2 in the last 24h, 3 in the 7 days before.");
    expect(sent[0]!.body).toContain(`#1 payer ${BIG.slice(0, 8)} (keyed hash): 89% of baseline`);
  }, 60_000);

  it("nobody else settling at all stays critical even when the top buyer explains the volume", async () => {
    // Only one payer exists and it stopped: nothing shows the rail still works.
    const { verdict, ledger } = await runScenario([{ payer: BIG, prior7d: 7 * 150, last24h: 0 }]);
    expect(verdict.kind).toBe("broad");
    expect(ledger).toEqual([{ key: "x402-settlement-volume-drop", severity: "critical" }]);
    expect(sent[0]!.body).toContain("Distinct paying wallets: 0 in the last 24h, 1 in the 7 days before.");
  }, 60_000);

  it("under the minimum baseline nothing is sent", async () => {
    const { verdict, ledger } = await runScenario([
      { payer: SMALL_1, prior7d: 7 * 5, last24h: 0 },
      { payer: null, prior7d: 7 * 3, last24h: 0 },
    ]);
    expect(verdict.kind).toBe("no_baseline");
    expect(ledger).toEqual([]);
    expect(sent).toEqual([]);
  }, 60_000);
});
