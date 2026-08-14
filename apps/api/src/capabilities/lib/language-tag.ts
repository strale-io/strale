// ─── Language-tag validation for upstream-API parameters ────────────────────
//
// Google's `hl` behaves exactly like `gl`: an unrecognised value is silently
// ignored, so a caller is billed for a search that quietly ran in the wrong
// language with the bogus value echoed back. Same failure class as the
// `country` incident of 2026-08-09.
//
// This validates SHAPE, not membership — deliberately unlike the country
// resolver, which checks against the full ISO 3166-1 set.
//
// The reason for the difference is what the two lists cost to get wrong. The
// country table already existed in-repo and was near-complete, so finishing it
// was a bounded, verifiable job. An ISO 639-1 table would have to be authored
// from scratch, and any code missing from it becomes a hard rejection of a
// caller who did nothing wrong — precisely the trap the country table set when
// its 45 missing entries turned from a lookup gap into a paid-traffic gate.
// Shape validation has no completeness cliff: it cannot reject a valid tag it
// has never heard of.
//
// What it does catch is the failure that actually happened: a non-Latin string
// ("中文"), a full language name ("English"), or a country name in the language
// field. What it does NOT catch is a well-formed tag that simply isn't a real
// language ("xy"). That residue is accepted knowingly — the alternative is a
// list that rejects real languages, which is worse.

/**
 * Simplified BCP 47: a 2–3 letter primary subtag, optionally followed by
 * script/region/variant subtags. Covers "en", "pt-BR", "zh-Hant", "zh-Hant-TW".
 */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

/**
 * Validate and normalise a caller-supplied language tag.
 *
 * Returns the lowercased tag, or `null` when nothing was supplied and no
 * `fallback` was given. Throws when a value is present but not tag-shaped.
 */
export function resolveLanguageOrThrow(raw: unknown, opts: { fallback: string }): string;
export function resolveLanguageOrThrow(raw: unknown, opts?: { fallback?: string }): string | null;
export function resolveLanguageOrThrow(
  raw: unknown,
  opts: { fallback?: string } = {},
): string | null {
  if (raw !== undefined && raw !== null && typeof raw !== "string") {
    throw new Error(`'language' must be a string. Received ${typeof raw}.`);
  }

  const supplied = (raw ?? "").trim() || (opts.fallback ?? "");
  if (!supplied) return null;

  if (!LANGUAGE_TAG.test(supplied)) {
    const shown = supplied.length > 64 ? `${supplied.slice(0, 64)}…` : supplied;
    throw new Error(
      `'language' must be a two-letter ISO 639-1 code ("en"), optionally with a region ("pt-BR"). ` +
        `Received: ${JSON.stringify(shown)}. If unsure, use the two-letter code.`,
    );
  }

  return supplied.toLowerCase();
}
