/**
 * Child process for the hard-kill crash test (WP1).
 *
 * Run by `do.crash-recovery.integration.test.ts` via tsx. It drives the REAL
 * `/v1/do` async path — real auth middleware, real wallet transaction, real
 * route code — and then SIGKILLs itself while the capability is still
 * executing. That models an OOM kill or a Railway container replacement, which
 * is the window the platform actually loses money in. A graceful SIGTERM is
 * drained by lib/shutdown.ts; SIGKILL is not, and cannot be.
 *
 * Nothing about billing is reimplemented here. The point of the test is that
 * production code commits the debit, so a test-local copy of that logic would
 * prove nothing (WP1 explicitly forbids test-only duplicate billing logic).
 *
 * Contract with the parent: print CHILD_DEBITED once the platform has
 * responded 202 (debit committed, execution in flight), then die instantly.
 *
 * console.* is deliberate here and allowlisted in
 * scripts/console-allowlist.json. stdout IS the protocol with the parent
 * process — the structured logger writes shaped JSON to a different sink, and
 * this process is about to SIGKILL itself, so anything buffered or asynchronous
 * would never be flushed. The F-0-014 rule targets application logging, which
 * this is not.
 */

import { randomUUID } from "node:crypto";

const databaseUrl = process.env.CRASH_TEST_DATABASE_URL;
const apiKey = process.env.CRASH_TEST_API_KEY;
const slug = process.env.CRASH_TEST_SLUG;

if (!databaseUrl || !apiKey || !slug) {
  console.error("crash-child: missing CRASH_TEST_* environment");
  process.exit(2);
}

process.env.DATABASE_URL = databaseUrl;
process.env.FRONTEND_URL ??= "https://strale.dev";
process.env.AUDIT_HMAC_SECRET ??= "wp1-crash-child-secret-at-least-32-chars-long";
process.env.ADMIN_SECRET ??= "wp1-crash-child-admin-secret-at-least-32-chars";
process.env.STRIPE_SECRET_KEY ??= "sk_test_wp1_placeholder";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_wp1_placeholder";

const { registerCapability } = await import("../capabilities/index.js");

// Never resolves. The process is killed while this is pending, which is
// precisely the state a crash mid-execution leaves behind.
registerCapability(slug, () => new Promise(() => {}));

const { app } = await import("../app.js");

const res = await app.request("http://localhost/v1/do", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "Idempotency-Key": randomUUID(),
  },
  body: JSON.stringify({
    capability_slug: slug,
    inputs: { probe: "wp1-crash" },
    max_price_cents: 500,
  }),
});

// 202 means the wallet debit has committed and execution was handed to the
// in-memory background task — the exact point after which a crash strands the
// charge. Anything else means the test never reached the window it targets.
if (res.status !== 202) {
  console.error(`crash-child: expected 202, got ${res.status}`);
  console.error(await res.text());
  process.exit(3);
}

console.log("CHILD_DEBITED");

// Flush stdout before dying — SIGKILL gives no chance to drain buffers.
await new Promise((resolve) => setTimeout(resolve, 50));

process.kill(process.pid, "SIGKILL");
