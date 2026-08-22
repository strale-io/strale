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
// wallet.ts validates FRONTEND_URL at module-load time (F-0-015 — Stripe
// redirect URLs must come from a server-controlled var). Any test that
// imports app.ts transitively imports wallet.ts and crashes if the var
// is unset. Use the production frontend URL because audit-token.test
// asserts the shareable URL starts with https://strale.dev/audit/...
process.env.FRONTEND_URL ??= "https://strale.dev";

// ── Credential scrub (incident 2026-08-22: STARVE-SET-1) ────────────────────
//
// A test run emailed the production alert inbox a fabricated x402 settlement
// ("STARVE-SET-1", slug=real-cap, 99 cents) that read as a real customer losing
// real money. See lib/alerting.ts for the full account.
//
// The gate in sendAlert is the primary control. This is the second layer, and
// it is here because the two fail in different ways: the gate depends on
// correctly detecting a test runner, this depends on nothing at all. A worker
// with no key cannot email anyone even if the detection is wrong or a future
// caller reaches Resend by another path.
//
// `delete`, not `??=`. The whole failure mode is that the variable is ALREADY
// set — inherited from the shell, or loaded from the repo-root .env by any of
// the ~30 modules that run dotenv.config() at import time. A default-if-unset
// would leave the live key exactly where it did the damage.
//
// NODE_ENV is asserted rather than defaulted for the same reason: a shell that
// exported NODE_ENV=production would otherwise carry that into the suite and
// switch on production-only behaviour underneath every test.
delete process.env.RESEND_API_KEY;
delete process.env.BETTER_STACK_SOURCE_TOKEN;
process.env.NODE_ENV = "test";
