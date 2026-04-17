const from = process.argv[2];
const to = process.argv[3];
if (!from || !to) {
  console.error('usage: tsx window-failed-requests.ts <from> <to>');
  process.exit(1);
}
const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
const r = await sql`
  SELECT task, category, max_price_cents, created_at
  FROM failed_requests
  WHERE created_at >= ${from} AND created_at <= ${to}
  ORDER BY created_at DESC
`;
console.log('failed_requests in window:', r.length);
for (const row of r) console.log('  ', JSON.stringify(row));
await sql.end();
