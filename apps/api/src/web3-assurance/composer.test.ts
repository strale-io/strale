/**
 * Composer integration test.
 *
 * Verifies:
 *  - Evaluator registration produces non-zero count
 *  - Target-type filtering (wallet target only triggers wallet evaluators)
 *  - Composer returns evidence map even when individual evaluators fail
 *  - Verdict computation produces a valid verdict given the evidence
 *
 * Network calls are made against real free APIs (DefiLlama, Sourcify,
 * ScamSniffer GitHub, EAS GraphQL); test is allowed to fail offline.
 */

import { describe, it, expect } from "vitest";
import { compose, computeVerdict, getEvaluators } from "./index.js";
import { buildExplanationChain } from "./explanation.js";

describe("web3-assurance composer", () => {
  it("registers evaluators on import", () => {
    const evaluators = getEvaluators();
    expect(evaluators.length).toBeGreaterThanOrEqual(15);
    const names = evaluators.map((e) => e.name);
    expect(names).toContain("wallet-history-risk");
    expect(names).toContain("token-safety");
    expect(names).toContain("contract-verification");
    expect(names).toContain("protocol-risk");
    expect(names).toContain("sourcify-verification");
    expect(names).toContain("mixer-graded");
    expect(names).toContain("scam-cluster");
    expect(names).toContain("eas-attestations");
    expect(names).toContain("erc-8004-reputation");
    expect(names).toContain("sister-rug");
    expect(names).toContain("pre-trade-simulation");
  });

  it("filters evaluators by target type — wallet target excludes token-only evaluators", () => {
    const evaluators = getEvaluators();
    const walletCtx = {
      target: "0x0000000000000000000000000000000000000001",
      targetType: "wallet" as const,
      chain: "ethereum",
      mode: "outbound" as const,
    };
    const applicable = evaluators.filter((e) => e.appliesTo(walletCtx));
    const names = applicable.map((e) => e.name);
    expect(names).toContain("wallet-history-risk");
    expect(names).not.toContain("protocol-risk");
    expect(names).not.toContain("sourcify-verification");
  });

  it("does not run name-based sanctions screening on hex-address targets", () => {
    const evaluators = getEvaluators();
    const sanctions = evaluators.find((e) => e.name === "sanctions");
    expect(sanctions).toBeDefined();

    const hexTargets = ["wallet", "contract", "token", "bridge"] as const;
    for (const targetType of hexTargets) {
      const ctx = {
        target: "0x0000000000000000000000000000000000000001",
        targetType,
        chain: "ethereum",
        mode: "outbound" as const,
      };
      expect(sanctions?.appliesTo(ctx)).toBe(false);
    }

    const stringCtx = {
      target: "aave",
      targetType: "protocol" as const,
      chain: "ethereum",
      mode: "outbound" as const,
    };
    expect(sanctions?.appliesTo(stringCtx)).toBe(true);
  });

  it("returns evidence map + verdict + reason_codes for an unrecognised wallet", async () => {
    const composed = await compose({
      target: "0x0000000000000000000000000000000000000001",
      target_type: "wallet",
      chain: "ethereum",
    });
    expect(composed.context.target).toBe("0x0000000000000000000000000000000000000001");
    expect(composed.context.targetType).toBe("wallet");
    expect(composed.context.mode).toBe("outbound");
    expect(composed.evidence).toBeDefined();
    expect(composed.results.length).toBeGreaterThan(0);

    const verdict = computeVerdict(composed);
    expect(["proceed", "review", "block", "insufficient_evidence"]).toContain(verdict.verdict);
    expect(verdict.confidence).toBeGreaterThanOrEqual(0);
    expect(verdict.confidence).toBeLessThanOrEqual(1);
    expect(verdict.expires_at).toBeDefined();
    expect(Array.isArray(verdict.reason_codes)).toBe(true);
    for (const code of verdict.reason_codes) {
      expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
    }
  }, 30000);

  it("flags Tornado Cash addresses as known mixer (graded, not blocked)", async () => {
    const composed = await compose({
      target: "0x8589427373d6d84e98730d7795d8f6f8731fda16",
      target_type: "wallet",
      chain: "ethereum",
    });
    const mixer = composed.evidence["mixer-graded"];
    expect(mixer).toBeDefined();
    expect(mixer?.is_known_mixer).toBe(true);
    expect(mixer?.category).toBe("delisted");
    expect(typeof mixer?.risk_weight).toBe("number");

    const verdict = computeVerdict(composed);
    expect(verdict.reason_codes).toContain("MIXER_DELISTED_ELEVATED");
    expect(verdict.verdict).toBe("review");
  }, 30000);

  it("flags the KelpDAO 1-of-1 DVN configuration as bridge:single_point_of_failure (BLOCK)", async () => {
    const composed = await compose({
      target: "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7",
      target_type: "bridge",
      chain: "ethereum",
    });
    const config = composed.evidence["bridge-config-risk"];
    expect(config).toBeDefined();
    expect(config?.indexed).toBe(true);
    expect(config?.is_single_point_of_failure).toBe(true);
    expect(config?.risk_level).toBe("critical");

    const verdict = computeVerdict(composed);
    expect(verdict.reason_codes).toContain("BRIDGE_SINGLE_POINT_OF_FAILURE");
    expect(verdict.reason_codes).toContain("BRIDGE_CONFIG_CRITICAL");
    expect(verdict.verdict).toBe("block");

    const chain = buildExplanationChain(composed, verdict);
    const spofLink = chain.find((c) => c.reason_code === "BRIDGE_SINGLE_POINT_OF_FAILURE");
    expect(spofLink).toBeDefined();
    expect(spofLink?.severity).toBe("critical");
    expect(spofLink?.source_evaluator).toBe("bridge-config-risk");
    expect(spofLink?.evidence_excerpt).toHaveProperty("dvn_config");
    expect(spofLink?.why).toMatch(/KelpDAO|single-point-of-failure/i);
  }, 30000);

  it("surfaces cross-protocol exposure for a known protocol with oracle dependencies", async () => {
    const composed = await compose({
      target: "aave",
      target_type: "protocol",
      chain: "ethereum",
    });
    const exposure = composed.evidence["cross-protocol-exposure"];
    expect(exposure).toBeDefined();
    if (exposure?.found === true) {
      expect(Array.isArray(exposure?.oracle_dependencies)).toBe(true);
      expect(["critical", "high", "medium", "low", "unknown"]).toContain(exposure?.exposure_risk_level);
    }
  }, 30000);

  it("reverse-call mode runs only critical evaluators and skips opportunistic ones", async () => {
    const composed = await compose({
      target: "0x0000000000000000000000000000000000000001",
      target_type: "wallet",
      chain: "ethereum",
      mode: "reverse-call",
    });
    expect(composed.context.mode).toBe("reverse-call");
    const opportunisticSkipped = composed.results.filter(
      (r) => r.skipped_reason === "opportunistic_skipped_in_reverse_call_mode",
    );
    expect(opportunisticSkipped.length).toBeGreaterThan(0);
    const ranEvaluators = composed.results.filter((r) => !r.skipped_reason);
    const ranNames = ranEvaluators.map((r) => r.evaluator);
    expect(ranNames).toContain("mixer-graded");
    expect(ranNames).toContain("scam-cluster");
    expect(ranNames).not.toContain("wallet-identity");
    expect(ranNames).not.toContain("eas-attestations");
  }, 30000);
});
