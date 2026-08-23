/**
 * The one authority for "is this principal entitled to trial credit, and how
 * much" (WP11, risk CR-09).
 *
 * Before this module the answer was decided twice, differently, by two route
 * handlers that grant the same EUR 2.00:
 *
 *   - `/v1/auth/register` ran no gate at all. Any email, any IP, any number of
 *     times.
 *   - `/v1/signup` ran four (disposable domain, MX record, a prior successful
 *     free-tier call from the same IP, and a same-IP signup count) — but the
 *     IP count only ever set `flagged_for_review: true`. It never denied
 *     anything.
 *
 * Production shows the gap being used, not merely being possible: eight
 * accounts share signup IP hash d5ab85828d59fa6f, created between 2026-05-25
 * and 2026-05-27, each granted 200 cents, all through the register path
 * (their ledger rows read "Welcome trial credits", not the agent variant).
 * Neither abhoward.site nor kiacc.ink is on the 5,361-domain disposable list,
 * so the disposable gate would not have stopped it either — the per-IP cap is
 * the gate that was missing, and no path had one.
 *
 * The split this module makes explicit, because it is the part that is easy to
 * get wrong: a *validity* failure refuses the account, an *entitlement*
 * failure withholds the grant. An address that cannot receive mail is not an
 * account we want. An IP that has already taken three trials this week is
 * plausibly a shared office NAT, and refusing to create the account would lock
 * out a paying customer to save EUR 2.00.
 *
 * The entitlement facts are persisted in `trial_grants`, keyed on a one-way
 * hash of the email. That is what makes the rule survive the erasure endpoint:
 * closing an account anonymises the users row, so an entitlement recorded
 * there would be erased along with it and the same address could take the
 * trial again.
 */

import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";

import { trialGrants } from "../db/schema.js";
import { DISPOSABLE_DOMAINS } from "./disposable-domains.js";

/** DEC-10: EUR 2.00 trial credits on signup, no card required. */
export const TRIAL_CREDITS_CENTS = 200;

/** How many trial grants one signup IP may take before the grant is withheld. */
export const MAX_TRIAL_GRANTS_PER_IP = 3;

/** The window the per-IP cap is measured over. */
export const TRIAL_IP_WINDOW_DAYS = 7;

/** Where the signup came from. Recorded so the channels stay auditable apart. */
export type TrialChannel = "register" | "agent_signup";

export type TrialRefusalReason = "disposable_domain" | "no_mail_exchanger";

export type TrialWithholdReason = "email_already_granted" | "ip_trial_cap";

export type TrialAssessment =
  /** Create the account and grant `grantCents`. */
  | { decision: "grant"; grantCents: number }
  /** Create the account, but with no opening grant. */
  | {
      decision: "withhold";
      grantCents: 0;
      reason: TrialWithholdReason;
      message: string;
    }
  /** Do not create the account at all. */
  | { decision: "refuse"; reason: TrialRefusalReason; message: string };

/**
 * Normalise an address the same way the signup handlers do before storing it,
 * so the hash of a stored `users.email` and the hash computed here agree.
 *
 * Deliberately NOT doing gmail-style dot/plus folding. That would change which
 * addresses are considered the same identity, which is a product decision with
 * false-positive risk (plus-addressing is a legitimate per-service alias), and
 * it is not what closes the observed abuse — the eight farmed accounts used
 * eight genuinely distinct local parts.
 */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * SHA-256 hex of the normalised address.
 *
 * Full 64 hex characters, not the 16-char truncation `hashIp` uses. An IP hash
 * is a bucketing key where a collision costs a spurious abuse flag; this one
 * decides whether money is granted, and a 64-bit space is small enough that
 * deliberate collisions are worth an attacker's time.
 *
 * The SQL side of the backfill computes the identical value with
 * `encode(sha256(convert_to(lower(btrim(email)), 'UTF8')), 'hex')`, which is a
 * Postgres built-in and needs no extension.
 */
export function hashEmail(email: string): string {
  return createHash("sha256").update(normaliseEmail(email)).digest("hex");
}

export interface TrialGateDeps {
  /** Resolve MX records for a domain. Injected so tests do not touch DNS. */
  resolveMx?: (domain: string) => Promise<unknown[]>;
  /** Overridable clock for the rolling IP window. */
  now?: () => Date;
}

async function defaultResolveMx(domain: string): Promise<unknown[]> {
  const dns = await import("node:dns/promises");
  return dns.resolveMx(domain);
}

/**
 * Decide the trial outcome for one signup attempt.
 *
 * Takes a db handle rather than a transaction: this runs before the account
 * transaction opens, and its reads are advisory. The authoritative,
 * race-proof half of "one trial per email" is the UNIQUE index on
 * `trial_grants.email_hash`, enforced inside the account transaction by
 * `recordTrialGrant`. This function exists to produce a good message and to
 * apply the gates a unique index cannot express.
 */
export async function assessTrialGrant(
  db: unknown,
  params: { email: string; ipHash: string | null; channel: TrialChannel },
  deps: TrialGateDeps = {},
): Promise<TrialAssessment> {
  const resolveMx = deps.resolveMx ?? defaultResolveMx;
  const now = deps.now ?? (() => new Date());
  const email = normaliseEmail(params.email);
  const domain = email.split("@")[1] ?? "";

  // ── Validity gates: refuse the account ────────────────────────────────────
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      decision: "refuse",
      reason: "disposable_domain",
      message:
        "Disposable email addresses are not accepted. Use your operator's real email address.",
    };
  }

  // A resolver outage must not refuse signups, so only an authoritative empty
  // answer counts as "this domain cannot receive mail". The pre-WP11 handler
  // swallowed resolver errors into an empty array and then treated that array
  // as proof of absence, which turns a DNS blip into a signup outage — so the
  // throw path here is the permissive one and only a genuine empty answer
  // refuses.
  let mx: unknown[];
  try {
    mx = await resolveMx(domain);
  } catch {
    mx = [{ unresolved: true }];
  }
  if (mx.length === 0) {
    return {
      decision: "refuse",
      reason: "no_mail_exchanger",
      message: `No mail server found for ${domain}. Use an email address that can receive mail.`,
    };
  }

  // ── Entitlement gates: create the account, withhold the grant ─────────────
  const emailHash = hashEmail(email);
  const [priorForEmail] = await (db as any)
    .select({ id: trialGrants.id })
    .from(trialGrants)
    .where(eq(trialGrants.emailHash, emailHash))
    .limit(1);

  if (priorForEmail) {
    return {
      decision: "withhold",
      grantCents: 0,
      reason: "email_already_granted",
      message:
        "Trial credits have already been issued to this email address. " +
        "The account is active — top up with POST /v1/wallet/topup to make paid calls.",
    };
  }

  if (params.ipHash) {
    const windowStart = new Date(
      now().getTime() - TRIAL_IP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    const rows = await (db as any)
      .select({ cnt: sql<number>`COUNT(*)::int` })
      .from(trialGrants)
      .where(
        and(
          eq(trialGrants.ipHash, params.ipHash),
          gte(trialGrants.grantedAt, windowStart),
        ),
      );
    const cnt = Number(rows?.[0]?.cnt ?? 0);

    if (cnt >= MAX_TRIAL_GRANTS_PER_IP) {
      return {
        decision: "withhold",
        grantCents: 0,
        reason: "ip_trial_cap",
        message:
          `This network has already claimed ${MAX_TRIAL_GRANTS_PER_IP} trial grants in the ` +
          `last ${TRIAL_IP_WINDOW_DAYS} days. The account is active — top up with ` +
          "POST /v1/wallet/topup to make paid calls.",
      };
    }
  }

  return { decision: "grant", grantCents: TRIAL_CREDITS_CENTS };
}

/**
 * Record that a trial grant was issued. MUST run inside the same transaction
 * as the account creation and the wallet grant.
 *
 * Returns false when the UNIQUE index rejected the row, which means a
 * concurrent signup for the same address won the race. The caller withholds
 * the grant rather than failing the signup: two simultaneous registrations for
 * one address is a retry, not an attack, and one of them getting an account
 * with no trial credit is the correct outcome.
 */
export async function recordTrialGrant(
  tx: unknown,
  params: {
    email: string;
    ipHash: string | null;
    userId: string;
    grantCents: number;
    channel: TrialChannel;
  },
): Promise<boolean> {
  const inserted = await (tx as any)
    .insert(trialGrants)
    .values({
      emailHash: hashEmail(params.email),
      ipHash: params.ipHash,
      userId: params.userId,
      grantedCents: params.grantCents,
      channel: params.channel,
    })
    .onConflictDoNothing({ target: trialGrants.emailHash })
    .returning({ id: trialGrants.id });

  return inserted.length > 0;
}
