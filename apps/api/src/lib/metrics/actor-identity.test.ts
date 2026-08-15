/**
 * Tests for the identity spine.
 *
 * The property that matters most is not that the keys are right — it is that
 * the TypeScript rule and the SQL rule cannot drift apart, since they are two
 * expressions of one definition living in different languages. A silent
 * divergence would make the dashboard and the check-in disagree about how many
 * customers exist, which is the class of confusion this whole module exists to
 * end.
 */
import { describe, it, expect } from "vitest";
import {
  resolveActor, ACTOR_KEY_SQL, ACTOR_KIND_SQL, ACTOR_KEY_VERSION,
} from "./actor-identity.js";

describe("resolving who did something", () => {
  it("prefers the account over the wallet when both are present", () => {
    // One person may pay from several wallets; the account is the thing they
    // logged into, so it is the stronger claim.
    const a = resolveActor({ userId: "u-1", x402PayerHash: "deadbeef" });
    expect(a.kind).toBe("user");
    expect(a.key).toBe(`user:${ACTOR_KEY_VERSION}:u-1`);
  });

  it("falls back to the wallet when there is no account", () => {
    const a = resolveActor({ x402PayerHash: "e9e672ef719e" });
    expect(a.kind).toBe("x402_wallet");
    expect(a.key).toBe(`x402:${ACTOR_KEY_VERSION}:e9e672ef719e`);
  });

  it("leaves an unidentifiable call unattributed rather than inventing an identity", () => {
    // The rejected alternative was a user-agent/IP fingerprint. It would build
    // exactly the cross-session profile the daily IP salt exists to prevent,
    // and it is unnecessary for counting paying customers.
    const a = resolveActor({});
    expect(a.key).toBeNull();
    expect(a.kind).toBe("unattributed");
  });

  it("never lets two different actors collide on one key", () => {
    const keys = [
      resolveActor({ userId: "u-1" }).key,
      resolveActor({ userId: "u-2" }).key,
      resolveActor({ x402PayerHash: "u-1" }).key, // same string, different rail
    ];
    expect(new Set(keys).size).toBe(3);
  });

  it("carries a version marker, so a future rule change cannot merge actors", () => {
    const key = resolveActor({ userId: "u-1" }).key!;
    expect(key).toContain(`:${ACTOR_KEY_VERSION}:`);
    // A v2 key for the same user must not equal the v1 key.
    expect(key).not.toBe(`user:v2:u-1`);
  });
});

describe("the SQL and TypeScript definitions cannot drift apart", () => {
  it("agrees on both prefixes and the version", () => {
    expect(ACTOR_KEY_SQL).toContain(`'user:${ACTOR_KEY_VERSION}:'`);
    expect(ACTOR_KEY_SQL).toContain(`'x402:${ACTOR_KEY_VERSION}:'`);
  });

  it("agrees on the same precedence — account first, then wallet", () => {
    const userAt = ACTOR_KEY_SQL.indexOf("user_id IS NOT NULL");
    const walletAt = ACTOR_KEY_SQL.indexOf("x402_payer_hash IS NOT NULL");
    expect(userAt).toBeGreaterThan(-1);
    expect(walletAt).toBeGreaterThan(userAt);
  });

  it("agrees on the kind names the TypeScript emits", () => {
    for (const kind of ["user", "x402_wallet", "unattributed"]) {
      expect(ACTOR_KIND_SQL, kind).toContain(`'${kind}'`);
    }
  });

  it("resolves NULL in SQL exactly where TypeScript resolves null", () => {
    expect(resolveActor({}).key).toBeNull();
    expect(ACTOR_KEY_SQL).toMatch(/ELSE\s+NULL/);
  });

  it("reads no raw wallet address — only the already-hashed column", () => {
    // hashX402Payer (attribution.ts) keys the address with an HMAC secret
    // before it ever reaches here. Nothing in this module should reference a
    // raw address field.
    expect(ACTOR_KEY_SQL).toContain("x402_payer_hash");
    expect(ACTOR_KEY_SQL).not.toMatch(/payer_address|wallet_address|from_address/);
  });
});
