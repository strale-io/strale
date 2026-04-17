const from = process.argv[2];
const to = process.argv[3];
if (!from || !to) {
  console.error('usage: tsx window-inputs.ts <from-iso> <to-iso>');
  process.exit(1);
}

const EXCLUDED_EMAILS = ["petter@strale.io", "test@strale.io", "test2@strale.io", "system@strale.internal", "test@example.com"];

const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const rows = await sql`
  SELECT c.slug AS capability_slug, t.status, t.input, t.error
  FROM transactions t
  LEFT JOIN capabilities c ON c.id = t.capability_id
  LEFT JOIN users u ON u.id = t.user_id
  WHERE t.created_at >= ${from}
    AND t.created_at <= ${to}
    AND t.status <> 'health_probe'
    AND (u.email IS NULL OR u.email <> ALL(${EXCLUDED_EMAILS}))
  ORDER BY c.slug, t.created_at
`;

const g: Record<string, any[]> = {};
for (const row of rows as any[]) {
  g[row.capability_slug] ||= [];
  g[row.capability_slug].push(row);
}

console.log('Window:', from, '->', to);
console.log('Total rows:', rows.length);

for (const [cap, list] of Object.entries(g)) {
  console.log('\n=== ' + cap + ' (' + list.length + ') ===');
  for (const row of list) {
    const inp = JSON.stringify(row.input);
    const err = row.error ? ' ERR=' + String(row.error).slice(0, 140) : '';
    console.log('  [' + row.status + '] ' + inp + err);
  }
}
await sql.end();
