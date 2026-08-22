#!/usr/bin/env node
/**
 * Founder grant keys: generate a keypair, and sign one grant at a time.
 *
 * ── Read this first ─────────────────────────────────────────────────────────
 *
 * The private key must never exist on a machine a Claude session can reach, and
 * must never appear in any `.env`, any commit, or any file inside this
 * repository. The entire authorization model reduces to one property:
 *
 *     the platform can VERIFY a grant and cannot MINT one.
 *
 * `lib/production-authority.ts` enforces the second half at runtime — it refuses
 * to verify anything in a process where a signing-key variable is present,
 * because a grant checked by a process that could have forged it proves nothing.
 * This tool is the other side of that line, and it is meant to be run on the
 * founder's own machine, by the founder, and nowhere else.
 *
 * ── Generate (once) ─────────────────────────────────────────────────────────
 *
 *   node apps/api/scripts/gen-founder-keypair.mjs --generate --out ~/.strale-founder
 *
 * Writes the private key to <out>.key (mode 0600) and prints the public key.
 * Paste the public key into FOUNDER_GRANT_PUBLIC_KEY_PEM in
 * apps/api/src/lib/production-authority.ts and commit it. Committing the PUBLIC
 * key is correct and intended: it is the thing that must be tamper-evident.
 *
 * ── Sign one grant ──────────────────────────────────────────────────────────
 *
 *   node apps/api/scripts/gen-founder-keypair.mjs --sign \
 *     --key ~/.strale-founder.key --purpose wallet_topup --ttl 900
 *
 * Prints a token to pass as STRALE_FOUNDER_GRANT for exactly that one run.
 *
 * A grant names ONE purpose and expires. That is the control the 2026-08-22
 * incident lacked: an approval given for one action was treated as covering a
 * different, similar-looking one. Keep --ttl short. An approval is for a
 * moment, not a standing state.
 */

import { generateKeyPairSync, createPrivateKey, sign as edSign, randomUUID } from "node:crypto";
import { writeFileSync, readFileSync, chmodSync } from "node:fs";
import { argv, exit, platform } from "node:process";

function arg(name) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
}

function fail(msg) {
  console.error(`\n${msg}\n`);
  exit(1);
}

if (argv.includes("--generate")) {
  const out = arg("out");
  if (!out) fail("usage: --generate --out <path-prefix>   (private key -> <path>.key)");

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const privPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const pubPem = publicKey.export({ type: "spki", format: "pem" });

  const keyPath = `${out}.key`;
  writeFileSync(keyPath, privPem, { mode: 0o600 });
  // chmod is a no-op on Windows; say so rather than implying a guarantee.
  if (platform !== "win32") chmodSync(keyPath, 0o600);

  console.log(`\nPrivate key written to: ${keyPath}`);
  if (platform === "win32") {
    console.log(
      "NOTE: this is Windows — file mode 0600 was not applied. Restrict access\n" +
        "with ACLs, or better, generate this on a machine that is not the one\n" +
        "running Claude sessions.",
    );
  }
  console.log(
    "\nKEEP IT OFF THIS REPOSITORY AND OUT OF EVERY .env. If it ever lands in\n" +
      "an environment a session can read, every grant it has signed is void and\n" +
      "the key must be rotated.\n",
  );
  console.log("Paste this into FOUNDER_GRANT_PUBLIC_KEY_PEM in");
  console.log("apps/api/src/lib/production-authority.ts, then commit it:\n");
  console.log(JSON.stringify(pubPem.toString()));
  console.log("");
  exit(0);
}

if (argv.includes("--sign")) {
  const keyPath = arg("key");
  const purpose = arg("purpose");
  const ttl = Number(arg("ttl") ?? "900");

  if (!keyPath || !purpose) {
    fail("usage: --sign --key <path> --purpose <purpose> [--ttl <seconds, default 900>]");
  }
  if (!/^[a-z0-9_]+$/.test(purpose)) {
    fail(`purpose '${purpose}' must match /^[a-z0-9_]+$/ — it is matched EXACTLY against the action.`);
  }
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > 86_400) {
    fail("--ttl must be a positive integer of at most 86400 seconds. Short is the point.");
  }

  let key;
  try {
    key = createPrivateKey(readFileSync(keyPath, "utf8"));
  } catch (e) {
    fail(`could not read a private key from ${keyPath}: ${e.message}`);
  }

  const grantId = randomUUID().replace(/-/g, "").slice(0, 16);
  const expiry = Math.floor(Date.now() / 1000) + ttl;
  // Pipe-joined, matching parseGrantToken: the token's '.' separator must not
  // appear in the signed bytes, or a signature could be re-segmented into a
  // different (grantId, purpose, expiry) triple.
  const payload = ["v1", grantId, purpose, String(expiry)].join("|");
  const sig = edSign(null, Buffer.from(payload, "utf8"), key).toString("base64url");

  console.log(`\nGrant for '${purpose}', valid ${ttl}s (until ${new Date(expiry * 1000).toISOString()}):\n`);
  console.log(`STRALE_FOUNDER_GRANT='v1.${grantId}.${purpose}.${expiry}.${sig}'`);
  console.log(
    "\nThis authorises that ONE purpose. It does not cover a similar action, a\n" +
      "follow-up, or a retry after it expires.\n",
  );
  exit(0);
}

console.error(
  "usage:\n" +
    "  gen-founder-keypair.mjs --generate --out <path-prefix>\n" +
    "  gen-founder-keypair.mjs --sign --key <path> --purpose <purpose> [--ttl <seconds>]\n",
);
exit(2);
