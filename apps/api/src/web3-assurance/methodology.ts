/**
 * Web3 Assurance — public methodology endpoint.
 *
 * Per DEC-20260428-B engineering bar: regulatory-grade builds require a
 * public methodology page. Compliance officers and regulators expect to
 * see exactly which evidence types are surfaced, where each one comes
 * from, how the verdict is computed, and what the SLA commitments are.
 *
 * GET /v1/web3-assurance/methodology
 *
 * Returns the canonical specification:
 *   - All registered evaluators with priority + source + cache TTL
 *   - Reason-code vocabulary (CRITICAL + REVIEW + positive)
 *   - Verdict-computation rules
 *   - SLA tiers per mode
 *   - Source-list manifest (every external API/MCP we may call)
 *   - Versioning policy
 */

import { Hono } from "hono";
import { getEvaluators } from "./evaluators/index.js";
import { getWeb3AssuranceSla } from "./routes.js";
import { getAllSourceSqs } from "./source-quality.js";
import { LAYERZERO_OAPPS, isReputableDvn } from "./data/layerzero-oapps.js";
import type { AppEnv } from "../types.js";

export const methodologyRoute = new Hono<AppEnv>();
export const sourceQualityRoute = new Hono<AppEnv>();
export const bridgeConfigIndexRoute = new Hono<AppEnv>();

bridgeConfigIndexRoute.get("/", (c) => {
  const ranked = [...LAYERZERO_OAPPS]
    .map((entry) => ({
      protocol_name: entry.protocol_name,
      address: entry.address,
      chain: entry.chain,
      category: entry.category,
      verification_protocol: "LayerZero V2 DVN",
      required_dvn_count: entry.dvn_config.required_dvn_count,
      optional_dvn_count: entry.dvn_config.optional_dvn_count,
      optional_dvn_threshold: entry.dvn_config.optional_dvn_threshold,
      total_dvn_count:
        entry.dvn_config.required_dvns.length + entry.dvn_config.optional_dvns.length,
      reputable_dvn_count: entry.reputable_dvn_count,
      is_single_point_of_failure: entry.is_single_point_of_failure,
      spof_modes: entry.spof_modes,
      historical_incidents_count: entry.historical_incidents.length,
      historical_incidents_total_lost_usd: entry.historical_incidents.reduce(
        (sum, inc) => sum + inc.amount_usd,
        0,
      ),
      config_last_verified_at: entry.config_last_verified_at,
      notes: entry.notes,
    }))
    .sort((a, b) => {
      if (a.is_single_point_of_failure && !b.is_single_point_of_failure) return -1;
      if (!a.is_single_point_of_failure && b.is_single_point_of_failure) return 1;
      return b.historical_incidents_total_lost_usd - a.historical_incidents_total_lost_usd;
    });

  const reputableDvnList = [
    "LayerZero Labs",
    "Google Cloud",
    "Polyhedra",
    "Nethermind",
    "Stargate",
    "P2P",
    "Animoca",
    "Restake",
    "BCW",
    "Switchboard",
    "Horizen Labs",
  ].filter((d) => isReputableDvn(d));

  return c.json(
    {
      product: "Web3 Assurance — Bridge-Config Risk Index",
      version: "v0.1",
      published_at: new Date().toISOString(),
      summary:
        "Strale's curated index of LayerZero OApp DVN configurations. Surfaces single-point-of-failure modes (e.g. KelpDAO 1-of-1 DVN, $292M April 2026). v0.2 will replace the seed with live on-chain endpoint.getConfig reads (already live as a fallback in the bridge-config-risk evaluator).",
      methodology: {
        verification_protocol: "LayerZero V2 DVN configuration as read from EndpointV2.getConfig",
        single_point_of_failure_definition:
          "requiredDVNCount === 1 AND optionalDVNCount === 0 AND optionalDVNThreshold === 0. Means a single DVN can attest cross-chain messages alone; if compromised, message verification fails.",
        risk_levels: {
          critical: "is_single_point_of_failure === true",
          high: "requiredDVNCount < 2",
          medium: "reputable_dvn_count / total_dvn_count < 0.5",
          low: "all required DVNs are reputable AND requiredDVNCount >= 2",
        },
      },
      reputable_dvns: reputableDvnList,
      sort_order:
        "Single-point-of-failure entries first, then by total historical USD loss across documented incidents.",
      entries: ranked,
      contact: { email: "hello@strale.io" },
    },
    200,
    {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  );
});

sourceQualityRoute.get("/", (c) => {
  return c.json(
    {
      product: "Web3 Assurance",
      window: "rolling 100 calls per source (in-memory; resets on restart in v0.1)",
      generated_at: new Date().toISOString(),
      methodology: "composite_score = round(success_rate * 70 + latency_grade * 30); latency_grade derived from p95.",
      sources: getAllSourceSqs(),
    },
    200,
    {
      "Cache-Control": "public, max-age=60",
      "Access-Control-Allow-Origin": "*",
    },
  );
});

const API_VERSION = "0.1";

const REASON_CODE_GLOSSARY: Record<string, { severity: "critical" | "review"; description: string }> = {
  SANCTIONS_MATCH: {
    severity: "critical",
    description: "Counterparty matched against OFAC SDN, UN, EU, OFSI, or Swiss SECO sanctions lists.",
  },
  WALLET_MALICIOUS: {
    severity: "critical",
    description: "GoPlus address-security flagged the wallet as malicious.",
  },
  WALLET_PHISHING: { severity: "critical", description: "Wallet linked to phishing activity." },
  WALLET_MONEY_LAUNDERING: { severity: "critical", description: "Wallet associated with money-laundering activity." },
  WALLET_FINANCIAL_CRIME: { severity: "critical", description: "Wallet associated with financial crime." },
  WALLET_CYBERCRIME: { severity: "critical", description: "Wallet associated with cybercrime." },
  WALLET_DARKWEB: { severity: "critical", description: "Wallet associated with darkweb transactions." },
  WALLET_BLACKLIST: { severity: "review", description: "Wallet on a third-party blacklist." },
  WALLET_FAKE_KYC: { severity: "review", description: "Wallet associated with fake-KYC patterns." },
  WALLET_MALICIOUS_MINING: { severity: "review", description: "Wallet associated with malicious mining activity." },
  TOKEN_HONEYPOT: { severity: "critical", description: "Token contract is a honeypot (cannot sell)." },
  TOKEN_SELL_TAX_EXTREME: { severity: "critical", description: "Sell tax exceeds 50%." },
  TOKEN_SELL_TAX_HIGH: { severity: "review", description: "Sell tax between 10% and 50%." },
  TOKEN_HIDDEN_OWNER: { severity: "review", description: "Token has a hidden owner who can modify behaviour." },
  TOKEN_RECLAIMABLE_OWNERSHIP: { severity: "review", description: "Token allows the original deployer to reclaim ownership." },
  TOKEN_BLACKLISTED: { severity: "review", description: "Token is on a security blacklist." },
  TOKEN_CLOSED_SOURCE: { severity: "review", description: "Token contract source is not verified / open." },
  CONTRACT_UNVERIFIED: { severity: "review", description: "Contract source code is not verified on Etherscan or Sourcify." },
  CONTRACT_PROXY_NO_IMPL: { severity: "review", description: "Contract is a proxy with no resolvable implementation address." },
  PROTOCOL_RECENT_EXPLOIT_30D: { severity: "critical", description: "Protocol exploited within the last 30 days." },
  PROTOCOL_RECENT_EXPLOIT_90D: { severity: "review", description: "Protocol exploited within the last 90 days." },
  PROTOCOL_REPEAT_EXPLOITED: { severity: "review", description: "Protocol has 3+ documented incidents in DefiLlama Hacks DB." },
  PROTOCOL_NOT_INDEXED: { severity: "review", description: "Protocol target not found in DefiLlama. Treat as unknown, not safe." },
  MIXER_SANCTIONED: { severity: "critical", description: "Address is a currently-sanctioned mixer (e.g. Sinbad)." },
  MIXER_HIGH_RISK: { severity: "critical", description: "Address is a documented high-risk mixer." },
  MIXER_DELISTED_ELEVATED: {
    severity: "review",
    description:
      "Address is a previously-sanctioned mixer (e.g. Tornado Cash, delisted by OFAC March 2025). Graded risk per Treasury 2026 mixer guidance.",
  },
  MIXER_DELISTED: { severity: "review", description: "Address is a delisted mixer." },
  MIXER_UNCLASSIFIED: { severity: "review", description: "Address is in the mixer corpus but unclassified." },
  SCAM_CLUSTER_MATCH: { severity: "critical", description: "Address matches ScamSniffer phishing-wallet cluster." },
  APPROVALS_RISKY: { severity: "review", description: "Wallet has ≥1 risky token approvals." },
  BRIDGE_SINGLE_POINT_OF_FAILURE: {
    severity: "critical",
    description:
      "Bridge has single-point-of-failure in its verification setup (e.g. KelpDAO 1-of-1 DVN configuration on LayerZero, $292M April 2026).",
  },
  BRIDGE_CONFIG_CRITICAL: { severity: "critical", description: "Bridge configuration is classified as critical-risk." },
  BRIDGE_CONFIG_HIGH_RISK: { severity: "review", description: "Bridge configuration is classified as high-risk." },
  BRIDGE_SINGLE_REQUIRED_DVN: { severity: "review", description: "Bridge requires only 1 DVN (no redundancy)." },
  BRIDGE_RECENT_INCIDENT_365D: { severity: "critical", description: "Bridge has had a documented incident in the last 365 days." },
  EXPOSURE_DEPENDENCY_RECENT_EXPLOIT_90D: {
    severity: "critical",
    description:
      "A protocol this target depends on (parent / fork / oracle) was exploited in the last 90 days. Cascading exposure risk.",
  },
  EXPOSURE_DEPENDENCY_EXPLOITED_YEAR: {
    severity: "review",
    description: "A protocol dependency was exploited in the last 365 days.",
  },
  EXPOSURE_UNKNOWN_DEPENDENCIES: {
    severity: "review",
    description: "Target has dependencies (parent / fork / oracle) that are not in the reputable set.",
  },
  EXPOSURE_DEPENDENCY_HAS_HISTORY: {
    severity: "review",
    description: "A documented hack/incident exists for this target's dependency chain at any time.",
  },
  EXPOSURE_UNKNOWN_ORACLE: {
    severity: "review",
    description: "Target depends on at least one oracle outside the reputable set (Chainlink / Pyth / RedStone / API3 / UMA / Tellor).",
  },
  VELOCITY_BOT_PATTERN: {
    severity: "review",
    description: "Wallet's median inter-transaction interval is <30s with ≥5 sample transactions. Indicates automated / bot activity.",
  },
  VELOCITY_SWEEP_PATTERN: {
    severity: "review",
    description: "≥50% of inbound transfers are followed by an outbound transfer within 60 seconds. Sweep-bot behavior; common in drainer flows.",
  },
  VELOCITY_DORMANT_THEN_ACTIVE: {
    severity: "review",
    description: "Wallet was dormant for >90 days then became active in the last 7 days. Common pattern for compromised or sleeper accounts.",
  },
  STABLECOIN_NON_MICA_ONLY: {
    severity: "review",
    description: "All stablecoin holdings are issued by non-MiCA-authorised issuers (e.g. USDT, FDUSD). MiCA Q3 2026 enforcement may restrict EU CASP-handling.",
  },
  STABLECOIN_NON_MICA_PARTIAL: {
    severity: "review",
    description: "Some stablecoin holdings are non-MiCA-authorised. Partial regulatory exposure for EU recipients.",
  },
  STABLECOIN_MICA_REVIEW_RECOMMENDED: {
    severity: "review",
    description: "Wallet holds at least one stablecoin requiring MiCA-jurisdiction review for EU receipt.",
  },
  BYTECODE_RUG_MATCH: {
    severity: "critical",
    description:
      "Deployed bytecode (after metadata normalization) exact-matches a known-rug pattern in Strale's curated rug-bytecode index. Same code as a previously-rugged contract.",
  },
};

const POSITIVE_REASON_CODES: Record<string, string> = {
  WALLET_HISTORY_CLEAN: "GoPlus address-security found no malicious indicators on the wallet.",
  WALLET_AGE_ESTABLISHED: "Wallet has documented activity history (not freshly created).",
  TOKEN_SAFETY_OK: "GoPlus token-security found no critical issues with the token contract.",
  CONTRACT_VERIFIED: "Contract source code is verified.",
  SCAM_CLUSTER_NO_MATCH: "Wallet is not in the ScamSniffer phishing-cluster corpus.",
  MIXER_NO_MATCH: "Wallet is not a known mixer address.",
};

methodologyRoute.get("/", (c) => {
  const evaluators = getEvaluators().map((e) => ({
    name: e.name,
    priority: e.priority,
    cache_ttl_seconds: e.cacheTTLSeconds,
  }));

  const sources = [...new Set(getEvaluators().map((e) => e.name))]
    .map((name) => methodologySource(name))
    .filter((s): s is NonNullable<typeof s> => s !== null);

  return c.json(
    {
      product: "Web3 Assurance",
      api_version: API_VERSION,
      published_at: new Date().toISOString(),
      summary:
        "Decision-ready answer about an on-chain counterparty (wallet, contract, token, DeFi protocol, or bridge) in a single auditable call. Sister product to Payee Assurance for off-chain KYB.",
      response_envelope: {
        verdict: "proceed | review | block | insufficient_evidence",
        reason_codes: "string[] — UPPERCASE_SNAKE_CASE machine-parsable codes (see reason_code_glossary)",
        confidence: "number 0..1",
        evidence_completeness: "complete | partial | minimal",
        evidence_status: "corroborated | partial | contradictory | single_source | minimal",
        critical_flags: "string[] — human-readable namespaced flags",
        suggested_action: "string — natural-language operator hint",
        expires_at: "ISO 8601 datetime",
        evidence: "object — per-evaluator evidence map",
        source_quality: "array — per-source latency + ok",
        disagreements:
          "array — explicit cross-vendor disagreements (e.g. Sourcify says verified but Etherscan disagrees). Surfaces conflicts single-source competitors cannot detect.",
        explanation_chain:
          "array of {reason_code, severity, source_evaluator, evidence_excerpt, why} — structured causal chain. For each fired reason_code, walks back to the evaluator that produced it, the specific evidence values that triggered it, and a why-it-matters string. Workflow gates and human reviewers consume this directly.",
        audit_url: "string — sidecar URL to hash-chained audit record (HMAC-signed, 90-day TTL)",
        sla: { mode: "outbound | reverse-call", p99_ms: "integer", p50_ms: "integer" },
      },
      modes: {
        outbound: {
          description:
            "Agent vetting recipient pre-payment. Full evaluator set runs. 8s budget per evaluator.",
          sla: getWeb3AssuranceSla("outbound"),
        },
        "reverse-call": {
          description:
            "x402 service publisher gating an inbound buyer in real-time. Critical evaluators only. 600ms cap per evaluator.",
          sla: getWeb3AssuranceSla("reverse-call"),
        },
      },
      verdict_logic: {
        block: "Triggered when ≥1 reason_code is in the CRITICAL set (see reason_code_glossary).",
        review:
          "Triggered when no CRITICAL reason_codes are set but ≥1 reason_code is in the REVIEW set.",
        insufficient_evidence:
          "Triggered when no CRITICAL or REVIEW codes fire but evidence completeness is 'minimal'.",
        proceed: "Triggered when no CRITICAL or REVIEW codes fire and evidence is 'partial' or 'complete'.",
      },
      evaluators,
      reason_code_glossary: REASON_CODE_GLOSSARY,
      positive_reason_codes: POSITIVE_REASON_CODES,
      sources,
      regulatory_posture: {
        ofac:
          "OFAC SDN + crypto-specific addresses screened. Tornado Cash treated as graded (delisted March 2025) per Treasury 2026 guidance — not binary-blocked.",
        mica:
          "EU MiCA full enforcement July 1 2026. Counterparty wallet screening + Travel Rule transmission supported via reverse-call mode.",
        fatf: "FATF Travel Rule jurisdiction-aware verdict surface available via caller_jurisdiction parameter.",
        gdpr_art_22: "Verdicts surface critical_flags + suggested_action so the agent can act on documented evidence.",
      },
      versioning_policy: {
        api_version: API_VERSION,
        breaking_change_policy: "Breaking response-shape changes increment the major version. New reason_codes or evidence fields are additive within a major.",
        substrate_changes:
          "Material changes to verdict logic or evaluator set are surfaced via response-header X-Strale-Methodology-Hash, which downstream consumers can monitor for drift.",
      },
      audit_trail_policy: {
        chain: "SHA-256 hash chain, per-day, anchored to GENESIS_HASH = sha256('strale-genesis-v1').",
        token: "audit_url uses HMAC-SHA256(secret, `${recordId}:${expiresAt}`) signing with 90-day TTL.",
        retention: "Indefinite for completed records.",
        replay_capability: "Each record can be replayed to confirm the evidence trail available at the time the verdict was issued.",
      },
      contact: { email: "hello@strale.io", docs: "https://strale.dev/docs" },
    },
    200,
    {
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  );
});

function methodologySource(evaluatorName: string): { evaluator: string; primary_source: string; license: string } | null {
  const sources: Record<string, { primary_source: string; license: string }> = {
    "wallet-identity": { primary_source: "Etherscan API", license: "Etherscan ToS" },
    "wallet-history-risk": { primary_source: "GoPlus address-security API", license: "GoPlus public API" },
    "wallet-transactions": { primary_source: "Etherscan API", license: "Etherscan ToS" },
    "wallet-balance": { primary_source: "Etherscan API", license: "Etherscan ToS" },
    "token-safety": { primary_source: "GoPlus token-security API", license: "GoPlus public API" },
    "contract-verification": { primary_source: "Etherscan getsourcecode + Sourcify", license: "Etherscan ToS + Apache 2.0 (Sourcify)" },
    "approval-inventory": { primary_source: "GoPlus token-approval-security API", license: "GoPlus public API" },
    sanctions: { primary_source: "Dilisense (consolidated) + direct OFAC/UN/EU/OFSI lists", license: "Dilisense ToS" },
    "protocol-risk": { primary_source: "DefiLlama protocols + hacks DB", license: "DefiLlama public API" },
    "bridge-legitimacy": { primary_source: "DefiLlama bridges + L2Beat", license: "DefiLlama + L2Beat public" },
    "bridge-config-risk": {
      primary_source: "Strale-curated LayerZero seed + LayerZero V2 endpoint.getConfig (live in v0.2)",
      license: "Strale-curated; on-chain reads",
    },
    "sourcify-verification": { primary_source: "Sourcify decentralized contract verification", license: "Apache 2.0" },
    "mixer-graded": { primary_source: "Strale-curated mixer corpus", license: "Strale-curated" },
    "scam-cluster": { primary_source: "ScamSniffer scam-database (GitHub)", license: "MIT" },
    "eas-attestations": { primary_source: "Ethereum Attestation Service GraphQL", license: "EAS public-good infrastructure" },
    "erc-8004-reputation": { primary_source: "On-chain reads via configured ERC-8004 registry", license: "On-chain public data" },
    "sister-rug": { primary_source: "Etherscan + DefiLlama Hacks DB cross-reference", license: "Etherscan ToS + DefiLlama public" },
    "web3-antivirus-risk": { primary_source: "Web3 Antivirus public API", license: "Web3 Antivirus public API" },
    "pre-trade-simulation": { primary_source: "Tenderly Simulation API", license: "Tenderly free tier" },
    "rekt-database": { primary_source: "de.fi REKT Database (token-gated)", license: "de.fi API" },
    "audit-firms": { primary_source: "Strale-curated audit-firm seed (Certik/OZ/TOB/Cyfrin/Sherlock/Code4rena)", license: "Public audit reports" },
    "cross-protocol-exposure": {
      primary_source: "DefiLlama protocols + protocol detail + hacks DB (1-hop composability via parent/fork/oracle dependencies)",
      license: "DefiLlama public API",
    },
    "wallet-velocity": {
      primary_source: "Etherscan tx history (analyzed for velocity / sweep / dormancy patterns)",
      license: "Etherscan ToS",
    },
    "stablecoin-issuer": {
      primary_source: "Etherscan tokentx + Strale-curated stablecoin issuer registry (Circle, Tether, MakerDAO, Paxos, FirstDigital, Ethena Labs)",
      license: "Etherscan ToS + public regulator filings",
    },
    "bytecode-similarity": {
      primary_source: "On-chain eth_getCode + Strale-curated rug-bytecode index (v0.1 exact-match; v0.2 fuzzy similarity)",
      license: "On-chain public data; Strale-curated index",
    },
  };
  const src = sources[evaluatorName];
  if (!src) return null;
  return { evaluator: evaluatorName, ...src };
}
