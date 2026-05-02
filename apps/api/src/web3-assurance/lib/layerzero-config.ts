/**
 * LayerZero V2 endpoint.getConfig live reader (using viem).
 *
 * Calls EndpointV2.getConfig(address _oapp, address _lib, uint32 _eid,
 * uint32 _configType) and decodes the returned UlnConfig struct via viem
 * ABI tools. v0.2 of bridge-config-risk uses this as a fallback when the
 * curated seed misses.
 *
 * UlnConfig struct (from LayerZero V2):
 *   uint64 confirmations
 *   uint8 requiredDVNCount
 *   uint8 optionalDVNCount
 *   uint8 optionalDVNThreshold
 *   address[] requiredDVNs
 *   address[] optionalDVNs
 *
 * Encoded as ABI struct ("(uint64,uint8,uint8,uint8,address[],address[])").
 */

import {
  createPublicClient,
  http,
  encodeFunctionData,
  decodeAbiParameters,
  parseAbiParameters,
  type AbiParameter,
} from "viem";
import { mainnet, base, arbitrum, optimism, polygon, bsc, avalanche } from "viem/chains";
import { getEthRpcEndpoints } from "../../lib/eth-rpc-endpoints.js";

const ENDPOINT_V2_BY_CHAIN: Record<string, string> = {
  ethereum: "0x1a44076050125825900e736c501f859c50fE728c",
  base: "0x1a44076050125825900e736c501f859c50fE728c",
  arbitrum: "0x1a44076050125825900e736c501f859c50fE728c",
  optimism: "0x1a44076050125825900e736c501f859c50fE728c",
  polygon: "0x1a44076050125825900e736c501f859c50fE728c",
  bsc: "0x1a44076050125825900e736c501f859c50fE728c",
  avalanche: "0x1a44076050125825900e736c501f859c50fE728c",
};

const SEND_ULN302_BY_CHAIN: Record<string, string> = {
  ethereum: "0xbB2Ea70C9E858123480642Cf96acbcCE1372dCe1",
  base: "0xB5320B0B3a13cC860893E2Bd79FCd7e13484Dda2",
  arbitrum: "0x975bcD720be66659e3EB3C0e4F1866a3020E493A",
  optimism: "0x1322871e4ab09Bc7f5717189434f97bBD9546e95",
  polygon: "0x6c26c61a97006888ea9E4FA36584c7df57Cd9dA3",
  bsc: "0x9F8C645f2D0b2159767Bd6E0839DE4BE49e823DE",
  avalanche: "0x197D1333DEA5Fe0D6600E9b396c7f1B1cFCc558a",
};

const DEFAULT_DST_EID_BY_SRC: Record<string, number> = {
  ethereum: 30184,
  base: 30101,
  arbitrum: 30101,
  optimism: 30101,
  polygon: 30101,
  bsc: 30101,
  avalanche: 30101,
};

const VIEM_CHAIN_BY_NAME: Record<string, unknown> = {
  ethereum: mainnet,
  base,
  arbitrum,
  optimism,
  polygon,
  bsc,
  avalanche,
};

const ULN_CONFIG_TYPE = 2;

const GET_CONFIG_ABI = [
  {
    name: "getConfig",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "_oapp", type: "address" },
      { name: "_lib", type: "address" },
      { name: "_eid", type: "uint32" },
      { name: "_configType", type: "uint32" },
    ],
    outputs: [{ name: "config", type: "bytes" }],
  },
] as const;

const ULN_CONFIG_PARAMS: readonly AbiParameter[] = parseAbiParameters(
  "(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)",
);

export interface UlnConfig {
  confirmations: bigint;
  requiredDVNCount: number;
  optionalDVNCount: number;
  optionalDVNThreshold: number;
  requiredDVNs: string[];
  optionalDVNs: string[];
}

export interface LiveReadResult {
  ok: boolean;
  config?: UlnConfig;
  error?: string;
  endpoint?: string;
  rpc_used?: string;
  destination_eid?: number;
}

function pickRpcUrls(chain: string): string[] {
  if (chain === "ethereum") return getEthRpcEndpoints();
  return [];
}

function decodeConfig(raw: `0x${string}`): UlnConfig | null {
  try {
    const [decoded] = decodeAbiParameters(ULN_CONFIG_PARAMS, raw) as [
      {
        confirmations: bigint;
        requiredDVNCount: number;
        optionalDVNCount: number;
        optionalDVNThreshold: number;
        requiredDVNs: readonly `0x${string}`[];
        optionalDVNs: readonly `0x${string}`[];
      },
    ];
    return {
      confirmations: decoded.confirmations,
      requiredDVNCount: Number(decoded.requiredDVNCount),
      optionalDVNCount: Number(decoded.optionalDVNCount),
      optionalDVNThreshold: Number(decoded.optionalDVNThreshold),
      requiredDVNs: decoded.requiredDVNs.map((a) => a.toLowerCase()),
      optionalDVNs: decoded.optionalDVNs.map((a) => a.toLowerCase()),
    };
  } catch {
    return null;
  }
}

export async function fetchLiveLayerZeroConfig(
  oapp: string,
  chain: string,
): Promise<LiveReadResult> {
  const lower = chain.toLowerCase();
  const endpoint = ENDPOINT_V2_BY_CHAIN[lower];
  const lib = SEND_ULN302_BY_CHAIN[lower];
  const eid = DEFAULT_DST_EID_BY_SRC[lower];
  const viemChain = VIEM_CHAIN_BY_NAME[lower];

  if (!endpoint || !lib || !eid || !viemChain) {
    return { ok: false, error: `Chain ${chain} not configured for live LayerZero read` };
  }

  const callData = encodeFunctionData({
    abi: GET_CONFIG_ABI,
    functionName: "getConfig",
    args: [
      oapp.toLowerCase() as `0x${string}`,
      lib.toLowerCase() as `0x${string}`,
      eid,
      ULN_CONFIG_TYPE,
    ],
  });

  const urls = pickRpcUrls(lower);
  if (urls.length === 0) {
    return { ok: false, error: `No RPC endpoint configured for ${chain}` };
  }

  for (const url of urls) {
    try {
      // viem chain types are narrow; we don't actually need chain-specific
      // behaviour for an eth_call, so we cast to the loosest acceptable shape.
      const client = createPublicClient({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        chain: viemChain as any,
        transport: http(url, { timeout: 5000 }),
      });
      const raw = (await client.call({
        to: endpoint.toLowerCase() as `0x${string}`,
        data: callData,
      })) as { data?: `0x${string}` };
      if (!raw.data || raw.data === "0x") continue;
      const [innerBytes] = decodeAbiParameters(
        parseAbiParameters("bytes"),
        raw.data,
      ) as [`0x${string}`];
      if (!innerBytes || innerBytes === "0x") continue;
      const config = decodeConfig(innerBytes);
      if (config && config.requiredDVNCount + config.optionalDVNCount > 0) {
        return {
          ok: true,
          config,
          endpoint,
          rpc_used: new URL(url).host,
          destination_eid: eid,
        };
      }
    } catch {
      continue;
    }
  }

  return { ok: false, error: "No RPC returned a decodable UlnConfig" };
}
