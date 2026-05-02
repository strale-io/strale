/**
 * Web3 Assurance — explanation chain builder.
 *
 * Takes the verdict's reason_codes and walks each one back to:
 *   - The source evaluator that produced it
 *   - The specific evidence fields that triggered it
 *   - A "why it matters" string
 *
 * Output is a structured causal chain that downstream consumers (workflow
 * gates, human reviewers, regulator-shareable audit artifacts) can walk to
 * understand WHY a verdict fired, not just THAT it fired.
 *
 * v0.1 covers the ~40 reason codes Strale ships today. Codes not in the
 * EXPLAINERS map fall back to a generic "see methodology" link so the
 * chain is never silently incomplete.
 */

import type { ComposeResult } from "./composer.js";
import type { VerdictResult } from "./verdict.js";
import type { ExplanationLink } from "./types.js";

interface ExplainerSpec {
  source_evaluator: string;
  evidence_keys: string[];
  severity: "critical" | "review";
  why: (evidence: Record<string, unknown>) => string;
}

const CRITICAL = "critical" as const;
const REVIEW = "review" as const;

function pick(
  evidence: Record<string, unknown> | null | undefined,
  keys: string[],
): Record<string, unknown> {
  if (!evidence) return {};
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in evidence) out[key] = evidence[key];
  }
  return out;
}

const EXPLAINERS: Record<string, ExplainerSpec> = {
  SANCTIONS_MATCH: {
    source_evaluator: "sanctions",
    evidence_keys: ["is_match", "matched_lists", "match_classification"],
    severity: CRITICAL,
    why: () =>
      "Counterparty matched against an OFAC SDN, UN, EU, OFSI, or Swiss SECO sanctions list. Transacting with sanctioned entities is prohibited under the caller's regulatory regime.",
  },
  WALLET_MALICIOUS: {
    source_evaluator: "wallet-history-risk",
    evidence_keys: ["is_malicious", "risk_labels", "risk_level"],
    severity: CRITICAL,
    why: () =>
      "GoPlus address-security flagged this wallet as malicious based on transaction-pattern analysis across known-bad clusters.",
  },
  WALLET_PHISHING: {
    source_evaluator: "wallet-history-risk",
    evidence_keys: ["risk_labels"],
    severity: CRITICAL,
    why: () =>
      "Wallet linked to phishing activity. Sending funds to phishing wallets is unrecoverable; recipient typically sweeps within minutes.",
  },
  WALLET_MONEY_LAUNDERING: {
    source_evaluator: "wallet-history-risk",
    evidence_keys: ["risk_labels"],
    severity: CRITICAL,
    why: () =>
      "Wallet associated with money-laundering patterns. Receiving funds via this wallet may trigger AML reporting obligations on the caller side.",
  },
  WALLET_FINANCIAL_CRIME: {
    source_evaluator: "wallet-history-risk",
    evidence_keys: ["risk_labels"],
    severity: CRITICAL,
    why: () => "Wallet associated with documented financial-crime activity.",
  },
  WALLET_CYBERCRIME: {
    source_evaluator: "wallet-history-risk",
    evidence_keys: ["risk_labels"],
    severity: CRITICAL,
    why: () => "Wallet associated with cybercrime activity.",
  },
  WALLET_DARKWEB: {
    source_evaluator: "wallet-history-risk",
    evidence_keys: ["risk_labels"],
    severity: CRITICAL,
    why: () => "Wallet associated with darkweb-marketplace transactions.",
  },
  WALLET_BLACKLIST: {
    source_evaluator: "wallet-history-risk",
    evidence_keys: ["risk_labels"],
    severity: REVIEW,
    why: () => "Wallet present on a third-party blacklist. Investigate origin of the flag before transacting.",
  },
  WALLET_FAKE_KYC: {
    source_evaluator: "wallet-history-risk",
    evidence_keys: ["risk_labels"],
    severity: REVIEW,
    why: () => "Wallet associated with fake-KYC patterns commonly used to bypass exchange controls.",
  },
  WALLET_MALICIOUS_MINING: {
    source_evaluator: "wallet-history-risk",
    evidence_keys: ["risk_labels"],
    severity: REVIEW,
    why: () => "Wallet associated with malicious-mining (cryptojacking) activity.",
  },

  TOKEN_HONEYPOT: {
    source_evaluator: "token-safety",
    evidence_keys: ["is_honeypot", "sell_tax", "buy_tax"],
    severity: CRITICAL,
    why: () =>
      "Token contract is a honeypot — buyers can purchase but cannot sell. Funds entering this contract become unrecoverable.",
  },
  TOKEN_SELL_TAX_EXTREME: {
    source_evaluator: "token-safety",
    evidence_keys: ["sell_tax", "buy_tax"],
    severity: CRITICAL,
    why: (e) =>
      `Sell tax of ${e.sell_tax ?? "unknown"} (>50%) confiscates the majority of any sell-side proceeds. Effectively unsellable.`,
  },
  TOKEN_SELL_TAX_HIGH: {
    source_evaluator: "token-safety",
    evidence_keys: ["sell_tax", "buy_tax"],
    severity: REVIEW,
    why: (e) =>
      `Sell tax of ${e.sell_tax ?? "unknown"} (10-50%) materially reduces realisable value on exit. Verify tax is intentional and not a soft-rug pattern.`,
  },
  TOKEN_HIDDEN_OWNER: {
    source_evaluator: "token-safety",
    evidence_keys: ["hidden_owner", "owner_address"],
    severity: REVIEW,
    why: () =>
      "Token has a hidden owner who can modify contract behaviour (mint, blacklist, fee changes). Owner can rug at any time.",
  },
  TOKEN_RECLAIMABLE_OWNERSHIP: {
    source_evaluator: "token-safety",
    evidence_keys: ["can_take_back_ownership"],
    severity: REVIEW,
    why: () =>
      "Token allows the original deployer to reclaim ownership even after a transferOwnership call. Renounced ownership claims can't be trusted.",
  },
  TOKEN_BLACKLISTED: {
    source_evaluator: "token-safety",
    evidence_keys: ["is_blacklisted"],
    severity: REVIEW,
    why: () => "Token is on a security blacklist. Investigate provenance before transacting.",
  },
  TOKEN_CLOSED_SOURCE: {
    source_evaluator: "token-safety",
    evidence_keys: ["is_open_source"],
    severity: REVIEW,
    why: () =>
      "Token contract source is not verified or open. Behaviour cannot be audited; rug-vector exposure is opaque.",
  },

  CONTRACT_UNVERIFIED: {
    source_evaluator: "contract-verification",
    evidence_keys: ["is_verified", "contract_name"],
    severity: REVIEW,
    why: () =>
      "Contract source code is not verified on Etherscan or Sourcify. Bytecode-only contracts cannot be audited; behaviour is opaque.",
  },
  CONTRACT_PROXY_NO_IMPL: {
    source_evaluator: "contract-verification",
    evidence_keys: ["is_proxy", "implementation_address"],
    severity: REVIEW,
    why: () =>
      "Contract is a proxy with no resolvable implementation address. Implementation can be swapped silently; current logic is unknowable.",
  },

  APPROVALS_RISKY: {
    source_evaluator: "approval-inventory",
    evidence_keys: ["risky_approvals", "total_approvals"],
    severity: REVIEW,
    why: (e) =>
      `Wallet has ${e.risky_approvals ?? "≥1"} risky token approvals (unlimited or to suspicious spenders). Drainer attacks exploit these even after the original approval flow ended.`,
  },

  PROTOCOL_RECENT_EXPLOIT_30D: {
    source_evaluator: "protocol-risk",
    evidence_keys: ["incidents", "protocol_name"],
    severity: CRITICAL,
    why: (e) => {
      const incidents = e.incidents as Record<string, unknown> | undefined;
      const days = incidents?.days_since_last_incident;
      return `Protocol exploited ${days ?? "<30"} days ago. Acute exposure window: residual on-chain effects of the exploit may still be propagating.`;
    },
  },
  PROTOCOL_RECENT_EXPLOIT_90D: {
    source_evaluator: "protocol-risk",
    evidence_keys: ["incidents", "protocol_name"],
    severity: REVIEW,
    why: (e) => {
      const incidents = e.incidents as Record<string, unknown> | undefined;
      const days = incidents?.days_since_last_incident;
      return `Protocol exploited ${days ?? "<90"} days ago. Confidence in remediation is unverified at this distance.`;
    },
  },
  PROTOCOL_REPEAT_EXPLOITED: {
    source_evaluator: "protocol-risk",
    evidence_keys: ["incidents"],
    severity: REVIEW,
    why: (e) => {
      const incidents = e.incidents as Record<string, unknown> | undefined;
      return `Protocol has ${incidents?.count ?? "≥3"} documented incidents in DefiLlama Hacks DB. Pattern suggests structural rather than incidental security weakness.`;
    },
  },
  PROTOCOL_NOT_INDEXED: {
    source_evaluator: "protocol-risk",
    evidence_keys: ["found", "note"],
    severity: REVIEW,
    why: () =>
      "Protocol target not found in DefiLlama. Treat as unknown rather than safe — DefiLlama indexes most protocols above $1M TVL, so absence implies either very small TVL, very new, or untracked.",
  },

  MIXER_SANCTIONED: {
    source_evaluator: "mixer-graded",
    evidence_keys: ["service", "category", "regulatory_note"],
    severity: CRITICAL,
    why: (e) =>
      `Address is the ${e.service ?? "a"} mixer, currently sanctioned. Receiving funds from or sending funds to this address may trigger sanctions-violation exposure.`,
  },
  MIXER_HIGH_RISK: {
    source_evaluator: "mixer-graded",
    evidence_keys: ["service", "category", "regulatory_note"],
    severity: CRITICAL,
    why: (e) =>
      `Address is ${e.service ?? "a known high-risk mixer"} with documented criminal-actor use. Direct interaction creates AML and sanctions-screening exposure.`,
  },
  MIXER_DELISTED_ELEVATED: {
    source_evaluator: "mixer-graded",
    evidence_keys: ["service", "category", "risk_weight", "jurisdiction_interpretation"],
    severity: REVIEW,
    why: (e) =>
      `Address is the ${e.service ?? "a"} mixer (previously sanctioned, delisted by OFAC March 2025). Treasury 2026 guidance acknowledges legitimate privacy use, but elevated AML/KYC scrutiny still applies.`,
  },
  MIXER_DELISTED: {
    source_evaluator: "mixer-graded",
    evidence_keys: ["service", "category", "risk_weight"],
    severity: REVIEW,
    why: (e) => `Address is a delisted mixer (${e.service ?? "unknown"}). Graded-risk handling per Treasury 2026 mixer guidance.`,
  },
  MIXER_UNCLASSIFIED: {
    source_evaluator: "mixer-graded",
    evidence_keys: ["service", "category"],
    severity: REVIEW,
    why: () => "Address is in the mixer corpus but unclassified. Investigate before transacting.",
  },

  SCAM_CLUSTER_MATCH: {
    source_evaluator: "scam-cluster",
    evidence_keys: ["is_scam_cluster", "list_fetched_at"],
    severity: CRITICAL,
    why: () =>
      "Address matches the ScamSniffer phishing-wallet cluster. Phishing wallets typically present low-malicious-signal until they sweep, so this evidence overrides cleaner upstream wallet-risk reads.",
  },

  BRIDGE_SINGLE_POINT_OF_FAILURE: {
    source_evaluator: "bridge-config-risk",
    evidence_keys: [
      "protocol_name",
      "dvn_config",
      "spof_modes",
      "is_single_point_of_failure",
    ],
    severity: CRITICAL,
    why: (e) => {
      const cfg = e.dvn_config as Record<string, unknown> | undefined;
      const required = cfg?.required_dvn_count ?? "?";
      const optional = cfg?.optional_dvn_count ?? "?";
      return `Bridge verification setup has single-point-of-failure: required DVN count = ${required}, optional DVN count = ${optional}. KelpDAO had this exact 1-of-1 DVN configuration before its $292M April 2026 exploit.`;
    },
  },
  BRIDGE_CONFIG_CRITICAL: {
    source_evaluator: "bridge-config-risk",
    evidence_keys: ["risk_level", "spof_modes", "protocol_name"],
    severity: CRITICAL,
    why: () =>
      "Bridge configuration classified as critical-risk by Strale's curated index or live on-chain getConfig read.",
  },
  BRIDGE_CONFIG_HIGH_RISK: {
    source_evaluator: "bridge-config-risk",
    evidence_keys: ["risk_level", "dvn_config"],
    severity: REVIEW,
    why: () => "Bridge configuration classified as high-risk: redundancy below recommended thresholds.",
  },
  BRIDGE_SINGLE_REQUIRED_DVN: {
    source_evaluator: "bridge-config-risk",
    evidence_keys: ["dvn_config"],
    severity: REVIEW,
    why: () =>
      "Bridge requires only 1 DVN to attest cross-chain messages. No redundancy: a single DVN compromise breaks message verification.",
  },
  BRIDGE_RECENT_INCIDENT_365D: {
    source_evaluator: "bridge-config-risk",
    evidence_keys: ["last_incident", "historical_incidents_recent_year"],
    severity: CRITICAL,
    why: (e) => {
      const last = e.last_incident as Record<string, unknown> | undefined;
      const date = last?.date;
      const amount = last?.amount_usd;
      return `Bridge had a documented incident on ${date ?? "an undisclosed date"}${
        amount ? ` (~$${amount} loss)` : ""
      } within the last 365 days.`;
    },
  },

  EXPOSURE_DEPENDENCY_RECENT_EXPLOIT_90D: {
    source_evaluator: "cross-protocol-exposure",
    evidence_keys: ["last_related_hack", "exposure_risk_level", "parent_protocol", "forked_from"],
    severity: CRITICAL,
    why: (e) => {
      const last = e.last_related_hack as Record<string, unknown> | undefined;
      const name = last?.name;
      return `A protocol this target depends on (${
        name ?? "parent / fork / oracle"
      }) was exploited within the last 90 days. Cascading exposure risk: target's funds may sit downstream of the exploit's residual effects.`;
    },
  },
  EXPOSURE_DEPENDENCY_EXPLOITED_YEAR: {
    source_evaluator: "cross-protocol-exposure",
    evidence_keys: ["last_related_hack", "parent_protocol"],
    severity: REVIEW,
    why: () => "A dependency was exploited within the last 365 days. Indirect exposure to remediation effectiveness.",
  },
  EXPOSURE_UNKNOWN_DEPENDENCIES: {
    source_evaluator: "cross-protocol-exposure",
    evidence_keys: ["unknown_oracles", "forked_from"],
    severity: REVIEW,
    why: () => "Target has dependencies (parent / fork / oracle) outside the reputable set.",
  },
  EXPOSURE_DEPENDENCY_HAS_HISTORY: {
    source_evaluator: "cross-protocol-exposure",
    evidence_keys: ["related_hacks_count", "last_related_hack"],
    severity: REVIEW,
    why: () => "A dependency in this target's chain has a documented hack/incident history.",
  },
  EXPOSURE_UNKNOWN_ORACLE: {
    source_evaluator: "cross-protocol-exposure",
    evidence_keys: ["unknown_oracles", "reputable_oracles"],
    severity: REVIEW,
    why: (e) => {
      const unknown = e.unknown_oracles;
      return `Target depends on at least one oracle outside the reputable set${
        Array.isArray(unknown) && unknown.length > 0 ? ` (${unknown.join(", ")})` : ""
      }. Reputable oracles: Chainlink, Pyth, RedStone, API3, UMA, Tellor.`;
    },
  },

  VELOCITY_BOT_PATTERN: {
    source_evaluator: "wallet-velocity",
    evidence_keys: ["median_interval_seconds", "tx_sample_size"],
    severity: REVIEW,
    why: (e) =>
      `Wallet's median inter-transaction interval is ${e.median_interval_seconds ?? "<30"}s with ${
        e.tx_sample_size ?? "≥5"
      } sample transactions. Indicates automated / bot operation.`,
  },
  VELOCITY_SWEEP_PATTERN: {
    source_evaluator: "wallet-velocity",
    evidence_keys: ["sweep_ratio", "inbound_count", "sweep_count"],
    severity: REVIEW,
    why: (e) =>
      `${Math.round(((e.sweep_ratio as number) ?? 0) * 100)}% of inbound transfers are followed by an outbound transfer within 60s. Sweep-bot behaviour; common in drainer flows.`,
  },
  VELOCITY_DORMANT_THEN_ACTIVE: {
    source_evaluator: "wallet-velocity",
    evidence_keys: ["dormancy_gap_days", "since_last_tx_days"],
    severity: REVIEW,
    why: (e) =>
      `Wallet was dormant for ${e.dormancy_gap_days ?? ">90"} days then became active in the last ${e.since_last_tx_days ?? "<7"} days. Common pattern for compromised or sleeper accounts.`,
  },

  STABLECOIN_NON_MICA_ONLY: {
    source_evaluator: "stablecoin-issuer",
    evidence_keys: ["non_mica_compliant_symbols", "stablecoin_holdings_count"],
    severity: REVIEW,
    why: (e) =>
      `All stablecoin holdings (${
        Array.isArray(e.non_mica_compliant_symbols)
          ? (e.non_mica_compliant_symbols as string[]).join(", ")
          : "?"
      }) are issued by non-MiCA-authorised issuers. EU CASPs are restricting handling of these post-July 2026.`,
  },
  STABLECOIN_NON_MICA_PARTIAL: {
    source_evaluator: "stablecoin-issuer",
    evidence_keys: ["non_mica_compliant_symbols"],
    severity: REVIEW,
    why: () =>
      "Some stablecoin holdings are non-MiCA-authorised. Partial regulatory exposure for EU recipients.",
  },
  STABLECOIN_MICA_REVIEW_RECOMMENDED: {
    source_evaluator: "stablecoin-issuer",
    evidence_keys: ["mica_q3_2026_relevant", "stablecoin_holdings_classified"],
    severity: REVIEW,
    why: () =>
      "At least one stablecoin held requires MiCA-jurisdiction review for EU receipt. Verify recipient's CASP status before transacting.",
  },

  BYTECODE_RUG_MATCH: {
    source_evaluator: "bytecode-similarity",
    evidence_keys: ["match", "bytecode_sha256"],
    severity: CRITICAL,
    why: (e) => {
      const match = e.match as Record<string, unknown> | undefined;
      const pattern = match?.pattern_name;
      const classification = match?.classification;
      return `Deployed bytecode (after metadata normalization) exact-matches a known-rug pattern in Strale's curated rug-bytecode index${
        pattern ? `: ${pattern}` : ""
      }${classification ? ` (${classification})` : ""}.`;
    },
  },
};

export function buildExplanationChain(
  compose: ComposeResult,
  verdict: VerdictResult,
): ExplanationLink[] {
  const chain: ExplanationLink[] = [];
  for (const code of verdict.reason_codes) {
    const explainer = EXPLAINERS[code];
    if (!explainer) continue;
    const evidence = compose.evidence[explainer.source_evaluator] ?? null;
    chain.push({
      reason_code: code,
      severity: explainer.severity,
      source_evaluator: explainer.source_evaluator,
      evidence_excerpt: pick(evidence, explainer.evidence_keys),
      why: explainer.why(evidence ?? {}),
    });
  }
  return chain;
}
