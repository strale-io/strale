/**
 * Web3 Assurance — EAS (Ethereum Attestation Service) reader.
 *
 * EAS is a free, tokenless, public-good infrastructure for on-chain
 * attestations. Anyone can attest anything about any address using any
 * schema. v1 reads attestation count + summary by querying EAS's GraphQL
 * indexer (free, public).
 *
 * v1 surfaces:
 *   - total attestations about this address (as recipient)
 *   - revoked count
 *   - top schemas attested under
 *   - attesters (top 5 by frequency)
 *
 * v1.5 will add schema-aware interpretation (e.g. "verified-by-Coinbase"
 * schema → trust signal); deferred until specific schemas earn enough
 * adoption to be worth hardcoding.
 */

import { registerEvaluator } from "./index.js";
import type { Evaluator } from "../types.js";

const TIMEOUT_MS = 6000;

const EAS_GRAPHQL_BY_CHAIN: Record<string, string> = {
  ethereum: "https://easscan.org/graphql",
  base: "https://base.easscan.org/graphql",
  optimism: "https://optimism.easscan.org/graphql",
  arbitrum: "https://arbitrum.easscan.org/graphql",
  "1": "https://easscan.org/graphql",
  "8453": "https://base.easscan.org/graphql",
  "10": "https://optimism.easscan.org/graphql",
  "42161": "https://arbitrum.easscan.org/graphql",
};

const QUERY = `
  query Attestations($recipient: String!) {
    attestations(
      where: { recipient: { equals: $recipient } }
      orderBy: { time: desc }
      take: 100
    ) {
      id
      schemaId
      attester
      revoked
      revocationTime
      time
      schema { schemaNames { name } }
    }
  }
`;

const evaluator: Evaluator = {
  name: "eas-attestations",
  priority: "opportunistic",
  appliesTo: (ctx) =>
    /^0x[a-fA-F0-9]{40}$/.test(ctx.target),
  cacheTTLSeconds: 1800,
  cacheKey: (ctx) => `eas:${ctx.chain}:${ctx.target.toLowerCase()}`,
  run: async (ctx) => {
    const now = new Date().toISOString();
    const endpoint = EAS_GRAPHQL_BY_CHAIN[ctx.chain.toLowerCase()];
    if (!endpoint) {
      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain_supported: false,
          chain: ctx.chain,
          note: "EAS not deployed on this chain (or not yet integrated by Strale).",
        },
        provenance: { source: "easscan.org", fetched_at: now },
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "Strale/1.0" },
        body: JSON.stringify({ query: QUERY, variables: { recipient: ctx.target } }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!response.ok) throw new Error(`EAS HTTP ${response.status}`);

      const data = (await response.json()) as {
        data?: {
          attestations?: Array<{
            schemaId: string;
            attester: string;
            revoked: boolean;
            time: number;
            schema?: { schemaNames?: Array<{ name: string }> };
          }>;
        };
      };

      const attestations = data?.data?.attestations ?? [];
      const total = attestations.length;
      const revoked = attestations.filter((a) => a.revoked).length;

      const schemaCounts: Record<string, number> = {};
      const attesterCounts: Record<string, number> = {};
      for (const a of attestations) {
        const schemaName = a.schema?.schemaNames?.[0]?.name ?? a.schemaId;
        schemaCounts[schemaName] = (schemaCounts[schemaName] ?? 0) + 1;
        attesterCounts[a.attester] = (attesterCounts[a.attester] ?? 0) + 1;
      }
      const topSchemas = Object.entries(schemaCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));
      const topAttesters = Object.entries(attesterCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([address, count]) => ({ address, count }));

      const oldest = attestations.length > 0
        ? attestations.sort((a, b) => a.time - b.time)[0]
        : null;

      return {
        ok: true,
        evidence: {
          target: ctx.target,
          chain: ctx.chain,
          total_attestations: total,
          revoked_count: revoked,
          first_attestation_at: oldest ? new Date(oldest.time * 1000).toISOString() : null,
          top_schemas: topSchemas,
          top_attesters: topAttesters,
          truncated_at_100: total === 100,
        },
        provenance: { source: "easscan.org", fetched_at: now, endpoint },
      };
    } catch (err) {
      return {
        ok: false,
        evidence: null,
        provenance: { source: "easscan.org", fetched_at: now },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  },
};

registerEvaluator(evaluator);
