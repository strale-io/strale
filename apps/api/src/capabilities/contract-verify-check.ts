import { registerCapability, type CapabilityInput } from "./index.js";
import { etherscanFetch } from "./lib/etherscan-client.js";

registerCapability("contract-verify-check", async (input: CapabilityInput) => {
  const contractAddress = (
    (input.contract_address as string) ??
    (input.address as string) ??
    (input.contract as string) ??
    ""
  ).trim();
  if (!contractAddress) throw new Error("'contract_address' is required. Provide a smart contract address (0x...).");
  if (contractAddress.length < 10) throw new Error("'contract_address' must be a valid contract address.");

  const chainId = ((input.chain_id as string) ?? (input.chain as string) ?? "1").trim();

  const data = await etherscanFetch({
    chainid: chainId,
    module: "contract",
    action: "getsourcecode",
    address: contractAddress,
  });

  const now = new Date().toISOString();

  if (data.status === "0" || !data.result || data.result.length === 0) {
    return {
      output: {
        contract_address: contractAddress,
        chain_id: chainId,
        is_verified: false,
        contract_name: null,
        note: "Could not retrieve contract data.",
      },
      provenance: { source: "etherscan.io", fetched_at: now },
    };
  }

  const entry = data.result[0];
  const isVerified = !!entry.SourceCode && entry.SourceCode !== "";

  return {
    output: {
      contract_address: contractAddress,
      chain_id: chainId,
      is_verified: isVerified,
      contract_name: entry.ContractName || null,
      compiler_version: entry.CompilerVersion || null,
      optimization_used: entry.OptimizationUsed === "1",
      license_type: entry.LicenseType || null,
      is_proxy: entry.Proxy === "1",
      implementation_address: entry.Implementation || null,
      evm_version: entry.EVMVersion || null,
    },
    provenance: { source: "etherscan.io", fetched_at: now },
  };
});
