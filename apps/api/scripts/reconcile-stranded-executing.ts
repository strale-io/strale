/**
 * Reconcile the 11 pre-reservation transactions stuck in `status='executing'`.
 *
 * NOT YET APPLIED. Dry-run has been exercised read-only against production; the
 * --apply path has not run. This script exists to be reviewed, then executed
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
 * A second run finds zero target rows still in `executing` and aborts before
 * writing anything. The refund goes through the WP2 wallet service, so the
 * balance change and its ledger row are written in one transaction and cannot
 * diverge, and it is guarded on the absence of a prior `refund` ledger row for
 * the same transaction.
 *
 * That guard is narrower than "idempotent" in general: it asks whether a REFUND
 * was recorded, not whether the original purchase was reversed by some other
 * means. A reversal booked as `closure_forfeit` or corrected by a manual top-up
 * would not be seen. Verified for this run — exactly one ledger row references
 * any of the eleven, a single `purchase −100c`.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 * Run from the REPO ROOT so the root .env is on the path, and pass the public
 * connection string explicitly — there is no apps/api/.env, the script does not
 * import dotenv, and the root .env carries two DATABASE_URL lines of which the
 * first points at postgres.railway.internal and is unreachable from outside
 * Railway. For a once-only approved production mutation the target is asserted,
 * not assumed:
 *
 *   DATABASE_URL="<public url>" npx tsx apps/api/scripts/reconcile-stranded-executing.ts
 *   DATABASE_URL="<public url>" npx tsx apps/api/scripts/reconcile-stranded-executing.ts --apply
 */

import { and, eq, inArray, lt, sql } from "drizzle-orm";

import { getDb } from "../src/db/index.js";
import {
  healthMonitorEvents,
  transactions,
  wallets,
  walletTransactions,
} from "../src/db/schema.js";
import * as walletService from "../src/lib/wallet-service.js";

const APPLY = process.argv.includes("--apply");

/**
 * The eleven rows, named explicitly.
 *
 * Not discovered by querying `status='executing'` at run time. That query
 * describes the LIVE transient state as much as the historical one — production
 * runs ~433 transactions per hour, and any of them in flight when the snapshot
 * ran would have been swept into the batch. A remediation for eleven known
 * historical rows should name those eleven rows.
 *
 * Captured 2026-08-21 and verified: created 2026-04-07 → 2026-08-12, all with
 * `output IS NULL`, ten free-tier at 0c, one at 100c on an internal account.
 */
const TARGET_IDS = [
  "c36a0f29-a61a-4f52-8b60-b9f4ad068b69", // 2026-04-07T02:00:07   0c
  "029d88fc-a07a-45cc-8813-45015c878189", // 2026-04-07T02:01:19   0c
  "a50a9780-90f1-439d-aed1-7b46e1ee1076", // 2026-04-07T02:11:13   0c
  "3fa99138-c719-41e2-ae8f-b130f0418022", // 2026-04-07T02:12:27   0c
  "34468c09-6f74-4edb-92aa-f5d99a6499eb", // 2026-04-10T15:06:53   0c
  "04b05cf6-2d76-405b-811e-28dcaf7cfffb", // 2026-04-10T19:13:16   0c
  "be6e87b9-66a0-4fcb-897d-a2886276fe77", // 2026-04-11T01:46:33   0c
  "52892e48-c0c1-4f45-a405-75995e4ee69d", // 2026-04-11T02:05:14   0c
  "1037b328-52b8-4b23-ac00-99bae3f65e29", // 2026-04-15T18:04:51   0c
  "4994f0b2-8b80-418b-ae2f-694a029267dc", // 2026-04-18T08:59:56   0c
  "e995cbb7-79bb-4abd-97ab-8ca32e97a6a4", // 2026-08-12T09:22:05 100c
] as const;

/** Newest target. Nothing created after this instant is in scope, ever. */
const CUTOFF_ISO = "2026-08-12T09:22:06.000Z";

/**
 * Recorded verbatim on every remediation event, so the durable record carries
 * the rule that was applied and not just the change that was made.
 */
const FOUNDER_POLICY =
  "When successful billable delivery cannot be proven from durable evidence, " +
  "resolve ambiguity in the favour of the customer; do not create or preserve " +
  "a charge based on inference.";

const CLOSURE_NOTE =
  "Execution abandoned before durable wallet reservations existed (WP3). " +
  "No output was produced, so successful delivery cannot be evidenced. " +
  "Closed by the 2026-08-21 stranded-row reconciliation.";

async function main(): Promise<void> {
  const db = getDb();
  let closedCount = 0;

  // ── BEFORE ────────────────────────────────────────────────────────────────
  const before = await db
    .select({
      id: transactions.id,
      createdAt: transactions.createdAt,
      priceCents: transactions.priceCents,
      userId: transactions.userId,
      hasOutput: sql<boolean>`${transactions.output} IS NOT NULL`,
      hashed: sql<boolean>`${transactions.integrityHash} IS NOT NULL`,
      // Whether the 90-day content purge already redacted this row. Decides
      // whether the closure note may be written into `error`, and is recorded
      // on the remediation event so the record says which rows carry one.
      redacted: sql<boolean>`${transactions.redactedAt} IS NOT NULL`,
    })
    .from(transactions)
    // Named ids AND still-executing AND older than the newest target. Three
    // independent conditions, each sufficient on its own to exclude a live row.
    .where(
      and(
        inArray(transactions.id, [...TARGET_IDS]),
        eq(transactions.status, "executing"),
        lt(transactions.createdAt, new Date(CUTOFF_ISO)),
      ),
    )
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

  // The approval is given against an ELEVEN-row before/after statement. If the
  // snapshot returns anything else the world has moved since it was taken, and
  // proceeding would close a different set than the one that was approved while
  // printing a confident summary of it.
  if (before.length !== TARGET_IDS.length) {
    console.error(
      `REFUSING: snapshot returned ${before.length} row(s), expected ` +
        `${TARGET_IDS.length}. Some target changed state since the snapshot ` +
        "was taken. Re-census and obtain a fresh approval.",
    );
    process.exit(1);
  }

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

  // A charge with no wallet owner is the shape of every x402 row: 2,592 paid
  // rows in a 30-day window carry `price_cents > 0` with `user_id IS NULL`,
  // because payment settled on-chain rather than against a wallet.
  // `chargedRows` below requires BOTH, so such a row would fall silently into
  // the "close status only" bucket and be reported to the operator as "no
  // charge exists" — the founder policy exactly inverted, a charge preserved
  // against work the script has just declared undelivered. Unreachable today
  // because of the pinning; this makes it unreachable by CHECK, which is what
  // pinning cannot promise for a future edit.
  const paidWithoutWallet = before.filter((r) => r.priceCents > 0 && !r.userId);
  if (paidWithoutWallet.length > 0) {
    console.error(
      `REFUSING: ${paidWithoutWallet.length} row(s) carry a charge with no ` +
        "wallet owner (the x402 shape). Reversing those means reversing an " +
        "on-chain settlement, which this script cannot do and must not report " +
        "as 'no charge exists'. Resolve them individually.",
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
  //
  // ONE database transaction for the whole remediation: refunds, the status
  // close, and the durable record of both. The first version refunded in its
  // own transaction and closed afterwards, so an abort at the verification step
  // left the money returned and the row still `executing` — recoverable, but a
  // half-applied remediation is exactly the state this package exists to stop
  // the platform producing.
  const targetIds = before.map((r) => r.id);

  await db.transaction(async (tx) => {
    // ── Refunds ────────────────────────────────────────────────────────────
    for (const r of chargedRows) {
      // Guarded so a re-run cannot double-credit. This is a read, not a
      // constraint — `wallet_transactions` has no unique index on
      // (reference_id, type), so two CONCURRENT invocations could both pass it.
      // Safe for a single supervised run, which is the only way this script is
      // meant to execute; recorded rather than hidden.
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
      if (prior.length > 0) continue;

      const [wallet] = await tx
        .select({ id: wallets.id })
        .from(wallets)
        .where(eq(wallets.userId, r.userId!))
        .limit(1);
      if (!wallet) continue;

      await walletService.refund(tx, {
        walletId: wallet.id,
        amountCents: r.priceCents,
        referenceId: r.id,
        description:
          "Refund: execution abandoned before WP3 reservations existed; " +
          "delivery could not be evidenced",
      });
    }

    // ── Close ──────────────────────────────────────────────────────────────
    //
    // PINNED TO THE SNAPSHOT IDS. The first version ran
    // `WHERE status='executing' AND output IS NULL`, which is not a description
    // of these eleven rows — it is a description of every call currently IN
    // FLIGHT. `executing` is the live transient state written by /v1/do and
    // /v1/solutions/:slug/execute, and an in-flight row has no output by
    // definition. Production runs ~408 transactions per hour.
    //
    // A concurrent paid call would have been marked `failed` with an error
    // string asserting it "was abandoned before WP3 reservations existed",
    // while its wallet debit — committed before the row was even inserted —
    // stood. That is the founder policy exactly inverted: a charge preserved
    // against work the platform had just declared undelivered.
    const closedRows = await tx
      .update(transactions)
      .set({
        status: "failed",
        // Only where there is no redaction marker: writing a fresh
        // 200-character note into the `error` column of a row marked
        // content-redacted would have /v1/verify describe it as "payload
        // removed" while it carries newly written content.
        error: sql`CASE WHEN ${transactions.redactedAt} IS NULL THEN ${CLOSURE_NOTE} ELSE ${transactions.error} END`,
        // completed_at is deliberately NOT set. These executions never
        // completed; stamping today with a date would assert an instant we know
        // to be wrong, in a field that is part of the integrity-hash preimage
        // and the hashing worker ordering key. It is also load-bearing:
        // integrity-hash-retry admits only rows with `completed_at IS NOT
        // NULL`, so leaving it NULL is what keeps that job away from these
        // rows.
      })
      .where(
        and(
          eq(transactions.status, "executing"),
          inArray(transactions.id, targetIds),
        ),
      )
      .returning({ id: transactions.id });

    if (closedRows.length !== before.length) {
      // Throwing rolls the whole transaction back, refunds included.
      throw new Error(
        `expected to close ${before.length} rows, closed ${closedRows.length}. ` +
          "Some row changed state between the snapshot and the write. Nothing " +
          "was applied. Inspect before re-running.",
      );
    }
    closedCount = closedRows.length;

    // ── The durable record ─────────────────────────────────────────────────
    //
    // TEN OF THE ELEVEN rows are already content-redacted, so the CASE above
    // deliberately leaves their `error` column untouched — which meant the
    // first version of this script mutated ten audit rows and left no record
    // anywhere of who changed them or why. The status flip was the only
    // evidence, and a status flip does not say that a human approved this on
    // the basis of a stated policy.
    //
    // `health_monitor_events` is the existing durable operator-event table, so
    // the record goes there rather than into a new one, and it is written in
    // the SAME transaction as the change it describes — the WP8 rule that a
    // listing change and its evidence must commit together, applied to a manual
    // remediation.
    for (const r of before) {
      await tx.insert(healthMonitorEvents).values({
        eventType: "manual_reconciliation",
        capabilitySlug: null,
        tier: 2,
        actionTaken: "stranded_executing_closed",
        humanOverride: true,
        details: {
          transaction_id: r.id,
          created_at: r.createdAt.toISOString(),
          price_cents: r.priceCents,
          refunded_cents: r.priceCents > 0 && r.userId ? r.priceCents : 0,
          had_output: r.hasOutput,
          previous_status: "executing",
          new_status: "failed",
          closure_note_written: !r.redacted,
          content_redacted_before_close: r.redacted,
          policy: FOUNDER_POLICY,
          authorised_by: "founder approval, 2026-08-21 stranded-row reconciliation",
          script: "apps/api/scripts/reconcile-stranded-executing.ts",
        },
      });
    }
  });

  // ── AFTER ─────────────────────────────────────────────────────────────────
  console.log(`\nAFTER — closed ${closedCount} row(s)`);

  // Bounded to the eleven. An unbounded `WHERE status='executing'` census reads
  // the LIVE transient state: production runs ~408 transactions/hour and calls
  // have been observed taking 17 seconds, so a perfectly successful run can
  // report a non-zero count purely because someone was mid-call, and the
  // operator would read that as failure.
  const remaining = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        inArray(transactions.id, [...TARGET_IDS]),
        eq(transactions.status, "executing"),
      ),
    );
  console.log(
    `  targets still in status='executing': ${remaining.length}  (expected 0)`,
  );

  for (const [userId, was] of balancesBefore) {
    const [w] = await db
      .select({ balanceCents: wallets.balanceCents })
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1);
    const now = w?.balanceCents ?? was;
    console.log(
      `  wallet ${userId.slice(0, 8)}: ${was}c -> ${now}c  (delta ${now - was >= 0 ? "+" : ""}${now - was}c)`,
    );
  }

  console.log(
    "\nNOTE: ten of the eleven rows were content-redacted by the 90-day " +
      "retention purge before this ran, so their integrity hashes already " +
      "mismatched and /v1/verify already reports that as routine retention " +
      "rather than tampering. This reconciliation neither causes nor changes " +
      "that. The durable record of what was changed and why is in " +
      "health_monitor_events (event_type='manual_reconciliation').\n",
  );
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
