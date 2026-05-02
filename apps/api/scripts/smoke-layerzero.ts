/**
 * Smoke for the live LayerZero V2 endpoint.getConfig reader.
 * Hits a known non-seed OApp and verifies the decoder produces a
 * sane UlnConfig. Targets:
 *   - Stargate V2 USDC OFT on Ethereum (well-known, multi-DVN)
 *   - PancakeSwap CAKE OFT on Ethereum
 */

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: resolve(__dirname, "../../../.env") });
loadEnv({ path: resolve(__dirname, "../.env") });

import { fetchLiveLayerZeroConfig } from "../src/web3-assurance/lib/layerzero-config.js";

const TARGETS: Array<{ label: string; address: string; chain: string }> = [
  {
    label: "Stargate V2 USDC OFT (Ethereum) — well-known, expect multi-DVN",
    address: "0x77b2043768d28e9c9aB44e1aBfC95944bcE57931",
    chain: "ethereum",
  },
  {
    label: "PancakeSwap CAKE OFT (Ethereum) — established LayerZero OApp",
    address: "0x152649eA73beAb28c5b49B26eb48f7EAD6d4c898",
    chain: "ethereum",
  },
];

async function main(): Promise<void> {
  console.log("LayerZero V2 endpoint.getConfig live-read smoke");
  console.log("=".repeat(80));
  for (const { label, address, chain } of TARGETS) {
    console.log(`\n▶ ${label}`);
    console.log(`  address: ${address}`);
    console.log(`  chain:   ${chain}`);
    const t0 = Date.now();
    const result = await fetchLiveLayerZeroConfig(address, chain);
    const ms = Date.now() - t0;
    if (result.ok && result.config) {
      const c = result.config;
      console.log(`  ✓ live read succeeded in ${ms}ms via ${result.rpc_used}`);
      console.log(`    confirmations:           ${c.confirmations}`);
      console.log(`    requiredDVNCount:        ${c.requiredDVNCount}`);
      console.log(`    optionalDVNCount:        ${c.optionalDVNCount}`);
      console.log(`    optionalDVNThreshold:    ${c.optionalDVNThreshold}`);
      console.log(`    requiredDVNs (${c.requiredDVNs.length}):`);
      for (const a of c.requiredDVNs) console.log(`      ${a}`);
      console.log(`    optionalDVNs (${c.optionalDVNs.length}):`);
      for (const a of c.optionalDVNs) console.log(`      ${a}`);
      const isSpof = c.requiredDVNCount === 1 && c.optionalDVNCount === 0;
      console.log(`    SPOF classification:     ${isSpof ? "CRITICAL" : "redundant"}`);
    } else {
      console.log(`  ✗ live read FAILED in ${ms}ms`);
      console.log(`    error: ${result.error ?? "unknown"}`);
    }
  }
  console.log(`\n${"=".repeat(80)}\nSmoke complete.`);
}

main().catch((err) => {
  console.error("Smoke crashed:", err);
  process.exit(1);
});
