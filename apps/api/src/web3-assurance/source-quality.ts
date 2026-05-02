/**
 * Web3 Assurance — upstream source quality tracker.
 *
 * Per Tier-2 moat in the 2026-05-01 strategic deep-dive: every Web3 Assurance
 * call records latency + success for every upstream source it touches. Over
 * thousands of calls, Strale accumulates proprietary quality data on every
 * external API/MCP it consumes (GoPlus, DefiLlama, Sourcify, Etherscan,
 * Tenderly, EAS, ScamSniffer, etc.). Competitors can't catch up without
 * the same call-history dataset.
 *
 * v0.1 storage: in-memory ring buffer per source. Survives until process
 * restart. v0.2 will move to persistent storage (Postgres) and surface
 * historical SQS via a public endpoint that becomes a category-defining
 * artifact (vendors compete on Strale's score; consumers pick MCPs by it).
 *
 * Scoring methodology mirrors Strale's existing SQS engine (lib/sqs.ts):
 *   - Rolling window of last N calls per source (default: 100)
 *   - Per-source: success_rate, p50_ms, p95_ms, p99_ms, last_ok_at
 *   - Composite score 0..100 derived from success_rate × latency_grade
 *
 * Designed to be append-only and concurrency-safe (single Node process,
 * synchronous push). For multi-worker scale, will move to a shared store.
 */

const RING_SIZE = 100;

interface CallRecord {
  ms: number;
  ok: boolean;
  ts: number;
}

interface RingBuffer {
  records: CallRecord[];
  head: number;
  size: number;
}

const sourceRings = new Map<string, RingBuffer>();

function getOrCreateRing(source: string): RingBuffer {
  let ring = sourceRings.get(source);
  if (!ring) {
    ring = { records: new Array(RING_SIZE), head: 0, size: 0 };
    sourceRings.set(source, ring);
  }
  return ring;
}

export function recordSourceCall(source: string, ms: number, ok: boolean): void {
  const ring = getOrCreateRing(source);
  ring.records[ring.head] = { ms, ok, ts: Date.now() };
  ring.head = (ring.head + 1) % RING_SIZE;
  if (ring.size < RING_SIZE) ring.size += 1;
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(sorted.length * pct)),
  );
  return sorted[idx];
}

function gradeLatency(p95: number): number {
  if (p95 < 200) return 100;
  if (p95 < 500) return 90;
  if (p95 < 1000) return 75;
  if (p95 < 2000) return 60;
  if (p95 < 5000) return 40;
  return 20;
}

export interface SourceSqs {
  source: string;
  sample_size: number;
  success_rate: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  last_ok_at: string | null;
  last_fail_at: string | null;
  composite_score: number;
}

export function getSourceSqs(source: string): SourceSqs | null {
  const ring = sourceRings.get(source);
  if (!ring || ring.size === 0) return null;

  const records = ring.records.slice(0, ring.size);
  const okCount = records.filter((r) => r.ok).length;
  const successRate = okCount / ring.size;

  const sortedLatencies = records.map((r) => r.ms).sort((a, b) => a - b);
  const p50 = percentile(sortedLatencies, 0.5);
  const p95 = percentile(sortedLatencies, 0.95);
  const p99 = percentile(sortedLatencies, 0.99);

  const lastOk = records.filter((r) => r.ok).sort((a, b) => b.ts - a.ts)[0];
  const lastFail = records.filter((r) => !r.ok).sort((a, b) => b.ts - a.ts)[0];

  const composite = Math.round(successRate * 100 * 0.7 + gradeLatency(p95) * 0.3);

  return {
    source,
    sample_size: ring.size,
    success_rate: Math.round(successRate * 1000) / 1000,
    p50_ms: p50,
    p95_ms: p95,
    p99_ms: p99,
    last_ok_at: lastOk ? new Date(lastOk.ts).toISOString() : null,
    last_fail_at: lastFail ? new Date(lastFail.ts).toISOString() : null,
    composite_score: composite,
  };
}

export function getAllSourceSqs(): SourceSqs[] {
  return Array.from(sourceRings.keys())
    .map((s) => getSourceSqs(s))
    .filter((s): s is SourceSqs => s !== null)
    .sort((a, b) => b.sample_size - a.sample_size);
}

export function resetSourceQuality(): void {
  sourceRings.clear();
}
