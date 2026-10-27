import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { eq } from "drizzle-orm";
import { useTestDatabase } from "../test-support/integration-db.js";

import { capabilities, capabilityLimitations } from "../db/schema.js";
import { applyManifestText, type TextManifest } from "./manifest-text-sync.js";
const DATABASE_URL_TEST = useTestDatabase();
const describeMaybe = DATABASE_URL_TEST ? describe : describe.skip;
let getDb: typeof import("../db/index.js")["getDb"];
let closeDbPool: typeof import("../db/index.js")["closeDbPool"];
describeMaybe("manifest text sync against disposable Postgres", () => {
  const slug = "test-h3-manifest-sync";
  const manifest: TextManifest = { slug, name: "Reviewed name", description: "Reviewed description", category: "data", data_source: "Reviewed source", input_schema: { type: "object", properties: { value: { type: "string" } } }, output_schema: { type: "object" }, output_field_reliability: { value: "guaranteed" }, limitations: [{ title: "Reviewed title", text: "Test-only limitation", category: "coverage" }] };
  beforeAll(async () => {
    ({ getDb, closeDbPool } = await import("../db/index.js"));
    await getDb().delete(capabilities).where(eq(capabilities.slug, slug));
    await getDb().insert(capabilities).values({ slug, name: "Old", description: "Old", category: "data", priceCents: 77, isActive: false, visible: false, x402Enabled: false, transparencyTag: "algorithmic", inputSchema: {}, outputSchema: {} });
  });
  afterAll(async () => {
    await getDb().delete(capabilityLimitations).where(eq(capabilityLimitations.capabilitySlug, slug));
    await getDb().delete(capabilities).where(eq(capabilities.slug, slug));
    await closeDbPool();
  });
  it("applies once, roundtrips JSONB as objects and limitations, and leaves DB-owned values intact", async () => {
    const source = [{ slug, load: async () => manifest }];
    expect(await applyManifestText(getDb(), source)).toMatchObject({ updated: 1, failed: 0 });
    const [row] = await getDb().select().from(capabilities).where(eq(capabilities.slug, slug));
    expect(row).toMatchObject({ name: manifest.name, inputSchema: manifest.input_schema, outputSchema: manifest.output_schema, outputFieldReliability: manifest.output_field_reliability, priceCents: 77, isActive: false, visible: false, x402Enabled: false, transparencyTag: "algorithmic" });
    const [limitation] = await getDb().select().from(capabilityLimitations).where(eq(capabilityLimitations.capabilitySlug, slug));
    expect(limitation.title).toBe("Reviewed title");
    expect(await applyManifestText(getDb(), source)).toMatchObject({ updated: 0, unchanged: 1, failed: 0 });
  });
  it("skips an overlapping boot under a real session lock and resumes after release", async () => {
    const db = getDb();
    const connection = await (db as ReturnType<typeof getDb> & { $client: Sql }).$client.reserve();
    try {
      const [lock] = await connection.unsafe("SELECT pg_try_advisory_lock(728103, 1) AS acquired");
      expect(lock.acquired).toBe(true);
      expect(await applyManifestText(db, [{ slug, load: async () => manifest }])).toMatchObject({ skipped: 1, updated: 0, failed: 0 });
    } finally {
      try { await connection.unsafe("SELECT pg_advisory_unlock(728103, 1)"); }
      finally { connection.release(); }
    }
    expect(await applyManifestText(db, [{ slug, load: async () => manifest }])).toMatchObject({ skipped: 0, failed: 0 });
  });
  it("refuses injected empty limitations without deleting the stored limitation", async () => {
    const db = getDb();
    const before = await db.select().from(capabilityLimitations).where(eq(capabilityLimitations.capabilitySlug, slug));
    expect(before.length).toBeGreaterThan(0);
    expect(await applyManifestText(db, [{ slug, load: async () => ({ ...manifest, limitations: [] }) }])).toMatchObject({ failed: 1, updated: 0 });
    expect(await db.select().from(capabilityLimitations).where(eq(capabilityLimitations.capabilitySlug, slug))).toEqual(before);
  });

});
