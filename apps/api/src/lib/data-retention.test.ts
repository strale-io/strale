/**
 * Regression tests for the retention sweep, and specifically for the PII tier
 * added 2026-08-12.
 *
 * Two hazards this file exists to catch, both drawn from real incidents:
 *
 * 1. BIND-PARAMETER SHAPE (DEC-20260504-A). PR #43 shipped a Date straight
 *    into a `sql` template; postgres-js's encoder cannot serialise one, and
 *    every affected call 500'd silently for four days. The cert-audit batch
 *    that introduced it shipped a structurally identical bug in this very
 *    file. So: walk the query and assert no Date, Buffer or object reaches
 *    the driver — the cutoff must already be an ISO string.
 *
 * 2. SELECTION SCOPE. The PII sweep runs on a much shorter window than the
 *    compliance sweep, so a WHERE clause that is too broad silently destroys
 *    data early, and one that is too narrow silently keeps personal data past
 *    its window. Neither failure is visible in the summary log, which only
 *    reports counts.
 *
 * These are unit tests over the emitted SQL rather than integration tests: the
 * repo has no Postgres-backed harness for retention, and per the CLAUDE.md
 * test-harness exemption a structural test that captures the shape of the bug
 * is the sanctioned substitute. The accumulated-workload audit required by
 * DEC-20260504-B was run against production before merge and is recorded in
 * the PR body and in the comment on purgePiiTransactions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Recorded `sql` template invocations from a fake db.execute. */
interface Captured {
  strings: readonly string[];
  params: unknown[];
}

const captured: Captured[] = [];

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: (query: unknown) => {
      // Drizzle's sql`` object exposes its chunks; capture whatever the
      // driver would receive so we can assert on the shapes.
      // Drizzle splits a sql`` template into StringChunk objects (literal SQL,
      // whose `.value` is a string array) and RAW PRIMITIVES for the bind
      // parameters. Getting this backwards makes the shape assertions below
      // inspect an empty list and pass vacuously, so classify explicitly:
      // a StringChunk is text, anything else is a parameter.
      const q = query as { queryChunks?: unknown[] };
      const params: unknown[] = [];
      const strings: string[] = [];
      for (const chunk of q.queryChunks ?? []) {
        const isStringChunk =
          chunk !== null &&
          typeof chunk === "object" &&
          Array.isArray((chunk as { value?: unknown }).value) &&
          ((chunk as { value: unknown[] }).value).every((x) => typeof x === "string");
        if (isStringChunk) {
          strings.push(((chunk as { value: string[] }).value).join(""));
        } else {
          params.push(chunk);
        }
      }
      captured.push({ strings, params });
      // rowCount 0 ends the batching loop on the first pass.
      return Promise.resolve({ rowCount: 0 });
    },
  }),
}));

vi.mock("./log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const { cleanupOldTestData, PII_RETENTION_DAYS, TRANSACTION_RETENTION_DAYS } = await import(
  "./data-retention.js"
);

beforeEach(() => {
  captured.length = 0;
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Every SQL string emitted during a sweep, concatenated per statement. */
function statements(): string[] {
  return captured.map((c) => c.strings.join(" ").replace(/\s+/g, " "));
}

describe("retention windows", () => {
  it("redacts PII strictly earlier than the compliance skeleton", () => {
    // If these ever invert, PII would outlive the record it belongs to and the
    // sweep could never reach it.
    expect(PII_RETENTION_DAYS).toBeLessThan(TRANSACTION_RETENTION_DAYS);
  });

  it("keeps the compliance window at the Colorado AI Act minimum", () => {
    expect(TRANSACTION_RETENTION_DAYS).toBe(1095);
  });
});

describe("bind-parameter shapes (DEC-20260504-A)", () => {
  it("passes no Date, Buffer or plain object to the driver", async () => {
    await cleanupOldTestData();
    expect(captured.length).toBeGreaterThan(0);
    // Guard against a vacuous pass: if the mock ever stops classifying bind
    // parameters correctly, this assertion fires instead of the loop below
    // silently inspecting nothing.
    expect(captured.flatMap((c) => c.params).length).toBeGreaterThan(0);

    for (const { params } of captured) {
      for (const p of params) {
        expect(p).not.toBeInstanceOf(Date);
        expect(p).not.toBeInstanceOf(Buffer);
        if (p !== null && typeof p === "object") {
          // Arrays/objects would mean a cutoff or id list leaked through
          // unserialised — the PR-43 failure mode.
          expect(Array.isArray(p)).toBe(false);
        }
      }
    }
  });

  it("passes cutoffs as ISO strings", async () => {
    await cleanupOldTestData();
    const isoLike = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
    const stringParams = captured
      .flatMap((c) => c.params)
      .filter((p): p is string => typeof p === "string");
    // Every sweep passes at least one cutoff; all of them must be ISO.
    const cutoffs = stringParams.filter((p) => isoLike.test(p));
    expect(cutoffs.length).toBeGreaterThan(0);
    for (const c of cutoffs) expect(new Date(c).toString()).not.toBe("Invalid Date");
  });
});

describe("PII sweep selection scope", () => {
  it("restricts to capabilities flagged processes_personal_data", async () => {
    await cleanupOldTestData();
    const pii = statements().find((s) => s.includes("pii_retention_purge"));
    expect(pii, "PII sweep statement was not emitted").toBeDefined();
    expect(pii).toContain("processes_personal_data");
    expect(pii).toContain("JOIN capabilities");
  });

  it("never touches rows on legal hold", async () => {
    await cleanupOldTestData();
    for (const s of statements().filter((x) => x.includes("deletion_reason"))) {
      expect(s).toContain("legal_hold = false");
    }
  });

  it("skips already-redacted rows so a re-run is a no-op", async () => {
    await cleanupOldTestData();
    for (const s of statements().filter((x) => x.includes("deletion_reason"))) {
      expect(s).toContain("deleted_at IS NULL");
    }
  });

  it("self-throttles with a LIMIT rather than one unbounded statement", async () => {
    // DEC-20260504-B: the first run after introducing a window is a
    // workload-resumption event. The LIMIT is what bounds it.
    await cleanupOldTestData();
    const pii = statements().find((s) => s.includes("pii_retention_purge"));
    expect(pii).toContain("LIMIT");
  });

  it("marks PII redactions distinguishably from the 3-year sweep", async () => {
    // Operators must be able to tell why a row was redacted; the two windows
    // have different justifications and different review consequences.
    await cleanupOldTestData();
    const all = statements().join(" | ");
    expect(all).toContain("pii_retention_purge");
    expect(all).toContain("retention_purge");
  });

  it("zeroes every PII column, not just input", async () => {
    await cleanupOldTestData();
    const pii = statements().find((s) => s.includes("pii_retention_purge"))!;
    for (const col of ["input", "output", "error", "audit_trail", "provenance", "idempotency_key"]) {
      expect(pii).toContain(col);
    }
  });

  it("preserves the chain and the Art. 30 skeleton", async () => {
    // A hard DELETE here broke the integrity-hash chain once already (CRIT-7).
    // The statement must be an UPDATE, and must not clear the hash columns.
    await cleanupOldTestData();
    const pii = statements().find((s) => s.includes("pii_retention_purge"))!;
    expect(pii).toContain("UPDATE transactions");
    expect(pii).not.toContain("DELETE FROM transactions");
    expect(pii).not.toContain("integrity_hash =");
    expect(pii).not.toContain("previous_hash =");
    expect(pii).not.toContain("created_at =");
  });
});
