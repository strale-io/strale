import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { useTestDatabase } from "../test-support/integration-db.js";
const DATABASE_URL_TEST = useTestDatabase();
const suite = DATABASE_URL_TEST ? describe : describe.skip;
const send = vi.fn(async (..._args: unknown[]) => {});
vi.mock("./digest-sender.js", async (original) => ({ ...await original<typeof import("./digest-sender.js")>(), isEmailConfigured: () => true, sendPrivateDigestEmail: (...args: unknown[]) => send(...args) }));
const { getDb, closeDbPool, withDatabase } = await import("../db/index.js");
const { collectBusinessSummary, sendBusinessSummary } = await import("./business-summary.js");
const { runMigration0152_businessSummaryDeliveries } = await import("../startup-migrations/blocks/0152-business-summary-deliveries.js");
class Rollback extends Error {}

suite("business summary on disposable Postgres", () => {
  beforeAll(async () => { await runMigration0152_businessSummaryDeliveries(getDb()); });
  afterAll(async () => { vi.unstubAllEnvs(); await closeDbPool(); });
  it("counts real rails and boundaries, excludes internal calls, and commits one immutable delivery snapshot", async () => {
    vi.stubEnv("HEALTH_DIGEST_EMAIL", "owner@example.test");
    await expect(getDb().transaction(async (tx) => {
      await withDatabase(tx, async () => {
        await tx.execute(sql`DELETE FROM dispute_requests WHERE transaction_id IN (SELECT id FROM transactions WHERE created_at >= '2026-11-09T00:00:00Z' AND created_at < '2026-11-10T00:00:00Z')`);
        await tx.execute(sql`DELETE FROM transactions WHERE created_at >= '2026-11-09T00:00:00Z' AND created_at < '2026-11-10T00:00:00Z'`);
        await tx.execute(sql`DELETE FROM business_summary_deliveries`);
        const [internal] = await tx.execute(sql`INSERT INTO users(email,api_key_hash,key_prefix) VALUES ('summary-fixture@strale.internal','summary-hash','summary-prefix') RETURNING id`);
        await tx.execute(sql`
          INSERT INTO transactions(status,input,price_cents,x402_payer_hash,x402_settlement_id,is_free_tier,client_ip_hash,created_at) VALUES
          ('completed','{}',700,'summary-a','summary-settled',false,NULL,'2026-11-09T12:00:00Z'),
          ('completed','{}',200,'summary-b',NULL,false,NULL,'2026-11-09T13:00:00Z'),
          ('completed','{}',100,NULL,NULL,false,NULL,'2026-11-09T14:00:00Z'),
          ('failed','{}',300,'summary-c',NULL,false,NULL,'2026-11-09T15:00:00Z'),
          ('completed','{}',0,NULL,NULL,true,'summary-ip','2026-11-09T16:00:00Z'),
          ('completed','{}',0,NULL,NULL,true,'summary-ip','2026-11-09T17:00:00Z'),
          ('completed','{}',9000,'summary-next',NULL,false,NULL,'2026-11-10T00:00:00Z')`);
        await tx.execute(sql`INSERT INTO transactions(status,input,price_cents,user_id,created_at) VALUES ('completed','{}',99999,${internal.id},'2026-11-09T18:00:00Z')`);
        const summary = await collectBusinessSummary('2026-11-10');
        expect(summary.daily).toMatchObject({revenue_cents:1000,payers:2,top_share:0.7,other_identified_payers_cents:200,unattributed_cents:100});
        expect(summary.daily_activity).toEqual({settled_x402_calls:1,settled_x402_revenue_cents:700,completed_paid_calls:3,failed_priced_attempts:1,anonymous_free_calls:2,anonymous_free_ip_hashes:1});
        expect(JSON.stringify(summary)).not.toContain('summary-a');
        expect(await sendBusinessSummary(new Date('2026-11-10T08:00:00Z'))).toEqual({outcome:'completed'});
        expect(await sendBusinessSummary(new Date('2026-11-10T09:00:00Z'))).toEqual({outcome:'already_sent'});
        expect(send).toHaveBeenCalledTimes(1);
        const [row] = await tx.execute(sql`SELECT count(*)::int AS n, count(sent_at)::int AS accepted FROM business_summary_deliveries`);
        expect(row).toEqual({n:1,accepted:1});
      });
      throw new Rollback();
    })).rejects.toBeInstanceOf(Rollback);
  });
  it("rolls back acceptance if heartbeat persistence fails, then retries the same envelope without refreshing an already-sent heartbeat", async () => {
    send.mockClear(); vi.stubEnv("HEALTH_DIGEST_EMAIL", "owner@example.test");
    await expect(getDb().transaction(async (tx) => {
      await withDatabase(tx, async () => {
        await tx.execute(sql`DELETE FROM business_summary_deliveries`);
        await tx.execute(sql`DELETE FROM job_schedule WHERE job_name = 'heartbeat:business-summary'`);
        await tx.execute(sql`CREATE FUNCTION pg_temp.reject_summary_heartbeat() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.job_name = 'heartbeat:business-summary' THEN RAISE EXCEPTION 'synthetic heartbeat failure'; END IF; RETURN NEW; END $$`);
        await tx.execute(sql`CREATE TRIGGER summary_heartbeat_failure BEFORE INSERT ON job_schedule FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_summary_heartbeat()`);
        await expect(sendBusinessSummary(new Date('2026-11-10T08:00:00Z'))).rejects.toThrow();
        const [pending] = await tx.execute(sql`SELECT sent_at FROM business_summary_deliveries WHERE report_day = '2026-11-10'`);
        expect(pending.sent_at).toBeNull();
        await tx.execute(sql`DROP TRIGGER summary_heartbeat_failure ON job_schedule`);
        vi.stubEnv("HEALTH_DIGEST_EMAIL", "changed@example.test");
        await sendBusinessSummary(new Date('2026-11-10T09:00:00Z'));
        expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
        const [accepted] = await tx.execute(sql`SELECT s.sent_at = j.last_finished_at AS aligned, j.last_finished_at FROM business_summary_deliveries s CROSS JOIN job_schedule j WHERE j.job_name = 'heartbeat:business-summary'`);
        expect(accepted.aligned).toBe(true);
        expect(await sendBusinessSummary(new Date('2026-11-10T10:00:00Z'))).toEqual({outcome:'already_sent'});
        const [later] = await tx.execute(sql`SELECT last_finished_at FROM job_schedule WHERE job_name = 'heartbeat:business-summary'`);
        expect(later.last_finished_at).toEqual(accepted.last_finished_at);
        expect(send).toHaveBeenCalledTimes(2);
      });
      throw new Rollback();
    })).rejects.toBeInstanceOf(Rollback);
  });
});
