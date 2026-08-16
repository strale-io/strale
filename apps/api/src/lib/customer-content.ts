/**
 * Where customers' own content lives.
 *
 * This exists because on 2026-08-15 I was asked whether a specific marker
 * appeared anywhere in our data. I searched `audit_trail` and `client_meta`,
 * found nothing, and reported "zero occurrences, nowhere in our data" — to the
 * founder, as a reason to disbelieve a correct audit. The marker was in
 * `transactions.input`, a NOT NULL column I never thought to check. Two columns
 * out of thirty, reported as exhaustive.
 *
 * The list was not secret. `data-retention.ts` already enumerated exactly these
 * columns, twice, because the redaction sweep has to clear them. It just wasn't
 * a thing you could *ask for* — so answering "where could customer data be?"
 * meant remembering, and I remembered wrong.
 *
 * So: one named list, consumed by the code that clears these columns and
 * available to anyone who needs to search them. Adding a column that can hold
 * customer content means adding it here, which is also how it starts being
 * redacted and how it starts being searchable. One edit, three consequences.
 *
 * What counts as customer content: anything the caller supplied or that we
 * derived directly from what they supplied. Not metadata *about* the call —
 * price, timing, capability, integrity hashes — which is what survives
 * redaction so an audit can still prove a call happened.
 */
import { sql, type SQL } from "drizzle-orm";

export interface CustomerContentColumn {
  column: string;
  /** How it is cleared. `input` is NOT NULL, so it empties rather than nulls. */
  clearsTo: "null" | "empty_json";
  why: string;
}

/**
 * Every column on `transactions` that can hold what a customer sent or what we
 * made directly from it. Ordered by how likely it is to carry something
 * sensitive, so a reader scanning this list meets the worst case first.
 */
export const CUSTOMER_CONTENT_COLUMNS: readonly CustomerContentColumn[] = [
  {
    column: "input",
    clearsTo: "empty_json",
    why: "verbatim request payload — their text, URLs, entity names, internal labels",
  },
  {
    column: "output",
    clearsTo: "null",
    why: "what we returned, which is derived from and often quotes their input",
  },
  {
    column: "error",
    clearsTo: "null",
    why: "failure messages routinely echo the offending input back",
  },
  {
    column: "audit_trail",
    clearsTo: "null",
    why: "the audit body embeds request and response detail",
  },
  {
    column: "provenance",
    clearsTo: "null",
    why: "upstream source records can carry the queried identifier",
  },
  {
    column: "idempotency_key",
    clearsTo: "null",
    why: "caller-chosen, and callers choose meaningful strings",
  },
] as const;

/** Just the names — for schema checks, docs, and privacy questions. */
export const CUSTOMER_CONTENT_COLUMN_NAMES: readonly string[] =
  CUSTOMER_CONTENT_COLUMNS.map((c) => c.column);

/**
 * The SET clause that clears every one of them. Used by both redaction sweeps
 * so a column added above cannot be redacted in one path and retained in the
 * other — which is precisely the shape of the bug that left 217 capabilities
 * unredacted for three years.
 */
export const CUSTOMER_CONTENT_CLEAR_SQL: SQL = sql.raw(
  CUSTOMER_CONTENT_COLUMNS.map((c) =>
    c.clearsTo === "empty_json"
      ? `${c.column} = '{}'::jsonb`
      : `${c.column} = NULL`,
  ).join(",\n        "),
);
// One `sql.raw` of the whole clause, deliberately — NOT `sql.join` of several
// raw fragments. The join form renders to an empty SET when interpolated into
// an outer template: `UPDATE transactions SET , deleted_at = NOW()`. That would
// have marked rows redacted while clearing nothing, which is worse than the
// bug this list exists to prevent, because it looks like it worked. Every
// value here is a hardcoded identifier from the list above, never caller
// input, so raw is safe. The retention tests catch a regression.

/**
 * A predicate matching rows where ANY customer-content column contains the
 * pattern. The answer to "does X appear anywhere in our data?" — asked once,
 * against every column, instead of against whichever two come to mind.
 *
 * Case-insensitive, cast to text so JSONB and text columns search alike.
 * Intended for privacy audits and incident response; it reads content by
 * definition, so use it to establish *whether* something is present, not to
 * browse what customers sent.
 */
export function customerContentMatches(pattern: string, alias = "t"): SQL {
  const a = alias ? `${alias}.` : "";
  return sql.join(
    CUSTOMER_CONTENT_COLUMNS.map(
      (c) => sql`${sql.raw(`${a}${c.column}`)}::text ILIKE ${`%${pattern}%`}`,
    ),
    sql` OR `,
  );
}
