import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import {
  MAX_RANGE_DAYS,
  OPS_READ_CHECKS,
  OpsReadInputError,
  OpsReadOutputError,
  assertSafeOutput,
  isOpsReadCheck,
  isValidOpsReadAuth,
  parseDateRange,
  SWALLOWED_FAILURE_SLUGS,
  type ReadExecutor,
} from "./ops-read.js";
import { PAID_CALL_QUARANTINE_MARKER } from "./paid-call-guard.js";

const TOKEN = "t".repeat(40);
const dialect = new PgDialect();

/** Records every query a check runs and answers with canned rows. */
function recordingExecutor(answers: unknown[][]): ReadExecutor & { queries: { sql: string; params: unknown[] }[] } {
  const queries: { sql: string; params: unknown[] }[] = [];
  let i = 0;
  return {
    queries,
    async execute(query) {
      queries.push(dialect.sqlToQuery(query as SQL));
      return answers[i++] ?? [];
    },
  };
}

describe("isValidOpsReadAuth", () => {
  it("accepts the exact bearer token", () => {
    expect(isValidOpsReadAuth(`Bearer ${TOKEN}`, TOKEN)).toBe(true);
  });
  it("refuses a wrong, missing or differently-shaped header", () => {
    expect(isValidOpsReadAuth(`Bearer ${"x".repeat(40)}`, TOKEN)).toBe(false);
    expect(isValidOpsReadAuth(undefined, TOKEN)).toBe(false);
    expect(isValidOpsReadAuth(TOKEN, TOKEN)).toBe(false);
  });
  it("fails closed when the token is unset or shorter than 32 characters", () => {
    expect(isValidOpsReadAuth("Bearer short", "short")).toBe(false);
    expect(isValidOpsReadAuth("Bearer undefined", undefined)).toBe(false);
  });
});

describe("assertSafeOutput", () => {
  it("passes listed keys with their own shapes", () => {
    const ok = {
      check: "parked-suites",
      result: {
        count: 2,
        commit: "b8e19865ee06",
        read_only: true,
        suites: [{
          test_suite_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e",
          capability_slug: "canadian-company-data",
          test_type: "known_answer",
          test_mode: "live",
          active: true,
          last_result_at: "2026-11-02T01:23:45Z",
        }],
        days: [{ day: "2026-11-01", runs: 3, declared_external_cost_cents: "1234" }],
        oldest_result_day: null,
      },
    };
    expect(assertSafeOutput(ok)).toEqual(ok);
  });

  it.each([
    ["free text in a slug field", { capability_slug: "Shopify Inc. reported revenue of 7 billion" }],
    ["an email address", { capability_slug: "jane.doe@example.com" }],
    ["a URL", { capability_slug: "https://hooks.slack.com/services/T000/B000/XXXX" }],
    ["a quarantine reason", { capability_slug: `${PAID_CALL_QUARANTINE_MARKER} this suite's input reaches a paid upstream call` }],
    ["an sk_-style token", { capability_slug: "sk_test_abc123" }],
    ["json content", { capability_slug: '{"company_name":"Shopify"}' }],
    ["an unlisted key", { key_hash: "a".repeat(64) }],
    ["an unlisted key holding a number", { phone: 46701234567 }],
    ["a test type outside the vocabulary", { test_type: "jane" }],
    ["a string where a count belongs", { runs: "46701234567" }],
    ["a negative count", { count: -1 }],
    ["a non-integer count", { count: 1.5 }],
    ["cents with a decimal or sign", { declared_external_cost_cents: "-12.5" }],
    ["a timestamp with an offset", { last_result_at: "2026-11-02 01:23:45+00" }],
    ["a long commit", { commit: "b8e19865ee06aaaabbbb" }],
    ["a list where a leaf belongs", { capability_slug: ["canadian-company-data"] }],
  ])("refuses %s", (_label, row) => {
    expect(() => assertSafeOutput({ check: "parked-suites", result: { suites: [row] } })).toThrow(OpsReadOutputError);
  });

  it("allows null for any leaf", () => {
    expect(() => assertSafeOutput({ result: { commit: null, last_result_at: null } })).not.toThrow();
  });
});

describe("parseDateRange", () => {
  const now = new Date("2026-11-02T10:00:00Z");
  it(`defaults to the ${MAX_RANGE_DAYS} days ending today (UTC)`, () => {
    expect(parseDateRange({}, now)).toEqual({ from: "2026-10-04", to: "2026-11-02" });
  });
  it("accepts an explicit range", () => {
    expect(parseDateRange({ from: "2026-10-10", to: "2026-10-20" }, now)).toEqual({ from: "2026-10-10", to: "2026-10-20" });
  });
  it.each([
    [{ from: "2026-10-01'; DROP TABLE users; --" }],
    [{ to: "yesterday" }],
    [{ from: "2026-02-30", to: "2026-03-01" }],
    [{ from: "2026-11-02", to: "2026-11-01" }],
    [{ from: "2026-01-01", to: "2026-11-01" }],
    [{ from: "2026-10-01", to: "2026-10-31" }],
  ])("refuses %o", (q) => {
    expect(() => parseDateRange(q, now)).toThrow(OpsReadInputError);
  });
  it(`allows exactly ${MAX_RANGE_DAYS} days`, () => {
    expect(() => parseDateRange({ from: "2026-10-04", to: "2026-11-02" }, now)).not.toThrow();
  });
});

describe("checks", () => {
  it("only the named checks exist", () => {
    expect(Object.keys(OPS_READ_CHECKS).sort()).toEqual([
      "build",
      "capability-debits",
      "fx-error-rate",
      "kept-charges",
      "orphan-debit-trace",
      "parked-suites",
      "solution-debits",
      "swallowed-failure-exposure",
      "test-call-cost",
    ]);
    expect(isOpsReadCheck("toString")).toBe(false);
    expect(isOpsReadCheck("__proto__")).toBe(false);
  });

  it("build reports the commit and whether the transaction is read-only", async () => {
    process.env.RAILWAY_GIT_COMMIT_SHA = "b8e19865ee06aaaa";
    const tx = recordingExecutor([[{ read_only: true }]]);
    expect(await OPS_READ_CHECKS.build.run(tx, null)).toEqual({ commit: "b8e19865ee06", read_only: true });
    expect(tx.queries[0].sql).toContain("current_setting('transaction_read_only')");
  });

  it("parked-suites selects no content columns and binds the marker as an exact prefix", async () => {
    const tx = recordingExecutor([[]]);
    await OPS_READ_CHECKS["parked-suites"].run(tx, null);
    const [q] = tx.queries;
    expect(q.params).toEqual([PAID_CALL_QUARANTINE_MARKER]);
    expect(q.sql).toContain("starts_with(ts.quarantine_reason, $1)");
    const selectList = q.sql.slice(0, q.sql.indexOf("FROM test_suites"));
    for (const col of ["input", "expected_output", "baseline_output", "quarantine_reason", "actual_output"]) {
      expect(selectList).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("test-call-cost validates its range in prepare, before any query", () => {
    expect(() => OPS_READ_CHECKS["test-call-cost"].prepare({ from: "2026-01-01", to: "2026-11-01" })).toThrow(OpsReadInputError);
    expect(OPS_READ_CHECKS["test-call-cost"].prepare({ from: "2026-10-10", to: "2026-10-20" })).toEqual({ from: "2026-10-10", to: "2026-10-20" });
  });

  it("test-call-cost binds the range as strings (never Date objects), excludes piggyback and reports retention", async () => {
    const tx = recordingExecutor([[], [], [{ oldest_result_day: "2026-10-03" }]]);
    const out = await OPS_READ_CHECKS["test-call-cost"].run(tx, { from: "2026-10-10", to: "2026-10-20" });
    expect(out).toEqual({ from: "2026-10-10", to: "2026-10-20", oldest_result_day: "2026-10-03", days: [], parked_suites: [] });
    for (const q of tx.queries) {
      for (const p of q.params) expect(p instanceof Date).toBe(false);
      expect(q.sql).not.toMatch(/\bactual_output\b|\binput\b/);
    }
    expect(tx.queries[0].sql).toContain("<> 'piggyback'");
    expect(tx.queries[0].params).toEqual(["2026-10-10", "2026-10-20"]);
  });

  it("a planted free-text value from the database never leaves: the output contract refuses it", async () => {
    const tx = recordingExecutor([[{
      test_suite_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e",
      capability_slug: "Customer said: please refund order 1234 to jane.doe@example.com",
      test_type: "known_answer",
      test_mode: "live",
      active: true,
      last_result_at: null,
    }]]);
    const result = await OPS_READ_CHECKS["parked-suites"].run(tx, null);
    expect(() => assertSafeOutput({ check: "parked-suites", result })).toThrow(OpsReadOutputError);
  });

  it("a column added to a check later is refused unless OUTPUT_FIELDS lists it", async () => {
    const tx = recordingExecutor([[{ test_suite_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e", input: "pep-check: Jane Doe" }]]);
    const result = await OPS_READ_CHECKS["parked-suites"].run(tx, null);
    expect(() => assertSafeOutput({ check: "parked-suites", result })).toThrow(OpsReadOutputError);
  });
});

// ─── Money-path checks (A-7, B-6, B-5) ──────────────────────────────────────

const MONEY_CHECKS = [
  "capability-debits",
  "solution-debits",
  "kept-charges",
  "swallowed-failure-exposure",
  "fx-error-rate",
] as const;
type MoneyCheck = (typeof MONEY_CHECKS)[number];

/** Canned rows per check, one list per statement, in the order the check runs them. */
function canned(): Record<MoneyCheck, Record<string, unknown>[][]> {
  return {
    "capability-debits": [[
      { is_total: 1, slug: null, calls: 120, no_debit: 1, debit_ne_recorded: 2, recorded_ne_listed: 3, refunded: 4, debited_cents: "2400" },
      { is_total: 0, slug: "vat-validate", calls: 7, no_debit: 1, debit_ne_recorded: 0, recorded_ne_listed: 2, refunded: 0, debited_cents: "35" },
    ]],
    "solution-debits": [
      [
        { is_total: 1, slug: null, calls: 9, no_debit: 0, debit_ne_recorded: 1, no_longer_listed: 2, recorded_ne_listed: 0, refunded: 1, debited_cents: "2250" },
        { is_total: 0, slug: "kyb-essentials-se", calls: 9, no_debit: 0, debit_ne_recorded: 1, no_longer_listed: 2, recorded_ne_listed: 0, refunded: 1, debited_cents: "2250" },
      ],
      [{ calls: 40, recorded_cents: "6000", first_day: "2026-03-10", last_day: "2026-08-21" }],
    ],
    "kept-charges": [
      [{ status: "failed", payment_method: "wallet", is_solution: true, debited_calls: 5, overcharged_calls: 0, overcharged_cents: "0", overrefunded_calls: 1, overrefunded_cents: "150" }],
      [{ month: "2026-07", no_reference: true, debits: 12, debited_cents: "1800" }],
      [{ pre_wp3: true, is_solution: true, refunds: 2, refunded_cents: "300" }],
    ],
    "swallowed-failure-exposure": [
      [{ slug: "whois-lookup", payment_method: "x402", completed_paid_calls: 6, recorded_cents: "30", first_day: "2026-09-01", last_day: "2026-11-01" }],
      [{ completed_paid_calls: 6, distinct_payers: 2, payers_unknown: 1, recorded_cents: "30", first_day: "2026-09-01", last_day: "2026-11-01" }],
    ],
    "fx-error-rate": [
      [
        { source: "calls", slug: "exchange-rate", outcome: "completed", n: 14 },
        { source: "tests", slug: "currency-convert", outcome: "passed", n: 30 },
      ],
      [{ oldest_result_day: "2026-10-18" }],
    ],
  };
}

const EXPECTED: Record<MoneyCheck, unknown> = {
  "capability-debits": {
    total: { calls: 120, no_debit: 1, debit_ne_recorded: 2, recorded_ne_listed: 3, refunded: 4, debited_cents: "2400" },
    slugs: [{ slug: "vat-validate", calls: 7, no_debit: 1, debit_ne_recorded: 0, recorded_ne_listed: 2, refunded: 0, debited_cents: "35" }],
  },
  "solution-debits": {
    total: { calls: 9, no_debit: 0, debit_ne_recorded: 1, no_longer_listed: 2, recorded_ne_listed: 0, refunded: 1, debited_cents: "2250" },
    slugs: [{ slug: "kyb-essentials-se", calls: 9, no_debit: 0, debit_ne_recorded: 1, no_longer_listed: 2, recorded_ne_listed: 0, refunded: 1, debited_cents: "2250" }],
    before_wp3: { calls: 40, recorded_cents: "6000", first_day: "2026-03-10", last_day: "2026-08-21" },
  },
  "kept-charges": {
    groups: [{ status: "failed", payment_method: "wallet", is_solution: true, debited_calls: 5, overcharged_calls: 0, overcharged_cents: "0", overrefunded_calls: 1, overrefunded_cents: "150" }],
    orphan_debits: [{ month: "2026-07", no_reference: true, debits: 12, debited_cents: "1800" }],
    unmatched_refunds: [{ pre_wp3: true, is_solution: true, refunds: 2, refunded_cents: "300" }],
  },
  "swallowed-failure-exposure": {
    total: { completed_paid_calls: 6, distinct_payers: 2, payers_unknown: 1, recorded_cents: "30", first_day: "2026-09-01", last_day: "2026-11-01" },
    slugs: [{ slug: "whois-lookup", payment_method: "x402", completed_paid_calls: 6, recorded_cents: "30", first_day: "2026-09-01", last_day: "2026-11-01" }],
  },
  "fx-error-rate": {
    from: "2026-11-09",
    to: "2026-11-15",
    oldest_result_day: "2026-10-18",
    rows: [
      { source: "calls", slug: "exchange-rate", outcome: "completed", n: 14 },
      { source: "tests", slug: "currency-convert", outcome: "passed", n: 30 },
    ],
  },
};

const FORBIDDEN_KEYS = ["user_id", "wallet_id", "api_key_id", "id", "input", "output", "error", "key_prefix", "email"];

function allKeys(value: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

async function runMoney(name: MoneyCheck, answers: unknown[][] = canned()[name]) {
  const tx = recordingExecutor(answers);
  const result = await OPS_READ_CHECKS[name].run(tx, OPS_READ_CHECKS[name].prepare({}));
  return { tx, result };
}

/** The 36 paid slugs of the 2026-11-06 swallowed-upstream-failures audit, copied once from Q4 of the a7 brief. */
const EXPECTED_SWALLOWED_SLUGS = [
  "vasp-verify", "vasp-non-compliant-check", "insolvency-check", "mx-lookup",
  "pricing-page-extract", "gdpr-fine-lookup", "package-security-audit", "dependency-audit",
  "cookie-scan", "email-auth-check", "email-deliverability-check", "domain-reputation",
  "company-tech-stack", "tech-stack-detect", "barcode-lookup", "backlink-check",
  "business-day-check", "cz-company-data", "eori-validate", "company-fundamentals",
  "github-repo-analyze", "customs-duty-lookup", "seo-audit", "startup-domain-check",
  "email-pattern-discover", "country-trade-data", "domain-age-check", "whois-lookup",
  "page-exists", "port-check", "og-image-check", "domain-contact-extract",
  "protocol-fees-lookup", "container-track", "ens-reverse-lookup", "email-reputation-score",
];

const PAID_COMPLETED = ["t.status = 'completed'", "t.is_free_tier = false", "t.price_cents > 0"];
const WP3 = "TIMESTAMPTZ '2026-08-22 00:00:00+00'";

/**
 * Rule 5's reviewed filters, per check and per statement, in run order. Each
 * entry is checked against that statement's own SQL text only, so one
 * statement carrying a filter cannot satisfy it for another.
 */
const REVIEWED_FILTERS: Record<MoneyCheck, string[][]> = {
  "capability-debits": [[
    ...PAID_COMPLETED, "t.payment_method = 'wallet'", "t.solution_slug IS NULL",
    "w.reference_id = t.id AND w.type = 'purchase'", "w.reference_id = t.id AND w.type = 'refund'",
  ]],
  "solution-debits": [
    [...PAID_COMPLETED, "t.payment_method = 'wallet'", "t.solution_slug IS NOT NULL", `t.created_at >= ${WP3}`,
      "w.reference_id = t.id AND w.type = 'purchase'", "w.reference_id = t.id AND w.type = 'refund'"],
    [...PAID_COMPLETED, "t.payment_method = 'wallet'", "t.solution_slug IS NOT NULL", `t.created_at < ${WP3}`],
  ],
  "kept-charges": [
    ["t.created_at < now() - interval '1 day'", "CASE WHEN t.status = 'completed' THEN t.price_cents ELSE 0 END",
      "type = 'purchase' AND reference_id IS NOT NULL", "type = 'refund' AND reference_id IS NOT NULL"],
    ["w.type = 'purchase'", "t.id IS NULL"],
    [`(w.created_at < ${WP3})`, "w.type = 'refund'", "w.reference_id IS NOT NULL",
      "NOT EXISTS (SELECT 1 FROM wallet_transactions p", "p.type = 'purchase' AND p.reference_id = w.reference_id"],
  ],
  "swallowed-failure-exposure": [
    [...PAID_COMPLETED, "c.slug IN ("],
    [...PAID_COMPLETED, "c.slug IN ("],
  ],
  "fx-error-rate": [
    ["t.receipt_rail IS DISTINCT FROM 'internal'", "ts.test_type <> 'piggyback'",
      "c.slug IN ('exchange-rate', 'currency-convert', 'forex-history')",
      "tr.capability_slug IN ('exchange-rate', 'currency-convert', 'forex-history')"],
    ["MIN(executed_at)", "FROM test_results"],
  ],
};

/** Every leaf key ending in `_cents` in a value. */
function centsKeys(value: unknown): string[] {
  return [...allKeys(value)].filter((k) => k.endsWith("_cents"));
}

describe("money-path checks", () => {
  it.each(MONEY_CHECKS)("%s takes no caller input", (name) => {
    expect(OPS_READ_CHECKS[name].prepare({ from: "2026-01-01", to: "not a date" })).toBeNull();
  });

  it.each(MONEY_CHECKS)("%s returns its exact shape and passes the output contract", async (name) => {
    const { result } = await runMoney(name);
    expect(result).toEqual(EXPECTED[name]);
    expect(() => assertSafeOutput({ check: name, result })).not.toThrow();
  });

  it("no Date reaches a query", async () => {
    for (const name of MONEY_CHECKS) {
      const { tx } = await runMoney(name);
      expect(tx.queries.length).toBeGreaterThan(0);
      for (const q of tx.queries) for (const p of q.params) expect(p instanceof Date, `${name}: ${String(p)}`).toBe(false);
    }
  });

  it("no id or content key is returned, checked on run()'s own result before the output contract", async () => {
    for (const name of MONEY_CHECKS) {
      const planted = canned()[name].map((rows) => rows.map((r) => ({
        ...r,
        user_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e",
        wallet_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6f",
        api_key_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d70",
        id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d71",
        input: { name: "Jane Doe" },
        output: { ok: true },
        error: "upstream said no",
        key_prefix: "sk_live_abcd",
        email: "jane.doe@example.com",
      })));
      const { result } = await runMoney(name, planted);
      const keys = allKeys(result);
      for (const k of FORBIDDEN_KEYS) expect(keys.has(k), `${name} returned ${k}`).toBe(false);
      expect(() => assertSafeOutput({ check: name, result })).not.toThrow();
    }
  });

  it.each(MONEY_CHECKS)("reviewed filters are present in each statement of %s", async (name) => {
    const { tx } = await runMoney(name);
    const expected = REVIEWED_FILTERS[name];
    expect(tx.queries.length).toBe(expected.length);
    expected.forEach((filters, i) => {
      for (const f of filters) expect(tx.queries[i].sql, `${name} statement ${i + 1}: ${f}`).toContain(f);
    });
  });

  it("fx-error-rate binds its window as text, on both calls and tests", async () => {
    const { tx } = await runMoney("fx-error-rate");
    const [q] = tx.queries;
    expect(q.sql).toMatch(/t\.created_at >= \(\$\d+::date\)::timestamp AT TIME ZONE 'UTC'/);
    expect(q.sql).toMatch(/t\.created_at <\s+\(\(\$\d+::date\) \+ 1\)::timestamp AT TIME ZONE 'UTC'/);
    expect(q.sql).toMatch(/tr\.executed_at >= \(\$\d+::date\)::timestamp AT TIME ZONE 'UTC'/);
    expect(q.sql).toMatch(/tr\.executed_at <\s+\(\(\$\d+::date\) \+ 1\)::timestamp AT TIME ZONE 'UTC'/);
    expect(q.params).toEqual(["2026-11-09", "2026-11-15", "2026-11-09", "2026-11-15"]);
  });

  it("the slug list binds as one array or as 36 separate parameters, never as a row constructor", async () => {
    const { tx } = await runMoney("swallowed-failure-exposure");
    for (const q of tx.queries) {
      expect(q.sql).not.toContain("ANY(($");
      const oneArray = /ANY\(\$\d+::text\[\]\)/.test(q.sql) && q.params.length === 1 && Array.isArray(q.params[0]);
      const expanded = /c\.slug IN \(\$1, \$2,/.test(q.sql) && q.params.length === 36;
      expect(oneArray || expanded, q.sql).toBe(true);
      expect(oneArray ? q.params[0] : q.params).toEqual([...SWALLOWED_FAILURE_SLUGS]);
    }
  });

  it.each(MONEY_CHECKS)("a database error propagates from %s", async (name) => {
    const tx: ReadExecutor = {
      execute: () => Promise.reject(new Error("canceling statement due to statement timeout")),
    };
    await expect(OPS_READ_CHECKS[name].run(tx, null)).rejects.toThrow("canceling statement due to statement timeout");
  });

  it.each(["solution-debits", "kept-charges", "swallowed-failure-exposure", "fx-error-rate"] as const)(
    "a database error in a later statement of %s propagates too",
    async (name) => {
      let i = 0;
      const tx: ReadExecutor = {
        execute: () => (i++ === 0 ? Promise.resolve([]) : Promise.reject(new Error("canceling statement due to statement timeout"))),
      };
      await expect(OPS_READ_CHECKS[name].run(tx, null)).rejects.toThrow("canceling statement due to statement timeout");
    },
  );

  it("swallowed-failure slug list is exactly the 36 audited paid slugs", () => {
    expect(SWALLOWED_FAILURE_SLUGS).toHaveLength(36);
    expect(new Set(SWALLOWED_FAILURE_SLUGS).size).toBe(36);
    expect([...SWALLOWED_FAILURE_SLUGS]).toEqual(EXPECTED_SWALLOWED_SLUGS);
  });

  it("payers never per slug: the per-slug SQL computes none and run() drops any that arrive", async () => {
    const answers = canned()["swallowed-failure-exposure"];
    answers[0][0] = { ...answers[0][0], distinct_payers: 1, payers_unknown: 0 };
    const { tx, result } = await runMoney("swallowed-failure-exposure", answers);
    const out = result as { total: Record<string, unknown>; slugs: Record<string, unknown>[] };
    expect(out.slugs[0]).not.toHaveProperty("distinct_payers");
    expect(out.slugs[0]).not.toHaveProperty("payers_unknown");
    expect(out.total).toMatchObject({ distinct_payers: 2, payers_unknown: 1 });
    for (const col of ["distinct_payers", "payers_unknown", "user_id", "x402_payer_hash"]) expect(tx.queries[0].sql).not.toContain(col);
    expect(tx.queries[1].sql).toContain("AS distinct_payers");
  });

  it("totals carry no fake '(total)' slug", async () => {
    for (const name of MONEY_CHECKS) {
      const { tx, result } = await runMoney(name);
      for (const q of tx.queries) expect(q.sql).not.toContain("(total)");
      const total = (result as { total?: Record<string, unknown> }).total;
      if (total) expect(total).not.toHaveProperty("slug");
    }
  });

  it("counts are cast to int and every returned cents column to bigint text", async () => {
    // A COUNT(...) [FILTER (...)] followed straight by AS has no ::int cast.
    const uncastCount = /COUNT\((?:[^()]|\([^()]*\))*\)(?:\s+FILTER\s+\((?:[^()]|\([^()]*\))*\))?\s+AS\s/;
    for (const name of MONEY_CHECKS) {
      const { tx } = await runMoney(name);
      const all = tx.queries.map((q) => q.sql).join("\n");
      expect(all).not.toMatch(uncastCount);
      for (const key of centsKeys(EXPECTED[name])) expect(all, `${name}: ${key}`).toContain(`::bigint::text AS ${key}`);
    }
  });

  it("planted text in a vocabulary column is refused", async () => {
    const answers = canned()["swallowed-failure-exposure"];
    answers[0][0] = { ...answers[0][0], payment_method: "refund to jane.doe@example.com" };
    const { result } = await runMoney("swallowed-failure-exposure", answers);
    expect(() => assertSafeOutput({ check: "swallowed-failure-exposure", result })).toThrow(OpsReadOutputError);
  });

  it.each([
    ["a month with a day", { month: "2026-07-01" }],
    ["a status outside the vocabulary", { status: "refunded" }],
    ["an outcome outside the vocabulary", { outcome: "jane" }],
    ["a payment method outside the vocabulary", { payment_method: "card" }],
    ["a source outside the vocabulary", { source: "customers" }],
    ["negative cents", { debited_cents: "-35" }],
    ["a string count", { calls: "7" }],
  ])("the output contract refuses %s", (_label, row) => {
    expect(() => assertSafeOutput({ check: "kept-charges", result: { groups: [row] } })).toThrow(OpsReadOutputError);
  });
});


// ─── orphan-debit-trace (A-7 follow-up) ─────────────────────────────────────

const DANGLING_ROW = {
  month: "2026-03",
  debited_cents: "25",
  in_transaction_quality: true,
  in_wallet_reservations: false,
  in_capability_invocations: false,
  in_x402_settlement_intents: false,
  in_dispute_requests: false,
  in_job_files: false,
  in_job_callbacks: false,
  is_wallet_transaction_id: false,
  refunded_cents: "0",
  wallet_user_closed: true,
  debit_type_note: "capability",
};

function tracedAnswers(): Record<string, unknown>[][] {
  return [
    [DANGLING_ROW, { ...DANGLING_ROW, debited_cents: "40", in_transaction_quality: false, wallet_user_closed: false }],
    [
      { is_total: 1, month: null, debits: 27, debited_cents: "5840", matched_solution_calls: 23, matched_completed_solution_calls: 23, unmatched: 4, unmatched_cents: "600" },
      { is_total: 0, month: "2026-04", debits: 20, debited_cents: "4400", matched_solution_calls: 17, matched_completed_solution_calls: 17, unmatched: 3, unmatched_cents: "450" },
      { is_total: 0, month: "2026-05", debits: 7, debited_cents: "1440", matched_solution_calls: 6, matched_completed_solution_calls: 6, unmatched: 1, unmatched_cents: "150" },
    ],
    [{ month: "2026-04", debit_type_note: "solution", solution_call_within_10m: false, refunded_nearby: true, debits: 4, debited_cents: "600" }],
  ];
}

const TRACED_EXPECTED = {
  dangling: [DANGLING_ROW, { ...DANGLING_ROW, debited_cents: "40", in_transaction_quality: false, wallet_user_closed: false }],
  no_reference_debits: {
    months: [
      { month: "2026-04", debits: 20, debited_cents: "4400" },
      { month: "2026-05", debits: 7, debited_cents: "1440" },
    ],
    matched_solution_calls: 23,
    matched_completed_solution_calls: 23,
    unmatched: 4,
    unmatched_cents: "600",
    unmatched_kinds: [{ month: "2026-04", debit_type_note: "solution", solution_call_within_10m: false, refunded_nearby: true, debits: 4, debited_cents: "600" }],
  },
};

async function runTrace(answers: unknown[][] = tracedAnswers()) {
  const tx = recordingExecutor(answers);
  const def = OPS_READ_CHECKS["orphan-debit-trace"];
  const result = await def.run(tx, def.prepare({}));
  return { tx, result };
}

/** Every uuid column in schema.ts holding a transaction id, plus wallet_transactions.id. */
const TRANSACTION_ID_PROBES = [
  "FROM transaction_quality q WHERE q.transaction_id = d.ref",
  "FROM wallet_reservations v WHERE v.transaction_id = d.ref",
  "FROM capability_invocations ci WHERE ci.transaction_id = d.ref",
  "FROM x402_settlement_intents xi WHERE xi.transaction_id = d.ref",
  "FROM dispute_requests dr WHERE dr.transaction_id = d.ref",
  "FROM job_files jf WHERE jf.transaction_id = d.ref",
  "FROM job_callbacks jc WHERE jc.transaction_id = d.ref",
  "FROM wallet_transactions o WHERE o.id = d.ref",
];

const NO_REFERENCE_FILTERS = [
  "w.type = 'purchase'", "w.reference_id IS NULL", "JOIN wallets wl ON wl.id = w.wallet_id",
  "t.solution_slug IS NOT NULL", "t.payment_method = 'wallet'",
  "s.user_id = nr.user_id AND s.price_cents = nr.debited",
  "nr.created_at - interval '60 seconds'", "nr.created_at + interval '60 seconds'",
  "s.status = 'completed'",
  "r.type = 'refund'", "r.reference_id IS NULL",
];

describe("orphan-debit-trace", () => {
  it("takes no caller input", () => {
    expect(OPS_READ_CHECKS["orphan-debit-trace"].prepare({ from: "2026-01-01", to: "not a date" })).toBeNull();
  });

  it("returns its exact shape and passes the output contract", async () => {
    const { result } = await runTrace();
    expect(result).toEqual(TRACED_EXPECTED);
    expect(() => assertSafeOutput({ check: "orphan-debit-trace", result })).not.toThrow();
  });

  it("binds nothing at all, so no Date can reach a query", async () => {
    const { tx } = await runTrace();
    expect(tx.queries).toHaveLength(3);
    for (const q of tx.queries) expect(q.params).toEqual([]);
  });

  it("no id, description or email is returned, checked on run()'s own result before the output contract", async () => {
    const planted = tracedAnswers().map((rows) => rows.map((r) => ({
      ...r,
      id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d71",
      ref: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d72",
      reference_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d73",
      wallet_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6f",
      user_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d6e",
      api_key_id: "6b7c1f8e-2f3a-4b5c-9d8e-1f2a3b4c5d70",
      description: "Capability: vat-validate",
      email: "jane.doe@example.com",
      debited: 25,
      matched: true,
    })));
    const { result } = await runTrace(planted);
    const keys = allKeys(result);
    for (const k of [...FORBIDDEN_KEYS, "ref", "reference_id", "description", "debited", "matched", "is_total"]) {
      expect(keys.has(k), `returned ${k}`).toBe(false);
    }
    expect(result).toEqual(TRACED_EXPECTED);
    expect(() => assertSafeOutput({ check: "orphan-debit-trace", result })).not.toThrow();
  });

  it("selects no id and no description text: description is read only inside the closed CASE", async () => {
    const { tx } = await runTrace();
    for (const q of tx.queries) {
      const withoutCase = q.sql.replace(/CASE\s+WHEN w\.description IS NULL[\s\S]*?END/g, "");
      expect(withoutCase).not.toMatch(/\bdescription\b/);
      expect(q.sql).not.toMatch(/\bemail\b|\bkey_prefix\b|\binput\b|\boutput\b/);
      // Ids are only ever joined or compared, never a selected output column.
      expect(q.sql).not.toMatch(/\b(?:id|user_id|wallet_id|reference_id|ref)\s+AS\s+(?!ref\b)/);
    }
    expect(tx.queries[0].sql).toContain("starts_with(w.description, 'Capability: ')");
  });

  it("the dangling statement keeps Q3b's filters and probes every transaction-id column", async () => {
    const { tx } = await runTrace();
    const [q] = tx.queries;
    for (const f of ["w.type = 'purchase'", "w.reference_id IS NOT NULL", "LEFT JOIN transactions t ON t.id = w.reference_id", "t.id IS NULL"]) {
      expect(q.sql, f).toContain(f);
    }
    for (const probe of TRANSACTION_ID_PROBES) expect(q.sql, probe).toContain(probe);
    expect(q.sql).toContain("r.type = 'refund' AND r.reference_id = d.ref");
    expect(q.sql).toContain("u.deleted_at IS NOT NULL");
  });

  it("both no-reference statements carry the matching rule; the kinds statement keeps only the unmatched", async () => {
    const { tx } = await runTrace();
    for (const i of [1, 2]) {
      for (const f of NO_REFERENCE_FILTERS) expect(tx.queries[i].sql, `statement ${i + 1}: ${f}`).toContain(f);
      expect(tx.queries[i].sql).not.toContain("w.reference_id IS NOT NULL");
    }
    expect(tx.queries[1].sql).toContain("GROUP BY ROLLUP (month)");
    expect(tx.queries[2].sql).toContain("WHERE NOT matched");
  });

  it("counts are cast to int and every returned cents column to bigint text", async () => {
    const uncastCount = /COUNT\((?:[^()]|\([^()]*\))*\)(?:\s+FILTER\s+\((?:[^()]|\([^()]*\))*\))?\s+AS\s/;
    const { tx } = await runTrace();
    const all = tx.queries.map((q) => q.sql).join("\n");
    expect(all).not.toMatch(uncastCount);
    for (const key of centsKeys(TRACED_EXPECTED)) expect(all, key).toContain(`::bigint::text AS ${key}`);
  });

  it("a missing total row reads as nulls, not zeros", async () => {
    const answers = tracedAnswers();
    answers[1] = answers[1].filter((r) => r.is_total !== 1);
    const { result } = await runTrace(answers);
    expect((result as { no_reference_debits: Record<string, unknown> }).no_reference_debits).toMatchObject({
      matched_solution_calls: null, matched_completed_solution_calls: null, unmatched: null, unmatched_cents: null,
    });
  });

  it.each([0, 1, 2])("a database error in statement %i propagates", async (failAt) => {
    let i = 0;
    const tx: ReadExecutor = {
      execute: () => (i++ === failAt ? Promise.reject(new Error("canceling statement due to statement timeout")) : Promise.resolve([])),
    };
    await expect(OPS_READ_CHECKS["orphan-debit-trace"].run(tx, null)).rejects.toThrow("canceling statement due to statement timeout");
  });

  it.each([
    ["raw description text as the note", { debit_type_note: "Capability: vat-validate" }],
    ["a note outside the vocabulary", { debit_type_note: "refund" }],
    ["a flag as text", { in_transaction_quality: "true" }],
    ["negative cents", { debited_cents: "-25" }],
    ["a month with a day", { month: "2026-03-01" }],
  ])("the output contract refuses %s", async (_label, change) => {
    const answers = tracedAnswers();
    answers[0][0] = { ...answers[0][0], ...change };
    const { result } = await runTrace(answers);
    expect(() => assertSafeOutput({ check: "orphan-debit-trace", result })).toThrow(OpsReadOutputError);
  });
});
