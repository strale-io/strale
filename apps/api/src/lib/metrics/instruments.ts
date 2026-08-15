/**
 * The instrument registry: what we record, and since when.
 *
 * The naive version of this asked the database `MIN(created_at)` and called the
 * answer "when we started recording". Cross-provider review rejected it, and
 * correctly: a backfill makes a new instrument look old, and sparse traffic
 * makes an old one look new. The first observation and the activation are
 * different facts, and only one of them tells you whether a window is
 * answerable.
 *
 * So activation is declared here, tied to the commit that shipped it, and
 * `firstObserved` is available separately as corroboration. When the two
 * disagree materially, that is worth knowing rather than averaging away.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import type { InstrumentEvidence } from "./types.js";

export interface InstrumentSpec {
  id: string;
  /** What it measures, in one line. */
  describes: string;
  /**
   * When this instrument began recording in production. Null means unknown —
   * which is itself an answer, and blocks any window that depends on it.
   */
  enabledAt: Date | null;
  /** The commit that shipped it, so the claim can be checked. */
  shippedBy?: string;
  /** Table and column the activation claim can be corroborated against. */
  source: { table: string; column: string; predicate?: string };
}

/**
 * Adding an instrument here is the only sanctioned way to make a new metric
 * answerable. Dates are UTC and come from the merge time of the named commit.
 */
export const INSTRUMENTS: Record<string, InstrumentSpec> = {
  transaction_revenue: {
    id: "transaction_revenue",
    describes: "price paid per completed transaction",
    enabledAt: new Date("2026-02-01T00:00:00Z"),
    source: { table: "transactions", column: "created_at", predicate: "price_cents IS NOT NULL" },
  },
  mcp_initialize: {
    id: "mcp_initialize",
    describes: "an agent opening an MCP session",
    enabledAt: new Date("2026-08-13T10:00:00Z"),
    shippedBy: "attribution instrumentation",
    source: { table: "discovery_hits", column: "created_at", predicate: "endpoint = '/mcp:initialize'" },
  },
  mcp_tools: {
    id: "mcp_tools",
    describes: "an agent listing or calling tools over MCP",
    // PR #245 (d216d63), merged 2026-08-15 ~11:13 CEST = 09:13 UTC.
    enabledAt: new Date("2026-08-15T09:13:00Z"),
    shippedBy: "d216d63 feat(attribution): instrument the MCP funnel",
    source: { table: "discovery_hits", column: "created_at", predicate: "endpoint LIKE '/mcp:tools%'" },
  },
  x402_payer_identity: {
    id: "x402_payer_identity",
    describes: "which wallet paid for an x402 call",
    // Same PR — migration 0083 added the hashed payer column.
    enabledAt: new Date("2026-08-15T09:13:00Z"),
    shippedBy: "d216d63 (migration 0083)",
    source: { table: "transactions", column: "created_at", predicate: "x402_payer_hash IS NOT NULL" },
  },
  client_meta: {
    id: "client_meta",
    describes: "the user agent and daily-rotating origin hash of a caller",
    enabledAt: new Date("2026-08-14T00:00:00Z"),
    source: { table: "transactions", column: "created_at", predicate: "client_meta IS NOT NULL" },
  },
};

/**
 * Whether an instrument can answer a window. This is the guard that all five
 * August failures needed and none of them had.
 */
export function coversWindow(
  instrumentId: string,
  from: Date,
): { ok: true } | { ok: false; enabledAt: Date | null; absent?: boolean } {
  const spec = INSTRUMENTS[instrumentId];
  if (!spec) return { ok: false, enabledAt: null, absent: true };
  if (spec.enabledAt === null) return { ok: false, enabledAt: null };
  return spec.enabledAt <= from ? { ok: true } : { ok: false, enabledAt: spec.enabledAt };
}

/**
 * The earliest window start that every one of these instruments can answer.
 * A multi-step metric must use this for every step, or it compares periods —
 * the mistake that produced the "92% never look at the catalogue" finding.
 */
export function commonWindowStart(instrumentIds: string[]): Date | null {
  const dates = instrumentIds.map((id) => INSTRUMENTS[id]?.enabledAt ?? null);
  if (dates.some((d) => d === null)) return null;
  return new Date(Math.max(...(dates as Date[]).map((d) => d.getTime())));
}

/** Corroboration only. Never used to decide whether a window is answerable. */
export async function firstObserved(instrumentId: string): Promise<Date | null> {
  const spec = INSTRUMENTS[instrumentId];
  if (!spec) return null;
  const where = spec.source.predicate ? sql.raw(`WHERE ${spec.source.predicate}`) : sql.raw("");
  const rows = await getDb().execute(
    sql`SELECT MIN(${sql.raw(spec.source.column)}) AS t FROM ${sql.raw(spec.source.table)} ${where}`,
  );
  const t = (rows as unknown as Array<{ t: string | null }>)[0]?.t;
  return t ? new Date(t) : null;
}

export function evidenceFor(instrumentIds: string[], coverage?: Record<string, number>): InstrumentEvidence[] {
  return instrumentIds.map((id) => ({
    id,
    enabledAt: INSTRUMENTS[id]?.enabledAt ?? null,
    coverage: coverage?.[id],
  }));
}
