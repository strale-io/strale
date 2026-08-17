/**
 * Contract tests for the seven realigned capabilities.
 *
 * These assert three things:
 *   1. Every contract reproduces the shape production actually returns, using
 *      responses captured 2026-08-17 by calling /v1/do directly.
 *   2. Under those contracts the harness's two gates PASS, and — the part that
 *      matters — they still FAIL for a genuinely broken executor. A correction
 *      that silences the alarm by removing all coverage is not a fix.
 *   3. The manifests on disk agree with the module the migration writes from,
 *      so the two cannot drift apart again. That drift is the whole defect:
 *      every one of these manifests already carried a correct
 *      `output_schema.example` alongside a stale `properties`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import {
  CAPABILITY_OUTPUT_CONTRACTS,
  CORRECTED_SLUGS,
  type OutputContract,
} from "./capability-output-contracts.js";
import { calculateNullFieldRatio } from "./null-field-ratio.js";
import { checkGuaranteedFieldsPresent } from "./guaranteed-fields-sentinel.js";

const REPO = resolve(import.meta.dirname, "../../../..");

/**
 * Verbatim production responses, captured 2026-08-17 by POSTing each
 * capability's own known-answer input to /v1/do. Trimmed only where a nested
 * object's contents are irrelevant to the gates, which walk top-level keys.
 */
const PROD: Record<string, Record<string, unknown>> = {
  "iso-country-lookup": { query: "Sweden", match: { name: "Sweden", alpha_2: "SE" } },
  "incoterms-explain": {
    incoterm: { code: "FOB", full_name: "Free On Board" },
    version: "Incoterms 2020",
    published_by: "International Chamber of Commerce",
  },
  "dangerous-goods-classify": {
    query: "acid",
    matches: [{ un_number: "UN3149", class: "5" }],
    total_matches: 2,
  },
  "company-id-detect": {
    input: "559395-7979",
    detected: true,
    best_match: { country: "Sweden", id_type: "org_number" },
    all_matches: [{ country: "Sweden" }],
  },
  "name-parse": {
    full_name: "Dr. John Robert Smith Jr.",
    first_name: "John",
    middle_name: "Robert",
    last_name: "Smith",
    prefix: "Dr.",
    suffix: "Jr.",
    nickname: null,
  },
  "skill-extract": {
    technical_skills: ["Python", "TypeScript", "AWS", "Kubernetes"],
    soft_skills: ["communication", "mentoring"],
    tools: ["Docker", "Git", "Terraform"],
    certifications: ["AWS Certified"],
    languages: ["Swedish", "English"],
    experience_levels_mentioned: ["6+ years"],
    seniority_signals: ["senior"],
    total_skills_found: 12,
  },
  "beneficial-ownership-lookup": {
    company_name: "TESCO PLC",
    company_number: "00445790",
    jurisdiction: "gb",
    company_status: "active",
    beneficial_owners: [],
    total_beneficial_owners: 0,
    has_psc_data: true,
    data_source: "UK Companies House PSC Register",
  },
};

/** The two gates the test runner applies, in the order it applies them. */
function gates(output: Record<string, unknown>, c: OutputContract) {
  const sentinel = checkGuaranteedFieldsPresent(output, c.reliability);
  const ratio = calculateNullFieldRatio(output, { properties: c.properties }, c.reliability);
  return { sentinel, ratio, passes: sentinel.passed && !ratio.wouldFail };
}

describe("capability output contracts — production shapes pass both gates", () => {
  it.each(CORRECTED_SLUGS)("%s", (slug) => {
    const c = CAPABILITY_OUTPUT_CONTRACTS[slug]!;
    const { sentinel, ratio, passes } = gates(PROD[slug]!, c);
    expect(sentinel.failureReason ?? null).toBeNull();
    expect(ratio.wouldFail).toBe(false);
    expect(passes).toBe(true);
  });

  it.each(CORRECTED_SLUGS)("%s declares every key production returned", (slug) => {
    const declared = new Set(Object.keys(CAPABILITY_OUTPUT_CONTRACTS[slug]!.properties));
    for (const key of Object.keys(PROD[slug]!)) {
      expect(declared, `${slug}.${key} is returned but not declared`).toContain(key);
    }
  });

  it.each(CORRECTED_SLUGS)("%s annotates reliability for exactly its declared fields", (slug) => {
    const c = CAPABILITY_OUTPUT_CONTRACTS[slug]!;
    expect(Object.keys(c.reliability).sort()).toEqual(Object.keys(c.properties).sort());
  });
});

describe("the corrections still catch a broken executor", () => {
  // The failure mode a lenient "fix" would introduce: silence the alarm by
  // declaring everything optional. Each case below is a plausible breakage that
  // must still be caught.

  it("iso-country-lookup: an empty envelope still fails the sentinel", () => {
    const c = CAPABILITY_OUTPUT_CONTRACTS["iso-country-lookup"]!;
    expect(gates({ match: { name: "Sweden" } }, c).sentinel.passed).toBe(false);
  });

  it("dangerous-goods-classify: losing `matches` entirely still fails", () => {
    const c = CAPABILITY_OUTPUT_CONTRACTS["dangerous-goods-classify"]!;
    // Keys dropped by a parser regression → sentinel catches it.
    expect(gates({ query: "acid" }, c).sentinel.passed).toBe(false);
    // Keys present but the search silently returns nothing for every query →
    // null-ratio catches it (2 of 3 guaranteed fields empty).
    const empty = gates({ query: "acid", matches: [], total_matches: 0 }, c);
    expect(empty.sentinel.passed).toBe(true);
    expect(empty.ratio.wouldFail).toBe(false); // total_matches: 0 is a real answer, not an empty one
    // ...but an all-empty envelope is not:
    expect(gates({ query: "", matches: [], total_matches: null }, c).ratio.wouldFail).toBe(true);
  });

  it("incoterms-explain: a hollowed-out response still fails on null ratio", () => {
    const c = CAPABILITY_OUTPUT_CONTRACTS["incoterms-explain"]!;
    const r = gates({ incoterm: null, version: null, published_by: null }, c);
    expect(r.ratio.wouldFail).toBe(true);
    expect(r.ratio.nullCount).toBe(3);
  });

  it("name-parse: losing the actual name parts still fails", () => {
    const c = CAPABILITY_OUTPUT_CONTRACTS["name-parse"]!;
    const r = gates(
      { full_name: "", first_name: null, last_name: null, middle_name: null, prefix: null, suffix: null, nickname: null },
      c,
    );
    expect(r.ratio.wouldFail).toBe(true);
  });

  it("name-parse: an ordinary name with no prefix or nickname PASSES", () => {
    // The regression this correction exists to stop — 'John Smith' scored 67%
    // null and was reported as an algorithmic-correctness violation.
    const c = CAPABILITY_OUTPUT_CONTRACTS["name-parse"]!;
    const r = gates(
      { full_name: "John Smith", first_name: "John", last_name: "Smith", middle_name: null, prefix: null, suffix: null, nickname: null },
      c,
    );
    expect(r.passes).toBe(true);
  });

  it("skill-extract: extracting nothing from a real résumé still fails", () => {
    const c = CAPABILITY_OUTPUT_CONTRACTS["skill-extract"]!;
    const r = gates(
      { technical_skills: [], soft_skills: [], tools: [], certifications: [], languages: [], experience_levels_mentioned: [], seniority_signals: [], total_skills_found: 0 },
      c,
    );
    // 2 of 3 guaranteed categories empty (total_skills_found: 0 is not empty).
    expect(r.ratio.wouldFail).toBe(true);
  });

  it("beneficial-ownership-lookup: dropping the identity fields still fails", () => {
    const c = CAPABILITY_OUTPUT_CONTRACTS["beneficial-ownership-lookup"]!;
    expect(gates({ beneficial_owners: [], total_beneficial_owners: 0 }, c).sentinel.passed).toBe(false);
  });

  it("company-id-detect: dropping the echo or the verdict still fails", () => {
    const c = CAPABILITY_OUTPUT_CONTRACTS["company-id-detect"]!;
    expect(gates({ detected: true, best_match: {} }, c).sentinel.passed).toBe(false);
    expect(gates({ input: "x", best_match: {} }, c).sentinel.passed).toBe(false);
  });

  it("company-id-detect: the not-detected branch is legitimate and passes", () => {
    const c = CAPABILITY_OUTPUT_CONTRACTS["company-id-detect"]!;
    const r = gates(
      { input: "test_value", detected: false, matches: [], message: "Could not identify the format of this company ID." },
      c,
    );
    expect(r.passes).toBe(true);
  });
});

describe("manifests agree with the contract module", () => {
  it.each(CORRECTED_SLUGS)("manifests/%s.yaml matches", (slug) => {
    const c = CAPABILITY_OUTPUT_CONTRACTS[slug]!;
    const m = yaml.load(readFileSync(resolve(REPO, `manifests/${slug}.yaml`), "utf8")) as Record<string, any>;
    expect(m.output_schema?.properties).toEqual(c.properties);
    expect(m.output_field_reliability).toEqual(c.reliability);
    if (c.knownAnswerInput) {
      expect(m.test_fixtures?.known_answer?.input).toEqual(c.knownAnswerInput);
    }
  });

  it("no manifest still carries a placeholder known-answer input", () => {
    // 'test_value' and the generic testing sentence are what made two of these
    // suites ask the capability to find nothing and then fail it for complying.
    for (const slug of CORRECTED_SLUGS) {
      const m = yaml.load(readFileSync(resolve(REPO, `manifests/${slug}.yaml`), "utf8")) as Record<string, any>;
      const input = JSON.stringify(m.test_fixtures?.known_answer?.input ?? {});
      expect(input, `${slug} known_answer input`).not.toContain("test_value");
      expect(input, `${slug} known_answer input`).not.toContain("This is a test input for automated");
    }
  });
});
