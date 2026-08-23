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
  emailDomain,
  hashEmail,
  MAX_EMAIL_LENGTH,
  normaliseEmail,
  trialRateBucket,
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
      resolveAddresses: async () => ["93.184.216.34"],
    });
    expect(result).toMatchObject({ decision: "refuse", reason: "no_mail_exchanger" });
  });

  it("grants when the domain has no MX but does have address records (RFC 5321 implicit MX)", async () => {
    // The correction that matters most in practice. `ENODATA` means the domain
    // exists and publishes no MX, which RFC 5321 5.1 says is a domain with an
    // IMPLICIT MX at its address record — such domains do receive mail.
    // `strale.dev` is one of them: A records, no MX. Treating ENODATA as
    // authoritative refused registration to anyone at our own domain, and to
    // every small operator running an MTA on their web host.
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: throwingResolver("ENODATA"),
      resolveAddresses: async () => ["93.184.216.34"],
    });
    expect(result).toMatchObject({ decision: "grant" });
  });

  it("refuses when the domain has neither an MX nor an address record", async () => {
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: throwingResolver("ENODATA"),
      resolveAddresses: async () => [],
    });
    expect(result).toMatchObject({ decision: "refuse", reason: "no_mail_exchanger" });
  });

  it("refuses an RFC 7505 null MX even when address records exist", async () => {
    // A single MX with an empty exchange is the domain explicitly declaring it
    // accepts no mail, which overrides the implicit-MX fallback. A
    // `length === 0` check accepts it happily.
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: async () => [{ exchange: "" }],
      resolveAddresses: async () => ["93.184.216.34"],
    });
    expect(result).toMatchObject({ decision: "refuse", reason: "no_mail_exchanger" });
  });

  it("falls back to address records on an empty MX answer", async () => {
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: async () => [],
      resolveAddresses: async () => [],
    });
    expect(result).toMatchObject({ decision: "refuse", reason: "no_mail_exchanger" });
  });

  it("does not refuse when the address lookup itself fails", async () => {
    // An unanswered question is not an answer. The fallback failing is a
    // resolver problem, not evidence about the domain.
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: async () => [],
      resolveAddresses: throwingResolver("ESERVFAIL"),
    });
    expect(result.decision).toBe("grant");
  });

  it("grants through a resolver timeout — an outage must not stop signups", async () => {
    // The other half of the rule, and the reason the pre-WP11 shape was wrong
    // in the opposite direction: `.catch(() => [])` fed a length check, so any
    // resolver blip refused every registration.
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: throwingResolver("ETIMEOUT"),
      resolveAddresses: async () => [],
    });
    expect(result).toMatchObject({ decision: "grant", grantCents: TRIAL_CREDITS_CENTS });
  });

  it("grants through a SERVFAIL", async () => {
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: throwingResolver("ESERVFAIL"),
      resolveAddresses: async () => [],
    });
    expect(result.decision).toBe("grant");
  });

  it("grants for a domain with a real mail exchanger", async () => {
    const result = await assessTrialGrant(emptyDb(), params, {
      resolveMx: async () => [{ exchange: "mx.example.org" }],
      resolveAddresses: async () => [],
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

describe("emailDomain — the delivery domain is after the LAST @", () => {
  it("reads the real delivery domain of a two-at address", () => {
    // `split("@")[1]`, which both handlers used, hands the gates `gmail.com`
    // for an address delivered to `mailinator.com`. Measured against this
    // module before the fix: that address returned a 200-cent grant.
    expect(emailDomain("a@gmail.com@mailinator.com")).toBe("mailinator.com");
  });

  it("reads an ordinary address normally", () => {
    expect(emailDomain("person@example.org")).toBe("example.org");
  });

  it("returns empty for an address with no usable domain", () => {
    expect(emailDomain("no-at-sign")).toBe("");
    expect(emailDomain("@example.org")).toBe("");
    expect(emailDomain("person@")).toBe("");
  });
});

describe("assessTrialGrant — malformed and oversized addresses", () => {
  const deps = {
    resolveMx: async () => [{ exchange: "mx.example.org" }],
    resolveAddresses: async () => [],
  };

  it("refuses a two-at address whose real domain is disposable", () => {
    return expect(
      assessTrialGrant(
        emptyDb(),
        { email: "a@gmail.com@mailinator.com", ipHash: null, channel: "register" },
        deps,
      ),
    ).resolves.toMatchObject({ decision: "refuse", reason: "disposable_domain" });
  });

  it("refuses an address longer than the column can hold", () => {
    // `users.email` is varchar(255). A longer address reaches the INSERT and
    // raises Postgres 22001, which is not a unique violation, so it propagates
    // as a 500 rather than a 400.
    const long = `${"a".repeat(MAX_EMAIL_LENGTH)}@example.org`;
    return expect(
      assessTrialGrant(emptyDb(), { email: long, ipHash: null, channel: "register" }, deps),
    ).resolves.toMatchObject({ decision: "refuse", reason: "malformed_address" });
  });

  it("refuses an address with no domain part", () => {
    return expect(
      assessTrialGrant(emptyDb(), { email: "person@", ipHash: null, channel: "register" }, deps),
    ).resolves.toMatchObject({ decision: "refuse", reason: "malformed_address" });
  });
});

describe("trialRateBucket — IPv6 counts by /64", () => {
  it("counts an IPv4 address as itself", () => {
    expect(trialRateBucket("203.0.113.7")).toBe("203.0.113.7");
  });

  it("collapses an IPv6 /64 to one bucket", () => {
    // Every mainstream VPS and most home connections get a whole /64, so
    // counting v6 addresses individually hands a farmer 2^64 free buckets and
    // the cap never fires at all.
    const a = trialRateBucket("2001:db8:1234:5678:1::1");
    const b = trialRateBucket("2001:db8:1234:5678:ffff:ffff:ffff:ffff");
    expect(a).toBe(b);
    expect(a).toBe("2001:0db8:1234:5678::/64");
  });

  it("does not collapse different /64s", () => {
    expect(trialRateBucket("2001:db8:1234:5678::1")).not.toBe(
      trialRateBucket("2001:db8:1234:9999::1"),
    );
  });

  it("gives the compressed and expanded forms of one prefix the same bucket", () => {
    expect(trialRateBucket("2001:db8::1")).toBe(
      trialRateBucket("2001:0db8:0000:0000:0000:0000:0000:0001"),
    );
  });

  it("ignores a zone id", () => {
    expect(trialRateBucket("fe80::1%eth0")).toBe(trialRateBucket("fe80::1"));
  });

  it("returns null for an unusable address rather than inventing a bucket", () => {
    expect(trialRateBucket("unknown")).toBeNull();
    expect(trialRateBucket("")).toBeNull();
    expect(trialRateBucket("2001:db8::1::2")).toBeNull();
    expect(trialRateBucket("not:an:address")).toBeNull();
  });

  it("rejects junk in a TRAILING hextet, not only in the prefix", () => {
    // Validating the first four alone accepts something that is not an address
    // and hands back a bucket for it.
    expect(trialRateBucket("2001:0db8:0000:0000:0000:0000:0000:zzzz")).toBeNull();
  });

  it("treats an IPv4-mapped address as the IPv4 client it is", () => {
    // Every leading hextet of `::ffff:a.b.c.d` is zero, so expanding it puts
    // EVERY IPv4-mapped client into one /64 bucket — the sixth unrelated
    // registrant behind it would be refused a grant. Node reports exactly this
    // form for every IPv4 peer on a dual-stack listener.
    expect(trialRateBucket("::ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(trialRateBucket("::ffff:5.6.7.8")).toBe("5.6.7.8");
    expect(trialRateBucket("::ffff:1.2.3.4")).not.toBe(trialRateBucket("::ffff:5.6.7.8"));
  });

  it("gives an IPv4-mapped address the same bucket as its plain form", () => {
    expect(trialRateBucket("::ffff:203.0.113.7")).toBe(trialRateBucket("203.0.113.7"));
    expect(trialRateBucket("::FFFF:203.0.113.7")).toBe(trialRateBucket("203.0.113.7"));
  });

  it("handles the deprecated IPv4-compatible form too", () => {
    expect(trialRateBucket("::1.2.3.4")).toBe("1.2.3.4");
  });

  it("handles the HEX spelling of an IPv4-mapped address, which is the reachable one", () => {
    // `IPV6_RE` in middleware.ts is /^[0-9a-fA-F:]{2,45}$/ — it REJECTS the
    // dotted form and ACCEPTS this one, so catching only the readable spelling
    // of the bypass was not catching it.
    expect(trialRateBucket("::ffff:0102:0304")).toBe("1.2.3.4");
    expect(trialRateBucket("::ffff:0506:0708")).toBe("5.6.7.8");
    expect(trialRateBucket("::ffff:0102:0304")).not.toBe(trialRateBucket("::ffff:0506:0708"));
  });

  it("gives the hex and dotted spellings of one address the same bucket", () => {
    expect(trialRateBucket("::ffff:0102:0304")).toBe(trialRateBucket("::ffff:1.2.3.4"));
  });

  it("counts a trailing dotted quad as the two hextets it occupies", () => {
    // `0:0:0:0:0:ffff:1.2.3.4` used to parse as seven hextets and return null,
    // i.e. no bucket and no cap for a perfectly valid form.
    expect(trialRateBucket("0:0:0:0:0:ffff:1.2.3.4")).toBe("1.2.3.4");
    expect(trialRateBucket("2001:db8::1.2.3.4")).toBe("2001:0db8:0000:0000::/64");
  });

  it("separates the RFC 2765 translated form, which IPV6_RE also admits", () => {
    // `::ffff:0:a.b.c.d` puts the ffff marker at hextet 4, not 5. Checking only
    // the first five hextets caught `::ffff:1.2.3.4` and let this spelling fall
    // through to the all-zero /64 — five unrelated clients arriving this way
    // shared one bucket and the sixth was refused its grant.
    expect(trialRateBucket("::ffff:0:102:304")).toBe("1.2.3.4");
    expect(trialRateBucket("::ffff:0:506:708")).toBe("5.6.7.8");
    expect(trialRateBucket("0:0:0:0:ffff:0:102:304")).toBe("1.2.3.4");
    expect(trialRateBucket("::ffff:0:102:304")).not.toBe(trialRateBucket("::ffff:0:506:708"));
  });

  it("parses an IPv4 address rather than trusting the string", () => {
    // The v4 branch returned its input verbatim, so junk became a bucket and
    // one address had three spellings — all of which getClientIp admits.
    expect(trialRateBucket("abcd")).toBeNull();
    expect(trialRateBucket("999.999.999.999")).toBeNull();
    expect(trialRateBucket("1.2.3")).toBeNull();
    expect(trialRateBucket("1.2.3.4.5")).toBeNull();
    expect(trialRateBucket("01.2.3.4")).toBe("1.2.3.4");
    expect(trialRateBucket("001.002.003.004")).toBe("1.2.3.4");
  });

  it("refuses malformed IPv6 rather than inventing a bucket for it", () => {
    // `::` must stand for at least one zero hextet, and an address does not
    // end in a bare colon. Both used to return a plausible-looking /64.
    expect(trialRateBucket("1:2:3:4::5:6:7:8")).toBeNull();
    expect(trialRateBucket("2001:db8::1:")).toBeNull();
  });

  it("gives the unspecified and loopback addresses no bucket at all", () => {
    // They are not a client's public address, and the all-zero prefix they
    // expand to would otherwise be a bucket shared with everything else that
    // expands to zeros.
    expect(trialRateBucket("::")).toBeNull();
    expect(trialRateBucket("::1")).toBeNull();
    expect(trialRateBucket("0:0:0:0:0:0:0:1")).toBeNull();
  });
});
