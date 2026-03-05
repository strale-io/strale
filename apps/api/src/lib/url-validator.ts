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
 * Check if an IP address is in a blocked range (private, link-local, loopback).
 */
function isBlockedIp(addr: string): boolean {
  // Loopback
  if (addr === "127.0.0.1" || addr === "::1" || addr.startsWith("127.")) return true;

  // IPv4 private ranges
  if (addr.startsWith("10.")) return true;
  if (addr.startsWith("192.168.")) return true;
  if (addr.startsWith("172.")) {
    const second = parseInt(addr.split(".")[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  // Link-local
  if (addr.startsWith("169.254.")) return true;

  // IPv6 private/link-local
  if (addr.startsWith("fc00:") || addr.startsWith("fd")) return true;
  if (addr.startsWith("fe80:")) return true;

  // Unspecified
  if (addr === "0.0.0.0" || addr === "::") return true;

  return false;
}

/**
 * Validate a URL string for safe server-side fetching.
 * Throws if the URL targets a blocked host/IP.
 */
export async function validateUrl(urlString: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error("Invalid URL format.");
  }

  // Only allow http/https
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }

  const hostname = parsed.hostname.toLowerCase();

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
