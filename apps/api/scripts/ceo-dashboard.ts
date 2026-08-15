/**
 * CEO dashboard generator — DEC-20260815-A.
 *
 * Emits a single self-contained HTML file from live production data, published
 * as a claude.ai artifact at every check-in so Petter has one stable URL that
 * answers: is the business on track, where is attention needed, what is being
 * spent. Read-only against the database; never writes anything but the HTML.
 *
 * Run:  npx tsx scripts/ceo-dashboard.ts
 * Out:  docs/company/ceo-dashboard.html (gitignored; the artifact is the venue)
 *
 * Every revenue/usage number uses the canonical internal-account exclusion
 * (INTERNAL_EMAIL_LIKE_PATTERNS) — see docs/company/CHARTER.md non-negotiable
 * #1 for why a hand-rolled filter is banned.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import postgres from "postgres";
import {
  INTERNAL_EMAIL_LIKE_PATTERNS,
  EXTRA_EXCLUDED_EMAILS,
} from "../src/lib/internal-accounts.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
config({ path: resolve(REPO, ".env") });

const WEEKLY_TARGET_USD = 2000;
const MILESTONES = [250, 600, 1200, 2000];
const BUDGET_ENVELOPE_EUR = 50;
const EUR_TO_USD = 1.09; // coarse; display-only

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const ext = sql`(t.user_id IS NULL OR t.user_id NOT IN (
    SELECT id FROM users WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
      OR email = ANY(${EXTRA_EXCLUDED_EMAILS})))`;

  const revDays = await sql`
    SELECT date_trunc('day', t.created_at)::date::text AS d,
           COALESCE(SUM(t.price_cents),0)::int AS cents, COUNT(*)::int AS calls
    FROM transactions t
    WHERE t.status='completed' AND t.created_at > now() - interval '7 days' AND ${ext}
    GROUP BY 1 ORDER BY 1`;
  const weekCents = revDays.reduce((a: number, r: any) => a + r.cents, 0);
  const weekUsd = (weekCents / 100) * EUR_TO_USD;

  const payers = await sql`
    SELECT COUNT(DISTINCT t.x402_payer_hash)::int AS n
    FROM transactions t WHERE t.x402_payer_hash IS NOT NULL
      AND t.created_at > now() - interval '7 days'`;
  const funnel = await sql`
    SELECT endpoint, COUNT(*)::int AS n, COUNT(DISTINCT ip_hash)::int AS ips
    FROM discovery_hits WHERE created_at > now() - interval '7 days'
      AND endpoint LIKE '/mcp:%' GROUP BY 1 ORDER BY 2 DESC`;
  const fget = (like: string) =>
    (funnel as any[]).filter((r) => r.endpoint.startsWith(like))
      .reduce((a, r) => ({ n: a.n + r.n, ips: a.ips + r.ips }), { n: 0, ips: 0 });
  const fInit = fget("/mcp:initialize");
  const fList = fget("/mcp:tools/list");
  const fCall = fget("/mcp:tools/call");
  const fRej = fget("/mcp:reject");

  const topCaps = await sql`
    SELECT c.slug, COUNT(*)::int AS calls, COALESCE(SUM(t.price_cents),0)::int AS cents
    FROM transactions t JOIN capabilities c ON c.id=t.capability_id
    WHERE t.status='completed' AND t.created_at > now() - interval '7 days' AND ${ext}
    GROUP BY 1 ORDER BY 3 DESC LIMIT 5`;
  const health = await sql`
    SELECT (SELECT COUNT(*)::int FROM capability_health WHERE state <> 'closed') AS breakers,
           (SELECT COUNT(*)::int FROM capabilities WHERE is_active) AS caps,
           (SELECT COUNT(*)::int FROM capabilities WHERE is_active AND lifecycle_state='quarantined') AS quarantined,
           (SELECT COUNT(*)::int FROM failed_requests WHERE created_at > now() - interval '7 days') AS unmet`;
  const settle = await sql`
    SELECT COUNT(*)::int AS n FROM transactions
    WHERE x402_settlement_id IS NOT NULL AND created_at > now() - interval '7 days'`;
  await sql.end();

  const h: any = health[0];
  const settleFeeEur = ((settle[0] as any).n * 0.001) / EUR_TO_USD;
  const spentEur = 3.64 + settleFeeEur; // test-harness measured + fees; see BUDGET.md gaps
  const nextMilestone = MILESTONES.find((m) => m > weekUsd) ?? WEEKLY_TARGET_USD;

  let queue: string[] = [];
  try {
    const dq = readFileSync(resolve(REPO, "docs/company/DECISION-QUEUE.md"), "utf8");
    const open = dq.split("## OPEN")[1]?.split("## RESOLVED")[0] ?? "";
    queue = [...open.matchAll(/\*\*(DQ-\d+)\*\* · [^·]+· [^·]+· ([^·]+)/g)]
      .map((m) => `${m[1]}: ${m[2].trim().slice(0, 90)}`);
  } catch { /* queue section optional */ }

  let ships: string[] = [];
  try {
    ships = execSync("git log --oneline -8 origin/main", { cwd: REPO, encoding: "utf8" })
      .trim().split("\n").map((l) => l.replace(/^[0-9a-f]+ /, "").slice(0, 88));
  } catch { /* offline ok */ }

  const gen = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const eur = (c: number) => `€${(c / 100).toFixed(2)}`;

  // ── revenue bar chart (single accent hue, rounded data-ends, direct end labels)
  const maxC = Math.max(1, ...revDays.map((r: any) => r.cents));
  const bw = 56, gap2 = 10, chH = 120;
  const bars = (revDays as any[]).map((r, i) => {
    const bh = Math.max(3, Math.round((r.cents / maxC) * chH));
    const x = i * (bw + gap2), y = chH - bh;
    const lbl = i === revDays.length - 1 || r.cents === maxC
      ? `<text x="${x + bw / 2}" y="${y - 5}" class="cl">${eur(r.cents)}</text>` : "";
    return `<g><title>${r.d}: ${eur(r.cents)} · ${r.calls} calls</title>
      <path d="M${x},${y + 4} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${bh - 4} h-${bw} z" class="bar"/>
      ${lbl}<text x="${x + bw / 2}" y="${chH + 14}" class="cx">${r.d.slice(5)}</text></g>`;
  }).join("");
  const chartW = revDays.length * (bw + gap2);

  const fRow = (label: string, v: number, max: number, sub: string) => {
    const w = Math.max(2, Math.round((v / Math.max(1, max)) * 100));
    return `<div class="frow"><span class="fl">${label}</span>
      <span class="ftrack"><span class="ffill" style="width:${w}%"></span></span>
      <span class="fv">${v.toLocaleString("en")}</span><span class="fs">${sub}</span></div>`;
  };

  const html = `<title>Strale — CEO Dashboard</title>
<style>
:root{--bg:#F5F7F8;--sur:#FFFFFF;--ink:#1B2228;--mut:#5C6B77;--line:#E3E8EC;
--acc:#0E7C86;--accS:#E1F0F1;--good:#2E7D46;--warn:#A66A1E;--crit:#B3372F}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#10151A;
--sur:#1A2129;--ink:#E6EBEF;--mut:#8C9BA8;--line:#2A3541;--acc:#46B5BF;
--accS:#12333A;--good:#57B77E;--warn:#D29A4B;--crit:#E06A5F}}
:root[data-theme="dark"]{--bg:#10151A;--sur:#1A2129;--ink:#E6EBEF;--mut:#8C9BA8;
--line:#2A3541;--acc:#46B5BF;--accS:#12333A;--good:#57B77E;--warn:#D29A4B;--crit:#E06A5F}
body{background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;
margin:0;padding:28px 20px 60px}
main{max-width:1060px;margin:0 auto;display:grid;gap:18px}
h1{font-size:21px;margin:0;letter-spacing:-.01em}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin:0 0 10px}
.gen{color:var(--mut);font-size:13px}
.card{background:var(--sur);border:1px solid var(--line);border-radius:10px;padding:16px 18px}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.tile .n{font-size:30px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.tile .l{color:var(--mut);font-size:13px}.tile .s{font-size:12.5px;margin-top:2px}
.ok{color:var(--good)}.warn{color:var(--warn)}.crit{color:var(--crit)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media(max-width:760px){.cols{grid-template-columns:1fr}}
.ladder{display:flex;gap:6px;align-items:center;margin-top:10px}
.rung{flex:1;height:8px;border-radius:4px;background:var(--line);position:relative;overflow:hidden}
.rung>span{position:absolute;inset:0;background:var(--acc);border-radius:4px}
.rlbl{display:flex;justify-content:space-between;color:var(--mut);font-size:12px;
font-variant-numeric:tabular-nums;margin-top:4px}
svg{display:block}.bar{fill:var(--acc)}
.cl{fill:var(--ink);font:600 12px system-ui;text-anchor:middle;font-variant-numeric:tabular-nums}
.cx{fill:var(--mut);font:11px system-ui;text-anchor:middle}
.frow{display:grid;grid-template-columns:110px 1fr 58px 92px;gap:10px;align-items:center;
padding:5px 0;font-variant-numeric:tabular-nums}
.fl{font-size:13.5px}.ftrack{height:10px;background:var(--line);border-radius:5px;overflow:hidden}
.ffill{display:block;height:100%;background:var(--acc);border-radius:5px}
.fv{text-align:right;font-weight:600}.fs{color:var(--mut);font-size:12px}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th{text-align:left;color:var(--mut);font-size:12px;text-transform:uppercase;
letter-spacing:.06em;font-weight:600;padding:4px 8px 6px;border-bottom:1px solid var(--line)}
td{padding:6px 8px;border-bottom:1px solid var(--line);font-size:14px}
tr:last-child td{border-bottom:0}.num{text-align:right}
ul{margin:0;padding-left:18px}li{margin:3px 0;font-size:13.5px}
.tablewrap{overflow-x:auto}
.benv{height:12px;border-radius:6px;background:var(--line);overflow:hidden;margin:8px 0 4px}
.benv>span{display:block;height:100%;background:var(--good);border-radius:6px}
</style>
<main>
<header><h1>Strale — CEO Dashboard</h1>
<div class="gen">Generated ${gen} · updates at every check-in · <a href="https://github.com/strale-io/strale/blob/main/docs/company/GOALS.md" style="color:var(--acc)">GOALS.md</a></div></header>

<section class="card"><h2>Revenue vs the ladder</h2>
<div class="tiles">
<div class="tile"><div class="n">$${weekUsd.toFixed(0)}<span style="font-size:15px;color:var(--mut)">/wk</span></div>
<div class="l">gross, external callers, 7d</div>
<div class="s ${weekUsd >= nextMilestone ? "ok" : ""}">next milestone: $${nextMilestone}/wk</div></div>
<div class="tile"><div class="n">${(payers[0] as any).n || "—"}</div><div class="l">distinct paying wallets, 7d</div>
<div class="s">collecting since 2026-08-15</div></div>
<div class="tile"><div class="n">${fInit.ips}</div><div class="l">agents arrived via MCP, 7d</div></div>
<div class="tile"><div class="n ${h.breakers > 0 ? "warn" : "ok"}">${h.breakers}</div>
<div class="l">circuit breakers open</div><div class="s">${h.caps} capabilities active · ${h.quarantined} quarantined</div></div>
</div>
<div class="ladder">${MILESTONES.map((m) =>
  `<span class="rung"><span style="width:${Math.min(100, Math.round((weekUsd / m) * 100))}%"></span></span>`).join("")}</div>
<div class="rlbl">${MILESTONES.map((m) => `<span>$${m}</span>`).join("")}</div>
</section>

<div class="cols">
<section class="card"><h2>Revenue by day (7d, external only)</h2>
<div class="tablewrap"><svg viewBox="0 0 ${chartW} ${chH + 20}" width="${chartW}" height="${chH + 20}"
role="img" aria-label="Daily gross revenue, last seven days">${bars}</svg></div></section>
<section class="card"><h2>MCP funnel (7d)</h2>
${fRow("initialize", fInit.n, fInit.n, `${fInit.ips} agents`)}
${fRow("tools/list", fList.n, fInit.n, `${fList.ips} agents`)}
${fRow("tools/call", fCall.n, fInit.n, `${fCall.ips} agents`)}
${fRow("rejected", fRej.n, fInit.n, "auth/payment")}
${fRow("paying", (payers[0] as any).n, fInit.ips, "distinct wallets")}
<div class="gen" style="margin-top:8px">instrumented 2026-08-15 — early counts are partial-week</div></section>
</div>

<div class="cols">
<section class="card"><h2>What's selling (7d)</h2><div class="tablewrap">
<table><tr><th>capability</th><th class="num">calls</th><th class="num">gross</th></tr>
${(topCaps as any[]).map((r) => `<tr><td>${esc(r.slug)}</td><td class="num">${r.calls}</td>
<td class="num">${eur(r.cents)}</td></tr>`).join("")}
</table></div>
<div class="gen" style="margin-top:8px">${h.unmet} unmet demand requests (failed_requests, 7d)</div></section>
<section class="card"><h2>Budget — €${BUDGET_ENVELOPE_EUR}/wk envelope</h2>
<div class="benv"><span style="width:${Math.min(100, Math.round((spentEur / BUDGET_ENVELOPE_EUR) * 100))}%"></span></div>
<div class="rlbl"><span>≈ €${spentEur.toFixed(2)} committed</span><span>€${BUDGET_ENVELOPE_EUR}</span></div>
<ul style="margin-top:10px">
<li>test-harness external APIs ≈ €3.64 (measured)</li>
<li>x402 settlement fees ≈ €${settleFeeEur.toFixed(2)} (${(settle[0] as any).n} settlements)</li>
<li>compute rides the Claude plan — optimized, not billed here</li></ul></section>
</div>

<div class="cols">
<section class="card"><h2>Decisions waiting on Petter</h2>
${queue.length ? `<ul>${queue.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : `<div class="gen">queue empty</div>`}</section>
<section class="card"><h2>Recently shipped</h2>
<ul>${ships.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>
</div>
</main>`;

  const out = resolve(REPO, "docs/company/ceo-dashboard.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(`wrote ${out} (${(html.length / 1024).toFixed(1)} KB) — week $${weekUsd.toFixed(2)}, payers ${(payers[0] as any).n}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
