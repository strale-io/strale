/**
 * Query-term aliases for catalog search.
 *
 * ## Why
 *
 * `typeahead()` matches query words against a token set built from each item's
 * name, description, category and slug. That is exact-token plus prefix
 * matching, so a term the catalog never literally uses scores zero however
 * obviously it maps to something we sell. Production `suggest_log` for
 * 2026-07-20 → 2026-08-05 shows the failure mode directly: `fx` returned zero
 * results while `forex` returned `forex-history` and `currency` returned four
 * capabilities including `exchange-rate`. The intent was unambiguous and the
 * catalog had the answer; only the vocabulary differed.
 *
 * ## What belongs here
 *
 * Only vocabulary mappings — a word users type for a thing the catalog
 * already has under another name. Every entry below is justified by an
 * observed zero-result query plus a verified catalog item that should have
 * matched it.
 *
 * What does NOT belong here is a coverage gap. `south africa`, `itinerary`,
 * `vacation planner`, `reminder` and `incident` also returned zero, but no
 * capability serves them under any name. Aliasing those to adjacent items
 * would manufacture false matches, which is worse for the caller than an
 * honest empty result — they would call something that does not do what they
 * asked. Those belong on the roadmap, not in this file.
 *
 * ## Scoring
 *
 * An alias hit is worth less than a direct hit (see ALIAS_MATCH_WEIGHT in
 * suggest.ts), so an item that literally contains the typed word always
 * outranks one reached by synonym.
 */

/**
 * alias term → catalog terms to also search for.
 *
 * Keys and values are single lowercase tokens, matched against the same token
 * set `tokenize()` produces — so hyphenated slugs are already split
 * (`exchange-rate` yields `exchange` and `rate`).
 */
export const SEARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  // Observed: "fx" → 0 results. Catalog has exchange-rate, forex-history,
  // currency-convert, crypto-price. The single most common finance shorthand.
  fx: ["forex", "exchange", "currency"],
  // "forex" matched only forex-history; exchange-rate and currency-convert
  // are equally valid answers and were invisible.
  forex: ["exchange", "currency"],
  currency: ["exchange", "forex"],

  // Observed: "relocation visa immigration" → 0 results, and "visa" alone → 0.
  // Catalog has work-permit-requirements, whose tokens are work/permit/
  // requirements — none of which a user searching for visas would type.
  visa: ["permit"],
  immigration: ["permit"],
  relocation: ["permit"],

  // Observed: "logging" → 0 results. Catalog has log-parse, tokenized as
  // log/parse. Prefix matching does not help because the typed word is
  // longer than the token.
  logging: ["log"],
  logs: ["log"],

  // Observed: "travel" and "trip" → 0 results. flight-status is the only
  // travel-adjacent capability we have. This is a partial answer to a real
  // coverage gap (see the module docstring) — it surfaces the one relevant
  // thing rather than pretending trip planning exists.
  travel: ["flight"],
  trip: ["flight"],
};

/**
 * Weights for an alias-derived match, relative to 1.0 for a direct hit.
 *
 * Split by where the term appears, because merged token sets rank badly here:
 * with a single weight, "fx" put swift-message-parse (which merely mentions
 * currency in its description) above exchange-rate, whose *name* is the
 * answer. Both stay below 1.0 so an item containing the literal typed word
 * always outranks one reached by synonym.
 */
export const ALIAS_PRIMARY_WEIGHT = 0.75; // term appears in the item's name or slug
export const ALIAS_SECONDARY_WEIGHT = 0.25; // term appears only in description/category

/**
 * Extra catalog terms to search for, given the user's query words.
 *
 * Returns only terms the user did not already type, so an alias never
 * double-counts a word that would match directly anyway.
 */
export function aliasTermsFor(queryWords: readonly string[]): Set<string> {
  const typed = new Set(queryWords);
  const extra = new Set<string>();

  for (const word of queryWords) {
    for (const term of SEARCH_ALIASES[word] ?? []) {
      if (!typed.has(term)) extra.add(term);
    }
  }
  return extra;
}
