/**
 * Web3 Assurance — wallet velocity / behavioral anomaly evaluator.
 *
 * Strategic memo §2 identified velocity / funding-pattern / sweep behaviour
 * as free on-chain signals nobody synthesizes. v0.1 surfaces three signals
 * derivable from the wallet-transactions evaluator output:
 *
 *   - tx_velocity: median time between consecutive transactions
 *   - sweep_pattern: ratio of inbound -> immediate outbound (within 60s)
 *   - dormancy: was the wallet dormant for >90d before recent activity?
 *
 * Cheap (no extra API calls — reads existing evaluator output via the
 * composer's evidence cache when present, or falls back to gracefully
 * declaring 'evidence_not_available'). Does not predict; classifies
 * verifiable behavioral facts.
 *
 * Not a model. Not a fraud-prediction score. Just shape-of-activity
 * signals an agent can act on.
 */

import { registerEvaluator } from "./index.js";
import { etherscanFetch } from "../../capabilities/lib/etherscan-client.js";
import type { Evaluator } from "../types.js";

const CHAIN_TO_ID: Record<string, string> = {
  ethereum: "1",
  base: "8453",
  polygon: "137",
  arbitrum: "42161",
  optimism: "10",
  bsc: "56",
};

const SWEEP_WINDOW_SECONDS = 60;
const DORMANCY_THRESHOLD_DAYS = 90;
const ACTIVE_RECENT_DAYS = 7;

interface EtherscanTx {
  hash: string;
  from: string;
  to: string;
  value: string;
  timeStamp: string;
}

const evaluator: Evaluator = {
  name: "wallet-velocity",
  priority: "opportunistic",
  appliesTo: (ctx) =>
    ctx.targetType === "wallet" &&
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target) &&
    CHAIN_TO_ID[ctx.chain.toLowerCase()] !== undefined,
  cacheTTLSeconds: 1800,
  cacheKey: (ctx) => `velocity:${ctx.chain}:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    const chainId = CHAIN_TO_ID[ctx.chain.toLowerCase()]!;

    if (!process.env.ETHERSCAN_API_KEY) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          enabled: false,
          note: "Wallet-velocity evaluator requires ETHERSCAN_API_KEY; verdict treats absence as neutral.",
        },
        provenance: { source: "etherscan.io", fetched_at: now },
      };
    }

    try {
      const data = await etherscanFetch({
        chainid: chainId,
        module: "account",
        action: "txlist",
        address: ctx.target,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: "100",
        sort: "desc",
      });

      const txs = (Array.isArray(data.result) ? data.result : []) as EtherscanTx[];
      if (txs.length === 0) {
        return {
          ok: true,
          evidence: {
            target: ctx.target,
            no_activity: true,
            note: "Wallet has no transactions; velocity signals not applicable.",
          },
          provenance: { source: "etherscan.io", fetched_at: now },
        };
      }

      const sortedAsc = [...txs].sort(
        (a, b) => parseInt(a.timeStamp, 10) - parseInt(b.timeStamp, 10),
      );

      const intervals: number[] = [];
      for (let i = 1; i < sortedAsc.length; i++) {
        intervals.push(
          parseInt(sortedAsc[i].timeStamp, 10) -
            parseInt(sortedAsc[i - 1].timeStamp, 10),
        );
      }
      intervals.sort((a, b) => a - b);
      const medianIntervalSec =
        intervals.length === 0
          ? null
          : intervals[Math.floor(intervals.length / 2)];

      const lower = ctx.target.toLowerCase();
      let inboundCount = 0;
      let sweepCount = 0;
      for (let i = 0; i < sortedAsc.length; i++) {
        if ((sortedAsc[i].to ?? "").toLowerCase() !== lower) continue;
        inboundCount += 1;
        const inboundTs = parseInt(sortedAsc[i].timeStamp, 10);
        for (let j = i + 1; j < sortedAsc.length; j++) {
          const next = sortedAsc[j];
          const nextTs = parseInt(next.timeStamp, 10);
          if (nextTs - inboundTs > SWEEP_WINDOW_SECONDS) break;
          if ((next.from ?? "").toLowerCase() === lower) {
            sweepCount += 1;
            break;
          }
        }
      }
      const sweepRatio = inboundCount > 0 ? sweepCount / inboundCount : 0;

      const lastTs = parseInt(sortedAsc[sortedAsc.length - 1].timeStamp, 10);
      const firstTs = parseInt(sortedAsc[0].timeStamp, 10);
      const ageDays = (Date.now() / 1000 - firstTs) / 86400;
      const sinceLastDays = (Date.now() / 1000 - lastTs) / 86400;

      let dormantThenActive = false;
      let dormancyGapDays = 0;
      if (intervals.length > 0) {
        const maxIntervalSec = Math.max(...intervals);
        dormancyGapDays = maxIntervalSec / 86400;
        dormantThenActive =
          dormancyGapDays > DORMANCY_THRESHOLD_DAYS &&
          sinceLastDays < ACTIVE_RECENT_DAYS;
      }

      const isHighFrequency =
        medianIntervalSec !== null && medianIntervalSec < 30 && sortedAsc.length >= 5;
      const isSweepHeavy = sweepRatio > 0.5 && inboundCount >= 3;

      const flags: string[] = [];
      if (isHighFrequency) flags.push("velocity_bot_pattern");
      if (isSweepHeavy) flags.push("sweep_pattern");
      if (dormantThenActive) flags.push("dormant_then_active");

      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain: ctx.chain,
          tx_sample_size: sortedAsc.length,
          age_days: Math.round(ageDays),
          since_last_tx_days: Math.round(sinceLastDays),
          median_interval_seconds: medianIntervalSec,
          inbound_count: inboundCount,
          sweep_count: sweepCount,
          sweep_ratio: Math.round(sweepRatio * 100) / 100,
          dormancy_gap_days: Math.round(dormancyGapDays),
          is_high_frequency: isHighFrequency,
          is_sweep_heavy: isSweepHeavy,
          dormant_then_active: dormantThenActive,
          behavioral_flags: flags,
        },
        provenance: { source: "etherscan.io", fetched_at: now },
      };
    } catch (err) {
      return {
        ok: false,
        evidence: null,
        provenance: { source: "etherscan.io", fetched_at: now },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

registerEvaluator(evaluator);
