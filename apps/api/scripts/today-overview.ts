async function main() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  const INTERNAL_EMAILS = ['petter@strale.io', 'test@strale.io', 'test2@strale.io', 'system@strale.internal', 'test@example.com'];
  const all = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE t.payment_method = 'x402')::int AS x402,
           COUNT(*) FILTER (WHERE t.is_free_tier = true)::int AS free_tier,
           COUNT(*) FILTER (WHERE t.payment_method = 'wallet' AND t.is_free_tier IS NOT TRUE)::int AS wallet,
           COUNT(*) FILTER (WHERE t.solution_slug IS NOT NULL)::int AS solutions,
           COUNT(*) FILTER (WHERE t.status = 'completed')::int AS completed,
           COUNT(*) FILTER (WHERE t.status = 'failed')::int AS failed
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date
      AND (u.email IS NULL OR u.email NOT IN ${sql(INTERNAL_EMAILS)})
  `;
  console.log("\n=== Platform overview today (CET) ===\n");
  const a = all[0];
  console.log(`Transactions: ${a.total} (${a.completed} completed, ${a.failed} failed)`);
  console.log(`  wallet: ${a.wallet}, free_tier: ${a.free_tier}, x402: ${a.x402}, solutions: ${a.solutions}`);

  const tests = await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE passed = true)::int AS passed,
           COUNT(*) FILTER (WHERE passed = false)::int AS failed
    FROM test_results
    WHERE executed_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date
  `;

  const internalTxns = await sql`
    SELECT COUNT(*)::int AS total
    FROM transactions t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date
      AND u.email IN ${sql(INTERNAL_EMAILS)}
  `;
  console.log(`  (excluded ${internalTxns[0].total} internal txns from system/test accounts)`);
  const t = tests[0];
  console.log(`\nTest runs: ${t.total} (${t.passed} passed, ${t.failed} failed)`);

  const signups = await sql`
    SELECT COUNT(*)::int AS total FROM users
    WHERE created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date
  `;
  console.log(`Signups: ${signups[0].total}`);

  const fr = await sql`
    SELECT COUNT(*)::int AS total FROM failed_requests
    WHERE created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date
  `;
  console.log(`Failed request logs: ${fr[0].total}`);

  await sql.end();
}
main();
