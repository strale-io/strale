const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

console.log("\n=== payment_method breakdown, 90d, all real capability calls ===");
const LIKE_PATTERNS = ["%@strale.io", "%@strale.dev", "%@strale.internal", "%@example.com"];
const EXTRA_EMAILS = ["petterlindstrom@hotmail.com"];
const pm = await sql`
  SELECT t.payment_method,
    COUNT(*) AS calls,
    COUNT(t.user_id) AS has_user_id,
    COUNT(t.x402_payer_hash) AS has_payer_hash,
    COUNT(t.client_ip_hash) AS has_ip_hash
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
  LEFT JOIN users u ON u.id = t.user_id
  WHERE t.created_at >= now() - interval '90 days'
    AND t.status <> 'health_probe'
    AND (u.email IS NULL OR NOT (u.email LIKE ANY(${LIKE_PATTERNS}) OR u.email = ANY(${EXTRA_EMAILS})))
  GROUP BY t.payment_method
`;
console.table(pm);
await sql.end();
