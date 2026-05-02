/**
 * Admin CLI: populate the rug-bytecode index from a list of known-rug
 * contract addresses.
 *
 * Usage:
 *   npx tsx scripts/populate-rug-bytecodes.ts \
 *     --address 0xabc...:ethereum:squid_game_token:rug_pull:3300000:"Original SQUID rug, Nov 2021" \
 *     --address 0xdef...:ethereum:anubis_dao:rug_pull:60000000:"AnubisDAO Oct 2021"
 *
 * For each address, fetches deployed bytecode via eth_getCode, normalizes
 * (strips Solidity 0.8.x metadata block), SHA-256 hashes it, and prints
 * a TS object you can paste into data/known-rug-bytecodes.ts.
 *
 * Per DEC-20260428-A, all entries should be verified manually from public
 * postmortems before adding to the seed.
 */

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: resolve(__dirname, "../../../.env") });
loadEnv({ path: resolve(__dirname, "../.env") });

import { getEthRpcEndpoints } from "../src/lib/eth-rpc-endpoints.js";

interface ParsedEntry {
  address: string;
  chain: string;
  pattern_name: string;
  classification: string;
  amount_lost_usd_estimate: number | null;
  notes: string;
}

function parseArg(arg: string): ParsedEntry {
  const parts = arg.split(":");
  if (parts.length < 5) {
    throw new Error(
      `Bad --address format. Expected address:chain:pattern_name:classification:amount_usd:notes — got ${arg}`,
    );
  }
  const [address, chain, pattern_name, classification, amountStr, ...rest] = parts;
  const amount = amountStr ? parseInt(amountStr, 10) : NaN;
  return {
    address,
    chain,
    pattern_name,
    classification,
    amount_lost_usd_estimate: Number.isFinite(amount) ? amount : null,
    notes: rest.join(":"),
  };
}

function stripMetadataBlock(bytecode: string): string {
  const hex = bytecode.startsWith("0x") ? bytecode.slice(2) : bytecode;
  if (hex.length < 6) return hex.toLowerCase();
  const lastTwoBytes = hex.slice(-4);
  const len = parseInt(lastTwoBytes, 16);
  if (Number.isNaN(len) || len === 0) return hex.toLowerCase();
  const metadataLen = (len + 2) * 2;
  if (hex.length < metadataLen + 2) return hex.toLowerCase();
  return hex.slice(0, hex.length - metadataLen).toLowerCase();
}

async function fetchCode(rpc: string, address: string): Promise<string | null> {
  try {
    const response = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [address.toLowerCase(), "latest"],
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const result = (await response.json()) as { result?: string; error?: unknown };
    if (result.error) return null;
    return result.result ?? null;
  } catch {
    return null;
  }
}

async function processEntry(entry: ParsedEntry): Promise<void> {
  const endpoints = entry.chain === "ethereum" ? getEthRpcEndpoints() : [];
  if (endpoints.length === 0) {
    console.log(`# SKIP ${entry.address} — no RPC for chain ${entry.chain}`);
    return;
  }

  let code: string | null = null;
  let usedRpc = "";
  for (const rpc of endpoints) {
    code = await fetchCode(rpc, entry.address);
    if (code !== null) {
      usedRpc = new URL(rpc).host;
      break;
    }
  }

  if (!code || code === "0x") {
    console.log(
      `# SKIP ${entry.address} — no bytecode (EOA, self-destructed, or never deployed). Skipped.`,
    );
    return;
  }

  const normalized = stripMetadataBlock(code);
  const hash = createHash("sha256").update(normalized).digest("hex");

  console.log(
    `  // verified via ${usedRpc} on ${new Date().toISOString()}; raw bytecode length ${
      (code.length - 2) / 2
    } bytes; normalized ${normalized.length / 2} bytes`,
  );
  console.log(`  {`);
  console.log(`    bytecode_sha256: "${hash}",`);
  console.log(`    pattern_name: "${entry.pattern_name}",`);
  console.log(`    first_seen_address: "${entry.address}",`);
  console.log(`    first_seen_chain: "${entry.chain}",`);
  console.log(`    first_seen_at: "${new Date().toISOString().slice(0, 10)}",`);
  console.log(`    classification: "${entry.classification}",`);
  console.log(
    `    amount_lost_usd_estimate: ${
      entry.amount_lost_usd_estimate === null ? "null" : entry.amount_lost_usd_estimate
    },`,
  );
  console.log(`    notes: ${JSON.stringify(entry.notes)},`);
  console.log(`  },`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage: npx tsx scripts/populate-rug-bytecodes.ts --address <address>:<chain>:<pattern_name>:<classification>:<amount_usd>:<notes> [--address ...]",
    );
    process.exit(1);
  }

  const entries: ParsedEntry[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--address" && args[i + 1]) {
      entries.push(parseArg(args[i + 1]));
      i++;
    }
  }

  console.log(
    "// Generated by scripts/populate-rug-bytecodes.ts — paste into data/known-rug-bytecodes.ts inside KNOWN_RUG_BYTECODES",
  );
  console.log("// Verify each entry against public postmortems before merging.\n");
  for (const entry of entries) {
    await processEntry(entry);
  }
}

main().catch((err) => {
  console.error("Populate crashed:", err);
  process.exit(1);
});
