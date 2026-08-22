/**
 * The signer and the verifier must agree, or the gate can never be opened.
 *
 * `gen-founder-keypair.mjs --sign` produces the token, and
 * `production-authority.ts` consumes it. They live in different files, were
 * written at different times, and share a wire format by convention: five
 * dot-separated fields, over a PIPE-joined signed payload. Nothing but a test
 * stops those drifting apart, and if they drift the failure is discovered on
 * the day the founder is trying to authorise something urgent.
 *
 * This generates a real keypair, signs a real grant with the real script, and
 * verifies it with the real parser and node's ed25519 — no fixtures, no
 * hand-written token that could encode the same misunderstanding twice.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createPublicKey, verify as edVerify } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  FOUNDER_GRANT_PUBLIC_KEY_PEM,
  parseGrantToken,
  ProductionAuthorityError,
} from "../src/lib/production-authority.js";

const SCRIPT = resolve(
  import.meta.dirname,
  "..",
  "scripts",
  "gen-founder-keypair.mjs",
);

let dir: string;
let publicKeyPem: string;

function run(...args: string[]): string {
  return execFileSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    stdio: "pipe",
  });
}

function sign(purpose: string, ttl = 900): string {
  const out = run("--sign", "--key", join(dir, "fk.key"), "--purpose", purpose, "--ttl", String(ttl));
  const m = out.match(/STRALE_FOUNDER_GRANT='([^']+)'/);
  if (!m) throw new Error(`no token in signer output:\n${out}`);
  return m[1];
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "grant-roundtrip-"));
  const out = run("--generate", "--out", join(dir, "fk"));
  // The script prints the PEM JSON-quoted, ready to paste into the source.
  const m = out.match(/"(-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----\\n)"/);
  if (!m) throw new Error(`no public key in generator output:\n${out}`);
  publicKeyPem = JSON.parse(`"${m[1]}"`);
}, 60_000);

afterAll(() => {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
});

describe("a signed grant round-trips", () => {
  it("the generator emits a key the verifier can load", () => {
    expect(() => createPublicKey(publicKeyPem)).not.toThrow();
  });

  it("a signed token parses and its signature verifies", () => {
    const token = sign("wallet_topup");
    const parsed = parseGrantToken(token);

    expect(parsed.purpose).toBe("wallet_topup");
    expect(parsed.expiresAtEpochSeconds * 1000).toBeGreaterThan(Date.now());

    const ok = edVerify(
      null,
      Buffer.from(parsed.signedPayload, "utf8"),
      createPublicKey(publicKeyPem),
      parsed.signature,
    );
    expect(ok, "signer and verifier disagree on the signed payload").toBe(true);
  }, 30_000);

  it("a token signed for one purpose does not verify as another", () => {
    // The purpose is inside the signed bytes, so re-labelling it breaks the
    // signature rather than merely failing a later string comparison. That is
    // the difference between a control and a convention.
    const token = sign("wallet_topup");
    const parsed = parseGrantToken(token);
    const tampered = parsed.signedPayload.replace(
      "wallet_topup",
      "seed_sellable_solutions",
    );

    const ok = edVerify(
      null,
      Buffer.from(tampered, "utf8"),
      createPublicKey(publicKeyPem),
      parsed.signature,
    );
    expect(ok).toBe(false);
  }, 30_000);

  it("the token separator cannot be smuggled into the signed payload", () => {
    // Signed payload is pipe-joined while the token is dot-joined, so a grant
    // cannot be re-segmented into a different (id, purpose, expiry) triple that
    // carries the same signature.
    const parsed = parseGrantToken(sign("wallet_topup"));
    expect(parsed.signedPayload).toContain("|");
    expect(parsed.signedPayload).not.toContain(".");
  }, 30_000);

  it("the signer refuses a purpose the parser would reject", () => {
    expect(() => sign("Wallet Topup")).toThrow();
  }, 30_000);

  it("a malformed token is rejected by the parser, not silently accepted", () => {
    expect(() => parseGrantToken("v1.only.three.parts")).toThrow(
      ProductionAuthorityError,
    );
    expect(() => parseGrantToken("garbage")).toThrow(ProductionAuthorityError);
  });
});

describe("the gate is closed until a key is installed", () => {
  it("no public key is committed yet, so founder-gated actions are refused", () => {
    // Deliberate current state, asserted so that installing a key is a visible,
    // reviewed change rather than something that quietly happened.
    expect(FOUNDER_GRANT_PUBLIC_KEY_PEM.trim()).toBe("");
  });
});
