/**
 * The one place a client IP is read from request headers (WP12 batch 4, CR-19).
 *
 * ## Hop structure
 *
 * Evidence: archive/receipts/2026-11-05-audit-xff-shape-production.json (the
 * measured header shape), with the earlier spoof probes in
 * archive/receipts/2026-09-02-audit-verify-ip-proxy-hops.json (re-run
 * 2026-10-28) and 2026-11-02-audit-forwarded-for-rate-limit-key.json.
 *
 * api.strale.io is DNS-only to Railway: exactly ONE trusted proxy hop
 * (Railway's edge), no Cloudflare or other CDN. In production the edge
 * writes X-Forwarded-For as exactly
 *
 *     <client>, <railway-edge-public-ip>
 *
 * two public entries, with the edge address drawn from a pool (9 distinct
 * values over 200 requests), and it REPLACES any client-supplied value
 * rather than appending to it. So the edge's own entry is the right-most one
 * and the client is the entry one public hop to its left:
 * entries[len - 1 - TRUSTED_PROXY_HOPS].
 *
 * The first attempt at this rule (#910, reverted in #912) took the right-most
 * public entry, i.e. the edge itself, and keyed every anonymous caller on one
 * of two edge addresses for about 35 minutes
 * (docs/incidents/2026-11-05-client-ip-identity-collapse.md). The tests in
 * client-ip.test.ts pin the receipt's shape so that cannot recur.
 *
 * Under today's "replace" behaviour this rule gives the same answer as the
 * old left-most read. What it adds is safety if Railway ever starts
 * APPENDING while still adding its own entry: then the header is
 * `<client-typed...>, <client>, <edge>`, and the left-most entry would be
 * whatever the client typed, while this rule still lands on the real client.
 * (If Railway appended the client but not itself, this rule would pick a
 * client-typed value: no worse than the left-most read.)
 *
 * What it trades: if a SECOND public hop ever appears (a CDN in front, or a
 * Railway change), the rule would return that hop's neighbour, the #910
 * collapse class. clientIpOrNull therefore logs an address-free warning,
 * at most once per SHAPE_WARN_INTERVAL_MS, whenever a request's public-entry
 * count is not exactly TRUSTED_PROXY_HOPS + 1.
 *
 * X-Real-IP and CF-Connecting-IP are never read: nothing this rule trusts
 * needs them. If a CDN is ever put in front of the API, raise
 * TRUSTED_PROXY_HOPS here (and re-run apps/api/scripts/verify-ip-probe.mjs)
 * and nowhere else.
 *
 * lib/client-ip.test.ts fails on any other file that reads these headers.
 */

import { isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";
import { log } from "./log.js";

/**
 * Trusted proxies between the internet and this process that add their own
 * entry to X-Forwarded-For (Railway's edge writes `<client>, <edge>`).
 */
export const TRUSTED_PROXY_HOPS = 1;

/** A header reader: Hono's `c.req.header`, `Headers.get`, or a test double. */
export type HeaderGetter = (name: string) => string | null | undefined;

/**
 * Canonical text form of an IP, or null when the value is not an IP.
 * IPv4-mapped IPv6 (`::ffff:1.2.3.4`, also in hex form) becomes the IPv4
 * address, IPv6 is lower-cased, a zone id is dropped, and `[v6]` / `v4:port`
 * spellings are unwrapped, so one client has one identity however it is spelled.
 */
export function normalizeIp(raw: string): string | null {
  let v = raw.trim();
  if (!v || v.length > 64) return null;
  const bracket = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(v);
  if (bracket) v = bracket[1]!;
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(v)) v = v.slice(0, v.lastIndexOf(":"));
  const pct = v.indexOf("%");
  if (pct !== -1) v = v.slice(0, pct);
  const kind = isIP(v);
  if (kind === 4) return v;
  if (kind !== 6) return null;
  const lower = v.toLowerCase();
  const dotted = /^(?:0{0,4}:){2,5}(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/.exec(lower);
  if (dotted && isIP(dotted[1]!) === 4) return dotted[1]!;
  const hex = /^(?:0{0,4}:){2,5}ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(lower);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return lower;
}

/** True for addresses that can never be an internet client: loopback, private, CGNAT, link-local, unspecified, ULA. */
export function isInternalIp(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number) as [number, number];
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const first = parseInt(ip.split(":")[0] || "0", 16);
  return ip === "::1" || ip === "::" || (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80;
}

/**
 * The client IP, or null when the proxy did not supply a usable one.
 *
 * Walk X-Forwarded-For from the right. Entries in internal ranges (see
 * isInternalIp) are proxy hops of ours, never the client, and are skipped.
 * The first TRUSTED_PROXY_HOPS public entries are the trusted hops' own
 * addresses (Railway's edge); the next public entry is the client, and
 * anything further left is client-typed and never reached.
 *
 * When the list holds exactly one public entry AND it is the left-most
 * entry, there is nothing to the left of the trusted hop, so that entry is
 * taken as the client: this is the shape an edge that overwrites without
 * adding itself would produce, and it keeps per-client identity (rather than
 * failing every anonymous caller closed) if Railway ever drops its own entry.
 * When an internal entry sits LEFT of the lone public one (`10.x, <edge>`),
 * the public entry is the edge and the client is not usable: null, never the
 * edge. The receipt shows two public entries on every request, so production
 * takes neither branch today.
 *
 * An unparseable entry stops the walk with null: it is never skipped to reach
 * one further left. With only internal entries there is no public client:
 * null.
 */
export function clientIpFromHeaders(get: HeaderGetter): string | null {
  const raw = get("x-forwarded-for");
  if (!raw) return null;
  const entries = raw.split(",");
  let lastPublic: string | null = null;
  let lastPublicIndex = -1;
  let publicSeen = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const ip = normalizeIp(entries[i]!);
    if (ip === null) return null;
    if (isInternalIp(ip)) continue;
    lastPublic = ip;
    lastPublicIndex = i;
    if (++publicSeen === TRUSTED_PROXY_HOPS + 1) return ip;
  }
  return publicSeen === 1 && lastPublicIndex === 0 ? lastPublic : null;
}

/**
 * Number of public entries in X-Forwarded-For, or null when an entry does not
 * parse. Production always shows TRUSTED_PROXY_HOPS + 1 (the receipt).
 */
export function publicEntryCount(raw: string): number | null {
  let n = 0;
  for (const entry of raw.split(",")) {
    const ip = normalizeIp(entry);
    if (ip === null) return null;
    if (!isInternalIp(ip)) n++;
  }
  return n;
}

/** At most one shape warning per this interval, per process. */
export const SHAPE_WARN_INTERVAL_MS = 10 * 60_000;
let lastShapeWarnAt = -Infinity;

/**
 * Warn (address-free, throttled) when a request's X-Forwarded-For does not
 * have the measured shape, so a Railway or CDN change is seen rather than
 * silently re-keying callers. Returns true when it warned (for tests).
 */
export function noteXffShape(raw: string | null | undefined, now = Date.now(), warn: (o: object, m: string) => void = defaultWarn): boolean {
  if (!raw) return false;
  const count = publicEntryCount(raw);
  if (count === TRUSTED_PROXY_HOPS + 1) return false;
  if (now - lastShapeWarnAt < SHAPE_WARN_INTERVAL_MS) return false;
  lastShapeWarnAt = now;
  warn(
    { label: "xff-shape-unexpected", public_entries: count, total_entries: raw.split(",").length, expected_public_entries: TRUSTED_PROXY_HOPS + 1 },
    "X-Forwarded-For shape differs from the measured <client>, <edge> (lib/client-ip.ts)",
  );
  return true;
}

/** Test hook: forget the last warning time. */
export function resetXffShapeWarning(): void {
  lastShapeWarnAt = -Infinity;
}

function defaultWarn(o: object, m: string): void {
  log.warn(o, m);
}

/** Same, for Hono contexts and anything with `req.header(name)`. */
export function clientIpOrNull(c: { req: { header(name: string): string | undefined } }): string | null {
  noteXffShape(c.req.header("x-forwarded-for"));
  return clientIpFromHeaders((n) => c.req.header(n));
}

/**
 * True when the TCP peer of this request is the loopback interface: an
 * in-process or same-host self-call (the MCP route's trust prewarm and its
 * trust-profile tool call this API over localhost with no X-Forwarded-For).
 * Internet traffic always arrives from Railway's edge over the internal
 * network, never on loopback, so a loopback peer is never an internet client.
 * Any failure to read the socket (no Node server, a test harness) is false:
 * callers then treat the request as an unidentified one and fail closed.
 */
export function isLoopbackPeer(c: Parameters<typeof getConnInfo>[0]): boolean {
  try {
    const addr = getConnInfo(c).remote.address;
    if (!addr) return false;
    const v = addr.toLowerCase().replace(/^::ffff:/, "");
    return v === "::1" || (isIP(v) === 4 && v.startsWith("127."));
  } catch {
    return false;
  }
}
