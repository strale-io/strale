// Operational: one-line-per-row summary of x402 transactions since the
// hardcoded 2026-04-14 start date (bump the date in the query for a new
// window). Shows timestamp, capability, status, price, truncated
// settlement ID, input, and error if any — useful for spotting failure
// patterns across a batch of x402 traffic.
// Usage: tsx apps/api/scripts/x402-detail.ts

const postgres = (await import("postgres")).default;
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
const rows = await sql`
  SELECT t.id, c.slug AS capability, t.status, t.input, t.error,
         t.price_cents, t.price_usd, t.x402_settlement_id, t.created_at
  FROM transactions t
  LEFT JOIN capabilities c ON c.id = t.capability_id
  WHERE t.payment_method = 'x402'
    AND t.created_at >= '2026-04-14T00:00:00Z'
  ORDER BY t.created_at
`;
for (const r of rows as any[]) {
  const err = r.error ? ` ERR=${String(r.error).slice(0, 80)}` : "";
  console.log(
    `${r.created_at.toISOString()}  ${r.capability}  [${r.status}]  $${r.price_usd}  settle=${r.x402_settlement_id?.slice(0, 18) ?? "none"}...  input=${JSON.stringify(r.input)}${err}`,
  );
}
await sql.end();
