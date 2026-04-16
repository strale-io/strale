/**
 * safeFetch: fetch() wrapper that resists SSRF (F-0-006).
 *
 * What it closes that raw `fetch` does not:
 *   1. `validateUrl()` is applied to the initial URL before any network I/O.
 *   2. A custom undici `Agent` with a `lookup` callback re-checks the
 *      resolved IP at connection time. This catches DNS rebinding: DNS
 *      returns a public IP at validation time, then a private one at
 *      connection time. (Node's built-in fetch is undici-backed; the
 *      classic `https.Agent` does NOT flow through it, so we pass an
 *      undici Dispatcher via `dispatcher`, not `agent`.)
 *   3. `redirect: "manual"` + our own redirect loop — every `Location`
 *      URL is re-validated before we follow it. Raw fetch with
 *      `redirect: "follow"` is the classic SSRF bypass.
 *   4. `isBlockedIp` covers IPv4-mapped IPv6, 100.64/10 carrier-grade
 *      NAT, and cloud metadata IPv6 ranges (F-0-006 hardening).
 *
 * Capabilities that accept user-supplied URLs should call `safeFetch`
 * instead of raw `fetch`. Capabilities that delegate the actual fetch
 * to a third-party service (e.g. Browserless) cannot use the custom
 * dispatcher — they MUST still call `validateUrl` before forwarding
 * the URL. See `web-extract.ts` for that pattern.
 */

import { Agent as UndiciAgent } from "undici";
import { Agent as HttpsAgent } from "node:https";
import { Agent as HttpAgent } from "node:http";
import { lookup as dnsLookup, type LookupOptions } from "node:dns";
import { isBlockedIp, validateUrl } from "./url-validator.js";
import { logWarn } from "./log.js";

// ─── Custom lookup that re-applies isBlockedIp ────────────────────────────────

function ssrfBlocked(hostname: string, address: string): NodeJS.ErrnoException {
  logWarn("ssrf-blocked-resolution", "Resolved IP is in a blocked range", {
    hostname,
    address,
  });
  const err = new Error(
    "Resolved host targets a restricted address.",
  ) as NodeJS.ErrnoException;
  err.code = "ESSRFBLOCKED";
  return err;
}

/**
 * Wraps `dns.lookup` and refuses to return any address whose resolved IP
 * falls in a blocked range. Called right before the socket is opened, so
 * it plugs the DNS-rebinding window between `validateUrl`'s own lookup
 * and the real connection.
 *
 * Uses Node's LookupFunction shape, which is
 *   (hostname, options: LookupOptions, callback): void
 * and supports both `all: true` (returns LookupAddress[]) and default
 * (returns a single string). We forward to `dnsLookup` unchanged and
 * post-filter the result.
 */
// Cast via `any` at the call-site below rather than re-typing Node's
// overload union here — the two overloads are hard to express in a
// single signature without double-declaring.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function safeLookup(hostname: string, options: LookupOptions, callback: any): void {
  // Forward options to dnsLookup with a post-filter callback.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (dnsLookup as any)(hostname, options, (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => {
    if (err) return callback(err);

    if (Array.isArray(address)) {
      // `all: true` path — array of { address, family }.
      const arr = address as Array<{ address: string; family: number }>;
      const safe = arr.filter((a) => !isBlockedIp(a.address));
      if (safe.length === 0) {
        return callback(
          ssrfBlocked(hostname, arr.map((a) => a.address).join(",")),
        );
      }
      return callback(null, safe);
    }

    if (typeof address === "string" && isBlockedIp(address)) {
      return callback(ssrfBlocked(hostname, address));
    }
    return callback(null, address as string, family);
  });
}

// ─── Dispatcher for undici-backed `fetch` ─────────────────────────────────────
//
// This is what actually protects the `fetch()` call against DNS rebinding.
// Node 18+ `fetch` is undici; it takes a `dispatcher`, not an `agent`.

const safeDispatcher = new UndiciAgent({
  connect: { lookup: safeLookup },
  // Keep-alive ok here — undici manages its own pool.
});

// ─── Node-style agents (exported for libraries that take `agent: ...`) ────────
//
// Some SDKs (node-fetch, axios, http/https.request) accept a classic
// http.Agent / https.Agent. Export those too so callers can reuse the
// same SSRF-safe path without having to know about dispatchers.

export const safeHttpAgent = new HttpAgent({ lookup: safeLookup, keepAlive: true });
export const safeHttpsAgent = new HttpsAgent({ lookup: safeLookup, keepAlive: true });
export { safeDispatcher };

// ─── Public safeFetch ─────────────────────────────────────────────────────────

export interface SafeFetchOptions extends Omit<RequestInit, "redirect"> {
  /** Maximum number of redirects to follow. Default: 3. Set to 0 to refuse. */
  maxRedirects?: number;
}

const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Drop-in replacement for `fetch()` that validates the URL (and every
 * redirect target) and routes through an undici Dispatcher that re-checks
 * the resolved IP at connection time.
 *
 * Behaviour differences from raw `fetch`:
 *   - The URL is validated before any network I/O.
 *   - Redirects are followed manually with per-hop re-validation. Hops
 *     beyond `maxRedirects` (default 3) throw.
 *   - Non-http(s) schemes and resolved-private-IP hosts throw synchronously
 *     via validateUrl.
 *   - DNS rebinding at connection time is refused by the dispatcher.
 */
export async function safeFetch(
  url: string | URL,
  opts: SafeFetchOptions = {},
): Promise<Response> {
  const { maxRedirects = DEFAULT_MAX_REDIRECTS, ...init } = opts;
  let current = typeof url === "string" ? url : url.toString();
  let hop = 0;

  while (true) {
    await validateUrl(current);

    // `dispatcher` is the undici-native way to pass a custom connector to
    // Node's built-in fetch. Passing `agent` is ignored by undici so we
    // cannot use the classic http.Agent here. lib.dom.d.ts doesn't know
    // about `dispatcher`, hence the local cast.
    const initWithDispatcher: RequestInit & { dispatcher: UndiciAgent } = {
      ...init,
      redirect: "manual",
      dispatcher: safeDispatcher,
    };
    const response = await fetch(current, initWithDispatcher as RequestInit);

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) return response;

    hop++;
    if (hop > maxRedirects) {
      logWarn("ssrf-too-many-redirects", "Exceeded maxRedirects", {
        start: url,
        hops: hop,
      });
      throw new Error(
        `Too many redirects (>${maxRedirects}) — refusing to follow further. Starting URL: ${url}.`,
      );
    }

    current = new URL(location, current).toString();
  }
}
