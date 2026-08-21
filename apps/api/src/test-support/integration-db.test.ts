/**
 * The guard is itself a safety control, so it gets its own test. The cases
 * that matter are the refusals: a rule that only proves it accepts localhost
 * would pass even if the refusal branch were deleted.
 */

import { describe, it, expect } from "vitest";
import {
  assertLoopbackDatabaseUrl,
  UnsafeTestDatabaseError,
} from "./integration-db.js";

describe("assertLoopbackDatabaseUrl", () => {
  it("accepts loopback targets", () => {
    for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
      expect(() =>
        assertLoopbackDatabaseUrl(`postgresql://u:p@${host}:55440/strale_test`),
      ).not.toThrow();
    }
  });

  it("refuses the production proxy this repo actually uses", () => {
    // The real shape of DATABASE_URL in the repo root .env. If DB-writing
    // tests ever inherited it, they would mutate live customer data.
    expect(() =>
      assertLoopbackDatabaseUrl(
        "postgresql://postgres:secret@metro.proxy.rlwy.net:51617/railway",
      ),
    ).toThrow(UnsafeTestDatabaseError);
  });

  it("refuses any non-loopback host, including unknown ones", () => {
    for (const host of [
      "db.internal",
      "10.0.0.5",
      "some-new-vendor.example.com",
      "localhost.evil.com", // suffix trick — must not be treated as loopback
    ]) {
      expect(() =>
        assertLoopbackDatabaseUrl(`postgresql://u:p@${host}:5432/db`),
      ).toThrow(UnsafeTestDatabaseError);
    }
  });

  it("refuses URLs that only look like loopback", () => {
    // Classic bypass shapes. Every one must land on the refusing side; a
    // hostname parser that reads the userinfo or the fragment as the host
    // would send writes to the attacker-chosen server instead.
    const disguised = [
      "postgresql://127.0.0.1@evil.com/db", // loopback in the userinfo
      "postgresql://u:p@evil.com#localhost/db", // loopback in the fragment
      "postgresql://u:p@127.0.0.1.evil.com/db", // loopback as a subdomain
    ];
    for (const url of disguised) {
      expect(() => assertLoopbackDatabaseUrl(url)).toThrow(UnsafeTestDatabaseError);
    }
  });

  it("accepts loopback regardless of case", () => {
    expect(() =>
      assertLoopbackDatabaseUrl("postgresql://u:p@LOCALHOST:5432/strale_test"),
    ).not.toThrow();
  });

  it("refuses obfuscated loopback encodings, erring towards refusal", () => {
    // 0177.0.0.1 and 2130706433 both resolve to 127.0.0.1, and
    // ::ffff:127.0.0.1 is v4-mapped loopback. The guard does not decode them,
    // so it refuses. That is the safe direction — a false refusal costs a
    // developer one clear error message; a false accept costs customer data.
    for (const host of ["0177.0.0.1", "2130706433", "[::ffff:127.0.0.1]"]) {
      expect(() =>
        assertLoopbackDatabaseUrl(`postgresql://u:p@${host}/db`),
      ).toThrow(UnsafeTestDatabaseError);
    }
  });

  it("refuses a loopback tunnel pointed at a non-test database", () => {
    // Loopback is not proof of a throwaway target. An SSH tunnel or
    // port-forward on localhost:5432 reaches whatever is on the far end, and
    // production is reachable that way. The database NAME is what
    // distinguishes them: production is "railway".
    for (const database of ["railway", "postgres", "strale_prod"]) {
      expect(() =>
        assertLoopbackDatabaseUrl(`postgresql://u:p@localhost:5432/${database}`),
      ).toThrow(UnsafeTestDatabaseError);
    }
    expect(() =>
      assertLoopbackDatabaseUrl("postgresql://u:p@localhost:5432/strale_test"),
    ).not.toThrow();
  });

  it("refuses a malformed URL rather than passing it through", () => {
    expect(() => assertLoopbackDatabaseUrl("not-a-url")).toThrow(
      UnsafeTestDatabaseError,
    );
  });
});

describe("useTestDatabase in the CI lane", () => {
  it("refuses to skip when the lane demands a database", async () => {
    const { useTestDatabase } = await import("./integration-db.js");
    const prevUrl = process.env.DATABASE_URL_TEST;
    const prevFlag = process.env.STRALE_REQUIRE_INTEGRATION_DB;
    delete process.env.DATABASE_URL_TEST;
    process.env.STRALE_REQUIRE_INTEGRATION_DB = "1";
    try {
      // Skipping here is the silent-green failure the lane exists to prevent,
      // so the helper must throw rather than return null.
      expect(() => useTestDatabase()).toThrow(UnsafeTestDatabaseError);
    } finally {
      if (prevUrl === undefined) delete process.env.DATABASE_URL_TEST;
      else process.env.DATABASE_URL_TEST = prevUrl;
      if (prevFlag === undefined) delete process.env.STRALE_REQUIRE_INTEGRATION_DB;
      else process.env.STRALE_REQUIRE_INTEGRATION_DB = prevFlag;
    }
  });

  it("still skips cleanly on a developer machine with no test database", async () => {
    const { useTestDatabase } = await import("./integration-db.js");
    const prevUrl = process.env.DATABASE_URL_TEST;
    const prevFlag = process.env.STRALE_REQUIRE_INTEGRATION_DB;
    delete process.env.DATABASE_URL_TEST;
    delete process.env.STRALE_REQUIRE_INTEGRATION_DB;
    try {
      expect(useTestDatabase()).toBeNull();
    } finally {
      if (prevUrl !== undefined) process.env.DATABASE_URL_TEST = prevUrl;
      if (prevFlag !== undefined) process.env.STRALE_REQUIRE_INTEGRATION_DB = prevFlag;
    }
  });
});
