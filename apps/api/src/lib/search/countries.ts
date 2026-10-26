/** ISO codes follow catalogue spelling (UK, rather than GB). */
const COUNTRIES: Record<string, string[]> = {
  SE: ["sweden", "swedish", "bolagsverket", "orgnr", "organisationsnummer"],
  NO: ["norway", "norwegian", "brønnøysund", "bronnoysund", "brreg"],
  DK: ["denmark", "danish", "cvr"],
  FI: ["finland", "finnish", "prh"],
  DE: ["germany", "german", "handelsregister"],
  FR: ["france", "french", "siren", "siret", "sirene"],
  AU: ["australia", "australian", "abn"],
  CZ: ["czech", "czechia", "ico", "ičo", "ares"],
  IE: ["ireland", "irish", "cro"],
  NL: ["netherlands", "dutch", "kvk"],
  UK: ["uk", "britain", "british", "united kingdom", "companies house"],
  US: ["us", "usa", "american", "united states", "sec", "edgar"],
  AT: ["austria", "austrian", "firmenbuch"],
  BE: ["belgium", "belgian", "kbo", "bce"],
  BR: ["brazil", "brazilian", "cnpj"],
  CA: ["canada", "canadian"],
  CH: ["switzerland", "swiss", "zefix"],
  EE: ["estonia", "estonian"],
  ES: ["spain", "spanish", "borme"],
  GR: ["greece", "greek", "gemi"],
  HR: ["croatia", "croatian", "oib"],
  HU: ["hungary", "hungarian"],
  IT: ["italy", "italian"],
  JP: ["japan", "japanese"],
  LT: ["lithuania", "lithuanian"],
  LV: ["latvia", "latvian"],
  LU: ["luxembourg"],
  MT: ["malta", "maltese"],
  PL: ["poland", "polish", "krs"],
  PT: ["portugal", "portuguese"],
  RO: ["romania", "romanian"],
  SG: ["singapore", "singaporean", "acra", "uen"],
  SI: ["slovenia", "slovenian"],
  SK: ["slovakia", "slovak"],
  CY: ["cyprus", "cypriot"],
  IS: ["iceland", "icelandic"],
};
export const countryLexicon = new Map(
  Object.entries(COUNTRIES).flatMap(([code, terms]) =>
    terms.map((t) => [t, code] as const)
  )
);
export const countryCodes = new Set(Object.keys(COUNTRIES));
const REGISTRY_TERMS_LIST = [
  "abn", "kvk", "siren", "siret", "sirene", "cro", "krs", "ico", "ičo",
  "ares", "cvr", "orgnr", "organisationsnummer", "brreg", "brønnøysund",
  "bronnoysund", "companies house", "handelsregister", "bolagsverket", "prh",
  "firmenbuch", "kbo", "bce", "cnpj", "zefix", "borme", "gemi", "oib", "acra", "uen",
];
const REGISTRY_TERMS = new Set(REGISTRY_TERMS_LIST);
export function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize("NFKC")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}
// Country names and adjectives of 6+ letters, for one-edit typo recovery
// ("norwegain", "germnay"). Shorter words stay exact: "malt" is not Malta.
const FUZZY_COUNTRY_TERMS = [...countryLexicon.keys()].filter(
  (t) => t.length >= 6 && /^[a-z]+$/.test(t) && !REGISTRY_TERMS_LIST.includes(t)
);
/** True when a and b differ by at most one insertion, deletion, substitution
 *  or adjacent transposition. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
// Typo recovery is only attempted next to a company/registry cue, so ordinary
// English words one edit from a country ("finish", "trench", "hungry") are
// never read as countries on their own.
const COMPANY_CUE = /^(company|companies|business|businesses|registry|register|kyb|firm|firms|corporation|corporate|incorporation|supplier|vendor|vat)$/;
const US_PREV = /^(company|companies|business|registry|register|corporate|incorporation|sec|edgar|filings|data|lookup|search|check|info|information)$/;
function fuzzyCountry(token: string, isKnownWord?: (t: string) => boolean): string | undefined {
  if (token.length < 6 || !/^[a-z]+$/.test(token) || isKnownWord?.(token)) return undefined;
  const hits = new Set(FUZZY_COUNTRY_TERMS.filter((t) => withinOneEdit(token, t)).map((t) => countryLexicon.get(t)!));
  return hits.size === 1 ? [...hits][0] : undefined;
}
/** isKnownWord: a catalogue-vocabulary check, so a real catalogue word is
 *  never reinterpreted as a misspelt country. Only query parsing passes it. */
export function extractCountries(text: string, isKnownWord?: (t: string) => boolean): {
  codes: Set<string>;
  registryCodes: Set<string>;
  words: string[];
} {
  const tokens = words(text);
  const rawTokens = text.normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];
  const codes = new Set<string>();
  const registryCodes = new Set<string>();
  const remaining: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const pair = countryLexicon.get(`${tokens[i]} ${tokens[i + 1]}`);
    const hasCompanyCue = tokens.some((t, j) => j !== i && COMPANY_CUE.test(t));
    let code = pair ?? countryLexicon.get(tokens[i]) ??
      (isKnownWord && hasCompanyCue ? fuzzyCountry(tokens[i], isKnownWord) : undefined);
    // Lowercase pronoun "us" is common in contact/email queries. Require a
    // country cue; uppercase US, "the us" and "united states" stay explicit.
    const companyCue = (t?: string) =>
      /^(company|companies|registry|business|corporate|incorporation|sec|edgar|filings)$/.test(t ?? "");
    // "company data us": last token, directly after a company/data word, with a
    // company cue earlier. "business card for us" stays a pronoun.
    const trailingUs = i === tokens.length - 1 && US_PREV.test(tokens[i - 1] ?? "") &&
      tokens.slice(0, i).some((t) => companyCue(t));
    if (tokens[i] === "us" && rawTokens[i] !== "US" &&
        tokens[i - 1] !== "the" && !trailingUs &&
        ![tokens[i - 1], tokens[i + 1]].some((t) =>
          /^(company|companies|registry|business|corporate|incorporation|sec|edgar|filings)$/.test(t ?? "")))
      code = undefined;
    if (code) {
      codes.add(code);
      if (REGISTRY_TERMS.has(pair ? `${tokens[i]} ${tokens[i + 1]}` : tokens[i]))
        registryCodes.add(code);
      if (pair) i++;
    } else remaining.push(tokens[i]);
  }
  return { codes, registryCodes, words: remaining };
}
/** Trust explicit single-country geography; recover broad/mistagged scope from
 * the identity only. Descriptions mention other countries as data sources. */
export function itemCountries(item: {
  name: string;
  slug: string;
  geography: string | null;
}): Set<string> {
  const geo = item.geography?.toUpperCase() ?? "";
  if (countryCodes.has(geo)) return new Set([geo]);
  const identity = extractCountries(`${item.name} ${item.slug}`).codes;
  const suffix = item.slug.match(/-([a-z]{2})$/)?.[1].toUpperCase();
  if (suffix && countryCodes.has(suffix)) identity.add(suffix);
  return identity;
}
