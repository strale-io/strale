import { sql } from "drizzle-orm";
import type { MigrationExecutor, BlockResult } from "../types.js";

// ─── Block 0133: OAuth for the Claude connector (distribution D4) ────────────
//
// Four new, empty tables; no existing table is altered, so nothing here takes
// a lock another request could be waiting on.
//
// - oauth_clients: clients that registered themselves (RFC 7591). Clients
//   identified by a Client ID Metadata Document are not stored.
// - oauth_authorization_codes: one row per consent, single use, five minutes.
// - oauth_grants: one per connected client; it names the additional API key
//   the connector spends through, so revoking that key ends the grant.
// - oauth_tokens: access and refresh tokens, SHA-256 hashed, never stored raw.
export async function runMigration0133_oauthConnector(tx: MigrationExecutor): Promise<BlockResult> {
  const startedAt = Date.now();
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id text PRIMARY KEY,
      client_name text,
      redirect_uris jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS oauth_grants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id),
      api_key_id uuid NOT NULL REFERENCES api_keys(id),
      client_id text NOT NULL,
      scope text NOT NULL,
      resource text NOT NULL,
      key_minted boolean NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      revoked_at timestamptz
    )
  `);
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
      code_hash text PRIMARY KEY,
      client_id text NOT NULL,
      redirect_uri text NOT NULL,
      code_challenge text NOT NULL,
      scope text NOT NULL,
      resource text NOT NULL,
      user_id uuid NOT NULL REFERENCES users(id),
      source_api_key_id uuid REFERENCES api_keys(id),
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      consumed_at timestamptz,
      grant_id uuid REFERENCES oauth_grants(id)
    )
  `);
  await tx.execute(sql`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      grant_id uuid NOT NULL REFERENCES oauth_grants(id),
      kind text NOT NULL CHECK (kind IN ('access', 'refresh')),
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      rotated_at timestamptz,
      revoked_at timestamptz
    )
  `);
  await tx.execute(sql`CREATE INDEX IF NOT EXISTS oauth_grants_user_idx ON oauth_grants(user_id)`);
  await tx.execute(sql`CREATE INDEX IF NOT EXISTS oauth_tokens_grant_idx ON oauth_tokens(grant_id)`);
  return { block: "0133_oauthConnector", outcome: "ensured oauth_clients, oauth_grants, oauth_authorization_codes, oauth_tokens", duration_ms: Date.now() - startedAt };
}
