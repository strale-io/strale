/** ISO codes follow catalogue spelling (UK, rather than GB). */
const COUNTRIES: Record<string, string[]> = {
  SE: ["sweden", "swedish", "bolagsverket"],
  NO: ["norway", "norwegian", "brønnøysund", "bronnoysund"],
  DK: ["denmark", "danish"],
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
  words: string[];
} {
  const tokens = words(text);
  const codes = new Set<string>();
  const remaining: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const pair = countryLexicon.get(`${tokens[i]} ${tokens[i + 1]}`);
    const code = pair ?? countryLexicon.get(tokens[i]);
    if (code) {
      codes.add(code);
      if (pair) i++;
    } else remaining.push(tokens[i]);
  }
  return { codes, words: remaining };
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
