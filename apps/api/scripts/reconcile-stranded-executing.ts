/**
 * Reconcile the 11 pre-reservation transactions stuck in `status='executing'`.
 *
 * NOT RUN AGAINST PRODUCTION. This script exists to be reviewed, then executed
 * once under an explicit founder approval, and it prints a full before/after
 * economic statement so the approval is given against numbers rather than prose.
 *
 * ── The founder policy this implements ──────────────────────────────────────
 *
 * "When successful billable delivery cannot be proven from durable evidence,
 *  resolve ambiguity in the customer's favour; do not create or preserve a
 *  charge based on inference."
 *
 * Applied to these rows, that is unambiguous. Every one has `output IS NULL`
 * and no error — there is no durable evidence that anything was delivered. So
 * no charge may stand, and the single row carrying one is refunded.
 *
 * Note what the policy forbids as much as what it requires: it forbids
 * REASONING that delivery probably succeeded because the executor probably ran.
 * Ten of these rows are free-tier with no charge at all, so the policy is silent
 * on them; they are a status correction with no economic content.
 *
 * ── Idempotency ─────────────────────────────────────────────────────────────
 *
 * Every statement is predicated on `status='executing'`, which the first run
 * clears. A second run matches nothing. The refund goes through the WP2 wallet
 * service, so the balance change and its ledger row are written in one
 * transaction and cannot diverge — and it is guarded on the absence of a prior
 * refund for the same transaction, so a re-run cannot double-credit.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   npx tsx scripts/reconcile-stranded-executing.ts            # dry run (default)
 *   npx tsx scripts/reconcile-stranded-executing.ts --apply    # requires approval
 */

import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "../src/db/index.js";
import { transactions, wallets, walletTransactions } from "../src/db/schema.js";
import * as walletService from "../src/lib/wallet-service.js";

const APPLY = process.argv.includes("--apply");

const CLOSURE_NOTE =
  "Execution abandoned before durable wallet reservations existed (WP3). " +
  "No output was produced, so successful delivery cannot be evidenced. " +
  "Closed by the 2026-08-21 stranded-row reconciliation.";

async function main(): Promise<void> {
  const db = getDb();

  // ── BEFORE ────────────────────────────────────────────────────────────────
  const before = await db
    .select({
      id: transactions.id,
      createdAt: transactions.createdAt,
      priceCents: transactions.priceCents,
      userId: transactions.userId,
      hasOutput: sql<boolean>`${transactions.output} IS NOT NULL`,
      hashed: sql<boolean>`${transactions.integrityHash} IS NOT NULL`,
    })
    .from(transactions)
    .where(eq(transactions.status, "executing"))
    .orderBy(transactions.createdAt);

  console.log(`\nBEFORE — ${before.length} rows in status='executing'`);
  let chargedTotal = 0;
  for (const r of before) {
    chargedTotal += r.priceCents;
    console.log(
      `  ${r.createdAt.toISOString().slice(0, 19)}  ${String(r.priceCents).padStart(4)}c  ` +
        `output=${r.hasOutput}  hashed=${r.hashed}  user=${r.userId ? r.userId.slice(0, 8) : "none"}`,
    );
  }
  console.log(`  total charged against undelivered work: ${chargedTotal}c`);

  // A row WITH output would mean delivery might be provable, and the policy
  // would not apply. Refuse rather than guess.
  const withOutput = before.filter((r) => r.hasOutput);
  if (withOutput.length > 0) {
    console.error(
      `\nREFUSING: ${withOutput.length} row(s) carry output. Delivery may be ` +
        "provable for those, and this script only implements the " +
        "cannot-be-proven branch of the policy. Resolve them individually.",
    );
    process.exit(1);
  }

  // Wallet balances before, for the rows that carry a charge.
  const chargedRows = before.filter((r) => r.priceCents > 0 && r.userId);
  const balancesBefore = new Map<string, number>();
  for (const r of chargedRows) {
    const [w] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.userId, r.userId!))
      .limit(1);
    if (w) balancesBefore.set(r.userId!, w.balanceCents);
  }

  console.log("\nPLANNED ACTIONS");
  console.log(`  ${before.length - chargedRows.length} row(s): close status only (no charge exists)`);
  for (const r of chargedRows) {
    const prior = await db
      .select({ id: walletTransactions.id })
      .from(walletTransactions)
      .where(
        and(
          eq(walletTransactions.referenceId, r.id),
          eq(walletTransactions.type, "refund"),
        ),
      )
      .limit(1);
    console.log(
      `  ${r.id.slice(0, 8)}: close status + refund ${r.priceCents}c` +
        (prior.length > 0 ? "  [ALREADY REFUNDED — will skip]" : ""),
    );
  }

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply under approval.\n");
    return;
  }

  // ── APPLY ─────────────────────────────────────────────────────────────────
  for (const r of chargedRows) {
    await db.transaction(async (tx) => {
      // Guarded so a re-run cannot double-credit.
      const prior = await tx
        .select({ id: walletTransactions.id })
        .from(walletTransactions)
        .where(
          and(
            eq(walletTransactions.referenceId, r.id),
            eq(walletTransactions.type, "refund"),
          ),
        )
        .limit(1);
      if (prior.length > 0) return;

      const [wallet] = await tx
        .select({ id: wallets.id })
        .from(wallets)
        .where(eq(wallets.userId, r.userId!))
        .limit(1);
      if (!wallet) return;

      await walletService.refund(tx, {
        walletId: wallet.id,
        amountCents: r.priceCents,
        referenceId: r.id,
        description:
          "Refund: execution abandoned before WP3 reservations existed; " +
          "delivery could not be evidenced",
      });
    });
  }

  const closed = await db
    .update(transactions)
    .set({
      status: "failed",
      error: CLOSURE_NOTE,
      completedAt: sql`COALESCE(${transactions.completedAt}, now())`,
    })
    .where(and(eq(transactions.status, "executing"), isNull(transactions.output)))
    .returning({ id: transactions.id });

  // ── AFTER ─────────────────────────────────────────────────────────────────
  console.log(`\nAFTER — closed ${closed.length} row(s)`);
  const remaining = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.status, "executing"));
  console.log(`  rows still in status='executing': ${remaining.length}  (expected 0)`);

  for (const [userId, was] of balancesBefore) {
    const [w] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);
    console.log(`  wallet ${userId.slice(0, 8)}: ${was}c -> ${w?.balanceCents}c`);
  }

  console.log(
    "\nNOTE: one closed row (2026-04-18) carries an integrity hash computed " +
      "over status='executing'. Its recorded hash no longer matches, by design " +
      "and with the reason recorded in lib/chain-integrity-windows.ts. That is " +
      "a disclosed correction, not tampering.\n",
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
