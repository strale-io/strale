/**
 * Web3 Assurance — Hono drop-in middleware.
 *
 * Two modes:
 *   gate-outbound — runs on a request that triggers an outbound on-chain
 *     action by your agent. Calls Strale on the *recipient* before allowing
 *     the action. Used by agent builders to prevent paying scam/sanctioned
 *     wallets.
 *
 *   gate-inbound — runs on an x402 service publisher's endpoint. Extracts
 *     the x402 payer wallet from the request and calls Strale on it before
 *     delivering service. Used to filter scam-cluster traffic, drainer
 *     wallets, and sanctioned buyers before payment is even processed.
 *
 * v1 ships in-process inside the Strale codebase as a reference impl. For
 * external distribution (npm @strale/web3-assurance-hono), this file is
 * the source-of-truth and gets extracted to its own package post-PMF.
 */

import type { Context, MiddlewareHandler } from "hono";
import { compose, computeVerdict } from "../index.js";
import type { Action, TargetType, Web3AssuranceRequest } from "../types.js";

export interface GuardConfig {
  /** Mode: are we vetting where money is going (outbound) or where it's coming from (inbound)? */
  mode: "gate-outbound" | "gate-inbound";
  /** Block when the verdict is at or below this severity. Default: "block". */
  blockOn?: "block" | "review";
  /** Min confidence required to proceed. Default: 0.5. */
  minConfidence?: number;
  /** Extract the target address from the request. Required for gate-outbound. */
  extractTarget?: (c: Context) => Promise<string | null> | string | null;
  /** Optional context decorator. */
  context?: (c: Context) => Partial<Web3AssuranceRequest>;
  /** Called when the request is blocked. Default: returns 403 with verdict body. */
  onBlock?: (c: Context, verdict: ReturnType<typeof computeVerdict>) => Response;
  /** Called when the verdict requires review (between block and proceed). */
  onReview?: (c: Context, verdict: ReturnType<typeof computeVerdict>) => Response | void | Promise<Response | void>;
}

const DEFAULT_BLOCK_ON: GuardConfig["blockOn"] = "block";
const DEFAULT_MIN_CONFIDENCE = 0.5;

function defaultExtractInbound(c: Context): string | null {
  const sig = c.req.header("X-Payment-Signature") ?? c.req.header("x-payment-signature");
  if (sig && /0x[a-fA-F0-9]{40}/.test(sig)) {
    return sig.match(/0x[a-fA-F0-9]{40}/)![0];
  }
  const payerHeader = c.req.header("X-Payment-Payer") ?? c.req.header("x-payment-payer");
  if (payerHeader && /^0x[a-fA-F0-9]{40}$/.test(payerHeader)) return payerHeader;
  return null;
}

export function straleWeb3Guard(config: GuardConfig): MiddlewareHandler {
  const blockOn = config.blockOn ?? DEFAULT_BLOCK_ON;
  const minConf = config.minConfidence ?? DEFAULT_MIN_CONFIDENCE;

  return async (c, next) => {
    let target: string | null = null;
    if (config.extractTarget) {
      target = await config.extractTarget(c);
    } else if (config.mode === "gate-inbound") {
      target = defaultExtractInbound(c);
    }

    if (!target) {
      c.header("X-Strale-Verdict", "skipped:no-target");
      await next();
      return;
    }

    const extra = config.context ? config.context(c) : {};
    const composed = await compose({
      target,
      mode: config.mode === "gate-inbound" ? "reverse-call" : "outbound",
      ...extra,
    });
    const verdict = computeVerdict(composed);

    c.header("X-Strale-Verdict", verdict.verdict);
    c.header("X-Strale-Confidence", String(verdict.confidence));
    c.header("X-Strale-Flags", verdict.critical_flags.slice(0, 10).join(","));

    const shouldBlock =
      verdict.verdict === "block" ||
      (blockOn === "review" && verdict.verdict === "review") ||
      verdict.confidence < minConf;

    if (shouldBlock) {
      if (config.onBlock) return config.onBlock(c, verdict);
      return c.json(
        {
          error_code: "strale_blocked",
          message: verdict.suggested_action,
          verdict: verdict.verdict,
          confidence: verdict.confidence,
          critical_flags: verdict.critical_flags,
        },
        403,
      );
    }

    if (verdict.verdict === "review" && config.onReview) {
      const result = await config.onReview(c, verdict);
      if (result) return result;
    }

    c.set("strale_verdict", verdict);
    c.set("strale_evidence", composed.evidence);
    await next();
  };
}

export type {
  Action,
  TargetType,
  Web3AssuranceRequest,
};
