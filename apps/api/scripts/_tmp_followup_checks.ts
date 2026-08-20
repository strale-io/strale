const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

console.log("\n=== transactions columns relevant to x402 payer identity ===");
const cols = await sql`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'transactions' ORDER BY ordinal_position
`;
console.table(cols);

console.log("\n=== active status + quality state of the low-completion slugs ===");
const slugs = ["product-reviews-extract", "us-company-data", "web-extract", "exchange-rate", "brazilian-company-data", "screenshot-url", "url-to-markdown"];
const active = await sql`
  SELECT slug, is_active, lifecycle_state, x402_enabled
  FROM capabilities WHERE slug = ANY(${slugs})
`;
console.table(active);

console.log("\n=== 30d completion rate for those slugs (real customers) ===");
const LIKE_PATTERNS = ["%@strale.io", "%@strale.dev", "%@strale.internal", "%@example.com"];
const EXTRA_EMAILS = ["petterlindstrom@hotmail.com"];
const comp30 = await sql`
  SELECT c.slug,
    COUNT(*) AS calls_30d,
    SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) AS completed_30d,
    ROUND(100.0 * SUM(CASE WHEN t.status='completed' THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) AS pct_completed
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
  LEFT JOIN users u ON u.id = t.user_id
  WHERE c.slug = ANY(${slugs})
    AND t.created_at >= now() - interval '30 days'
    AND t.status <> 'health_probe'
    AND (u.email IS NULL OR NOT (u.email LIKE ANY(${LIKE_PATTERNS}) OR u.email = ANY(${EXTRA_EMAILS})))
  GROUP BY c.slug
`;
console.table(comp30);

console.log("\n=== capability_health / quarantine state if table exists ===");
try {
  const health = await sql`
    SELECT capability_slug, status, consecutive_failures, last_checked_at
    FROM source_health WHERE capability_slug = ANY(${slugs})
  `;
  console.table(health);
} catch (e) {
  console.log("source_health query failed:", (e as Error).message);
}

await sql.end();
