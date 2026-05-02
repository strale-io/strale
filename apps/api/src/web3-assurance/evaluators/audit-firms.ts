/**
 * Web3 Assurance — audit-firm aggregation.
 *
 * Cross-references a contract address against publicly-available audit
 * databases from major firms: Certik, Cyfrin (Solodit), OpenZeppelin,
 * Sherlock, Code4rena, Hashlock, ConsenSys Diligence.
 *
 * v1 ships with a curated seed (well-known protocol contracts → audit
 * firms that audited them) — small but high-leverage. Live aggregator
 * deferred to v1.1 because (a) most firms don't expose machine-readable
 * lists, (b) contract↔audit mapping is itself a multi-source problem,
 * and (c) the seed-based approach catches the common cases (Aave, Uniswap,
 * Compound, Curve, etc.) without scraping.
 *
 * Per DEC-20260428-A, Strale itself never scrapes. Live aggregator path
 * (when shipped) will consume Solodit / Cyfrin's open feed under their
 * documented redistribution rights.
 */

import { registerEvaluator } from "./index.js";
import type { Evaluator } from "../types.js";

interface AuditEntry {
  address: string;
  chain: string;
  protocol: string;
  audits: Array<{
    firm: string;
    date?: string;
    severity_findings_max?: "critical" | "high" | "medium" | "low" | "informational";
    report_url?: string;
  }>;
}

const SEED_AUDITS: readonly AuditEntry[] = [
  {
    address: "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9",
    chain: "ethereum",
    protocol: "Aave V2 LendingPool",
    audits: [
      { firm: "OpenZeppelin", date: "2020-08-01", severity_findings_max: "low" },
      { firm: "Certik", date: "2020-09-01", severity_findings_max: "informational" },
      { firm: "Trail of Bits", date: "2020-09-01", severity_findings_max: "low" },
    ],
  },
  {
    address: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2",
    chain: "ethereum",
    protocol: "Aave V3 Pool",
    audits: [
      { firm: "OpenZeppelin", date: "2022-01-01", severity_findings_max: "low" },
      { firm: "ABDK", date: "2022-01-01", severity_findings_max: "low" },
    ],
  },
  {
    address: "0xe592427a0aece92de3edee1f18e0157c05861564",
    chain: "ethereum",
    protocol: "Uniswap V3 SwapRouter",
    audits: [
      { firm: "Trail of Bits", date: "2021-03-01", severity_findings_max: "low" },
      { firm: "ABDK", date: "2021-03-01", severity_findings_max: "informational" },
    ],
  },
  {
    address: "0xc36442b4a4522e871399cd717abdd847ab11fe88",
    chain: "ethereum",
    protocol: "Uniswap V3 NonfungiblePositionManager",
    audits: [
      { firm: "Trail of Bits", date: "2021-03-01", severity_findings_max: "low" },
      { firm: "ABDK", date: "2021-03-01", severity_findings_max: "informational" },
    ],
  },
  {
    address: "0xc3d688b66703497daa19211eedff47f25384cdc3",
    chain: "ethereum",
    protocol: "Compound V3 USDC",
    audits: [
      { firm: "OpenZeppelin", date: "2022-08-01", severity_findings_max: "low" },
      { firm: "ChainSecurity", date: "2022-08-01", severity_findings_max: "low" },
    ],
  },
  {
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    chain: "ethereum",
    protocol: "Centre USDC FiatToken",
    audits: [
      { firm: "Trail of Bits", date: "2018-09-01", severity_findings_max: "low" },
    ],
  },
  {
    address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    chain: "ethereum",
    protocol: "Tether USDT",
    audits: [],
  },
];

const SEED_INDEX = new Map<string, AuditEntry>();
for (const entry of SEED_AUDITS) {
  SEED_INDEX.set(entry.address.toLowerCase(), entry);
}

const evaluator: Evaluator = {
  name: "audit-firms",
  priority: "opportunistic",
  appliesTo: (ctx) =>
    (ctx.targetType === "contract" || ctx.targetType === "token" || ctx.targetType === "protocol") &&
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target),
  cacheTTLSeconds: 86400,
  cacheKey: (ctx) => `audit-firms:${ctx.chain}:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    const entry = SEED_INDEX.get(ctx.target.toLowerCase());

    if (!entry) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          found: false,
          source: "strale-curated-audit-seed",
          note: "No audit record in Strale's curated seed. v1.1 will integrate live audit-firm feeds (Solodit, Cyfrin). Treat absence as 'not-yet-indexed', not 'unaudited'.",
        },
        provenance: { source: "strale-curated-audit-seed", fetched_at: now },
      };
    }

    return {
      ok: true,
      evidence: {
        target: ctx.target,
        found: true,
        protocol: entry.protocol,
        chain: entry.chain,
        audit_count: entry.audits.length,
        audits: entry.audits,
        firms: entry.audits.map((a) => a.firm),
      },
      provenance: { source: "strale-curated-audit-seed", fetched_at: now },
    };
  },
};

registerEvaluator(evaluator);
