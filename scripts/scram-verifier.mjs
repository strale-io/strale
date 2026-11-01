import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";

/**
 * The SCRAM-SHA-256 verifier Postgres stores for a role password.
 *
 * Its own module so a test can exercise it: `provision-verify-role.mjs` runs
 * on import (it prompts, then performs production DDL), so importing that file
 * to reach this function is not an option — and a hand-rolled crypto routine
 * with no test is exactly what a reviewer should refuse.
 *
 * Computing the verifier locally means the plaintext password never crosses
 * the wire and never reaches a Postgres statement log, which Railway retains
 * and shows in its dashboard.
 *
 * RFC 5802 / RFC 7677, and Postgres's stored format:
 *   SaltedPassword = PBKDF2-HMAC-SHA256(password, salt, i, dkLen = 32)
 *   ClientKey      = HMAC(SaltedPassword, "Client Key")
 *   StoredKey      = SHA256(ClientKey)
 *   ServerKey      = HMAC(SaltedPassword, "Server Key")
 *   SCRAM-SHA-256$<i>:<b64 salt>$<b64 StoredKey>:<b64 ServerKey>
 *
 * No SASLprep normalisation: the generated password is ASCII [A-Za-z0-9_-], so
 * it is a no-op there. A human-chosen non-ASCII password would need it, which
 * is why nothing but the generator should call this.
 */
export function scramVerifier(password, iterations = 4096, saltOverride = null) {
  const salt = saltOverride ?? randomBytes(16);
  const saltedPassword = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", saltedPassword).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", saltedPassword).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}
