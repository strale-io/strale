async function main() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  const totals = await sql`
    SELECT
      c.slug AS capability,
      COUNT(*)::int AS calls,
      COUNT(*) FILTER (WHERE t.status='completed')::int AS completed,
      COUNT(*) FILTER (WHERE t.status='failed')::int AS failed,
      COUNT(DISTINCT t.user_id)::int AS users,
      ARRAY_AGG(DISTINCT COALESCE(t.payment_method, CASE WHEN t.is_free_tier THEN 'free' ELSE 'wallet' END)) AS rails
    FROM transactions t
    LEFT JOIN capabilities c ON c.id = t.capability_id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date - INTERVAL '7 days'
      AND (u.email IS NULL OR u.email NOT IN ('petter@strale.io','test@strale.io','test2@strale.io','system@strale.internal','test@example.com'))
      AND t.solution_slug IS NULL
      AND t.status <> 'health_probe'
    GROUP BY c.slug
    ORDER BY calls DESC
  `;

  console.log("\n=== External capability usage — last 7 days ===");
  let grand = 0;
  for (const r of totals) {
    grand += r.calls;
    console.log(`${r.capability || "unknown"}: ${r.calls} calls (${r.completed} completed, ${r.failed} failed) — users: ${r.users}, rails: ${(r.rails as string[]).join("+")}`);
  }
  console.log(`\nGRAND TOTAL CALLS: ${grand} across ${totals.length} capabilities`);

  const daily = await sql`
    SELECT
      DATE(t.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Berlin')::text AS d,
      COUNT(*)::int AS calls,
      COUNT(DISTINCT c.slug)::int AS uniq_caps
    FROM transactions t
    LEFT JOIN capabilities c ON c.id = t.capability_id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date - INTERVAL '7 days'
      AND (u.email IS NULL OR u.email NOT IN ('petter@strale.io','test@strale.io','test2@strale.io','system@strale.internal','test@example.com'))
      AND t.solution_slug IS NULL
      AND t.status <> 'health_probe'
    GROUP BY d ORDER BY d DESC
  `;
  console.log("\n=== Per day (CET) ===");
  for (const r of daily) console.log(`${r.d}: ${r.calls} calls, ${r.uniq_caps} capabilities`);

  const rails = await sql`
    SELECT
      CASE WHEN t.is_free_tier THEN 'free' ELSE COALESCE(t.payment_method,'wallet') END AS rail,
      COUNT(*)::int AS calls
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date - INTERVAL '7 days'
      AND (u.email IS NULL OR u.email NOT IN ('petter@strale.io','test@strale.io','test2@strale.io','system@strale.internal','test@example.com'))
      AND t.solution_slug IS NULL
      AND t.status <> 'health_probe'
    GROUP BY rail ORDER BY calls DESC
  `;
  console.log("\n=== Rail mix ===");
  for (const r of rails) console.log(`${r.rail}: ${r.calls}`);

  await sql.end();
}
main();
