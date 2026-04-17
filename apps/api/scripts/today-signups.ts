async function main() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await sql`
    SELECT u.id, u.email, u.created_at, COALESCE(w.balance_cents, 0) AS balance_cents
    FROM users u
    LEFT JOIN wallets w ON w.user_id = u.id
    WHERE u.created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date
      AND u.email NOT IN ('petter@strale.io','test@strale.io','test2@strale.io','system@strale.internal')
    ORDER BY u.created_at DESC
  `;
  console.log(`Signups today (CET): ${rows.length}`);
  for (const r of rows) {
    console.log(`  ${r.created_at.toISOString()}  ${r.email}  balance=${(r.balance_cents / 100).toFixed(2)} EUR`);
  }
  await sql.end();
}
main();
