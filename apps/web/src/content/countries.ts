// Editorial map from a company-data tool's slug to the country it covers.
// The API has no country field: the registry tools are named
// `<prefix>-company-data` (optionally with a vendor suffix, e.g.
// `us-company-data-cobalt`). Which countries are live is never typed here;
// it is read from the catalogue at build time. test/editorial.test.ts fails
// when a live registry tool has no entry, so a new country cannot silently
// drop off the coverage pages.

export type Region = "Europe" | "Americas" | "Asia-Pacific";

export interface Country {
  iso: string;
  name: string;
  region: Region;
  /** URL segment for /company-data/:country. */
  path: string;
}

const C = (iso: string, name: string, region: Region): Country => ({ iso, name, region, path: name.toLowerCase().replace(/[^a-z]+/g, "-") });

export const COUNTRY_BY_PREFIX: Record<string, Country> = {
  au: C("AU", "Australia", "Asia-Pacific"),
  australian: C("AU", "Australia", "Asia-Pacific"),
  austrian: C("AT", "Austria", "Europe"),
  belgian: C("BE", "Belgium", "Europe"),
  brazilian: C("BR", "Brazil", "Americas"),
  bulgarian: C("BG", "Bulgaria", "Europe"),
  canadian: C("CA", "Canada", "Americas"),
  croatian: C("HR", "Croatia", "Europe"),
  cypriot: C("CY", "Cyprus", "Europe"),
  cz: C("CZ", "Czechia", "Europe"),
  danish: C("DK", "Denmark", "Europe"),
  dutch: C("NL", "Netherlands", "Europe"),
  estonian: C("EE", "Estonia", "Europe"),
  finnish: C("FI", "Finland", "Europe"),
  french: C("FR", "France", "Europe"),
  german: C("DE", "Germany", "Europe"),
  greek: C("GR", "Greece", "Europe"),
  hungarian: C("HU", "Hungary", "Europe"),
  irish: C("IE", "Ireland", "Europe"),
  italian: C("IT", "Italy", "Europe"),
  japanese: C("JP", "Japan", "Asia-Pacific"),
  latvian: C("LV", "Latvia", "Europe"),
  lithuanian: C("LT", "Lithuania", "Europe"),
  luxembourgish: C("LU", "Luxembourg", "Europe"),
  maltese: C("MT", "Malta", "Europe"),
  norwegian: C("NO", "Norway", "Europe"),
  polish: C("PL", "Poland", "Europe"),
  portuguese: C("PT", "Portugal", "Europe"),
  romanian: C("RO", "Romania", "Europe"),
  singapore: C("SG", "Singapore", "Asia-Pacific"),
  slovak: C("SK", "Slovakia", "Europe"),
  slovenian: C("SI", "Slovenia", "Europe"),
  spanish: C("ES", "Spain", "Europe"),
  swedish: C("SE", "Sweden", "Europe"),
  swiss: C("CH", "Switzerland", "Europe"),
  uk: C("GB", "United Kingdom", "Europe"),
  us: C("US", "United States", "Americas"),
};

export const REGIONS: Region[] = ["Europe", "Americas", "Asia-Pacific"];

/** The slug prefix of a company-registry tool, or null for any other tool. */
export function companyDataPrefix(slug: string): string | null {
  return slug.match(/^([a-z]+)-company-data(?:-[a-z0-9-]+)?$/)?.[1] ?? null;
}
