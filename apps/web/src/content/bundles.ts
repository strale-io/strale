// Bundled-check families: the per-country bundles that share one recipe, shown on /tools as one
// card each with the countries they run in, instead of one row per country. Editorial lines in the
// same voice as jobs.ts; each names only what every member of the family does, taken from the
// bundles' own step lists. A bundle whose slug matches no family is listed on its own.

export interface BundleFamily {
  /** Slug prefix: a member's slug is `${prefix}-${cc}`. */
  prefix: string;
  label: string;
  line: string;
}

export const BUNDLE_FAMILIES: BundleFamily[] = [
  { prefix: "kyb-essentials", label: "Quick company check", line: "Confirm the company is in its official register, check its VAT registration and LEI, and screen it against sanctions lists." },
  { prefix: "kyb-complete", label: "Full company check", line: "Registry, VAT, LEI and published ownership; sanctions, politically exposed person and adverse media screening; the company’s web presence; and a plain-language risk summary." },
  { prefix: "invoice-verify", label: "Invoice issuer check", line: "Before you pay: does the issuer exist, are its bank details and VAT number valid, is it sanctioned or in the news, and can the sending domain be trusted. With a plain-language fraud assessment." },
];

export function familyOf(slug: string): BundleFamily | null {
  return BUNDLE_FAMILIES.find((f) => slug.startsWith(`${f.prefix}-`) && /^[a-z]{2}$/.test(slug.slice(f.prefix.length + 1))) ?? null;
}
