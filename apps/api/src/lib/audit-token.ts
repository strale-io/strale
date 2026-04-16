import { createHmac, timingSafeEqual } from "node:crypto";

// F-0-001: fail-fast on a missing secret instead of falling back to a
// committed default. A hardcoded default lets anyone forge `/audit/:id?token=...`
// URLs, undermining the EU AI Act / GDPR compliance story those URLs anchor.
// Exported so tests can cover the assertion without having to dynamically
// re-import the module (Vite's dynamic-import literal restriction makes
// cache-busting imports impractical). The parameter is required — callers
// must decide what env value to pass.
export function requireAuditSecret(env: string | undefined): string {
  if (!env || env.length < 32) {
    throw new Error(
      "AUDIT_HMAC_SECRET is required and must be at least 32 characters. " +
        "Generate with: openssl rand -hex 32",
    );
  }
  return env;
}
const AUDIT_SECRET: string = requireAuditSecret(process.env.AUDIT_HMAC_SECRET);

export function generateAuditToken(transactionId: string): string {
  return createHmac("sha256", AUDIT_SECRET)
    .update(transactionId)
    .digest("hex")
    .substring(0, 32);
}

export function verifyAuditToken(transactionId: string, token: string): boolean {
  const expected = generateAuditToken(transactionId);
  // F-0-001: constant-time comparison to prevent timing-oracle leaks of the
  // HMAC secret via byte-by-byte inequality. `timingSafeEqual` throws on
  // length mismatch so we length-check first.
  let expectedBuf: Buffer;
  let tokenBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expected, "hex");
    tokenBuf = Buffer.from(token, "hex");
  } catch {
    return false;
  }
  if (tokenBuf.length === 0 || tokenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(tokenBuf, expectedBuf);
}

export function getShareableUrl(transactionId: string): string {
  const token = generateAuditToken(transactionId);
  return `https://strale.dev/audit/${transactionId}?token=${token}`;
}
