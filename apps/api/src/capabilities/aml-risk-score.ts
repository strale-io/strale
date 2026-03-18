import { registerCapability, type CapabilityInput } from "./index.js";

// FATF Grey List (jurisdictions under increased monitoring) — updated periodically
const FATF_GREY_LIST = new Set([
  "BG", "BF", "CM", "CD", "HR", "HT", "KE", "ML", "MZ", "NG",
  "PH", "SN", "ZA", "SS", "SY", "TZ", "VN", "YE",
]);

// FATF Black List (call for action)
const FATF_BLACK_LIST = new Set(["KP", "IR", "MM"]);

// High-risk jurisdictions from EU list
const EU_HIGH_RISK = new Set([
  "AF", "BS", "BW", "KH", "GH", "IQ", "JM", "MU", "NI", "PK",
  "PA", "TT", "UG", "BB", "GI", "ZW",
]);

// Tax haven / secrecy jurisdictions (common in shell company structures)
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
  if (FATF_BLACK_LIST.has(countryCode)) jurisdictionRisk = "prohibited";
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
