/**
 * Curated LayerZero OApp DVN-configuration registry.
 *
 * v0.1 of the bridge-config-risk evaluator ships with a manual seed of
 * known LayerZero OApps and their verification configurations. v0.2 will
 * replace this with live on-chain `endpoint.getConfig()` reads, but the
 * seed catches the KelpDAO use case (1-of-1 DVN single-point-of-failure)
 * and similar high-value OApps immediately.
 *
 * Seed sourcing methodology:
 *   - LayerZero Scan public OApp registry
 *   - Public postmortems for incidents (KelpDAO Apr 2026, Radiant Oct 2024)
 *   - LayerZero V2 endpoint `getConfig` reads (manually performed for seed)
 *
 * Per DEC-20260428-A, Strale itself does not scrape; this seed is curated
 * from public on-chain reads + public incident reports.
 *
 * "Reputable DVN" classification follows community consensus (LayerZero
 * Labs, Google Cloud, Polyhedra, Nethermind, Stargate, P2P, Animoca,
 * Restake, BCW, etc. are reputable; unknown signer addresses are not).
 */

export interface LayerZeroOAppEntry {
  /** OApp contract address (the cross-chain application contract) */
  address: string;
  /** Chain on which this OApp is deployed */
  chain: string;
  /** Human-readable protocol name */
  protocol_name: string;
  /** OApp category for downstream classification */
  category: "stablecoin_oft" | "lst_oft" | "lrt_oft" | "bridge" | "swap" | "messaging" | "other";
  dvn_config: {
    required_dvn_count: number;
    optional_dvn_count: number;
    optional_dvn_threshold: number;
    required_dvns: string[];
    optional_dvns: string[];
  };
  reputable_dvn_count: number;
  is_single_point_of_failure: boolean;
  spof_modes: string[];
  historical_incidents: Array<{
    date: string;
    classification: string;
    amount_usd: number;
    notes: string;
  }>;
  notes: string;
  config_last_verified_at: string;
}

const REPUTABLE_DVNS = new Set<string>([
  "LayerZero Labs",
  "Google Cloud",
  "Polyhedra",
  "Nethermind",
  "Stargate",
  "P2P",
  "Animoca",
  "Restake",
  "BCW",
  "Switchboard",
  "Horizen Labs",
]);

export const LAYERZERO_OAPPS: readonly LayerZeroOAppEntry[] = [
  {
    address: "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7",
    chain: "ethereum",
    protocol_name: "KelpDAO rsETH OFT (pre-incident config)",
    category: "lrt_oft",
    dvn_config: {
      required_dvn_count: 1,
      optional_dvn_count: 0,
      optional_dvn_threshold: 0,
      required_dvns: ["LayerZero Labs"],
      optional_dvns: [],
    },
    reputable_dvn_count: 1,
    is_single_point_of_failure: true,
    spof_modes: [
      "single_required_dvn",
      "no_optional_dvns",
      "no_threshold_redundancy",
    ],
    historical_incidents: [
      {
        date: "2026-04-18",
        classification: "bridge_dvn_compromise",
        amount_usd: 292000000,
        notes:
          "Attacker compromised internal RPC nodes and DDoS'd external nodes to feed false data to the single-point-of-failure DVN. Attribution: Lazarus Group (DPRK). $177M cascading bad debt at Aave. Vulnerability was the 1-of-1 DVN configuration, NOT a code bug. Strale's bridge-config-risk evaluator would have flagged this configuration as critical-SPOF before any transaction.",
      },
    ],
    notes:
      "Headline KelpDAO failure mode. Configuration was reduced from a more redundant setup to 1-of-1 in the months prior to the exploit; recommended-DVN best-practice violated.",
    config_last_verified_at: "2026-04-18",
  },
  {
    address: "0x77b2043768d28e9c9ab44e1abfc95944bce57931",
    chain: "ethereum",
    protocol_name: "Stargate Finance V2 USDC OFT",
    category: "stablecoin_oft",
    dvn_config: {
      required_dvn_count: 2,
      optional_dvn_count: 1,
      optional_dvn_threshold: 0,
      required_dvns: ["Stargate", "LayerZero Labs"],
      optional_dvns: ["Polyhedra"],
    },
    reputable_dvn_count: 3,
    is_single_point_of_failure: false,
    spof_modes: [],
    historical_incidents: [],
    notes:
      "Standard Stargate V2 OFT configuration. 2-of-2 required + 1 optional, all reputable DVNs. Production-grade redundancy.",
    config_last_verified_at: "2026-04-30",
  },
  {
    address: "0x77b2043768d28e9c9ab44e1abfc95944bce57931",
    chain: "base",
    protocol_name: "Stargate Finance V2 USDC OFT (Base)",
    category: "stablecoin_oft",
    dvn_config: {
      required_dvn_count: 2,
      optional_dvn_count: 1,
      optional_dvn_threshold: 0,
      required_dvns: ["Stargate", "LayerZero Labs"],
      optional_dvns: ["Polyhedra"],
    },
    reputable_dvn_count: 3,
    is_single_point_of_failure: false,
    spof_modes: [],
    historical_incidents: [],
    notes: "Same config as Ethereum mainnet deployment.",
    config_last_verified_at: "2026-04-30",
  },
  {
    address: "0x152d109ca56432aaaaee1f2bd4d77a9ab78f9d56",
    chain: "ethereum",
    protocol_name: "Radiant Capital OFTs (pre-incident config)",
    category: "bridge",
    dvn_config: {
      required_dvn_count: 1,
      optional_dvn_count: 0,
      optional_dvn_threshold: 0,
      required_dvns: ["LayerZero Labs"],
      optional_dvns: [],
    },
    reputable_dvn_count: 1,
    is_single_point_of_failure: true,
    spof_modes: ["single_required_dvn", "no_optional_dvns"],
    historical_incidents: [
      {
        date: "2024-10-16",
        classification: "multi-sig_compromise",
        amount_usd: 50000000,
        notes:
          "Radiant DAO multi-sig was compromised, allowing the attacker to take over OFT contracts. Bridge-config alone wouldn't have caught the multi-sig compromise, but the absent DVN redundancy made the cross-chain damage worse.",
      },
    ],
    notes:
      "Historical example of a cross-chain protocol with weak DVN configuration; included in the seed as a negative reference point.",
    config_last_verified_at: "2024-10-15",
  },
];

const ADDRESS_INDEX: Map<string, LayerZeroOAppEntry> = new Map();
for (const entry of LAYERZERO_OAPPS) {
  ADDRESS_INDEX.set(`${entry.chain}:${entry.address.toLowerCase()}`, entry);
}

export function lookupLayerZeroOApp(
  address: string,
  chain: string,
): LayerZeroOAppEntry | null {
  return ADDRESS_INDEX.get(`${chain.toLowerCase()}:${address.toLowerCase()}`) ?? null;
}

export function isReputableDvn(dvn: string): boolean {
  return REPUTABLE_DVNS.has(dvn);
}
