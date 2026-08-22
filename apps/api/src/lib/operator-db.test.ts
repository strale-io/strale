/**
 * The operator handle: read-only by default, writable only against an Authority,
 * and TLS decided by the connection string rather than by a hardcoded flag.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { assertSslIntentIsExplicit, openOperatorWriteDb } from "./operator-db.js";
import { autonomousAuthority, ProductionAuthorityError } from "./production-authority.js";

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

  it("refuses a well-shaped Authority this module did not issue", () => {
    // Was "refuses even a well-shaped Authority when no write credential
    // exists", asserting the credential message. A well-SHAPED literal is no
    // longer well-FORMED: provenance is checked before the environment, so this
    // is now refused for the better reason. Order matters — a session that
    // fabricated an authority should be told that, not told to go and find a
    // credential.
    expect(() =>
      openOperatorWriteDb({
        kind: "AUTONOMOUS_POLICY",
        policy: "DEC-20260812-A",
        purpose: "quality_floor_quarantine",
      }),
    ).toThrow(/was not issued by/);
  });

  it("refuses a genuinely issued Authority when no write credential exists", () => {
    // The case the test above used to cover, with an authority that really came
    // from the constructor: the default state of every autonomous session is
    // that the credential simply is not there.
    expect(() =>
      openOperatorWriteDb(autonomousAuthority("quality_floor_quarantine", "DEC-20260812-A")),
    ).toThrow(/No production write credential/);
  });
});
