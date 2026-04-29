import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema.js";

let _db: PostgresJsDatabase<typeof schema> | null = null;
let _client: Sql | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
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
    const stmtTimeoutMs = parseInt(process.env.PG_STATEMENT_TIMEOUT_MS ?? "30000", 10);
    const idleTxTimeoutMs = parseInt(process.env.PG_IDLE_IN_TX_TIMEOUT_MS ?? "60000", 10);
    _client = postgres(connectionString, {
      max: 30,
      connection: {
        statement_timeout: stmtTimeoutMs,
        idle_in_transaction_session_timeout: idleTxTimeoutMs,
      },
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
