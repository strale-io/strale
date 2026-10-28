import { currentAcquisitionMethod, type AcquisitionMethod } from "./data-access.js";
import { asSourceBlocked, SiteAccessRefusedError, STRALE_USER_AGENT } from "./site-access.js";
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
import { assertTargetAllowed, findProhibitedTarget } from "./tos-blocklist.js";
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

/** Bound DNS validation too, before fetch can observe its AbortSignal.
 * A late DNS result cannot resume the rejected request or open a socket.
 */
async function validateBeforeFetch(target: string, signal: AbortSignal | null | undefined): Promise<void> {
  signal?.throwIfAborted();
  if (!signal) return validateUrl(target);
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    validateUrl(target).then(
      () => { signal.removeEventListener("abort", onAbort); resolve(); },
      error => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}

// ─── Public safeFetch ─────────────────────────────────────────────────────────

export interface SafeFetchOptions extends Omit<RequestInit, "redirect"> {
  /** Defaults to the executing capability manifest; explicit method for mixed API/page paths. */
  acquisitionMethod?: AcquisitionMethod;
  /** DEC-20261023-A reading confirmed by Petter (H6 round 2): robots governs
   * page-content retrieval, not customer-named status/header/redirect probes.
   * Only use for probes returning no page content, or robots.txt itself.
   * SSRF, ToS and honest identification still apply on every hop.
   */
  purpose?: "availability_probe";
  /** Per-hop network time, including failures, measured after robots policy checks. */
  onRequestTiming?: (durationMs: number) => void;
  /** Maximum number of redirects to follow. Default: 3. Set to 0 to refuse. */
  maxRedirects?: number;
  /**
   * Cert-audit C6: hard timeout for the entire request (including all
   * redirect hops). Default 60s. Pass an explicit `signal` in `init` to
   * override; pass `timeoutMs: 0` to disable (only for opted-in long-poll
   * cases, never for normal capability fetches).
   */
  timeoutMs?: number;
  /**
   * Phase-4 tail fix: when the hop count exceeds `maxRedirects`, RETURN the
   * 3xx response at the cap instead of throwing. Default false, so every
   * existing caller keeps the "throw past the cap" behaviour unchanged.
   *
   * Exists for redirect-trace, which calls `safeFetch(url, {maxRedirects:
   * 0})` expecting the first 3xx response back so it can walk the chain
   * itself. Without this flag `maxRedirects: 0` always throws on the first
   * redirect — `followRedirects` increments `hop` to 1 before the
   * `hop > maxRedirects` check, so `1 > 0` is true on every redirect,
   * including the very first one (introduced in commit 1f0d480,
   * 2026-04-17, swapping raw `fetch(url, {redirect:'manual'})` for
   * safeFetch under a wrong equivalence assumption — raw fetch with
   * `redirect: 'manual'` returns the 3xx; `safeFetch` with `maxRedirects:
   * 0` throws instead).
   *
   * SSRF guarantee preserved: the URL at the cap has already been
   * `validate()`-d (it's the URL we just fetched, validated at the top of
   * this same loop iteration, same as every other hop). This flag changes
   * only what happens to the response once the cap is hit — it does not
   * skip or reorder any validation.
   */
  returnOnRedirectCap?: boolean;
}

const DEFAULT_MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
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
  const { maxRedirects = DEFAULT_MAX_REDIRECTS, timeoutMs, returnOnRedirectCap, purpose, acquisitionMethod = currentAcquisitionMethod(), onRequestTiming, ...init } = opts;

  // Per-source ToS policy is enforced at the fetch layer, not only in the
  // capabilities that remember to call it (P2, 2026-08-12 — three separate
  // capabilities had shipped ungated). Pure string check, throws with
  // TOS_REFUSAL_MARKER so breakers classify it as caller error and DEC-14
  // leaves the caller unbilled. Redirect hops re-check below.
  assertTargetAllowed(String(url));

  // Cert-audit C6: ensure every safeFetch caller is timeout-bounded so a
  // stuck upstream can't pin a connection or pool slot indefinitely.
  // Caller's own signal wins if provided; otherwise apply DEFAULT_TIMEOUT_MS.
  // `timeoutMs: 0` opts out (long-poll endpoints only).
  const effectiveTimeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!init.signal && effectiveTimeout > 0) {
    init.signal = AbortSignal.timeout(effectiveTimeout);
  }

  const pageRead = acquisitionMethod === "public_page_read" || acquisitionMethod === "customer_directed_fetch";
  if (pageRead || purpose === "availability_probe") {
    const headers = new Headers(init.headers);
    headers.set("User-Agent", STRALE_USER_AGENT);
    init.headers = headers;
  }
  return followRedirects(
    typeof url === "string" ? url : url.toString(),
    init,
    maxRedirects,
    async (target) => {
      await validateBeforeFetch(target, init.signal);
      if (pageRead && purpose !== "availability_probe") {
        // Lazy import keeps robots.txt's own safeFetch dependency acyclic at load time.
        const { assertRobotsAllowed } = await import("./robots-txt.js");
        try { await assertRobotsAllowed(target); }
        catch (err) {
          if (acquisitionMethod === "public_page_read" && err instanceof SiteAccessRefusedError) {
            throw asSourceBlocked(err, target);
          }
          throw err;
        }
      }
    },
    returnOnRedirectCap ?? false,
    onRequestTiming,
  );
}

/**
 * Cancel a response body we are not going to read (#428 review).
 *
 * Abandoning a response mid-flight without cancelling pins the keep-alive
 * connection until GC. This module already held two hand-rolled copies of the
 * idiom (the 3xx paths below) and the wording every other copy borrows, so the
 * shared one lives here — `capabilities/lib` could not host it without
 * inverting the import direction.
 */
export async function discardBody(response: Response, reason: string): Promise<void> {
  await response.body
    ?.cancel()
    .catch((err) =>
      logWarn("response-body-cancel-failed", "could not cancel unread body", {
        reason,
        err: String(err),
      }),
    );
}

/**
 * Exported for test coverage (F-0-006). Runs the redirect-follow loop with
 * an injectable `validate` function so tests can exercise loop mechanics
 * (cap, Location parsing, per-hop re-validation) against loopback servers
 * without fighting the real `validateUrl`'s private-IP refusal.
 *
 * Production callers use `safeFetch`, which always passes the real
 * `validateUrl`. Don't call `followRedirects` directly from application
 * code — its `validate` parameter is a test seam, not a policy hook.
 */
export async function followRedirects(
  url: string,
  init: Omit<RequestInit, "redirect">,
  maxRedirects: number,
  validate: (u: string) => Promise<void>,
  returnOnCap = false,
  onRequestTiming?: (durationMs: number) => void,
): Promise<Response> {
  let current = url;
  let hop = 0;

  while (true) {
    await validate(current);

    // `dispatcher` is the undici-native way to pass a custom connector to
    // Node's built-in fetch. Passing `agent` is ignored by undici so we
    // cannot use the classic http.Agent here. lib.dom.d.ts doesn't know
    // about `dispatcher`, hence the local cast.
    const initWithDispatcher: RequestInit & { dispatcher: UndiciAgent } = {
      ...init,
      redirect: "manual",
      dispatcher: safeDispatcher,
    };
    // Start after validate(), including its robots check, on every hop.
    const start = Date.now();
    let response: Response;
    try {
      response = await fetch(current, initWithDispatcher as RequestInit);
    } finally {
      onRequestTiming?.(Date.now() - start);
    }

    if (!REDIRECT_STATUSES.has(response.status)) {
      return response;
    }

    const location = response.headers.get("location");
    if (!location) return response;

    hop++;
    if (hop > maxRedirects) {
      if (returnOnCap) {
        // The URL that produced this response was validated at the top of
        // this same loop iteration (same as every other hop) — returning
        // it instead of throwing changes nothing about the SSRF guarantee,
        // only who's responsible for deciding whether to follow further.
        return response;
      }
      logWarn("ssrf-too-many-redirects", "Exceeded maxRedirects", {
        start: url,
        hops: hop,
      });
      // Cancel the unconsumed 3xx body — throwing with it open pins the
      // keep-alive connection until GC (review L-1).
      await response.body?.cancel().catch((err) => logWarn("redirect-body-cancel-failed", "3xx body cancel failed (connection may pin until GC)", { err: String(err) }));
      throw new Error(
        `Too many redirects (>${maxRedirects}) — refusing to follow further. Starting URL: ${url}.`,
      );
    }

    current = new URL(location, current).toString();
    // A redirect into a ToS-prohibited host is the same policy violation as
    // fetching it directly (bit.ly → linkedin.com must not slip through).
    // Cancel the unconsumed 3xx body before a potential throw (review L-1).
    if (findProhibitedTarget(current)) {
      await response.body?.cancel().catch((err) => logWarn("redirect-body-cancel-failed", "3xx body cancel failed (connection may pin until GC)", { err: String(err) }));
    }
    assertTargetAllowed(current);
  }
}
