/**
 * The single assumption everything rests on: a Claude session cannot mint the
 * approval it is supposed to prove.
 *
 * These tests generate a real ed25519 keypair, install the public half the way
 * the founder would, and then try — with full filesystem access, the whole
 * environment, and the module's own source — to produce a grant that verifies.
 * A test suite that only checked the happy path would be checking that
 * signatures work, which nobody doubts.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPairSync, sign as edSign, createPrivateKey } from "node:crypto";

import {
  AUTONOMOUS_PURPOSES,
  ProductionAuthorityError,
  assertCannotMintGrants,
  autonomousAuthority,
  describeAuthority,
  parseGrantToken,
  productionWriteUrl,
  requireFounderGrant,
  FOUNDER_GRANT_PUBLIC_KEY_PEM,
} from "./production-authority.js";

let publicPem: string;
let privateKeyPem: string;

/** Mint a grant the way the founder's offline tool does. */
function mint(
  purpose: string,
  expiresAtEpochSeconds: number,
  grantId = "g1",
  keyPem = privateKeyPem,
): string {
  const payload = ["v1", grantId, purpose, String(expiresAtEpochSeconds)].join("|");
  const sig = edSign(null, Buffer.from(payload, "utf8"), createPrivateKey(keyPem));
  return ["v1", grantId, purpose, String(expiresAtEpochSeconds), sig.toString("base64url")].join(".");
}

const FUTURE = Math.floor(Date.now() / 1000) + 600;
const PAST = Math.floor(Date.now() / 1000) - 60;

beforeAll(() => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
});

/**
 * The module reads its public key from a committed constant, so tests inject
 * one by re-implementing the verification call with an installed key. Rather
 * than mock the module, exercise `requireFounderGrant` against a temporary copy
 * of the module source with the key filled in — which also proves the constant
 * is the thing being consulted.
 */
async function withInstalledKey<T>(
  pem: string,
  fn: (mod: typeof import("./production-authority.js")) => T | Promise<T>,
): Promise<T> {
  const { readFileSync, writeFileSync, rmSync } = await import("node:fs");
  const { join } = await import("node:path");
  const src = join(import.meta.dirname, "production-authority.ts");
  const tmp = join(import.meta.dirname, `production-authority.__key-${process.pid}.ts`);
  const body = readFileSync(src, "utf8").replace(
    'export const FOUNDER_GRANT_PUBLIC_KEY_PEM = "";',
    `export const FOUNDER_GRANT_PUBLIC_KEY_PEM = ${JSON.stringify(pem)};`,
  );
  writeFileSync(tmp, body, "utf8");
  try {
    return await fn(await import(/* @vite-ignore */ `./${tmp.split(/[\\/]/).pop()}`));
  } finally {
    rmSync(tmp, { force: true });
  }
}

describe("a session cannot grant itself permission", () => {
  it("refuses every founder-gated action while no public key is installed", () => {
    // The shipped state. A gate whose key has not been set must not open, and
    // the freeze depends on this being the default rather than an oversight.
    expect(FOUNDER_GRANT_PUBLIC_KEY_PEM).toBe("");
    expect(() =>
      requireFounderGrant("close_stranded_executing_rows", {
        env: { STRALE_FOUNDER_GRANT: "v1.g1.close_stranded_executing_rows.99999999999.AAAA" },
      }),
    ).toThrow(/No founder grant public key is installed/);
  });

  it("rejects a grant signed by a key that is not the founder's", async () => {
    // The whole threat model in one test. A session with full access can
    // generate a perfectly valid ed25519 keypair and sign anything it likes —
    // and it gets nowhere, because verification uses a key it does not have.
    const attacker = generateKeyPairSync("ed25519");
    const forged = mint(
      "close_stranded_executing_rows",
      FUTURE,
      "self-issued",
      attacker.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    );
    await withInstalledKey(publicPem, (mod) => {
      expect(() =>
        mod.requireFounderGrant("close_stranded_executing_rows", {
          env: { STRALE_FOUNDER_GRANT: forged },
        }),
      ).toThrow(/signature does not verify/);
    });
  });

  it("refuses to run at all where a signing key is reachable", () => {
    // If a private key is in the environment then a verified grant proves
    // nothing, and issuing authority records that LOOK trustworthy is worse
    // than refusing.
    for (const k of [
      "STRALE_FOUNDER_GRANT_PRIVATE_KEY",
      "STRALE_FOUNDER_GRANT_SECRET",
      "STRALE_FOUNDER_GRANT_SIGNING_KEY",
    ]) {
      expect(() => assertCannotMintGrants({ [k]: "anything" })).toThrow(
        /can mint founder grants/,
      );
    }
    expect(() => assertCannotMintGrants({ DATABASE_URL: "postgres://x" })).not.toThrow();
  });
});

describe("a grant authorises one action, once, briefly", () => {
  it("refuses a grant issued for a different purpose", async () => {
    // The 2026-08-22 incident, reduced to an assertion. A real instruction to
    // investigate one alert was stretched to cover an irreversible write for a
    // different one, because nothing tied an approval to its action.
    const grant = mint("investigate_starve_set_1", FUTURE);
    await withInstalledKey(publicPem, (mod) => {
      expect(() =>
        mod.requireFounderGrant("close_stranded_executing_rows", {
          env: { STRALE_FOUNDER_GRANT: grant },
        }),
      ).toThrow(/authorises 'investigate_starve_set_1', not 'close_stranded_executing_rows'/);
    });
  });

  it("refuses an expired grant", async () => {
    const grant = mint("close_stranded_executing_rows", PAST);
    await withInstalledKey(publicPem, (mod) => {
      expect(() =>
        mod.requireFounderGrant("close_stranded_executing_rows", {
          env: { STRALE_FOUNDER_GRANT: grant },
        }),
      ).toThrow(/expired at/);
    });
  });

  it("refuses when no grant is supplied at all", async () => {
    await withInstalledKey(publicPem, (mod) => {
      expect(() =>
        mod.requireFounderGrant("close_stranded_executing_rows", { env: {} }),
      ).toThrow(/founder-gated and no grant was supplied/);
    });
  });

  it("accepts a valid, unexpired, purpose-matched grant", async () => {
    const grant = mint("close_stranded_executing_rows", FUTURE, "grant-7");
    await withInstalledKey(publicPem, (mod) => {
      const authority = mod.requireFounderGrant("close_stranded_executing_rows", {
        env: { STRALE_FOUNDER_GRANT: grant },
      });
      expect(authority.kind).toBe("FOUNDER_GATED");
      expect(mod.describeAuthority(authority)).toMatchObject({
        authority_kind: "FOUNDER_GATED",
        authority_grant_id: "grant-7",
        authority_purpose: "close_stranded_executing_rows",
      });
    });
  });

  it("cannot be re-segmented into a different grant with the same signature", () => {
    // The token separator is '.' and the signed payload is joined with '|'. If
    // both used '.', then `v1.a.b.c.<sig>` and a token that splits the same
    // bytes differently would sign identically, and a purpose could be moved
    // into a grantId. Pin the shape rather than trusting the reading.
    const parsed = parseGrantToken(mint("some_purpose", FUTURE, "abc"));
    expect(parsed.signedPayload).toBe(`v1|abc|some_purpose|${FUTURE}`);
    expect(parsed.signedPayload).not.toContain(".");
  });
});

describe("delegated actions are a closed list", () => {
  it("refuses a free-text purpose dressed up as delegated", () => {
    // A caller cannot declare its own action delegated. The delegation boundary
    // moves by merge, not by a session's reading of the escalation contract --
    // which is precisely what went wrong.
    expect(() =>
      autonomousAuthority("close_stranded_executing_rows" as never, "DEC-20260812-A"),
    ).toThrow(/not a delegated action/);
  });

  it("accepts the delegated ones and records the policy that delegated them", () => {
    for (const p of AUTONOMOUS_PURPOSES) {
      const a = autonomousAuthority(p, "DEC-20260812-A");
      expect(describeAuthority(a)).toMatchObject({
        authority_kind: "AUTONOMOUS_POLICY",
        authority_policy: "DEC-20260812-A",
        authority_purpose: p,
      });
    }
  });
});

describe("write credentials are separate from authority", () => {
  it("refuses a write credential with no authority", () => {
    expect(() => productionWriteUrl(undefined as never)).toThrow(
      ProductionAuthorityError,
    );
  });

  it("reports the absent write credential as the normal state, not an error to fix", async () => {
    // An autonomous session holding no write credential is the DESIGN. The
    // message has to say so, or the next session will read it as breakage and
    // go looking for the writable URL until it finds one.
    const saved = process.env.DATABASE_URL_WRITE;
    delete process.env.DATABASE_URL_WRITE;
    try {
      expect(() =>
        productionWriteUrl(autonomousAuthority("fixture_refresh", "DEC-20260812-A")),
      ).toThrow(/default and correct state for an autonomous session/);
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL_WRITE = saved;
    }
  });
});
