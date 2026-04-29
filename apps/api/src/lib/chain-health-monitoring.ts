/**
 * Integrity-hash chain health checks (CCO P0 #14).
 *
 * Lives in a separate file from meta-monitoring.ts because Petter is
 * actively refactoring that module (introducing CHECK_REGISTRY +
 * checkCapabilityStaleness). When his refactor commits, register these
 * four checks in CHECK_REGISTRY at the same place — see "Wiring" below.
 *
 * Why these checks: the audit-trail subsystem is the platform's central
 * trust promise. Pre-fix, none of meta-monitoring's existing 17 checks
 * touched the integrity-hash chain itself. The 2026-04-26 incident
 * (catalog-wide test staleness sat hidden for 9 days because no one
 * watched the watchdog) is the exact pattern that would let chain
 * staleness rot silently — only with a worse blast radius (a stalled
 * retry worker means new transactions ship with no hash, and customers
 * who fetch /v1/audit get 202s indefinitely).
 *
 * Checks (all return MetaCheckResult so they slot into the existing
 * monitoring infrastructure):
 *
 *   1. checkChainPendingBacklog
 *      Counts rows in 'pending' state older than the worker's GRACE_MS
 *      (10s). Healthy: 0–N where N is at most one batch (BATCH_SIZE=50).
 *      Critical: > 100 with the oldest > 5 minutes — the retry worker
 *      is dead or stuck. This is the proxy for the worker-heartbeat
 *      check; if the worker were running, this number wouldn't grow.
 *
 *   2. checkChainFailedCount
 *      Counts rows in 'failed' state. Healthy: 0. Any > 0 is a
 *      regression — a transaction lost its chain link. Each row
 *      requires manual investigation.
 *
 *   3. checkChainStuckDeferred
 *      Counts rows in 'deferred' state older than 30 minutes. Healthy: 0
 *      (CCO P0 #6's stuck-deferred sweep should keep this at zero by
 *      flipping to 'failed'). Non-zero means either the sweep itself
 *      is broken, OR there's a code path inserting 'deferred' rows that
 *      isn't followed by a completion UPDATE.
 *
 *   4. checkChainUnhashedLegacyCount
 *      Informational. Counts rows in 'unhashed_legacy' state — the
 *      pre-chain rows that migration 0052 marked honestly. This is NOT
 *      an alert; it's a stable count that operations can compare
 *      against the methodology page disclosure.
 *
 * Wiring (when Petter's CHECK_REGISTRY refactor lands):
 *
 *   import {
 *     checkChainPendingBacklog,
 *     checkChainFailedCount,
 *     checkChainStuckDeferred,
 *     checkChainUnhashedLegacyCount,
 *   } from "./chain-health-monitoring.js";
 *
 *   // Append to CHECK_REGISTRY:
 *   { name: "chain_pending_backlog",        fn: checkChainPendingBacklog,        schedule: "hourly"  },
 *   { name: "chain_failed_count",           fn: checkChainFailedCount,           schedule: "hourly"  },
 *   { name: "chain_stuck_deferred",         fn: checkChainStuckDeferred,         schedule: "hourly"  },
 *   { name: "chain_unhashed_legacy_count",  fn: checkChainUnhashedLegacyCount,   schedule: "daily"   },
 */

import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import type { MetaCheckResult } from "./meta-monitoring.js";

// Thresholds. Tuned for v1: alerts must fire on a real problem, not on
// normal worker latency.
const PENDING_BACKLOG_WARN = 50;          // a single worker batch
const PENDING_BACKLOG_CRITICAL = 100;     // worker behind by 2+ batches
const PENDING_BACKLOG_OLDEST_CRITICAL_MS = 5 * 60_000; // 5 min — worker is dead
const FAILED_COUNT_CRITICAL = 1;          // any failure deserves attention

export async function checkChainPendingBacklog(): Promise<MetaCheckResult> {
  const check = "chain_pending_backlog";
  try {
    const db = getDb();
    // Count rows in 'pending' state older than 10s (the worker's GRACE_MS).
    // Anything younger is normal pipeline latency.
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)::int AS pending_count,
        EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) * 1000 AS oldest_age_ms
      FROM transactions
      WHERE compliance_hash_state = 'pending'
        AND created_at < NOW() - INTERVAL '10 seconds'
    `);
    const data = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [])[0] as
      | { pending_count: number; oldest_age_ms: number | null }
      | undefined;
    const pendingCount = data?.pending_count ?? 0;
    const oldestAgeMs = data?.oldest_age_ms ?? 0;

    if (pendingCount === 0) {
      return {
        check,
        severity: "info",
        passed: true,
        details: "0 rows pending hash beyond GRACE_MS — chain is current.",
      };
    }

    const oldestStuck = oldestAgeMs > PENDING_BACKLOG_OLDEST_CRITICAL_MS;
    const tooMany = pendingCount > PENDING_BACKLOG_CRITICAL;

    if (oldestStuck || tooMany) {
      return {
        check,
        severity: "critical",
        passed: false,
        details:
          `${pendingCount} rows pending hash; oldest ${Math.round(oldestAgeMs / 1000)}s. ` +
          `Likely retry worker dead or stuck — verify integrity-hash-retry job. ` +
          `Pre-fix, this state is invisible until customers hit /v1/audit and get persistent 202s.`,
      };
    }

    if (pendingCount > PENDING_BACKLOG_WARN) {
      return {
        check,
        severity: "warning",
        passed: false,
        details: `${pendingCount} rows pending hash; oldest ${Math.round(oldestAgeMs / 1000)}s. Worker behind by 1+ batches.`,
      };
    }

    return {
      check,
      severity: "info",
      passed: true,
      details: `${pendingCount} rows pending hash (within normal worker latency). Oldest ${Math.round(oldestAgeMs / 1000)}s.`,
    };
  } catch (err) {
    return {
      check,
      severity: "warning",
      passed: false,
      details: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function checkChainFailedCount(): Promise<MetaCheckResult> {
  const check = "chain_failed_count";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)::int AS failed_count,
        ARRAY_AGG(id::text ORDER BY created_at DESC) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS recent_ids
      FROM transactions
      WHERE compliance_hash_state = 'failed'
    `);
    const data = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [])[0] as
      | { failed_count: number; recent_ids: string[] | null }
      | undefined;
    const failedCount = data?.failed_count ?? 0;
    const recent = (data?.recent_ids ?? []).slice(0, 10);

    if (failedCount === 0) {
      return {
        check,
        severity: "info",
        passed: true,
        details: "0 transactions in 'failed' chain state.",
      };
    }

    return {
      check,
      severity: failedCount >= FAILED_COUNT_CRITICAL ? "critical" : "warning",
      passed: false,
      details:
        `${failedCount} transactions in 'failed' chain state. ` +
        `Each lost its chain link and requires manual investigation. ` +
        `Recent (last 24h, up to 10): ${recent.length > 0 ? recent.join(", ") : "none"}.`,
      affected: recent,
    };
  } catch (err) {
    return {
      check,
      severity: "warning",
      passed: false,
      details: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function checkChainStuckDeferred(): Promise<MetaCheckResult> {
  const check = "chain_stuck_deferred";
  try {
    const db = getDb();
    // The retry-worker stuck-deferred sweep flips deferred>30min → failed.
    // If this count is non-zero, either the sweep is broken OR a brand-new
    // code path is inserting deferred rows without a corresponding
    // completion UPDATE.
    const rows = await db.execute(sql`
      SELECT
        COUNT(*)::int AS stuck_count,
        EXTRACT(EPOCH FROM (NOW() - MIN(created_at))) * 1000 AS oldest_age_ms
      FROM transactions
      WHERE compliance_hash_state = 'deferred'
        AND created_at < NOW() - INTERVAL '30 minutes'
    `);
    const data = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [])[0] as
      | { stuck_count: number; oldest_age_ms: number | null }
      | undefined;
    const stuckCount = data?.stuck_count ?? 0;
    const oldestAgeMs = data?.oldest_age_ms ?? 0;

    if (stuckCount === 0) {
      return {
        check,
        severity: "info",
        passed: true,
        details: "0 transactions stuck in 'deferred' state — worker sweep is clean.",
      };
    }

    return {
      check,
      severity: "critical",
      passed: false,
      details:
        `${stuckCount} transactions stuck in 'deferred' for >30 min; oldest ${Math.round(oldestAgeMs / 1000)}s. ` +
        `Either the integrity-hash-retry stuck-deferred sweep is broken, OR a new code path is INSERTing 'deferred' ` +
        `rows without a completion UPDATE. Investigate immediately.`,
    };
  } catch (err) {
    return {
      check,
      severity: "warning",
      passed: false,
      details: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function checkChainUnhashedLegacyCount(): Promise<MetaCheckResult> {
  const check = "chain_unhashed_legacy_count";
  try {
    const db = getDb();
    const rows = await db.execute(sql`
      SELECT COUNT(*)::int AS legacy_count
      FROM transactions
      WHERE compliance_hash_state = 'unhashed_legacy'
    `);
    const data = (Array.isArray(rows) ? rows : (rows as { rows?: unknown[] })?.rows ?? [])[0] as
      | { legacy_count: number }
      | undefined;
    const legacyCount = data?.legacy_count ?? 0;

    return {
      check,
      severity: "info",
      passed: true,
      details:
        `${legacyCount} transactions in 'unhashed_legacy' state (pre-chain rows from migration 0047). ` +
        `Informational; should match the methodology page's pre-chain row count disclosure.`,
    };
  } catch (err) {
    return {
      check,
      severity: "warning",
      passed: false,
      details: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
