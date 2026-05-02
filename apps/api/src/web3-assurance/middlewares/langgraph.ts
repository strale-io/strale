/**
 * Web3 Assurance — LangGraph drop-in node.
 *
 * Returns a LangGraph-compatible runnable node that gates outbound on-chain
 * actions. Wire it into the graph before the action node:
 *
 *   const graph = new StateGraph(MyAgentState)
 *     .addNode("preflight", straleWeb3Preflight({ apiKey, mode: "outbound" }))
 *     .addNode("send", sendNode)
 *     .addEdge("preflight", "send")
 *     .addConditionalEdges("preflight", (s) =>
 *       s.strale_verdict === "block" ? "abort" : "send"
 *     );
 *
 * The node mutates state with `strale_verdict`, `strale_reason_codes`,
 * `strale_evidence`, and `strale_audit_url`. Downstream nodes can branch
 * on the verdict.
 *
 * v1 ships in-process inside the Strale codebase as a reference impl.
 * Post-PMF, extracts to its own package (@strale/web3-assurance-langgraph).
 */

import type {
  Mode,
  TargetType,
  Verdict,
  Web3AssuranceRequest,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.strale.io";

export interface PreflightConfig {
  apiKey?: string;
  baseUrl?: string;
  mode?: Mode;
  /** Pull the target wallet/contract from the agent state. Required. */
  extractTarget: (state: Record<string, unknown>) => string | null;
  /** Optional: enrich the request with target_type / chain / action / amount. */
  enrich?: (state: Record<string, unknown>) => Partial<Web3AssuranceRequest>;
  /** Block when verdict is at or below this severity. Default: "block". */
  blockOn?: "block" | "review";
  /** Min confidence to proceed. Default: 0.5. */
  minConfidence?: number;
}

export interface PreflightStateUpdate {
  strale_verdict: Verdict;
  strale_reason_codes: string[];
  strale_evidence: Record<string, unknown>;
  strale_critical_flags: string[];
  strale_audit_url: string;
  strale_confidence: number;
  strale_should_proceed: boolean;
}

export function straleWeb3Preflight(config: PreflightConfig) {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const blockOn = config.blockOn ?? "block";
  const minConf = config.minConfidence ?? 0.5;

  return async (state: Record<string, unknown>): Promise<PreflightStateUpdate> => {
    const target = config.extractTarget(state);
    if (!target) {
      return {
        strale_verdict: "insufficient_evidence",
        strale_reason_codes: ["NO_TARGET_PROVIDED"],
        strale_evidence: {},
        strale_critical_flags: [],
        strale_audit_url: "",
        strale_confidence: 0,
        strale_should_proceed: false,
      };
    }

    const enrichment = config.enrich ? config.enrich(state) : {};
    const body: Web3AssuranceRequest = {
      target,
      mode: config.mode ?? "outbound",
      ...enrichment,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    const response = await fetch(`${baseUrl}/v1/web3-assurance`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return {
        strale_verdict: "insufficient_evidence",
        strale_reason_codes: [`HTTP_${response.status}`],
        strale_evidence: {},
        strale_critical_flags: [],
        strale_audit_url: "",
        strale_confidence: 0,
        strale_should_proceed: false,
      };
    }

    const data = (await response.json()) as {
      verdict: Verdict;
      reason_codes: string[];
      confidence: number;
      critical_flags: string[];
      evidence: Record<string, unknown>;
      audit_url: string;
    };

    const blocked =
      data.verdict === "block" ||
      (blockOn === "review" && data.verdict === "review") ||
      data.confidence < minConf;

    return {
      strale_verdict: data.verdict,
      strale_reason_codes: data.reason_codes,
      strale_evidence: data.evidence,
      strale_critical_flags: data.critical_flags,
      strale_audit_url: data.audit_url,
      strale_confidence: data.confidence,
      strale_should_proceed: !blocked,
    };
  };
}

export type { Mode, TargetType, Verdict, Web3AssuranceRequest };
