/**
 * Web3 Assurance — decision-readiness logic.
 *
 * Reads the evidence map produced by the composer and emits a verdict
 * (proceed / review / block / insufficient_evidence) plus structured fields
 * the agent acts on.
 *
 * Rules are explicit and auditable. No model prediction; this is a rule
 * engine over verifiable facts. Strict per the framework's E4 anti-rule.
 */

import type {
  ComposeResult,
} from "./composer.js";
import type {
  EvidenceCompleteness,
  Verdict,
} from "./types.js";

const DEFAULT_VERDICT_TTL_SECONDS = 1800;

export interface VerdictResult {
  verdict: Verdict;
  confidence: number;
  evidence_completeness: EvidenceCompleteness;
  evidence_status: "corroborated" | "partial" | "contradictory" | "single_source" | "minimal";
  critical_flags: string[];
  reason_codes: string[];
  suggested_action: string;
  expires_at: string;
}

function flagToReasonCode(flag: string): string {
  return flag.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function getNum(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function getBool(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function flagsFromWallet(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  const flags: string[] = [];
  if (getBool(evidence.is_malicious)) flags.push("wallet:malicious");
  const labels = evidence.risk_labels;
  if (Array.isArray(labels)) {
    for (const label of labels) {
      if (typeof label === "string") flags.push(`wallet:${label}`);
    }
  }
  return flags;
}

function flagsFromToken(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  const flags: string[] = [];
  if (getBool(evidence.is_honeypot)) flags.push("token:honeypot");
  if (getBool(evidence.hidden_owner)) flags.push("token:hidden_owner");
  if (getBool(evidence.can_take_back_ownership)) flags.push("token:reclaimable_ownership");
  if (getBool(evidence.is_blacklisted)) flags.push("token:blacklisted");
  const sellTax = getNum(evidence.sell_tax);
  if (sellTax !== null && sellTax > 0.5) flags.push("token:sell_tax_extreme");
  if (sellTax !== null && sellTax > 0.1 && sellTax <= 0.5) flags.push("token:sell_tax_high");
  if (getBool(evidence.is_mintable)) flags.push("token:mintable");
  if (!getBool(evidence.is_open_source)) flags.push("token:closed_source");
  return flags;
}

function flagsFromContract(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  const flags: string[] = [];
  if (evidence.is_verified === false) flags.push("contract:unverified");
  if (getBool(evidence.is_proxy) && !evidence.implementation_address) {
    flags.push("contract:proxy_no_impl");
  }
  return flags;
}

function flagsFromApprovals(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  const flags: string[] = [];
  const risky = getNum(evidence.risky_approvals);
  if (risky !== null && risky > 0) flags.push(`approvals:${risky}_risky`);
  return flags;
}

function flagsFromProtocol(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  const flags: string[] = [];
  if (evidence.found === false) flags.push("protocol:not_indexed");
  const incidents = evidence.incidents as Record<string, unknown> | undefined;
  if (incidents) {
    const days = getNum(incidents.days_since_last_incident);
    const count = getNum(incidents.count);
    if (days !== null && days < 30) flags.push("protocol:recent_exploit_30d");
    else if (days !== null && days < 90) flags.push("protocol:recent_exploit_90d");
    if (count !== null && count >= 3) flags.push("protocol:repeat_exploited");
  }
  if (getNum(evidence.audits_count) === 0) flags.push("protocol:no_audits");
  return flags;
}

function flagsFromSanctions(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  if (getBool(evidence.is_match) || getBool(evidence.matched)) {
    return ["sanctions:match"];
  }
  return [];
}

function flagsFromMixer(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  if (!getBool(evidence.is_known_mixer)) return [];
  const category = typeof evidence.category === "string" ? evidence.category : "unknown";
  const weight = getNum(evidence.risk_weight) ?? 0;
  if (category === "sanctioned") return ["mixer:sanctioned"];
  if (category === "high_risk") return ["mixer:high_risk"];
  if (category === "delisted") return weight >= 0.5 ? ["mixer:delisted_elevated"] : ["mixer:delisted"];
  if (category === "privacy") return ["mixer:privacy"];
  return ["mixer:unclassified"];
}

function flagsFromScamCluster(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  return getBool(evidence.is_scam_cluster) ? ["scam:cluster_match"] : [];
}

function flagsFromBytecodeSimilarity(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  if (getBool(evidence.match_found)) return ["bytecode:rug_match"];
  return [];
}

function flagsFromStablecoinIssuer(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  if (evidence.enabled === false) return [];
  const flags: string[] = [];
  const level = evidence.issuer_risk_level;
  if (level === "high") flags.push("stablecoin:non_mica_only");
  else if (level === "medium") flags.push("stablecoin:non_mica_partial");
  if (getBool(evidence.mica_q3_2026_relevant)) flags.push("stablecoin:mica_review_recommended");
  return flags;
}

function flagsFromWalletVelocity(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  if (evidence.no_activity === true || evidence.enabled === false) return [];
  const flags: string[] = [];
  const behavioral = evidence.behavioral_flags;
  if (Array.isArray(behavioral)) {
    if (behavioral.includes("velocity_bot_pattern")) flags.push("velocity:bot_pattern");
    if (behavioral.includes("sweep_pattern")) flags.push("velocity:sweep_pattern");
    if (behavioral.includes("dormant_then_active")) flags.push("velocity:dormant_then_active");
  }
  return flags;
}

function flagsFromCrossProtocolExposure(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  if (evidence.found === false) return [];
  const flags: string[] = [];
  const level = evidence.exposure_risk_level;
  if (level === "critical") flags.push("exposure:dependency_recent_exploit_90d");
  else if (level === "high") flags.push("exposure:dependency_exploited_year");
  else if (level === "medium") flags.push("exposure:unknown_dependencies");
  const lastHack = evidence.last_related_hack;
  if (lastHack && typeof lastHack === "object") flags.push("exposure:dependency_has_history");
  const unknown = evidence.unknown_oracles;
  if (Array.isArray(unknown) && unknown.length > 0) {
    flags.push("exposure:unknown_oracle");
  }
  return flags;
}

function flagsFromBridgeConfig(evidence: Record<string, unknown> | null): string[] {
  if (!evidence) return [];
  if (evidence.indexed === false) return [];
  const flags: string[] = [];
  if (getBool(evidence.is_single_point_of_failure)) {
    flags.push("bridge:single_point_of_failure");
  }
  if (getNum(evidence.required_dvn_count) === 1) {
    flags.push("bridge:single_required_dvn");
  }
  const recentIncidents = getNum(evidence.historical_incidents_recent_year) ?? 0;
  if (recentIncidents > 0) {
    flags.push("bridge:recent_incident_365d");
  }
  if (evidence.risk_level === "critical") {
    flags.push("bridge:config_critical");
  } else if (evidence.risk_level === "high") {
    flags.push("bridge:config_high_risk");
  }
  return flags;
}

const CRITICAL_FLAGS = new Set([
  "sanctions:match",
  "wallet:malicious",
  "wallet:phishing",
  "wallet:money_laundering",
  "wallet:financial_crime",
  "wallet:cybercrime",
  "wallet:darkweb",
  "token:honeypot",
  "token:sell_tax_extreme",
  "protocol:recent_exploit_30d",
  "mixer:sanctioned",
  "mixer:high_risk",
  "scam:cluster_match",
  "bridge:single_point_of_failure",
  "bridge:config_critical",
  "bridge:recent_incident_365d",
  "exposure:dependency_recent_exploit_90d",
  "bytecode:rug_match",
]);

const REVIEW_FLAGS = new Set([
  "wallet:blacklist",
  "wallet:fake_kyc",
  "wallet:malicious_mining",
  "token:hidden_owner",
  "token:reclaimable_ownership",
  "token:blacklisted",
  "token:sell_tax_high",
  "token:closed_source",
  "contract:unverified",
  "contract:proxy_no_impl",
  "protocol:recent_exploit_90d",
  "protocol:repeat_exploited",
  "protocol:not_indexed",
  "mixer:delisted_elevated",
  "mixer:delisted",
  "mixer:unclassified",
  "bridge:single_required_dvn",
  "bridge:config_high_risk",
  "exposure:dependency_exploited_year",
  "exposure:unknown_dependencies",
  "exposure:dependency_has_history",
  "exposure:unknown_oracle",
  "velocity:sweep_pattern",
  "velocity:dormant_then_active",
  "velocity:bot_pattern",
  "stablecoin:non_mica_only",
  "stablecoin:non_mica_partial",
  "stablecoin:mica_review_recommended",
]);

function evaluatorOk(compose: ComposeResult, name: string): boolean {
  return compose.results.find((r) => r.evaluator === name)?.ok === true;
}

type EvidenceCorroboration = "corroborated" | "partial" | "contradictory" | "single_source" | "minimal";

function computeCompleteness(
  compose: ComposeResult,
): { completeness: EvidenceCompleteness; corroboration: EvidenceCorroboration } {
  const total = compose.results.length;
  if (total === 0) return { completeness: "minimal", corroboration: "minimal" };

  const okCount = compose.results.filter((r) => r.ok).length;
  const ratio = okCount / total;

  let completeness: EvidenceCompleteness;
  if (ratio >= 0.85) completeness = "complete";
  else if (ratio >= 0.5) completeness = "partial";
  else completeness = "minimal";

  const expectedSources = compose.results
    .filter((r) => r.ok)
    .map((r) => r.provenance.source).filter((v, i, a) => a.indexOf(v) === i).length;

  let corroboration: EvidenceCorroboration;
  if (expectedSources >= 3) corroboration = "corroborated";
  else if (expectedSources === 2) corroboration = "partial";
  else if (expectedSources === 1) corroboration = "single_source";
  else corroboration = "minimal";

  return { completeness, corroboration };
}

export function computeVerdict(compose: ComposeResult): VerdictResult {
  const flags: string[] = [
    ...flagsFromWallet(compose.evidence["wallet-history-risk"] ?? null),
    ...flagsFromToken(compose.evidence["token-safety"] ?? null),
    ...flagsFromContract(compose.evidence["contract-verification"] ?? null),
    ...flagsFromApprovals(compose.evidence["approval-inventory"] ?? null),
    ...flagsFromProtocol(compose.evidence["protocol-risk"] ?? null),
    ...flagsFromSanctions(compose.evidence["sanctions"] ?? null),
    ...flagsFromMixer(compose.evidence["mixer-graded"] ?? null),
    ...flagsFromScamCluster(compose.evidence["scam-cluster"] ?? null),
    ...flagsFromBridgeConfig(compose.evidence["bridge-config-risk"] ?? null),
    ...flagsFromCrossProtocolExposure(compose.evidence["cross-protocol-exposure"] ?? null),
    ...flagsFromWalletVelocity(compose.evidence["wallet-velocity"] ?? null),
    ...flagsFromStablecoinIssuer(compose.evidence["stablecoin-issuer"] ?? null),
    ...flagsFromBytecodeSimilarity(compose.evidence["bytecode-similarity"] ?? null),
  ];

  const critical = flags.filter((f) => CRITICAL_FLAGS.has(f));
  const review = flags.filter((f) => REVIEW_FLAGS.has(f));

  const { completeness, corroboration } = computeCompleteness(compose);

  let verdict: Verdict;
  if (critical.length > 0) verdict = "block";
  else if (review.length > 0) verdict = "review";
  else if (completeness === "minimal") verdict = "insufficient_evidence";
  else verdict = "proceed";

  let confidence: number;
  if (verdict === "block") confidence = 0.95;
  else if (verdict === "insufficient_evidence") confidence = 0.4;
  else if (completeness === "complete" && corroboration === "corroborated") confidence = 0.92;
  else if (completeness === "complete") confidence = 0.85;
  else if (completeness === "partial") confidence = 0.7;
  else confidence = 0.5;

  let suggested_action: string;
  if (verdict === "block") {
    suggested_action = `Do not transact. ${critical.length} critical flag(s) detected: ${critical.slice(0, 3).join(", ")}.`;
  } else if (verdict === "review") {
    suggested_action = `Hold for human review. ${review.length} concerning flag(s): ${review.slice(0, 3).join(", ")}.`;
  } else if (verdict === "insufficient_evidence") {
    suggested_action = "Insufficient evidence to render a confident verdict. Provide more context (chain, target_type) or retry.";
  } else {
    suggested_action = "Evidence supports proceeding. No critical or concerning flags detected.";
  }

  if (!evaluatorOk(compose, "sanctions")) {
    suggested_action += " (sanctions evidence unavailable; verdict assumes no match — verify independently for high-value flows.)";
  }

  const allFlags = [...critical, ...review];
  const reason_codes = allFlags.map(flagToReasonCode);

  if (verdict === "proceed" && reason_codes.length === 0) {
    if (evaluatorOk(compose, "wallet-history-risk")) reason_codes.push("WALLET_HISTORY_CLEAN");
    if (evaluatorOk(compose, "wallet-identity")) reason_codes.push("WALLET_AGE_ESTABLISHED");
    if (evaluatorOk(compose, "token-safety")) reason_codes.push("TOKEN_SAFETY_OK");
    if (evaluatorOk(compose, "contract-verification")) reason_codes.push("CONTRACT_VERIFIED");
    if (evaluatorOk(compose, "scam-cluster")) reason_codes.push("SCAM_CLUSTER_NO_MATCH");
    if (evaluatorOk(compose, "mixer-graded")) reason_codes.push("MIXER_NO_MATCH");
  }

  return {
    verdict,
    confidence: Math.round(confidence * 100) / 100,
    evidence_completeness: completeness,
    evidence_status: corroboration,
    critical_flags: allFlags,
    reason_codes,
    suggested_action,
    expires_at: new Date(Date.now() + DEFAULT_VERDICT_TTL_SECONDS * 1000).toISOString(),
  };
}
