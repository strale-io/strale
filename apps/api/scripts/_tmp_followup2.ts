const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const LIKE_PATTERNS = ["%@strale.io", "%@strale.dev", "%@strale.internal", "%@example.com"];
const EXTRA_EMAILS = ["petterlindstrom@hotmail.com"];

console.log("\n=== capability_health for low-completion slugs ===");
try {
  const slugs = ["product-reviews-extract", "us-company-data", "web-extract", "screenshot-url"];
  const health = await sql`
    SELECT capability_slug, status, consecutive_failures FROM capability_health WHERE capability_slug = ANY(${slugs})
  `;
  console.table(health);
} catch (e) { console.log("failed:", (e as Error).message); }

console.log("\n=== Co-occurrence redo, identity = COALESCE(user_id, x402_payer_hash), 90d ===");
const clusterCategories = ["company-data", "competitive-intelligence", "web-intelligence"];
const clusterIdentities = await sql`
  SELECT DISTINCT COALESCE(t.user_id::text, t.x402_payer_hash) AS identity
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
  LEFT JOIN users u ON u.id = t.user_id
  WHERE t.created_at >= now() - interval '90 days'
    AND t.status <> 'health_probe'
    AND COALESCE(t.user_id::text, t.x402_payer_hash) IS NOT NULL
    AND c.category = ANY(${clusterCategories})
    AND (u.email IS NULL OR NOT (u.email LIKE ANY(${LIKE_PATTERNS}) OR u.email = ANY(${EXTRA_EMAILS})))
`;
const ids = (clusterIdentities as any[]).map(r => r.identity);
console.log("Cluster identities (incl. x402 payers):", ids.length);

if (ids.length > 0) {
  const coOcc = await sql`
    SELECT c.category, COUNT(*) AS calls, COUNT(DISTINCT COALESCE(t.user_id::text, t.x402_payer_hash)) AS distinct_identities
    FROM transactions t
    JOIN capabilities c ON c.id = t.capability_id
    WHERE t.created_at >= now() - interval '90 days'
      AND t.status <> 'health_probe'
      AND COALESCE(t.user_id::text, t.x402_payer_hash) = ANY(${ids})
    GROUP BY c.category
    ORDER BY calls DESC
  `;
  console.table(coOcc);
}

console.log("\n=== total distinct identities incl x402 payers, 90d, real ===");
const totalIdent = await sql`
  SELECT COUNT(DISTINCT COALESCE(t.user_id::text, t.x402_payer_hash)) AS n
  FROM transactions t
  LEFT JOIN users u ON u.id = t.user_id
  WHERE t.created_at >= now() - interval '90 days'
    AND t.status <> 'health_probe'
    AND COALESCE(t.user_id::text, t.x402_payer_hash) IS NOT NULL
    AND (u.email IS NULL OR NOT (u.email LIKE ANY(${LIKE_PATTERNS}) OR u.email = ANY(${EXTRA_EMAILS})))
`;
console.table(totalIdent);

await sql.end();
