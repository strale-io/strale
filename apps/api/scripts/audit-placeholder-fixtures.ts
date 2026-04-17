// Standing sweep — flags any active known_answer fixture that would fail the
// onboarding / readiness gate (src/lib/fixture-quality.ts). Safe to run in CI.
// Exits 1 if any capability has a bad fixture so it can gate a pipeline.
import postgres from "postgres";
import { validateFixture } from "../src/lib/fixture-quality.js";

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

const rows = await sql`
  SELECT ts.capability_slug, ts.input, c.input_schema
  FROM test_suites ts
  JOIN capabilities c ON c.slug = ts.capability_slug
  WHERE ts.test_type = 'known_answer'
    AND ts.active = true
    AND c.is_active = true
  ORDER BY ts.capability_slug
`;

const bad: { slug: string; reasons: string[] }[] = [];
for (const r of rows as any[]) {
  const result = validateFixture(r.input, r.input_schema);
  if (!result.ok) bad.push({ slug: r.capability_slug, reasons: result.reasons });
}

console.log(`Scanned: ${rows.length} active known_answer fixtures`);
console.log(`OK:      ${rows.length - bad.length}`);
console.log(`Bad:     ${bad.length}\n`);

if (bad.length > 0) {
  for (const b of bad) {
    console.log(`  ${b.slug}`);
    for (const r of b.reasons) console.log(`      - ${r}`);
  }
}

await sql.end();
process.exit(bad.length > 0 ? 1 : 0);
