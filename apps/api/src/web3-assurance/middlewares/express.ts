/**
 * Web3 Assurance — Express drop-in middleware.
 *
 * Mirrors the Hono middleware (gate-outbound + gate-inbound) but for Express
 * apps. Same config surface, same response-header conventions
 * (X-Strale-Verdict, X-Strale-Confidence, X-Strale-Flags).
 *
 *   import express from "express";
 *   import { straleWeb3Guard } from "@strale/web3-assurance/express";
 *
 *   const app = express();
 *   app.use(straleWeb3Guard({
 *     mode: "gate-inbound",
 *     apiKey: process.env.STRALE_API_KEY,
 *   }));
 */

import type { Mode, Verdict, Web3AssuranceRequest } from "../types.js";

const DEFAULT_BASE_URL = "https://api.strale.io";

export interface ExpressGuardConfig {
  mode: "gate-outbound" | "gate-inbound";
  apiKey?: string;
  baseUrl?: string;
  blockOn?: "block" | "review";
  minConfidence?: number;
  extractTarget?: (req: ExpressLikeRequest) => Promise<string | null> | string | null;
  context?: (req: ExpressLikeRequest) => Partial<Web3AssuranceRequest>;
}

interface ExpressLikeRequest {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  method?: string;
  path?: string;
}

interface ExpressLikeResponse {
  setHeader(name: string, value: string): void;
  status(code: number): ExpressLikeResponse;
  json(body: unknown): ExpressLikeResponse;
  locals?: Record<string, unknown>;
}

type ExpressNextFn = (err?: unknown) => void;

function defaultExtractInbound(req: ExpressLikeRequest): string | null {
  const sig = req.headers["x-payment-signature"];
  if (typeof sig === "string" && /0x[a-fA-F0-9]{40}/.test(sig)) {
    return sig.match(/0x[a-fA-F0-9]{40}/)![0];
  }
  const payer = req.headers["x-payment-payer"];
  if (typeof payer === "string" && /^0x[a-fA-F0-9]{40}$/.test(payer)) return payer;
  return null;
}

export function straleWeb3Guard(config: ExpressGuardConfig) {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const blockOn = config.blockOn ?? "block";
  const minConf = config.minConfidence ?? 0.5;

  return async (req: ExpressLikeRequest, res: ExpressLikeResponse, next: ExpressNextFn) => {
    let target: string | null = null;
    if (config.extractTarget) {
      target = await config.extractTarget(req);
    } else if (config.mode === "gate-inbound") {
      target = defaultExtractInbound(req);
    }

    if (!target) {
      res.setHeader("X-Strale-Verdict", "skipped:no-target");
      return next();
    }

    const extra = config.context ? config.context(req) : {};
    const body: Web3AssuranceRequest = {
      target,
      mode: config.mode === "gate-inbound" ? "reverse-call" : "outbound",
      ...extra,
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
    } catch (err) {
      res.setHeader("X-Strale-Verdict", "skipped:fetch-error");
      return next();
    }

    if (!response.ok) {
      res.setHeader("X-Strale-Verdict", `skipped:http-${response.status}`);
      return next();
    }

    const data = (await response.json()) as {
      verdict: Verdict;
      reason_codes: string[];
      confidence: number;
      critical_flags: string[];
      suggested_action: string;
      audit_url: string;
      evidence: Record<string, unknown>;
    };

    res.setHeader("X-Strale-Verdict", data.verdict);
    res.setHeader("X-Strale-Confidence", String(data.confidence));
    res.setHeader("X-Strale-Flags", data.critical_flags.slice(0, 10).join(","));
    res.setHeader("X-Strale-Audit-Url", data.audit_url);

    const shouldBlock =
      data.verdict === "block" ||
      (blockOn === "review" && data.verdict === "review") ||
      data.confidence < minConf;

    if (shouldBlock) {
      res
        .status(403)
        .json({
          error_code: "strale_blocked",
          message: data.suggested_action,
          verdict: data.verdict,
          reason_codes: data.reason_codes,
          confidence: data.confidence,
          critical_flags: data.critical_flags,
          audit_url: data.audit_url,
        });
      return;
    }

    if (res.locals) {
      res.locals.strale_verdict = data.verdict;
      res.locals.strale_evidence = data.evidence;
      res.locals.strale_audit_url = data.audit_url;
    }
    next();
  };
}

export type { Mode };
