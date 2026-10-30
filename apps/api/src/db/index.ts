import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import { handlePgNotice } from "./pg-notice.js";
import * as schema from "./schema.js";
import { AsyncLocalStorage } from "node:async_hooks";

export type Database = PostgresJsDatabase<typeof schema>;

let scopedDatabase: AsyncLocalStorage<Database> | undefined;

/** CLI only: deep calls must use the operator-authorized handle. Lazily
 * allocate the scope so API onboarding never enables a process-wide async hook.
 */
export function withDatabase<T>(db: Database, run: () => T, signal?: AbortSignal): T {
  scopedDatabase ??= new AsyncLocalStorage<Database>();
  return scopedDatabase.run(boundDatabase(db, signal), run);
}

/** Fence new queries (including lazy builders and transaction handles) after
 * abort, without installing async hooks. Already-issued queries can still drain.
 */
export function boundDatabase(db: Database, signal?: AbortSignal): Database {
  const cache = new WeakMap<object, object>();
  function bounded<T extends object>(target: T): T {
    if (!signal) return target;
    const cached = cache.get(target);
    if (cached) return cached as T;
    const proxy = new Proxy(target, {
      get(object, property) {
        const value = Reflect.get(object, property, object);
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          // Promise rejection handlers must remain attachable after abort.
          if (property !== "catch" && property !== "finally")
            signal?.throwIfAborted();
          if (property === "transaction" && typeof args[0] === "function") {
            const callback = args[0] as (tx: object) => unknown;
            args[0] = (tx: object) => callback(bounded(tx));
          }
          const result = Reflect.apply(value, object, args);
          // Native promises already represent in-flight operations. Query
          // builders are lazy thenables, so keep checking until execution.
          return result &&
            typeof result === "object" &&
            !(result instanceof Promise)
            ? bounded(result)
            : result;
        };
      },
    });
    cache.set(target, proxy);
    return proxy;
  }
  return bounded(db);
}

let _db: PostgresJsDatabase<typeof schema> | null = null;
let _client: Sql | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
  const scoped = scopedDatabase?.getStore();
  if (scoped) return scoped;
  if (!_db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    // Cert-audit C5 follow-up: cap statement and idle-in-transaction timeouts
    // at the connection level. Without these, a stuck upstream or a forgotten
    // open transaction can pin a pool slot indefinitely. Both values can be
    // overridden per-statement (`SET LOCAL statement_timeout = ...`) for the
    // few jobs that legitimately need longer runs (REINDEX CONCURRENTLY etc).
    const stmtTimeoutMs = parseInt(
      process.env.PG_STATEMENT_TIMEOUT_MS ?? "30000",
      10
    );
    const idleTxTimeoutMs = parseInt(
      process.env.PG_IDLE_IN_TX_TIMEOUT_MS ?? "60000",
      10
    );
    _client = postgres(connectionString, {
      max: 30,
      connection: {
        statement_timeout: stmtTimeoutMs,
        idle_in_transaction_session_timeout: idleTxTimeoutMs,
      },
      onnotice: handlePgNotice,
    });
    _db = drizzle(_client, { schema });
  }
  return _db;
}

// Cert-audit C3 follow-up: graceful-shutdown hook calls this so the pool
// drains cleanly before process exit instead of getting torn down by SIGKILL.
export async function closeDbPool(): Promise<void> {
  if (_client) {
    const c = _client;
    _client = null;
    _db = null;
    await c.end({ timeout: 5 });
  }
}
