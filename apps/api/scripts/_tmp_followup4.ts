const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
const LIKE_PATTERNS = ["%@strale.io", "%@strale.dev", "%@strale.internal", "%@example.com"];
const EXTRA_EMAILS = ["petterlindstrom@hotmail.com"];
const rev = await sql`
  SELECT t.payment_method, COUNT(*) AS calls, SUM(t.price_cents) AS revenue_cents,
    SUM(CASE WHEN t.status='completed' THEN t.price_cents ELSE 0 END) AS completed_revenue_cents
  FROM transactions t
  JOIN capabilities c ON c.id = t.capability_id
  LEFT JOIN users u ON u.id = t.user_id
  WHERE t.created_at >= now() - interval '90 days'
    AND t.status <> 'health_probe'
    AND (u.email IS NULL OR NOT (u.email LIKE ANY(${LIKE_PATTERNS}) OR u.email = ANY(${EXTRA_EMAILS})))
  GROUP BY t.payment_method
`;
console.table(rev);
await sql.end();
