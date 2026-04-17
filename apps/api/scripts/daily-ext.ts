async function main() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  const rows = await sql`
    SELECT
      DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Berlin')::text AS date_cet,
      COUNT(*)::int AS total_calls,
      COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE t.status = 'failed')::int AS failed,
      COUNT(DISTINCT t.user_id)::int AS unique_users,
      COUNT(DISTINCT c.slug)::int AS unique_capabilities
    FROM transactions t
    LEFT JOIN capabilities c ON c.id = t.capability_id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date - INTERVAL '3 days'
      AND (u.email IS NULL OR u.email NOT IN ('petter@strale.io', 'test@strale.io', 'test2@strale.io', 'system@strale.internal'))
      AND t.solution_slug IS NULL
    GROUP BY DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Berlin')
    ORDER BY date_cet DESC
  `;

  console.log("\n=== External non-test API calls per day (CET) — last 3 days ===\n");
  for (const r of rows) {
    console.log(`${r.date_cet}: ${r.total_calls} calls (${r.completed} completed, ${r.failed} failed) — ${r.unique_users} users, ${r.unique_capabilities} capabilities`);
  }

  const detailRows = await sql`
    SELECT
      DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Berlin')::text AS date_cet,
      c.slug AS capability,
      t.is_free_tier,
      t.payment_method,
      t.status,
      COUNT(*)::int AS count
    FROM transactions t
    LEFT JOIN capabilities c ON c.id = t.capability_id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date - INTERVAL '3 days'
      AND (u.email IS NULL OR u.email NOT IN ('petter@strale.io', 'test@strale.io', 'test2@strale.io', 'system@strale.internal'))
      AND t.solution_slug IS NULL
    GROUP BY date_cet, c.slug, t.is_free_tier, t.payment_method, t.status
    ORDER BY date_cet DESC, count DESC
  `;

  console.log("\n=== Breakdown by capability ===\n");
  let currentDate = '';
  for (const r of detailRows) {
    if (r.date_cet !== currentDate) {
      currentDate = r.date_cet;
      console.log(`\n--- ${currentDate} ---`);
    }
    const tier = r.is_free_tier ? "free" : (r.payment_method || "wallet");
    console.log(`  ${r.capability || 'unknown'} (${tier}, ${r.status}): ${r.count}`);
  }

  await sql.end();
}
main();
