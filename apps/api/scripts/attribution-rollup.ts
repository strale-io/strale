/**
 * Weekly attribution rollup (design: docs/strategy/2026-08-12-attribution-design.md §6).
 *
 * Answers "which distribution surface produces paying wallets/users" from the
 * signals captured by migration 0081: transactions.client_meta and the
 * discovery_hits table. Read-only; prints a markdown report to stdout.
 *
 * First-touch attribution per payer (design §5):
 *   (a) exact src / client_header on the payer's FIRST paid call, else
 *   (b) nearest preceding discovery hit sharing ip_hash within 24h, else
 *   (c) unattributed.
 *
 * MCP funnel + x402 payer sections (2026-08-15 readiness P0 addendum,
 * migration 0083) added below the original three sections — see each
 * section's header comment for what it can and can't answer.
 *
 * Run: npx tsx scripts/attribution-rollup.ts [--days 7]
 */
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import postgres from "postgres";

const daysArg = process.argv.indexOf("--days");
const DAYS = daysArg >= 0 ? Number(process.argv[daysArg + 1]) || 7 : 7;

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const since = new Date(Date.now() - DAYS * 86_400_000).toISOString();

console.log(`# Attribution rollup — last ${DAYS} days (since ${since.slice(0, 10)})\n`);

// 1. Discovery fetches by endpoint + src tag
const discovery = await sql`
  SELECT endpoint, coalesce(src_tag, '(untagged)') AS src, count(*)::int AS hits,
         count(DISTINCT ip_hash)::int AS distinct_ips
  FROM discovery_hits
  WHERE created_at >= ${since}
  GROUP BY 1, 2 ORDER BY hits DESC LIMIT 20`;
console.log("## Discovery fetches by surface\n");
console.log("| endpoint | src | hits | distinct IPs (daily-salted) |");
console.log("|---|---|---|---|");
for (const r of discovery) console.log(`| ${r.endpoint} | ${r.src} | ${r.hits} | ${r.distinct_ips} |`);
if (discovery.length === 0) console.log("| (none) | | | |");

// 2. Paid calls by client header (our own SDKs/packages)
const byClient = await sql`
  SELECT coalesce(client_meta->>'client_header', '(none)') AS client,
         count(*)::int AS calls, sum(price_cents)::int AS revenue_cents
  FROM transactions
  WHERE created_at >= ${since} AND status = 'completed' AND price_cents > 0
  GROUP BY 1 ORDER BY calls DESC LIMIT 15`;
console.log("\n## Paid calls by client header\n");
console.log("| client | calls | revenue (cents) |");
console.log("|---|---|---|");
for (const r of byClient) console.log(`| ${r.client} | ${r.calls} | ${r.revenue_cents} |`);

// 3. New payers in window with first-touch attribution.
//    Payer identity: x402 payer address (audit_trail->>'payer_address') when
//    present, else user_id. First paid call inside the window AND no earlier
//    paid call before the window.
const newPayers = await sql`
  WITH paid AS (
    SELECT coalesce(audit_trail->>'payer_address', user_id::text) AS payer,
           created_at, client_meta,
           client_meta->>'ip_day_hash' AS ip_day_hash
    FROM transactions
    WHERE status = 'completed' AND price_cents > 0
      AND coalesce(audit_trail->>'payer_address', user_id::text) IS NOT NULL
  ),
  firsts AS (
    SELECT payer, min(created_at) AS first_paid_at
    FROM paid GROUP BY payer
  ),
  new_in_window AS (
    SELECT f.payer, f.first_paid_at, p.client_meta, p.ip_day_hash
    FROM firsts f
    JOIN paid p ON p.payer = f.payer AND p.created_at = f.first_paid_at
    WHERE f.first_paid_at >= ${since}
  )
  SELECT n.payer, n.first_paid_at,
         n.client_meta->>'src' AS src,
         n.client_meta->>'client_header' AS client_header,
         (
           SELECT d.src_tag FROM discovery_hits d
           -- Joins on the DAILY-SALTED hash carried in client_meta.ip_day_hash
           -- (transactions.client_ip_hash is the UNSALTED MED-10 hash — a
           -- different keyspace; never join on it). Cross-midnight joins
           -- fail by construction (salt rotation IS the privacy property).
           WHERE d.ip_hash IS NOT NULL AND d.ip_hash = n.ip_day_hash
             AND d.created_at BETWEEN n.first_paid_at - interval '24 hours' AND n.first_paid_at
             AND d.src_tag IS NOT NULL
           ORDER BY d.created_at DESC LIMIT 1
         ) AS correlated_src
  FROM new_in_window n
  ORDER BY n.first_paid_at`;
console.log("\n## New payers (first paid call in window) — first-touch attribution\n");
console.log("| payer | first paid | attribution |");
console.log("|---|---|---|");
let attributed = 0;
for (const r of newPayers) {
  const attribution =
    (r.src && `src=${r.src}`) ||
    (r.client_header && `client=${r.client_header}`) ||
    (r.correlated_src && `discovery~${r.correlated_src}`) ||
    "unattributed";
  if (attribution !== "unattributed") attributed++;
  const payerShort = String(r.payer).length > 20 ? String(r.payer).slice(0, 10) + "…" + String(r.payer).slice(-6) : r.payer;
  console.log(`| ${payerShort} | ${r.first_paid_at.toISOString().slice(0, 16)} | ${attribution} |`);
}
const total = newPayers.length;
const share = total > 0 ? Math.round(((total - attributed) / total) * 100) : 0;
console.log(`\nNew payers: ${total} · attributed: ${attributed} · unattributed share: ${share}% (target <50%)`);

// ─── 4. MCP funnel ───────────────────────────────────────────────────────
//
// Reads the /mcp:* rows discovery_hits has carried since migration 0083
// (routes/mcp.ts's classifyMcpRequest + the onFunnelEvent hook in
// packages/mcp-server/src/tools.ts). What this CAN answer: relative volume
// at each funnel step, which tools get called, which rejection reason
// dominates. What this CANNOT answer, by construction:
//
//   - A true per-agent funnel. The MCP HTTP transport is stateless (fresh
//     McpServer per POST, no session id) — there is no join key that says
//     "this initialize and this tools/call came from the same agent
//     invocation." "Distinct agents" below is UA-based (imperfect: agents
//     behind a generic/shared UA collapse into one; an agent that changes
//     UA looks like two) and, unlike client_meta.ip_day_hash, NOT
//     corroborated with ip_hash — ip_hash is DAILY-salted for privacy, so
//     it can't be used to count anything across a >1-day window at all.
//   - "Which agents dropped off." Only relative counts per step are
//     available, not the same-agent transition.
console.log("\n## MCP funnel\n");

const funnelSteps = await sql`
  SELECT
    CASE
      WHEN endpoint = '/mcp:initialize' THEN 'initialize'
      WHEN endpoint = '/mcp:tools/list' THEN 'tools/list'
      WHEN endpoint LIKE '/mcp:tools/call:%' THEN 'tools/call'
      WHEN endpoint LIKE '/mcp:reject:%' THEN 'reject'
      ELSE 'other'
    END AS step,
    count(*)::int AS hits,
    count(DISTINCT ua)::int AS distinct_ua
  FROM discovery_hits
  WHERE created_at >= ${since} AND endpoint LIKE '/mcp:%'
  GROUP BY 1
  ORDER BY array_position(ARRAY['initialize','tools/list','tools/call','reject','other'], step)`;

const byStep = new Map(funnelSteps.map((r) => [r.step as string, r]));
console.log("| step | hits | distinct UA (imprecise — see caveats below) |");
console.log("|---|---|---|");
for (const step of ["initialize", "tools/list", "tools/call", "reject"]) {
  const r = byStep.get(step);
  console.log(`| ${step} | ${r?.hits ?? 0} | ${r?.distinct_ua ?? 0} |`);
}
if (funnelSteps.length === 0) console.log("| (no /mcp traffic in window) | | |");

// Biggest drop-off between consecutive stages, by raw hit count (NOT
// per-agent — see the caveat above; two agents making 10 tools/call each
// looks identical here to ten agents making one each).
const order: Array<"initialize" | "tools/list" | "tools/call"> = ["initialize", "tools/list", "tools/call"];
console.log("\nStage-to-stage drop-off (by hit count, not per-agent — see caveats):");
for (let i = 0; i < order.length - 1; i++) {
  const from = byStep.get(order[i])?.hits ?? 0;
  const to = byStep.get(order[i + 1])?.hits ?? 0;
  const dropPct = from > 0 ? Math.round(((from - to) / from) * 100) : null;
  console.log(`  ${order[i]} → ${order[i + 1]}: ${from} → ${to}${dropPct !== null ? ` (-${dropPct}%)` : ""}`);
}

const byTool = await sql`
  SELECT regexp_replace(endpoint, '^/mcp:tools/call:', '') AS tool,
         count(*)::int AS calls, count(DISTINCT ua)::int AS distinct_ua
  FROM discovery_hits
  WHERE created_at >= ${since} AND endpoint LIKE '/mcp:tools/call:%'
  GROUP BY 1 ORDER BY calls DESC LIMIT 15`;
console.log("\n### tools/call by tool\n");
console.log("| tool | calls | distinct UA |");
console.log("|---|---|---|");
for (const r of byTool) console.log(`| ${r.tool} | ${r.calls} | ${r.distinct_ua} |`);
if (byTool.length === 0) console.log("| (none) | | |");

const byRejection = await sql`
  SELECT
    split_part(regexp_replace(endpoint, '^/mcp:reject:', ''), ':', 1) AS reason,
    split_part(regexp_replace(endpoint, '^/mcp:reject:', ''), ':', 2) AS tool,
    count(*)::int AS hits
  FROM discovery_hits
  WHERE created_at >= ${since} AND endpoint LIKE '/mcp:reject:%'
  GROUP BY 1, 2 ORDER BY hits DESC LIMIT 15`;
console.log("\n### Auth/payment rejections by reason + tool\n");
console.log("| reason | tool | hits |");
console.log("|---|---|---|");
for (const r of byRejection) console.log(`| ${r.reason} | ${r.tool} | ${r.hits} |`);
if (byRejection.length === 0) console.log("| (none) | | |");

// ─── 5. x402 distinct payers ─────────────────────────────────────────────
//
// x402_payer_hash (migration 0083) is a STABLE hash — unlike ip_hash it
// does NOT rotate daily, so it's safe to count distinctly across the whole
// window. NULL on: wallet-paid rows (paymentMethod != 'x402'), and any
// x402 row recorded before this migration shipped or where verification
// didn't yield a payer address (a malformed/unusual payload shape) — those
// rows are invisible to this section, so the counts below are a LOWER
// BOUND on true distinct payers, not exact.
console.log("\n## x402 payers\n");

// Single pass over the completed-x402 row set: the per-hash CTE only sees
// rows with a hash, while total_completed (via the outer FILTER) counts
// every completed x402 row regardless — one round trip instead of two
// separate scans of the same WHERE clause.
const payerCounts = await sql`
  WITH payers AS (
    SELECT x402_payer_hash, count(*)::int AS calls
    FROM transactions
    WHERE created_at >= ${since} AND payment_method = 'x402' AND status = 'completed'
      AND x402_payer_hash IS NOT NULL
    GROUP BY 1
  )
  SELECT
    (SELECT count(*)::int FROM payers) AS distinct_payers,
    (SELECT count(*) FILTER (WHERE calls > 1)::int FROM payers) AS repeat_payers,
    (SELECT coalesce(sum(calls), 0)::int FROM payers) AS total_calls_with_hash,
    (
      SELECT count(*)::int FROM transactions
      WHERE created_at >= ${since} AND payment_method = 'x402' AND status = 'completed'
    ) AS total_completed`;

const p = payerCounts[0];
const totalCompleted = p.total_completed;
const repeatShare = p.distinct_payers > 0 ? Math.round((p.repeat_payers / p.distinct_payers) * 100) : 0;
console.log(`Distinct x402 payers (stable hash): ${p.distinct_payers}`);
console.log(`Repeat payers (>1 completed call): ${p.repeat_payers} (${repeatShare}% of distinct payers)`);
console.log(`Completed x402 calls with a payer hash: ${p.total_calls_with_hash} of ${totalCompleted} total completed x402 calls`);
if (p.total_calls_with_hash < totalCompleted) {
  console.log(
    `Note: ${totalCompleted - p.total_calls_with_hash} completed x402 call(s) in this window have no payer hash ` +
      `(pre-migration-0083 rows, or a payment payload verification didn't yield a parseable payer address) — ` +
      `the payer counts above are a lower bound.`,
  );
}

await sql.end();
