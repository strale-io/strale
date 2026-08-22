/**
 * The operator handle: read-only by default, writable only against an Authority,
 * and TLS decided by the connection string rather than by a hardcoded flag.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertSslIntentIsExplicit, openOperatorWriteDb } from "./operator-db.js";
import { ProductionAuthorityError } from "./production-authority.js";

describe("TLS intent must be explicit, never hardcoded", () => {
  it("accepts a remote URL that says sslmode=require", () => {
    expect(() =>
      assertSslIntentIsExplicit(
        "postgresql://u:p@db.example.com:5432/railway?sslmode=require",
      ),
    ).not.toThrow();
  });

  it("accepts a remote URL that says sslmode=disable", () => {
    // The Railway public proxy does not terminate TLS. That must remain
    // expressible — the fix is to make it stated, not to forbid it.
    expect(() =>
      assertSslIntentIsExplicit(
        "postgresql://u:p@metro.proxy.rlwy.net:51617/railway?sslmode=disable",
      ),
    ).not.toThrow();
  });

  it("REFUSES a remote URL that is silent about TLS", () => {
    // This is the case the old hardcoded `ssl: false` swallowed: plaintext to
    // a remote host, or a misleading ECONNRESET against one that expects TLS.
    expect(() =>
      assertSslIntentIsExplicit("postgresql://u:p@db.example.com:5432/railway"),
    ).toThrow(/does not say whether to use TLS/);
  });

  it("allows loopback without a declaration", () => {
    // Local test databases are plaintext and that is not a decision anyone
    // needs to restate on every URL.
    expect(() =>
      assertSslIntentIsExplicit("postgresql://postgres:test@localhost:5432/strale_test"),
    ).not.toThrow();
  });

  it("refuses an unparseable URL rather than guessing", () => {
    expect(() => assertSslIntentIsExplicit("not a url")).toThrow(/not parseable/);
  });
});

describe("a writable handle cannot be opened without authority", () => {
  const saved = process.env.DATABASE_URL_WRITE;

  beforeEach(() => {
    delete process.env.DATABASE_URL_WRITE;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.DATABASE_URL_WRITE;
    else process.env.DATABASE_URL_WRITE = saved;
  });

  it("refuses with no Authority value at all", () => {
    expect(() => openOperatorWriteDb(undefined as never)).toThrow(
      ProductionAuthorityError,
    );
  });

  it("refuses a plain object pretending to be an Authority", () => {
    expect(() => openOperatorWriteDb({} as never)).toThrow(ProductionAuthorityError);
  });

  it("refuses even a well-shaped Authority when no write credential exists", () => {
    // The default state of every autonomous session: the credential simply is
    // not there, so the question of authority never even arises.
    expect(() =>
      openOperatorWriteDb({
        kind: "AUTONOMOUS_POLICY",
        policy: "DEC-20260812-A",
        purpose: "quality_floor_quarantine",
      }),
    ).toThrow(/No production write credential/);
  });
});
