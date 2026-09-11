import { registerCapability, type CapabilityInput } from "./index.js";
import { requireAddress } from "./lib/alchemy-client.js";
import { readJsonWithLimit } from "../lib/resource-limits.js";

// Source-code verification status from Sourcify (sourcify.dev), the
// open-source, open-data verification repository that originated at the
// Ethereum Foundation. Rebuilt 2026-09-11 off Etherscan's free API, whose terms
// forbid commercial use. Sourcify publishes no restrictive terms and its whole
// dataset for download; only factual metadata is returned here, never source.
const API = "https://sourcify.dev/server/v2/contract";
export const SOURCIFY_SOURCE_URL = "https://sourcify.dev";

interface SourcifyContract {
  match?: string | null;
  compilation?: {
    name?: string | null;
    compilerVersion?: string | null;
    compilerSettings?: { optimizer?: { enabled?: boolean }; evmVersion?: string | null };
  };
  proxyResolution?: { isProxy?: boolean; implementations?: { address?: string }[] } | null;
}

/** Pure: Strale's output from a Sourcify v2 contract record. Exported for tests. */
export function fromSourcify(address: string, chainId: string, c: SourcifyContract | null) {
  if (!c || !c.match) {
    return {
      contract_address: address,
      chain_id: chainId,
      is_verified: false,
      contract_name: null,
      verification_source: "sourcify",
      note: "Not verified on Sourcify. Contracts verified only on other explorers are not covered.",
    };
  }
  const impl = c.proxyResolution?.implementations?.[0]?.address ?? null;
  return {
    contract_address: address,
    chain_id: chainId,
    is_verified: true,
    contract_name: c.compilation?.name ?? null,
    compiler_version: c.compilation?.compilerVersion ?? null,
    optimization_used: c.compilation?.compilerSettings?.optimizer?.enabled === true,
    license_type: null,
    is_proxy: c.proxyResolution?.isProxy === true,
    implementation_address: impl,
    evm_version: c.compilation?.compilerSettings?.evmVersion ?? null,
    match: c.match,
    verification_source: "sourcify",
  };
}

registerCapability("contract-verify-check", async (input: CapabilityInput) => {
  const address = requireAddress(input.contract_address ?? input.address ?? input.contract, "contract_address");
  const rawChain = String(input.chain_id ?? input.chain ?? "1").trim();
  if (!/^[0-9]{1,12}$/.test(rawChain)) throw new Error(`'chain_id' must be a numeric EVM chain id (1 for Ethereum mainnet); '${rawChain}' is not.`);

  // unguarded-fetch-ok: fixed Sourcify host; address is validated as 0x+40 hex and chain_id as digits before use
  const res = await fetch(`${API}/${rawChain}/${address}?fields=compilation,proxyResolution`, {
    headers: { Accept: "application/json", "User-Agent": "Strale/1.0" },
    signal: AbortSignal.timeout(10000),
  });
  let record: SourcifyContract | null = null;
  if (res.status === 404) {
    record = null;
  } else if (!res.ok) {
    // Sourcify explains refusals (e.g. {"customCode":"unsupported_chain","message":"Chain … not found"}); pass it on.
    const body = await readJsonWithLimit<{ message?: unknown }>(res).catch(() => null);
    const detail = typeof body?.message === "string" ? `: ${body.message.slice(0, 160)}` : ".";
    throw new Error(`Sourcify returned HTTP ${res.status}${detail}`);
  } else {
    record = await readJsonWithLimit<SourcifyContract>(res);
  }
  return {
    output: fromSourcify(address, rawChain, record),
    provenance: { source: "sourcify.dev", source_url: SOURCIFY_SOURCE_URL, fetched_at: new Date().toISOString() },
  };
});
