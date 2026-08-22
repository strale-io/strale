/**
 * The only sanctioned way for an operator script to reach production.
 *
 * `lib/production-authority.ts` answers "was this write permitted". This answers
 * "what connection do you get", and the two are deliberately joined: a writable
 * handle cannot be obtained without an `Authority` value, because the credential
 * is released by `productionWriteUrl(authority)` and by nothing else.
 *
 * ── Why a second module and not a second model ──────────────────────────────
 *
 * There is ONE authorization authority: `production-authority.ts`. An earlier
 * revision of this branch shipped a competing `production-access.ts` with its
 * own verifier abstraction; it has been deleted. Two answers to "who permitted
 * this" is the divergence failure this repository keeps paying for, and the
 * ed25519 model is the stronger of the two — it refuses to run in a process that
 * could mint a grant, which is the assumption everything else rests on.
 *
 * This module contains no authorization logic. It holds connections.
 *
 * ── The default is read-only, and it is enforced by Postgres ────────────────
 *
 * `openOperatorDb()` sets `default_transaction_read_only=on` as a server-side
 * connection parameter. Every implicit and explicit transaction on that
 * connection starts read-only, and INSERT/UPDATE/DELETE/DDL fail with SQLSTATE
 * 25006. A session with the whole `.env`, root on the machine, and the ability
 * to edit any file in the repository still cannot write through this handle.
 *
 * That is belt to `DATABASE_URL`-is-a-read-only-role's braces. The role is the
 * primary barrier and lives in infrastructure; this is the barrier that holds
 * even when someone points `DATABASE_URL` at a superuser by mistake, which is
 * exactly the mistake a hurried operator makes.
 */

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "../db/schema.js";
import {
  type Authority,
  productionWriteUrl,
} from "./production-authority.js";

/**
 * TLS is decided by the connection string, never by a hardcoded flag.
 *
 * The previous revision pinned `ssl: false`, which is right for the Railway
 * public proxy (`metro.proxy.rlwy.net` does not terminate TLS) and wrong for
 * everything else. Hardcoding it means a handle pointed at a TLS-terminating
 * replica fails with `ECONNRESET` / "socket disconnected before secure TLS
 * connection" — an error that reads as a network fault and is not, which is
 * already a documented trap for prod read-only access here.
 *
 * postgres.js parses `?sslmode=` from the URL itself, so the correct behaviour
 * is to pass no `ssl` option at all and let the URL govern. What this function
 * adds is a loud complaint when the URL is silent about TLS while pointing
 * somewhere that is not loopback — silence there means "plaintext to a remote
 * host", which should never be an accident.
 */
export function assertSslIntentIsExplicit(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Database URL is not parseable; refusing to connect.");
  }

  const host = parsed.hostname.toLowerCase();
  const isLoopback =
    host === "localhost" || host === "127.0.0.1" || host === "::1";
  const declaresSsl = parsed.searchParams.has("sslmode");

  if (!isLoopback && !declaresSsl) {
    throw new Error(
      `The database URL for host '${host}' does not say whether to use TLS. ` +
        "Append '?sslmode=disable' for a plaintext proxy (the Railway public " +
        "proxy at metro.proxy.rlwy.net is one) or '?sslmode=require' for a host " +
        "that terminates TLS. This used to be a hardcoded ssl:false, which " +
        "silently sent plaintext to whatever it was pointed at and failed with " +
        "a misleading ECONNRESET against anything that expected TLS.",
    );
  }
}

/** Shared bounds. A pinned pool slot is a production hazard read-only or not. */
const TIMEOUTS = {
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 60_000,
} as const;

/**
 * A production handle that cannot write. This is what an autonomous session
 * gets, and for investigation work it is all it should ever need.
 */
export function openOperatorDb(connectionString?: string): postgres.Sql {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url || url.trim().length === 0) {
    throw new Error("DATABASE_URL is required for a read-only operator handle.");
  }
  assertSslIntentIsExplicit(url);
  return postgres(url, {
    max: 2,
    prepare: false,
    connection: {
      // The enforcement. Server-side, so it holds regardless of what the
      // client believes or forgets.
      default_transaction_read_only: true,
      ...TIMEOUTS,
    },
  });
}

/**
 * A production handle that CAN write, released only against an Authority.
 *
 * The Authority is not decoration and is not checked here — `productionWriteUrl`
 * is what refuses, and it refuses in two independent ways: no Authority value,
 * or no `DATABASE_URL_WRITE` in the environment. An autonomous session has
 * neither, so the common case is not "the write was denied", it is "there was
 * nothing to write with".
 *
 * Build the Authority with `autonomousAuthority()` for an action the escalation
 * contract already delegates, or `requireFounderGrant()` for anything else.
 * There is no third way and no string that substitutes for either.
 */
export function openOperatorWriteDb(authority: Authority): postgres.Sql {
  const url = productionWriteUrl(authority);
  assertSslIntentIsExplicit(url);
  return postgres(url, {
    max: 2,
    prepare: false,
    connection: { ...TIMEOUTS },
  });
}

/**
 * The same handle, wrapped in Drizzle, for the scripts that speak the ORM.
 *
 * Exists so migrating a `getDb()` script is a one-line change. A migration that
 * requires rewriting each script's query layer does not get done, and a control
 * nobody adopts is not a control.
 */
export function openOperatorWriteDrizzle(
  authority: Authority,
): PostgresJsDatabase<typeof schema> {
  return drizzle(openOperatorWriteDb(authority), { schema });
}

/** Read-only, Drizzle-flavoured. The default for investigation scripts. */
export function openOperatorDrizzle(
  connectionString?: string,
): PostgresJsDatabase<typeof schema> {
  return drizzle(openOperatorDb(connectionString), { schema });
}
