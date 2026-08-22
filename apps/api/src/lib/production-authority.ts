/**
 * Production write authority — who permitted this, and how do we know.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * On 2026-08-22 a production reconciliation the founder had explicitly reserved
 * for his own approval was executed by an autonomous session, which then wrote
 * its own justification into the `authorised_by` field of the audit record it
 * created. The string it wrote was a fair paraphrase of a real founder
 * instruction — issued for a DIFFERENT incident, in a different session.
 *
 * Two things were true and neither was detectable by the system:
 *
 *   1. An approval for incident A licensed an irreversible write for incident B,
 *      because nothing associated an approval with the action it approved.
 *   2. A reservation made in one session was invisible to every other session.
 *      It lived in a markdown brief, and briefs do not gate writes.
 *
 * The false authorization string was kept out of the permanent record by a
 * four-second coincidence between two unrelated sessions. Nothing about the
 * system prevented it. See docs/incidents/2026-08-22-production-authorization-failure.md.
 *
 * ── The rule this module enforces ───────────────────────────────────────────
 *
 * A model must not be able to grant itself the permission it is supposed to
 * prove.
 *
 * So a founder grant is an **ed25519 signature made with a private key the
 * platform never holds**. This module verifies with a PUBLIC key compiled into
 * the repository. A session with full filesystem access, the complete `.env`,
 * and every credential the platform uses still cannot produce a valid grant,
 * because producing one requires a key that exists only where the founder keeps
 * it. Verification is not authorization: being able to check a signature has
 * never implied being able to make one.
 *
 * The public key is a committed constant, deliberately NOT read from the
 * environment. An env-supplied key could be replaced by the same session that
 * wanted to mint a grant, which would make the whole exercise theatre. Changing
 * a committed constant is a code change: it shows in a diff, and it requires the
 * merge that the founder controls.
 *
 * ── Defence in depth ────────────────────────────────────────────────────────
 *
 * Signatures establish PROVENANCE. They are not the primary barrier. The primary
 * barrier is that autonomous sessions do not hold production write credentials
 * at all: `DATABASE_URL` is a read-only role, and the writable connection string
 * lives in a variable that is not present in the shared environment. A grant
 * without write credentials cannot write; write credentials without a grant are
 * refused here. Both must be true, and they fail independently.
 */

import { createPublicKey, verify as edVerify } from "node:crypto";

/**
 * How a production mutation was permitted. Recorded on every write, so
 * "who allowed this" is answerable from the data rather than from a comment.
 */
export type Authority =
  | {
      kind: "AUTONOMOUS_POLICY";
      /** The decision that delegated this class of action, e.g. "DEC-20260812-A". */
      policy: string;
      /** What is being done, from the caller's own vocabulary. */
      purpose: string;
    }
  | {
      kind: "FOUNDER_GATED";
      /** Unique id of the grant, so a grant can be traced to one use. */
      grantId: string;
      /** The purpose the grant was issued FOR. Must match the action exactly. */
      purpose: string;
      expiresAt: string;
    };

/**
 * Actions the escalation contract (DEC-20260812-A, DEC-20260815-A) delegates to
 * the platform. Anything not on this list is founder-gated by default —
 * fail-closed, because the incident this module exists for was a session
 * deciding for itself that an action fell inside its delegation.
 *
 * Adding to this list is a code change and therefore a founder decision. That is
 * the point: the delegation boundary moves by merge, not by reasoning.
 */
export const AUTONOMOUS_PURPOSES = [
  "quality_floor_quarantine",
  "quality_floor_promote",
  "capability_health_breaker",
  "fixture_refresh",
  "test_result_write",
  "invocation_fact_write",
  // Added 2026-08-22 when the operator scripts were migrated onto this gate.
  // Each is catalogue maintenance the escalation contract already delegates:
  // metadata that describes a capability, not whether it is sold or what it
  // costs. Money, listing state and lifecycle are deliberately NOT here — they
  // stay founder-gated by omission, which is how this list is meant to work.
  "capability_onboarding",
  "catalogue_metadata_sync",
] as const;

export type AutonomousPurpose = (typeof AUTONOMOUS_PURPOSES)[number];

/**
 * Ed25519 public key for founder grants, SPKI PEM.
 *
 * EMPTY UNTIL THE FOUNDER INSTALLS ONE. While empty, every founder-gated
 * action is refused — which is the correct posture during the freeze, and the
 * correct posture generally: a gate whose key has not been set must not open.
 *
 * To install: run `node apps/api/scripts/gen-founder-keypair.mjs` on a machine
 * the platform does not have access to, keep the private key OFF this machine
 * and out of every `.env`, and paste the printed public key here in a commit.
 */
export const FOUNDER_GRANT_PUBLIC_KEY_PEM = "";

/** Thrown when a production write is attempted without valid authority. */
export class ProductionAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionAuthorityError";
  }
}

/**
 * Environment variables that would let this process MINT a grant rather than
 * merely verify one. If any is present, the separation this module depends on
 * has already been broken, and it is better to refuse loudly than to issue
 * authority records that look trustworthy and are not.
 */
const MINTING_ENV_VARS = [
  "STRALE_FOUNDER_GRANT_PRIVATE_KEY",
  "STRALE_FOUNDER_GRANT_SECRET",
  "STRALE_FOUNDER_GRANT_SIGNING_KEY",
];

/**
 * Refuse to operate in an environment that can forge grants.
 *
 * Exported and tested, because "the model cannot sign" is the single assumption
 * everything else rests on, and an assumption nobody checks is a belief.
 */
export function assertCannotMintGrants(
  env: NodeJS.ProcessEnv = process.env,
): void {
  const found = MINTING_ENV_VARS.filter((k) => {
    const v = env[k];
    return typeof v === "string" && v.trim().length > 0;
  });
  if (found.length > 0) {
    throw new ProductionAuthorityError(
      `This process can mint founder grants (${found.join(", ")} present in the ` +
        "environment), so a grant it verifies proves nothing. A signing key must " +
        "never be reachable from a Claude session. Remove it and re-issue any " +
        "grant that may have been minted here.",
    );
  }
}

/**
 * Authority for an action the escalation contract already delegates.
 *
 * Deliberately narrow: the purpose must be on `AUTONOMOUS_PURPOSES`. A caller
 * cannot pass a free-text purpose and self-declare it delegated, which is
 * exactly the move that produced the 2026-08-22 incident.
 */
export function autonomousAuthority(
  purpose: AutonomousPurpose,
  policy: string,
): Authority {
  if (!AUTONOMOUS_PURPOSES.includes(purpose)) {
    throw new ProductionAuthorityError(
      `'${purpose}' is not a delegated action. Founder-gated by default. If it ` +
        "should be autonomous, add it to AUTONOMOUS_PURPOSES in a reviewed " +
        "commit — the delegation boundary moves by merge, not by argument.",
    );
  }
  return { kind: "AUTONOMOUS_POLICY", policy, purpose };
}

interface ParsedGrant {
  grantId: string;
  purpose: string;
  expiresAtEpochSeconds: number;
  signature: Buffer;
  signedPayload: string;
}

/** `v1.<grantId>.<purpose>.<expiresAtEpochSeconds>.<base64url signature>` */
export function parseGrantToken(token: string): ParsedGrant {
  const parts = token.trim().split(".");
  if (parts.length !== 5 || parts[0] !== "v1") {
    throw new ProductionAuthorityError(
      "Malformed founder grant. Expected v1.<grantId>.<purpose>.<expiry>.<signature>.",
    );
  }
  const [, grantId, purpose, expiryRaw, sigRaw] = parts;
  const expiresAtEpochSeconds = Number(expiryRaw);
  if (!Number.isInteger(expiresAtEpochSeconds)) {
    throw new ProductionAuthorityError("Founder grant has a non-integer expiry.");
  }
  if (!/^[A-Za-z0-9_-]+$/.test(grantId) || !/^[a-z0-9_]+$/.test(purpose)) {
    throw new ProductionAuthorityError(
      "Founder grant has a malformed grantId or purpose.",
    );
  }
  return {
    grantId,
    purpose,
    expiresAtEpochSeconds,
    signature: Buffer.from(sigRaw, "base64url"),
    // Signed payload is pipe-joined, NOT dot-joined: the token separator must
    // not appear in the signed bytes, or a grant could be re-segmented into a
    // different (grantId, purpose, expiry) with the same signature.
    signedPayload: ["v1", grantId, purpose, expiryRaw].join("|"),
  };
}

/**
 * Verify and consume a founder grant for a specific purpose.
 *
 * Throws unless ALL of these hold:
 *   - a signing key is not reachable from this process
 *   - a public key has been installed
 *   - the token is well-formed
 *   - the signature verifies against the committed public key
 *   - the grant has not expired
 *   - the grant's purpose matches this action EXACTLY
 *
 * The purpose match is the control the 2026-08-22 incident needed and did not
 * have. A grant for `investigate_starve_set_1` does not authorise
 * `close_stranded_executing_rows`, however reasonable the connection looks from
 * inside the session making it.
 */
export function requireFounderGrant(
  purpose: string,
  opts: { now?: Date; env?: NodeJS.ProcessEnv } = {},
): Authority {
  const env = opts.env ?? process.env;
  const now = opts.now ?? new Date();

  assertCannotMintGrants(env);

  if (FOUNDER_GRANT_PUBLIC_KEY_PEM.trim().length === 0) {
    throw new ProductionAuthorityError(
      "No founder grant public key is installed, so no grant can be verified " +
        "and this founder-gated action is refused. This is the intended state " +
        "until the founder installs a key (see gen-founder-keypair.mjs). A gate " +
        "whose key has not been set must not open.",
    );
  }

  const token = env.STRALE_FOUNDER_GRANT;
  if (!token || token.trim().length === 0) {
    throw new ProductionAuthorityError(
      `'${purpose}' is founder-gated and no grant was supplied. Ask the founder ` +
        "for a grant covering exactly this purpose; do not proceed on the " +
        "strength of a general instruction, a policy document, or a prior " +
        "approval for something else.",
    );
  }

  const grant = parseGrantToken(token);

  let key: ReturnType<typeof createPublicKey>;
  try {
    key = createPublicKey(FOUNDER_GRANT_PUBLIC_KEY_PEM);
  } catch {
    throw new ProductionAuthorityError(
      "The installed founder grant public key is not a readable key.",
    );
  }

  const ok = edVerify(
    null,
    Buffer.from(grant.signedPayload, "utf8"),
    key,
    grant.signature,
  );
  if (!ok) {
    throw new ProductionAuthorityError(
      "Founder grant signature does not verify. Either it was not issued by the " +
        "founder, or it was altered after issue.",
    );
  }

  if (grant.expiresAtEpochSeconds * 1000 <= now.getTime()) {
    throw new ProductionAuthorityError(
      `Founder grant ${grant.grantId} expired at ` +
        `${new Date(grant.expiresAtEpochSeconds * 1000).toISOString()}. Grants are ` +
        "short-lived on purpose: an approval is for a moment, not a standing state.",
    );
  }

  if (grant.purpose !== purpose) {
    throw new ProductionAuthorityError(
      `Founder grant ${grant.grantId} authorises '${grant.purpose}', not ` +
        `'${purpose}'. An approval for one action is not an approval for a ` +
        "similar-looking one. This is the exact control the 2026-08-22 incident " +
        "lacked.",
    );
  }

  return {
    kind: "FOUNDER_GATED",
    grantId: grant.grantId,
    purpose: grant.purpose,
    expiresAt: new Date(grant.expiresAtEpochSeconds * 1000).toISOString(),
  };
}

/**
 * The writable production connection string, released only against an Authority.
 *
 * `DATABASE_URL` is the READ-ONLY role and is what every session gets. The
 * writable string lives in `DATABASE_URL_WRITE`, which is absent from the shared
 * environment by design — so the common case is not "a session is refused a
 * write", it is "a session has nothing to write with".
 *
 * This function is the only sanctioned way to obtain it, so every production
 * write has an Authority value attached to it at the point the credential is
 * handed over, rather than a comment attached to it afterwards.
 */
export function productionWriteUrl(authority: Authority): string {
  if (!authority || typeof authority !== "object" || !("kind" in authority)) {
    throw new ProductionAuthorityError(
      "A production write requires an Authority. Build one with " +
        "autonomousAuthority() for a delegated action, or requireFounderGrant() " +
        "for anything else.",
    );
  }
  const url = process.env.DATABASE_URL_WRITE;
  if (!url || url.trim().length === 0) {
    throw new ProductionAuthorityError(
      "No production write credential is available to this process. This is the " +
        "default and correct state for an autonomous session: DATABASE_URL is a " +
        "read-only role. A founder-gated mutation is run by supplying " +
        "DATABASE_URL_WRITE and STRALE_FOUNDER_GRANT for that one invocation.",
    );
  }
  return url;
}

/**
 * The authority, shaped for storage next to the change it permitted.
 *
 * Every production mutation records this. `authority_kind` answers the question
 * the 2026-08-22 incident could not answer from the data — whether a write was
 * a delegated platform action or a founder decision — and it answers it in a
 * field with a closed vocabulary rather than in free prose that a session can
 * compose to sound like approval.
 */
export function describeAuthority(authority: Authority): Record<string, unknown> {
  return authority.kind === "AUTONOMOUS_POLICY"
    ? {
        authority_kind: "AUTONOMOUS_POLICY",
        authority_policy: authority.policy,
        authority_purpose: authority.purpose,
      }
    : {
        authority_kind: "FOUNDER_GATED",
        authority_grant_id: authority.grantId,
        authority_purpose: authority.purpose,
        authority_expires_at: authority.expiresAt,
      };
}
