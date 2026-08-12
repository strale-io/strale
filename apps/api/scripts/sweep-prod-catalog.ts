/**
 * Production catalog verification sweep (Readiness program, P0 — DEC-20260812-A).
 *
 *   npx tsx scripts/sweep-prod-catalog.ts [--limit N] [--only slug1,slug2] [--resume path.jsonl]
 *
 * For every active capability, makes ONE REAL PRODUCTION CALL through
 * POST /v1/do with the internal test account, then checks the capability's
 * declared known_answer assertions against the actual production output.
 *
 * WHY THIS EXISTS: six defects in the 2026-08 sessions (fabricated phones,
 * unicode-escape emails, wrong-company registry resolution, wrong HTTP method,
 * route schema gates) all passed every local gate and were caught only by real
 * production calls with output values read. Origins serve different bytes by
 * region and User-Agent; Railway US East is not a Swedish laptop. The local
 * sweep (sweep-paid-fixtures.ts) verifies executor logic; THIS verifies what
 * customers actually receive.
 *
 * COST CONTROLS (per DEC-20260812-A, confirmed by Petter 2026-08-12):
 *   - External-cost budget cap: cumulative test_suites.external_cost_cents of
 *     executed calls ≤ BUDGET_CAP_CENTS (€25). Calls beyond it are recorded
 *     as BUDGET_STOPPED, never made.
 *   - DENYLIST: metered/expensive vendors are never called; extend the list,
 *     never empty it (mirrors sweep-paid-fixtures.ts).
 *   - Wallet debits are internal ledger money (test account), not real spend;
 *     the cap governs real vendor COGS.
 *   - Rate: bounded concurrency + inter-launch delay, far under the 10 req/s
 *     per-key limit.
 *
 * Analytics safety: the test account is on the internal-account exclusion
 * list, so sweep traffic does not pollute demand/usage analysis.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
config({ path: resolve(import.meta.dirname, "../../../.env") });

const PROD = process.env.SWEEP_BASE_URL ?? "https://strale-production.up.railway.app";
const API_KEY = process.env.SWEEP_API_KEY ?? process.env.STRALE_TEST_API_KEY ?? "";
const BUDGET_CAP_CENTS = Number(process.env.SWEEP_BUDGET_CAP_CENTS ?? 2500);
// Default 1: paid calls on a single wallet serialize on the SELECT FOR UPDATE
// row lock — at concurrency 3 the sweep's own siblings produce wallet-contention
// 503s ("Wallet was contended by a concurrent request"), polluting results.
const CONCURRENCY = Number(process.env.SWEEP_CONCURRENCY ?? 1);
const LAUNCH_DELAY_MS = Number(process.env.SWEEP_LAUNCH_DELAY_MS ?? 800);
const SYNC_TIMEOUT_MS = 70_000;
const ASYNC_POLL_INTERVAL_MS = 3_000;
const ASYNC_POLL_BUDGET_MS = 180_000;
const WALLET_FLOOR_CENTS = 300;

// Metered or expensive vendors — deliberately NOT swept. Extend, never empty.
// Kept in sync with sweep-paid-fixtures.ts (same list, same reasons).
const DENYLIST = new Map<string, string>([
  ["us-company-data-cobalt", "Cobalt Intelligence, €2.00/call"],
  ["us-ein-match", "€0.75/call"],
  ["us-sec-filings-extended", "€0.25/call, paired with the Cobalt stack"],
  ["uk-cop-check", "Pay.UK CoP via eSortcode — metered scheme access"],
  ["pep-check", "Dilisense — informal Starter-tier grace, do not burn quota"],
  ["sanctions-check", "Dilisense — same"],
  ["adverse-media-check", "Dilisense — same"],
]);

type Outcome =
  | "PASS"                // completed in prod, all declared assertions hold
  | "FIXTURE_FAIL"        // completed in prod, one or more assertions fail
  | "ROUTE_REJECTED"      // 4xx before execution — the #168/#173 schema-gate class
  | "EXEC_FAIL_ENV"       // execution failed; message suggests missing prod config
  | "EXEC_FAIL_UPSTREAM"  // execution failed; upstream/vendor/logic error
  | "ASYNC_TIMEOUT"       // 202 accepted but no terminal status within budget
  | "DENYLISTED"
  | "BUDGET_STOPPED"
  | "WALLET_LOW"
  | "HTTP_OTHER";

interface Row {
  slug: string;
  outcome: Outcome;
  detail: string;
  failedChecks?: string[];
  ms?: number;
  http?: number;
  transaction_id?: string;
  price_cents?: number;
  external_cost_cents?: number;
}

function getPath(o: any, p: string): any {
  return p.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o);
}

function runChecks(out: any, validationRules: any): { total: number; failed: string[] } {
  const checks: any[] = validationRules?.checks ?? validationRules?.expected_fields ?? [];
  const failed: string[] = [];
  for (const c of checks) {
    const field = c.field ?? c.name;
    const op = c.operator ?? "not_null";
    const v = getPath(out, field);
    let ok: boolean;
    if (op === "not_null") ok = v !== null && v !== undefined;
    else if (op === "type") {
      ok = c.value === "array" ? Array.isArray(v)
        : c.value === "object" ? typeof v === "object" && v !== null && !Array.isArray(v)
        : typeof v === c.value;
    } else if (op === "equals") ok = JSON.stringify(v) === JSON.stringify(c.value);
    else if (op === "contains") {
      ok = typeof v === "string" ? v.toLowerCase().includes(String(c.value).toLowerCase())
        : Array.isArray(v) ? v.some((x) => JSON.stringify(x).toLowerCase().includes(String(c.value).toLowerCase()))
        : false;
    } else ok = v !== null && v !== undefined;
    if (!ok) failed.push(`${field}[${op}${c.value !== undefined ? "=" + JSON.stringify(c.value) : ""}] got ${JSON.stringify(v)?.slice(0, 80)}`);
  }
  return { total: checks.length, failed };
}

function classifyExecError(msg: string): Outcome {
  const m = (msg ?? "").toLowerCase();
  if (/is required|not set|not configured|missing.*key|no api key|api key|credential/.test(m)) return "EXEC_FAIL_ENV";
  return "EXEC_FAIL_UPSTREAM";
}

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<{ http: number; body: any }> {
  const resp = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  let body: any = null;
  try { body = await resp.json(); } catch { /* non-JSON body */ }
  return { http: resp.status, body };
}

async function main() {
  if (!API_KEY) {
    console.error("Set STRALE_TEST_API_KEY (or SWEEP_API_KEY) in the environment. Refusing to run without it.");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const onlyIdx = args.indexOf("--only");
  const only = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(",")) : null;
  const resumeIdx = args.indexOf("--resume");
  const done = new Set<string>();
  let carriedSpendCents = 0;
  if (resumeIdx >= 0 && existsSync(args[resumeIdx + 1])) {
    // Keep the LAST record per slug. Transient outcomes (wallet contention,
    // transport errors, wallet/budget stops) are retried; terminal ones skip.
    const RETRYABLE = new Set(["HTTP_OTHER", "WALLET_LOW", "BUDGET_STOPPED"]);
    const NO_CALL_MADE = new Set(["DENYLISTED", "BUDGET_STOPPED", "WALLET_LOW"]);
    const last = new Map<string, any>();
    for (const line of readFileSync(args[resumeIdx + 1], "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); last.set(r.slug, r); } catch { /* skip malformed */ }
    }
    for (const [slug, r] of last) {
      if (!RETRYABLE.has(r.outcome)) done.add(slug);
      // Budget accounting survives restarts: count external cost of every
      // record that actually made a call (terminal or not — retries re-spend).
      if (!NO_CALL_MADE.has(r.outcome)) carriedSpendCents += r.external_cost_cents ?? 0;
    }
    console.log(`resume: ${done.size} slugs terminal (skipped), ${last.size - done.size} retryable; carried spend ${carriedSpendCents}c`);
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

  const caps = await sql<{
    slug: string; cost_class: string; price_cents: number;
    input: any; validation_rules: any; external_cost_cents: number | null;
  }[]>`
    SELECT DISTINCT ON (c.slug)
      c.slug, c.cost_class, c.price_cents,
      ts.input, ts.validation_rules, ts.external_cost_cents
    FROM capabilities c
    JOIN test_suites ts ON ts.capability_slug = c.slug
    WHERE c.is_active = true
      AND ts.test_type = 'known_answer' AND ts.active = true
    ORDER BY c.slug, ts.id`;
  await sql.end();

  let queue = caps.filter((c) => !done.has(c.slug));
  if (only) queue = queue.filter((c) => only.has(c.slug));
  queue = queue.slice(0, limit);

  const day = new Date().toISOString().slice(0, 10);
  const outPath = resolve(import.meta.dirname, `../../../audit-output/prod-sweep-${day}.jsonl`);
  mkdirSync(dirname(outPath), { recursive: true });

  console.log(`sweeping ${queue.length} capabilities against ${PROD}`);
  console.log(`budget cap: €${(BUDGET_CAP_CENTS / 100).toFixed(2)} external cost; denylist: ${DENYLIST.size}; output: ${outPath}\n`);

  let externalSpentCents = carriedSpendCents;
  let walletLow = false;
  const results: Row[] = [];
  let cursor = 0;

  function record(r: Row) {
    results.push(r);
    appendFileSync(outPath, JSON.stringify({ ...r, ts: new Date().toISOString() }) + "\n");
    const n = results.length;
    if (n % 25 === 0) console.log(`  … ${n}/${queue.length} (ext spend €${(externalSpentCents / 100).toFixed(2)})`);
  }

  async function sweepOne(cap: (typeof caps)[number]): Promise<void> {
    const { slug, price_cents, input, validation_rules } = cap;
    const extCost = cap.external_cost_cents ?? 0;

    if (DENYLIST.has(slug)) return record({ slug, outcome: "DENYLISTED", detail: DENYLIST.get(slug)! });
    if (walletLow) return record({ slug, outcome: "WALLET_LOW", detail: "test wallet under floor; top up and --resume" });
    if (externalSpentCents + extCost > BUDGET_CAP_CENTS)
      return record({ slug, outcome: "BUDGET_STOPPED", detail: `would exceed cap (spent ${externalSpentCents}c, this ${extCost}c)` });

    // Count the external cost when we commit to the call, not after — a
    // hung request must not let siblings race past the cap.
    externalSpentCents += extCost;

    const t0 = Date.now();
    let http = 0, body: any = null;
    // 429 (rate limit) and wallet-contention 503 are transient artifacts of the
    // sweep itself, not capability verdicts — retry in-run with backoff.
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        ({ http, body } = await fetchJson(`${PROD}/v1/do`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `p0-sweep-${randomUUID()}`,
          },
          body: JSON.stringify({
            capability_slug: slug,
            inputs: input ?? {},
            max_price_cents: Math.max(price_cents, 1),
          }),
        }, SYNC_TIMEOUT_MS));
      } catch (e: any) {
        return record({ slug, outcome: "HTTP_OTHER", detail: `transport: ${e?.message ?? e}`.slice(0, 150), ms: Date.now() - t0, external_cost_cents: extCost });
      }
      const contended = http === 503 && /contended/i.test(String(body?.message ?? ""));
      // 502 = Railway edge/instance blip ("Application failed to respond"),
      // observed as one-off ~130ms failures on random slugs — retry those too.
      if (http !== 429 && http !== 502 && !contended) break;
      const hinted = Number(/in (\d+) second/.exec(String(body?.message ?? ""))?.[1]);
      await new Promise((r) => setTimeout(r, (Number.isFinite(hinted) && hinted > 0 ? hinted : 3) * 1000 + 500));
    }

    const base = { ms: Date.now() - t0, http, price_cents, external_cost_cents: extCost };

    if (http === 400 || http === 422) {
      return record({ slug, outcome: "ROUTE_REJECTED", detail: `${body?.error_code ?? http}: ${String(body?.message ?? "").slice(0, 140)}`, ...base });
    }
    if (http === 402) {
      walletLow = true;
      return record({ slug, outcome: "WALLET_LOW", detail: "insufficient balance", ...base });
    }

    let status: string | undefined = body?.result?.status;
    let output: any = body?.result?.output;
    let errMsg: string = body?.result?.error ?? body?.message ?? "";
    let txnId: string | undefined = body?.result?.transaction_id;

    if (http === 202 && txnId) {
      const deadline = Date.now() + ASYNC_POLL_BUDGET_MS;
      status = "executing";
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, ASYNC_POLL_INTERVAL_MS));
        try {
          const poll = await fetchJson(`${PROD}/v1/transactions/${txnId}`, {
            headers: { "Authorization": `Bearer ${API_KEY}` },
          }, 15_000);
          status = poll.body?.status ?? status;
          if (status === "completed") { output = poll.body?.output; break; }
          if (status === "failed") { errMsg = poll.body?.error ?? "failed"; break; }
        } catch { /* transient poll error; keep polling until deadline */ }
      }
      if (status !== "completed" && status !== "failed") {
        return record({ slug, outcome: "ASYNC_TIMEOUT", detail: `still '${status}' after ${ASYNC_POLL_BUDGET_MS / 1000}s`, transaction_id: txnId, ...base, ms: Date.now() - t0 });
      }
    } else if (http !== 200) {
      return record({ slug, outcome: "HTTP_OTHER", detail: `HTTP ${http}: ${String(body?.message ?? JSON.stringify(body) ?? "").slice(0, 140)}`, ...base });
    }

    if (status === "failed" || (http === 200 && status !== "completed" && !output)) {
      const msg = String(errMsg || `status=${status}`);
      return record({ slug, outcome: classifyExecError(msg), detail: msg.slice(0, 160), transaction_id: txnId, ...base, ms: Date.now() - t0 });
    }

    const { total, failed } = runChecks(output ?? {}, validation_rules);
    if (failed.length) {
      return record({ slug, outcome: "FIXTURE_FAIL", detail: `${total - failed.length}/${total} checks passed`, failedChecks: failed, transaction_id: txnId, ...base, ms: Date.now() - t0 });
    }
    record({ slug, outcome: "PASS", detail: `${total}/${total} checks passed`, transaction_id: txnId, ...base, ms: Date.now() - t0 });
  }

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= queue.length) return;
      await new Promise((r) => setTimeout(r, LAUNCH_DELAY_MS));
      await sweepOne(queue[i]);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  results.sort((a, b) => a.slug.localeCompare(b.slug));
  const order: Outcome[] = ["FIXTURE_FAIL", "ROUTE_REJECTED", "EXEC_FAIL_ENV", "EXEC_FAIL_UPSTREAM", "ASYNC_TIMEOUT", "HTTP_OTHER", "WALLET_LOW", "BUDGET_STOPPED", "DENYLISTED", "PASS"];
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;

  console.log("\n=== SUMMARY ===");
  for (const o of order) if (counts[o]) console.log(`${o.padEnd(20)} ${counts[o]}`);
  console.log(`external cost spent: €${(externalSpentCents / 100).toFixed(2)} of €${(BUDGET_CAP_CENTS / 100).toFixed(2)}`);

  for (const o of order) {
    if (o === "PASS" || o === "DENYLISTED") continue;
    const rows = results.filter((r) => r.outcome === o);
    if (!rows.length) continue;
    console.log(`\n=== ${o} (${rows.length}) ===`);
    for (const r of rows) {
      console.log(`${r.slug} — ${r.detail}${r.ms ? ` (${r.ms}ms)` : ""}`);
      for (const f of r.failedChecks ?? []) console.log(`    ✗ ${f}`);
    }
  }
}

main();
