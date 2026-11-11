/**
 * How to read a WHOIS reply that carries no parsed fields: the real negative
 * ("not registered"), or a registry declining to answer. Shared by
 * domain-age-check and whois-lookup, so the two cannot disagree about which
 * reply is an answer.
 */

/** The registry says the domain is not registered: the real negative. */
export const WHOIS_NOT_REGISTERED =
  /\bno match\b|\bnot found\b|no data found|no entries found|nothing found|no object found|\bstatus:\s*(free|available)\b|\bis (free|available for registration)\b|domain not registered|we do not have an entry in our database matching your query/i;

/** The registry is rate-limiting this client: no answer, retry later. */
export const WHOIS_RATE_LIMITED = /limit (exceeded|reached)|exceeded .*limit|rate.?limit|too many (queries|requests)|try again later|quota/i;

/**
 * The registry refuses this client outright (an access list, a ban). Checked
 * only on a reply with no parsed field, so a registered domain's terms-of-use
 * boilerplate cannot trip it.
 */
export const WHOIS_REFUSED = /access (is )?denied|not authori[sz]ed|permission denied|(has|have) been (blocked|banned)|is (blocked|banned)/i;
