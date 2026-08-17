/**
 * Corrected output contracts for capabilities whose declared schema drifted
 * away from what their executor actually returns.
 *
 * Why this module exists. `capabilities.output_schema.properties` and
 * `capabilities.output_field_reliability` are what the test harness measures a
 * capability against — Gate 2 (null-field ratio) walks the declared properties
 * and treats an absent one as null, and Gate 3 (the guaranteed-fields sentinel)
 * fails on a missing guaranteed key. When an executor is reshaped and the
 * declaration is not, the harness reports a healthy capability as broken,
 * forever.
 *
 * That is what happened here. Measured against production 2026-08-17: seven
 * capabilities were failing their known-answer suite while returning correct,
 * fully-populated answers to real calls. Each manifest's `output_schema.example`
 * had been regenerated at some point and already showed the real shape, while
 * `properties` still listed a flat field set the executor had stopped
 * returning. `iso-country-lookup` is the clearest case: it declares
 * `name, region, alpha_2, alpha_3, schengen, eu_member` at the top level and
 * returns them nested under `match`, so Gate 2 scored it "100% of declared
 * fields returned null (6/6)".
 *
 * Every shape below was captured by calling production directly with the
 * capability's own fixture input — not read off the executor source, and not
 * inferred from the manifest.
 *
 * Reliability levels are chosen to be TRUE, not to be quiet:
 *   - `guaranteed` — present and non-empty on every successful call.
 *   - `common`     — the key is always present but may be empty, or the field
 *                    belongs to one of two mutually exclusive response shapes.
 *   - `rare`       — only on an error/unsupported branch.
 * Downgrading a field that is genuinely conditional is a correction, not a
 * weakening; declaring a conditional field `guaranteed` is what produced the
 * false alarms. Where a downgrade does cost real coverage, it is called out in
 * the entry's `note`.
 */

export type Reliability = "guaranteed" | "common" | "rare";

export interface OutputContract {
  /** JSON-schema `properties` for the capability's output. */
  properties: Record<string, { type: string }>;
  /** Per-field reliability, keyed by the same names. */
  reliability: Record<string, Reliability>;
  /**
   * Replacement known-answer fixture input, when the stored one is a
   * placeholder that exercises the empty path instead of the correct one.
   */
  knownAnswerInput?: Record<string, unknown>;
  /** Why this capability drifted, and what the correction costs. */
  note: string;
}

export const CAPABILITY_OUTPUT_CONTRACTS: Record<string, OutputContract> = {
  // {"query":"Sweden"} -> {query, match}
  // {"query":"land"}   -> {query, matches, total_matches}
  // no match           -> {query, matches, total_matches, error}
  "iso-country-lookup": {
    properties: {
      query: { type: "string" },
      match: { type: "object" },
      matches: { type: "array" },
      total_matches: { type: "integer" },
      error: { type: "string" },
    },
    reliability: {
      query: "guaranteed",
      match: "common",
      matches: "common",
      total_matches: "common",
      error: "rare",
    },
    note:
      "Two mutually exclusive shapes: an exact hit returns `match`, a fuzzy hit returns " +
      "`matches`/`total_matches`. Neither can be guaranteed, so only `query` is. That leaves " +
      "one guaranteed field, below Gate 2's three-field minimum, so the null-ratio rule no " +
      "longer applies to this capability — the explicit not_null checks in its suite's " +
      "validation_rules remain the assertion that would catch a regression.",
  },

  // {"incoterm":"FOB"} -> {incoterm, version, published_by}
  // unknown code       -> {error, available_codes, available_terms}
  "incoterms-explain": {
    properties: {
      incoterm: { type: "object" },
      version: { type: "string" },
      published_by: { type: "string" },
      error: { type: "string" },
      available_codes: { type: "array" },
      available_terms: { type: "array" },
    },
    reliability: {
      incoterm: "guaranteed",
      version: "guaranteed",
      published_by: "guaranteed",
      error: "rare",
      available_codes: "rare",
      available_terms: "rare",
    },
    note:
      "The four declared fields (full_name, buyer_obligations, seller_obligations, " +
      "risk_transfer_point) moved inside the `incoterm` object. Three guaranteed fields " +
      "remain, so Gate 2 still applies at full strength.",
  },

  // {"substance":"acid"} -> {query, matches, total_matches}
  // no match             -> {query, matches, total_matches, error}
  "dangerous-goods-classify": {
    properties: {
      query: { type: "string" },
      matches: { type: "array" },
      total_matches: { type: "integer" },
      error: { type: "string" },
    },
    reliability: {
      query: "guaranteed",
      matches: "guaranteed",
      total_matches: "guaranteed",
      error: "rare",
    },
    note:
      "class/un_number/packing_group/marine_pollutant/proper_shipping_name are per-result " +
      "fields inside `matches[]`, never top-level. The three envelope fields are always " +
      "present, so all three stay guaranteed and Gate 2 keeps full strength. `total_matches: 0` " +
      "is not an empty value, so a genuine no-match still passes; an executor that stopped " +
      "returning `matches` entirely would still fail.",
  },

  // {"id":"559395-7979"} -> {input, detected, best_match, all_matches}
  // {"id":"test_value"}  -> {input, detected, matches, message}
  "company-id-detect": {
    properties: {
      input: { type: "string" },
      detected: { type: "boolean" },
      best_match: { type: "object" },
      all_matches: { type: "array" },
      matches: { type: "array" },
      message: { type: "string" },
    },
    reliability: {
      input: "guaranteed",
      detected: "guaranteed",
      best_match: "common",
      all_matches: "common",
      matches: "common",
      message: "common",
    },
    knownAnswerInput: { id: "559395-7979" },
    note:
      "The stored fixture input was the literal placeholder `test_value`, which exercises the " +
      "not-detected branch — so `best_match` was legitimately absent and the sentinel failed on " +
      "it every run. A correctness fixture must use a real identifier; this is Moonlighter AB's " +
      "Swedish org number. best_match/all_matches are genuinely conditional on `detected`.",
  },

  // {"full_name":"Dr. John Robert Smith Jr."} -> all seven keys, nickname null
  "name-parse": {
    properties: {
      full_name: { type: "string" },
      first_name: { type: "string" },
      last_name: { type: "string" },
      middle_name: { type: "string" },
      prefix: { type: "string" },
      suffix: { type: "string" },
      nickname: { type: "string" },
    },
    reliability: {
      full_name: "guaranteed",
      first_name: "guaranteed",
      last_name: "guaranteed",
      middle_name: "common",
      prefix: "common",
      suffix: "common",
      nickname: "common",
    },
    note:
      "Most names have no prefix, suffix, middle name or nickname. Declaring all six parts " +
      "guaranteed meant a plain 'John Smith' scored 67% null — the capability was being " +
      "marked broken for parsing an ordinary name correctly. Three guaranteed fields remain.",
  },

  // Real shape has eight keys; every one is always present, arrays may be empty.
  "skill-extract": {
    properties: {
      technical_skills: { type: "array" },
      soft_skills: { type: "array" },
      tools: { type: "array" },
      certifications: { type: "array" },
      languages: { type: "array" },
      experience_levels_mentioned: { type: "array" },
      seniority_signals: { type: "array" },
      total_skills_found: { type: "integer" },
    },
    reliability: {
      technical_skills: "guaranteed",
      languages: "guaranteed",
      total_skills_found: "guaranteed",
      soft_skills: "common",
      tools: "common",
      certifications: "common",
      experience_levels_mentioned: "common",
      seniority_signals: "common",
    },
    knownAnswerInput: {
      text:
        "Senior backend engineer with 6 years building Python and TypeScript services on AWS " +
        "and Kubernetes. Day-to-day tools are Docker, Git and Terraform. AWS Certified " +
        "Solutions Architect. Known for clear written communication and mentoring juniors. " +
        "Fluent in Swedish and English.",
    },
    note:
      "The stored fixture text was 'This is a test input for automated capability testing.' — " +
      "prose containing no skills, so every category came back empty and Gate 2 scored it " +
      "100% null. The capability was correct; the fixture asked it to find nothing. Replaced " +
      "with a résumé fragment that genuinely contains skills, tools, a certification and " +
      "languages, so the three guaranteed categories are non-empty and Gate 2 keeps its bite.",
  },

  // {company_name:"Tesco PLC", jurisdiction:"GB"} ->
  //   {company_name, company_number, jurisdiction, company_status,
  //    beneficial_owners, total_beneficial_owners, has_psc_data, data_source}
  // unsupported jurisdiction ->
  //   {company_name, company_number, jurisdiction, supported_jurisdiction,
  //    message, supported_jurisdictions}
  "beneficial-ownership-lookup": {
    properties: {
      company_name: { type: "string" },
      company_number: { type: "string" },
      jurisdiction: { type: "string" },
      company_status: { type: "string" },
      beneficial_owners: { type: "array" },
      total_beneficial_owners: { type: "integer" },
      has_psc_data: { type: "boolean" },
      data_source: { type: "string" },
      supported_jurisdiction: { type: "boolean" },
      message: { type: "string" },
      supported_jurisdictions: { type: "array" },
    },
    reliability: {
      company_name: "guaranteed",
      jurisdiction: "guaranteed",
      company_number: "common",
      company_status: "common",
      beneficial_owners: "common",
      total_beneficial_owners: "common",
      has_psc_data: "common",
      data_source: "common",
      supported_jurisdiction: "rare",
      message: "rare",
      supported_jurisdictions: "rare",
    },
    note:
      "Declared query/lookup_date/total_owners/company_match; the executor returns none of " +
      "those names, which is why the sentinel failed on `query` every run. UK-only coverage " +
      "means the unsupported-jurisdiction branch is a real second shape. `beneficial_owners` " +
      "stays common because a company with no PSC entries correctly returns [] — Tesco PLC " +
      "does. Two guaranteed fields leaves this below Gate 2's three-field minimum; the " +
      "sentinel still enforces both keys.",
  },
};

/** Slugs this module corrects, in a stable order for logging and tests. */
export const CORRECTED_SLUGS = Object.keys(CAPABILITY_OUTPUT_CONTRACTS).sort();
