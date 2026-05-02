/**
 * Smoke test for Web3 Assurance — calls compose() + computeVerdict()
 * against real chain data. Bypasses the HTTP/auth layer so we can validate
 * the full stack against live free APIs without spinning up the server.
 *
 * Run: npx tsx scripts/smoke-web3a.ts
 */

import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
loadEnv({ path: resolve(__dirname, "../../../.env") });
loadEnv({ path: resolve(__dirname, "../.env") });

import { autoRegisterCapabilities } from "../src/capabilities/auto-register.js";
import { compose, computeVerdict, getEvaluators } from "../src/web3-assurance/index.js";
import { buildExplanationChain } from "../src/web3-assurance/explanation.js";
import type { Web3AssuranceRequest } from "../src/web3-assurance/types.js";

const TARGETS: Array<{ label: string; req: Web3AssuranceRequest }> = [
  {
    label: "Vitalik's wallet (active EOA, expect proceed)",
    req: { target: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", target_type: "wallet", chain: "ethereum" },
  },
  {
    label: "Tornado Cash router (delisted mixer, expect graded flag)",
    req: { target: "0x8589427373d6d84e98730d7795d8f6f8731fda16", target_type: "wallet", chain: "ethereum" },
  },
  {
    label: "USDC contract (well-known token, expect proceed)",
    req: { target: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", target_type: "token", chain: "ethereum" },
  },
  {
    label: "Aave protocol slug (expect DefiLlama hit, well-audited)",
    req: { target: "aave", target_type: "protocol", chain: "ethereum" },
  },
  {
    label: "KelpDAO OApp (1-of-1 DVN, expect BLOCK + explanation_chain)",
    req: { target: "0xa1290d69c65a6fe4df752f95823fae25cb99e5a7", target_type: "bridge", chain: "ethereum" },
  },
];

function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function trunc(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function runOne(label: string, req: Web3AssuranceRequest): Promise<void> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`▶ ${label}`);
  console.log(`  target: ${req.target}`);
  console.log(`  type:   ${req.target_type}`);
  console.log(`  chain:  ${req.chain}`);

  const t0 = Date.now();
  const composed = await compose(req);
  const elapsed = Date.now() - t0;
  const verdict = computeVerdict(composed);

  console.log(`\n  ▸ Composer ran ${composed.results.length} evaluators in ${fmtMs(elapsed)}`);
  console.log(`  ▸ ok: ${composed.results.filter((r) => r.ok).length} / failed: ${composed.results.filter((r) => !r.ok).length}\n`);

  for (const r of composed.results) {
    const status = r.ok ? "✓" : "✗";
    const summary = (() => {
      if (!r.ok) return `error: ${trunc(r.error ?? "", 60)}`;
      const ev = r.evidence ?? {};
      const keys = Object.keys(ev);
      if (keys.length === 0) return "(empty evidence)";
      const sample = keys.slice(0, 4).map((k) => {
        const v = (ev as Record<string, unknown>)[k];
        if (v == null) return `${k}=null`;
        if (typeof v === "boolean" || typeof v === "number") return `${k}=${v}`;
        if (typeof v === "string") return `${k}="${trunc(v, 30)}"`;
        if (Array.isArray(v)) return `${k}=[${v.length}]`;
        return `${k}={…}`;
      });
      return sample.join(", ");
    })();
    console.log(`    ${status} ${r.evaluator.padEnd(28)} ${fmtMs(r.ms).padStart(7)}  ${summary}`);
  }

  console.log(`\n  ▸ VERDICT: ${verdict.verdict.toUpperCase()} (confidence ${verdict.confidence})`);
  console.log(`  ▸ completeness:  ${verdict.evidence_completeness}`);
  console.log(`  ▸ corroboration: ${verdict.evidence_status}`);
  if (verdict.critical_flags.length > 0) {
    console.log(`  ▸ flags:         ${verdict.critical_flags.join(", ")}`);
  }
  if (verdict.reason_codes.length > 0) {
    console.log(`  ▸ reason_codes:  ${verdict.reason_codes.join(", ")}`);
  }
  console.log(`  ▸ action:        ${trunc(verdict.suggested_action, 200)}`);

  const chain = buildExplanationChain(composed, verdict);
  if (chain.length > 0) {
    console.log(`\n  ▸ explanation_chain (${chain.length} link${chain.length === 1 ? "" : "s"}):`);
    for (const link of chain) {
      console.log(`    • [${link.severity}] ${link.reason_code}`);
      console.log(`        from: ${link.source_evaluator}`);
      console.log(`        why:  ${trunc(link.why, 220)}`);
      const evKeys = Object.keys(link.evidence_excerpt);
      if (evKeys.length > 0) {
        console.log(`        excerpt keys: ${evKeys.join(", ")}`);
      }
    }
  }
}

async function main(): Promise<void> {
  await autoRegisterCapabilities();
  const evaluators = getEvaluators();
  console.log(`Web3 Assurance smoke test`);
  console.log(`${evaluators.length} evaluators registered: ${evaluators.map((e) => e.name).join(", ")}`);

  for (const { label, req } of TARGETS) {
    try {
      await runOne(label, req);
    } catch (err) {
      console.error(`\n  ✗ Smoke failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`\n${"=".repeat(80)}\nSmoke complete.\n`);
}

main().catch((err) => {
  console.error("Smoke crashed:", err);
  process.exit(1);
});
