/**
 * Web3 Assurance — type definitions.
 *
 * Returns a decision-ready answer about an on-chain counterparty (wallet,
 * contract, token, protocol, bridge, or domain). Sister product to
 * Counterparty Assurance (off-chain KYB). The platform's sanctions
 * substrate is reused here; everything else is crypto-native.
 *
 * Response shape is agent-first: verdict + reason_codes + suggested_action
 * surface at top level. Audit trail demoted to sidecar audit_url. Per
 * IBANforge feedback 2026-04-30 (see Journal).
 */

export type TargetType =
  | "wallet"
  | "contract"
  | "token"
  | "protocol"
  | "bridge"
  | "domain";

export type Action =
  | "send_payment"
  | "swap"
  | "stake"
  | "mint"
  | "interact"
  | "bridge";

export type Verdict = "proceed" | "review" | "block" | "insufficient_evidence";

export type EvidenceCompleteness = "complete" | "partial" | "minimal";

export type Mode = "outbound" | "reverse-call";

export type EvaluatorPriority = "critical" | "opportunistic";

export interface Web3AssuranceRequest {
  target: string;
  target_type?: TargetType;
  chain?: string;
  action?: Action;
  amount_usd?: number;
  agent_id?: string;
  caller_jurisdiction?: string;
  mode?: Mode;
}

export interface EvaluatorContext {
  target: string;
  targetType: TargetType;
  chain: string;
  action?: Action;
  amountUsd?: number;
  agentId?: string;
  callerJurisdiction?: string;
  mode: Mode;
}

export interface Provenance {
  source: string;
  fetched_at: string;
  [key: string]: unknown;
}

export interface EvaluatorResult {
  evaluator: string;
  ok: boolean;
  evidence: Record<string, unknown> | null;
  provenance: Provenance;
  ms: number;
  error?: string;
  cached?: boolean;
  skipped_reason?: string;
}

export interface Evaluator {
  name: string;
  priority: EvaluatorPriority;
  appliesTo: (ctx: EvaluatorContext) => boolean;
  cacheKey: (ctx: EvaluatorContext) => string;
  cacheTTLSeconds: number;
  run: (ctx: EvaluatorContext) => Promise<Omit<EvaluatorResult, "evaluator" | "ms" | "cached">>;
}

export interface SourceQualityEntry {
  source: string;
  ms: number;
  ok: boolean;
}

export interface DisagreementEntry {
  class: string;
  sources: string[];
  description: string;
  resolution_hint: string;
}

export interface ExplanationLink {
  reason_code: string;
  severity: "critical" | "review";
  source_evaluator: string;
  evidence_excerpt: Record<string, unknown>;
  why: string;
}

export interface SlaSpec {
  mode: Mode;
  p99_ms: number;
  p50_ms: number;
}

export interface Web3AssuranceResponse {
  target: string;
  target_type: TargetType;
  chain: string;
  mode: Mode;
  verdict: Verdict;
  reason_codes: string[];
  confidence: number;
  evidence_completeness: EvidenceCompleteness;
  evidence_status: "corroborated" | "partial" | "contradictory" | "single_source" | "minimal";
  critical_flags: string[];
  suggested_action: string;
  expires_at: string;
  evidence: Record<string, Record<string, unknown> | null>;
  source_quality: SourceQualityEntry[];
  disagreements: DisagreementEntry[];
  explanation_chain: ExplanationLink[];
  audit_url: string;
  sla: SlaSpec;
  meta: {
    api_version: string;
    fetched_at: string;
    response_ms: number;
  };
}
