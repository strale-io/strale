import { log } from "../lib/log.js";

/** postgres-js prints every server NOTICE to the console as a raw object,
 * about seven lines each. The startup migrations are idempotent DDL, so each
 * boot emits a burst of "already exists, skipping" notices — enough to cross
 * Railway's 500-logs-per-second-per-replica limit, which then DROPS messages
 * silently ("Messages dropped: 137", 2026-10-30). Real lines went with them,
 * and an onboarding failure became undiagnosable because its own error line
 * never survived. Drop the benign DDL class; keep everything else as one
 * structured line, because an unexpected notice is a signal.
 *
 * This lives in its own module rather than in `db/index.ts` on purpose: 74
 * test files mock `db/index.js`, and importing the handler from there made
 * every one of those mocks owe a `handlePgNotice` export.
 */
export function handlePgNotice(notice: {
  message?: unknown;
  code?: unknown;
}): void {
  const message = String(notice.message ?? "");
  if (/(already exists|does not exist), skipping$/.test(message)) return;
  log.info(
    { label: "pg-notice", code: notice.code, pg_message: message },
    "pg-notice"
  );
}
