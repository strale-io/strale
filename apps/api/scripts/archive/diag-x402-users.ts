import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const summary = await sql`
  SELECT
    COUNT(*)::int AS total,
    COUNT(DISTINCT audit_trail->>'payer_address')::int AS distinct_payers,
    COUNT(*) FILTER (WHERE audit_trail->>'payer_address' IS NULL)::int AS null_payer_rows,
    MIN(created_at) AS first_x402,
    MAX(created_at) AS last_x402
  FROM transactions
  WHERE payment_method = 'x402'
`;
console.log("=== x402 totals ===");
console.log(summary[0]);
console.log();

const byPayer = await sql`
  SELECT
    audit_trail->>'payer_address' AS payer,
    COUNT(*)::int AS calls,
    COUNT(DISTINCT capability_id)::int AS unique_caps,
    MIN(created_at) AS first_seen,
    MAX(created_at) AS last_seen,
    SUM((audit_trail->>'price_usd')::numeric) AS total_usd,
    array_agg(DISTINCT (SELECT slug FROM capabilities WHERE id = transactions.capability_id)) AS caps
  FROM transactions
  WHERE payment_method = 'x402'
  GROUP BY audit_trail->>'payer_address'
  ORDER BY first_seen ASC
`;

console.log(`=== Distinct payer groups: ${byPayer.length} ===`);
for (const r of byPayer) {
  const p = r.payer as string | null;
  const payer = p ? `${p.slice(0, 10)}...${p.slice(-6)}` : "(null)";
  console.log(
    `${payer}  calls=${r.calls}  caps=${r.unique_caps}  first=${r.first_seen.toISOString()}  last=${r.last_seen.toISOString()}  usd=${r.total_usd}  [${(r.caps || []).filter(Boolean).join(", ")}]`,
  );
}

await sql.end();
process.exit(0);
