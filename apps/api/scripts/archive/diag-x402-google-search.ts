import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

console.log("=== Non-'test' queries on google-search x402 (last 14d) — who? ===");
const realQueries = await sql`
  SELECT
    t.created_at,
    t.audit_trail->>'payer_address' AS payer,
    t.input->>'query' AS query
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
  WHERE c.slug = 'google-search'
    AND t.payment_method = 'x402'
    AND t.created_at > NOW() - INTERVAL '14 days'
    AND t.status != 'health_probe'
    AND t.input->>'query' != 'test'
  ORDER BY t.created_at DESC
`;
for (const r of realQueries) {
  console.log(`  ${r.created_at.toISOString()}  ${r.payer.slice(0, 12)}…  "${(r.query || '').slice(0, 100)}"`);
}

console.log("\n=== Cadence of main wallet (0x15C3…) per-call gap ===");
const cadence = await sql`
  SELECT
    t.created_at,
    EXTRACT(EPOCH FROM (t.created_at - LAG(t.created_at) OVER (ORDER BY t.created_at)))::int AS gap_seconds
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
  WHERE c.slug = 'google-search'
    AND t.payment_method = 'x402'
    AND t.audit_trail->>'payer_address' = '0x15C3cDD668c6c8DC0d9F0E2b9DDE14d9A1EcbC2B'
    AND t.created_at > NOW() - INTERVAL '7 days'
  ORDER BY t.created_at DESC
  LIMIT 40
`;
for (const r of cadence) {
  console.log(`  ${r.created_at.toISOString()}  gap=${r.gap_seconds ?? '-'}s`);
}

console.log("\n=== Same wallet across all capabilities (last 14d) ===");
const allCalls = await sql`
  SELECT
    c.slug,
    COUNT(*)::int AS calls,
    MIN(t.created_at) AS first_seen,
    MAX(t.created_at) AS last_seen
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
  WHERE t.audit_trail->>'payer_address' = '0x15C3cDD668c6c8DC0d9F0E2b9DDE14d9A1EcbC2B'
    AND t.created_at > NOW() - INTERVAL '14 days'
  GROUP BY 1
  ORDER BY calls DESC
`;
for (const r of allCalls) {
  console.log(`  ${r.slug}  ×${r.calls}  ${r.first_seen.toISOString()} -> ${r.last_seen.toISOString()}`);
}

await sql.end();
