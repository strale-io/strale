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

// F-A-007: optional rotation fallback. When set, `verifyAuditToken`
// tries it after the primary key fails. Intended for a ~60-day grace
// window during secret rotation. Unset/empty disables the fallback path.
// If set, must meet the same ≥32-char hardening as the primary — a short
// rotation key is usually a copy-paste accident, surface it loudly.
// See docs/operations/hmac-rotation.md.
export function requireAuditSecretPrevious(env: string | undefined): string | null {
  if (!env) return null;
  if (env.length < 32) {
    throw new Error(
      "AUDIT_HMAC_SECRET_PREVIOUS, when set, must be at least 32 characters. " +
        "Unset the env var to disable the fallback path.",
    );
  }
  return env;
}

const AUDIT_SECRET: string = requireAuditSecret(process.env.AUDIT_HMAC_SECRET);
const AUDIT_SECRET_PREVIOUS: string | null = requireAuditSecretPrevious(
  process.env.AUDIT_HMAC_SECRET_PREVIOUS,
);

// F-A-006: default token TTL. 90 days balances compliance-archive stability
// against leaked-URL blast radius. Callers can override (e.g. re-issue
// endpoint accepts 1-365 days).
export const DEFAULT_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

// F-A-006 backwards-compat: tokens issued before this deploy carry no
// expires_at query param. `verifyLegacyToken` accepts them under the old
// algorithm (HMAC(SECRET, txnId) with no time component) until the sunset
// date. Set to 180 days from 2026-04-20 → 2026-10-17 UTC. After this,
// legacy tokens return 410 / legacy_token_sunset and callers must
// re-issue via POST /v1/transactions/:id/audit-token.
export const LEGACY_TOKEN_SUNSET_MS = Date.UTC(2026, 9, 17); // Oct 17, 2026

export type VerifyResult =
  | { valid: true; legacy?: true; usedFallback?: true }
  | {
      valid: false;
      reason: "expired" | "invalid_signature" | "legacy_token_sunset" | "malformed";
    };

// F-A-006: token format is `HMAC-SHA256(secret, `${txnId}:${expiresAt}`).hex[:32]`.
// expiresAt is unix seconds. Caller surfaces it separately (as a query param).
export function generateAuditToken(
  transactionId: string,
  expiresInSeconds: number = DEFAULT_TOKEN_TTL_SECONDS,
): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${transactionId}:${expiresAt}`;
  const token = createHmac("sha256", AUDIT_SECRET)
    .update(payload)
    .digest("hex")
    .substring(0, 32);
  return { token, expiresAt };
}

// F-A-006 + F-A-007: verify with expiry check and two-key ring fallback.
// If expiresAt is null, delegate to the legacy path (pre-F-A-006 tokens).
// Public wrapper; delegates to a pure helper that's exported for tests
// that need to inject specific primary/previous secrets (rotation coverage).
export function verifyAuditToken(
  transactionId: string,
  token: string,
  expiresAt: number | null,
): VerifyResult {
  return verifyAuditTokenWithSecrets(
    transactionId,
    token,
    expiresAt,
    AUDIT_SECRET,
    AUDIT_SECRET_PREVIOUS,
    Date.now(),
  );
}

// Exported for unit tests. Takes the clock and both secrets explicitly
// so tests can exercise expiry, tampering, rotation, and legacy-sunset
// without reaching into module state.
export function verifyAuditTokenWithSecrets(
  transactionId: string,
  token: string,
  expiresAt: number | null,
  primarySecret: string,
  previousSecret: string | null,
  nowMs: number,
): VerifyResult {
  if (expiresAt == null) {
    return verifyLegacyToken(transactionId, token, primarySecret, previousSecret, nowMs);
  }

  if (!Number.isFinite(expiresAt) || !Number.isInteger(expiresAt)) {
    return { valid: false, reason: "malformed" };
  }
  const nowSeconds = Math.floor(nowMs / 1000);
  if (expiresAt < nowSeconds) {
    return { valid: false, reason: "expired" };
  }

  const payload = `${transactionId}:${expiresAt}`;
  const primary = signHex(payload, primarySecret);
  if (hmacCompareHex(token, primary)) {
    return { valid: true };
  }

  if (previousSecret) {
    const previous = signHex(payload, previousSecret);
    if (hmacCompareHex(token, previous)) {
      return { valid: true, usedFallback: true };
    }
  }

  return { valid: false, reason: "invalid_signature" };
}

// Legacy pre-F-A-006 verification: HMAC(SECRET, txnId) with no time
// component. Accepts only during the backwards-compat window; hard-fails
// after LEGACY_TOKEN_SUNSET_MS. Two-key fallback applies to legacy tokens
// during the window so a rotation can complete without breaking every
// pre-deploy URL.
function verifyLegacyToken(
  transactionId: string,
  token: string,
  primarySecret: string,
  previousSecret: string | null,
  nowMs: number,
): VerifyResult {
  if (nowMs >= LEGACY_TOKEN_SUNSET_MS) {
    return { valid: false, reason: "legacy_token_sunset" };
  }

  const primary = createHmac("sha256", primarySecret)
    .update(transactionId)
    .digest("hex")
    .substring(0, 32);
  if (hmacCompareHex(token, primary)) {
    return { valid: true, legacy: true };
  }

  if (previousSecret) {
    const previous = createHmac("sha256", previousSecret)
      .update(transactionId)
      .digest("hex")
      .substring(0, 32);
    if (hmacCompareHex(token, previous)) {
      return { valid: true, legacy: true, usedFallback: true };
    }
  }

  return { valid: false, reason: "invalid_signature" };
}

function signHex(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex").substring(0, 32);
}

// F-0-001: constant-time comparison to prevent timing-oracle leaks of
// the HMAC secret via byte-by-byte inequality. `timingSafeEqual` throws
// on length mismatch so we length-check first. Hex parse failures
// (e.g. the token contains non-hex chars) produce an empty buffer,
// which the length check rejects.
function hmacCompareHex(token: string, expected: string): boolean {
  let tokenBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    tokenBuf = Buffer.from(token, "hex");
    expectedBuf = Buffer.from(expected, "hex");
  } catch {
    return false;
  }
  if (tokenBuf.length === 0 || tokenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(tokenBuf, expectedBuf);
}

// F-A-006: returns both the URL and the expiry so callers can surface
// `expires_at` alongside the URL (e.g. in the POST /v1/do compliance block).
export function getShareableUrl(
  transactionId: string,
  expiresInSeconds: number = DEFAULT_TOKEN_TTL_SECONDS,
): { url: string; expiresAt: number } {
  const { token, expiresAt } = generateAuditToken(transactionId, expiresInSeconds);
  const url = `https://strale.dev/audit/${transactionId}?token=${token}&expires_at=${expiresAt}`;
  return { url, expiresAt };
}
