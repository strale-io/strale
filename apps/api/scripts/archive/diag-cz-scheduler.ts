import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const runs = await sql`
  SELECT c.slug, COUNT(*)::int AS total,
    COUNT(*) FILTER (WHERE tr.passed) AS passed,
    COUNT(*) FILTER (WHERE tr.passed = false) AS failed,
    MAX(tr.started_at) AS last_run
  FROM test_results tr
  JOIN test_suites ts ON ts.id = tr.suite_id
  JOIN capabilities c ON c.id = ts.capability_id
  WHERE c.slug LIKE 'cz-%' AND tr.started_at > NOW() - INTERVAL '7 days'
  GROUP BY c.slug ORDER BY c.slug
`;
console.log("=== test_results last 7d ===");
for (const r of runs) {
  console.log(
    r.slug,
    "total=" + r.total,
    "pass=" + r.passed,
    "fail=" + r.failed,
    "last=" + r.last_run?.toISOString(),
  );
}

// Recent failures details
const recentFails = await sql`
  SELECT c.slug, ts.test_type, tr.started_at, tr.error_code, tr.error_message
  FROM test_results tr
  JOIN test_suites ts ON ts.id = tr.suite_id
  JOIN capabilities c ON c.id = ts.capability_id
  WHERE c.slug LIKE 'cz-%' AND tr.passed = false
    AND tr.started_at > NOW() - INTERVAL '7 days'
  ORDER BY tr.started_at DESC LIMIT 10
`;
console.log("\n=== recent cz-* failures ===");
for (const r of recentFails) {
  console.log(
    r.started_at?.toISOString(),
    r.slug,
    r.test_type,
    r.error_code,
    (r.error_message || "").slice(0, 120),
  );
}

await sql.end();
