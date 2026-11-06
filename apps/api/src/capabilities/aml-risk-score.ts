import { registerCapability, type CapabilityInput } from "./index.js";

// FATF lists as published after the plenary of 28-30 October 2026.
// Update after every FATF plenary (February, June, October) and move this date.
// Sources: FATF "Jurisdictions under Increased Monitoring - 30 October 2026" and
// "High-Risk Jurisdictions subject to a Call for Action - 30 October 2026"
// (fatf-gafi.org; its pages refuse automated reads behind a bot challenge, so
// the list was read from the FinCEN release of 30 October 2026, which confirms
// the four removals and an unchanged call-for-action list, and from the
// ComplyAdvantage plenary note of 30 October 2026 (updated 2 November), which
// lists all 18). The June 2026 list had 22 jurisdictions; Bulgaria, Cote
// d'Ivoire, the Democratic Republic of the Congo and Monaco were removed, and
// none were added.
export const FATF_LISTS_AS_OF = "2026-10-30";

// FATF Grey List (jurisdictions under increased monitoring), ISO 3166-1 alpha-2.
export const FATF_GREY_LIST: ReadonlySet<string> = new Set([
  "AO", // Angola
  "BO", // Bolivia
  "BA", // Bosnia and Herzegovina
  "CM", // Cameroon
  "HT", // Haiti
  "IQ", // Iraq
  "KE", // Kenya
  "KW", // Kuwait
  "LA", // Lao PDR
  "LB", // Lebanon
  "NP", // Nepal
  "PG", // Papua New Guinea
  "SS", // South Sudan
  "SY", // Syria
  "VE", // Venezuela
  "VN", // Vietnam
  "VG", // Virgin Islands (UK)
  "YE", // Yemen
]);

// FATF Black List (high-risk jurisdictions subject to a call for action).
export const FATF_BLACK_LIST: ReadonlySet<string> = new Set([
  "KP", // Democratic People's Republic of Korea
  "IR", // Iran
  "MM", // Myanmar
]);

// FATF calls for countermeasures (not only enhanced due diligence) against
// these call-for-action jurisdictions; Myanmar is on the call-for-action list
// but subject to enhanced due diligence, so it is scored "high", not
// "prohibited" (FATF call-for-action statement, 30 October 2026).
export const FATF_COUNTERMEASURES: ReadonlySet<string> = new Set(["KP", "IR"]);

// EU list of high-risk third countries: the Annex to Commission Delegated
// Regulation (EU) 2016/1675, consolidated text of 29 January 2026 (CELEX
// 02016R1675-20260129, amendments up to (EU) 2026/46 and (EU) 2026/83), read
// on EUR-Lex on 2026-11-06. The Commission's AML page (last updated 9 January
// 2026) names no later amending act. Update when the Commission adopts the next
// delegated regulation and move this date. All four categories are listed.
export const EU_HIGH_RISK_AS_OF = "2026-01-29";
export const EU_HIGH_RISK: ReadonlySet<string> = new Set([
  // I. Written high-level political commitment and an FATF action plan
  "AF", // Afghanistan
  "DZ", // Algeria
  "AO", // Angola
  "BO", // Bolivia
  "VG", // British Virgin Islands
  "CM", // Cameroon
  "CI", // Cote d'Ivoire
  "CD", // Democratic Republic of the Congo
  "HT", // Haiti
  "KE", // Kenya
  "LA", // Laos
  "LB", // Lebanon
  "MC", // Monaco
  "MM", // Myanmar
  "NA", // Namibia
  "NP", // Nepal
  "SS", // South Sudan
  "SY", // Syria
  "TT", // Trinidad and Tobago
  "VU", // Vanuatu
  "VE", // Venezuela
  "VN", // Vietnam
  "YE", // Yemen
  // II. Political commitment, seeking technical assistance (FATF public statement)
  "IR", // Iran
  // III. Ongoing and substantial risks, repeatedly failed to address them
  "KP", // Democratic People's Republic of Korea
  // IV. Not on FATF lists, but FATF membership suspended
  "RU", // Russian Federation
]);

// Tax haven / secrecy jurisdictions (common in shell company structures).
// Strale's own selection, not taken from a published list; it carries no
// source or as-of date. A sourced replacement (for example the EU list of
// non-cooperative jurisdictions for tax purposes) is open follow-up work.
const SECRECY_JURISDICTIONS = new Set([
  "KY", "VG", "BM", "JE", "GG", "IM", "LI", "MC", "PA", "BZ",
  "SC", "MH", "WS", "VU", "TC",
]);

registerCapability("aml-risk-score", async (input: CapabilityInput) => {
  const entityName = ((input.entity_name as string) ?? (input.name as string) ?? (input.task as string) ?? "").trim();
  if (!entityName) {
    throw new Error("'entity_name' is required.");
  }

  const countryCode = ((input.country_code as string) ?? (input.country as string) ?? "").trim().toUpperCase();
  if (!countryCode || countryCode.length !== 2) {
    throw new Error("'country_code' is required (ISO 2-letter code, e.g. 'SE', 'GB', 'US').");
  }

  const entityType = ((input.entity_type as string) ?? "person").toLowerCase();
  const sanctionsMatch = input.sanctions_match === true;
  const pepMatch = input.pep_match === true;
  const adverseMediaMatch = input.adverse_media_match === true;

  // Calculate risk score
  const riskFactors: Array<{ factor: string; points: number; description: string }> = [];
  let totalPoints = 0;

  // 1. Sanctions match (+50)
  if (sanctionsMatch) {
    riskFactors.push({ factor: "sanctions_match", points: 50, description: "Entity appears on one or more sanctions lists" });
    totalPoints += 50;
  }

  // 2. PEP match (+30)
  if (pepMatch) {
    riskFactors.push({ factor: "pep_match", points: 30, description: "Entity is a Politically Exposed Person or close associate" });
    totalPoints += 30;
  }

  // 3. Adverse media (+20)
  if (adverseMediaMatch) {
    riskFactors.push({ factor: "adverse_media", points: 20, description: "Negative media coverage found (fraud, litigation, regulatory action)" });
    totalPoints += 20;
  }

  // 4. Jurisdiction risk
  if (FATF_BLACK_LIST.has(countryCode)) {
    riskFactors.push({ factor: "fatf_blacklist", points: 20, description: `${countryCode} is on the FATF Black List (call for action)` });
    totalPoints += 20;
  } else if (FATF_GREY_LIST.has(countryCode)) {
    riskFactors.push({ factor: "fatf_greylist", points: 15, description: `${countryCode} is on the FATF Grey List (increased monitoring)` });
    totalPoints += 15;
  } else if (EU_HIGH_RISK.has(countryCode)) {
    riskFactors.push({ factor: "eu_high_risk", points: 12, description: `${countryCode} is on the EU high-risk third country list` });
    totalPoints += 12;
  }

  // 5. Secrecy jurisdiction (+10)
  if (SECRECY_JURISDICTIONS.has(countryCode)) {
    riskFactors.push({ factor: "secrecy_jurisdiction", points: 10, description: `${countryCode} is a known secrecy/tax haven jurisdiction` });
    totalPoints += 10;
  }

  // Cap at 100
  const riskScore = Math.min(totalPoints, 100);

  // Determine risk level
  let riskLevel: string;
  let recommendation: string;
  if (riskScore >= 70) {
    riskLevel = "critical";
    recommendation = "Enhanced Due Diligence (EDD) required. Senior management approval needed before proceeding.";
  } else if (riskScore >= 45) {
    riskLevel = "high";
    recommendation = "Enhanced Due Diligence (EDD) required. Additional verification and monitoring recommended.";
  } else if (riskScore >= 20) {
    riskLevel = "medium";
    recommendation = "Standard Due Diligence (SDD) with enhanced monitoring. Review annually.";
  } else {
    riskLevel = "low";
    recommendation = "Standard Due Diligence (SDD) sufficient. Review per normal schedule.";
  }

  // Jurisdiction risk summary
  let jurisdictionRisk = "standard";
  if (FATF_COUNTERMEASURES.has(countryCode)) jurisdictionRisk = "prohibited";
  else if (FATF_BLACK_LIST.has(countryCode)) jurisdictionRisk = "high";
  else if (FATF_GREY_LIST.has(countryCode)) jurisdictionRisk = "high";
  else if (EU_HIGH_RISK.has(countryCode) || SECRECY_JURISDICTIONS.has(countryCode)) jurisdictionRisk = "elevated";

  return {
    output: {
      entity_name: entityName,
      entity_type: entityType,
      country_code: countryCode,
      risk_score: riskScore,
      risk_level: riskLevel,
      risk_factors: riskFactors,
      jurisdiction_risk: jurisdictionRisk,
      recommendation,
      inputs_received: {
        sanctions_match: sanctionsMatch,
        pep_match: pepMatch,
        adverse_media_match: adverseMediaMatch,
      },
      scored_at: new Date().toISOString(),
    },
    provenance: { source: "strale-aml-engine", fetched_at: new Date().toISOString() },
  };
});
