/**
 * A capability must never sit half-quarantined (WP8 follow-up).
 *
 * Neither job that writes these flags can produce the state: the quality floor
 * withdraws with `{visible:false, x402Enabled:false}` and the promotion job
 * restores `{visible:true, x402Enabled:…}` — both write the pair together, in
 * one statement, inside a transaction.
 *
 * Production held it anyway. `danish-company-data` was quarantined on
 * 2026-08-12 with the intended DB state recorded in its manifest, and on
 * 2026-08-21T00:08 a single un-audited write set `x402_enabled` back to true
 * while leaving it invisible. No job wrote it, no commit corresponds, no
 * health-monitor event records it. It was then listed and purchasable over
 * x402 while failing 100% of real customer calls — 14 of 14 over 90 days.
 *
 * The drift also nearly cost the platform its servability authority: a proposed
 * fix read the drifted row as evidence that `visible=false` should stop meaning
 * "withdrawn", which would have redefined the rule around corrupted state.
 *
 * So the invariant is checked against a real database rather than asserted in
 * prose.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomUUID } from "node:crypto";

import { useTestDatabase } from "../test-support/integration-db.js";
import { capabilities } from "../db/schema.js";

if (process.env.DATABASE_URL_TEST) {
  process.env.AUDIT_HMAC_SECRET ??= "wp8-inv-secret-at-least-32-chars-0000000";
  process.env.ADMIN_SECRET ??= "wp8-inv-admin-secret-at-least-32-chars00";
}

const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;

describeMaybe("half-quarantined capabilities are detected", () => {
  let client: ReturnType<typeof postgres>;
  let db: ReturnType<typeof drizzle>;
  const seeded: string[] = [];

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    for (const id of seeded.splice(0)) {
      await db.delete(capabilities).where(eq(capabilities.id, id));
    }
  });

  async function seedCapability(flags: {
    visible: boolean;
    x402Enabled: boolean;
    isActive?: boolean;
  }): Promise<string> {
    const id = randomUUID();
    const slug = `wp8-inv-${randomUUID().slice(0, 8)}`;
    seeded.push(id);
    await db.insert(capabilities).values({
      id,
      slug,
      name: `WP8 invariant probe ${slug}`,
      description: "Seeded by the partial-quarantine invariant test.",
      category: "developer-tools",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      priceCents: 10,
      isActive: flags.isActive ?? true,
      visible: flags.visible,
      x402Enabled: flags.x402Enabled,
      lifecycleState: "active",
      avgLatencyMs: 50,
    });
    return slug;
  }

  /** The invariant, expressed exactly as the checker queries it. */
  async function halfQuarantined(): Promise<string[]> {
    const rows = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(
        eq(capabilities.isActive, true),
      );
    const flagged: string[] = [];
    for (const r of rows) {
      const [full] = await db
        .select({
          slug: capabilities.slug,
          visible: capabilities.visible,
          x402Enabled: capabilities.x402Enabled,
        })
        .from(capabilities)
        .where(eq(capabilities.slug, r.slug))
        .limit(1);
      if (full && !full.visible && full.x402Enabled) flagged.push(full.slug);
    }
    return flagged;
  }

  it("flags withdrawn-from-catalogue-but-still-sellable", async () => {
    // The exact shape production held: invisible, yet on the paid rail.
    const slug = await seedCapability({ visible: false, x402Enabled: true });
    expect(await halfQuarantined()).toContain(slug);
  });

  it("does not flag a fully withdrawn capability", async () => {
    // What the quality floor actually writes.
    const slug = await seedCapability({ visible: false, x402Enabled: false });
    expect(await halfQuarantined()).not.toContain(slug);
  });

  it("does not flag a published capability, on or off the rail", async () => {
    // Most capabilities are wallet-only; flagging those would make the check
    // noise, and noise gets silenced.
    const onRail = await seedCapability({ visible: true, x402Enabled: true });
    const offRail = await seedCapability({ visible: true, x402Enabled: false });
    const flagged = await halfQuarantined();
    expect(flagged).not.toContain(onRail);
    expect(flagged).not.toContain(offRail);
  });

  it("the CHECKER itself flags it — not a re-implementation of its query", async () => {
    // The first draft of this test re-ran the predicate inline and asserted on
    // that, which proves the test's own SQL and nothing about the checker. It
    // now calls the checker.
    const { checkPartialQuarantineState } = await import("./invariant-checker.js");

    const clean = await checkPartialQuarantineState({ error: () => {} });
    expect(clean.alerts, "no drift seeded yet").toBe(0);

    await seedCapability({ visible: false, x402Enabled: true });

    const logged: unknown[] = [];
    const dirty = await checkPartialQuarantineState({
      error: (obj) => logged.push(obj),
    });

    expect(dirty.alerts).toBe(1);
    expect(JSON.stringify(logged)).toMatch(/partial-quarantine|wp8-inv-/);
  });
});
