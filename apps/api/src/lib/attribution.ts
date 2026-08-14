/**
 * Channel attribution capture (docs/strategy/2026-08-12-attribution-design.md).
 *
 * 92% of revenue arrives via x402 with no signup; the wallet address is the
 * only identity. These helpers capture the weak-but-joinable signals every
 * rail does carry, so the weekly rollup can attribute paying wallets to the
 * distribution surface that produced them.
 *
 * Privacy posture (design §non-goals): no fingerprinting beyond UA + a
 * DAILY-SALTED IP hash (rotates every UTC day, so cross-day correlation is
 * deliberately impossible), no third-party analytics. Retention: the
 * discovery_hits table is pruned at 90 days (db-retention rule); client_meta
 * rides the transactions row and follows TRANSACTION_RETENTION_DAYS (3y) —
 * pseudonymous, low-sensitivity signals only (ua/referer/salted hash).
 */

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { logWarn } from "./log.js";

export interface ClientMeta {
  ua?: string;
  referer?: string;
  /**
   * DAILY-salted IP hash (same salt function as discovery_hits.ip_hash), so
   * the rollup's discovery→first-call join has a matching key. NOTE: this is
   * NOT transactions.client_ip_hash (the unsalted MED-10 rate-limit hash) —
   * the two use different salts by design; joins must use this field.
   * Cross-UTC-midnight joins fail by construction (accepted; the salt
   * rotation is the privacy property).
   */
  ip_day_hash?: string;
  /** ?src= tag from tagged discovery/entry URLs (directory submissions). */
  src?: string;
  /** X-Strale-Client header set by our own SDKs/packages: "<pkg>/<version>". */
  client_header?: string;
  /** MCP initialize clientInfo (name/version) when the call came via MCP. */
  mcp_client_info?: { name?: string; version?: string };
}

/** Header-reading shape shared by Hono contexts and plain Request objects. */
export interface HeaderReader {
  header(name: string): string | undefined;
}

const MAX_FIELD = 300;

function clip(v: string | undefined | null): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  return t ? t.slice(0, MAX_FIELD) : undefined;
}

/**
 * Extract attribution signals from request headers (+ optional extras from
 * rail-specific context). Returns undefined when nothing useful was present,
 * so callers can skip writing an empty object.
 */
export function extractClientMeta(
  req: HeaderReader,
  extra?: {
    src?: string | undefined;
    ip?: string | undefined;
    mcpClientInfo?: { name?: string; version?: string };
  },
): ClientMeta | undefined {
  const meta: ClientMeta = {};
  const ua = clip(req.header("user-agent"));
  const referer = clip(req.header("referer") ?? req.header("referrer"));
  const clientHeader = clip(req.header("x-strale-client"));
  const src = clip(extra?.src);
  if (ua) meta.ua = ua;
  if (referer) meta.referer = referer;
  if (clientHeader) meta.client_header = clientHeader;
  if (src) meta.src = src;
  const ipDayHash = saltedIpHash(extra?.ip);
  if (ipDayHash) meta.ip_day_hash = ipDayHash;
  if (extra?.mcpClientInfo?.name) {
    meta.mcp_client_info = {
      name: clip(extra.mcpClientInfo.name),
      version: clip(extra.mcpClientInfo.version),
    };
  }
  return Object.keys(meta).length > 0 ? meta : undefined;
}

/**
 * Daily-salted IP hash: HMAC-ish sha256 over (UTC day || secret || ip),
 * truncated. Same IP hashes identically within a UTC day (enough for the
 * 24h discovery→first-call join) and differently across days.
 */
let warnedWeakSalt = false;

export function saltedIpHash(ip: string | undefined, now: Date = new Date()): string | undefined {
  if (!ip) return undefined;
  const secret = process.env.AUDIT_HMAC_SECRET ?? "";
  if (secret.length < 32) {
    // An empty/weak salt would make the digest rainbow-tableable, defeating
    // the privacy property. Refuse to hash rather than hash weakly; warn
    // once so the misconfiguration is visible without log spam.
    if (!warnedWeakSalt) {
      warnedWeakSalt = true;
      logWarn("attribution-weak-salt", "AUDIT_HMAC_SECRET missing/short — ip hashing disabled");
    }
    return undefined;
  }
  const day = now.toISOString().slice(0, 10);
  return createHash("sha256").update(`${day}|${secret}|${ip}`).digest("hex").slice(0, 16);
}

/**
 * Record a discovery-surface fetch (catalog, .well-known, agent-card,
 * llms.txt). Fire-and-forget by design: attribution must never add latency
 * or failure modes to a discovery endpoint — but the swallow is logged
 * (DEC-20260504-A visibility discipline).
 */
export function recordDiscoveryHit(
  endpoint: string,
  req: HeaderReader,
  opts?: { src?: string | undefined; ip?: string | undefined },
): void {
  try {
    const ua = clip(req.header("user-agent")) ?? null;
    const src = clip(opts?.src) ?? null;
    const ipHash = saltedIpHash(opts?.ip) ?? null;
    // getDb() throws synchronously when DATABASE_URL is unset — the whole
    // body is guarded so a discovery endpoint can never fail on attribution.
    const db = getDb();
    void db

    .execute(
      sql`INSERT INTO discovery_hits (endpoint, src_tag, ua, ip_hash)
          VALUES (${endpoint}, ${src}, ${ua}, ${ipHash})`,
      )
      .catch((err) => {
        logWarn("discovery-hit-write-failed", `discovery_hits insert failed: ${(err as Error).message}`, {
          endpoint,
        });
      });
  } catch (err) {
    logWarn("discovery-hit-capture-failed", (err as Error).message, { endpoint });
  }
}
