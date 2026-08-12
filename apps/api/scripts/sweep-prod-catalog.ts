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
 *   - External-cost budget cap: cumulative declared external_cost_cents of
 *     issued call attempts ≤ BUDGET_CAP_CENTS (€25). This is an ESTIMATE from
 *     test_suites metadata, not a measurement; paid-class capabilities that
 *     declare 0/NULL are charged a conservative 1c per attempt against the cap.
 *   - DENYLIST: metered/expensive vendors are never called; extend the list,
 *     never empty it (mirrors sweep-paid-fixtures.ts — keep the two in sync).
 *   - Wallet debits are internal ledger money (test account), not real spend;
 *     the cap governs real vendor COGS.
 *   - Rate: bounded concurrency + inter-launch delay, far under the 10 req/s
 *     per-key limit. Transient 429/502/wallet-contention responses are retried
 *     in-run; MAX_TRANSIENT_ATTEMPTS bounds total attempts per slug so the
 *     sweep can never trip the 3-consecutive-failure circuit breaker by
 *     itself, and genuine execution failures are never retried (in-run or on
 *     --resume) — a known-failing capability is called at most once per file.
 *
 * Analytics safety: the account behind the key MUST be on the internal-account
 * exclusion list — enforced at startup by resolving the key prefix to an email
 * and refusing to run otherwise. Without this, sweep traffic would inflate the
 * real-traffic completion rates that drive quarantine decisions.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { EXCLUDED_EMAILS } from "./lib/internal-accounts.js";
config({ path: resolve(import.meta.dirname, "../../../.env") });

const PROD = process.env.SWEEP_BASE_URL ?? "https://strale-production.up.railway.app";
const API_KEY = process.env.SWEEP_API_KEY ?? process.env.STRALE_TEST_API_KEY ?? "";
const BUDGET_CAP_CENTS = Number(process.env.SWEEP_BUDGET_CAP_CENTS ?? 2500);
const CONCURRENCY = Number(process.env.SWEEP_CONCURRENCY ?? 1);
const LAUNCH_DELAY_MS = Number(process.env.SWEEP_LAUNCH_DELAY_MS ?? 800);
const SYNC_TIMEOUT_MS = 70_000;
const ASYNC_POLL_INTERVAL_MS = 3_000;
const ASYNC_POLL_BUDGET_MS = 180_000;
const WALLET_FLOOR_CENTS = 300;
// Below the breaker's CONSECUTIVE_FAILURE_THRESHOLD (3) so the sweep alone
// can never suspend a capability for real customers.
const MAX_TRANSIENT_ATTEMPTS = 2;

import { SWEEP_DENYLIST as DENYLIST } from "./lib/sweep-denylist.js";

type Outcome =
  | "PASS"                 // completed in prod, all declared assertions hold
  | "FIXTURE_FAIL"         // completed in prod, one or more assertions fail
  | "ROUTE_REJECTED"       // 4xx before execution — the #168/#173 schema-gate class
  | "EXEC_FAIL_ENV"        // execution failed; message suggests missing prod config
  | "EXEC_FAIL_UPSTREAM"   // execution failed; upstream/vendor/logic error
  | "CIRCUIT_OPEN"         // breaker already open — NOT probed; re-run after next_retry_at
  | "NO_EXECUTOR_DEPLOYED" // catalog row exists but code not deployed
  | "NO_FIXTURE"           // active capability with no active known_answer suite
  | "ASYNC_TIMEOUT"        // 202 accepted but no terminal status within budget
  | "DENYLISTED"
  | "BUDGET_STOPPED"
  | "WALLET_LOW"
  | "HTTP_OTHER";          // transport error or unrecognized edge response

// Outcomes re-attempted by --resume. Execution failures are deliberately NOT
// here: re-calling a known-failing capability spends budget and feeds the
// circuit breaker for zero information.
const RETRYABLE = new Set<Outcome>(["HTTP_OTHER", "WALLET_LOW", "BUDGET_STOPPED"]);
const NO_CALL_MADE = new Set<Outcome>(["DENYLISTED", "BUDGET_STOPPED", "WALLET_LOW", "NO_FIXTURE", "CIRCUIT_OPEN", "NO_EXECUTOR_DEPLOYED"]);

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
  attempts?: number;
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

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) {
    console.error(`${flag} requires a value.`);
    process.exit(1);
  }
  return v;
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
  const limitRaw = argValue(args, "--limit");
  const limit = limitRaw !== undefined ? Number(limitRaw) : Infinity;
  if (Number.isNaN(limit) || limit <= 0) {
    if (limitRaw !== undefined) { console.error(`--limit must be a positive number, got "${limitRaw}".`); process.exit(1); }
  }
  const onlyRaw = argValue(args, "--only");
  const only = onlyRaw ? new Set(onlyRaw.split(",")) : null;
  const resumePath = argValue(args, "--resume");
  if (resumePath && !existsSync(resumePath)) {
    console.error(`--resume file not found: ${resumePath}`);
    console.error("Refusing to silently start a fresh (budget-resetting) run. Fix the path or omit --resume.");
    process.exit(1);
  }

  const done = new Set<string>();
  let carriedSpendCents = 0;
  if (resumePath) {
    // Keep the LAST record per slug. Only transient outcomes are retried.
    const last = new Map<string, any>();
    for (const line of readFileSync(resumePath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try { const r = JSON.parse(line); last.set(r.slug, r); } catch { /* skip malformed */ }
    }
    for (const [slug, r] of last) {
      if (!RETRYABLE.has(r.outcome)) done.add(slug);
      // Budget accounting survives restarts: count every record that issued
      // at least one call attempt.
      if (!NO_CALL_MADE.has(r.outcome)) carriedSpendCents += (r.external_cost_cents ?? 0) * (r.attempts ?? 1);
    }
    console.log(`resume: ${done.size} slugs terminal (skipped), ${last.size - done.size} retryable; carried estimated spend €${(carriedSpendCents / 100).toFixed(2)}`);
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

  // Analytics-safety gate: the key must belong to an internal account, or the
  // sweep's own traffic corrupts the completion rates quarantine decisions use.
  const keyPrefix = API_KEY.slice(0, 16);
  const owner = await sql<{ email: string }[]>`
    SELECT email FROM users WHERE key_prefix = ${keyPrefix} LIMIT 1`;
  if (!owner.length || !EXCLUDED_EMAILS.includes(owner[0].email)) {
    console.error(`The sweep key resolves to ${owner[0]?.email ?? "no account"}, which is NOT on the internal-account exclusion list (${EXCLUDED_EMAILS.join(", ")}).`);
    console.error("Running would pollute real-traffic analytics. Use the internal test account key.");
    await sql.end();
    process.exit(1);
  }

  const caps = await sql<{
    slug: string; cost_class: string; price_cents: number;
    input: any; validation_rules: any; external_cost_cents: number | null;
  }[]>`
    SELECT DISTINCT ON (c.slug)
      c.slug, c.cost_class, c.price_cents,
      ts.input, ts.validation_rules, ts.external_cost_cents
    FROM capabilities c
    LEFT JOIN test_suites ts
      ON ts.capability_slug = c.slug AND ts.test_type = 'known_answer' AND ts.active = true
    WHERE c.is_active = true
    ORDER BY c.slug, ts.id`;
  await sql.end();

  let queue = caps.filter((c) => !done.has(c.slug));
  if (only) queue = queue.filter((c) => only.has(c.slug));
  queue = queue.slice(0, limit);

  const day = new Date().toISOString().slice(0, 10);
  const outPath = resumePath ?? resolve(import.meta.dirname, `../../../audit-output/prod-sweep-${day}.jsonl`);
  mkdirSync(dirname(outPath), { recursive: true });

  const noFixture = caps.filter((c) => c.input == null).length;
  console.log(`sweeping ${queue.length} of ${caps.length} active capabilities against ${PROD} (${noFixture} have no known_answer fixture and will be recorded NO_FIXTURE)`);
  console.log(`estimated external-cost cap: €${(BUDGET_CAP_CENTS / 100).toFixed(2)} (declared metadata, not measured); denylist: ${DENYLIST.size}; output: ${outPath}`);
  console.log(`expect roughly €${(queue.reduce((s, c) => s + Math.max(c.price_cents, 0), 0) / 100).toFixed(0)} in internal wallet debits for a full pass — top up via scripts/topup-test.ts\n`);

  let externalSpentCents = carriedSpendCents;
  let walletLow = false;
  const results: Row[] = [];
  let cursor = 0;

  function record(r: Row) {
    results.push(r);
    appendFileSync(outPath, JSON.stringify({ ...r, ts: new Date().toISOString() }) + "\n");
    const n = results.length;
    if (n % 25 === 0) console.log(`  … ${n}/${queue.length} (estimated ext spend €${(externalSpentCents / 100).toFixed(2)})`);
  }

  async function sweepOne(cap: (typeof caps)[number]): Promise<void> {
    const { slug, price_cents, input, validation_rules } = cap;
    // Paid-class capabilities that declare no external cost still bill a
    // vendor; charge a conservative 1c per attempt against the cap.
    const declaredCost = cap.external_cost_cents ?? 0;
    const extCost = declaredCost === 0 && cap.cost_class.startsWith("paid") ? 1 : declaredCost;

    if (input == null) return record({ slug, outcome: "NO_FIXTURE", detail: "active capability with no active known_answer suite — unverifiable, fix in P1" });
    if (DENYLIST.has(slug)) return record({ slug, outcome: "DENYLISTED", detail: DENYLIST.get(slug)! });
    if (walletLow) return record({ slug, outcome: "WALLET_LOW", detail: `test wallet below €${(WALLET_FLOOR_CENTS / 100).toFixed(2)} floor. TO CONTINUE: npx tsx scripts/topup-test.ts, then re-run with --resume ${outPath}` });
    if (externalSpentCents + extCost > BUDGET_CAP_CENTS)
      return record({ slug, outcome: "BUDGET_STOPPED", detail: `would exceed the €${(BUDGET_CAP_CENTS / 100).toFixed(2)} cap (spent €${(externalSpentCents / 100).toFixed(2)}, this call €${(extCost / 100).toFixed(2)}). TO CONTINUE: raise SWEEP_BUDGET_CAP_CENTS deliberately and re-run with --resume ${outPath}` });

    // One idempotency key per capability, reused across retries — a retried
    // request that actually executed replays its result instead of re-charging.
    const idemKey = `p0-sweep-${randomUUID()}`;
    const t0 = Date.now();
    let http = 0, body: any = null;
    let attempts = 0;
    // 429 (rate limit), 502 (Railway edge blip) and wallet-contention 503 are
    // transient artifacts of the sweep itself — retry those, bounded below the
    // circuit-breaker threshold. Everything else records on first response.
    for (let attempt = 0; attempt < MAX_TRANSIENT_ATTEMPTS; attempt++) {
      attempts++;
      // Count spend when we commit to each attempt — a hung request must not
      // let siblings race past the cap, and retries are real vendor calls.
      externalSpentCents += extCost;
      try {
        ({ http, body } = await fetchJson(`${PROD}/v1/do`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idemKey,
          },
          body: JSON.stringify({
            capability_slug: slug,
            inputs: input ?? {},
            max_price_cents: Math.max(price_cents, 1),
          }),
        }, SYNC_TIMEOUT_MS));
      } catch (e: any) {
        return record({ slug, outcome: "HTTP_OTHER", detail: `transport: ${e?.message ?? e}`.slice(0, 150), ms: Date.now() - t0, external_cost_cents: extCost, attempts });
      }
      const contended = http === 503 && /contended/i.test(String(body?.message ?? ""));
      if (http !== 429 && http !== 502 && !contended) break;
      if (attempt < MAX_TRANSIENT_ATTEMPTS - 1) {
        const hinted = Number(/in (\d+) second/.exec(String(body?.message ?? ""))?.[1]);
        await new Promise((r) => setTimeout(r, (Number.isFinite(hinted) && hinted > 0 ? hinted : 3) * 1000 + 500));
      }
    }

    const base = { ms: Date.now() - t0, http, price_cents, external_cost_cents: extCost, attempts };

    if (http === 400 || http === 422) {
      return record({ slug, outcome: "ROUTE_REJECTED", detail: `${body?.error_code ?? http}: ${String(body?.message ?? "").slice(0, 140)}`, ...base });
    }
    if (http === 402) {
      walletLow = true;
      return record({ slug, outcome: "WALLET_LOW", detail: `insufficient balance. TO CONTINUE: npx tsx scripts/topup-test.ts, then re-run with --resume ${outPath}`, ...base });
    }
    if (http === 503 && /temporarily suspended/i.test(String(body?.message ?? ""))) {
      return record({ slug, outcome: "CIRCUIT_OPEN", detail: `breaker open (pre-existing or external): ${String(body?.message ?? "").slice(0, 120)} — re-run after next_retry_at`, ...base });
    }
    if (http === 503 && /no executor/i.test(String(body?.message ?? ""))) {
      return record({ slug, outcome: "NO_EXECUTOR_DEPLOYED", detail: String(body?.message ?? "").slice(0, 140), ...base });
    }
    // Execution failures surface as HTTP 500 with error_code=execution_failed
    // and the sanitized reason in details.error (charge-on-success: not billed).
    if (http === 500 && body?.error_code === "execution_failed") {
      const reason = String(body?.details?.error ?? body?.message ?? "execution failed");
      return record({ slug, outcome: classifyExecError(reason), detail: reason.slice(0, 160), ...base });
    }

    let status: string | undefined = body?.result?.status;
    let output: any = body?.result?.output;
    let errMsg: string = body?.result?.error ?? body?.message ?? "";
    const txnId: string | undefined = body?.result?.transaction_id;
    const balance: number | undefined = body?.result?.wallet_balance_cents;
    if (typeof balance === "number" && balance < WALLET_FLOOR_CENTS) walletLow = true;

    if (http === 202 && txnId) {
      const deadline = Date.now() + ASYNC_POLL_BUDGET_MS;
      status = "executing";
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, ASYNC_POLL_INTERVAL_MS));
        try {
          const poll = await fetchJson(`${PROD}/v1/transactions/${txnId}`, {
            headers: { "Authorization": `Bearer ${API_KEY}` },
          }, 15_000);
          // Only trust the poll body when the poll itself succeeded — edge
          // error JSON also carries a "status" field and must not overwrite.
          if (poll.http === 200) status = poll.body?.status ?? status;
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
  const order: Outcome[] = ["FIXTURE_FAIL", "ROUTE_REJECTED", "EXEC_FAIL_ENV", "EXEC_FAIL_UPSTREAM", "CIRCUIT_OPEN", "NO_EXECUTOR_DEPLOYED", "NO_FIXTURE", "ASYNC_TIMEOUT", "HTTP_OTHER", "WALLET_LOW", "BUDGET_STOPPED", "DENYLISTED", "PASS"];
  const counts: Record<string, number> = {};
  for (const r of results) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;

  console.log("\n=== SUMMARY ===");
  for (const o of order) if (counts[o]) console.log(`${o.padEnd(22)} ${counts[o]}`);
  console.log(`estimated external cost (declared metadata): €${(externalSpentCents / 100).toFixed(2)} of €${(BUDGET_CAP_CENTS / 100).toFixed(2)}`);

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

  console.log(`\nNEXT STEPS:`);
  if (results.some((r) => RETRYABLE.has(r.outcome))) {
    console.log(`  retry transient outcomes:  npx tsx scripts/sweep-prod-catalog.ts --resume ${outPath}`);
  }
  console.log(`  build disposition table:   npx tsx scripts/build-disposition.ts --sweep ${outPath}`);
}

main().catch((e) => {
  console.error("sweep failed:", e?.message ?? e);
  process.exit(1);
});
