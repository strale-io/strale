// Frozen pre-rebuild scorer from origin/main 42e71dcc, for reproducible evaluation only.
import type { TypeaheadResult } from "../suggest.js";
import { tokenize } from "../tokenize.js";
import {
  aliasTermsFor,
  ALIAS_PRIMARY_WEIGHT,
  ALIAS_SECONDARY_WEIGHT,
} from "../search-aliases.js";
import type { FixtureItem } from "./fixtures.js";
const SOLUTION_BONUS = 3;
interface KeywordScorable {
  slug: string;
  name: string;
  description: string;
  tokens: Set<string>;
  primaryTokens: Set<string>;
}
interface LegacyItem extends KeywordScorable {
  type: "solution" | "capability";
  category: string;
  geography: string | null;
  priceCents: number;
  isFreeTier: boolean;
  stepCount?: number;
}
export function legacyItems(items: FixtureItem[]): LegacyItem[] {
  // The production loader loaded solutions first in display order; public snapshot
  // order is the only available tie order (no database display_order in fixture).
  return [
    ...items.filter((i) => i.type === "solution"),
    ...items.filter((i) => i.type === "capability"),
  ].map((i) => ({
    ...i,
    priceCents: i.price_cents,
    isFreeTier: i.is_free_tier ?? false,
    tokens: tokenize(
      `${i.name} ${i.description} ${i.category} ${
        i.type === "solution" ? i.geography : ""
      } ${i.slug} ${
        i.type === "solution" ? i.steps?.join(" ") ?? "" : ""
      } ${i.search_tags.join(" ")}`
    ),
    primaryTokens: tokenize(`${i.name} ${i.slug}`),
  }));
}
export function applyConditionalSolutionBonus<
  T extends { item: { type: "solution" | "capability" }; score: number }
>(scored: T[], bonus: number = SOLUTION_BONUS): void {
  // Seeded with -Infinity, not 0: seeding at 0 would clamp both sides up to 0
  // for an all-negative field and manufacture a tie, applying the bonus when a
  // capability was actually ahead. Today's callers only ever pass positive
  // scores, so that is unreachable — but this is exported, and a caller-side
  // invariant the type system does not express is not one to lean on.
  const topOf = (wantSolution: boolean) =>
    scored.reduce(
      (best, s) =>
        (s.item.type === "solution") === wantSolution
          ? Math.max(best, s.score)
          : best,
      -Infinity
    );

  const topCapability = topOf(false);
  if (topOf(true) < topCapability) return;

  // Only solutions that are themselves at least as good as the best capability
  // are lifted. Boosting the whole field would let a solution that matched one
  // word overtake a capability that matched two — the original bug in
  // miniature, one rank further down, where it shows up in the alternatives
  // list and the typeahead dropdown rather than in the recommendation.
  for (const s of scored) {
    if (s.item.type === "solution" && s.score >= topCapability)
      s.score += bonus;
  }
}

export function isSlugFamilyMatch(slug: string, word: string): boolean {
  if (word === slug) return true;
  if (!word.includes("-") || word.startsWith("-") || word.endsWith("-"))
    return false;
  return `-${slug}-`.includes(`-${word}-`);
}

/** A hyphenated query word, normalized, and the forms it is matched by. */
export interface HyphenatedWord {
  word: string;
  /** Empty when any segment was under 2 characters ("e-mail"): matching the
   *  rest alone would answer a different question than the one typed. */
  parts: string[];
  /** The word without hyphens ("email"), for spellings the catalog joins. */
  joined: string;
}

export interface TypeaheadQuery {
  /** Plain words, matched against tokens and name/description prefixes. */
  words: string[];
  /** Slug-shaped words ("invoice-verify"), matched as a unit — see scoreTypeaheadItem. */
  hyphenated: HyphenatedWord[];
}

/**
 * Parse a typeahead query. A hyphenated word is kept whole for the slug-family
 * check and split into parts for matching, because the token index splits on
 * hyphens. Doubled and dangling hyphens are dropped ("invoice-verify-" is still
 * being typed). A word with a 1-letter segment gets no parts at all: the
 * letter would prefix-match nearly every item, and the remainder alone ("mail"
 * for "e-mail") is not what was asked for, so only the family and joined forms
 * can match it.
 */
export function parseTypeaheadQuery(query: string): TypeaheadQuery {
  const words: string[] = [];
  const hyphenated: HyphenatedWord[] = [];
  for (const raw of query.toLowerCase().trim().split(/\s+/)) {
    const word = raw.replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (word.length === 0) continue;
    if (!word.includes("-")) {
      if (!words.includes(word)) words.push(word);
      continue;
    }
    const segments = word.split("-");
    const parts = segments.every((p) => p.length > 1) ? segments : [];
    hyphenated.push({ word, parts, joined: segments.join("") });
  }
  return { words, hyphenated };
}

/** Every word a query could match on directly. */
export function typeaheadTerms(q: TypeaheadQuery): string[] {
  const hyphenTerms = q.hyphenated.flatMap((h) =>
    h.parts.length > 0 ? h.parts : [h.joined]
  );
  return [...new Set([...q.words, ...hyphenTerms])];
}

/**
 * Score one catalog item for typeahead, before the geography boost and the
 * field-wide solution bonus. Exported for testing.
 *
 * A hyphenated word counts for an item only when it names the item's slug
 * family (+2, then its parts score as usual) or every one of its parts
 * matches this item. Scoring the parts independently would turn a slug nobody
 * sells ("web3-assurance") into matches on whichever items mention "web3",
 * and an exact slug ("vat-validate") into a lookup trailed by every
 * *-validate item. The query names one thing; the parts must agree on it.
 *
 * Aliases follow the same rule. A part may match through its alias ("fx-rate"
 * reaches exchange-rate as "fx rate" does), but a hyphenated word's aliases
 * score only on items the word matched; otherwise "fx-zzzz" would still
 * surface every currency item.
 */
export function scoreTypeaheadItem(
  item: KeywordScorable,
  query: TypeaheadQuery
): { score: number; snippet?: string } {
  let score = 0;
  let snippet: string | undefined;

  // Prefix matching on name/description words for partial matches
  const nameWords = item.name.toLowerCase().split(/[\s\-—]+/);
  const descWords = item.description.toLowerCase().split(/[\s\-—]+/);
  const hits = (w: string) =>
    item.tokens.has(w) ||
    nameWords.some((nw) => nw.startsWith(w)) ||
    descWords.some((dw) => dw.startsWith(w)) ||
    [...aliasTermsFor([w])].some((t) => item.tokens.has(t));

  // Vocabulary bridge: "fx" should reach exchange-rate even though the catalog
  // never uses the word. Scored below a direct hit so literal matches win.
  const aliasTerms = aliasTermsFor(query.words);

  const qWords = [...query.words];
  for (const { word, parts, joined } of query.hyphenated) {
    let matched = true;
    if (isSlugFamilyMatch(item.slug, word)) {
      // Exact slug or slug-family match: +2
      score += 2;
      qWords.push(...parts);
    } else if (item.tokens.has(joined)) {
      qWords.push(joined);
    } else if (parts.length > 0 && parts.every(hits)) {
      qWords.push(...parts);
    } else {
      matched = false;
    }
    if (matched) for (const t of aliasTermsFor(parts)) aliasTerms.add(t);
  }

  // Exact one-word slug: +2
  if (query.words.some((w) => w === item.slug)) score += 2;

  // Token matching: +1 for each query word found in item tokens
  for (const word of new Set(qWords)) {
    if (item.tokens.has(word)) score++;
  }

  // A term the user typed anywhere already scored as a direct hit.
  const typed = new Set(typeaheadTerms(query));
  for (const term of aliasTerms) {
    if (typed.has(term)) continue;
    if (item.primaryTokens.has(term)) score += ALIAS_PRIMARY_WEIGHT;
    else if (item.tokens.has(term)) score += ALIAS_SECONDARY_WEIGHT;
  }

  for (const qw of new Set(qWords)) {
    if (nameWords.some((nw) => nw.startsWith(qw) && !item.tokens.has(qw))) {
      score++;
      // Build snippet from name if prefix matched
      if (!snippet) snippet = item.name;
    }
    if (descWords.some((dw) => dw.startsWith(qw) && !item.tokens.has(qw))) {
      score++;
    }
  }

  return { score, snippet };
}

export function legacyTypeahead<T extends LegacyItem>(
  items: T[],
  query: string,
  limit: number,
  geo?: string,
  typeFilter?: "solution" | "capability"
) {
  const parsed = parseTypeaheadQuery(query);

  if (typeaheadTerms(parsed).length === 0) {
    return { results: [], total: 0 };
  }

  const scored: Array<{
    item: T;
    score: number;
    snippet?: string;
    _alsoAvailable?: string[];
  }> = [];

  for (const item of items) {
    // Type filter: skip items that don't match the requested type
    if (typeFilter && item.type !== typeFilter) continue;
    const base = scoreTypeaheadItem(item, parsed);
    let score = base.score;
    const snippet = base.snippet;

    // Solutions-first bonus is applied after the loop — it depends on how the
    // whole field scored, not on this item alone. See below.

    // Geography boost: +1 if geo param matches
    if (geo && score > 0 && item.geography) {
      const geoUpper = geo.toUpperCase();
      const geoLower = geo.toLowerCase();
      if (
        item.geography.toUpperCase().includes(geoUpper) ||
        item.geography.toLowerCase().includes(geoLower)
      ) {
        score++;
      }
    }

    if (score > 0) {
      scored.push({ item, score, snippet });
    }
  }

  applyConditionalSolutionBonus(scored);

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate country-variant solutions (e.g., "KYB Essentials — Sweden",
  // "KYB Essentials — Norway"). Keep highest-scored variant per base name,
  // add also_available_for with the collapsed country names.
  const deduped: typeof scored = [];
  const solutionGroupBest = new Map<string, number>(); // base name → index in deduped

  for (const entry of scored) {
    if (entry.item.type === "solution") {
      // Split on " — " or " – " to find base name and variant suffix
      const dashIdx = entry.item.name.search(/\s[—–]\s/);
      if (dashIdx > 0) {
        const baseName = entry.item.name.slice(0, dashIdx);
        const variant = entry.item.name.slice(dashIdx).replace(/^\s[—–]\s/, "");
        const existingIdx = solutionGroupBest.get(baseName);
        if (existingIdx != null) {
          // Already have a higher-scored variant — just add this one's name
          const existing = deduped[existingIdx];
          if (!existing._alsoAvailable) existing._alsoAvailable = [];
          existing._alsoAvailable.push(variant);
          continue;
        }
        solutionGroupBest.set(baseName, deduped.length);
      }
    }
    deduped.push(entry);
  }

  const total = deduped.length;
  const topItems = deduped.slice(0, limit);

  const results: TypeaheadResult[] = topItems.map(
    ({ item, snippet, _alsoAvailable }) => {
      const result: TypeaheadResult = {
        type: item.type,
        slug: item.slug,
        name: item.name,
        description: item.description,
        category: item.category,
        // DEC-20260304-A: price_cents MUST be null for capabilities
        price_cents: item.type === "solution" ? item.priceCents : null,
        geography: item.geography,
        is_free_tier: item.isFreeTier || undefined,
      };
      if (item.type === "solution" && item.stepCount) {
        result.step_count = item.stepCount;
      }
      if (snippet) {
        result.match_snippet = snippet;
      }
      if (_alsoAvailable && _alsoAvailable.length > 0) {
        result.also_available_for = _alsoAvailable;
      }
      return result;
    }
  );

  // Fallback: if type filter produced zero results, retry without filter
  if (results.length === 0 && typeFilter) {
    return legacyTypeahead(items, query, limit, geo);
  }

  return { results, total };
}
