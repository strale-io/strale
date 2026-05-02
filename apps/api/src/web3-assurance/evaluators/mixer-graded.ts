/**
 * Web3 Assurance — graded mixer / privacy-pool detection.
 *
 * Per the March 2025 OFAC Tornado Cash delist and the Treasury's March 2026
 * report acknowledging legitimate mixer use, this is NOT a binary "block".
 * The evaluator returns a graded risk_weight per entry plus a regulatory
 * status hint that's jurisdiction-aware.
 *
 * v1 implementation: direct address match against the curated list. v2:
 * trace tx history N hops and surface mixer touches with hop distance.
 * v2 deferred so v1 ships without expensive on-chain trace queries.
 */

import { registerEvaluator } from "./index.js";
import { lookupMixerAddress } from "../data/mixer-addresses.js";
import type { Evaluator } from "../types.js";

const evaluator: Evaluator = {
  name: "mixer-graded",
  priority: "critical",
  appliesTo: (ctx) =>
    ctx.targetType === "wallet" &&
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target),
  cacheTTLSeconds: 14400,
  cacheKey: (ctx) => `mixer:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    const direct = lookupMixerAddress(ctx.target);

    if (!direct) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          is_known_mixer: false,
          direct_match: false,
          v2_trace_status: "deferred",
          note: "Direct match only in v1. v2 will trace recent funding hops.",
        },
        provenance: { source: "strale-curated-mixer-list", fetched_at: now },
      };
    }

    const jurisdictionNote = (() => {
      const j = ctx.callerJurisdiction?.toUpperCase();
      if (!j) return "no caller jurisdiction supplied — applies most-restrictive interpretation";
      if (j === "US") {
        return direct.category === "delisted"
          ? "delisted by OFAC March 2025; still elevated risk under FinCEN BSA scrutiny"
          : "active OFAC sanctions apply";
      }
      if (j === "EU" || j === "EEA") {
        return direct.category === "sanctioned"
          ? "EU restrictive measures may apply"
          : "no current EU listing — graded risk per Strale curated list";
      }
      return "no jurisdiction-specific rule encoded; apply most-restrictive interpretation";
    })();

    return {
      ok: true,
      evidence: {
        target: ctx.target,
        is_known_mixer: true,
        direct_match: true,
        service: direct.service,
        category: direct.category,
        risk_weight: direct.risk_weight,
        regulatory_note: direct.notes,
        jurisdiction_interpretation: jurisdictionNote,
        v2_trace_status: "deferred",
      },
      provenance: { source: "strale-curated-mixer-list", fetched_at: now },
    };
  },
};

registerEvaluator(evaluator);
