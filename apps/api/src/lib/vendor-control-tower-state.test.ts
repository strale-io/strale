import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const mock = vi.hoisted(() => ({
  execute: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../db/index.js", () => ({
  getDb: () => ({ execute: mock.execute, transaction: mock.transaction }),
}));
vi.mock("./alert-once.js", () => ({ alertOnce: vi.fn() }));

import {
  assertVendorAvailable,
  rearmVendorAfterCredentialChange,
  recordVendorHttpFailure,
  recordVendorUsage,
  registeredRecoveryAdapterNames,
  resetVendorStatusCacheForTests,
  restoreVendorSuspensions,
  runVendorRecoveryProbe,
  suspendRequiredCapabilities,
} from "./vendor-control-tower.js";

function rendered(query: unknown): string {
  return new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]).sql;
}

describe("vendor suspension serving-state integrity", () => {
  const seen: string[] = [];

  beforeEach(() => {
    seen.length = 0;
    mock.execute.mockReset();
    mock.transaction.mockReset();
    mock.transaction.mockImplementation(async (fn: (tx: { execute: typeof mock.execute }) => unknown) =>
      fn({ execute: mock.execute }));
    resetVendorStatusCacheForTests();
  });

  it("withdraws both required capabilities and every dependent solution", async () => {
    mock.execute.mockImplementation(async (query: unknown) => {
      const source = rendered(query);
      seen.push(source);
      if (source.includes("INSERT INTO vendor_capability_suspensions")) {
        return [{ capability_slug: "german-company-data" }];
      }
      if (source.includes("INSERT INTO vendor_solution_suspensions")) {
        return [{ solution_slug: "kyb-essentials-de" }];
      }
      return [];
    });

    await expect(suspendRequiredCapabilities("openregister", "exhausted", "2026-09-06T23:40:04.613Z"))
      .resolves.toEqual(["german-company-data"]);

    expect(seen.some((sql) => sql.includes("UPDATE capabilities c") && sql.includes("visible = false"))).toBe(true);
    expect(seen.some((sql) => sql.includes("UPDATE solutions s") && sql.includes("x402_enabled = false"))).toBe(true);
    const suspensionInserts = seen.filter((sql) => sql.includes("INSERT INTO vendor_") && sql.includes("_suspensions"));
    expect(suspensionInserts).toHaveLength(2);
    expect(suspensionInserts.every((sql) => sql.includes("deactivation_reason IS NULL") && sql.includes("LIKE 'vendor:%'"))).toBe(true);
    expect(suspensionInserts.every((sql) => sql.includes("::timestamptz"))).toBe(true);
    expect(suspensionInserts.find((sql) => sql.includes("vendor_solution_suspensions")))
      .toContain("OR s.deactivation_reason LIKE 'vendor:%'");
    const auditInserts = seen.filter((sql) => sql.includes("INSERT INTO health_monitor_events"));
    expect(auditInserts).toHaveLength(2);
    expect(auditInserts.every((sql) =>
      sql.includes("jsonb_build_object") && sql.includes("::text")
    )).toBe(true);
  });

  it("records a second blocker when a solution is already vendor-disabled", async () => {
    mock.execute.mockImplementation(async (query: unknown) => {
      const source = rendered(query);
      seen.push(source);
      if (source.includes("INSERT INTO vendor_solution_suspensions")) {
        return [{ solution_slug: "shared-solution" }];
      }
      return [];
    });

    await suspendRequiredCapabilities("openregister", "exhausted", null);
    await suspendRequiredCapabilities("dilisense", "auth_error", null);

    const inserts = seen.filter((source) => source.includes("INSERT INTO vendor_solution_suspensions"));
    expect(inserts).toHaveLength(2);
    expect(inserts.every((source) => source.includes("OR s.deactivation_reason LIKE 'vendor:%'"))).toBe(true);
  });

  it("keeps customer traffic blocked instead of using it as a recovery probe", async () => {
    mock.execute.mockImplementation(async (query: unknown) => {
      const source = rendered(query);
      seen.push(source);
      if (source.includes("SELECT status FROM vendor_accounts")) return [{ status: "auth_error" }];
      return [];
    });

    await expect(assertVendorAvailable("dilisense")).rejects.toThrow(/auth_error/);
    expect(seen.some((source) => source.includes("recovery_probe"))).toBe(false);
  });

  it("stores only a one-way key fingerprint when an unprobeable vendor rejects auth", async () => {
    const originalKey = process.env.SERPER_API_KEY;
    process.env.SERPER_API_KEY = "super-secret-test-key";
    const params: unknown[] = [];
    mock.execute.mockImplementation(async (query: unknown) => {
      const compiled = new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
      seen.push(compiled.sql);
      params.push(...compiled.params);
      return [];
    });

    try {
      await recordVendorHttpFailure("serper", 401);
    } finally {
      if (originalKey === undefined) delete process.env.SERPER_API_KEY;
      else process.env.SERPER_API_KEY = originalKey;
    }

    expect(seen[0]).toContain("blocked_credential_fingerprint");
    expect(params).not.toContain("super-secret-test-key");
    expect(params).toContain("926a00ea22f63b9c2a8e9a0cf85662d420854add670ff2dde9fe6677866c4301");
  });

  it("re-arms a changed credential without spending a synthetic vendor call", async () => {
    const originalKey = process.env.DILISENSE_API_KEY;
    process.env.DILISENSE_API_KEY = "rotated-key";
    mock.execute.mockImplementation(async (query: unknown) => {
      const source = rendered(query);
      seen.push(source);
      if (source.includes("Credential changed; re-armed")) return [{ status: "healthy" }];
      return [];
    });

    try {
      await expect(rearmVendorAfterCredentialChange("dilisense", "DILISENSE_API_KEY"))
        .resolves.toBe(true);
    } finally {
      if (originalKey === undefined) delete process.env.DILISENSE_API_KEY;
      else process.env.DILISENSE_API_KEY = originalKey;
    }

    expect(seen[0]).toContain("blocked_credential_fingerprint");
    expect(seen[0]).toContain("status = 'auth_error'");
    expect(seen.some((source) => source.includes("FROM vendor_accounts va") && source.includes("required_units"))).toBe(true);
  });

  it("fingerprints a legacy auth error without pretending the key changed", async () => {
    const originalKey = process.env.SERPER_API_KEY;
    process.env.SERPER_API_KEY = "unchanged-legacy-key";
    mock.execute.mockImplementation(async (query: unknown) => {
      const source = rendered(query);
      seen.push(source);
      if (source.includes("NOT (COALESCE(metadata") && source.includes("blocked_credential_fingerprint")) {
        return [{ provider_name: "serper" }];
      }
      return [];
    });

    try {
      await expect(rearmVendorAfterCredentialChange("serper", "SERPER_API_KEY"))
        .resolves.toBe(false);
    } finally {
      if (originalKey === undefined) delete process.env.SERPER_API_KEY;
      else process.env.SERPER_API_KEY = originalKey;
    }

    expect(seen[0]).toContain("NOT (COALESCE(metadata, '{}'::jsonb) ? 'blocked_credential_fingerprint')");
    expect(seen[1]).toContain("metadata ? 'blocked_credential_fingerprint'");
    expect(seen.some((source) => source.includes("FROM vendor_accounts va"))).toBe(false);
  });

  it("runs a zero-credit eSortcode canary and completes only its exact lease", async () => {
    const originalKey = process.env.ESORTCODE_API_KEY;
    process.env.ESORTCODE_API_KEY = "test-key";
    const network = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    mock.execute.mockImplementation(async (query: unknown) => {
      const source = rendered(query);
      seen.push(source);
      if (source.includes("jsonb_build_object") && source.includes("RETURNING provider_name")) {
        return [{ provider_name: "esortcode" }];
      }
      if (source.includes("Scheduled authenticated recovery canary succeeded") && source.includes("RETURNING status")) {
        return [{ status: "healthy" }];
      }
      return [];
    });

    try {
      await expect(runVendorRecoveryProbe("esortcode", "auth_error", network)).resolves.toBe("recovered");
    } finally {
      if (originalKey === undefined) delete process.env.ESORTCODE_API_KEY;
      else process.env.ESORTCODE_API_KEY = originalKey;
    }

    const requestedUrl = String(network.mock.calls[0][0]);
    expect(requestedUrl).toContain("testOutcome=MATCHED");
    expect(requestedUrl).toContain("sortcode=000000");
    const completion = seen.find((source) =>
      source.includes("Scheduled authenticated recovery canary succeeded") && source.includes("RETURNING status"));
    const claim = seen.find((source) =>
      source.includes("jsonb_build_object") && source.includes("RETURNING provider_name"));
    expect(claim).toContain("::text");
    expect(completion).toContain("metadata#>>'{recovery_probe,token}' =");
    expect(completion).toContain("metadata#>>'{recovery_probe,status}' =");
    expect(completion).not.toContain("included_units -");
  });

  it("does not schedule billable Serper or Dilisense synthetic recovery calls", async () => {
    const network = vi.fn();

    await expect(runVendorRecoveryProbe("serper", "exhausted", network)).resolves.toBe("not_due");
    expect(network).not.toHaveBeenCalled();
    expect(registeredRecoveryAdapterNames()).toEqual(["esortcode"]);
  });

  it("never treats eSortcode's zero-credit test as balance recovery", async () => {
    const network = vi.fn();
    mock.execute.mockImplementation(async (query: unknown) => {
      seen.push(rendered(query));
      return [];
    });

    await expect(runVendorRecoveryProbe("esortcode", "exhausted", network)).resolves.toBe("not_due");
    expect(network).not.toHaveBeenCalled();
    expect(seen[0]).toContain("NOT (provider_name = 'esortcode' AND status = 'exhausted')");
  });

  it("reclassifies an auth canary's ZeroCredits response as exhausted", async () => {
    const originalKey = process.env.ESORTCODE_API_KEY;
    process.env.ESORTCODE_API_KEY = "test-key";
    const network = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ message: "ZeroCredits" }),
      { status: 403 },
    ));
    let failureParams: unknown[] = [];
    mock.execute.mockImplementation(async (query: unknown) => {
      const compiled = new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
      seen.push(compiled.sql);
      if (compiled.sql.includes("jsonb_build_object") && compiled.sql.includes("RETURNING provider_name")) {
        return [{ provider_name: "esortcode" }];
      }
      if (compiled.sql.includes("SET status =") && compiled.sql.includes("last_error =")) {
        failureParams = compiled.params;
        return [{ provider_name: "esortcode" }];
      }
      return [];
    });

    try {
      await expect(runVendorRecoveryProbe("esortcode", "auth_error", network)).resolves.toBe("still_blocked");
    } finally {
      if (originalKey === undefined) delete process.env.ESORTCODE_API_KEY;
      else process.env.ESORTCODE_API_KEY = originalKey;
    }

    expect(failureParams).toContain("exhausted");
    expect(seen.some((source) => source.includes("FROM vendor_capability_suspensions b"))).toBe(false);
  });

  it("does not restore when recovery completion loses its lease compare-and-set", async () => {
    const originalKey = process.env.ESORTCODE_API_KEY;
    process.env.ESORTCODE_API_KEY = "test-key";
    const network = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    mock.execute.mockImplementation(async (query: unknown) => {
      const source = rendered(query);
      seen.push(source);
      if (source.includes("jsonb_build_object") && source.includes("RETURNING provider_name")) {
        return [{ provider_name: "esortcode" }];
      }
      // A newer status observation removed/replaced the lease before this
      // success returned, so guarded completion affects no row.
      if (source.includes("Scheduled authenticated recovery canary succeeded")) return [];
      return [];
    });

    try {
      await expect(runVendorRecoveryProbe("esortcode", "auth_error", network)).resolves.toBe("stale");
    } finally {
      if (originalKey === undefined) delete process.env.ESORTCODE_API_KEY;
      else process.env.ESORTCODE_API_KEY = originalKey;
    }

    expect(seen.some((source) => source.includes("FROM vendor_capability_suspensions b"))).toBe(false);
  });

  it("restores capability and solution state only while the tower marker still matches", async () => {
    mock.execute.mockImplementation(async (query: unknown) => {
      const source = rendered(query);
      seen.push(source);
      if (source.includes("FROM vendor_accounts va") && source.includes("required_units")) {
        return [{ status: "healthy", remaining_units: 500, overage_units: 0, required_units: 11 }];
      }
      if (source.includes("FROM vendor_capability_suspensions b")) {
        return [{
          provider_name: "openregister",
          status: "healthy",
          remaining_units: 500,
          overage_units: 0,
          restore_after: null,
          required_units: 11,
          previous_lifecycle_state: "active",
          previous_visible: true,
          previous_x402_enabled: true,
          suspension_marker: "vendor:openregister:exhausted",
        }];
      }
      if (source.includes("FROM vendor_capability_suspensions") && source.includes("FOR UPDATE")) {
        return [{ capability_slug: "german-company-data" }];
      }
      if (source.includes("FROM vendor_solution_suspensions b")) {
        return [{
          provider_name: "openregister",
          status: "healthy",
          remaining_units: 500,
          overage_units: 0,
          restore_after: null,
          required_units: 11,
          previous_is_active: true,
          previous_x402_enabled: true,
          suspension_marker: "vendor:openregister:exhausted",
        }];
      }
      if (source.includes("FROM vendor_solution_suspensions") && source.includes("FOR UPDATE")) {
        return [{ solution_slug: "kyb-essentials-de" }];
      }
      if (source.includes("SELECT deactivation_reason FROM capabilities")) {
        return [{ deactivation_reason: "vendor:openregister:exhausted" }];
      }
      if (source.includes("SELECT deactivation_reason FROM solutions")) {
        return [{ deactivation_reason: "vendor:openregister:exhausted" }];
      }
      if (source.includes("UPDATE capabilities") && source.includes("RETURNING slug")) {
        return [{ slug: "german-company-data" }];
      }
      if (source.includes("UPDATE solutions") && source.includes("RETURNING slug")) {
        return [{ slug: "kyb-essentials-de" }];
      }
      return [];
    });

    await expect(restoreVendorSuspensions("openregister"))
      .resolves.toEqual(["german-company-data"]);

    const guardedRestores = seen.filter((sql) =>
      sql.includes("RETURNING slug") && sql.includes("deactivation_reason ="));
    expect(guardedRestores).toHaveLength(2);
    const suspensionReads = seen.filter((sql) =>
      sql.includes("restored_at IS NULL") && sql.includes("restore_after <= now()") && sql.includes("FOR UPDATE"));
    expect(suspensionReads).toHaveLength(2);
    expect(suspensionReads.every((sql) => sql.includes("restore_after <= now()"))).toBe(true);
  });

  it.each([0, 1, 10])("does not restore OpenRegister with only %i usable credits", async (remaining) => {
    mock.execute.mockImplementation(async (query: unknown) => {
      seen.push(rendered(query));
      return [{ status: remaining === 0 ? "exhausted" : "low", remaining_units: remaining, overage_units: 0, required_units: 11 }];
    });

    await expect(restoreVendorSuspensions("openregister")).resolves.toEqual([]);
    expect(seen.some((source) => source.includes("UPDATE capabilities"))).toBe(false);
  });

  it("uses the first provider's original state and clears all overlapping solution blockers", async () => {
    mock.execute.mockImplementation(async (query: unknown) => {
      const source = rendered(query);
      seen.push(source);
      if (source.includes("FROM vendor_accounts va") && source.includes("required_units")) {
        return [{ status: "healthy", remaining_units: 500, overage_units: 0, required_units: 11 }];
      }
      if (source.includes("FROM vendor_capability_suspensions") && !source.includes(" b")) return [];
      if (source.includes("FROM vendor_solution_suspensions b")) {
        return [
          {
            provider_name: "openregister", status: "healthy", remaining_units: 500,
            overage_units: 0, restore_after: null, required_units: 11,
            previous_is_active: true, previous_x402_enabled: true,
            suspension_marker: "vendor:openregister:exhausted",
          },
          {
            provider_name: "dilisense", status: "healthy", remaining_units: null,
            overage_units: 0, restore_after: null, required_units: 1,
            previous_is_active: false, previous_x402_enabled: false,
            suspension_marker: "vendor:dilisense:auth_error",
          },
        ];
      }
      if (source.includes("FROM vendor_solution_suspensions") && source.includes("FOR UPDATE")) {
        return [{ solution_slug: "kyb-essentials-de" }];
      }
      if (source.includes("SELECT deactivation_reason FROM solutions")) {
        return [{ deactivation_reason: "vendor:openregister:exhausted" }];
      }
      if (source.includes("UPDATE solutions") && source.includes("RETURNING slug")) {
        return [{ slug: "kyb-essentials-de" }];
      }
      return [];
    });

    await restoreVendorSuspensions("dilisense");

    const restore = seen.find((source) => source.includes("UPDATE solutions") && source.includes("RETURNING slug"));
    expect(restore).toContain("SET is_active = $1");
    expect(seen.some((source) =>
      source.includes("UPDATE vendor_solution_suspensions") && !source.includes("provider_name ="))).toBe(true);
  });

  it("records counters only for ledger vendors but clears transient status after any success", async () => {
    mock.execute.mockImplementation(async (query: unknown) => {
      seen.push(rendered(query));
      return [{ status: "healthy", reset_at: null }];
    });

    await recordVendorUsage("dilisense", 1);

    expect(seen[0]).toContain("monitor_mode = 'internal_counter'");
    expect(seen[0]).toContain("status IN ('unknown', 'rate_limited', 'unavailable')");
    expect(seen[0]).toContain("last_success_at = now()");
    expect(seen[0]).not.toContain("WHERE provider_name = $1 AND monitor_mode");
  });

});
