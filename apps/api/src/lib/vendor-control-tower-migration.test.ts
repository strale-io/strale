import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  runMigration0111_vendorControlTower,
  type MigrationExecutor,
} from "./startup-migrations.js";

class CaptureExecutor implements MigrationExecutor {
  readonly sql: string[] = [];
  readonly params: unknown[][] = [];

  async execute(query: Parameters<MigrationExecutor["execute"]>[0]): Promise<unknown> {
    const rendered = new PgDialect().sqlToQuery(query);
    this.sql.push(rendered.sql);
    this.params.push(rendered.params);
    if (rendered.sql.includes("INSERT INTO vendor_capability_suspensions")) return { count: 1 };
    return [];
  }
}

describe("migration 0111 — Vendor Control Tower", () => {
  it("is replay-safe and persists a reversible OpenRegister suspension", async () => {
    const tx = new CaptureExecutor();
    const result = await runMigration0111_vendorControlTower(tx);
    const source = tx.sql.join("\n");

    expect(result.rows_affected).toBe(1);
    expect(source).toContain("CREATE TABLE IF NOT EXISTS vendor_accounts");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS vendor_capability_suspensions");
    expect(source).toContain("CREATE TABLE IF NOT EXISTS vendor_solution_suspensions");
    expect(source).toContain("ON CONFLICT (provider_name, capability_slug) DO NOTHING");
    expect(source).toContain("dependency_kind = EXCLUDED.dependency_kind");
    expect(source).toContain("DELETE FROM vendor_capability_dependencies d");
    expect(source).toContain("previous_lifecycle_state");
    expect(source).toContain("previous_x402_enabled");
    expect(source).toContain("c.deactivation_reason IS NULL OR c.deactivation_reason LIKE 'vendor:%'");
    expect(source).toContain("lifecycle_state = 'suspended'");
    expect(source).toContain("x402_enabled = false");
    expect(source).toContain("UPDATE solutions s");
    expect(source).toContain("test_type = 'schema_check'");
    expect(source).toContain("capability_slug IN ('screenshot-url', 'html-to-pdf')");
    expect(source).toContain("German Company Data — HRB fixture path");
    expect(source).toContain("German Company Data — company ID fixture path");
    expect(source).toContain("'fixture'");
  });

  it("never binds Date or Buffer objects in its database writes", async () => {
    const tx = new CaptureExecutor();
    await runMigration0111_vendorControlTower(tx);

    const bound = tx.params.flat();
    expect(bound.some((value) => value instanceof Date)).toBe(false);
    expect(bound.some((value) => Buffer.isBuffer(value))).toBe(false);
  });
});
