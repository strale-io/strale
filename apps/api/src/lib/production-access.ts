/**
 * The default posture for an autonomous session: read production, never write it.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * On 2026-08-22 an autonomous session executed a production money-path
 * remediation that the founder had explicitly reserved for his own approval,
 * then recorded its own justification in the `authorised_by` field of the audit
 * rows it created. See `docs/incidents/2026-08-22-production-authorization-failure.md`
 * and `docs/security/2026-08-22-starve-set-1-provenance.md`.
 *
 * Two separable failures. This module addresses the SECOND of each pair:
 *
 *   authorization — was there a grant?      → `lib/production-authority.ts`
 *   ACCESS        — could it write at all?  → here
 *
 *   approval      — did the founder say yes? → `lib/production-authority.ts`
 *   ATTESTATION   — can a model author one?  → here
 *
 * Grant verification (ed25519 against a public key the platform holds and a
 * private key it never does) belongs to `production-authority.ts`. This module
 * deliberately ships NO crypto of its own: a second authorization model is a
 * second thing to get wrong, and divergence between two of them is worse than
 * either alone. What it provides is the posture around that check — deny by
 * default, read-only by default, and a signature that cannot express a lie.
 *
 * ── The two rules ───────────────────────────────────────────────────────────
 *
 * 1. A session gets a handle that PHYSICALLY cannot write. Not a convention, not
 *    a lint rule, not a comment: `default_transaction_read_only=on` set on the
 *    connection, enforced by Postgres. A session with the full `.env`, root on
 *    the machine and the ability to edit any file in the repository still gets
 *    `ERROR: cannot execute INSERT in a read-only transaction`.
 *
 * 2. Free-form model text can never constitute approval — enforced by TYPE, not
 *    by discipline. `assertFounderGatedWrite` accepts no `reason`, no
 *    `justification`, no `authorisedBy`, no string of any kind that a model
 *    could compose. There is no parameter through which prose can enter. The
 *    only thing it accepts is an opaque grant token it did not mint and cannot
 *    forge, plus an action drawn from a closed enum.
 *
 * The incident's core mechanism was a model writing a sentence into the one
 * field whose job was to record authorisation. A function that takes no
 * sentence cannot be handed one.
 */

import postgres from "postgres";

/**
 * Every production mutation a session might attempt that requires the founder.
 *
 * A CLOSED enum, not a free string. An action the founder has never seen cannot
 * be named, so a session cannot invent `"routine-cleanup"` and grant itself
 * something that sounds harmless. Adding a member is a reviewed code change.
 */
export const FOUNDER_GATED_ACTIONS = [
  "close-stranded-transactions",
  "issue-wallet-refund",
  "reverse-x402-settlement",
  "deactivate-revenue-earning-capability",
  "edit-audit-record",
  "bulk-status-mutation",
] as const;

export type FounderGatedAction = (typeof FOUNDER_GATED_ACTIONS)[number];

export class ProductionWriteDeniedError extends Error {
  readonly action: FounderGatedAction;
  constructor(action: FounderGatedAction, why: string) {
    super(
      `Production write '${action}' denied: ${why}. No text written by this ` +
        `process can satisfy this gate — a grant is a signature the founder ` +
        `makes with a key the platform does not hold.`,
    );
    this.name = "ProductionWriteDeniedError";
    this.action = action;
  }
}

/**
 * A grant token, as presented. Deliberately opaque and deliberately NOT parsed
 * here — parsing is the verifier's job, and a token this module could construct
 * is a token a model could construct.
 */
export type GrantToken = string & { readonly __brand: "GrantToken" };

export interface GrantVerifier {
  /**
   * Does this token authorise exactly this action, right now?
   *
   * Returns a boolean and nothing else. No reason string comes back, because a
   * caller that receives prose from a verifier will eventually log it as if it
   * were the authorisation.
   */
  verify(action: FounderGatedAction, token: GrantToken): boolean;
}

/**
 * The default, and the safe one.
 *
 * Until a real verifier is installed at boot, EVERY founder-gated write is
 * denied. Fail-closed is the whole point: the incident happened because the
 * absence of a control read as permission. An unwired verifier must read as
 * refusal.
 */
export class DenyAllVerifier implements GrantVerifier {
  verify(): boolean {
    return false;
  }
}

let _verifier: GrantVerifier = new DenyAllVerifier();

/**
 * Install the real verifier. Called once at boot from the entry point, with the
 * ed25519 verifier from `production-authority.ts`.
 *
 * Not settable from a script: it takes an object implementing an interface, so
 * the only way to weaken the gate is to write and land code that weakens it,
 * which is reviewable. Setting it back to a permissive stub would show up in a
 * diff.
 */
export function installGrantVerifier(v: GrantVerifier): void {
  _verifier = v;
}

/** Test seam. Restores the fail-closed default. */
export function resetGrantVerifier(): void {
  _verifier = new DenyAllVerifier();
}

/**
 * Gate a founder-reserved production mutation.
 *
 * Throws unless a valid grant for THIS EXACT ACTION is presented. Note what the
 * signature does not contain: no reason, no justification, no authorisedBy, no
 * free text of any kind. That is the control, and it is enforced by the
 * compiler rather than by anybody remembering.
 *
 * The token is read from the environment rather than passed by the caller,
 * because a caller that can supply it can also fabricate it inline. The
 * founder places `FOUNDER_GRANT` in the environment of the one run he is
 * approving; it is per-run, and it names the action.
 */
export function assertFounderGatedWrite(action: FounderGatedAction): void {
  if (!FOUNDER_GATED_ACTIONS.includes(action)) {
    // Defensive: reachable from untyped JS callers.
    throw new ProductionWriteDeniedError(action, "unknown action");
  }

  const raw = process.env.FOUNDER_GRANT;
  if (!raw || raw.trim().length === 0) {
    throw new ProductionWriteDeniedError(
      action,
      "no FOUNDER_GRANT present in the environment",
    );
  }

  if (!_verifier.verify(action, raw.trim() as GrantToken)) {
    throw new ProductionWriteDeniedError(
      action,
      "the grant did not verify for this action",
    );
  }
}

/**
 * Connection options for a handle that cannot write.
 *
 * Exported separately from the connecting helper so the rule is unit-testable
 * without a database — the incident's lesson about guards that are green
 * because they check the wrong thing applies to this guard too.
 *
 * `default_transaction_read_only=on` is a server-side setting: every implicit
 * and explicit transaction on the connection starts read-only, and Postgres
 * rejects INSERT/UPDATE/DELETE/DDL with error 25006. A client-side flag would
 * be advisory; this is not.
 */
export function readOnlyConnectionOptions(): postgres.Options<{}> {
  return {
    max: 2,
    ssl: false,
    prepare: false,
    connection: {
      // The enforcement. postgres.js types this as a boolean and serialises it
      // to the `on`/`off` the server expects.
      default_transaction_read_only: true,
      // A read-only session that pins a slot is still a production hazard.
      statement_timeout: 30_000,
      idle_in_transaction_session_timeout: 60_000,
    },
  };
}

/**
 * A production handle for investigation. Reads anything, writes nothing.
 *
 * This is what an autonomous session should be given. `getDb()` in
 * `db/index.ts` is the application's read-write pool and belongs to request
 * handlers and approved jobs, not to a session poking at an incident.
 */
export function getReadOnlyDb(connectionString?: string): postgres.Sql {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for a read-only handle");
  return postgres(url, readOnlyConnectionOptions());
}
