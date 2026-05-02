/**
 * Web3 Assurance — bridge configuration risk evaluator.
 *
 * The KelpDAO failure mode (1-of-1 DVN single-point-of-failure on LayerZero,
 * $292M April 18 2026) was *configuration risk*, not code risk. No
 * counterparty assurance product on the market analyzes bridge verification
 * configuration. This evaluator surfaces:
 *
 *   - DVN count + threshold (LayerZero-specific; covers KelpDAO mode)
 *   - Reputable-DVN count vs total
 *   - Single-point-of-failure modes
 *   - Historical incidents tied to this config
 *
 * v0.1 ships with a curated seed of known LayerZero OApps (see
 * data/layerzero-oapps.ts). v0.2 will replace the seed lookup with live
 * on-chain reads via LayerZero V2 endpoint.getConfig().
 *
 * For non-LayerZero bridges (Wormhole, Axelar, multi-sig, federated),
 * this evaluator returns "not_indexed" — v1.x will add per-protocol
 * classifiers as the seed grows.
 */

import { registerEvaluator } from "./index.js";
import { lookupLayerZeroOApp, isReputableDvn } from "../data/layerzero-oapps.js";
import { fetchLiveLayerZeroConfig } from "../lib/layerzero-config.js";
import type { Evaluator } from "../types.js";

const evaluator: Evaluator = {
  name: "bridge-config-risk",
  priority: "critical",
  appliesTo: (ctx) =>
    (ctx.targetType === "bridge" || ctx.targetType === "contract") &&
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target),
  cacheTTLSeconds: 86400,
  cacheKey: (ctx) => `bridge-config:${ctx.chain}:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    const entry = lookupLayerZeroOApp(ctx.target, ctx.chain);

    if (!entry) {
      const live = await fetchLiveLayerZeroConfig(ctx.target, ctx.chain);
      if (live.ok && live.config) {
        const cfg = live.config;
        const totalDvns =
          cfg.requiredDVNs.length + cfg.optionalDVNs.length;
        const isSpof =
          cfg.requiredDVNCount === 1 && cfg.optionalDVNCount === 0 &&
          cfg.optionalDVNThreshold === 0;
        let level: "critical" | "high" | "medium" | "low";
        if (isSpof) level = "critical";
        else if (cfg.requiredDVNCount < 2) level = "high";
        else if (totalDvns < 3) level = "medium";
        else level = "low";
        return {
          ok: true,
          evidence: {
            target: ctx.target,
            chain: ctx.chain,
            indexed: true,
            source: "live-on-chain-getConfig",
            verification_protocol: "LayerZero V2 DVN",
            dvn_config: {
              required_dvn_count: cfg.requiredDVNCount,
              optional_dvn_count: cfg.optionalDVNCount,
              optional_dvn_threshold: cfg.optionalDVNThreshold,
              required_dvns: cfg.requiredDVNs,
              optional_dvns: cfg.optionalDVNs,
              required_dvns_reputable: [],
            },
            confirmations: cfg.confirmations.toString(),
            total_dvn_count: totalDvns,
            reputable_dvn_count: 0,
            reputable_dvn_ratio: 0,
            is_single_point_of_failure: isSpof,
            spof_modes: isSpof
              ? ["single_required_dvn", "no_optional_dvns", "no_threshold_redundancy"]
              : [],
            historical_incidents_count: 0,
            historical_incidents_recent_year: 0,
            last_incident: null,
            risk_level: level,
            v0_2_status: "experimental",
            v0_2_note:
              "Live on-chain read of LayerZero V2 endpoint.getConfig. DVN-reputability not classified for live reads in v0.2 (requires DVN-address-to-name registry). Used when target is not in Strale's curated seed; treat verdict severity weighting accordingly.",
          },
          provenance: {
            source: "live-on-chain-getConfig",
            fetched_at: now,
            endpoint_contract: live.endpoint,
            rpc_used: live.rpc_used,
          },
        };
      }
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain: ctx.chain,
          indexed: false,
          source: "strale-curated-layerzero-seed",
          live_read_attempted: true,
          live_read_error: live.error ?? "unknown",
          note:
            "Bridge configuration not in Strale's curated LayerZero seed; live on-chain read attempted but did not return a decodable UlnConfig. Target may not be a LayerZero V2 OApp, or RPC may be temporarily unavailable. Treat as 'unknown', not 'safe'.",
        },
        provenance: {
          source: "strale-curated-layerzero-seed",
          fetched_at: now,
        },
      };
    }

    const totalDvns =
      entry.dvn_config.required_dvns.length +
      entry.dvn_config.optional_dvns.length;
    const reputableRatio = totalDvns > 0 ? entry.reputable_dvn_count / totalDvns : 0;

    let riskLevel: "critical" | "high" | "medium" | "low";
    if (entry.is_single_point_of_failure) {
      riskLevel = "critical";
    } else if (entry.dvn_config.required_dvn_count < 2) {
      riskLevel = "high";
    } else if (reputableRatio < 0.5) {
      riskLevel = "medium";
    } else {
      riskLevel = "low";
    }

    const recentIncidents = entry.historical_incidents.filter((inc) => {
      const days =
        (Date.now() - new Date(inc.date).getTime()) / (86400 * 1000);
      return days < 365;
    });

    return {
      ok: true,
      evidence: {
        target: ctx.target,
        chain: ctx.chain,
        indexed: true,
        protocol_name: entry.protocol_name,
        category: entry.category,
        verification_protocol: "LayerZero V2 DVN",
        dvn_config: {
          required_dvn_count: entry.dvn_config.required_dvn_count,
          optional_dvn_count: entry.dvn_config.optional_dvn_count,
          optional_dvn_threshold: entry.dvn_config.optional_dvn_threshold,
          required_dvns: entry.dvn_config.required_dvns,
          optional_dvns: entry.dvn_config.optional_dvns,
          required_dvns_reputable: entry.dvn_config.required_dvns.filter((d) => isReputableDvn(d)),
        },
        total_dvn_count: totalDvns,
        reputable_dvn_count: entry.reputable_dvn_count,
        reputable_dvn_ratio: Math.round(reputableRatio * 100) / 100,
        is_single_point_of_failure: entry.is_single_point_of_failure,
        spof_modes: entry.spof_modes,
        historical_incidents_count: entry.historical_incidents.length,
        historical_incidents_recent_year: recentIncidents.length,
        last_incident: entry.historical_incidents[0] ?? null,
        risk_level: riskLevel,
        config_last_verified_at: entry.config_last_verified_at,
        notes: entry.notes,
      },
      provenance: {
        source: "strale-curated-layerzero-seed",
        fetched_at: now,
      },
    };
  },
};

registerEvaluator(evaluator);
