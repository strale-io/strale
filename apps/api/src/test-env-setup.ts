/**
 * Vitest setup file — runs before any test-file imports.
 *
 * Some modules (e.g. `lib/audit-token.ts`) validate required env vars at
 * module-load time via `requireAuditSecret()` (F-0-001). Setting the env
 * here guarantees every test file can import those modules directly
 * without a `beforeAll` dance.
 *
 * Values are test-only placeholders with enough entropy to pass the
 * ≥32-char check. They are never used against real prod data.
 */

process.env.AUDIT_HMAC_SECRET ??=
  "vitest-setup-audit-secret-plenty-of-entropy-0123456789abcdef";
process.env.ADMIN_SECRET ??=
  "vitest-setup-admin-secret-plenty-of-entropy-0123456789";
