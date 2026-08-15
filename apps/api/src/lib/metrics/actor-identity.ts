/**
 * The identity spine: one answer to "who did this", across every rail.
 *
 * The question this exists to make answerable is "is our revenue one customer
 * or twenty" — which on 2026-08-15 could not be answered at all, and which
 * decides whether the business has a demand problem or a conversion problem.
 * Those call for opposite work, and two wrong strategic conclusions that day
 * came from guessing at it.
 *
 * Three deliberate choices, two of them following cross-provider review:
 *
 * 1. **No device fingerprint.** An earlier draft proposed falling back to a
 *    user-agent/IP fingerprint when neither an account nor a wallet is present.
 *    Rejected: it is unnecessary for counting paying customers, and it builds
 *    exactly the cross-session profile the daily-rotating IP salt exists to
 *    prevent. Unattributable stays unattributable, and shows up as a coverage
 *    number rather than as an invented identity.
 *
 * 2. **Derived, not stored.** `actor_key` is a pure function of columns already
 *    on the row, so it is defined once as a database view plus the mirror
 *    below, rather than a written column. A written column can be forgotten at
 *    a write site — and one already is: the A2A rail proxies to /v1/do without
 *    forwarding caller identity, so anything depending on write-time capture
 *    would silently under-count it. A view cannot drift, needs no backfill, and
 *    takes no lock on the busiest table in the system.
 *
 * 3. **Versioned.** The `v1` marker is inside the key. If the derivation ever
 *    changes, old and new keys will not silently compare equal — they will
 *    look like different actors, which is the safe direction to be wrong in.
 */

/** What kind of identity a key represents. */
export type ActorKind = "user" | "x402_wallet" | "unattributed";

export interface Actor {
  /** Stable across sessions for the same account or wallet. Null when unknown. */
  key: string | null;
  kind: ActorKind;
}

/** Bumped only when the derivation changes shape. Part of every key. */
export const ACTOR_KEY_VERSION = "v1";

/**
 * Resolve identity in priority order: an authenticated account is a stronger
 * claim than a wallet, since one person may pay from several wallets but an
 * account is the thing they logged into.
 *
 * Note the wallet arm consumes `x402_payer_hash`, which is ALREADY a keyed
 * HMAC of the lowercased address (see attribution.ts). This module never sees
 * or stores a raw wallet address.
 *
 * Known limitation: the payer hash does not incorporate the chain. Base is
 * currently the only settlement chain, so no collision is possible today; if a
 * second chain is added, the same address on both would resolve to one actor.
 * That is a reason to bump ACTOR_KEY_VERSION at that point, not a bug now.
 */
export function resolveActor(row: {
  userId?: string | null;
  x402PayerHash?: string | null;
}): Actor {
  if (row.userId) return { key: `user:${ACTOR_KEY_VERSION}:${row.userId}`, kind: "user" };
  if (row.x402PayerHash) {
    return { key: `x402:${ACTOR_KEY_VERSION}:${row.x402PayerHash}`, kind: "x402_wallet" };
  }
  return { key: null, kind: "unattributed" };
}

/**
 * The same rule in SQL, kept beside the TypeScript so the two cannot be edited
 * apart. The view below and every metric query use this expression; a test
 * asserts the two definitions agree on prefixes and version.
 */
export const ACTOR_KEY_SQL = `
  CASE
    WHEN t.user_id IS NOT NULL
      THEN 'user:${ACTOR_KEY_VERSION}:' || t.user_id::text
    WHEN t.x402_payer_hash IS NOT NULL
      THEN 'x402:${ACTOR_KEY_VERSION}:' || t.x402_payer_hash
    ELSE NULL
  END`;

export const ACTOR_KIND_SQL = `
  CASE
    WHEN t.user_id IS NOT NULL THEN 'user'
    WHEN t.x402_payer_hash IS NOT NULL THEN 'x402_wallet'
    ELSE 'unattributed'
  END`;

/** Name of the view created by migration 0085. */
export const ACTOR_VIEW = "transaction_actors";
