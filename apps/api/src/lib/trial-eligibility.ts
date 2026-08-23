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
 * so the disposable gate would not have stopped it either.
 *
 * **What actually closes it is the UNIQUE index on `trial_grants.email_hash`:
 * one grant per address, enforced by the database.** The per-IP cap below is a
 * speed bump that stops the observed pattern and nothing more sophisticated —
 * `getClientIp` reads the leftmost X-Forwarded-For entry, which the client
 * supplies. An earlier draft of this file called the cap "the gate that was
 * missing"; that overstated it, and overstating a control is how a package
 * records an exit condition as met when it is not. See MAX_TRIAL_GRANTS_PER_IP.
 *
 * The split this module makes explicit, because it is the part that is easy to
 * get wrong: a *validity* failure refuses the account, an *entitlement*
 * failure withholds the grant. An address that cannot receive mail is not an
 * account we want. An IP that has already taken several trials this week is
 * plausibly a shared office NAT, and refusing to create the account would lock
 * out a paying customer to save EUR 2.00.
 *
 * The entitlement facts are persisted in `trial_grants`, keyed on a one-way
 * hash of the email. That is what makes the rule survive the erasure endpoint:
 * closing an account anonymises the users row, so an entitlement recorded
 * there would be erased along with it and the same address could take the
 * trial again. A SHA-256 of an address is pseudonymised personal data, not
 * anonymous data — the input space is enumerable — so the erasure endpoint
 * discloses the retention rather than pretending it away, and clears the
 * `user_id` and `ip_hash` alongside it. Only the hash needs to survive.
 */

import { createHash } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";

import { trialGrants } from "../db/schema.js";
import { DISPOSABLE_DOMAINS } from "./disposable-domains.js";

/** DEC-10: EUR 2.00 trial credits on signup, no card required. */
export const TRIAL_CREDITS_CENTS = 200;

/**
 * How many trial grants one signup IP may take before the grant is withheld.
 *
 * A speed bump, NOT the durable rule, and the difference matters because an
 * earlier draft of this file claimed otherwise. `getClientIp` reads the
 * LEFTMOST X-Forwarded-For entry, which is whatever the client typed — so an
 * attacker who varies that header per request never shares a bucket and this
 * cap never fires for them. It does stop the abuse actually observed in
 * production (eight sequential registrations from one real address over 44
 * hours, no spoofing), and it stops nothing more sophisticated.
 *
 * The rule that holds under a hostile client is the UNIQUE index on
 * `trial_grants.email_hash`: one grant per address, enforced by the database.
 *
 * Making the header trustworthy needs Railway's proxy hop count confirmed —
 * verification gate VERIFY-IP, which blocks WP12. Guessing the hop count and
 * reading the wrong entry would break every IP-keyed rate limit in production
 * at once, so it is not a thing to fix in passing here.
 */
export const MAX_TRIAL_GRANTS_PER_IP = 5;

/** The window the per-IP cap is measured over. */
export const TRIAL_IP_WINDOW_DAYS = 7;

/**
 * RFC 5321 §4.5.3.1.3: 254 octets is the maximum length of a path.
 *
 * Checked here because `users.email` is `varchar(255)`, and a longer address
 * reaches the INSERT and raises Postgres 22001 — which is not a unique
 * violation, so it propagates as a 500 rather than a 400.
 */
export const MAX_EMAIL_LENGTH = 254;

/**
 * `users.name` is `varchar(255)`.
 *
 * Round-1 review closed the same defect for `email` and stopped there, so a
 * 300-character `name` still reached the INSERT, raised Postgres 22001, failed
 * `isUniqueViolation`, and surfaced as a 500 on what is a 400. Both columns on
 * one INSERT need both caps; fixing one field of a two-field problem is how it
 * comes back.
 */
export const MAX_NAME_LENGTH = 255;

/**
 * Reduce a client address to the unit the trial cap counts.
 *
 * IPv4 addresses count individually. IPv6 addresses count by /64, because a
 * /64 is the smallest prefix routinely delegated to a single subscriber — every
 * mainstream VPS and most home ISP connections hand out one — so counting IPv6
 * addresses individually gives a farmer 2^64 free buckets and the cap never
 * fires at all. Counting by /64 is not a free win either: a large carrier-NAT
 * v6 deployment can put unrelated customers in one prefix. That is the same
 * trade the cap already makes for shared IPv4 NAT, and the reason a withheld
 * grant still creates the account.
 *
 * Returns null for anything unparseable, which the caller reads as "no bucket"
 * and lets through.
 */
export function trialRateBucket(ip: string): string | null {
  if (!ip || ip === "unknown") return null;
  const [head] = ip.split("%"); // strip any zone id
  if (!head.includes(":")) return head; // IPv4 — count the address itself

  // An IPv4-mapped or IPv4-compatible address is an IPv4 client wearing a v6
  // hat, and must count as that address. Expanding it instead puts every such
  // client into one bucket, because the leading four hextets are all zero —
  // so `::ffff:1.2.3.4` and `::ffff:5.6.7.8` would share a /64 and the sixth
  // unrelated registrant behind it would be refused a grant. Node reports this
  // form for every IPv4 peer on a dual-stack listener.
  const mapped = /^::(?:ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(head);
  if (mapped) return mapped[1]!;

  // Expand to full hextets so a compressed and an uncompressed form of the
  // same prefix produce the same bucket.
  const parts = head.split("::");
  if (parts.length > 2) return null;
  const left = parts[0] ? parts[0].split(":").filter(Boolean) : [];
  const right = parts.length === 2 && parts[1] ? parts[1].split(":").filter(Boolean) : [];
  const fill = parts.length === 2 ? 8 - left.length - right.length : 0;
  if (fill < 0) return null;
  const hextets = [...left, ...Array<string>(fill).fill("0"), ...right];
  if (hextets.length !== 8) return null;
  // Validate ALL eight, not only the four that form the bucket. Checking the
  // prefix alone accepts junk in the trailing hextets and returns a bucket for
  // something that is not an address.
  const normalised = hextets.map((h) => h.padStart(4, "0").toLowerCase());
  if (normalised.some((h) => !/^[0-9a-f]{4}$/.test(h))) return null;
  return `${normalised.slice(0, 4).join(":")}::/64`;
}

/** Where the signup came from. Recorded so the channels stay auditable apart. */
export type TrialChannel = "register" | "agent_signup";

/**
 * Channels the per-IP cap applies to.
 *
 * Deliberately not `agent_signup`. That channel already REQUIRES a prior
 * successful free-tier call from the same IP before it will create an account,
 * so same-IP clustering is designed into it — and autonomous agents run behind
 * shared cloud NAT, where three or five signups from one AWS egress address is
 * a normal week rather than a farm. Applying an anti-clustering gate to the
 * one channel built around clustering would silence the grant for exactly the
 * ICP the platform is for.
 *
 * This is the divergence between the channels that survives having one
 * authority: it is now a named constant with a reason, rather than two
 * handlers that happened to be written differently.
 */
export const IP_CAPPED_CHANNELS: ReadonlySet<TrialChannel> = new Set(["register"]);

export type TrialRefusalReason =
  | "disposable_domain"
  | "no_mail_exchanger"
  | "malformed_address";

/**
 * Why a grant was withheld. Internal — logged, never returned.
 *
 * `email_already_granted` is the sensitive one: registration does not verify
 * the mailbox, so anyone can register `victim@corp.com` and read the answer.
 * Returning that specific reason tells an unauthenticated stranger that the
 * address was once a Strale customer, which for a compliance vendor is
 * commercially sensitive about the customer, not about us. The public surface
 * gets one undifferentiated reason instead.
 */
export type TrialWithholdReason = "email_already_granted" | "ip_trial_cap";

/** The single reason code and message any withheld grant reports to the caller. */
export const PUBLIC_WITHHELD_REASON = "trial_not_available";
export const PUBLIC_WITHHELD_MESSAGE =
  "Trial credits are not available for this signup. The account is active — " +
  "top up with POST /v1/wallet/topup to make paid calls.";

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
  resolveMx?: (domain: string) => Promise<MxRecordLike[]>;
  /** Resolve A/AAAA records — the RFC 5321 implicit-MX fallback. */
  resolveAddresses?: (domain: string) => Promise<string[]>;
  /** Overridable clock for the rolling IP window. */
  now?: () => Date;
}

/**
 * How long a signup will wait on DNS before giving up and allowing it.
 *
 * `dns.resolveMx` has no per-call deadline; c-ares retries mean a slow or
 * deliberately-stalling authoritative server can hold the request for tens of
 * seconds. This lookup is on the human registration path, where none happened
 * before WP11, so its latency is now the customer's latency. Timing out into
 * the permissive branch is the right trade: the check is a speed bump, and an
 * unreachable resolver is not evidence that a mailbox does not exist.
 */
export const DNS_TIMEOUT_MS = 3000;

class DnsTimeout extends Error {
  readonly code = "ETIMEOUT";
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  return Promise.race([
    work,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new DnsTimeout("DNS lookup timed out")), DNS_TIMEOUT_MS).unref?.(),
    ),
  ]);
}

async function defaultResolveMx(domain: string): Promise<MxRecordLike[]> {
  const dns = await import("node:dns/promises");
  return withTimeout(dns.resolveMx(domain));
}

async function defaultResolveAddresses(domain: string): Promise<string[]> {
  const dns = await import("node:dns/promises");
  const [v4, v6] = await Promise.allSettled([
    withTimeout(dns.resolve4(domain)),
    withTimeout(dns.resolve6(domain)),
  ]);
  const out: string[] = [];
  if (v4.status === "fulfilled") out.push(...v4.value);
  if (v6.status === "fulfilled") out.push(...v6.value);
  return out;
}

export interface MxRecordLike {
  exchange?: string;
}

/**
 * Resolver error codes that are an authoritative answer rather than a failure.
 *
 * This distinction is the whole gate. `dns.resolveMx` almost never returns an
 * empty array in practice — a domain that does not exist THROWS `ENOTFOUND`,
 * and a domain that exists with no MX record throws `ENODATA`. Measured
 * against the real resolver: `no-mx-here-definitely-not-real-12345.test`
 * throws ENOTFOUND, it does not resolve to `[]`.
 *
 * So a handler that catches every resolver error and treats it as permissive
 * has disabled the check entirely for the exact case it exists to catch, and a
 * handler that catches every error and treats it as a refusal turns a resolver
 * blip into a signup outage. The pre-WP11 code did the second
 * (`.catch(() => [])` feeding a `length === 0` refusal); the first version of
 * this module over-corrected into the first. Both are wrong, and neither is
 * visible without asking the resolver what it actually returns.
 *
 * `ENODATA` is deliberately NOT here. It means the domain exists and publishes
 * no MX — which RFC 5321 §5.1 says is a domain with an *implicit* MX at its
 * address record, and such domains do receive mail. `strale.dev` is one:
 * A records, no MX. Treating ENODATA as authoritative would have refused
 * registration to anyone at our own domain, and to every small operator
 * running an MTA on their web host.
 */
const DOMAIN_DOES_NOT_EXIST = new Set(["ENOTFOUND", "NXDOMAIN", "NOTFOUND"]);

/** The domain exists but publishes no MX — fall back to its address records. */
const NO_MX_RECORD = new Set(["ENODATA"]);

/**
 * The delivery domain: everything after the LAST `@`.
 *
 * `split("@")[1]` is what both handlers used, and it reads the wrong half of
 * an address with two of them. `a@gmail.com@mailinator.com` is delivered to
 * `mailinator.com`, but `split("@")[1]` hands the gates `gmail.com` — so both
 * the disposable-domain list and the MX check inspect a domain that has
 * nothing to do with where the mail goes. Verified against this module before
 * the fix: that address returned `{ decision: "grant", grantCents: 200 }`.
 *
 * Returns "" for an address with no `@` or an empty domain part, which the
 * caller refuses.
 */
export function emailDomain(normalisedEmail: string): string {
  const at = normalisedEmail.lastIndexOf("@");
  if (at <= 0 || at === normalisedEmail.length - 1) return "";
  return normalisedEmail.slice(at + 1);
}

/**
 * Can this domain receive mail at all?
 *
 * Three answers, and conflating any two of them is a bug this file has already
 * shipped in both directions:
 *
 *   - the domain does not exist (ENOTFOUND/NXDOMAIN) → no;
 *   - the domain exists with a usable MX → yes;
 *   - the domain exists with no MX (ENODATA, or an empty answer) → RFC 5321
 *     implicit MX: yes IF it has an A or AAAA record. `strale.dev` is exactly
 *     this shape, so getting it wrong refuses our own domain.
 *
 * RFC 7505 null MX — a single record with an empty or root exchange — is the
 * domain explicitly declaring it accepts no mail, and overrides the fallback.
 *
 * Any other resolver failure (timeout, SERVFAIL, refused) is not evidence and
 * is permissive: a resolver outage must not become a signup outage.
 */
async function domainCannotReceiveMail(
  domain: string,
  resolveMx: (d: string) => Promise<MxRecordLike[]>,
  resolveAddresses: (d: string) => Promise<string[]>,
): Promise<boolean> {
  let mx: MxRecordLike[] | null = null;
  try {
    mx = await resolveMx(domain);
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "";
    if (DOMAIN_DOES_NOT_EXIST.has(code)) return true;
    if (!NO_MX_RECORD.has(code)) return false; // resolver failure — allow
    mx = [];
  }

  const declaredNoMail =
    mx.length > 0 &&
    mx.every((r) => r?.exchange === "" || r?.exchange === ".");
  if (declaredNoMail) return true;

  const usable = mx.filter(
    (r) => typeof r?.exchange === "string" && r.exchange !== "" && r.exchange !== ".",
  );
  if (usable.length > 0) return false;

  // No MX. Fall back to the implicit one.
  try {
    const addresses = await resolveAddresses(domain);
    return addresses.length === 0;
  } catch {
    // Could not check — do not refuse on an unanswered question.
    return false;
  }
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
  const resolveAddresses = deps.resolveAddresses ?? defaultResolveAddresses;
  const now = deps.now ?? (() => new Date());
  const email = normaliseEmail(params.email);
  const domain = emailDomain(email);

  // ── Validity gates: refuse the account ────────────────────────────────────
  if (email.length > MAX_EMAIL_LENGTH || domain === "") {
    return {
      decision: "refuse",
      reason: "malformed_address",
      message: `A deliverable email address of at most ${MAX_EMAIL_LENGTH} characters is required.`,
    };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return {
      decision: "refuse",
      reason: "disposable_domain",
      message:
        "Disposable email addresses are not accepted. Use your operator's real email address.",
    };
  }

  if (await domainCannotReceiveMail(domain, resolveMx, resolveAddresses)) {
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

  if (params.ipHash && IP_CAPPED_CHANNELS.has(params.channel)) {
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

/**
 * Strip the identifying columns from a closing account's entitlement row.
 *
 * Runs inside the erasure transaction. The entitlement itself has to survive —
 * it is the whole point of keying on a hash rather than on the users row — but
 * only `email_hash` is load-bearing. `user_id` and `ip_hash` are convenience,
 * and keeping them after Art. 17 erasure would mean the closure endpoint's own
 * response, which lists `users.signup_ip_hash` under "anonymized", was false:
 * block 0102's backfill copies exactly that column into this table.
 *
 * What remains is a SHA-256 of an address with a timestamp and an amount. That
 * is still pseudonymised personal data — an enumerable input space is not
 * anonymisation — so it is disclosed in the erasure response under Art. 6(1)(f)
 * rather than treated as if it were not there.
 */
export async function anonymiseTrialGrantOnClosure(
  tx: unknown,
  params: { userId: string },
): Promise<number> {
  const updated = await (tx as any)
    .update(trialGrants)
    .set({ userId: null, ipHash: null })
    .where(eq(trialGrants.userId, params.userId))
    .returning({ id: trialGrants.id });
  return updated.length;
}
