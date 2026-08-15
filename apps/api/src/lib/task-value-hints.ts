/**
 * Recover obvious input values from a /v1/do task string, for error hints only.
 *
 * Motivating incident (2026-08-08, failed_requests d8568ee3…): an
 * unauthenticated caller sent task "validate this IBAN DE89370400440532013000"
 * with no inputs, matched iban-validate correctly, and got the standard
 * "Missing required input fields: iban" 400 — three retries over 17 minutes,
 * never converging. The IBAN sat in the task text the whole time. The 400
 * told the caller *what* was missing but not that they had already supplied it.
 *
 * This module recognizes a small set of machine-recognizable value shapes
 * (IBAN, email, URL, domain) in the task text so the 400 can show the exact
 * corrected call with the caller's own value.
 *
 * Deliberately NOT auto-execution: declared contracts are enforced as
 * declared, and nobody gets charged on a guess. The recovered value goes into
 * the error hint, nothing else. A value is only recovered when the task
 * contains exactly one distinct candidate of that shape — ambiguity means no
 * hint rather than a wrong one.
 */

/** Strip whitespace and uppercase; IBANs are case- and grouping-insensitive. */
function normalizeIban(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/**
 * ISO 13616 shape: 2 letters, 2 digits, 11–30 alphanumerics (total 15–34).
 * Two explicit forms — compact, or grouped in fours with single spaces — so
 * an optional-whitespace quantifier can't greedily swallow trailing words
 * ("…0130 00 please" must not become "…00PLEASE").
 */
const IBAN_RE =
  /\b[A-Za-z]{2}\d{2}(?:[A-Za-z0-9]{11,30}|(?: [A-Za-z0-9]{4}){2,7}(?: [A-Za-z0-9]{1,4})?)\b/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
const URL_RE = /\bhttps?:\/\/[^\s"'<>)\]]+/gi;
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}\b/gi;

function distinct(matches: string[]): string | undefined {
  const set = new Set(matches);
  return set.size === 1 ? [...set][0] : undefined;
}

function findIban(task: string): string | undefined {
  const candidates = (task.match(IBAN_RE) ?? [])
    .map(normalizeIban)
    .filter((v) => v.length >= 15 && v.length <= 34);
  return distinct(candidates);
}

function findEmail(task: string): string | undefined {
  return distinct(task.match(EMAIL_RE) ?? []);
}

function findUrl(task: string): string | undefined {
  // Trim trailing punctuation a sentence would attach ("…check https://x.com.")
  const candidates = (task.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:!?]+$/, ""));
  return distinct(candidates);
}

function findDomain(task: string): string | undefined {
  // Emails and URLs contain domain-shaped substrings; remove them first so
  // "email me at a@b.com" never recovers b.com as a standalone domain.
  const stripped = task.replace(EMAIL_RE, " ").replace(URL_RE, " ");
  const candidates = (stripped.match(DOMAIN_RE) ?? []).map((d) => d.toLowerCase());
  return distinct(candidates);
}

const RECOGNIZERS: Record<string, (task: string) => string | undefined> = {
  iban: findIban,
  email: findEmail,
  url: findUrl,
  domain: findDomain,
};

/**
 * For each named field with a known recognizer, return the single
 * high-confidence value found in the task text. Fields without a recognizer,
 * or with zero/ambiguous candidates, are simply absent from the result.
 */
export function recoverValuesFromTask(
  task: string | undefined | null,
  fieldNames: string[],
): Record<string, string> {
  const recovered: Record<string, string> = {};
  if (!task) return recovered;
  for (const field of fieldNames) {
    const recognize = RECOGNIZERS[field.toLowerCase()];
    if (!recognize) continue;
    const value = recognize(task);
    if (value !== undefined) recovered[field] = value;
  }
  return recovered;
}

/**
 * Render the recovered values as a retry-ready hint sentence, or undefined
 * when nothing was recovered.
 */
export function recoveredValuesHint(
  recovered: Record<string, string>,
): string | undefined {
  const entries = Object.entries(recovered);
  if (entries.length === 0) return undefined;
  const inputsJson = `{ ${entries.map(([f, v]) => `"${f}": "${v}"`).join(", ")} }`;
  return ` Your task text appears to already contain ${entries
    .map(([f]) => `'${f}'`)
    .join(", ")} — retry with "inputs": ${inputsJson}.`;
}
