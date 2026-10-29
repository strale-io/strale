/**
 * Licence and attribution for Overture places rows (terms recorded in
 * vendor-terms.data.json, research in
 * docs/research/2026-10-29-open-places-data-licences.md).
 *
 * Overture's places theme contains no OpenStreetMap data, so no ODbL
 * share-alike applies. Each row carries its source's licence:
 * CDLA-Permissive-2.0 (Meta, Microsoft and most providers) requires the
 * licence text to accompany shared data (§2.1); Apache-2.0 (Foursquare)
 * requires a copy of the licence and the NOTICE; CC0-1.0 (AllThePlaces)
 * requires nothing. Every answer therefore carries the licence texts' URLs
 * and Overture's per-provider attribution lines for the sources it returns.
 */

export const LICENSE_TEXT_URLS: Readonly<Record<string, string>> = {
  "CDLA-Permissive-2.0": "https://cdla.dev/permissive-2-0/",
  "Apache-2.0": "https://www.apache.org/licenses/LICENSE-2.0",
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
};

export const OVERTURE_ATTRIBUTION_URL = "https://docs.overturemaps.org/attribution/";

/** Dataset ids that Overture's attribution page spells differently. */
const PROVIDER_NAMES: Readonly<Record<string, string>> = { meta: "Meta", microsoft: "Microsoft" };

/** Overture's own attribution line for a source, as its attribution page words it. */
export function attributionLine(dataset: string, license: string): string {
  const source = PROVIDER_NAMES[dataset.toLowerCase()] ?? dataset;
  if (source.toLowerCase() === "foursquare") {
    return "Copyright 2024 Foursquare Labs, Inc. All rights reserved. Available under Apache 2.0. Foursquare data was transformed to the Overture schema.";
  }
  if (license === "CC0-1.0") return `Data from ${source}. Available under CC0 1.0.`;
  if (license === "CDLA-Permissive-2.0") return `Data from ${source}. Available under CDLA Permissive 2.0.`;
  return `Data from ${source}. Available under ${license}.`;
}

/** Licences this capability may return; a row under any other licence is withheld. */
export function isReturnableLicense(license: string | null): license is string {
  return license !== null && Object.prototype.hasOwnProperty.call(LICENSE_TEXT_URLS, license);
}
