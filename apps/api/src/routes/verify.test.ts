/**
 * Tests for GET /v1/verify/:transactionId — F-A-012 hardening:
 *
 *   - MAX_DEPTH lowered 200 → 50
 *   - DEFAULT_DEPTH lowered 50 → 20
 *   - Rate limit tightened 30 → 10 req/min per IP
 *   - Response chain gains `truncated: boolean` + `truncated_reason: string|null`
 *
 * Rate-limit state lives in a module-scoped Map (rate-limit.ts). Tests use
 * distinct forged `x-forwarded-for` IPs to stay in separate buckets.
 * Order independence is achieved by picking unique IPs per test.
 */

import { describe, it, expect, beforeAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A root transaction we always resolve "by id" first. Its previous_hash
// points to a chain of rows we generate dynamically to simulate different
// chain shapes per test (via `chainShape`).
const TARGET_TXN = {
  id: "00000000-0000-0000-0000-00000000aaaa",
  userId: null,
  status: "completed",
  input: {},
  output: { ok: true },
  error: null,
  priceCents: 0,
  latencyMs: 10,
  provenance: null,
  auditTrail: null,
  transparencyMarker: "algorithmic",
  dataJurisdiction: "EU",
  capabilityId: null,
  solutionSlug: null,
  integrityHash: "abc123deadbeef" + "0".repeat(50), // 64 hex
  previousHash: "prev0000000000001",
  createdAt: new Date("2026-04-20T00:00:00Z"),
  completedAt: new Date("2026-04-20T00:00:01Z"),
};

// The walker will loop: ask for row with integrityHash=currentHash.
// `chainShape` controls how many linked rows exist beyond TARGET_TXN.
let chainShape: "short" | "long" = "short";
const SHORT_CHAIN_LEN = 3; // target + 3 hops, walker stops on null
const LONG_CHAIN_LEN = 100; // > MAX_DEPTH (50), forces truncation

vi.mock("../db/index.js", () => ({
  getDb: () => ({
    execute: () => Promise.resolve([]),
    select: () => ({
      from: () => ({
        where: (_cond: any) => {
          // Simulate `SELECT * FROM transactions WHERE integrity_hash = X`.
          // First call → TARGET_TXN. Subsequent calls → synthesized prev rows.
          return {
            limit: () => {
              // Need to determine "what are we looking up". We can't
              // introspect the Drizzle condition object easily, so we
              // use a call-count heuristic: first call is the target
              // lookup, subsequent are chain walker.
              const call = ++callCount;
              if (call === 1) {
                return Promise.resolve([TARGET_TXN]);
              }
              // Chain walker iteration (call - 2 is the hop index,
              // because call 2 is the first walker hop).
              const hopIdx = call - 2;
              const maxHops =
                chainShape === "short" ? SHORT_CHAIN_LEN : LONG_CHAIN_LEN;
              if (hopIdx >= maxHops) return Promise.resolve([]); // chain ends
              return Promise.resolve([
                {
                  ...TARGET_TXN,
                  id: `hop-${hopIdx}`,
                  integrityHash: `hash-${hopIdx}`,
                  previousHash: `hash-${hopIdx + 1}`,
                  createdAt: new Date("2026-04-19T00:00:00Z"),
                },
              ]);
            },
          };
        },
      }),
    }),
  }),
}));

let callCount = 0;

vi.mock("./mcp.js", () => {
  const { Hono } = require("hono");
  return { mcpRoute: new Hono() };
});

// Mock hash recomputation so we don't have to construct valid HMAC chains.
// computeIntegrityHash is called with row contents; we stub it to return
// the row's stored integrityHash so verification always passes.
vi.mock("../lib/integrity-hash.js", async () => {
  const actual = await vi.importActual<typeof import("../lib/integrity-hash.js")>(
    "../lib/integrity-hash.js",
  );
  return {
    ...actual,
    computeIntegrityHash: (row: { integrityHash?: string | null }) =>
      row.integrityHash ?? "unverifiable",
  };
});

beforeAll(() => {
  process.env.ADMIN_SECRET =
    "unit-test-admin-secret-plenty-of-entropy-0123456789";
  process.env.AUDIT_HMAC_SECRET =
    "unit-test-audit-secret-plenty-of-entropy-0123456789";
  process.env.FRONTEND_URL ??= "http://test.local";
});

async function loadApp() {
  const { app } = await import("./../app.js");
  return app;
}

function reset() {
  callCount = 0;
}

describe("GET /v1/verify/:id — F-A-012 chain-walk cap", () => {
  it("short chain: returns full walk with truncated: false", async () => {
    reset();
    chainShape = "short";
    const app = await loadApp();
    const res = await app.request(`/v1/verify/${TARGET_TXN.id}`, {
      headers: { "x-forwarded-for": "10.0.0.1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chain.truncated).toBe(false);
    expect(body.chain.truncated_reason).toBe(null);
    // Short chain (3 hops) is well under the default depth of 20
    expect(body.chain.length).toBeLessThanOrEqual(20);
  });

  it("long chain: truncated: true with reason 'max_depth_reached (N=20)' at default depth", async () => {
    reset();
    chainShape = "long";
    const app = await loadApp();
    const res = await app.request(`/v1/verify/${TARGET_TXN.id}`, {
      headers: { "x-forwarded-for": "10.0.0.2" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chain.truncated).toBe(true);
    expect(body.chain.truncated_reason).toBe("max_depth_reached (N=20)");
    expect(body.chain.max_depth).toBe(20);
  });

  it("long chain with ?depth=50: truncated at N=50", async () => {
    reset();
    chainShape = "long";
    const app = await loadApp();
    const res = await app.request(`/v1/verify/${TARGET_TXN.id}?depth=50`, {
      headers: { "x-forwarded-for": "10.0.0.3" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chain.truncated).toBe(true);
    expect(body.chain.truncated_reason).toBe("max_depth_reached (N=50)");
    expect(body.chain.max_depth).toBe(50);
  });

  it("?depth=100 clamps to MAX_DEPTH=50", async () => {
    reset();
    chainShape = "long";
    const app = await loadApp();
    const res = await app.request(`/v1/verify/${TARGET_TXN.id}?depth=100`, {
      headers: { "x-forwarded-for": "10.0.0.4" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chain.max_depth).toBe(50);
    expect(body.chain.truncated).toBe(true);
  });
});

describe("GET /v1/verify/:id — F-A-012 rate limit 10/min per IP", () => {
  it("11th request within window returns 429 with Retry-After", async () => {
    const app = await loadApp();
    const ip = "10.0.0.100"; // unique bucket for this test
    // Fire 10 requests — all should 200
    for (let i = 0; i < 10; i++) {
      reset();
      chainShape = "short";
      const res = await app.request(`/v1/verify/${TARGET_TXN.id}`, {
        headers: { "x-forwarded-for": ip },
      });
      expect(res.status).toBe(200);
    }
    // 11th should 429
    reset();
    const rateLimited = await app.request(`/v1/verify/${TARGET_TXN.id}`, {
      headers: { "x-forwarded-for": ip },
    });
    expect(rateLimited.status).toBe(429);
    expect(rateLimited.headers.get("retry-after")).toBeTruthy();
    const body = await rateLimited.json();
    expect(body.error_code).toBe("rate_limited");
  });

  it("different IP not affected by another IP's limit", async () => {
    const app = await loadApp();
    // Exhaust IP A
    const ipA = "10.0.0.200";
    for (let i = 0; i < 10; i++) {
      reset();
      chainShape = "short";
      await app.request(`/v1/verify/${TARGET_TXN.id}`, {
        headers: { "x-forwarded-for": ipA },
      });
    }
    reset();
    const limitedA = await app.request(`/v1/verify/${TARGET_TXN.id}`, {
      headers: { "x-forwarded-for": ipA },
    });
    expect(limitedA.status).toBe(429);

    // IP B still fresh
    reset();
    chainShape = "short";
    const freshB = await app.request(`/v1/verify/${TARGET_TXN.id}`, {
      headers: { "x-forwarded-for": "10.0.0.201" },
    });
    expect(freshB.status).toBe(200);
  });
});

describe("classifyChainLink — F-AUDIT-13/16 redacted-aware verify", () => {
  it("classifies as 'redacted' when deletedAt is set, regardless of hash mismatch", async () => {
    // Redacted rows have their source data zeroed → recomputed hash will
    // differ from stored. This MUST be classified as redacted, not broken,
    // so a customer's GDPR erasure doesn't make Strale's chain look tampered.
    const { classifyChainLink } = await import("./verify.js");
    const result = classifyChainLink({
      deletedAt: new Date("2026-04-29T10:00:00Z"),
      integrityHash: "abc123",
      recomputedHash: "def456", // mismatch — but legitimate
    });
    expect(result).toBe("redacted");
  });

  it("classifies as 'redacted' even when hash recomputes correctly (deletedAt is the discriminator)", async () => {
    const { classifyChainLink } = await import("./verify.js");
    const result = classifyChainLink({
      deletedAt: new Date("2026-04-29T10:00:00Z"),
      integrityHash: "abc123",
      recomputedHash: "abc123",
    });
    expect(result).toBe("redacted");
  });

  it("classifies as 'redacted' when only redactedAt is set (90-day content sweep)", async () => {
    // 2026-08-16: the 90-day customer-content sweep stopped setting deleted_at
    // - it is a content redaction, and deleted_at means "the row is gone",
    // which hid every customer's history and every audit record at 90 days.
    // The classifier has to honour redactedAt, or dropping deleted_at would
    // report every row past the window as a BROKEN link. Broken must stay
    // reserved for tamper.
    const { classifyChainLink } = await import("./verify.js");
    expect(
      classifyChainLink({
        deletedAt: null,
        redactedAt: new Date("2026-05-18T10:00:00Z"),
        integrityHash: "abc123",
        recomputedHash: "def456",
      }),
    ).toBe("redacted");
  });

  it("buckets both retention reasons as retention, never as 'other'", async () => {
    const { isRetentionReason } = await import("./verify.js");
    expect(isRetentionReason("retention_purge")).toBe(true);
    expect(isRetentionReason("content_retention_purge")).toBe(true);
    expect(isRetentionReason("user_request")).toBe(false);
    expect(isRetentionReason(null)).toBe(false);
  });

  it("classifies as 'verified' when hash matches and not deleted", async () => {
    const { classifyChainLink } = await import("./verify.js");
    const result = classifyChainLink({
      deletedAt: null,
      integrityHash: "abc123",
      recomputedHash: "abc123",
    });
    expect(result).toBe("verified");
  });

  it("classifies as 'broken' when hash mismatches and not deleted", async () => {
    const { classifyChainLink } = await import("./verify.js");
    const result = classifyChainLink({
      deletedAt: null,
      integrityHash: "abc123",
      recomputedHash: "def456",
    });
    expect(result).toBe("broken");
  });

  it("classifies as 'broken' when stored integrityHash is null (never finalized) and not deleted", async () => {
    const { classifyChainLink } = await import("./verify.js");
    const result = classifyChainLink({
      deletedAt: null,
      integrityHash: null,
      recomputedHash: "abc123",
    });
    expect(result).toBe("broken");
  });

  it("F-AUDIT-13 regression guard: a deleted row with mismatched hash MUST NOT be classified as 'broken'", async () => {
    // The exact scenario that produced the bug: GDPR-erased row in the
    // chain reported as a tampered link. If this test ever returns "broken"
    // for a deletedAt-set row, the public chain verify will lie about
    // legitimate erasures.
    const { classifyChainLink } = await import("./verify.js");
    const result = classifyChainLink({
      deletedAt: new Date("2026-04-29T10:00:00Z"),
      integrityHash: "abc123",
      recomputedHash: "def456",
    });
    expect(result).not.toBe("broken");
    expect(result).toBe("redacted");
  });
});

describe("isErasureReason — the tally and the prose must agree", () => {
  let isErasureReason: (r: string | null) => boolean;
  let isRetentionReason: (r: string | null) => boolean;
  beforeAll(async () => {
    ({ isErasureReason, isRetentionReason } = await import("./verify.js"));
  });

  it("counts an account-closure erasure as a customer erasure, not as 'other'", () => {
    // WP11 introduced `account_closure_erasure` and taught only the PROSE
    // about it. The structured tally still tested `=== "user_request"`, so
    // every Art. 17 account closure landed in `redacted_by_reason.other` —
    // documented in the response as "flagged for review" — while the
    // `redaction_reason` text two fields above explained it as an erasure. A
    // regulator walking a chain across N closed accounts would have counted N
    // unexplained redactions.
    expect(isErasureReason("account_closure_erasure")).toBe(true);
    expect(isErasureReason("user_request")).toBe(true);
  });

  it("does not swallow retention purges or unknown reasons", () => {
    // The buckets have to stay distinct: a retention purge is system-initiated
    // and an unknown reason genuinely does want an operator's attention.
    expect(isErasureReason("content_retention_purge")).toBe(false);
    expect(isErasureReason("retention_purge")).toBe(false);
    expect(isErasureReason(null)).toBe(false);
    expect(isErasureReason("something_nobody_taught_us")).toBe(false);
  });

  it("every reason the codebase writes is classified by one of the two predicates", () => {
    // The defect was a fourth reason string added without a consumer. This
    // finds a fifth: it scans the source for the literals actually written to
    // `deletionReason` and fails on any the classifiers do not know.
    const sources = [
      "src/routes/auth.ts",
      "src/routes/transactions.ts",
      "src/lib/data-retention.ts",
      "src/lib/account-closure.ts",
      // A migration writes one too, and the first version of this scan did not
      // look here — so the literal it rewrites away was invisible to the guard
      // meant to catch exactly that.
      "src/lib/startup-migrations.ts",
    ]
      .map((f) => readFileSync(resolve(process.cwd(), f), "utf8"))
      .join("\n");

    const written = new Set(
      [
        ...sources.matchAll(/deletion_reason\s*=\s*'([a-z_]+)'/g),
        ...sources.matchAll(/deletionReason:\s*"([a-z_]+)"/g),
      ].map((m) => m[1]!),
    );
    // `user_request` arrives as a variable in one place; assert the scan found
    // real literals rather than silently matching nothing.
    expect(written.size).toBeGreaterThan(0);

    const unclassified = [...written].filter(
      (r) => !isErasureReason(r) && !isRetentionReason(r),
    );
    expect(unclassified).toEqual([]);
  });
});
