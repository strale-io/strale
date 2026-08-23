/**
 * The completeness check the closure receipt never had.
 *
 * Three review rounds each found the receipt wrong in a place the previous
 * round had not pointed at: `trial_grants.ip_hash`, then
 * `transactions.client_meta` and `audit_trail.request_context`, then two of
 * `request_context`'s own fields plus four whole tables. Correcting the
 * literals each time could not converge, because nothing related the claim to
 * the schema.
 *
 * So this file relates them. It reads `db/schema.ts` and fails if any table
 * carrying a link to an account is absent from `CLOSURE_PLAN` — a new table
 * with a `user_id` cannot be added without either handling it at closure or
 * writing down why it is retained.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CLOSURE_PLAN,
  CLOSURE_PLAN_EXCLUSIONS,
  buildClosureSummary,
  tablesCovered,
} from "./account-closure.js";
import { REQUEST_CONTEXT_FIELDS } from "./request-context.js";

const SCHEMA = readFileSync(resolve(process.cwd(), "src/db/schema.ts"), "utf8");
const DO_ROUTE = readFileSync(resolve(process.cwd(), "src/routes/do.ts"), "utf8");

/**
 * Every physical table in schema.ts that declares a `user_id` column.
 *
 * Parsed from the source rather than listed here, because a list would be the
 * same hand-maintained artifact that failed four times.
 *
 * The first version only saw `uuid("user_id")` on a single line, with a
 * double-quoted table name on the `pgTable(` line. Round 4 demonstrated it was
 * blind to `text("user_id")` (which this schema already uses elsewhere),
 * `varchar("user_id", …)`, a declaration split across lines, single quotes, and
 * a multi-line `pgTable(` whose name string occurs earlier in the file. A
 * guard that cannot see the shape it is guarding against reports success.
 *
 * So it now looks for the COLUMN NAME in any type helper, and tracks the table
 * name by scanning forward from each `pgTable(` rather than by line position.
 */
function tablesWithUserId(): string[] {
  const found: string[] = [];
  // Split on the declaration keyword so each chunk belongs to exactly one table.
  const chunks = SCHEMA.split(/export const \w+ = pgTable\(/).slice(1);
  for (const chunk of chunks) {
    const name = /^\s*["']([a-zA-Z_][a-zA-Z0-9_]*)["']/.exec(chunk);
    if (!name) continue;
    // Stop at the next declaration so a column cannot be attributed to the
    // wrong table.
    const body = chunk;
    if (/["']user_id["']/.test(body)) found.push(name[1]!);
  }
  return [...new Set(found)];
}

/** The same scan, for any column name — used to spot identifier-bearing columns. */
function tablesWithColumn(column: string): string[] {
  const found: string[] = [];
  const chunks = SCHEMA.split(/export const \w+ = pgTable\(/).slice(1);
  for (const chunk of chunks) {
    const name = /^\s*["']([a-zA-Z_][a-zA-Z0-9_]*)["']/.exec(chunk);
    if (!name) continue;
    if (new RegExp(`["']${column}["']`).test(chunk)) found.push(name[1]!);
  }
  return [...new Set(found)];
}

describe("the closure plan accounts for every table that links to an account", () => {
  it("finds the user-linked tables in the schema at all", () => {
    // Guard on the guard: a parser that silently matches nothing would make
    // every assertion below vacuous, which is the failure mode this whole
    // file exists to prevent.
    const tables = tablesWithUserId();
    expect(tables.length).toBeGreaterThanOrEqual(8);
    expect(tables).toEqual(
      expect.arrayContaining([
        "wallets",
        "trial_grants",
        "api_key_recovery_tokens",
        "transactions",
        "dispute_requests",
        "failed_requests",
        "wallet_reservations",
        "capability_invocations",
      ]),
    );
  });

  it("names every one of them, either as handled or as explicitly excluded", () => {
    const covered = tablesCovered();
    const missing = tablesWithUserId().filter((t) => !covered.has(t));
    expect(missing).toEqual([]);
  });

  it("also accounts for every table carrying a bare identifier column", () => {
    // `user_id` is not the only way a row points at a person. Round 4 found
    // `dispute_requests.contact_email` — a plaintext address — reachable only
    // because someone happened to notice it.
    const identifierColumns = ["contact_email", "email", "ip_hash", "signup_ip_hash"];
    const covered = tablesCovered();
    const missing: string[] = [];
    for (const column of identifierColumns) {
      for (const table of tablesWithColumn(column)) {
        if (!covered.has(table)) missing.push(`${table}.${column}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("gives a reason for everything it retains", () => {
    // "Retained" without a stated reason is the shape that reads as an
    // oversight to an auditor and is indistinguishable from one.
    const unexplained = CLOSURE_PLAN.filter(
      (r) => r.disposition === "retained" && !r.reason?.trim(),
    );
    expect(unexplained).toEqual([]);
  });

  it("gives a reason for every exclusion too", () => {
    for (const [table, reason] of Object.entries(CLOSURE_PLAN_EXCLUSIONS)) {
      expect(reason.trim().length, `${table} needs a reason`).toBeGreaterThan(20);
    }
  });
});

describe("the receipt names every field it retains", () => {
  it("discloses all seven request_context fields", () => {
    // Round 3: the disclosure enumerated five of seven. `fingerprintHash` is a
    // device fingerprint on 476 user-linked production rows, and it was named
    // in the code comment beside the text but not in the text.
    const rule = CLOSURE_PLAN.find(
      (r) => r.table === "transactions.audit_trail.request_context",
    );
    expect(rule).toBeDefined();
    expect([...rule!.columns].sort()).toEqual([...REQUEST_CONTEXT_FIELDS].sort());
  });

  it("REQUEST_CONTEXT_FIELDS matches what /v1/do actually records", () => {
    // The other half of the same drift. If a field is added to the object in
    // do.ts and not here, the receipt silently stops being exhaustive again.
    const block = DO_ROUTE.slice(
      DO_ROUTE.indexOf("const requestContext = {"),
      DO_ROUTE.indexOf("c.set(\"requestContext\""),
    );
    expect(block.length, "requestContext block not found in do.ts").toBeGreaterThan(100);

    // `userAgent,` is property shorthand, so match either spelling — an
    // assertion that only understood `field:` would have reported a missing
    // field that is right there.
    //
    // Round 4 got past the first version with a spread, a snake_case name, a
    // quoted key, a computed key and a five-space indent. A regex that silently
    // skips what it cannot read is a guard that reports success; this one
    // refuses shapes it cannot account for instead.
    const forbidden = [
      [/^\s*\.\.\./m, "a spread — its fields cannot be enumerated from source"],
      [/^\s*["'][^"']+["']\s*:/m, "a quoted key"],
      [/^\s*\[[^\]]+\]\s*:/m, "a computed key"],
    ] as const;
    for (const [pattern, why] of forbidden) {
      expect(
        pattern.test(block),
        `requestContext contains ${why}; REQUEST_CONTEXT_FIELDS cannot be verified against it`,
      ).toBe(false);
    }

    const topLevel = [
      ...block.matchAll(/^\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*[:,]/gm),
    ].map((m) => m[1]!);
    expect(topLevel.length, "no properties parsed out of the block").toBeGreaterThan(4);

    for (const field of REQUEST_CONTEXT_FIELDS) {
      expect(topLevel, `do.ts should record ${field}`).toContain(field);
    }
    // And nothing beyond the declared set.
    const declared = new Set<string>(REQUEST_CONTEXT_FIELDS);
    const undisclosed = topLevel.filter((f) => !declared.has(f as never));
    expect(undisclosed).toEqual([]);
  });
});

describe("buildClosureSummary", () => {
  it("puts each rule in exactly one bucket", () => {
    const s = buildClosureSummary();
    const total = s.anonymized.length + s.deleted.length + s.retained.length;
    expect(total).toBe(CLOSURE_PLAN.length);
  });

  it("carries the per-item reasons rather than one undifferentiated paragraph", () => {
    const s = buildClosureSummary();
    expect(Object.keys(s.disclosures).length).toBeGreaterThan(4);
  });

  it("does not claim the user_id linkage is severed", () => {
    // It never was: transaction rows keep pointing at the redacted users row,
    // and the schema comment has said so since cert-audit G1. The receipt
    // asserted the opposite for months.
    const all = JSON.stringify(buildClosureSummary());
    expect(all).not.toMatch(/linkage is severed/i);
  });
});
