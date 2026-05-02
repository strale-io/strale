/**
 * Curated mixer / privacy-pool address lists.
 *
 * Per the March 2025 OFAC Tornado Cash delist and the Treasury's March 2026
 * acknowledgement of legitimate mixer use, this is NOT a binary blocklist.
 * Each entry has a `regulatory_status` and a `risk_weight` so the evaluator
 * can produce graded output rather than a hard ban.
 *
 * Categories:
 *   - sanctioned: actively listed by OFAC/UN/EU at the address level
 *   - delisted: previously sanctioned, now removed (Tornado Cash post-2025)
 *   - high_risk: not currently sanctioned but documented criminal misuse
 *     (Sinbad, Wasabi CoinJoin, etc.)
 *   - privacy: privacy-preserving service with no documented criminal nexus
 *
 * Lowercased addresses for case-insensitive lookup. Data file rather than
 * runtime fetch so v1 has no upstream dependency for mixer detection.
 *
 * Maintenance: refreshed manually at first; OFAC updates are infrequent
 * enough that quarterly review is acceptable for v1. v2 should ingest
 * OFAC's published crypto-specific list automatically.
 */

export type MixerCategory = "sanctioned" | "delisted" | "high_risk" | "privacy";

export interface MixerEntry {
  address: string;
  chain: string;
  category: MixerCategory;
  service: string;
  risk_weight: number;
  notes: string;
}

export const MIXER_ADDRESSES: readonly MixerEntry[] = [
  {
    address: "0x8589427373d6d84e98730d7795d8f6f8731fda16",
    chain: "ethereum",
    category: "delisted",
    service: "Tornado Cash (router)",
    risk_weight: 0.5,
    notes: "OFAC sanctioned 2022-08; delisted 2025-03 after Fifth Circuit ruling. Treasury 2026 report acknowledges legitimate use.",
  },
  {
    address: "0x722122df12d4e14e13ac3b6895a86e84145b6967",
    chain: "ethereum",
    category: "delisted",
    service: "Tornado Cash (proxy)",
    risk_weight: 0.5,
    notes: "Tornado Cash proxy address. Same regulatory history.",
  },
  {
    address: "0xdd4c48c0b24039969fc16d1cdf626eab821d3384",
    chain: "ethereum",
    category: "delisted",
    service: "Tornado Cash (0.1 ETH pool)",
    risk_weight: 0.4,
    notes: "Tornado Cash pool contract.",
  },
  {
    address: "0x910cbd523d972eb0a6f4cae4618ad62622b39dbf",
    chain: "ethereum",
    category: "delisted",
    service: "Tornado Cash (1 ETH pool)",
    risk_weight: 0.4,
    notes: "Tornado Cash pool contract.",
  },
  {
    address: "0xa160cdab225685da1d56aa342ad8841c3b53f291",
    chain: "ethereum",
    category: "delisted",
    service: "Tornado Cash (100 ETH pool)",
    risk_weight: 0.5,
    notes: "Tornado Cash pool contract; larger pool sizes carry higher inherent risk.",
  },
  {
    address: "0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936",
    chain: "ethereum",
    category: "delisted",
    service: "Tornado Cash (10 ETH pool)",
    risk_weight: 0.45,
    notes: "Tornado Cash pool contract.",
  },
  {
    address: "0xb541fc07bc7619fd4062a54d96268525cbc6ffef",
    chain: "ethereum",
    category: "high_risk",
    service: "Sinbad (Bitcoin-derived ETH wrapper)",
    risk_weight: 0.85,
    notes: "Sinbad mixer; OFAC sanctioned 2023-11. Documented Lazarus Group use.",
  },
];

const ADDRESS_INDEX: Map<string, MixerEntry> = new Map();
for (const entry of MIXER_ADDRESSES) {
  ADDRESS_INDEX.set(entry.address.toLowerCase(), entry);
}

export function lookupMixerAddress(address: string): MixerEntry | null {
  return ADDRESS_INDEX.get(address.toLowerCase()) ?? null;
}
