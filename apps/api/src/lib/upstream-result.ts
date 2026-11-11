/**
 * A failed upstream must never look like an empty answer.
 *
 * Billing charges a capability call that resolves and never one that throws
 * (`lib/execution-outcome.ts`). So an executor that catches an upstream
 * failure and returns `[]`, `found: false` or `listed: false` sells the
 * customer a fabricated negative: it is charged, it is not retried
 * (`lib/retry.ts` retries only a throw), and the breaker and the quality floor
 * record it as a success, so monitoring cannot see it. The 2026-11-06 audit
 * (`archive/sessions/2026-11-06-swallowed-upstream-failures-audit.md`) found
 * 38 capabilities doing this.
 *
 * The rule these helpers implement: a real negative answer stays an answer,
 * and anything else throws `UpstreamUnavailableError`, which takes the proven
 * failure path on every rail (no charge, one retry, counted against the
 * capability's health as `provider_unavailable`).
 *
 * The error's wording is load-bearing. Error text is still classified by
 * string in several places (the failure taxonomy, the breaker's user-input
 * list, the retry policy's non-retryable list), so the message always opens
 * with "Upstream unavailable" (the taxonomy's `upstream` rule) and must never
 * contain "not found", "invalid", "missing" or "required", which would file it
 * as the caller's fault. `upstream-result.test.ts` pins that.
 */

export class UpstreamUnavailableError extends Error {
  /** The upstream that failed, in words an operator recognises ("DNS MX query", "ESMA MiCA CASP register"). */
  readonly upstream: string;
  /** The upstream's own failure code when it had one (`ETIMEOUT`, `ESERVFAIL`, `HTTP 503`). */
  readonly code: string | null;
  /**
   * Whether a retry could plausibly get an answer. False for a failure that is
   * deterministic for now (every monthly ESMA path answering 404), so the rail
   * does not spend a second round of upstream calls on it.
   */
  readonly retryable: boolean;
  /**
   * True when the failing site is the caller's own target (a URL the caller
   * chose), not a source Strale depends on. Still unbilled and still
   * breaker-exempt by its wording, but outcomeFromError records it with
   * fault "target" and counts_against_capability false, so one caller's
   * broken site does not count against the capability's quality floor
   * (PR #1018 review, S1). Set by targetUnavailable and by executors that
   * build their own target-site error.
   */
  readonly targetFault: boolean;

  constructor(
    upstream: string,
    detail: string,
    options: { code?: string | null; retryable?: boolean; cause?: unknown; targetFault?: boolean } = {},
  ) {
    super(`Upstream unavailable: ${upstream}: ${detail}`, { cause: options.cause });
    this.name = "UpstreamUnavailableError";
    this.upstream = upstream;
    this.code = options.code ?? null;
    this.retryable = options.retryable ?? true;
    this.targetFault = options.targetFault ?? false;
  }
}

/**
 * Resolver codes that ARE the answer. Everything else from `node:dns/promises`
 * (ETIMEOUT, ESERVFAIL, EREFUSED, ECONNREFUSED, ECANCELLED, EBADRESP, EOF, ...)
 * means the resolver could not answer, and is rethrown.
 *
 * - ENOTFOUND: NXDOMAIN, the name does not exist.
 * - ENODATA: the name exists and has no record of the queried type.
 * - EBADNAME: the name is malformed, so no record can exist. That is a fact
 *   about the caller's input, not an outage; filing it as upstream failure
 *   would count the caller's typo against the capability. It keeps today's
 *   negative output.
 */
const DNS_NEGATIVE_CODES = new Set(["ENOTFOUND", "ENODATA", "EBADNAME"]);

function errorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.length > 0 ? code : null;
}

/** True when a `node:dns/promises` rejection is a definitive "no such record". */
export function isDnsNegative(err: unknown): boolean {
  const code = errorCode(err);
  return code !== null && DNS_NEGATIVE_CODES.has(code);
}

/**
 * The error to throw for a DNS rejection that is not a negative answer.
 *
 * An error with no resolver code is returned unchanged: that is our own code
 * breaking (a TypeError, say), and relabelling it as an upstream outage would
 * hide a defect behind the provider.
 */
export function dnsUnavailable(err: unknown, label: string): Error {
  const code = errorCode(err);
  if (code === null) return err instanceof Error ? err : new Error(String(err));
  return new UpstreamUnavailableError(
    label,
    `the resolver gave no answer (${code}). This says nothing about the domain's records; retry shortly.`,
    { code, cause: err },
  );
}

/**
 * Run a DNS query; a negative answer becomes `[]`, any other failure throws.
 *
 * Use it wherever an executor used to write `try { await dns.resolveX(d) }
 * catch { return [] }`.
 */
export async function dnsOrEmpty<T>(fn: () => Promise<T[]>, label = "DNS query"): Promise<T[]> {
  try {
    return await fn();
  } catch (err) {
    if (isDnsNegative(err)) return [];
    throw dnsUnavailable(err, label);
  }
}

/** `dnsOrEmpty` for the record types that resolve to one object (SOA). */
export async function dnsOrNull<T>(fn: () => Promise<T>, label = "DNS query"): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (isDnsNegative(err)) return null;
    throw dnsUnavailable(err, label);
  }
}

/**
 * For a lookup that asks several independent sources: when every one of them
 * failed there is no answer at all, so throw rather than report the empty
 * union. Returns the fulfilled values, in order, when at least one leg
 * answered; the caller decides how to mark the legs that did not.
 *
 * An empty `results` list is returned as-is: no legs asked is not an outage.
 */
export function requireAnyLeg<T>(results: PromiseSettledResult<T>[], label: string): T[] {
  const fulfilled = results.filter((r): r is PromiseFulfilledResult<T> => r.status === "fulfilled");
  if (results.length > 0 && fulfilled.length === 0) {
    // Codes or error names only, never the legs' messages: a leg's text could
    // carry a phrase ("not found") that files the whole failure as the caller's.
    const reasons = results.map((r) => {
      const reason = (r as PromiseRejectedResult).reason;
      return errorCode(reason) ?? (reason instanceof Error ? reason.name : "error");
    });
    throw new UpstreamUnavailableError(
      label,
      `all ${results.length} sources failed (${[...new Set(reasons)].join(", ")}).`,
      { code: errorCode((results[0] as PromiseRejectedResult).reason) },
    );
  }
  return fulfilled.map((r) => r.value);
}

/**
 * The error for an upstream's non-OK HTTP answer that carries no answer to
 * the question asked. 429 and 5xx are transient (retryable); any other status
 * is deterministic for now, so the rail does not spend a retry on it.
 *
 * The caller decides first which statuses ARE the answer (a 404 "no such
 * product", say) and never passes those here.
 *
 * The status is quoted in the message, and the breaker classifies by message:
 * 429 and 5xx read as transient or unknown (both retryable there too), 401
 * and 403 as auth_expired. A caller whose 401 or 403 is really a rate limit
 * or another transient refusal (GitHub's) must not pass it here; it builds a
 * retryable error without the number, as github-repo-analyze does.
 */
export function httpUnavailable(upstream: string, status: number): UpstreamUnavailableError {
  const transient = status === 429 || status >= 500;
  return new UpstreamUnavailableError(upstream, `HTTP ${status}${transient ? "; retry shortly." : "."}`, {
    code: `HTTP ${status}`,
    retryable: transient,
  });
}

/**
 * The codes to quote in one error that stands for several failed legs.
 *
 * The breaker reads the message, not `retryable` (`categorizeFailureReason`
 * in lib/trust-helpers.ts files any "401" or "403" as auth_expired, which
 * opens the breaker at once for 30 minutes). So a combined error that is
 * retryable because one leg is transient quotes only the retryable legs'
 * codes, and no 401 or 403 among them: a retryable leg can carry one too
 * (GitHub's rate limit answers HTTP 403), and quoting it would turn a
 * retry-shortly outage into a half-hour suspension for every caller (PR #1015
 * delta review). When no leg is retryable every code is quoted, 401 and 403
 * included (PR #1017 review), so legs that failed with 401, 403, 404 or 410
 * give a message the breaker reads as non-retryable, as the error is. Other
 * non-retryable codes, such as `unparseable` or `HTTP 400`, classify
 * `unknown`, which the breaker treats as retryable; this function does not
 * change that. The status stays on each leg's own `code`.
 */
export function quotedLegCodes(failures: UpstreamUnavailableError[]): string {
  const retryable = failures.filter((f) => f.retryable);
  const legs = retryable.length > 0 ? retryable : failures;
  let codes = [...new Set(legs.map((f) => f.code ?? "error"))];
  if (retryable.length > 0) codes = codes.filter((c) => !AUTH_STATUS.test(c));
  return codes.length > 0 ? codes.join(", ") : "declined";
}

/** A status the breaker would read as expired credentials. */
const AUTH_STATUS = /\b40[13]\b/;

/**
 * Errno codes a bare Error from node's resolver or socket layer carries when
 * the host could not be reached. safe-fetch's robots.txt pre-check rethrows
 * the resolver's own Error (`getaddrinfo ENOTFOUND host`, code ENOTFOUND)
 * rather than undici's `TypeError: fetch failed` wrapper, so the code sits on
 * the error itself, not on its cause (PR #1018 review, B1). ESSRFBLOCKED,
 * our own SSRF refusal, is deliberately absent.
 */
const NETWORK_ERRNO = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "EAI_FAIL",
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "EHOSTDOWN",
  "ENETUNREACH",
  "ENETDOWN",
  "EPIPE",
]);

/**
 * The error for a request to an upstream that threw: a timeout, a network
 * error (undici's `fetch failed` wrapper or a bare errno Error), or a body
 * that did not parse. Anything else is returned unchanged:
 * Strale's own vendor-account state (`VendorUnavailableError`), a refusal, a
 * size cap or our own defect keeps its own class rather than being relabelled
 * as the upstream's outage.
 */
export function fetchUnavailable(upstream: string, err: unknown): Error {
  if (err instanceof UpstreamUnavailableError) return err;
  const name = (err as { name?: unknown } | null)?.name;
  const message = err instanceof Error ? err.message : String(err);
  if (name === "TimeoutError" || name === "AbortError") {
    return new UpstreamUnavailableError(upstream, "timeout; retry shortly.", { code: "timeout", cause: err });
  }
  if (err instanceof TypeError && (message === "fetch failed" || message === "terminated")) {
    const cause = (err as { cause?: { code?: unknown } }).cause;
    const code = typeof cause?.code === "string" ? cause.code : null;
    return new UpstreamUnavailableError(upstream, `network error${code ? ` (${code})` : ""}; retry shortly.`, { code, cause: err });
  }
  const errno = (err as { code?: unknown } | null)?.code;
  if (err instanceof Error && typeof errno === "string" && NETWORK_ERRNO.has(errno)) {
    return new UpstreamUnavailableError(upstream, `network error (${errno}); retry shortly.`, { code: errno, cause: err });
  }
  if (err instanceof SyntaxError) {
    return new UpstreamUnavailableError(upstream, "the response did not parse.", { code: "unparseable", retryable: false, cause: err });
  }
  return err instanceof Error ? err : new Error(message);
}

/**
 * The caller's own site failed: its 5xx, a timeout, a network error or a
 * redirect loop (not retryable). Still unbilled, but worded as the target's failure ("URL returned
 * HTTP 5", "URL did not answer"), which the breaker's USER_INPUT_ERROR_PATTERNS
 * in lib/circuit-breaker.ts recognise, as for url-to-markdown: one caller's
 * broken site retried three times must not suspend the capability for
 * everyone (PR #1015 review). Every error it builds carries `targetFault`, so
 * it does not count against the capability's quality floor either (PR #1018
 * review, S1). Called by cookie-scan and page-exists; pricing-page-extract
 * builds its own target error (`unreadablePage`). Anything else passes
 * through as fetchUnavailable leaves it.
 */
export function targetUnavailable(site: string, failure: number | unknown): Error {
  if (typeof failure === "number") {
    return new UpstreamUnavailableError(site, `URL returned HTTP ${failure}, a server error on the site itself; retry later.`, {
      code: `HTTP ${failure}`,
      retryable: true,
      targetFault: true,
    });
  }
  // safe-fetch reports a redirect loop as a plain Error. It is the caller's
  // site, not ours and not an upstream we depend on (PR #1015 delta review).
  if (failure instanceof Error && failure.message.startsWith("Too many redirects")) {
    return new UpstreamUnavailableError(site, "URL did not answer (it kept redirecting).", {
      code: "redirect loop",
      retryable: false,
      cause: failure,
      targetFault: true,
    });
  }
  const err = fetchUnavailable(site, failure);
  if (!(err instanceof UpstreamUnavailableError)) return err;
  if (!err.retryable) {
    return new UpstreamUnavailableError(site, `URL did not answer with a readable response (${err.code ?? "error"}).`, {
      code: err.code,
      retryable: false,
      cause: failure,
      targetFault: true,
    });
  }
  return new UpstreamUnavailableError(site, `URL did not answer (${err.code ?? "network error"}); retry later.`, {
    code: err.code,
    retryable: true,
    cause: failure,
    targetFault: true,
  });

}
