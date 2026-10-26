/** ISO codes follow catalogue spelling (UK, rather than GB). */
const COUNTRIES: Record<string, string[]> = {
  SE: ["sweden", "swedish", "swedsih", "bolagsverket", "orgnr", "organisationsnummer"],
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
const REGISTRY_TERMS = new Set([
  "abn", "kvk", "siren", "siret", "sirene", "cro", "krs", "ico", "ičo",
  "ares", "cvr", "orgnr", "organisationsnummer", "brreg", "brønnøysund",
  "bronnoysund", "companies house", "handelsregister", "bolagsverket", "prh",
  "firmenbuch", "kbo", "bce", "cnpj", "zefix", "borme", "gemi", "oib", "acra", "uen",
]);
export function words(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize("NFKC")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}
export function extractCountries(text: string): {
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
    let code = pair ?? countryLexicon.get(tokens[i]);
    // Lowercase pronoun "us" is common in contact/email queries. Require a
    // country cue; uppercase US, "the us" and "united states" stay explicit.
    if (tokens[i] === "us" && rawTokens[i] !== "US" &&
        tokens[i - 1] !== "the" &&
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
