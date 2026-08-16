/**
 * Retention has to cover every customer's content, not one legal category of it.
 *
 * On 2026-08-15 an audit identified a paying customer by name from data we had
 * retained: their `translate` inputs carried an internal project label and
 * their `image-to-text` inputs carried their own asset hostnames. The sweep
 * that should have removed that content had run correctly for months — it
 * simply never looked at those rows, because it only redacted capabilities
 * flagged `processes_personal_data` (90 of 307).
 *
 * The mistake was conceptual: *personal data* and *customer data* are not the
 * same thing. A translate input is not personal data about a data subject; it
 * is another company's confidential text, and we had six months of it.
 *
 * These tests assert on the shape of the selector rather than on behaviour
 * against a live database, because the failure was one of scope — which rows
 * the statement can see — and that is visible in the SQL itself. A behavioural
 * test against a stub would pass just as happily with the old narrow join.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCE = readFileSync(
  resolve(process.cwd(), "src/lib/data-retention.ts"),
  "utf8",
);

/** The UPDATE that redacts customer content, isolated from the rest of the file. */
function customerContentPurge(): string {
  const start = SOURCE.indexOf("async function purgeCustomerContent");
  expect(start, "purgeCustomerContent must exist").toBeGreaterThan(-1);
  const end = SOURCE.indexOf("\n}", SOURCE.indexOf("return redacted", start));
  return SOURCE.slice(start, end);
}

describe("the sweep sees every transaction", () => {
  it("does not filter on the PII flag — that was the bug", () => {
    // Restoring `processes_personal_data = true` here would silently return
    // 217 of 307 capabilities to a three-year retention window.
    expect(customerContentPurge()).not.toContain("processes_personal_data");
  });

  it("does not join capabilities — that join is what hid solution executions", () => {
    // Solution rows carry solution_slug and a NULL capability_id, so an inner
    // join drops them entirely. Dropping the join closed that gap for free.
    expect(customerContentPurge()).not.toMatch(/JOIN\s+capabilities/i);
  });

  it("clears the canonical column list rather than a copy of it", async () => {
    // The column names live in lib/customer-content.ts so that "where does
    // customer data live?" is a question you can ask instead of one you have
    // to remember — remembering it wrongly is what left a marker unfound in
    // `transactions.input` on 2026-08-15. The sweep must consume that list;
    // restating it here would let the two drift, and one path would then
    // redact less than the other without any test noticing.
    const { CUSTOMER_CONTENT_COLUMN_NAMES } = await import("./customer-content.js");
    expect(customerContentPurge()).toContain("CUSTOMER_CONTENT_CLEAR_SQL");
    for (const col of ["input", "output", "error", "audit_trail", "provenance"]) {
      expect(CUSTOMER_CONTENT_COLUMN_NAMES, `${col} must be on the list`).toContain(col);
    }
  });
});

describe("what it must never do", () => {
  it("never touches a row on legal hold", () => {
    expect(customerContentPurge()).toMatch(/legal_hold\s*=\s*false/);
  });

  it("never re-redacts a row a previous sweep already cleared", () => {
    // Without this the sweep rewrites the same rows every tick, and the
    // redaction timestamp stops meaning anything.
    expect(customerContentPurge()).toMatch(/deleted_at IS NULL/);
  });

  it("never deletes the row or breaks the integrity chain", () => {
    const sweep = customerContentPurge();
    expect(sweep).not.toMatch(/DELETE\s+FROM\s+transactions/i);
    // The audit chain must survive: proving what happened is the point.
    for (const kept of ["integrity_hash", "previous_hash", "price_cents"]) {
      expect(sweep, `${kept} must not be cleared`).not.toMatch(new RegExp(`${kept}\\s*=`));
    }
  });

  it("stays self-throttled, per the bulk-operation protocol", () => {
    // DEC-20260504-B: a widened window is a workload-resumption event. The
    // LIMIT keeps each tick bounded however large the backlog grows.
    expect(customerContentPurge()).toMatch(/LIMIT \$\{BATCH_SIZE\}/);
  });
});

describe("the window", () => {
  it("is 90 days, and is stated once", () => {
    expect(SOURCE).toMatch(/PII_RETENTION_DAYS\s*=\s*90/);
  });
});
