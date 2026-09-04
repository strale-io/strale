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

import { sql as sqlRaw } from "drizzle-orm";

import { useTestDatabase } from "../test-support/integration-db.js";
import { expectDbRejection } from "../test-support/db-errors.js";
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
  /**
   * The constraint definition AS THE MIGRATION INSTALLED IT.
   *
   * Captured once, before any test touches it, and restored verbatim. The first
   * version of the helper re-added a hardcoded correct predicate, which
   * overwrote whatever block 0099 had actually written — so replacing the
   * migration's CHECK with `CHECK (true)` left every test green. Restoring the
   * original is what keeps this suite honest about the migration.
   */
  let originalConstraintDef: string | null = null;

  beforeAll(async () => {
    client = postgres(DATABASE_URL_TEST!, { max: 4 });
    db = drizzle(client);
    const rows = (await db.execute(
      sqlRaw`SELECT pg_get_constraintdef(oid) AS def
             FROM pg_constraint WHERE conname = 'capabilities_no_half_quarantine'`,
    )) as unknown as Array<{ def: string }>;
    originalConstraintDef = rows[0]?.def ?? null;
  }, 120_000);

  afterAll(async () => {
    await client.end();
  });

  afterEach(async () => {
    for (const id of seeded.splice(0)) {
      await db.delete(capabilities).where(eq(capabilities.id, id));
    }
  });

  /**
   * Seed a state the CHECK constraint forbids.
   *
   * Block 0099 makes half-quarantine unreachable through normal writes, which
   * is the point — but it also means the scheduled checker can no longer be
   * exercised by inserting the condition. That is not a reason to stop testing
   * the checker: the migration DEFERS on lock contention, so a boot can leave
   * the constraint absent, and the checker is exactly what covers that window.
   *
   * So the constraint is dropped for the duration of the assertion and restored
   * immediately, modelling the real scenario rather than pretending the checker
   * is dead code.
   */
  async function withoutConstraint<T>(fn: () => Promise<T>): Promise<T> {
    await db.execute(
      sqlRaw`ALTER TABLE capabilities DROP CONSTRAINT IF EXISTS capabilities_no_half_quarantine`,
    );
    try {
      return await fn();
    } finally {
      // Clear the violators BEFORE restoring: afterEach has not run yet, so a
      // VALIDATE here would find the very rows the assertion just used and
      // throw inside the finally, masking the test result.
      await db.execute(
        sqlRaw`DELETE FROM capabilities
               WHERE is_active AND NOT visible AND x402_enabled`,
      );
      // Verbatim, so the suite never substitutes its own idea of the rule for
      // the migration's. If the migration installed nothing, restore nothing.
      if (originalConstraintDef) {
        await db.execute(
          sqlRaw`ALTER TABLE capabilities
                 ADD CONSTRAINT capabilities_no_half_quarantine
                 ${sqlRaw.raw(originalConstraintDef)} NOT VALID`,
        );
        await db.execute(
          sqlRaw`ALTER TABLE capabilities VALIDATE CONSTRAINT capabilities_no_half_quarantine`,
        );
      }
    }
  }

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
    await withoutConstraint(async () => {
      const slug = await seedCapability({ visible: false, x402Enabled: true });
      expect(await halfQuarantined()).toContain(slug);
    });
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

    await withoutConstraint(async () => {
      await seedCapability({ visible: false, x402Enabled: true });

      const logged: unknown[] = [];
      const dirty = await checkPartialQuarantineState({
        error: (obj) => logged.push(obj),
      });

      expect(dirty.alerts).toBe(1);
      expect(JSON.stringify(logged)).toMatch(/partial-quarantine|wp8-inv-/);
    });
  });

  it("the MIGRATION installed a constraint with the right predicate", async () => {
    // Without this the rejection test below proves nothing about the migration:
    // withoutConstraint() drops and re-adds a correct constraint of its own, so
    // by the time the rejection runs, the constraint under test may be the
    // helper's rather than block 0099's. Caught by mutation — replacing the
    // migration's predicate with CHECK (true) left every test green.
    expect(originalConstraintDef, "block 0099 must install the constraint").not.toBeNull();
    const def = originalConstraintDef!.toLowerCase();
    expect(def).toContain("is_active");
    expect(def).toContain("visible");
    expect(def).toContain("x402_enabled");
    expect(def, "a CHECK (true) would satisfy a mere existence assertion").not.toMatch(
      /check \(true\)/,
    );
  });

  it("POSTGRES rejects the invalid transition — the checker is defence in depth", async () => {
    // The blocking review point. A scheduled check catches the NEXT out-of-band
    // write only after up to two hours during which the capability is on sale.
    // The database refuses it outright, which is the difference between
    // detecting and preventing.
    const slug = await seedCapability({ visible: true, x402Enabled: true });

    // Withdrawing from the catalogue while leaving it on the paid rail is
    // exactly the shape production held.
    await expectDbRejection(
      db
        .update(capabilities)
        .set({ visible: false })
        .where(eq(capabilities.slug, slug)),
      /capabilities_no_half_quarantine/i,
    );

    // The row is unchanged — the write was refused, not partially applied.
    const [after] = await db
      .select({ visible: capabilities.visible, x402Enabled: capabilities.x402Enabled })
      .from(capabilities)
      .where(eq(capabilities.slug, slug));
    expect(after!.visible).toBe(true);
    expect(after!.x402Enabled).toBe(true);
  });

  it("but a COMPLETE withdrawal is still allowed", async () => {
    // The constraint must not block the quality floor doing its job. It writes
    // both flags in one statement, which satisfies the CHECK.
    const slug = await seedCapability({ visible: true, x402Enabled: true });
    await db
      .update(capabilities)
      .set({ visible: false, x402Enabled: false })
      .where(eq(capabilities.slug, slug));

    const [after] = await db
      .select({ visible: capabilities.visible, x402Enabled: capabilities.x402Enabled })
      .from(capabilities)
      .where(eq(capabilities.slug, slug));
    expect(after!.visible).toBe(false);
    expect(after!.x402Enabled).toBe(false);
  });

  it("and a deactivated capability may hold any flag combination", async () => {
    // The constraint is scoped to is_active. A deactivated row is not on sale
    // whatever its flags say, and constraining it would block ordinary
    // deactivation paths for no safety gain.
    const slug = await seedCapability({
      visible: false,
      x402Enabled: true,
      isActive: false,
    });
    const [row] = await db
      .select({ slug: capabilities.slug })
      .from(capabilities)
      .where(eq(capabilities.slug, slug));
    expect(row).toBeDefined();
  });
});
