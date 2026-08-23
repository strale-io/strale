/**
 * WP11 / CR-09 — the parts of the trial authority decidable without a database.
 *
 * The entitlement gates read `trial_grants` and are proved against a real
 * Postgres in `routes/account-lifecycle.integration.test.ts`. What is here is
 * the MX rule and the hash, both of which are easy to get wrong in a way that
 * still looks like it works.
 */

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import {
  assessTrialGrant,
  hashEmail,
  normaliseEmail,
  TRIAL_CREDITS_CENTS,
} from "./trial-eligibility.js";

/** A db stub that reports no prior entitlement for any address or IP. */
function emptyDb() {
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    limit: async () => [],
    then: (resolve: (v: unknown) => unknown) => resolve([{ cnt: 0 }]),
  };
  return chain;
}

function throwingResolver(code: string) {
  return async () => {
    const err = new Error(`mock ${code}`) as Error & { code: string };
    err.code = code;
    throw err;
  };
}

describe("hashEmail", () => {
  it("normalises before hashing, so case and padding are the same identity", () => {
    expect(hashEmail("  Person@Example.COM ")).toBe(hashEmail("person@example.com"));
  });

  it("is plain SHA-256 hex of the normalised address, matching the SQL backfill", () => {
    // The backfill computes `encode(sha256(convert_to(lower(btrim(email)),
    // 'UTF8')), 'hex')` in Postgres. If the two ever diverge, every backfilled
    // row is keyed on a value this function will never produce and the
    // entitlement silently stops applying to the accounts it was created for.
    const expected = createHash("sha256").update("person@example.com").digest("hex");
    expect(hashEmail("Person@Example.com")).toBe(expected);
    expect(hashEmail("a@b.com")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not fold plus-addressing or dots into one identity", () => {
    // Deliberate: plus-addressing is a legitimate per-service alias, and the
    // observed abuse used eight genuinely distinct local parts anyway.
    expect(hashEmail("a+1@gmail.com")).not.toBe(hashEmail("a@gmail.com"));
    expect(hashEmail("a.b@gmail.com")).not.toBe(hashEmail("ab@gmail.com"));
  });

  it("normaliseEmail trims and lower-cases and does nothing else", () => {
    expect(normaliseEmail(" A.B+c@Example.com ")).toBe("a.b+c@example.com");
  });
});

describe("assessTrialGrant — the MX rule reads the error code, not just the failure", () => {
  const params = { email: "someone@example.org", ipHash: null, channel: "register" as const };

  it("refuses when the domain does not exist (ENOTFOUND)", async () => {
    // Measured against the real resolver: a nonexistent domain THROWS
    // ENOTFOUND, it does not resolve to []. A handler that catches every
    // resolver error permissively has therefore disabled this gate for the
    // exact case it exists to catch.
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: throwingResolver("ENOTFOUND"),
    });
    expect(result).toMatchObject({ decision: "refuse", reason: "no_mail_exchanger" });
  });

  it("refuses when the domain exists but has no MX (ENODATA)", async () => {
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: throwingResolver("ENODATA"),
    });
    expect(result).toMatchObject({ decision: "refuse", reason: "no_mail_exchanger" });
  });

  it("refuses an RFC 7505 null MX", async () => {
    // A single MX with an empty exchange is the domain explicitly declaring it
    // accepts no mail. A `length === 0` check accepts it happily.
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: async () => [{ exchange: "" }],
    });
    expect(result).toMatchObject({ decision: "refuse", reason: "no_mail_exchanger" });
  });

  it("refuses an empty answer", async () => {
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: async () => [],
    });
    expect(result).toMatchObject({ decision: "refuse", reason: "no_mail_exchanger" });
  });

  it("grants through a resolver timeout — an outage must not stop signups", async () => {
    // The other half of the rule, and the reason the pre-WP11 shape was wrong
    // in the opposite direction: `.catch(() => [])` fed a length check, so any
    // resolver blip refused every registration.
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: throwingResolver("ETIMEOUT"),
    });
    expect(result).toMatchObject({ decision: "grant", grantCents: TRIAL_CREDITS_CENTS });
  });

  it("grants through a SERVFAIL", async () => {
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: throwingResolver("ESERVFAIL"),
    });
    expect(result.decision).toBe("grant");
  });

  it("grants for a domain with a real mail exchanger", async () => {
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: async () => [{ exchange: "mx.example.org" }],
    });
    expect(result).toMatchObject({ decision: "grant", grantCents: 200 });
  });
});

describe("assessTrialGrant — disposable domains refuse before any lookup", () => {
  it("refuses a known disposable domain without consulting DNS", async () => {
    let called = false;
    const result = await assessTrialGrant(
      emptyDb(),
      { email: "someone@mailinator.com", ipHash: null, channel: "register" },
      {
        resolveMx: async () => {
          called = true;
          return [{ exchange: "mx.mailinator.com" }];
        },
      },
    );
    expect(result).toMatchObject({ decision: "refuse", reason: "disposable_domain" });
    expect(called).toBe(false);
  });
});
