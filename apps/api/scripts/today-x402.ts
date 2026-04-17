async function main() {
  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await sql`
    SELECT t.created_at, c.slug, t.status, t.input
    FROM transactions t
    LEFT JOIN capabilities c ON c.id = t.capability_id
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.created_at >= (NOW() AT TIME ZONE 'Europe/Berlin')::date
      AND t.payment_method = 'x402'
      AND (u.email IS NULL OR u.email NOT IN ('petter@strale.io','test@strale.io','test2@strale.io','system@strale.internal'))
    ORDER BY t.created_at DESC
  `;
  console.log(`x402 calls today: ${rows.length}`);
  for (const r of rows) {
    console.log(`${r.created_at.toISOString()}  ${r.slug}  [${r.status}]`);
    console.log(`   input: ${JSON.stringify(r.input)}`);
  }
  await sql.end();
}
main();
