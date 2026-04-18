// Operational: find all x402 transactions from a specific payer wallet.
// Scans the most recent 500 x402 rows and matches the argument fragment
// against both audit_trail JSON and the settlement ID (case-insensitive).
// Useful for KYC / abuse investigation when you have a partial address.
// Usage: tsx apps/api/scripts/x402-payer-history.ts <payer-address-fragment>

const payerFragment = process.argv[2];
if (!payerFragment) {
  console.error("usage: tsx x402-payer-history.ts <payer-address-fragment>");
  process.exit(1);
}

const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

// All x402 transactions, pull audit_trail for matches
const rows = await sql`
  SELECT t.id, c.slug AS capability, t.status, t.input,
         t.price_cents, t.price_usd, t.x402_settlement_id,
         t.created_at, t.audit_trail
  FROM transactions t
  LEFT JOIN capabilities c ON c.id = t.capability_id
  WHERE t.payment_method = 'x402'
  ORDER BY t.created_at DESC
  LIMIT 500
`;

const needle = payerFragment.toLowerCase();
let matches = 0;
for (const r of rows as any[]) {
  const atStr = JSON.stringify(r.audit_trail ?? {}).toLowerCase();
  const settleStr = (r.x402_settlement_id ?? "").toLowerCase();
  if (atStr.includes(needle) || settleStr.includes(needle)) {
    matches++;
    console.log(
      `${r.created_at}  ${r.capability}  ${r.status}  $${r.price_usd}  settle=${r.x402_settlement_id}`,
    );
    console.log("  input:", JSON.stringify(r.input));
    console.log("  audit_trail keys:", Object.keys(r.audit_trail ?? {}).join(", "));
  }
}

console.log(`\nScanned ${rows.length} recent x402 txns. Matches for '${payerFragment}': ${matches}`);

// Also show x402 activity summary by day
const byDay = await sql`
  SELECT DATE(t.created_at AT TIME ZONE 'UTC') AS day,
         COUNT(*)::int AS calls,
         COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed,
         SUM(t.price_usd)::text AS revenue_usd
  FROM transactions t
  WHERE t.payment_method = 'x402'
    AND t.created_at >= NOW() - INTERVAL '14 days'
  GROUP BY DATE(t.created_at AT TIME ZONE 'UTC')
  ORDER BY day DESC
`;
console.log("\n=== x402 last 14 days ===");
for (const r of byDay) console.log(`  ${r.day}  calls=${r.calls}  completed=${r.completed}  revenue=$${r.revenue_usd}`);

await sql.end();
