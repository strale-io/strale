/**
 * Web3 Assurance — HTTP route handler.
 *
 * POST /v1/web3-assurance
 *
 * Response shape is agent-first per IBANforge feedback (2026-04-30):
 *   verdict + reason_codes + suggested_action surface at top level; the
 *   audit hash chain is a sidecar URL. Reason codes are stable, machine-
 *   parsable, UPPERCASE_SNAKE_CASE.
 *
 * Two modes:
 *   outbound       — agent vetting recipient pre-payment. Full evaluator
 *                    set, 8s budget. (Default)
 *   reverse-call   — service publisher gating an inbound x402 buyer in
 *                    real-time. Critical evaluators only, 600ms cap.
 *
 * Audit trail wiring is stubbed (audit_url returns "pending"); the next
 * commit replaces it with the integrity-hash chain wrap.
 */

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { authMiddleware } from "../lib/middleware.js";
import { rateLimitByKey } from "../lib/rate-limit.js";
import { apiError } from "../lib/errors.js";
import { getShareableUrl } from "../lib/audit-token.js";
import type { AppEnv } from "../types.js";
import { compose, computeVerdict } from "./index.js";
import { detectDisagreements } from "./disagreement.js";
import { buildExplanationChain } from "./explanation.js";
import type {
  Mode,
  SlaSpec,
  Web3AssuranceRequest,
  Web3AssuranceResponse,
} from "./types.js";

export const web3AssuranceRoute = new Hono<AppEnv>();

const API_VERSION = "0.1";

const SLA_BY_MODE: Record<Mode, SlaSpec> = {
  outbound: { mode: "outbound", p99_ms: 8000, p50_ms: 1500 },
  "reverse-call": { mode: "reverse-call", p99_ms: 800, p50_ms: 250 },
};

web3AssuranceRoute.post("/", authMiddleware, rateLimitByKey(10, 1000), async (c) => {
  const start = Date.now();

  const body = (await c.req.json().catch(() => null)) as Web3AssuranceRequest | null;
  if (!body || typeof body !== "object") {
    return c.json(apiError("invalid_request", "Request body is required."), 400);
  }
  if (!body.target || typeof body.target !== "string") {
    return c.json(
      apiError("invalid_request", "'target' is required (wallet address, contract, token, protocol slug, or domain)."),
      400,
    );
  }
  if (body.mode && body.mode !== "outbound" && body.mode !== "reverse-call") {
    return c.json(apiError("invalid_request", "'mode' must be 'outbound' or 'reverse-call'."), 400);
  }

  c.get("log").info(
    { label: "web3-assurance-start", target: body.target, target_type: body.target_type, mode: body.mode },
    "web3-assurance-start",
  );

  const composed = await compose(body);
  const verdict = computeVerdict(composed);
  const disagreements = detectDisagreements(composed);
  const explanationChain = buildExplanationChain(composed, verdict);
  const mode = composed.context.mode;
  const recordId = `wa_${randomUUID()}`;
  const { url: auditUrl } = getShareableUrl(recordId);

  const sourceQuality = composed.results
    .filter((r) => !r.skipped_reason)
    .map((r) => ({
      source: r.provenance.source,
      ms: r.ms,
      ok: r.ok,
    }));

  const response: Web3AssuranceResponse = {
    target: composed.context.target,
    target_type: composed.context.targetType,
    chain: composed.context.chain,
    mode,
    verdict: verdict.verdict,
    reason_codes: verdict.reason_codes,
    confidence: verdict.confidence,
    evidence_completeness: verdict.evidence_completeness,
    evidence_status: verdict.evidence_status,
    critical_flags: verdict.critical_flags,
    suggested_action: verdict.suggested_action,
    expires_at: verdict.expires_at,
    evidence: composed.evidence,
    source_quality: sourceQuality,
    disagreements,
    explanation_chain: explanationChain,
    audit_url: auditUrl,
    sla: SLA_BY_MODE[mode],
    meta: {
      api_version: API_VERSION,
      fetched_at: new Date().toISOString(),
      response_ms: Date.now() - start,
    },
  };

  c.get("log").info(
    {
      label: "web3-assurance-complete",
      target: body.target,
      mode,
      verdict: verdict.verdict,
      reason_codes_count: verdict.reason_codes.length,
      evaluators_run: composed.results.filter((r) => !r.skipped_reason).length,
      evaluators_skipped: composed.results.filter((r) => r.skipped_reason).length,
      evaluators_ok: composed.results.filter((r) => r.ok).length,
      response_ms: response.meta.response_ms,
    },
    "web3-assurance-complete",
  );

  return c.json(response);
});

export function getWeb3AssuranceSla(mode: Mode = "outbound"): SlaSpec {
  return SLA_BY_MODE[mode];
}
