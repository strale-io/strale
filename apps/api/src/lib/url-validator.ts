/**
 * SSRF protection — validates URLs and hostnames before server-side fetching.
 *
 * Blocks private IP ranges, link-local addresses, cloud metadata endpoints,
 * and internal Railway hostnames. Used by all capabilities that accept
 * user-supplied URLs or hostnames.
 */

import dns from "dns/promises";
import net from "net";

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
 * Check if an IP address is in a blocked range (private, link-local, loopback,
 * carrier-grade NAT, cloud metadata). F-0-006: extended to close common SSRF
 * bypasses (IPv4-mapped IPv6, 100.64/10, cloud metadata IPv6).
 */
export function isBlockedIp(addr: string): boolean {
  const a = addr.toLowerCase();

  // ── Loopback ──
  if (a === "127.0.0.1" || a === "::1" || a.startsWith("127.")) return true;

  // ── IPv4 private ranges ──
  if (a.startsWith("10.")) return true;
  if (a.startsWith("192.168.")) return true;
  if (a.startsWith("172.")) {
    const second = parseInt(a.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // ── Carrier-grade NAT 100.64.0.0/10 (F-0-006) ──
  // A server reaching an address in this range is almost certainly hitting
  // the provider's internal network, not public internet.
  if (a.startsWith("100.")) {
    const second = parseInt(a.split(".")[1], 10);
    if (second >= 64 && second <= 127) return true;
  }

  // ── Link-local ──
  if (a.startsWith("169.254.")) return true;

  // ── IPv6 private / link-local / unique-local ──
  if (a.startsWith("fc00:") || a.startsWith("fd")) return true;
  if (a.startsWith("fe80:")) return true;

  // ── IPv4-mapped IPv6 (F-0-006) ──
  // `::ffff:10.0.0.1` is the dotted-quad form; `::ffff:a00:1` is the
  // URL/WHATWG-normalized hex-compact form of the same address. Both
  // must map through the IPv4 blocklist, or an attacker trivially
  // bypasses the IPv4 ranges above by switching representations.
  if (a.startsWith("::ffff:")) {
    const mapped = a.slice(7);
    // Already dotted-quad? (contains a `.`)
    if (mapped.includes(".")) return isBlockedIp(mapped);
    // Hex-compact form: two 16-bit groups like `a00:1` (= 0x0a00 0x0001
    // = 10.0.0.1). Convert to dotted-quad then re-apply the IPv4 check.
    const groups = mapped.split(":");
    if (groups.length === 2 && groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) {
      const hi = parseInt(groups[0], 16);
      const lo = parseInt(groups[1], 16);
      const quad = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      return isBlockedIp(quad);
    }
    // Unrecognised ::ffff: shape — be conservative and block.
    return true;
  }

  // ── Cloud metadata IPv6 (F-0-006) ──
  // AWS EC2 metadata: fd00:ec2::254 (canonical), fd00:ec2:: range.
  // The fd-prefix already matches via the IPv6 private check above but the
  // explicit guard makes the intent auditable.
  if (a.startsWith("fd00:ec2:")) return true;

  // ── Unspecified ──
  if (a === "0.0.0.0" || a === "::") return true;

  return false;
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
    throw new Error("Invalid URL format.");
  }

  // Only allow http/https — every other scheme is an SSRF amplifier.
  // `file://`, `gopher://`, `dict://`, `ftp://`, `javascript:`, `data:`,
  // and friends all fall through to the reject branch.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
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
    throw new Error("This URL targets a restricted address.");
  }

  // Block .internal domains (Railway internal networking)
  if (hostname.endsWith(".internal")) {
    throw new Error("This URL targets a restricted address.");
  }

  // If hostname is already an IP, check it directly
  if (net.isIP(hostname)) {
    if (isBlockedIp(hostname)) {
      throw new Error("This URL targets a restricted address.");
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
        throw new Error("This URL resolves to a restricted address.");
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
  const clean = hostname.toLowerCase().replace(/:\d+$/, "");

  if (BLOCKED_HOSTS.has(clean)) {
    throw new Error("This host targets a restricted address.");
  }

  if (clean.endsWith(".internal")) {
    throw new Error("This host targets a restricted address.");
  }

  if (net.isIP(clean)) {
    if (isBlockedIp(clean)) {
      throw new Error("This host targets a restricted address.");
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
        throw new Error("This host resolves to a restricted address.");
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("restricted")) throw err;
  }
}
