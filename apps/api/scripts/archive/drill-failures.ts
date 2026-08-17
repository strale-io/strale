async function main() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

  const slugs = ["dns-lookup", "url-to-markdown"];

  for (const slug of slugs) {
    console.log(`\n========== ${slug} — failed in last 7d ==========`);

    const rows = await sql`
      SELECT
        t.created_at,
        t.input,
        t.output,
        t.error,
        t.is_free_tier,
        t.payment_method
      FROM transactions t
      LEFT JOIN capabilities c ON c.id = t.capability_id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE c.slug = ${slug}
        AND t.status = 'failed'
        AND t.created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date - INTERVAL '7 days'
        AND (u.email IS NULL OR u.email NOT IN ('petter@strale.io','test@strale.io','test2@strale.io','system@strale.internal','test@example.com'))
      ORDER BY t.created_at DESC
    `;

    console.log(`total failed: ${rows.length}`);

    const byErr = new Map<string, number>();
    for (const r of rows) {
      const key = typeof r.error === "string" ? (r.error as string).slice(0, 80) : (JSON.stringify(r.error) || "unknown").slice(0, 80);
      byErr.set(key, (byErr.get(key) || 0) + 1);
    }
    console.log("\n--- error_code / error head distribution ---");
    for (const [k, v] of [...byErr.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${v}× ${k}`);
    }

    console.log("\n--- sample failures (first 15) ---");
    for (const r of rows.slice(0, 15)) {
      const ts = new Date(r.created_at as Date).toISOString();
      const inp = JSON.stringify(r.input);
      const errObj = r.error;
      const errStr = typeof errObj === "string" ? errObj : JSON.stringify(errObj);
      console.log(`  [${ts}] input=${inp} error=${(errStr || "").slice(0, 200)}`);
    }
  }

  await sql.end();
}
main();
