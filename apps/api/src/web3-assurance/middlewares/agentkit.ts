/**
 * Web3 Assurance — Coinbase AgentKit drop-in.
 *
 * Coinbase AgentKit (cdp.coinbase.com) is the natural surface for x402 +
 * Agentic Wallet builders. Two integration shapes:
 *
 * 1) Pre-action gate. Wrap an AgentKit action so it calls Strale on the
 *    recipient before executing the on-chain transaction. Block when the
 *    verdict says block.
 *
 * 2) Standalone tool. Add Web3 Assurance as a callable AgentKit action so
 *    the agent can ask "is this counterparty safe?" mid-conversation
 *    without committing to a transaction.
 *
 * v1 ships the pre-action gate. The standalone-tool form is a one-liner
 * once AgentKit's tool registration matures (currently in flux).
 */

import type {
  Mode,
  Verdict,
  Web3AssuranceRequest,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.strale.io";

export interface AgentKitGateConfig {
  apiKey?: string;
  baseUrl?: string;
  /** Default 'outbound' (recipient vetting). */
  mode?: Mode;
  /** Block when verdict reaches this severity. Default 'block'. */
  blockOn?: "block" | "review";
  /** Min confidence to proceed. Default 0.5. */
  minConfidence?: number;
  /**
   * Pull the on-chain target from an AgentKit action call. AgentKit actions
   * receive a structured input object; the gate inspects it to find the
   * recipient address. Required.
   */
  extractTarget: (input: unknown) => string | null;
  /** Optional: enrich the request with target_type / chain / action / amount. */
  enrich?: (input: unknown) => Partial<Web3AssuranceRequest>;
}

export interface GateResult {
  verdict: Verdict;
  reason_codes: string[];
  critical_flags: string[];
  suggested_action: string;
  audit_url: string;
  confidence: number;
  evidence: Record<string, unknown>;
  blocked: boolean;
}

type AgentKitAction<I, O> = (input: I) => Promise<O>;

export function withStraleWeb3Gate<I, O>(
  action: AgentKitAction<I, O>,
  config: AgentKitGateConfig,
): (input: I) => Promise<O | GateResult> {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const blockOn = config.blockOn ?? "block";
  const minConf = config.minConfidence ?? 0.5;

  return async (input: I): Promise<O | GateResult> => {
    const target = config.extractTarget(input);
    if (!target) {
      return action(input);
    }

    const enrichment = config.enrich ? config.enrich(input) : {};
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

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/v1/web3-assurance`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      return action(input);
    }

    if (!response.ok) {
      return action(input);
    }

    const data = (await response.json()) as {
      verdict: Verdict;
      reason_codes: string[];
      confidence: number;
      critical_flags: string[];
      suggested_action: string;
      evidence: Record<string, unknown>;
      audit_url: string;
    };

    const blocked =
      data.verdict === "block" ||
      (blockOn === "review" && data.verdict === "review") ||
      data.confidence < minConf;

    if (blocked) {
      return {
        verdict: data.verdict,
        reason_codes: data.reason_codes,
        critical_flags: data.critical_flags,
        suggested_action: data.suggested_action,
        audit_url: data.audit_url,
        confidence: data.confidence,
        evidence: data.evidence,
        blocked: true,
      };
    }

    return action(input);
  };
}

export type { Mode, Verdict, Web3AssuranceRequest };
