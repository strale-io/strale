/**
 * Credit a wallet for local testing.
 *
 * Rewritten in WP1 (risk N7). The previous version was a live footgun:
 *
 *   - it loaded the repo-root .env, whose DATABASE_URL points at PRODUCTION;
 *   - it wrote an ABSOLUTE balance (`balanceCents: 5000`), so running it
 *     against prod would overwrite a real customer's balance rather than add
 *     to it, and would clobber any concurrent debit;
 *   - it wrote no `wallet_transactions` row, so the ledger stopped summing to
 *     the balance — permanently, and silently, on a platform whose product is
 *     an audit trail;
 *   - it hardcoded a single user UUID, so the target was invisible at the call
 *     site.
 *
 * All four are fixed here. The target must be loopback unless explicitly
 * overridden, the credit is an increment, a ledger row is always written in
 * the same transaction, and the user and amount are arguments.
 *
 * Usage:
 *   npx tsx scripts/topup-test.ts --user <uuid> --amount <cents>
 *   npx tsx scripts/topup-test.ts --user <uuid> --amount 5000 --i-know-this-is-not-local
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { assertLoopbackDatabaseUrl } from "../src/test-support/integration-db.js";
import * as walletService from "../src/lib/wallet-service.js";

config({ path: resolve(import.meta.dirname, "../../../.env") });

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const userId = arg("user");
const amountCents = Number(arg("amount"));
const overrideLocalCheck = process.argv.includes("--i-know-this-is-not-local");

if (!userId || !Number.isInteger(amountCents) || amountCents <= 0) {
  console.error(
    "Usage: npx tsx scripts/topup-test.ts --user <uuid> --amount <positive integer cents>",
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// The root .env holds the production URL, so the default has to be refusal.
// The override exists because comping a hosted test account is a legitimate
// thing to want; it just should not be the accidental default.
if (!overrideLocalCheck) {
  try {
    assertLoopbackDatabaseUrl(databaseUrl);
  } catch {
    const host = (() => {
      try {
        return new URL(databaseUrl).hostname;
      } catch {
        return "unknown";
      }
    })();
    console.error(
      `Refusing to credit a wallet on "${host}" — this script defaults to a ` +
        "local database because the repo-root .env points at production.\n" +
        "If you really mean to credit an account on that host, re-run with " +
        "--i-know-this-is-not-local.",
    );
    process.exit(1);
  }
}

const { getDb } = await import("../src/db/index.js");

const db = getDb();

const balance = await db.transaction(async (tx) => {
  // WP2: goes through the wallet service like every other balance change. An
  // operational script is still a write path, and a script that reimplements
  // the ledger pairing is exactly how a second authority reappears.
  const wallet = await walletService.lockWalletForUser(tx, userId);
  if (!wallet) throw new Error(`No wallet found for user ${userId}`);

  await walletService.credit(tx, {
    walletId: wallet.id,
    amountCents,
    type: "top_up",
    description: "Manual test top-up (scripts/topup-test.ts)",
  });

  return wallet.balanceCents + amountCents;
});

console.log(
  `Credited ${amountCents} cents to ${userId}. New balance: ${balance} cents ` +
    `(EUR ${(balance / 100).toFixed(2)}).`,
);
process.exit(0);
