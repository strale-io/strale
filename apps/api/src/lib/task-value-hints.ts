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

import { branchesOf, requiredOf } from "./x402-input-validation.js";

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
// Same bounded-quantifier shape as capabilities/domain-contact-extract.ts's
// EMAIL_RE, which carries the ReDoS regression suite for this pattern class
// (7.9s catastrophic backtracking on a 32KB body pre-fix). Duplicated rather
// than imported because that module registers its capability on import — a
// side effect a pure lib must not drag in. If a third copy appears, hoist
// one canonical export into lib/.
const EMAIL_RE = /[a-zA-Z0-9._%+-]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.){1,8}[a-zA-Z]{2,24}/g;
const URL_RE = /\bhttps?:\/\/[^\s"'<>)\]]+/gi;
// Label count and TLD length bounded for the same backtracking reason.
const DOMAIN_RE = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){1,8}[a-z]{2,24}\b/gi;

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
 * Recognizers only ever scan this much of the task. A legitimate task that
 * names a value does so in the first sentence; an adversarial multi-megabyte
 * task must not buy quadratic regex backtracking on an unauthenticated 400
 * path (cross-provider review finding, 2026-08-15).
 */
const MAX_SCAN_CHARS = 2000;

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
  const scanText = task.slice(0, MAX_SCAN_CHARS);
  for (const field of fieldNames) {
    const recognize = RECOGNIZERS[field.toLowerCase()];
    if (!recognize) continue;
    const value = recognize(scanText);
    if (value !== undefined) recovered[field] = value;
  }
  return recovered;
}

/**
 * The fields a caller could still supply to satisfy an unsatisfied
 * anyOf/oneOf group: the union of the branches' required lists, minus what
 * they already sent. Recognizers must only run over these — offering an
 * unrelated optional field as "the fix" would contradict the declared
 * contract (cross-provider review finding, 2026-08-15).
 */
export function unsatisfiedGroupFields(
  schema: Record<string, unknown> | null | undefined,
  existingInputs: Record<string, unknown>,
): string[] {
  const fields = new Set<string>();
  for (const branch of (schema ? branchesOf(schema) : null) ?? []) {
    for (const field of requiredOf(branch)) {
      if (!(field in existingInputs)) fields.add(field);
    }
  }
  return [...fields];
}

/**
 * Render the recovered values as a retry-ready hint sentence, or undefined
 * when nothing was recovered. The example merges the caller's existing
 * inputs so following it verbatim never loses fields they already sent,
 * and is JSON.stringify-encoded so recovered values can't break the example.
 */
export function recoveredValuesHint(
  recovered: Record<string, string>,
  existingInputs: Record<string, unknown> = {},
): string | undefined {
  const entries = Object.entries(recovered);
  if (entries.length === 0) return undefined;
  const inputsJson = JSON.stringify({ ...existingInputs, ...recovered });
  return ` Your task text appears to already contain ${entries
    .map(([f]) => `'${f}'`)
    .join(", ")} — retry with "inputs": ${inputsJson}.`;
}
