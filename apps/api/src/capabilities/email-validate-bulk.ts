import { registerCapability, type CapabilityInput } from "./index.js";
import { EMAIL_RE, checkMx, validateOneEmail, type EmailValidationResult } from "./email-validate.js";

// Batch email validation. Reuses email-validate's validateOneEmail() for the
// actual per-address rules (format, disposable, role, free-provider, MX) —
// no forked validation logic. The only thing this file adds is batch
// plumbing: input aliasing, size limits, dedup, and bounded-concurrency
// MX-lookup caching per domain so a 96-address / ~6-domain list doesn't
// open 96 DNS sockets.

const MAX_BATCH = 100;
// These three constants are load-bearing against a HARD external limit and
// must be changed together. `executeSync` in routes/do.ts runs the executor
// INSIDE the wallet transaction, which sets
// `idle_in_transaction_session_timeout = '15s'` (do.ts ~1581). Blowing that
// budget aborts the whole transaction with Postgres 25P03: the caller gets
// zero results (not partial ones), and the wallet row stays locked for the
// duration, serialising that user's other requests.
//
// Worst case is every address on a distinct unresponsive domain:
//   ceil(MAX_BATCH / MX_CONCURRENCY) * MX_TIMEOUT_MS
//   = ceil(100 / 25) * 2500ms = 10s   — fits inside 15s with margin.
//
// The original 10/5000 pairing gave ceil(100/10) * 5000 = 50s and breached
// the transaction budget at only ~30 slow domains, which is an entirely
// ordinary shape for a "validate my lead list" batch. Raising concurrency is
// free here (DNS resolution is not rate-limited by us) and 2.5s is generous
// for MX — typical resolution is well under 200ms.
//
// This capability is routed SYNC unconditionally, because DEC-22's async
// switch keys off `avg_latency_ms > 10_000` (do.ts:1003) and the declared
// average is ~1.5s. So the worst case above must fit; it cannot fall back to
// the async path.
const MX_CONCURRENCY = 25;
const MX_TIMEOUT_MS = 2500;
// Belt-and-braces ceiling on the whole MX phase, independent of the
// arithmetic above — guarantees the bound holds even if MAX_BATCH is raised
// later without re-deriving it.
const MX_PHASE_BUDGET_MS = 11_000;

/**
 * Extract the domain the same way validateOneEmail would — same regex, same
 * normalization (trim + lowercase), same length cap. Returns null for
 * anything that will fail format validation, so we never waste a DNS lookup
 * on a domain that can't possibly matter to the result.
 */
function extractDomain(rawEmail: string): string | null {
  const normalized = rawEmail.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized) || normalized.length > 254) return null;
  const at = normalized.indexOf("@");
  if (at <= 0 || at >= normalized.length - 1) return null;
  return normalized.slice(at + 1);
}

/** Race a promise against an explicit timeout. Always clears the timer. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Resolve MX for one domain, bounded by both the per-lookup timeout and the
 * phase-wide deadline.
 *
 * `resolved: false` means "we could not determine MX in the time available",
 * which is NOT the same as "this domain has no MX". Callers must surface that
 * distinction — reporting an unreachable nameserver as a hard invalid would
 * mark deliverable addresses as bad.
 */
async function checkMxWithTimeout(
  domain: string,
  deadline: number,
): Promise<{ has_mx: boolean; mx_records: string[]; resolved: boolean }> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    return { has_mx: false, mx_records: [], resolved: false };
  }
  try {
    const mx = await withTimeout(
      checkMx(domain),
      Math.min(MX_TIMEOUT_MS, remaining),
      `MX lookup for ${domain}`,
    );
    return { ...mx, resolved: true };
  } catch {
    return { has_mx: false, mx_records: [], resolved: false };
  }
}

/** Bounded-concurrency map — never more than `concurrency` in-flight calls. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/**
 * Parse + validate input BEFORE any work happens. Accepts `emails` (array),
 * `email_addresses` (array — agents guess field names), and `text`
 * (newline- or comma-separated string). Rejects empty/non-array input and
 * enforces the 100-address cap on the deduplicated list.
 *
 * All three fields are MERGED (union), not treated as first-wins aliases, so
 * an agent that hedges by sending the same list under two names still gets
 * the right answer — the case-insensitive dedup below collapses it. Sending
 * genuinely different addresses in each field is therefore additive, which is
 * the intended reading of "here are the addresses to check".
 */
function parseInput(input: CapabilityInput): string[] {
  const rawEmails = input.emails;
  const rawEmailAddresses = input.email_addresses;
  const rawText = input.text;

  if (rawEmails !== undefined && rawEmails !== null && !Array.isArray(rawEmails)) {
    throw new Error("'emails' must be an array of email address strings.");
  }
  if (rawEmailAddresses !== undefined && rawEmailAddresses !== null && !Array.isArray(rawEmailAddresses)) {
    throw new Error("'email_addresses' must be an array of email address strings.");
  }
  if (rawText !== undefined && rawText !== null && typeof rawText !== "string") {
    throw new Error("'text' must be a string of newline- or comma-separated email addresses.");
  }

  const collected: string[] = [];
  if (Array.isArray(rawEmails)) {
    for (const e of rawEmails) if (typeof e === "string") collected.push(e);
  }
  if (Array.isArray(rawEmailAddresses)) {
    for (const e of rawEmailAddresses) if (typeof e === "string") collected.push(e);
  }
  if (typeof rawText === "string" && rawText.trim()) {
    collected.push(...rawText.split(/[\n,]+/));
  }

  const trimmed = collected.map((e) => e.trim()).filter((e) => e.length > 0);

  if (trimmed.length === 0) {
    throw new Error(
      "No email addresses provided. Pass 'emails' (array of strings), 'email_addresses' (array alias), or " +
        "'text' (a newline- or comma-separated string of addresses).",
    );
  }

  // Deduplicate case-insensitively, keeping first-seen casing.
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const e of trimmed) {
    const key = e.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(e);
    }
  }

  if (deduped.length > MAX_BATCH) {
    throw new Error(
      `Batch too large: ${deduped.length} unique email addresses provided, limit is ${MAX_BATCH} per call. ` +
        `Split the list into batches of ${MAX_BATCH} or fewer.`,
    );
  }

  return deduped;
}

registerCapability("email-validate-bulk", async (input: CapabilityInput) => {
  const emails = parseInput(input);

  // Pre-fetch MX records once per unique domain, bounded concurrency, so a
  // 96-address / ~6-domain list issues ~6 DNS queries instead of 96.
  const domainSet = new Set<string>();
  for (const email of emails) {
    const domain = extractDomain(email);
    if (domain) domainSet.add(domain);
  }
  const domainList = [...domainSet];
  const mxDeadline = Date.now() + MX_PHASE_BUDGET_MS;
  const mxPairs = await mapWithConcurrency(domainList, MX_CONCURRENCY, async (domain) => {
    const mx = await checkMxWithTimeout(domain, mxDeadline);
    return [domain, mx] as const;
  });
  const mxCache = new Map(mxPairs);

  // Domains we could not resolve inside the budget. Their addresses still get
  // format/disposable/role checks, but their `valid` verdict is unreliable —
  // we say so explicitly rather than passing off "unchecked" as "no MX".
  const unresolvedDomains = domainList.filter((d) => mxCache.get(d)?.resolved === false);

  const results: Array<EmailValidationResult & { mx_checked?: boolean }> = await Promise.all(
    emails.map(async (email) => {
      const domain = extractDomain(email);
      const mx = domain ? mxCache.get(domain) : undefined;
      const mxOverride = mx ? { has_mx: mx.has_mx, mx_records: mx.mx_records } : undefined;
      const r = await validateOneEmail(email, mxOverride);
      // Only annotate when the lookup did NOT complete, so the common case
      // keeps the exact same shape as single-address email-validate.
      return mx && !mx.resolved ? { ...r, mx_checked: false } : r;
    }),
  );

  let validCount = 0;
  let disposableCount = 0;
  let roleAddressCount = 0;
  let freeProviderCount = 0;
  const byDomain: Record<string, { total: number; valid: number }> = {};

  for (const r of results) {
    if (r.valid) validCount++;
    if (r.is_disposable) disposableCount++;
    if (r.is_role_address) roleAddressCount++;
    if (r.is_free_provider) freeProviderCount++;

    const domainKey = r.domain ?? "invalid";
    const bucket = byDomain[domainKey] ?? { total: 0, valid: 0 };
    bucket.total++;
    if (r.valid) bucket.valid++;
    byDomain[domainKey] = bucket;
  }

  return {
    output: {
      total: results.length,
      valid_count: validCount,
      invalid_count: results.length - validCount,
      // True when at least one domain's MX lookup did not complete within the
      // phase budget. Addresses on those domains carry `mx_checked: false`
      // and their `valid` verdict should be treated as unknown, not as a
      // deliverability failure. Re-submit just those addresses to retry.
      mx_lookup_incomplete: unresolvedDomains.length > 0,
      mx_unresolved_domains: unresolvedDomains,
      results,
      summary: {
        by_domain: byDomain,
        disposable_count: disposableCount,
        role_address_count: roleAddressCount,
        free_provider_count: freeProviderCount,
      },
    },
    provenance: {
      source: "algorithmic+dns",
      fetched_at: new Date().toISOString(),
    },
  };
});
