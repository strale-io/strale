import { STOP_WORDS } from "../tokenize.js";
import {
  aliasTermsFor,
  ALIAS_PRIMARY_WEIGHT,
  ALIAS_SECONDARY_WEIGHT,
} from "../search-aliases.js";
import {
  countryLexicon,
  countryCodes,
  extractCountries,
  itemCountries,
  words,
} from "./countries.js";
import { applyConditionalSolutionBonus, isSlugFamilyMatch } from "./ranking.js";

export interface SearchItem {
  type: "solution" | "capability";
  slug: string;
  name: string;
  description: string;
  category: string;
  geography: string | null;
  search_tags: readonly string[];
}
const SEARCH_STOP_WORDS = new Set([
  ...STOP_WORDS,
  "how",
  "what",
  "who",
  "which",
  "whether",
  "if",
  "please",
  "show",
  "find",
  "look",
  "up",
  "into",
  "against",
  "about",
  "use",
  "new",
  "before",
  "this",
]);
/** Conservative shared morphology, not substring matching (GDP never becomes GDPR). */
export function stem(word: string): string {
  if (/^(valid|validity|validate|validation)$/.test(word)) return "valid";
  if (word.length > 7 && word.endsWith("ship")) return word.slice(0, -4);
  if (word.length > 5 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 5 && word.endsWith("ing")) {
    const base = word.slice(0, -3);
    return /([b-df-hj-np-tv-z])\1$/.test(base) ? base.slice(0, -1) : base;
  }
  if (word.length > 4 && word.endsWith("ed")) return word.slice(0, -2);
  if (word.length > 6 && word.endsWith("ation"))
    return word.slice(0, -5) + "ate";
  if (word.length > 5 && word.endsWith("ion") && /[st]ion$/.test(word))
    return word.slice(0, -3);
  if (word.length > 3 && word.endsWith("s") && !/(ss|us|is)$/.test(word))
    return word.slice(0, -1);
  return word;
}
const content = (tokens: string[]) =>
  tokens.filter((t) => t.length > 1 && !SEARCH_STOP_WORDS.has(t)).map(stem);
const fieldTokens = (text: string) => content(extractCountries(text).words);
/** Optimal-string-alignment Damerau-Levenshtein, including adjacent transposition. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let older: number[] = [],
    prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    let min = i;
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        next[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        next[j] = Math.min(next[j], older[j - 2] + 1);
      min = Math.min(min, next[j]);
    }
    if (min > max) return max + 1;
    older = prev;
    prev = next;
  }
  return prev[b.length];
}
const typoLimit = (t: string) => (t.length >= 8 ? 2 : t.length >= 4 ? 1 : 0);
const WEIGHTS = [3, 2, 1, 0.5];
export const RELEVANCE_RATIO = 0.25;
export interface KeywordHit<T> {
  item: T;
  score: number;
  coverage: number;
  snippet?: string;
}

export function createKeywordIndex<T extends SearchItem>(items: readonly T[]) {
  const docs = items.map((item) => {
    const suffix = item.slug.match(/-([a-z]{2})$/)?.[1];
    const contentSlug =
      suffix && countryCodes.has(suffix.toUpperCase())
        ? item.slug.slice(0, -3)
        : item.slug;
    const fields = [
      `${item.name} ${contentSlug}`,
      item.search_tags.join(" "),
      item.description,
      item.category,
    ].map(fieldTokens);
    return {
      item,
      identity: fieldTokens(contentSlug),
      nameTokens: fieldTokens(item.name),
      fields: fields.map((ts) => {
        const tf = new Map<string, number>();
        for (const t of ts) tf.set(t, (tf.get(t) ?? 0) + 1);
        return tf;
      }),
      lengths: fields.map((f) => f.length),
      countries: itemCountries(item),
    };
  });
  const averages = WEIGHTS.map(
    (_, f) =>
      docs.reduce((n, d) => n + d.lengths[f], 0) / Math.max(1, docs.length) || 1
  );
  const df = new Map<string, number>();
  const primaryVocab = new Set<string>();
  for (const doc of docs) {
    const all = new Set(doc.fields.flatMap((f) => [...f.keys()]));
    for (const t of all) df.set(t, (df.get(t) ?? 0) + 1);
    for (const t of [...doc.fields[0].keys(), ...doc.fields[1].keys()])
      primaryVocab.add(t);
  }
  const vocabulary = [...df.keys()];
  const idf = (term: string) =>
    Math.log(
      1 +
        (docs.length - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5)
    );
  const termScore = (
    doc: (typeof docs)[number],
    term: string,
    primaryOnly = false
  ) => {
    let tf = 0;
    for (let f = 0; f < (primaryOnly ? 2 : WEIGHTS.length); f++)
      tf +=
        (WEIGHTS[f] * (doc.fields[f].get(term) ?? 0)) /
        (0.6 + (0.4 * doc.lengths[f]) / averages[f]);
    return (idf(term) * 2.2 * tf) / (1.2 + tf);
  };
  // Query expansion is per-query, never per-document. The index and vocabulary
  // live for the catalogue's ten-minute lifetime.
  function search(
    query: string,
    options: { geo?: string; type?: T["type"]; prefix?: boolean } = {}
  ): KeywordHit<T>[] {
    const extracted = extractCountries(query);
    const countries = extracted.codes;
    let rawTokens = extracted.words;
    // A misspelled demonym is still a geography, not a content word.
    rawTokens = rawTokens.filter((t) => {
      if (countries.size || df.has(stem(t)) || typoLimit(t) === 0) return true;
      for (const [term, code] of countryLexicon)
        if (
          !term.includes(" ") &&
          editDistance(t, term, typoLimit(t)) <= typoLimit(t)
        ) {
          countries.add(code);
          return false;
        }
      return true;
    });
    const geoValue = options.geo?.toLowerCase();
    const geo = options.geo
      ? extractCountries(options.geo).codes
      : new Set<string>();
    if (options.geo && countryCodes.has(options.geo.toUpperCase()))
      geo.add(options.geo.toUpperCase());
    for (const code of geo) countries.add(code);
    // Region hints retain the old catalogue-geography boost without being
    // mistaken for an ISO country and demoting every country-specific item.
    const regionHint = geoValue && !geo.size ? geoValue : undefined;
    let tokens = [...new Set(content(rawTokens))];
    // Registry names and bare countries mean a registry/company lookup. Country
    // words never accrue lexical points, even in this country-only case.
    if (!tokens.length && countries.size) tokens = ["company", "data"];
    if (!tokens.length) return [];
    const rawLast = words(query).at(-1);
    const last = rawLast && stem(rawLast);
    const expansions = tokens.map((token) => {
      const alternatives: Array<{
        term: string;
        weight: number;
        primaryOnly: boolean;
        alias: boolean;
      }> = [{ term: token, weight: 1, primaryOnly: false, alias: false }];
      for (const alias of aliasTermsFor(
        rawTokens.filter((t) => stem(t) === token)
      ))
        alternatives.push({
          term: stem(alias),
          weight: ALIAS_PRIMARY_WEIGHT,
          primaryOnly: false,
          alias: true,
        });
      if (!df.has(token)) {
        if (options.prefix !== false && token === last && token.length >= 2)
          for (const term of primaryVocab)
            if (term.startsWith(token))
              alternatives.push({
                term,
                weight: 0.65,
                primaryOnly: true,
                alias: false,
              });
        const tolerance = typoLimit(token);
        if (tolerance)
          for (const term of vocabulary)
            if (editDistance(token, term, tolerance) <= tolerance)
              alternatives.push({
                term,
                weight: 0.5,
                primaryOnly: false,
                alias: false,
              });
      }
      return alternatives;
    });
    const hyphens = query
      .toLowerCase()
      .trim()
      .split(/\s+/)
      .map((w) => w.replace(/-+/g, "-").replace(/^-|-$/g, ""))
      .filter((w) => w.includes("-"));
    const scored: KeywordHit<T>[] = [];
    for (const doc of docs) {
      if (options.type && doc.item.type !== options.type) continue;
      const matches = expansions.map((variants) =>
        Math.max(
          ...variants.map((v) => {
            const aliasWeight =
              v.alias &&
              !doc.fields[0].has(v.term) &&
              !doc.fields[1].has(v.term)
                ? ALIAS_SECONDARY_WEIGHT
                : v.weight;
            return termScore(doc, v.term, v.primaryOnly) * aliasWeight;
          })
        )
      );
      // Unknown slug-shaped words cannot surface unrelated matches on just one
      // of their segments. Joined e-mail is handled below.
      let rejected = false;
      for (const h of hyphens) {
        if (isSlugFamilyMatch(doc.item.slug, h)) continue;
        const parts = h.split("-");
        if (doc.fields.some((f) => f.has(stem(parts.join(""))))) continue;
        if (parts.some((p) => p.length < 2)) {
          rejected = true;
          break;
        }
        const required = fieldTokens(h);
        if (
          !required.length ||
          required.some((p) => !matches[tokens.indexOf(p)])
        ) {
          rejected = true;
          break;
        }
      }
      if (rejected) continue;
      let score = matches.reduce((a, b) => a + b, 0);
      let matched = matches.filter((s) => s > 0).length;
      for (const h of hyphens)
        if (doc.fields.some((f) => f.has(stem(h.replace(/-/g, ""))))) {
          score += termScore(doc, stem(h.replace(/-/g, "")));
          matched++;
        }
      if (!score) continue;
      const coverage = Math.min(1, matched / tokens.length);
      score *= 0.4 + 0.6 * coverage;
      // Identity is one signal: exact slug/name, otherwise family, otherwise
      // all slug words. Do not collect three bonuses for the same naming.
      const clean = query.toLowerCase().trim().replace(/\s+/g, " ");
      const identity = doc.identity;
      if (clean === doc.item.slug || clean === doc.item.name.toLowerCase())
        score += 40;
      else if (hyphens.some((h) => isSlugFamilyMatch(doc.item.slug, h)))
        score += 20;
      else if (identity.length > 1 && identity.every((t) => tokens.includes(t)))
        score += 8;
      if (countries.size && doc.countries.size)
        score *= [...countries].some((c) => doc.countries.has(c)) ? 1.8 : 0.15;
      if (regionHint && doc.item.geography?.toLowerCase().includes(regionHint))
        score *= 1.25;
      const snippet =
        options.prefix !== false &&
        last &&
        last.length >= 2 &&
        !df.has(last) &&
        doc.nameTokens.some((t) => t.startsWith(last))
          ? doc.item.name
          : undefined;
      scored.push({
        item: doc.item,
        score,
        coverage,
        ...(snippet ? { snippet } : {}),
      });
    }
    applyConditionalSolutionBonus(scored, 0.01);
    scored.sort(
      (a, b) =>
        b.score - a.score || a.item.slug.localeCompare(b.item.slug, "en")
    );
    // total and returned entries use this same relative cutoff, before grouping.
    const cutoff = (scored[0]?.score ?? Infinity) * RELEVANCE_RATIO;
    return scored.filter((r) => r.score >= cutoff);
  }
  return { search };
}
