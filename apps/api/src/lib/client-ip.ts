/**
 * The one place a client IP is read from request headers (WP12 batch 4, CR-19).
 *
 * ## Hop structure
 *
 * Evidence: archive/receipts/2026-09-02-audit-verify-ip-proxy-hops.json (re-run
 * 2026-10-28 in ...-recheck.json; rate-limit key probe 2026-11-02 in
 * 2026-11-02-audit-forwarded-for-rate-limit-key.json).
 *
 * api.strale.io is DNS-only to Railway: exactly ONE trusted proxy hop
 * (Railway's edge), no Cloudflare or other CDN. The probes showed a
 * client-sent X-Forwarded-For / X-Real-IP / CF-Connecting-IP does not change
 * the identity the app sees. Railway does not document whether the edge
 * overwrites or appends, and its staff have said both. The rule below is
 * correct under either behaviour:
 *
 *   - overwrite: X-Forwarded-For holds one entry, and the right-most is it;
 *   - append: the edge's entry is the right-most, and everything left of it is
 *     client-typed and ignored.
 *
 * So the client IP is the TRUSTED_PROXY_HOPS-th public entry from the right of
 * the X-Forwarded-For list (all header lines joined, in order), internal-range
 * entries being skipped as hops of ours (see clientIpFromHeaders). The old rule read
 * the LEFT-most entry, which under "append" is whatever the client typed.
 *
 * X-Real-IP and CF-Connecting-IP are never read: nothing trusted sets them for
 * this host, so any value there is client-supplied. If a CDN is ever put in
 * front of the API, raise TRUSTED_PROXY_HOPS here (and re-run
 * apps/api/scripts/verify-ip-probe.mjs) and nowhere else.
 *
 * lib/client-ip.test.ts fails on any other file that reads these headers.
 */

import { isIP } from "node:net";
import { getConnInfo } from "@hono/node-server/conninfo";

/** Proxies between the internet and this process that append to X-Forwarded-For. */
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
 * isInternalIp) are proxy hops of ours, never the client, and are skipped; the
 * TRUSTED_PROXY_HOPS-th PUBLIC entry from the right is the client. So if the
 * edge ever writes `client, <internal-hop>` the client is still found, and a
 * client-typed entry to its left is never reached. An unparseable entry stops
 * the walk with null: it is never skipped to reach one further left. With only
 * internal entries there is no public client: null.
 */
export function clientIpFromHeaders(get: HeaderGetter): string | null {
  const raw = get("x-forwarded-for");
  if (!raw) return null;
  const entries = raw.split(",");
  let publicSeen = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const ip = normalizeIp(entries[i]!);
    if (ip === null) return null;
    if (isInternalIp(ip)) continue;
    if (++publicSeen === TRUSTED_PROXY_HOPS) return ip;
  }
  return null;
}

/** Same, for Hono contexts and anything with `req.header(name)`. */
export function clientIpOrNull(c: { req: { header(name: string): string | undefined } }): string | null {
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
