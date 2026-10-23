/**
 * Web3 Assurance — cross-vendor disagreement detector.
 *
 * One of Strale's Tier-1 differentiators per the strategic memo: when our
 * upstream sources disagree, we surface it as an explicit response field.
 * Single-source competitors can't do this because they don't run multiple
 * sources. The disagreement field becomes a category-defining output.
 *
 * v0.1 detects four explicit disagreement classes:
 *   1. token_safety_vs_protocol_risk     — GoPlus says clean but DefiLlama
 *                                           hacks DB shows recent incident
 *   2. contract_verification_mismatch    — not produced since 2026-10-24
 *                                           (DQ-38): both sides now come from
 *                                           Sourcify, so there is nothing to
 *                                           compare until a second verifier exists
 *   3. wallet_risk_vs_mixer              — wallet-history-risk says low_risk
 *                                           but mixer-graded says known mixer
 *   4. wallet_risk_vs_scam_cluster       — wallet-history-risk says low but
 *                                           scam-cluster matches
 *
 * The list is conservative — false positives (sources that look like they
 * disagree but actually answer different questions) erode the value. Each
 * detector is hand-coded against actual evidence-shape from the evaluators.
 */

import type { ComposeResult } from "./composer.js";

export type DisagreementClass =
  | "token_safety_vs_protocol_risk"
  | "contract_verification_mismatch"
  | "wallet_risk_vs_mixer"
  | "wallet_risk_vs_scam_cluster";

export interface DisagreementEntry {
  class: DisagreementClass;
  sources: string[];
  description: string;
  resolution_hint: string;
}

function getStr(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function getBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

export function detectDisagreements(compose: ComposeResult): DisagreementEntry[] {
  const out: DisagreementEntry[] = [];
  const evidence = compose.evidence;

  const tokenSafety = evidence["token-safety"];
  const protocolRisk = evidence["protocol-risk"];
  if (
    tokenSafety &&
    protocolRisk &&
    protocolRisk.found === true &&
    (tokenSafety.risk_level === "low" || tokenSafety.risk_level === "medium") &&
    typeof protocolRisk.incidents === "object" &&
    protocolRisk.incidents !== null
  ) {
    const incidents = protocolRisk.incidents as Record<string, unknown>;
    const days =
      typeof incidents.days_since_last_incident === "number"
        ? incidents.days_since_last_incident
        : null;
    if (days !== null && days < 90) {
      out.push({
        class: "token_safety_vs_protocol_risk",
        sources: ["api.gopluslabs.io", "api.llama.fi"],
        description: `Token-safety reports risk_level="${tokenSafety.risk_level}" but DefiLlama hacks DB shows the parent protocol was exploited ${days} days ago.`,
        resolution_hint:
          "Treat as elevated. Token-level safety does not capture protocol-level incidents in the dependency chain.",
      });
    }
  }

  // contract_verification_mismatch removed 2026-10-24 (DQ-38): contract-verification
  // now runs on Sourcify alone, so comparing it with sourcify-verification compared
  // Sourcify with itself. Restore it when a second, independent verifier exists.

  const walletHistory = evidence["wallet-history-risk"];
  const mixer = evidence["mixer-graded"];
  if (walletHistory && mixer && getBool(mixer.is_known_mixer)) {
    const isLow =
      getStr(walletHistory.risk_level) === "low" && !getBool(walletHistory.is_malicious);
    if (isLow) {
      const service = getStr(mixer.service) ?? "unknown mixer";
      const category = getStr(mixer.category) ?? "unclassified";
      out.push({
        class: "wallet_risk_vs_mixer",
        sources: ["api.gopluslabs.io", "strale-curated-mixer-list"],
        description: `Wallet-history-risk reports risk_level="low" / is_malicious=false but the address is a known mixer (service="${service}", category="${category}").`,
        resolution_hint:
          "Apply the mixer-specific verdict regardless of the wallet-history score. GoPlus does not flag mixers as malicious by default; that is a category-of-evidence omission, not a contradiction of the underlying transaction record.",
      });
    }
  }

  const scamCluster = evidence["scam-cluster"];
  if (
    walletHistory &&
    scamCluster &&
    getBool(scamCluster.is_scam_cluster) &&
    getStr(walletHistory.risk_level) === "low"
  ) {
    out.push({
      class: "wallet_risk_vs_scam_cluster",
      sources: ["api.gopluslabs.io", "github.com/scamsniffer/scam-database"],
      description:
        "Wallet-history-risk reports risk_level=\"low\" but ScamSniffer scam-database has the address on its phishing-cluster list.",
      resolution_hint:
        "Apply the scam-cluster verdict. Phishing wallets often have low transaction-volume / low-malicious-signal patterns until they sweep, which GoPlus's algorithmic scoring may not catch.",
    });
  }

  return out;
}
