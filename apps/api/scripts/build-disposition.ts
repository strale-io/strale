/**
 * Disposition table builder (Readiness program — DEC-20260812-A).
 *
 *   npx tsx scripts/build-disposition.ts --sweep ../../audit-output/prod-sweep-YYYY-MM-DD.jsonl
 *
 * Joins the production sweep verdict (last record per slug) with 90-day real
 * external traffic (calls, completion rate, revenue) and proposes a
 * disposition bucket per capability:
 *
 *   keep        — prod-verified, and traffic (if any) above the quality floor
 *   fix         — a named defect: fixture fail, prod env gap, route schema
 *                 rejection, or async timeout
 *   quarantine  — real-traffic completion < 70% on ≥10 calls/30d equivalent
 *                 (DEC-20260812-A floor), or sweep shows upstream-broken with
 *                 failing traffic
 *   retire      — candidate only; retirement is proposed for capabilities that
 *                 are both broken in the sweep AND below 30% completion with
 *                 real demand present. Zero-traffic broken caps default to
 *                 quarantine (delisting costs nothing; deletion is P1's call)
 *   unverified  — denylisted vendors (verify via piggyback/real traffic)
 *
 * The bucket is a PROPOSAL for the P1 pass, not an action. Nothing here
 * writes to the DB.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
config({ path: resolve(import.meta.dirname, "../../../.env") });

// Same exclusion list as since-last-ext.ts / today-overview.ts.
const EXCLUDED_EMAILS = ["petter@strale.io", "test@strale.io", "test2@strale.io", "system@strale.internal", "test@example.com"];

const WINDOW_DAYS = 90;
const FLOOR_QUARANTINE = 0.70; // DEC-20260812-A confirmed defaults
const FLOOR_DEACTIVATE = 0.30;
const MIN_CALLS = 10;

async function main() {
  const args = process.argv.slice(2);
  const sweepIdx = args.indexOf("--sweep");
  if (sweepIdx < 0) { console.error("--sweep <path.jsonl> required"); process.exit(1); }
  const sweepPath = resolve(args[sweepIdx + 1]);

  const last = new Map<string, any>();
  for (const line of readFileSync(sweepPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); last.set(r.slug, r); } catch { /* skip */ }
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

  const traffic = await sql<{
    slug: string; calls: number; completed: number; revenue_cents: number;
  }[]>`
    SELECT c.slug,
           COUNT(t.id)::int AS calls,
           COUNT(t.id) FILTER (WHERE t.status = 'completed')::int AS completed,
           COALESCE(SUM(t.price_cents) FILTER (WHERE t.status = 'completed'), 0)::int AS revenue_cents
    FROM capabilities c
    LEFT JOIN transactions t
      ON t.capability_id = c.id
     AND t.created_at > NOW() - INTERVAL '${sql.unsafe(String(WINDOW_DAYS))} days'
     AND (t.user_id IS NULL OR t.user_id NOT IN (SELECT id FROM users WHERE email = ANY(${EXCLUDED_EMAILS})))
    WHERE c.is_active = true
    GROUP BY c.slug`;
  await sql.end();

  const tmap = new Map(traffic.map((t) => [t.slug, t]));
  type Bucket = "keep" | "fix" | "quarantine" | "retire-candidate" | "unverified";
  const rows: { slug: string; bucket: Bucket; sweep: string; reason: string; calls: number; completion: number | null; revenue: number }[] = [];

  for (const [slug, r] of [...last.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const t = tmap.get(slug) ?? { calls: 0, completed: 0, revenue_cents: 0 };
    const completion = t.calls > 0 ? t.completed / t.calls : null;
    const lowTraffic = t.calls >= MIN_CALLS && completion !== null && completion < FLOOR_QUARANTINE;
    const deadTraffic = t.calls >= MIN_CALLS && completion !== null && completion < FLOOR_DEACTIVATE;

    let bucket: Bucket; let reason: string;
    switch (r.outcome) {
      case "PASS":
        if (deadTraffic) { bucket = "quarantine"; reason = `sweep passes but real completion ${(completion! * 100).toFixed(0)}% — inputs customers actually send fail`; }
        else if (lowTraffic) { bucket = "fix"; reason = `sweep passes but real completion ${(completion! * 100).toFixed(0)}% — investigate real-input failure modes`; }
        else { bucket = "keep"; reason = "prod-verified"; }
        break;
      case "FIXTURE_FAIL": bucket = "fix"; reason = `fixture assertions fail in prod: ${(r.failedChecks ?? []).slice(0, 2).join("; ").slice(0, 120)}`; break;
      case "ROUTE_REJECTED": bucket = "fix"; reason = `route rejects its own known_answer input (${r.detail?.slice(0, 100)}) — the #168/#173 schema-gate class`; break;
      case "EXEC_FAIL_ENV": bucket = "fix"; reason = `prod env/config gap: ${r.detail?.slice(0, 100)}`; break;
      case "EXEC_FAIL_UPSTREAM":
        bucket = deadTraffic ? "retire-candidate" : "quarantine";
        reason = `execution fails in prod: ${r.detail?.slice(0, 100)}`;
        break;
      case "ASYNC_TIMEOUT": bucket = "fix"; reason = `no terminal status within poll budget (${r.detail})`; break;
      case "DENYLISTED": bucket = "unverified"; reason = `vendor denylisted (${r.detail}) — verify via piggyback/real traffic`; break;
      default: bucket = "fix"; reason = `${r.outcome}: ${r.detail?.slice(0, 100)}`;
    }
    rows.push({ slug, bucket, sweep: r.outcome, reason, calls: t.calls, completion, revenue: t.revenue_cents });
  }

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.bucket] = (counts[r.bucket] ?? 0) + 1;

  const day = new Date().toISOString().slice(0, 10);
  const out: string[] = [];
  out.push(`# Capability Disposition v1 — ${day}`);
  out.push("");
  out.push(`Readiness P0 exit artifact (DEC-20260812-A). Source: production sweep (${sweepPath.split(/[\\/]/).pop()}) + ${WINDOW_DAYS}-day external traffic. Buckets are proposals for P1, not actions.`);
  out.push("");
  out.push("| Bucket | Count |");
  out.push("|---|---|");
  for (const b of ["keep", "fix", "quarantine", "retire-candidate", "unverified"]) out.push(`| ${b} | ${counts[b] ?? 0} |`);
  out.push("");
  for (const b of ["fix", "quarantine", "retire-candidate", "unverified", "keep"]) {
    const rs = rows.filter((r) => r.bucket === b);
    if (!rs.length) continue;
    out.push(`## ${b} (${rs.length})`);
    out.push("");
    out.push("| Capability | Sweep | 90d calls | Completion | Revenue | Reason |");
    out.push("|---|---|---|---|---|---|");
    for (const r of rs.sort((a, b2) => b2.calls - a.calls)) {
      out.push(`| ${r.slug} | ${r.sweep} | ${r.calls} | ${r.completion === null ? "—" : (r.completion * 100).toFixed(0) + "%"} | €${(r.revenue / 100).toFixed(2)} | ${r.reason.replace(/\|/g, "/")} |`);
    }
    out.push("");
  }

  const outPath = resolve(import.meta.dirname, `../../../audit-output/disposition-v1-${day}.md`);
  writeFileSync(outPath, out.join("\n"));
  console.log(`wrote ${outPath}`);
  console.log(JSON.stringify(counts));
}

main();
