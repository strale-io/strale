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

await sql.end();
