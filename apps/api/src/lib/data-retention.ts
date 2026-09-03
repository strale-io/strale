import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { CUSTOMER_CONTENT_CLEAR_SQL } from "./customer-content.js";
import { log } from "./log.js";

const BATCH_SIZE = 1000;
const BATCH_DELAY_MS = 100;
/**
 * DEC-20260504-B: a hard per-invocation ceiling, so no single sweep can run
 * unbounded however large the backlog has grown. 50 × 1000 = 50,000 rows and
 * ~5s of deliberate pause. Whatever is left is picked up by the next sweep.
 */
const MAX_BATCHES_PER_RUN = 50;

/**
 * Rows affected by a `db.execute()`.
 *
 * postgres-js returns a `RowList` whose affected-row count is `.count`. Every
 * loop in this file read `.rowCount` — a node-postgres name this driver never
 * sets — so the value was `undefined`, coalesced to 0, and:
 *
 *  - `if (count < BATCH_SIZE) break` fired on the **first** iteration, so each
 *    sweep processed at most one batch and the backlog never drained;
 *  - every counter in the summary log reported 0 forever, which is exactly the
 *    silent-failure shape DEC-20260504-A exists to catch — in the file whose
 *    own comments cite it.
 *
 * `db-retention.ts:152` and 15 sites in `startup-migrations.ts` already read
 * `.count`; this file was the un-fixed twin. Centralised here so there is one
 * place to be wrong.
 */
function affected(result: unknown): number {
  return (result as { count?: number }).count ?? 0;
}

/**
 * Transaction retention window for GDPR Art. 30 record-of-processing
 * compliance (Colorado AI Act SB 24-205). Rows with `legal_hold = false`
 * and `created_at < now - TRANSACTION_RETENTION_DAYS` are hard-deleted
 * by the weekly retention sweep. SA.2a.3a: also surfaced in the
 * compliance payload returned from POST /v1/do — changes here propagate
 * to the public claim without additional edits.
 */
export const TRANSACTION_RETENTION_DAYS = 1095; // 3 years

/**
 * Retention window for the PII COLUMNS of transactions whose capability is
 * every transaction, whatever the capability. Shorter than the compliance window above,
 * and deliberately so.
 *
 * The two are not in conflict because the sweep redacts rather than deletes:
 * the Art. 30 record-of-processing skeleton (status, capability slug,
 * jurisdiction, transparency_marker, timestamps, price, latency, and the
 * integrity-hash chain) survives for the full 1095 days, while the personal
 * data itself — input, output, error, audit_trail, provenance,
 * idempotency_key — is zeroed at 90. You keep the proof that processing
 * happened without keeping the data it happened to, which is what Art. 5(1)(e)
 * storage limitation actually asks for.
 *
 * On the dispute endpoint (`/v1/transactions/{id}/dispute`): after this window
 * a dispute can still establish THAT a screening ran, when, and against which
 * capability, but not re-derive its inputs. That is the correct trade. Holding
 * identifiable personal data for three years *in case* someone might dispute
 * it is precisely the retention that storage limitation forbids — the dispute
 * right does not create a lawful basis for indefinite storage.
 *
 * 90 days gives roughly three times the one-month response window Art. 12(3)
 * allows a controller, so a dispute raised in good time is fully evaluable.
 */
export const PII_RETENTION_DAYS = 90;

/**
 * Retention policies aligned with regulatory requirements:
 * - Compliance data (transactions, quality): 3 years (Colorado AI Act SB 24-205)
 * - Operational data (test results, events): 90-180 days
 * - Trend data (snapshots): 1 year
 *
 * Transactions with legal_hold = true are NEVER deleted regardless of age.
 */

async function purgeTestResults(cutoff: Date): Promise<number> {
  const db = getDb();
  let deleted = 0;
  let batches = 0;
  while (true) {
    const result = await db.execute(sql`
      DELETE FROM test_results
      WHERE id IN (
        SELECT id FROM test_results
        WHERE executed_at < ${cutoff.toISOString()}::timestamptz
        LIMIT ${BATCH_SIZE}
      )
    `);
    const count = affected(result);
    deleted += count;
    if (count < BATCH_SIZE || ++batches >= MAX_BATCHES_PER_RUN) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return deleted;
}

async function purgeTransactionQuality(cutoff: Date): Promise<number> {
  const db = getDb();
  let deleted = 0;
  let batches = 0;
  while (true) {
    // Skip transaction_quality rows linked to transactions with legal_hold
    const result = await db.execute(sql`
      DELETE FROM transaction_quality
      WHERE id IN (
        SELECT tq.id FROM transaction_quality tq
        JOIN transactions t ON t.id = tq.transaction_id
        WHERE tq.created_at < ${cutoff.toISOString()}::timestamptz
          AND t.legal_hold = false
        LIMIT ${BATCH_SIZE}
      )
    `);
    const count = affected(result);
    deleted += count;
    if (count < BATCH_SIZE || ++batches >= MAX_BATCHES_PER_RUN) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return deleted;
}

async function purgeTransactions(cutoff: Date): Promise<number> {
  const db = getDb();
  let redacted = 0;
  let batches = 0;
  while (true) {
    // NEVER touch transactions with legal_hold = true.
    //
    // CRIT-7: previously this was a hard DELETE. That broke the integrity-
    // hash chain — every newer row whose previousHash pointed at a purged
    // row failed verification, with the public chain walker reporting
    // broken_links >= 1 and no way to distinguish "retention purged" from
    // "tampered out." A 3-year-old chain would silently corrupt every time
    // this swept.
    //
    // Now: redact in place. PII columns (input/output/error/audit_trail/
    // provenance/idempotency_key) are zeroed; integrity_hash, previous_hash,
    // status, capability/solution slug, jurisdiction, transparency_marker,
    // created_at, completed_at, price_cents, and latency_ms are preserved.
    // deleted_at + redacted_at + deletion_reason = 'retention_purge' mark
    // the row honestly.
    //
    // verify.ts already classifies rows with deleted_at IS NOT NULL as
    // redacted (not broken) — the chain stays verifiable across retention
    // events. Operators can distinguish retention from GDPR Art. 17
    // erasure by reading deletion_reason.
    //
    // WHERE clause also excludes already-redacted rows (deleted_at IS NOT
    // NULL) so re-running the sweep is a true no-op rather than a
    // re-write of a row that's already been redacted by a prior sweep.
    const result = await db.execute(sql`
      UPDATE transactions
      SET
        ${CUSTOMER_CONTENT_CLEAR_SQL},
        deleted_at = NOW(),
        redacted_at = NOW(),
        deletion_reason = 'retention_purge'
      WHERE id IN (
        SELECT id FROM transactions
        WHERE created_at < ${cutoff.toISOString()}::timestamptz
          AND legal_hold = false
          AND deleted_at IS NULL
        LIMIT ${BATCH_SIZE}
      )
    `);
    const count = affected(result);
    redacted += count;
    if (count < BATCH_SIZE || ++batches >= MAX_BATCHES_PER_RUN) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return redacted;
}

/**
 * Invocation facts (WP9). Six times the quality floor's 30-day window, so a
 * question about a capability's recent history can be answered without keeping
 * a fact forever.
 *
 * Not a compliance artefact and not on the 1095-day tier: a fact carries no
 * customer content by design — no inputs, no outputs, no error strings, only the
 * verdict — so there is nothing here that the 90-day content redaction exists to
 * remove, and nothing an Art. 15 or Art. 17 request reaches.
 *
 * Must stay comfortably above INVOCATION_FACT_DELETE_GUARD_DAYS. Block 0101's
 * trigger refuses to delete a fact inside the floor's reading window, so a
 * retention window shorter than that guard would make this purge throw on every
 * run — from inside a bulk job, which is where this platform has previously let
 * failures go unnoticed for days.
 */
export const INVOCATION_FACT_RETENTION_DAYS = 180;

/** Ordinary operational events in `health_monitor_events`. */
export const HEALTH_EVENT_RETENTION_DAYS = 180;

/**
 * Event types whose `human_override = true` rows are the durable record of a
 * human-authorised production mutation, retained for
 * TRANSACTION_RETENTION_DAYS rather than the operational 180.
 *
 * Why this exists: the 2026-08-22 stranded-row reconciliation wrote eleven
 * `manual_reconciliation` rows — the ONLY record anywhere of who changed
 * eleven production transactions and under what policy, because ten of the
 * eleven were already content-redacted and could not carry a closure note in
 * their own `error` column. Those rows explain transactions kept for 1095
 * days; deleting the explanation at 180 would have left, from roughly
 * 2027-02-18, ten rows reading `status='failed'` with an empty error and no
 * record of why. An independent review named this as a permanent defect.
 *
 * BOTH conditions are load-bearing, and each rules out the other's simpler
 * form. Neither alone is correct:
 *
 *  - `human_override` alone would sweep in `reply_action`, whose `details`
 *    hold the sender address, subject and body of an inbound email —
 *    extending personal-data retention by two and a half years to fix a
 *    bookkeeping problem.
 *  - The type list alone would sweep in the automated writers that share
 *    these type names. `capability_promotion` is the live case: the
 *    promotion job (`jobs/capability-promotion.ts`) emits it on every run
 *    and production already holds 114 such rows against 2 human ones.
 *    `lifecycle_transition` and `auto_fix` have the same shape.
 *
 * So the rule is: this type list AND the flag. Production satisfies both on
 * exactly 13 rows today — the 11 reconciliations and 2 capability promotions.
 *
 * Adding a type is a judgement that its `details` carry operational metadata
 * only, for EVERY writer of that type — see the exclusions recorded below.
 */
export const DURABLE_OVERRIDE_EVENT_TYPES = [
  // Written once, by apps/api/scripts/reconcile-stranded-executing.ts —
  // which is on no live branch. Drafts of it were committed three times on
  // 2026-08-22 to what was then remediation/wp9-artifacts, since retired to
  // archive/branches/remediation-wp9-artifacts and not an ancestor of main;
  // the last of those drafts says in its own docstring that its --apply path
  // had not run, so even the archived copy may not be what executed. Treat the
  // path as unopenable from a normal branch survey
  // (see handoff/_general/from-code/2026-08-25-f1-taxonomy-default.md). The
  // eleven rows it wrote were inspected directly in the database: transaction
  // id, before/after status, price, refund, policy, script. Naming a path that
  // cannot be opened would be misleading without this.
  "manual_reconciliation",
  // Writers in the repository: jobs/capability-promotion.ts (structured
  // fields, and human_override = false at all four of its insert sites, so it
  // cannot produce a durable row) and one ledgered block in
  // lib/startup-migrations.ts whose payload is a static literal.
  //
  // **The repository is not the whole survey, and this is the third time that
  // has bitten.** Production holds two human_override rows of this type; the
  // 2026-08-22 one matches the ledgered block byte for byte, and the
  // 2026-08-17 `web-extract` one matches neither writer and no writer in the
  // history of this repository. It was written by a one-off run against
  // production that was never committed — the same shape as
  // manual_reconciliation's own script, which is also absent from every
  // branch (see below). Its payload was read when this was found and is an
  // operational narrative, but nobody reviewed it as "operational metadata
  // only" before it was written, and a grep cannot survey what is not here.
  //
  // That is the argument for the human_override conjunct doing the real work
  // rather than the type list: an uncommitted writer can produce any payload
  // it likes under a type name, so the type list narrows the blast radius but
  // cannot be treated as a guarantee about content.
  "capability_promotion",
] as const;

/**
 * Types deliberately NOT in the list above, with the reason, because the first
 * version of this change added five of them on a reading of their reply-webhook
 * writers alone and an independent review found that reading incomplete:
 *
 *  - `reply_action` — `details` hold an inbound email's sender, subject and
 *    body. Never add it.
 *  - `lifecycle_transition` — reply-webhook's writer is structured, but
 *    routes/internal-health-monitor.ts writes this type at five more sites,
 *    all with `human_override: true`, and one of them (the suspend endpoint)
 *    puts `body?.reason` — admin-supplied free text, unbounded and
 *    unsanitised — into `details.reason`. Adding the type moved that field
 *    from 180 days to 1095. That is the same failure `reply_action` is
 *    excluded for, through a door the first version never opened.
 *  - `proposal_approved` / `proposal_rejected` / `proposal_acknowledged` —
 *    each copies `proposal_description` out of a `proposal_created` row, and
 *    no writer of `proposal_created` exists anywhere in the repository. The
 *    content of a field that does not yet exist cannot be verified, so the
 *    type cannot be admitted on the strength of its other keys.
 *  - `suspension_override`, `auto_fix` — single writer each, payload verified
 *    static, and zero rows in production. Left out because the argument for
 *    them is speculative and the argument against adding a type on an
 *    incomplete writer survey is exactly what this block records.
 *
 * **Adding a type means enumerating every writer of that type string in the
 * repository and reading each payload** — not reading the writer you happen to
 * have in mind. Grep the literal, including raw `INSERT INTO
 * health_monitor_events`, not just `logHealthEvent`.
 */

async function purgeCapabilityInvocations(factCutoff: Date): Promise<number> {
  const db = getDb();
  // Block 0101 is defer-not-throw, so the table genuinely may not exist -- that
  // is the whole premise of the floor's to_regclass probe. Naming it
  // unconditionally here reproduced the same defect one job over: this purge is
  // the LAST step of the retention sweep, so a missing table would throw before
  // `retention-cleanup-done` is logged and the operator would lose the summary
  // for every rule that had already succeeded. Loud rather than silent, but
  // losing the summary log for a bulk sweep is exactly the observability
  // failure DEC-20260504-A exists over.
  const present = await db.execute(
    sql`SELECT to_regclass('public.capability_invocations') IS NOT NULL AS ready`,
  );
  const presentRows = Array.isArray(present) ? present : (present as { rows?: unknown[] })?.rows ?? [];
  if (!(presentRows[0] as { ready?: boolean } | undefined)?.ready) return 0;

  let deleted = 0;
  let batches = 0;
  // LIMIT-paginated, like every other rule here (DEC-20260504-B). The table is
  // created empty by block 0101, so the first successful run has no backlog to
  // drain — the workload-resumption hazard that protocol exists for does not
  // apply to a table that has never held a row. Batched anyway, because it will
  // hold roughly 6k rows a day once the fact writer is live.
  while (true) {
    const result = await db.execute(sql`
      DELETE FROM capability_invocations
      WHERE id IN (
        SELECT id FROM capability_invocations
        WHERE created_at < ${factCutoff.toISOString()}::timestamptz
        LIMIT ${BATCH_SIZE}
      )
    `);
    const count = affected(result);
    deleted += count;
    if (count < BATCH_SIZE || ++batches >= MAX_BATCHES_PER_RUN) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return deleted;
}

/**
 * Delete operational events past `cutoff`, and durable production-override
 * records — `human_override` rows of a DURABLE_OVERRIDE_EVENT_TYPES type —
 * only past the much later `durableCutoff`.
 *
 * `human_override` is NOT NULL DEFAULT false in the schema, so the conjunct
 * needs no null guard; an automated row of a listed type takes the ELSE
 * branch and is still deleted at the operational window.
 *
 * The two windows are one statement so the batching and the LIMIT still bound
 * a single sweep (DEC-20260504-B). The type list is interpolated as bind
 * parameters via `sql.join`, never as a JS array into `ANY()` — that renders a
 * row-value tuple Postgres rejects, and it has crash-looped boot before.
 */
async function purgeHealthMonitorEvents(
  cutoff: Date,
  durableCutoff: Date,
): Promise<number> {
  const db = getDb();
  let deleted = 0;
  let batches = 0;
  const durableTypes = sql.join(
    DURABLE_OVERRIDE_EVENT_TYPES.map((t) => sql`${t}`),
    sql`, `,
  );
  while (true) {
    const result = await db.execute(sql`
      DELETE FROM health_monitor_events
      WHERE id IN (
        SELECT id FROM health_monitor_events
        WHERE CASE WHEN human_override AND event_type IN (${durableTypes})
                   THEN created_at < ${durableCutoff.toISOString()}::timestamptz
                   ELSE created_at < ${cutoff.toISOString()}::timestamptz
              END
        LIMIT ${BATCH_SIZE}
      )
    `);
    const count = affected(result);
    deleted += count;
    if (count < BATCH_SIZE || ++batches >= MAX_BATCHES_PER_RUN) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return deleted;
}

// purgeSqsSnapshots retired with the SQS engine (DEC-20260503-B). The
// sqs_daily_snapshot table is dropped in PR2.

/**
 * Redact the PII columns of transactions belonging to capabilities flagged
 * every transaction, on the shorter PII_RETENTION_DAYS window.
 *
 * Identical redaction to purgeTransactions — same columns zeroed, same chain-
 * preserving semantics, same legal_hold exemption, same already-redacted skip
 * so re-running is a true no-op. The only difference is WHICH rows it selects
 * and HOW OLD they must be.
 *
 * DEC-20260504-B (Bulk-Operation Deploy Protocol): introducing this window is
 * a workload-resumption event, not a routine deploy. Audited before merge on
 * 2026-08-12: 57,345 rows / ~4.6 MB of PII columns would be redacted on the
 * first run, against 803,489 total transactions with 0 on legal hold. Strategy
 * chosen: SELF-THROTTLE — the LIMIT/BATCH_SIZE loop with BATCH_DELAY_MS below
 * bounds each tick to 1000 rows, so the backlog drains over ~58 batches
 * (~12s) rather than in one statement. No pre-drain script is needed at this
 * volume, and the cap holds regardless of how large the backlog later grows.
 *
 * 2026-08-15 — WIDENED FROM PII-FLAGGED CAPABILITIES TO ALL TRANSACTIONS.
 *
 * The original selector joined `capabilities` and required
 * `processes_personal_data = true`, which redacted 90 of 307 active
 * capabilities and left the other 217 holding their payload for the full
 * 1095 days. That equated *personal data* with *customer data*, and they are
 * not the same thing. A `translate` input is not personal data about a data
 * subject — it is another company's confidential text. An `image-to-text`
 * input is the asset URLs of their pipeline. A `google-search` input is what
 * they are researching and therefore what they are building.
 *
 * Found because that retained content was used to identify a paying customer
 * by name during an audit: their inputs carried an internal project label and
 * their own asset hostnames. Nothing was leaked, but we were holding six
 * months of other companies' operational data with no reason to and no
 * intention to. The narrower rule was not protecting them; it was protecting
 * one legal category while ignoring the obligation underneath it.
 *
 * Dropping the join also closes the previously-documented solution gap for
 * free: solution executions have `capability_id IS NULL` (they carry
 * `solution_slug`), so the join could never see them. 27 such rows were past
 * the window at the time of this change. No solution→capability mapping is
 * needed, because capability identity no longer decides anything.
 *
 * What survives redaction is unchanged and deliberate: the integrity-hash
 * chain, the fact that a given customer called a given capability at a given
 * price, and every column an audit needs. The trade stays what it always was
 * — prove what happened, do not re-derive what was said.
 *
 * DEC-20260504-B re-audit for the widened window, 2026-08-15: 3,032 rows /
 * ~9.6 MB of payload on the first run, 0 on legal hold.
 *
 * **That estimate was wrong by roughly sixty-fold, and production is the
 * record.** The first sweep after the `.count` fix redacted **173,000 rows**
 * in a day, with ~8,000 still queued. The 2026-08-12 audit of the *narrower*
 * selector had said 57,345 — and a widened selector is a strict superset, so
 * 3,032 could never have been right. The contradiction was flagged in review
 * and waved through, because the smaller number was the more convenient one.
 * MAX_BATCHES_PER_RUN is what made the miss survivable: it capped each run at
 * 50,000 rows regardless of how wrong the estimate was.
 *
 * The lesson for the next DEC-20260504-B audit: when two measurements of
 * nested populations disagree in the wrong direction, the superset is not the
 * smaller one — re-measure before choosing a deploy strategy.
 *
 * Strategy: SELF-THROTTLE
 * — BATCH_SIZE rows per statement, BATCH_DELAY_MS between statements, and
 * MAX_BATCHES_PER_RUN as the per-invocation ceiling. (An earlier version of
 * this note said the batch loop "bounds each tick to 1000 rows". It did not:
 * the loop drained the whole backlog in one invocation, rate-limited but not
 * capped. MAX_BATCHES_PER_RUN is what makes the claim true.)
 *
 * 2026-08-16 — STOPPED SETTING `deleted_at`.
 *
 * This is a *content* redaction, and `deleted_at` does not mean that. Per
 * schema.ts: "deletedAt marks the row logically gone; redactedAt marks
 * input/output/audit_trail zeroed." Setting both meant every customer read
 * path — the transaction list, transaction detail, the audit-record endpoint
 * behind every shareable audit URL, and the A2A task lookup, all of which
 * filter `deleted_at IS NULL` — dropped the row entirely at 90 days.
 *
 * Under the old narrow selector that hit the ~90 personal-data capabilities.
 * Widening it to all transactions on 2026-08-15 quietly turned it into: every
 * customer loses their whole history, and every audit record stops resolving,
 * at 90 days. Audit Trail is a product we sell. The docstring above says the
 * Art. 30 skeleton "survives for the full 1095 days" — true in the table,
 * false through the API, which is the only place a customer can see it.
 *
 * Masked at the time by the `.rowCount` bug above, which capped each sweep at
 * one batch. Fixing that without this would have detonated it.
 *
 * `redacted_at` alone now marks these rows, and the chain walker in
 * routes/verify.ts classifies on either column — see the note there. The
 * hard-deletion path at TRANSACTION_RETENTION_DAYS (1095) still sets
 * `deleted_at`, because there the row genuinely is gone.
 */
async function purgeCustomerContent(cutoff: Date): Promise<number> {
  const db = getDb();
  let redacted = 0;
  let batches = 0;
  while (true) {
    const result = await db.execute(sql`
      UPDATE transactions
      SET
        ${CUSTOMER_CONTENT_CLEAR_SQL},
        redacted_at = NOW(),
        deletion_reason = 'content_retention_purge'
      WHERE id IN (
        SELECT t.id FROM transactions t
        WHERE t.created_at < ${cutoff.toISOString()}::timestamptz
          AND t.legal_hold = false
          AND t.redacted_at IS NULL
          AND t.deleted_at IS NULL
        LIMIT ${BATCH_SIZE}
      )
    `);
    const count = affected(result);
    redacted += count;
    if (count < BATCH_SIZE || ++batches >= MAX_BATCHES_PER_RUN) break;
    await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
  }
  return redacted;
}

/**
 * Run data retention cleanup. Safe to call multiple times — idempotent.
 *
 * Retention windows:
 * - transactions: 3 years (Colorado AI Act compliance)
 * - transactions: customer content columns (input/output/error/audit_trail/
 *   provenance) redacted at 90 days, whatever the capability
 * - transaction_quality: 3 years (paired with transactions)
 * - test_results: 90 days (operational)
 * - health_monitor_events: 180 days (operational), except human_override rows
 *   of a DURABLE_OVERRIDE_EVENT_TYPES type, which are kept as long as the
 *   transactions they explain (3 years)
 *
 * Transactions with legal_hold = true are never deleted.
 */
export async function cleanupOldTestData(): Promise<void> {
  const now = new Date();

  // Operational data — short retention
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const oneEightyDaysAgo = new Date(now);
  oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - HEALTH_EVENT_RETENTION_DAYS);

  // Compliance data — 3 year retention
  const threeYearsAgo = new Date(now);
  threeYearsAgo.setDate(threeYearsAgo.getDate() - TRANSACTION_RETENTION_DAYS);

  const testResultsDeleted = await purgeTestResults(ninetyDaysAgo);
  const txQualityDeleted = await purgeTransactionQuality(threeYearsAgo);
  // CRIT-7: transactions are now REDACTED in place, not deleted. Returns
  // the redacted-row count under the same key so existing dashboards keep
  // working; the field is renamed to transactions_redacted in the log
  // payload to reflect actual semantics.
  const txRedacted = await purgeTransactions(threeYearsAgo);

  // PII columns go earlier than the compliance skeleton — see
  // PII_RETENTION_DAYS. Runs after the 3-year sweep so a row old enough for
  // both is already redacted and skipped here rather than written twice.
  const piiCutoff = new Date(now);
  piiCutoff.setDate(piiCutoff.getDate() - PII_RETENTION_DAYS);
  const piiRedacted = await purgeCustomerContent(piiCutoff);

  // Durable production-override records ride the compliance window, not the
  // operational one — see DURABLE_OVERRIDE_EVENT_TYPES.
  const eventsDeleted = await purgeHealthMonitorEvents(oneEightyDaysAgo, threeYearsAgo);

  const invocationCutoff = new Date(now);
  invocationCutoff.setDate(invocationCutoff.getDate() - INVOCATION_FACT_RETENTION_DAYS);
  const invocationFactsDeleted = await purgeCapabilityInvocations(invocationCutoff);

  log.info(
    {
      label: "retention-cleanup-done",
      test_results_deleted: testResultsDeleted,
      transaction_quality_deleted: txQualityDeleted,
      transactions_redacted: txRedacted,
      pii_transactions_redacted: piiRedacted,
      health_monitor_events_deleted: eventsDeleted,
      invocation_facts_deleted: invocationFactsDeleted,
    },
    "retention-cleanup-done",
  );
}
