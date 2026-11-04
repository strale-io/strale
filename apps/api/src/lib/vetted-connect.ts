/**
 * Raw-socket connections that only reach a vetted address (WP12 batch 2,
 * CR-11).
 *
 * validateHost checks what a hostname resolves to, but a socket opened with
 * the *name* resolves it again. A rebinding DNS server answers a public
 * address to the check and 127.0.0.1, 169.254.169.254 or fd00::1 to the
 * connection. The capabilities that open raw TCP or TLS sockets to a
 * caller-supplied host (port-check, ssl-check, ssl-certificate-chain)
 * connect through this module instead:
 *
 *   1. `vettedLookup` is passed as the socket's `lookup`. Node calls it once,
 *      at connect time, and connects to exactly the addresses it returns. It
 *      resolves with getaddrinfo (what the socket would have used) and
 *      refuses the whole answer if ANY address is blocked, so the address
 *      the socket uses is the address that was checked.
 *   2. On TCP connect, the peer address is checked again before anything is
 *      sent. An IP-literal host skips `lookup` entirely; this is where a
 *      literal is caught if validateHost was bypassed.
 *
 * TLS keeps `servername` as the caller passes it (the original hostname), so
 * SNI and certificate identity checks are unchanged.
 *
 * safe-fetch has its own connect-time lookup for HTTP; this is the raw-socket
 * counterpart. Callers still run validateHost first, for its static checks
 * and an early, clearer refusal.
 */

import dns, { type LookupAddress, type LookupOptions } from "node:dns";
import net from "node:net";
import tls from "node:tls";
import { isBlockedIp } from "./url-validator.js";
import { logWarn } from "./log.js";

/** Error code on every refusal from this module. */
export const SSRF_BLOCKED = "ESSRFBLOCKED";

function blocked(hostname: string, addresses: string): NodeJS.ErrnoException {
  logWarn("ssrf-blocked-connect", "Raw socket target resolved to a blocked range", {
    hostname,
    addresses,
  });
  const err = new Error("Resolved host targets a restricted address.") as NodeJS.ErrnoException;
  err.code = SSRF_BLOCKED;
  return err;
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * A `lookup` for net.connect / tls.connect. Resolves `hostname` once, refuses
 * if any returned address is blocked, and hands the socket exactly the
 * addresses it checked (all of them for `all: true`, else the first of the
 * requested family).
 */
export function vettedLookup(
  hostname: string,
  options: LookupOptions | number | LookupCallback,
  callback?: LookupCallback,
): void {
  const cb = (typeof options === "function" ? options : callback) as LookupCallback;
  const opts: LookupOptions =
    typeof options === "object" && options !== null
      ? options
      : typeof options === "number"
        ? { family: options }
        : {};
  const family = opts.family === "IPv4" ? 4 : opts.family === "IPv6" ? 6 : Number(opts.family ?? 0);

  dns.lookup(
    hostname,
    { family, hints: opts.hints, all: true, verbatim: true },
    (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => {
      if (err) return cb(err, opts.all ? [] : "");
      if (addresses.length === 0) {
        const none = new Error(`getaddrinfo ENOTFOUND ${hostname}`) as NodeJS.ErrnoException;
        none.code = "ENOTFOUND";
        return cb(none, opts.all ? [] : "");
      }
      if (addresses.some((a) => isBlockedIp(a.address))) {
        return cb(blocked(hostname, addresses.map((a) => a.address).join(",")), opts.all ? [] : "");
      }
      if (opts.all) return cb(null, addresses);
      cb(null, addresses[0].address, addresses[0].family);
    },
  );
}

/**
 * Check the peer the moment TCP connects, before any other `connect`
 * listener runs (and so before a TLS ClientHello is sent). A blocked or
 * unknown peer destroys the socket with an ESSRFBLOCKED error.
 *
 * EventEmitter cannot stop the later `connect` listeners, so a caller's own
 * `connect` listener must check `socket.destroyed` (connectTcpVetted does).
 * For TLS the later listener is the handshake start, which returns early on
 * a destroyed socket.
 */
function guardPeer<T extends net.Socket>(socket: T, hostname: string): T {
  socket.prependOnceListener("connect", () => {
    const peer = socket.remoteAddress;
    if (peer === undefined || isBlockedIp(peer)) {
      socket.destroy(blocked(hostname, String(peer)));
    }
  });
  return socket;
}

export interface VettedTcpOptions {
  host: string;
  port: number;
  /** Idle timeout before the attempt is abandoned with code ETIMEDOUT. */
  timeoutMs: number;
}

/**
 * Open a TCP connection to `host:port` through the vetted lookup and peer
 * check. Resolves with the connected socket (the caller destroys it);
 * rejects on refusal (code ESSRFBLOCKED), timeout (code ETIMEDOUT) or any
 * socket error.
 */
export function connectTcpVetted({ host, port, timeoutMs }: VettedTcpOptions): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = guardPeer(new net.Socket(), host);
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => {
      if (socket.destroyed) return; // refused by guardPeer; its error rejects
      socket.setTimeout(0);
      resolve(socket);
    });
    socket.once("timeout", () => {
      const err = new Error(`connect ETIMEDOUT ${host}:${port}`) as NodeJS.ErrnoException;
      err.code = "ETIMEDOUT";
      socket.destroy();
      reject(err);
    });
    socket.once("error", reject);
    socket.connect({ host, port, lookup: vettedLookup });
  });
}

/**
 * tls.connect through the vetted lookup and peer check. Same options and
 * callback as tls.connect; `lookup` is always this module's. A refusal
 * arrives as the socket's `error` event (code ESSRFBLOCKED), before the
 * handshake, so `secureConnect` never fires.
 *
 * `socket` (an already-connected stream), `path` (a Unix socket) and `lookup`
 * would each route around the guard, so the type omits them and a caller
 * that passes one anyway (an untyped caller, a cast) gets a throw.
 */
export type VettedTlsOptions = Omit<tls.ConnectionOptions, "socket" | "path" | "lookup"> & { host: string };

const TLS_BYPASS_OPTIONS = ["socket", "path", "lookup"] as const;

export function connectTlsVetted(
  options: VettedTlsOptions,
  secureConnectListener?: () => void,
): tls.TLSSocket {
  for (const key of TLS_BYPASS_OPTIONS) {
    if ((options as Record<string, unknown>)[key] !== undefined) {
      throw new TypeError(`connectTlsVetted does not accept '${key}': it would bypass the connect-time check.`);
    }
  }
  const socket = tls.connect({ ...options, lookup: vettedLookup }, secureConnectListener);
  return guardPeer(socket, options.host);
}
