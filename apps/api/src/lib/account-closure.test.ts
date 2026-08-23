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
 * same hand-maintained artifact that failed three times.
 */
function tablesWithUserId(): string[] {
  const found: string[] = [];
  let current: string | null = null;
  for (const line of SCHEMA.split("\n")) {
    const decl = /pgTable\(\s*$|pgTable\(\s*"([^"]+)"/.exec(line);
    if (decl) current = decl[1] ?? null;
    else if (current === null) {
      const named = /^\s*"([a-z_]+)",\s*$/.exec(line);
      if (named && /pgTable\($/.test(SCHEMA.split("\n")[SCHEMA.split("\n").indexOf(line) - 1] ?? "")) {
        current = named[1]!;
      }
    }
    if (/uuid\("user_id"\)/.test(line) && current) found.push(current);
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
    const topLevel = [...block.matchAll(/^\s{4}([a-zA-Z][a-zA-Z0-9]*)\s*[:,]/gm)].map(
      (m) => m[1]!,
    );
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
