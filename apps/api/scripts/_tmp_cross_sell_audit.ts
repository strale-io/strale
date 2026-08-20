// Scratch audit script — not part of the onboarding pipeline, not committed.
// Usage: cd apps/api && npx tsx --env-file=../../.env scripts/_tmp_cross_sell_audit.ts

const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const LIKE_PATTERNS = ["%@strale.io", "%@strale.dev", "%@strale.internal", "%@example.com"];
const EXTRA_EMAILS = ["petterlindstrom@hotmail.com"];

function section(title: string) {
  console.log("\n\n========== " + title + " ==========");
}

// 1. Category/slug usage, last 90 days, real customers only
section("1. Capability usage by category (90d, real customers)");
const byCategory = await sql`
  SELECT c.category, COUNT(*) AS calls, SUM(t.price_cents) AS revenue_cents,
         COUNT(DISTINCT t.user_id) AS distinct_customers
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
  LEFT JOIN users u ON u.id = t.user_id
  WHERE t.created_at >= now() - interval '90 days'
    AND t.status <> 'health_probe'
    AND (u.email IS NULL OR NOT (u.email LIKE ANY(${LIKE_PATTERNS}) OR u.email = ANY(${EXTRA_EMAILS})))
  GROUP BY c.category
  ORDER BY calls DESC
`;
console.table(byCategory);

section("2. Top capability slugs by call count (90d, real customers)");
const bySlug = await sql`
  SELECT c.slug, c.category, COUNT(*) AS calls, SUM(t.price_cents) AS revenue_cents,
         COUNT(DISTINCT t.user_id) AS distinct_customers,
         SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN t.status = 'failed' THEN 1 ELSE 0 END) AS failed
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
  LEFT JOIN users u ON u.id = t.user_id
  WHERE t.created_at >= now() - interval '90 days'
    AND t.status <> 'health_probe'
    AND (u.email IS NULL OR NOT (u.email LIKE ANY(${LIKE_PATTERNS}) OR u.email = ANY(${EXTRA_EMAILS})))
  GROUP BY c.slug, c.category
  ORDER BY calls DESC
  LIMIT 40
`;
console.table(bySlug);

section("3. Solution usage (90d, real customers)");
const bySolution = await sql`
  SELECT t.solution_slug, COUNT(*) AS calls, SUM(t.price_cents) AS revenue_cents,
         COUNT(DISTINCT t.user_id) AS distinct_customers
  FROM transactions t
  LEFT JOIN users u ON u.id = t.user_id
  WHERE t.created_at >= now() - interval '90 days'
    AND t.status <> 'health_probe'
    AND t.solution_slug IS NOT NULL
    AND (u.email IS NULL OR NOT (u.email LIKE ANY(${LIKE_PATTERNS}) OR u.email = ANY(${EXTRA_EMAILS})))
  GROUP BY t.solution_slug
  ORDER BY calls DESC
`;
console.table(bySolution);

section("4. Distinct real customers with >=1 transaction in window");
const custCount = await sql`
  SELECT COUNT(DISTINCT t.user_id) AS n
  FROM transactions t
  LEFT JOIN users u ON u.id = t.user_id
  WHERE t.created_at >= now() - interval '90 days'
    AND t.status <> 'health_probe'
    AND t.user_id IS NOT NULL
    AND NOT (u.email LIKE ANY(${LIKE_PATTERNS}) OR u.email = ANY(${EXTRA_EMAILS}))
`;
console.table(custCount);

// Sanity check: exclusion is actually filtering something
section("4b. Sanity check — same query WITHOUT exclusion");
const custCountNoExcl = await sql`
  SELECT COUNT(DISTINCT t.user_id) AS n
  FROM transactions t
  WHERE t.created_at >= now() - interval '90 days'
    AND t.status <> 'health_probe'
    AND t.user_id IS NOT NULL
`;
console.table(custCountNoExcl);

// 5. Failed requests — unmet demand signal
section("5. failed_requests (failure_type='no_match', 90d) by category");
const failedByCat = await sql`
  SELECT category, COUNT(*) AS n
  FROM failed_requests
  WHERE created_at >= now() - interval '90 days'
    AND failure_type = 'no_match'
  GROUP BY category
  ORDER BY n DESC
`;
console.table(failedByCat);

section("6. Sample raw failed_requests.task text (failure_type='no_match', 90d)");
const failedSample = await sql`
  SELECT category, task, created_at
  FROM failed_requests
  WHERE created_at >= now() - interval '90 days'
    AND failure_type = 'no_match'
  ORDER BY created_at DESC
  LIMIT 60
`;
for (const r of failedSample as any[]) {
  console.log(`[${r.category}] ${String(r.task).slice(0, 160)}`);
}

// 7. suggest_log zero-result queries — secondary demand signal
section("7. suggest_log zero-result queries (90d), sample");
const zeroResults = await sql`
  SELECT query, type_filter, created_at
  FROM suggest_log
  WHERE created_at >= now() - interval '90 days'
    AND result_count = 0
  ORDER BY created_at DESC
  LIMIT 60
`;
for (const r of zeroResults as any[]) {
  console.log(`[${r.type_filter || "-"}] ${String(r.query).slice(0, 160)}`);
}

// 8. Co-occurrence: customers who used the "lead research / positioning" cluster —
// what other categories did the SAME customers call in the window?
section("8. Co-occurrence — categories called by customers who also used company-data / competitive-intelligence / web-intelligence");
const clusterCategories = ["company-data", "competitive-intelligence", "web-intelligence"];
const clusterUsers = await sql`
  SELECT DISTINCT t.user_id
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
  LEFT JOIN users u ON u.id = t.user_id
  WHERE t.created_at >= now() - interval '90 days'
    AND t.status <> 'health_probe'
    AND t.user_id IS NOT NULL
    AND c.category = ANY(${clusterCategories})
    AND NOT (u.email LIKE ANY(${LIKE_PATTERNS}) OR u.email = ANY(${EXTRA_EMAILS}))
`;
const clusterUserIds = (clusterUsers as any[]).map((r) => r.user_id);
console.log("Cluster customers (company-data/competitive-intelligence/web-intelligence):", clusterUserIds.length);

if (clusterUserIds.length > 0) {
  const coOccurrence = await sql`
    SELECT c.category, COUNT(*) AS calls, COUNT(DISTINCT t.user_id) AS distinct_customers
    FROM transactions t
    JOIN capabilities c ON c.id = t.capability_id
    WHERE t.created_at >= now() - interval '90 days'
      AND t.status <> 'health_probe'
      AND t.user_id = ANY(${clusterUserIds})
    GROUP BY c.category
    ORDER BY calls DESC
  `;
  console.table(coOccurrence);
} else {
  console.log("No cluster customers found in window.");
}

// 9. Any existing "prospecting"/"lead"-type solution bundle?
section("9. Solutions matching prospecting/lead/enrich keywords");
const prospectingSolutions = await sql`
  SELECT slug, name, description, price_cents, is_active
  FROM solutions
  WHERE slug ILIKE ANY(${["%prospect%", "%lead%", "%enrich%", "%positioning%"]})
     OR description ILIKE ANY(${["%prospect%", "%lead%", "%positioning%"]})
`;
console.table(prospectingSolutions);

await sql.end();
