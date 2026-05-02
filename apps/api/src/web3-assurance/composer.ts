/**
 * Web3 Assurance — composer.
 *
 * Orchestrates evaluators in parallel with per-evaluator timeout. Two modes:
 *   outbound       — agent vetting recipient pre-payment. 8s budget, all
 *                    evaluators run.
 *   reverse-call   — service publisher gating an inbound x402 buyer in
 *                    real-time. 600ms per-evaluator cap, only critical
 *                    evaluators run.
 *
 * Verdict computation lives in verdict.ts. Audit-trail wrapping happens in
 * the route handler so the composer stays pure.
 */

import { getEvaluators } from "./evaluators/index.js";
import { recordSourceCall } from "./source-quality.js";
import type {
  EvaluatorContext,
  EvaluatorResult,
  TargetType,
  Action,
  Mode,
  Web3AssuranceRequest,
} from "./types.js";

const TIMEOUT_OUTBOUND_MS = 8000;
const TIMEOUT_REVERSE_CALL_MS = 600;

const HEX_ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function inferTargetType(target: string, hint?: TargetType): TargetType {
  if (hint) return hint;
  if (target.startsWith("http://") || target.startsWith("https://") || target.includes(".")) {
    if (!HEX_ADDRESS.test(target) && !SOLANA_ADDRESS.test(target)) return "domain";
  }
  return "wallet";
}

export function inferChain(target: string, hint?: string): string {
  if (hint) return hint;
  if (HEX_ADDRESS.test(target)) return "ethereum";
  if (SOLANA_ADDRESS.test(target)) return "solana";
  return "ethereum";
}

function buildContext(req: Web3AssuranceRequest): EvaluatorContext {
  const targetType = inferTargetType(req.target, req.target_type);
  const chain = inferChain(req.target, req.chain);
  const mode: Mode = req.mode ?? "outbound";
  return {
    target: req.target,
    targetType,
    chain,
    action: req.action as Action | undefined,
    amountUsd: req.amount_usd,
    agentId: req.agent_id,
    callerJurisdiction: req.caller_jurisdiction,
    mode,
  };
}

async function runEvaluator(
  ctx: EvaluatorContext,
  evaluator: ReturnType<typeof getEvaluators>[number],
  timeoutMs: number,
): Promise<EvaluatorResult> {
  const start = Date.now();
  try {
    const result = await Promise.race([
      evaluator.run(ctx),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("evaluator-timeout")), timeoutMs),
      ),
    ]);
    return {
      evaluator: evaluator.name,
      ms: Date.now() - start,
      cached: false,
      ...result,
    };
  } catch (err) {
    return {
      evaluator: evaluator.name,
      ok: false,
      evidence: null,
      provenance: {
        source: "internal",
        fetched_at: new Date().toISOString(),
      },
      ms: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export interface ComposeResult {
  context: EvaluatorContext;
  results: EvaluatorResult[];
  evidence: Record<string, Record<string, unknown> | null>;
}

export async function compose(req: Web3AssuranceRequest): Promise<ComposeResult> {
  const ctx = buildContext(req);
  const allEvaluators = getEvaluators().filter((e) => e.appliesTo(ctx));

  const applicable = ctx.mode === "reverse-call"
    ? allEvaluators.filter((e) => e.priority === "critical")
    : allEvaluators;

  const skippedOpportunistic = ctx.mode === "reverse-call"
    ? allEvaluators.filter((e) => e.priority === "opportunistic")
    : [];

  const timeoutMs = ctx.mode === "reverse-call" ? TIMEOUT_REVERSE_CALL_MS : TIMEOUT_OUTBOUND_MS;

  const results = await Promise.all(applicable.map((e) => runEvaluator(ctx, e, timeoutMs)));

  for (const r of results) {
    recordSourceCall(r.provenance.source, r.ms, r.ok);
  }

  for (const e of skippedOpportunistic) {
    results.push({
      evaluator: e.name,
      ok: false,
      evidence: null,
      provenance: {
        source: "internal",
        fetched_at: new Date().toISOString(),
      },
      ms: 0,
      skipped_reason: "opportunistic_skipped_in_reverse_call_mode",
    });
  }

  const evidence: Record<string, Record<string, unknown> | null> = {};
  for (const r of results) {
    evidence[r.evaluator] = r.ok ? r.evidence : null;
  }

  return { context: ctx, results, evidence };
}
