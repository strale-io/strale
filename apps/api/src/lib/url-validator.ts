/**
 * SSRF protection — validates URLs and hostnames before server-side fetching.
 *
 * Blocks private IP ranges, link-local addresses, cloud metadata endpoints,
 * and internal Railway hostnames. Used by all capabilities that accept
 * user-supplied URLs or hostnames.
 */

import dns from "dns/promises";
import net from "net";

/** Distinguish invalid/restricted targets from a temporary network failure. */
export class UrlValidationError extends Error {}

const BLOCKED_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::]",
  "[::1]",
  "metadata.google.internal",
  "169.254.169.254",
  "metadata.internal",
]);

/**
 * Special-purpose ranges that must never be the target of a server-side
 * connection, as CIDR blocks. WP12 exit item 1 (CR-11): this replaced string
 * prefix matching, which missed whole ranges (IPv4-compatible `::/96`,
 * `100::/64`, `2001::/23`, `192.0.0.0/24`, `192.88.99.0/24`) and blocked
 * hostnames by their first letters (`fdic.gov`, `ffmpeg.org`).
 *
 * Sources: the IANA IPv4 and IPv6 Special-Purpose Address Registries, plus
 * carrier-grade NAT and multicast. IPv4-mapped IPv6 (`::ffff:0:0/96`) is
 * judged by the IPv4 table, so a mapped public address stays allowed.
 */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],        // "this network"
  ["10.0.0.0", 8],       // private
  ["100.64.0.0", 10],    // carrier-grade NAT (F-0-006)
  ["127.0.0.0", 8],      // loopback
  ["169.254.0.0", 16],   // link-local, cloud metadata
  ["172.16.0.0", 12],    // private
  ["192.0.0.0", 24],     // IETF protocol assignments
  ["192.0.2.0", 24],     // documentation
  ["192.88.99.0", 24],   // 6to4 relay anycast
  ["192.168.0.0", 16],   // private
  ["198.18.0.0", 15],    // benchmarking
  ["198.51.100.0", 24],  // documentation
  ["203.0.113.0", 24],   // documentation
  ["224.0.0.0", 4],      // multicast
  ["240.0.0.0", 4],      // reserved, broadcast
];
const BLOCKED_V6: Array<[string, number]> = [
  ["::", 96],            // unspecified, loopback, IPv4-compatible (deprecated)
  ["64:ff9b::", 96],     // NAT64
  ["64:ff9b:1::", 48],   // local-use NAT64
  ["100::", 64],         // discard-only
  ["2001::", 23],        // IETF protocol assignments, incl. Teredo 2001::/32
  ["2001:db8::", 32],    // documentation
  ["2002::", 16],        // 6to4
  ["fc00::", 7],         // unique-local, incl. AWS metadata fd00:ec2::254
  ["fe80::", 10],        // link-local
  ["fec0::", 10],        // site-local (deprecated)
  ["ff00::", 8],         // multicast
];

const V4_BLOCKLIST = new net.BlockList();
for (const [addr, prefix] of BLOCKED_V4) V4_BLOCKLIST.addSubnet(addr, prefix, "ipv4");
const V6_BLOCKLIST = new net.BlockList();
for (const [addr, prefix] of BLOCKED_V6) V6_BLOCKLIST.addSubnet(addr, prefix, "ipv6");

/** The IPv4 address an IPv4-mapped IPv6 address carries, or null. */
function mappedV4(v6: string): string | null {
  // Canonical (WHATWG) form compresses `::ffff:10.0.0.1` to `::ffff:a00:1`.
  const canonical = new URL(`http://[${v6}]/`).hostname.slice(1, -1);
  const m = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(canonical);
  if (!m) return null;
  const hi = parseInt(m[1], 16);
  const lo = parseInt(m[2], 16);
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

/**
 * True when `addr` is an IP address in a range a server-side connection must
 * never reach. A hostname is not an address: it returns false here and is
 * judged by the addresses it resolves to (validateUrl, validateHost, and
 * safe-fetch's connect-time lookup).
 */
export function isBlockedIp(addr: string): boolean {
  const a = addr.trim().toLowerCase();
  const family = net.isIP(a);
  if (family === 4) return V4_BLOCKLIST.check(a, "ipv4");
  if (family === 6) {
    // A zone ID (`fe80::1%eth0`) scopes the address to a local interface by
    // definition, and the canonicaliser below cannot parse one: refuse it.
    if (a.includes("%")) return true;
    const v4 = mappedV4(a);
    if (v4 !== null) return V4_BLOCKLIST.check(v4, "ipv4");
    return V6_BLOCKLIST.check(a, "ipv6");
  }
  return false;
}

/**
 * Split a host argument into the host and an optional port. Accepts a bare
 * hostname or IP, `host:port`, `[v6]` and `[v6]:port`. Returns null for any
 * other shape, such as a string with stray colons that is not an IP: it must
 * be refused, never resolved, or a mangled IPv6 literal fails DNS and passes.
 */
function splitHostPort(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(s);
  if (bracketed) return net.isIP(bracketed[1]) === 6 ? bracketed[1] : null;
  if (net.isIP(s)) return s;
  const colons = s.split(":").length - 1;
  if (colons === 0) return s;
  if (colons === 1 && /:\d+$/.test(s)) return s.replace(/:\d+$/, "");
  return null;
}

/**
 * Validate a URL string for safe server-side fetching.
 * Throws if the URL targets a blocked host/IP.
 *
 * F-0-006: scheme allowlist is explicit — `file:`, `gopher:`, `ftp:`,
 * `javascript:`, `data:`, `dict:`, and everything else is rejected.
 * Callers that follow redirects must re-run this validator on every
 * `Location` URL (see lib/safe-fetch.ts).
 */
export async function validateUrl(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new UrlValidationError("Invalid URL format.");
  }

  // Only allow http/https — every other scheme is an SSRF amplifier.
  // `file://`, `gopher://`, `dict://`, `ftp://`, `javascript:`, `data:`,
  // and friends all fall through to the reject branch.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new UrlValidationError(
      `URL scheme "${parsed.protocol}" is not allowed. Only http and https URLs are permitted.`,
    );
  }

  // F-0-006: WHATWG URL leaves literal IPv6 hostnames wrapped in
  // brackets, which defeats `net.isIP`. Strip them before the IP check
  // so `http://[::ffff:10.0.0.1]/` and `http://[::1]/` are caught.
  const rawHost = parsed.hostname.toLowerCase();
  const hostname = rawHost.startsWith("[") && rawHost.endsWith("]")
    ? rawHost.slice(1, -1)
    : rawHost;

  // Block known dangerous hosts
  if (BLOCKED_HOSTS.has(hostname)) {
    throw new UrlValidationError("This URL targets a restricted address.");
  }

  // Block .internal domains (Railway internal networking)
  if (hostname.endsWith(".internal")) {
    throw new UrlValidationError("This URL targets a restricted address.");
  }

  // If hostname is already an IP, check it directly
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new UrlValidationError("This URL targets a restricted address.");
    }
    return;
  }

  // Resolve DNS and check all resulting IPs
  try {
    const [v4, v6] = await Promise.allSettled([
      dns.resolve4(hostname),
      dns.resolve6(hostname),
    ]);
    const addresses = [
      ...(v4.status === "fulfilled" ? v4.value : []),
      ...(v6.status === "fulfilled" ? v6.value : []),
    ];

    for (const addr of addresses) {
      if (isBlockedIp(addr)) {
        throw new UrlValidationError("This URL resolves to a restricted address.");
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("restricted")) throw err;
    // DNS resolution failed — let the actual fetch handle it
  }
}

/**
 * Validate a hostname (without protocol) for safe server-side connection.
 * Used by port-check, ssl-certificate-chain, and similar capabilities.
 */
export async function validateHost(hostname: string): Promise<void> {
  const clean = splitHostPort(hostname);
  if (clean === null) {
    throw new UrlValidationError("This host is not a valid hostname or IP address.");
  }

  if (BLOCKED_HOSTS.has(clean)) {
    throw new UrlValidationError("This host targets a restricted address.");
  }

  if (clean.endsWith(".internal")) {
    throw new UrlValidationError("This host targets a restricted address.");
  }

  if (net.isIP(clean)) {
    if (isBlockedIp(clean)) {
      throw new UrlValidationError("This host targets a restricted address.");
    }
    return;
  }

  try {
    const [v4, v6] = await Promise.allSettled([
      dns.resolve4(clean),
      dns.resolve6(clean),
    ]);
    const addresses = [
      ...(v4.status === "fulfilled" ? v4.value : []),
      ...(v6.status === "fulfilled" ? v6.value : []),
    ];

    for (const addr of addresses) {
      if (isBlockedIp(addr)) {
        throw new UrlValidationError("This host resolves to a restricted address.");
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("restricted")) throw err;
  }
}
