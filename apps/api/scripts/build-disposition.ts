/**
 * Disposition table builder (Readiness program — DEC-20260812-A).
 *
 *   npx tsx scripts/build-disposition.ts --sweep ../../audit-output/prod-sweep-YYYY-MM-DD.jsonl
 *
 * Joins the production sweep verdict (last record per slug) with real external
 * traffic and proposes a disposition bucket per capability. Floor decisions use
 * the DEC-20260812-A window verbatim: ≥10 external calls in the last 30 days;
 * <70% completion → quarantine proposal, <30% → deactivate proposal. A 90-day
 * column is shown for context only and drives nothing.
 *
 * Output goes to audit-output/disposition-generated-<date>.md — a NEW file,
 * never overwriting a hand-annotated disposition. Buckets are PROPOSALS for
 * the P1 pass, not actions. Nothing here writes to the DB.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { EXCLUDED_EMAILS } from "./lib/internal-accounts.js";
config({ path: resolve(import.meta.dirname, "../../../.env") });

const FLOOR_WINDOW_DAYS = 30;   // DEC-20260812-A, verbatim
const CONTEXT_WINDOW_DAYS = 90; // context only
const FLOOR_QUARANTINE = 0.70;
const FLOOR_DEACTIVATE = 0.30;
const MIN_CALLS = 10;

// Slugs excluded from disposition with a printed reason (in-flight work owned
// by another session, etc.). Keep short; every entry must carry its reason.
const EXCLUDED_SLUGS = new Map<string, string>([
  ["page-exists", "in-flight onboarding (created 2026-08-12, visible=false, x402=false) — not yet deployed, another session owns it"],
]);

// Older sweep files predate the CIRCUIT_OPEN / NO_EXECUTOR_DEPLOYED /
// EXEC_FAIL_* sync-path classification — normalize their HTTP_OTHER rows by
// detail message so re-analysis of an old JSONL gives current semantics.
function normalizeOutcome(r: any): string {
  if (r.outcome !== "HTTP_OTHER") return r.outcome;
  const d = String(r.detail ?? "");
  if (/temporarily suspended/i.test(d)) return "CIRCUIT_OPEN";
  if (/no executor/i.test(d)) return "NO_EXECUTOR_DEPLOYED";
  if (/HTTP 500/.test(d)) return /is required|not set|not configured|missing.*key|no api key|credential/i.test(d) ? "EXEC_FAIL_ENV" : "EXEC_FAIL_UPSTREAM";
  return r.outcome;
}

async function main() {
  const args = process.argv.slice(2);
  const sweepIdx = args.indexOf("--sweep");
  const sweepArg = sweepIdx >= 0 ? args[sweepIdx + 1] : undefined;
  if (!sweepArg || sweepArg.startsWith("--")) { console.error("--sweep <path.jsonl> required"); process.exit(1); }
  const sweepPath = resolve(sweepArg);
  if (!existsSync(sweepPath)) { console.error(`sweep file not found: ${sweepPath}`); process.exit(1); }

  const last = new Map<string, any>();
  for (const line of readFileSync(sweepPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); last.set(r.slug, r); } catch { /* skip */ }
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: "require" });

  const traffic = await sql<{
    slug: string; calls_30d: number; completed_30d: number;
    calls_90d: number; completed_90d: number; revenue_cents_90d: number;
  }[]>`
    SELECT c.slug,
           COUNT(t.id) FILTER (WHERE t.created_at > NOW() - INTERVAL '30 days')::int AS calls_30d,
           COUNT(t.id) FILTER (WHERE t.created_at > NOW() - INTERVAL '30 days' AND t.status = 'completed')::int AS completed_30d,
           COUNT(t.id)::int AS calls_90d,
           COUNT(t.id) FILTER (WHERE t.status = 'completed')::int AS completed_90d,
           COALESCE(SUM(t.price_cents) FILTER (WHERE t.status = 'completed'), 0)::int AS revenue_cents_90d
    FROM capabilities c
    LEFT JOIN transactions t
      ON t.capability_id = c.id
     AND t.created_at > NOW() - INTERVAL '90 days'
     AND (t.user_id IS NULL OR t.user_id NOT IN (SELECT id FROM users WHERE email = ANY(${EXCLUDED_EMAILS})))
    WHERE c.is_active = true
    GROUP BY c.slug`;
  const activeCount = (await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM capabilities WHERE is_active = true`)[0].n;
  await sql.end();

  const tmap = new Map(traffic.map((t) => [t.slug, t]));
  type Bucket = "keep" | "fix" | "quarantine-proposal" | "deactivate-proposal" | "retire-candidate" | "not-verified" | "unverified-by-policy" | "excluded";
  const rows: { slug: string; bucket: Bucket; sweep: string; reason: string; calls30: number; comp30: number | null; calls90: number; comp90: number | null; revenue: number }[] = [];

  for (const [slug, r] of [...last.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const t = tmap.get(slug) ?? { calls_30d: 0, completed_30d: 0, calls_90d: 0, completed_90d: 0, revenue_cents_90d: 0 };
    const comp30 = t.calls_30d > 0 ? t.completed_30d / t.calls_30d : null;
    const comp90 = t.calls_90d > 0 ? t.completed_90d / t.calls_90d : null;
    const floorEligible = t.calls_30d >= MIN_CALLS && comp30 !== null;
    const belowQuarantine = floorEligible && comp30! < FLOOR_QUARANTINE;
    const belowDeactivate = floorEligible && comp30! < FLOOR_DEACTIVATE;
    const outcome = normalizeOutcome(r);

    let bucket: Bucket; let reason: string;
    if (EXCLUDED_SLUGS.has(slug)) {
      bucket = "excluded"; reason = EXCLUDED_SLUGS.get(slug)!;
    } else switch (outcome) {
      case "PASS":
        if (belowDeactivate) { bucket = "deactivate-proposal"; reason = `fixture passes but 30d real completion ${(comp30! * 100).toFixed(0)}% (<30% floor) — inputs customers actually send fail`; }
        else if (belowQuarantine) { bucket = "quarantine-proposal"; reason = `fixture passes but 30d real completion ${(comp30! * 100).toFixed(0)}% (<70% floor) — investigate real-input failure modes`; }
        else { bucket = "keep"; reason = "prod-verified"; }
        break;
      case "FIXTURE_FAIL": bucket = "fix"; reason = `fixture assertions fail in prod: ${(r.failedChecks ?? []).slice(0, 2).join("; ").slice(0, 120)}`; break;
      case "ROUTE_REJECTED": bucket = "fix"; reason = `route rejects its own known_answer input (${r.detail?.slice(0, 100)}) — the #168/#173 schema-gate class`; break;
      case "EXEC_FAIL_ENV": bucket = "fix"; reason = `prod env/config gap: ${r.detail?.slice(0, 100)}`; break;
      case "EXEC_FAIL_UPSTREAM":
        bucket = belowDeactivate ? "retire-candidate" : "fix";
        reason = `execution fails in prod: ${r.detail?.slice(0, 100)}`;
        break;
      case "CIRCUIT_OPEN": bucket = "not-verified"; reason = `breaker open during sweep — no verdict; re-sweep after recovery (${r.detail?.slice(0, 80)})`; break;
      case "NO_EXECUTOR_DEPLOYED": bucket = "fix"; reason = "catalog row active but no executor deployed — ship the code or deactivate the row"; break;
      case "NO_FIXTURE": bucket = "not-verified"; reason = "no active known_answer suite — unverifiable until a fixture exists"; break;
      case "ASYNC_TIMEOUT": bucket = "fix"; reason = `no terminal status within poll budget (${r.detail})`; break;
      case "DENYLISTED": bucket = "unverified-by-policy"; reason = `vendor denylisted (${r.detail}) — verify via piggyback/real traffic`; break;
      default: bucket = "fix"; reason = `${outcome}: ${r.detail?.slice(0, 100)}`;
    }
    rows.push({ slug, bucket, sweep: outcome, reason, calls30: t.calls_30d, comp30, calls90: t.calls_90d, comp90, revenue: t.revenue_cents_90d });
  }

  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.bucket] = (counts[r.bucket] ?? 0) + 1;

  const day = new Date().toISOString().slice(0, 10);
  const pct = (v: number | null) => (v === null ? "—" : (v * 100).toFixed(0) + "%");
  const out: string[] = [];
  out.push(`# Capability Disposition (generated) — ${day}`);
  out.push("");
  out.push(`Readiness program artifact (DEC-20260812-A). Source: production sweep \`${sweepPath.split(/[\\/]/).pop()}\` + external traffic (internal accounts excluded). **Buckets are proposals for the P1 pass, not actions — nothing has been delisted or deactivated by this script.**`);
  out.push("");
  out.push(`Coverage: ${activeCount} active capabilities, ${rows.length} in this table${activeCount !== rows.length ? ` (${activeCount - rows.length} missing from the sweep file — re-run the sweep)` : ""}.`);
  out.push("");
  out.push("**Floor rule applied (DEC-20260812-A, verbatim):** ≥10 external calls in the last 30 days; completion <70% → quarantine proposal; <30% → deactivate proposal. The 90d columns are context only.");
  out.push("");
  out.push("**What this cannot see:** the sweep sends one canned fixture input per capability, so it measures \"does the declared contract hold for a known-good input\" — not the real-input failure modes the 30d completion column captures, and not well-formed-but-empty responses (the dishonest-output class, deferred to P1).");
  out.push("");
  out.push("**Bucket legend:** `keep` verified + traffic healthy · `fix` named defect (fixture, config, schema gate, or execution) · `quarantine-proposal` / `deactivate-proposal` below the traffic floor · `retire-candidate` broken in sweep AND below deactivate floor · `not-verified` sweep could not produce a verdict (breaker open, no fixture) · `unverified-by-policy` vendor denylisted · `excluded` see reason.");
  out.push("");
  out.push("**Sweep-code legend:** PASS assertions hold · FIXTURE_FAIL assertions fail · ROUTE_REJECTED input schema blocks the fixture · EXEC_FAIL_ENV/_UPSTREAM execution failed (config / upstream) · CIRCUIT_OPEN breaker was open · NO_EXECUTOR_DEPLOYED catalog row without code · ASYNC_TIMEOUT no terminal status in 180s. Sample-size caveat: completion % on <10 calls is noise, not signal.");
  out.push("");
  out.push("| Bucket | Count |");
  out.push("|---|---|");
  const bucketOrder: Bucket[] = ["keep", "fix", "quarantine-proposal", "deactivate-proposal", "retire-candidate", "not-verified", "unverified-by-policy", "excluded"];
  for (const b of bucketOrder) out.push(`| ${b} | ${counts[b] ?? 0} |`);
  out.push("");
  for (const b of bucketOrder) {
    const rs = rows.filter((r) => r.bucket === b);
    if (!rs.length) continue;
    out.push(`## ${b} (${rs.length})`);
    out.push("");
    out.push("| Capability | Sweep | 30d calls | 30d compl. | 90d calls | 90d compl. | 90d revenue | Reason |");
    out.push("|---|---|---|---|---|---|---|---|");
    for (const r of rs.sort((a, b2) => b2.calls90 - a.calls90)) {
      out.push(`| ${r.slug} | ${r.sweep} | ${r.calls30} | ${pct(r.comp30)} | ${r.calls90} | ${pct(r.comp90)} | €${(r.revenue / 100).toFixed(2)} | ${r.reason.replace(/\|/g, "/")} |`);
    }
    out.push("");
  }

  const outPath = resolve(import.meta.dirname, `../../../audit-output/disposition-generated-${day}.md`);
  writeFileSync(outPath, out.join("\n"));
  console.log(`wrote ${outPath}`);
  console.log(JSON.stringify(counts));
}

main().catch((e) => {
  console.error("build-disposition failed:", e?.message ?? e);
  process.exit(1);
});
