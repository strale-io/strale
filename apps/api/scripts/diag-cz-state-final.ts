import postgres from "postgres";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });
console.log("DB host:", process.env.DATABASE_URL?.match(/@([^/:]+)/)?.[1]);
const caps = await sql`
  SELECT slug, lifecycle_state, visible, is_active, last_tested_at
  FROM capabilities WHERE slug LIKE 'cz-%' ORDER BY slug
`;
for (const r of caps) {
  console.log(
    r.slug,
    "lifecycle=" + r.lifecycle_state,
    "visible=" + r.visible,
    "last_tested=" + (r.last_tested_at?.toISOString() ?? "never"),
  );
}
console.log("---");
try {
  const fails = await sql`
    SELECT c.slug, COUNT(*)::int AS n
    FROM test_runs tr
    JOIN test_suites ts ON ts.id = tr.suite_id
    JOIN capabilities c ON c.id = ts.capability_id
    WHERE c.slug LIKE 'cz-%' AND tr.passed = false
      AND tr.started_at > NOW() - INTERVAL '24 hours'
    GROUP BY c.slug
  `;
  for (const r of fails) console.log("fails 24h", r.slug, r.n);
  if (fails.length === 0) console.log("no failed test runs for cz-* caps in 24h");
} catch (e: any) {
  console.log("test_runs query error:", e.message);
}
await sql.end();
