/**
 * Solution execution success-path smoke test.
 *
 * Chosen solution: domain-trust
 * - 5 steps (whois, dns, ssl, domain-reputation, header-security)
 * - All SQS >= 95.5, all active lifecycle state
 * - Price: 40c
 * - All steps use $input.domain — simple, reliable, no Browserless
 * - Tests: orchestration, wallet debit, transaction row, audit trail, GET /v1/transactions/:id
 *
 * Run: STRALE_SMOKE_API_KEY=sk_live_... npx tsx scripts/solution-execution-smoke.mts
 */

import { readFileSync } from "node:fs";
import postgres from "postgres";

const API_KEY = process.env.STRALE_SMOKE_API_KEY;
if (!API_KEY) {
  console.error("ERROR: Set STRALE_SMOKE_API_KEY env var");
  process.exit(1);
}

const BASE = "https://strale-production.up.railway.app";
const SOLUTION_SLUG = "domain-trust";
const EXPECTED_PRICE = 40;
const EXPECTED_STEPS = 5;
const INPUT = { domain: "stripe.com" };

const env = readFileSync("../../.env", "utf-8");
const dbUrl = env.split("\n").find((l) => l.startsWith("DATABASE_URL=") && !l.startsWith("#"))?.split("=").slice(1).join("=");
const sql = postgres(dbUrl!);

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean, actual?: unknown, expected?: unknown) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${name}`);
    if (actual !== undefined) console.error(`    actual:   ${JSON.stringify(actual)}`);
    if (expected !== undefined) console.error(`    expected: ${JSON.stringify(expected)}`);
    failed++;
  }
}

try {
  // 1. Balance before
  console.log("\n=== 1. BALANCE BEFORE ===");
  const balResp = await fetch(`${BASE}/v1/wallet/balance`, { headers: { Authorization: `Bearer ${API_KEY}` } });
  const balData = await balResp.json() as any;
  const balanceBefore = balData.balance_cents;
  console.log(`  Balance: ${balanceBefore}c`);
  assert("Balance sufficient", balanceBefore >= EXPECTED_PRICE, balanceBefore, `>= ${EXPECTED_PRICE}`);

  // 2. Execute solution
  console.log("\n=== 2. EXECUTE SOLUTION ===");
  const startMs = Date.now();
  const execResp = await fetch(`${BASE}/v1/solutions/${SOLUTION_SLUG}/execute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ inputs: INPUT, max_price_cents: 500 }),
  });
  const elapsed = Date.now() - startMs;
  const body = await execResp.json() as any;
  console.log(`  HTTP ${execResp.status} (${elapsed}ms)`);

  // 3. Response shape
  console.log("\n=== 3. RESPONSE SHAPE ===");
  assert("HTTP 200", execResp.status === 200, execResp.status, 200);
  assert("Has result", "result" in body);
  assert("Has meta", "meta" in body);

  if (!body.result || !body.meta) {
    console.error("Response missing result/meta — aborting");
    console.log("\nFull response:", JSON.stringify(body, null, 2));
    process.exit(1);
  }

  const result = body.result;
  const meta = body.meta;

  assert("result.status is completed", result.status === "completed", result.status, "completed");
  assert("result.solution_slug matches", result.solution_slug === SOLUTION_SLUG, result.solution_slug, SOLUTION_SLUG);
  assert("result.step_count matches", result.step_count === EXPECTED_STEPS, result.step_count, EXPECTED_STEPS);
  assert("result.steps has expected keys", Object.keys(result.steps || {}).length === EXPECTED_STEPS, Object.keys(result.steps || {}).length, EXPECTED_STEPS);
  assert("result.price_cents matches", result.price_cents === EXPECTED_PRICE, result.price_cents, EXPECTED_PRICE);
  assert("result.errors absent or empty", !result.errors || result.errors.length === 0, result.errors);
  assert("result.transaction_id present", !!result.transaction_id);
  assert("result.latency_ms > 0", result.latency_ms > 0, result.latency_ms);

  const txId = result.transaction_id;
  console.log(`  Transaction ID: ${txId}`);

  // 4. Step outputs present
  console.log("\n=== 4. STEP OUTPUTS ===");
  const expectedSlugs = ["whois-lookup", "dns-lookup", "ssl-check", "domain-reputation", "header-security-check"];
  for (const slug of expectedSlugs) {
    const stepOutput = result.steps?.[slug];
    assert(`Step ${slug} present`, !!stepOutput);
    assert(`Step ${slug} is not an error`, !stepOutput?.error, stepOutput?.error);
  }

  // 5. Balance after
  console.log("\n=== 5. BALANCE AFTER ===");
  const balAfterResp = await fetch(`${BASE}/v1/wallet/balance`, { headers: { Authorization: `Bearer ${API_KEY}` } });
  const balAfterData = await balAfterResp.json() as any;
  const balanceAfter = balAfterData.balance_cents;
  const delta = balanceAfter - balanceBefore;
  console.log(`  Balance: ${balanceAfter}c (delta: ${delta}c)`);
  assert("Balance decreased by price", delta === -EXPECTED_PRICE, delta, -EXPECTED_PRICE);

  // 6. GET /v1/transactions/:id
  console.log("\n=== 6. GET TRANSACTION ===");
  const txResp = await fetch(`${BASE}/v1/transactions/${txId}`, { headers: { Authorization: `Bearer ${API_KEY}` } });
  const txData = await txResp.json() as any;
  assert("GET returns 200", txResp.status === 200, txResp.status, 200);
  assert("type is solution", txData.type === "solution", txData.type, "solution");
  assert("solution_slug matches", txData.solution_slug === SOLUTION_SLUG, txData.solution_slug, SOLUTION_SLUG);
  assert("capability_slug is null", txData.capability_slug === null, txData.capability_slug, null);
  assert("quality.sqs is null (strict)", txData.quality?.sqs === null, txData.quality?.sqs, null);
  assert("quality.quality_grade is null", txData.quality?.quality_grade === null, txData.quality?.quality_grade, null);

  // 7. Audit trail
  console.log("\n=== 7. AUDIT TRAIL ===");
  const audit = txData.audit_trail;
  assert("audit_trail present", !!audit);
  assert("audit_trail.solutionSlug matches", audit?.solutionSlug === SOLUTION_SLUG, audit?.solutionSlug, SOLUTION_SLUG);
  assert("audit_trail.steps has entries", Array.isArray(audit?.steps) && audit.steps.length === EXPECTED_STEPS, audit?.steps?.length, EXPECTED_STEPS);
  assert("audit_trail.stepsSucceeded matches", audit?.stepsSucceeded === EXPECTED_STEPS, audit?.stepsSucceeded, EXPECTED_STEPS);
  assert("audit_trail.stepsFailed is 0", audit?.stepsFailed === 0, audit?.stepsFailed, 0);
  assert("audit_trail.refunded is false", audit?.refunded === false, audit?.refunded, false);
  assert("audit_trail.totalLatencyMs > 0", audit?.totalLatencyMs > 0, audit?.totalLatencyMs);

  if (Array.isArray(audit?.steps)) {
    for (const step of audit.steps) {
      assert(`audit step ${step.capabilitySlug} status is completed`, step.status === "completed", step.status, "completed");
    }
  }

  // 8. DB verification
  console.log("\n=== 8. DB VERIFICATION ===");
  const dbRow = await sql`SELECT id, status, capability_id, solution_slug, price_cents, latency_ms FROM transactions WHERE id = ${txId}`;
  assert("DB row exists", dbRow.length === 1, dbRow.length, 1);
  if (dbRow.length > 0) {
    assert("DB status is completed", dbRow[0].status === "completed", dbRow[0].status, "completed");
    assert("DB capability_id is null", dbRow[0].capability_id === null, dbRow[0].capability_id, null);
    assert("DB solution_slug matches", dbRow[0].solution_slug === SOLUTION_SLUG, dbRow[0].solution_slug, SOLUTION_SLUG);
    assert("DB price_cents matches", dbRow[0].price_cents === EXPECTED_PRICE, dbRow[0].price_cents, EXPECTED_PRICE);
    assert("DB latency_ms > 0", dbRow[0].latency_ms > 0, dbRow[0].latency_ms);
  }

  // 9. Wallet transactions
  console.log("\n=== 9. WALLET TRANSACTIONS ===");
  const walletRows = await sql`
    SELECT amount_cents, type, description FROM wallet_transactions
    WHERE description LIKE ${"%" + SOLUTION_SLUG + "%"}
    ORDER BY created_at DESC LIMIT 5
  `;
  const recentDebit = walletRows.find((r: any) => r.type === "purchase" && r.amount_cents < 0);
  const recentRefund = walletRows.find((r: any) => r.type === "refund" && r.amount_cents > 0);
  assert("Debit row exists", !!recentDebit, recentDebit);
  assert("No refund row (success path)", !recentRefund || recentRefund.created_at < dbRow[0]?.created_at, recentRefund);

  // 10. Stuck executing check
  console.log("\n=== 10. STUCK EXECUTING CHECK ===");
  const stuck = await sql`SELECT COUNT(*)::int AS cnt FROM transactions WHERE status = 'executing' AND created_at < NOW() - INTERVAL '10 minutes'`;
  console.log(`  Stuck executing rows: ${stuck[0].cnt}`);
  assert("No stuck executing rows", stuck[0].cnt === 0, stuck[0].cnt, 0);

  // Summary
  console.log("\n" + "=".repeat(50));
  console.log(`RESULT: ${failed === 0 ? "PASS" : "FAIL"} (${passed} passed, ${failed} failed)`);
  console.log("=".repeat(50));

} catch (err) {
  console.error("FATAL:", err);
  failed++;
} finally {
  await sql.end();
  process.exit(failed > 0 ? 1 : 0);
}
