const from = process.argv[2];
const to = process.argv[3];
if (!from || !to) {
  console.error('usage: tsx window-failed-requests.ts <from> <to>');
  process.exit(1);
}
const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
const r = await sql`
  SELECT task, category, max_price_cents, failure_type, error_detail, created_at
  FROM failed_requests
  WHERE created_at >= ${from} AND created_at <= ${to}
  ORDER BY created_at DESC
`;
console.log('failed_requests in window:', r.length);

const byType = new Map<string, number>();
for (const row of r) {
  const key = row.failure_type ?? 'unknown';
  byType.set(key, (byType.get(key) ?? 0) + 1);
}
if (byType.size > 0) {
  console.log('  by failure_type:', [...byType.entries()].map(([k, v]) => `${k}=${v}`).join(', '));
  console.log('  note: only no_match is a true matcher miss.');
  console.log('  missing_fields / input_misplaced / input_confusion mean the matcher resolved a capability but the caller passed bad input.');
}
for (const row of r) console.log('  ', JSON.stringify(row));
await sql.end();
