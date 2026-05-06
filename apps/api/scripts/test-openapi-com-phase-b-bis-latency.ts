/**
 * Phase B-bis latency probe — 10 calls @ concurrency=10.
 *
 * Phase A serial baseline (sandbox) showed p50 1.6-2.6s. Step 2 production
 * verify showed first-call latency 9028ms; later sweep calls 1.5-7.5s.
 * This probe quantifies the concurrency=10 distribution against WW-Start.
 *
 * Threshold: prompt flags sync-flow concern if concurrency=10 p95 > 5s.
 *
 * Cost: 10 × €0.06 = €0.60.
 *
 * Entities are 10 distinct (country, identifier) pairs across the Phase B-bis
 * findings, mixing 200-returning and 204-returning queries to avoid Openapi-
 * side response caching skewing the measurement.
 */

import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { OpenapiClient } from "../src/lib/vendors/openapi-com/client.js";
import type { OpenapiResult } from "../src/lib/vendors/openapi-com/types.js";

config({ path: resolve(import.meta.dirname, "../../../.env") });
const ENV_KEYS = ["OPENAPI_COM_API_TOKEN_PROD", "OPENAPI_COM_EMAIL"];
if (!process.env.OPENAPI_COM_API_TOKEN_PROD) {
  try {
    const buf = readFileSync(resolve(import.meta.dirname, "../../../.env"));
    const text = buf.toString("utf16le");
    const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
    for (const line of clean.split(/\r?\n/)) {
      const eq = line.indexOf("=");
      if (eq > 0) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        if (ENV_KEYS.includes(k) && !process.env[k]) process.env[k] = v;
      }
    }
  } catch {
    /* .env missing is fine */
  }
}

const FIXTURE_DIR = resolve(
  import.meta.dirname,
  "../../../docs/research/2026-05-06-openapi-phase-b-fixtures",
);
mkdirSync(FIXTURE_DIR, { recursive: true });

interface Probe {
  country: string;
  id: string;
  expected: 200 | 204;
}

// 10 distinct (country, identifier) pairs from Phase B-bis findings.
const PROBES: Probe[] = [
  { country: "DE", id: "DE811115368", expected: 200 },
  { country: "BG", id: "831902088", expected: 200 },
  { country: "HU", id: "HU10625790", expected: 200 },
  { country: "NL", id: "NL821218833B01", expected: 204 },
  { country: "SI", id: "SI82646716", expected: 204 },
  { country: "LU", id: "LU22850926", expected: 204 },
  { country: "SK", id: "SK2020481748", expected: 204 },
  { country: "MT", id: "MT16234415", expected: 204 },
  { country: "CY", id: "CY10006578D", expected: 204 },
  { country: "FR", id: "542051180", expected: 200 }, // TotalEnergies — Phase A live-overlap entity
];

function percentile(xs: number[], p: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo]!;
  const w = rank - lo;
  return sorted[lo]! * (1 - w) + sorted[hi]! * w;
}

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("Phase B-bis latency probe — 10 calls @ concurrency=10\n");

  if (!process.env.OPENAPI_COM_API_TOKEN_PROD) {
    // eslint-disable-next-line no-console
    console.error("OPENAPI_COM_API_TOKEN_PROD is not set. Halt.");
    process.exit(1);
  }

  const client = new OpenapiClient("production");

  // Pre-warm token. Otherwise the first call's latency includes a 300ms
  // token mint, which contaminates the concurrency-only measurement.
  // eslint-disable-next-line no-console
  console.log("Pre-warming token (single light call against WW-Start)...");
  // Use a 2nd call to a known-200 to ensure cached token is valid for the
  // concurrent burst that follows.
  await client.wwStart("DE", "DE811115368");

  // eslint-disable-next-line no-console
  console.log("Firing 10 concurrent calls...\n");
  const startedAt = Date.now();
  const results = await Promise.all(
    PROBES.map((p) => client.wwStart(p.country, p.id)),
  );
  const totalMs = Date.now() - startedAt;

  const latencies = results.map((r) => r.latencyMs);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const max = Math.max(...latencies);
  const min = Math.min(...latencies);

  // eslint-disable-next-line no-console
  console.log("Per-call results:");
  results.forEach((r, i) => {
    const probe = PROBES[i]!;
    // eslint-disable-next-line no-console
    console.log(
      `  ${r.ok ? "✓" : "✗"} ${probe.country.padEnd(2)} ${probe.id.padEnd(20)} → ${r.status} (${r.latencyMs}ms)${r.error ? ` [${r.error}]` : ""}`,
    );
  });

  // eslint-disable-next-line no-console
  console.log(`\nLatency distribution (concurrency=10, n=10, total wall-clock=${totalMs}ms):`);
  // eslint-disable-next-line no-console
  console.log(`  min ${min}ms`);
  // eslint-disable-next-line no-console
  console.log(`  p50 ${p50.toFixed(0)}ms`);
  // eslint-disable-next-line no-console
  console.log(`  p95 ${p95.toFixed(0)}ms`);
  // eslint-disable-next-line no-console
  console.log(`  max ${max}ms`);

  const SYNC_THRESHOLD_MS = 5000;
  if (p95 > SYNC_THRESHOLD_MS) {
    // eslint-disable-next-line no-console
    console.log(`\nSYNC-FLOW CONCERN: p95 ${p95.toFixed(0)}ms exceeds ${SYNC_THRESHOLD_MS}ms threshold.`);
  } else {
    // eslint-disable-next-line no-console
    console.log(`\nSync flow OK: p95 ${p95.toFixed(0)}ms within ${SYNC_THRESHOLD_MS}ms threshold.`);
  }

  // Also note: pre-warm call cost an additional €0.06.
  // eslint-disable-next-line no-console
  console.log(`\nLatency probe spend: 11 × €0.06 = €0.66 (10 probes + 1 pre-warm).`);

  // Persist machine-readable summary.
  writeFileSync(
    resolve(FIXTURE_DIR, "phase-b-bis-latency-summary.json"),
    JSON.stringify(
      {
        runStartedAt: new Date(startedAt).toISOString(),
        concurrency: 10,
        n: 10,
        totalWallClockMs: totalMs,
        latencyMs: { min, p50, p95, max },
        syncFlowThresholdMs: SYNC_THRESHOLD_MS,
        syncFlowConcern: p95 > SYNC_THRESHOLD_MS,
        spendEur: 0.66,
        results: results.map((r, i) => ({
          country: PROBES[i]!.country,
          id: PROBES[i]!.id,
          expected: PROBES[i]!.expected,
          status: r.status,
          ok: r.ok,
          error: r.error,
          latencyMs: r.latencyMs,
        })) as Array<{
          country: string;
          id: string;
          expected: 200 | 204;
          status: number;
          ok: boolean;
          error: OpenapiResult["error"];
          latencyMs: number;
        }>,
      },
      null,
      2,
    ),
    "utf8",
  );
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("\nFATAL:", err instanceof Error ? err.message : err);
  process.exit(1);
});
