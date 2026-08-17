// Operational: list authenticated (non-internal) user activity in a time window.
// For each transaction, prints the calling user's email, wallet balance,
// capability slug, input, status, payment method, and timestamp. Filters
// out the health probe rows and the fixed internal-email allowlist.
// Usage: tsx apps/api/scripts/window-users.ts <from-iso> <to-iso>

const from = process.argv[2];
const to = process.argv[3];
if (!from || !to) {
  console.error("usage: tsx window-users.ts <from-iso> <to-iso>");
  process.exit(1);
}
const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
const rows = await sql`
  SELECT u.email, u.created_at AS signed_up_at, COALESCE(w.balance_cents, 0) AS balance_cents,
         c.slug AS capability, t.payment_method, t.status, t.input, t.created_at AS called_at
  FROM transactions t
  LEFT JOIN users u ON u.id = t.user_id
  LEFT JOIN wallets w ON w.user_id = t.user_id
  LEFT JOIN capabilities c ON c.id = t.capability_id
  WHERE t.created_at >= ${from} AND t.created_at <= ${to}
    AND t.status <> 'health_probe'
    AND t.user_id IS NOT NULL
    AND u.email <> ALL(ARRAY['petter@strale.io','test@strale.io','test2@strale.io','system@strale.internal','test@example.com'])
  ORDER BY t.created_at
`;
for (const r of rows) console.log(JSON.stringify(r));
await sql.end();
