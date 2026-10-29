import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

/**
 * Block 0135 — a redacted row that is later deleted records why.
 *
 * Block 0103's trigger keeps a redacted row's customer content cleared, and it
 * also pins `deletion_reason` to its old value on every update. That second
 * rule is wrong for one transition: a row that is content-redacted at 90 days
 * (`content_retention_purge`, `deleted_at` NULL) and later deleted, by the
 * customer (`DELETE /v1/transactions/:id`, `user_request`) or by the 1095-day
 * purge (`retention_purge`). The delete set `deleted_at`, but the trigger put
 * the reason back to `content_retention_purge`, so the row carried the exact
 * signature block 0087 looks for, and 0087, running every boot, made it
 * visible again on the next deploy. A customer-deleted transaction came back.
 *
 * This replaces the trigger function with one that lets `deletion_reason`
 * change only when the old reason is a content redaction
 * (`content_retention_purge`, or the older `pii_retention_purge`) or absent
 * (a redacted row from before reasons were written), and the row is deleted
 * after the update: the delete itself, or block 0136 correcting a row deleted
 * under the old function. The NULL case is spelled out because
 * `NULL IN (...)` is NULL, which would skip the pin by accident. Every other update pins the reason as
 * before, so an Art. 17 `account_closure_erasure` is never overwritten by the
 * later 1095-day purge. Content stays cleared and `redacted_at` stays pinned. Block 0087 is retired in
 * run-policy.ts and block 0136 re-deletes the rows it restored.
 *
 * Runs every boot, taking over 0103's job of restoring the trigger if it was
 * dropped (0103 is now "once", so it no longer overwrites this function with
 * its old body on each boot). The function is replaced in one statement and
 * the trigger is created only when absent, never dropped, for the reason 0103
 * gives. Verified after: the trigger exists, is enabled, and calls a function
 * whose body carries the new rule.
 */
export const REDACTED_ROW_DELETION_RULE =
  "(OLD.deletion_reason IS NULL OR OLD.deletion_reason IN ('content_retention_purge', 'pii_retention_purge')) AND NEW.deleted_at IS NOT NULL";

export async function runMigration0135_redactedRowDeletionReason(
  tx: MigrationExecutor,
): Promise<BlockResult> {
  const startedAt = Date.now();

  await tx.execute(sql`
    CREATE OR REPLACE FUNCTION "transactions_redacted_content_stays_cleared"()
    RETURNS trigger AS $fn$
    BEGIN
      IF OLD.redacted_at IS NOT NULL THEN
        NEW.input           := '{}'::jsonb;
        NEW.output          := NULL;
        NEW.error           := NULL;
        NEW.audit_trail     := NULL;
        NEW.provenance      := NULL;
        NEW.idempotency_key := NULL;
        NEW.client_meta     := NULL;
        NEW.redacted_at     := OLD.redacted_at;
        IF NOT ((OLD.deletion_reason IS NULL OR OLD.deletion_reason IN ('content_retention_purge', 'pii_retention_purge')) AND NEW.deleted_at IS NOT NULL) THEN
          NEW.deletion_reason := OLD.deletion_reason;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql
  `);

  await tx.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgname = 'transactions_redacted_content_stays_cleared_trg'
          AND tgrelid = 'public.transactions'::regclass
      ) THEN
        CREATE TRIGGER "transactions_redacted_content_stays_cleared_trg"
          BEFORE UPDATE ON "transactions"
          FOR EACH ROW EXECUTE FUNCTION "transactions_redacted_content_stays_cleared"();
      END IF;
    END $$;
  `);

  const check = (await tx.execute(sql`
    SELECT t.tgenabled::text AS enabled, p.prosrc AS body
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE t.tgname = 'transactions_redacted_content_stays_cleared_trg'
       AND t.tgrelid = 'public.transactions'::regclass
  `)) as unknown as Array<{ enabled: string; body: string }>;
  const rows = Array.isArray(check) ? check : [];
  if (rows.length !== 1 || rows[0].enabled === "D" || !rows[0].body.includes(REDACTED_ROW_DELETION_RULE)) {
    throw new Error(
      "transactions_redacted_content_stays_cleared_trg is absent, disabled, or does not call the " +
        `function with the deletion-reason rule (matches ${rows.length}, enabled ${rows[0]?.enabled ?? "-"}). ` +
        "Refusing to report success: without it, redacted content can be restored by a late write, " +
        "or a deleted redacted row keeps a reason that says it was only redacted.",
    );
  }

  return {
    block: "0135_redactedRowDeletionReason",
    outcome: "trigger present, enabled and verified — content stays cleared; a delete records its own reason",
    duration_ms: Date.now() - startedAt,
  };
}
