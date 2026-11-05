/**
 * TEMPORARY measurement of the production X-Forwarded-For SHAPE (incident
 * 2026-11-05-client-ip-identity-collapse; docs/operations/xff-shape-measurement.md).
 *
 * Emits at most XFF_SHAPE_MAX_LINES `xff-shape` lines per process, then goes
 * silent. Default ON; `XFF_SHAPE_LOG=0` turns it off. It logs counts, class
 * labels and booleans only. No address, no hash or prefix of an address, ever:
 * the only inputs that reach the log object are classifier outputs drawn from
 * a closed label set. Remove once a receipt has been written.
 */
import { createHmac, randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { rateLimitByIp } from "../lib/rate-limit.js";
import { log } from "../lib/log.js";

export type IpClass =
  | "public_v4"
  | "public_v6"
  | "private"
  | "cgnat"
  | "loopback"
  | "link_local"
  | "unparseable";

export const XFF_SHAPE_MAX_LINES = 200;
/** Positions classified per line; entry_count still reports the true total. */
const MAX_POSITIONS = 16;

function v4Class(o: number[]): IpClass {
  const [a, b] = o;
  if (a === 127) return "loopback";
  if (a === 169 && b === 254) return "link_local";
  if (a === 100 && b >= 64 && b <= 127) return "cgnat";
  if (
    a === 0 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (o[2] === 0 || o[2] === 2)) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && o[2] === 100) || (a === 203 && b === 0 && o[2] === 113) || a >= 224
  ) {
    return "private";
  }
  return "public_v4";
}

/** Strip brackets, port and zone; lowercase. Returns null when not an IP. */
function normalize(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  const bracket = /^\[([^\]]+)\](?::\d{1,5})?$/.exec(s);
  if (bracket) s = bracket[1];
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d{1,5}$/.test(s)) s = s.slice(0, s.lastIndexOf(":"));
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  s = s.toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(s);
  if (mapped) s = mapped[1];
  return isIP(s) ? s : null;
}

/** Classify one raw entry (optionally with port or brackets). Returns a label only. */
export function classifyIp(raw: string | null | undefined): IpClass {
  const s = normalize(raw);
  if (s === null) return "unparseable";
  if (isIP(s) === 4) return v4Class(s.split(".").map(Number));
  if (s === "::1") return "loopback";
  if (s === "::") return "private";
  const h = parseInt(s.split(":")[0] || "0", 16);
  if ((h & 0xffc0) === 0xfe80) return "link_local";
  if ((h & 0xfe00) === 0xfc00) return "private";
  if ((h & 0xff00) === 0xff00) return "private";
  return "public_v6";
}

/**
 * Distinct-value counters for the left-most and right-most XFF entries. Values
 * are kept only as HMAC-SHA256 under a random per-process key that is never
 * logged, persisted or exported, so nothing in memory is a reproducible address
 * hash. Only the set sizes leave this module, saturating at the cap.
 */
export const DISTINCT_CAP = 1000;
let hmacKey = randomBytes(32);
const leftSeen = new Set<string>();
const rightSeen = new Set<string>();

function observe(set: Set<string>, entry: string): void {
  if (set.size >= DISTINCT_CAP) return;
  const v = normalize(entry) ?? entry.trim();
  set.add(createHmac("sha256", hmacKey).update(v).digest("hex"));
}

/** Test helper: new key, empty sets. */
export function resetDistinctForTests(): void {
  hmacKey = randomBytes(32);
  leftSeen.clear();
  rightSeen.clear();
}

export interface XffShape {
  label: "xff-shape";
  entry_count: number;
  entries_truncated: boolean;
  distinct_left_most_seen: number;
  distinct_right_most_seen: number;
  left_most_equals_right_most: boolean;
  entry_classes: IpClass[];
  peer_class: IpClass;
  left_most_is_peer: boolean;
  x_real_ip_present: boolean;
  cf_connecting_ip_present: boolean;
  forwarded_present: boolean;
  x_forwarded_proto_present: boolean;
  x_forwarded_host_present: boolean;
}

export function buildShape(
  xff: string | null | undefined,
  peer: string | null | undefined,
  has: { realIp: boolean; cf: boolean; forwarded: boolean; proto: boolean; host: boolean },
): XffShape {
  const entries = xff ? xff.split(",").map((e) => e.trim()) : [];
  const leftMost = entries.length > 0 ? normalize(entries[0]) : null;
  if (entries.length > 0) {
    observe(leftSeen, entries[0]);
    observe(rightSeen, entries[entries.length - 1]);
  }
  const peerNorm = normalize(peer);
  return {
    label: "xff-shape",
    entry_count: entries.length,
    entries_truncated: entries.length > MAX_POSITIONS,
    distinct_left_most_seen: leftSeen.size,
    distinct_right_most_seen: rightSeen.size,
    left_most_equals_right_most:
      entries.length > 0 && (normalize(entries[0]) ?? entries[0]) === (normalize(entries[entries.length - 1]) ?? entries[entries.length - 1]),
    entry_classes: entries.slice(0, MAX_POSITIONS).map(classifyIp),
    peer_class: classifyIp(peer),
    left_most_is_peer: leftMost !== null && leftMost === peerNorm,
    x_real_ip_present: has.realIp,
    cf_connecting_ip_present: has.cf,
    forwarded_present: has.forwarded,
    x_forwarded_proto_present: has.proto,
    x_forwarded_host_present: has.host,
  };
}

/** Shape of the current request; shared by the logger and the debug route. */
export function shapeOfRequest(c: Context): XffShape {
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return buildShape(c.req.header("x-forwarded-for"), env?.incoming?.socket?.remoteAddress, {
    realIp: c.req.header("x-real-ip") !== undefined,
    cf: c.req.header("cf-connecting-ip") !== undefined,
    forwarded: c.req.header("forwarded") !== undefined,
    proto: c.req.header("x-forwarded-proto") !== undefined,
    host: c.req.header("x-forwarded-host") !== undefined,
  });
}

/**
 * TEMPORARY: GET /v1/debug/xff-shape. Unauthenticated; returns the structure of
 * the CALLER'S OWN request only (no addresses, hashes or ports), 20/min per IP.
 * Removed together with the logger once the receipt is written.
 */
export const xffShapeRoute = new Hono();
xffShapeRoute.get("/", rateLimitByIp(20, 60_000, "xff-shape-debug"), (c) => {
  c.header("cache-control", "no-store");
  return c.json(shapeOfRequest(c));
});

export function xffShapeLogger(opts: { maxLines?: number } = {}): MiddlewareHandler {
  const max = opts.maxLines ?? XFF_SHAPE_MAX_LINES;
  let emitted = 0;
  return async (c, next) => {
    // Flag read per request (one string compare) so tests can toggle it.
    if (emitted < max && process.env.XFF_SHAPE_LOG !== "0" && !c.req.path.startsWith("/health")) {
      emitted++;
      try {
        const shape = shapeOfRequest(c);
        log.info(shape, "xff-shape");
      } catch {
        // Measurement must never affect a request.
      }
    }
    await next();
  };
}
