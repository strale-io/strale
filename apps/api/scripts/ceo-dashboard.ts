/**
 * CEO dashboard generator — DEC-20260815-A.
 *
 * Emits a single self-contained HTML file from live production data, produced at
 * every check-in so Petter has one place that answers: is the business on track,
 * where does it need attention, what is being spent. Read-only against the
 * database; writes nothing but the HTML.
 *
 * Run:  npx tsx scripts/ceo-dashboard.ts
 * Out:  docs/company/ceo-dashboard.html (gitignored)
 *
 * Two rules this file exists to enforce, both learned the hard way:
 *   1. Every revenue/usage number goes through the canonical internal-account
 *      exclusion. ~98% of traffic is our own test harness, and a hand-rolled
 *      filter has twice produced a confidently wrong strategic conclusion.
 *   2. A metric whose instrument is younger than its window is not reported.
 *      A one-day-old payer column rendered as "1" reads as "we have one
 *      customer" when it means "we started counting yesterday".
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import postgres from "postgres";
import { DESIGN_SYSTEM_CSS } from "./lib/design-system.js";
import {
  INTERNAL_EMAIL_LIKE_PATTERNS,
  EXTRA_EXCLUDED_EMAILS,
} from "../src/lib/internal-accounts.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
config({ path: resolve(REPO, ".env") });

/** Milestones in EUR, matching docs/company/GOALS.md. The ledger is EUR; USD is display-only. */
const MILESTONES = [230, 550, 1100, 1850];
const BUDGET_ENVELOPE_EUR = 50;

/**
 * Commit subjects are written for engineers ("fix(mcp): scope the bonus to
 * qualifying solutions"). This dashboard is read by one non-technical person,
 * so the shipped list is rewritten into ordinary sentences before display.
 *
 * The rewrite is best-effort: without a key, on any API error, or if the model
 * returns the wrong number of lines, it falls back to stripping the
 * conventional-commit prefix. A wrong-length response is treated as failure
 * rather than zipped up, because a misaligned list would attach the wrong
 * description to the wrong change — worse than leaving the jargon in.
 */
async function toPlainEnglish(subjects: string[]): Promise<string[]> {
  const fallback = subjects.map((s) =>
    s.replace(/^\w+(\([^)]*\))?!?:\s*/, "").replace(/^./, (c) => c.toUpperCase()));
  if (!process.env.ANTHROPIC_API_KEY || subjects.length === 0) return fallback;
  try {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    const res = await new Anthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{
        role: "user",
        content:
          "Rewrite each line below as one short sentence a non-technical business " +
          "owner would understand. No jargon, no acronyms, no code names. Say what " +
          "changed for the business or the customer. Max 11 words each. Return " +
          `exactly ${subjects.length} lines, in the same order, no numbering.\n\n` +
          subjects.join("\n"),
      }],
    });
    const lines = res.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text).join("")
      .trim().split("\n").map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
      .filter(Boolean);
    return lines.length === subjects.length ? lines : fallback;
  } catch {
    return fallback;
  }
}

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
  const weekEur = weekCents / 100;

  // Prior 7-day window, so the headline can carry a real delta rather than an
  // adjective.
  const prev = await sql`
    SELECT COALESCE(SUM(t.price_cents),0)::int AS cents, COUNT(*)::int AS calls
    FROM transactions t WHERE t.status='completed'
      AND t.created_at BETWEEN now() - interval '14 days' AND now() - interval '7 days'
      AND ${ext}`;
  const prevEur = (prev[0] as any).cents / 100;
  const weekCalls = revDays.reduce((a: number, r: any) => a + r.calls, 0);

  // Payer identity, through the same external filter as every other money
  // number. `since` is the age of the instrument (see rule 2 above).
  const payers = await sql`
    SELECT COUNT(DISTINCT t.x402_payer_hash)::int AS n, MIN(t.created_at) AS since
    FROM transactions t WHERE t.x402_payer_hash IS NOT NULL
      AND t.created_at > now() - interval '7 days' AND ${ext}`;
  const payerRow = payers[0] as any;
  const payerDays = payerRow.since
    ? (Date.now() - new Date(payerRow.since).getTime()) / 86_400_000
    : 0;
  const payerTrustworthy = payerDays >= 6;

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
    SELECT c.slug, c.category, COUNT(*)::int AS calls,
           COALESCE(SUM(t.price_cents),0)::int AS cents
    FROM transactions t JOIN capabilities c ON c.id=t.capability_id
    WHERE t.status='completed' AND t.created_at > now() - interval '7 days' AND ${ext}
    GROUP BY 1,2 ORDER BY 4 DESC LIMIT 6`;
  const health = await sql`
    SELECT (SELECT COUNT(*)::int FROM capability_health WHERE state <> 'closed') AS breakers,
           (SELECT COUNT(*)::int FROM capabilities WHERE is_active) AS caps,
           (SELECT COUNT(*)::int FROM capabilities WHERE is_active AND lifecycle_state='quarantined') AS quarantined,
           (SELECT COUNT(*)::int FROM failed_requests WHERE created_at > now() - interval '7 days') AS unmet`;
  const settle = await sql`
    SELECT COUNT(*)::int AS n FROM transactions
    WHERE x402_settlement_id IS NOT NULL AND created_at > now() - interval '7 days'`;
  // Forecast, not actuals — there is no invoice feed. Harness cost is each
  // suite's declared external cost times its runs in the window; an earlier
  // version hardcoded a measured constant and would have reported the same
  // figure every week forever.
  const harness = await sql`
    SELECT COALESCE(SUM(ts.external_cost_cents), 0)::int AS cents
    FROM test_results tr JOIN test_suites ts ON ts.id = tr.test_suite_id
    WHERE tr.executed_at > now() - interval '7 days'`;
  await sql.end();

  const h: any = health[0];
  const settleFeeEur = (settle[0] as any).n * 0.001 / 1.09;
  const harnessEur = (harness[0] as any).cents / 100;
  const spentEur = harnessEur + settleFeeEur;
  const nextMilestone = MILESTONES.find((m) => m > weekEur) ?? MILESTONES[MILESTONES.length - 1];
  const milestoneIdx = MILESTONES.indexOf(nextMilestone);

  interface QueueField { label: string; text: string }
  interface QueueItem { id: string; cls: string; owner: string; text: string; fields: QueueField[] }
  let queue: QueueItem[] = [];
  try {
    const dq = readFileSync(resolve(REPO, "docs/company/DECISION-QUEUE.md"), "utf8");
    const open = dq.split("## OPEN")[1]?.split("## RESOLVED")[0] ?? "";
    // Each entry is: a header line, a plain-English summary that may wrap over
    // several lines, then any number of *Label:* fields. The summary is what
    // shows collapsed; the fields fill the expanded panel, so the row can be
    // acted on without opening the repo.
    queue = open.split(/\n(?=\*\*DQ-)/).flatMap((block) => {
      const head = block.match(/\*\*(DQ-\d+)\*\*\s*·\s*`([a-z_]+)`\s*·\s*owner ([^·]+)·[^\n]*\n/);
      if (!head) return [];
      const body = block.slice(head[0].length);
      const clean = (t: string) => t.replace(/\s+/g, " ").replace(/[`*]/g, "").trim();
      const summary = clean(body.split(/\n\s*\*[A-Z]/)[0].split(/\n\s*\n/)[0]);
      const fields = [...body.matchAll(/\*([A-Z][^*:]*):\*\s*([\s\S]*?)(?=\n\s*\*[A-Z][^*:]*:\*|$)/g)]
        .map((f) => ({ label: f[1].trim(), text: clean(f[2]) }))
        .filter((f) => f.text.length > 0);
      return [{ id: head[1], cls: head[2], owner: head[3].trim(), text: summary, fields }];
    });
  } catch { /* queue file optional */ }


  interface Worker { name: string; when: string; does: string; reports: string; status: string }
  let workers: Worker[] = [];
  try {
    const wf = readFileSync(resolve(REPO, "docs/company/WORKFORCE.md"), "utf8");
    const flat = (t: string) => t.replace(/\s+/g, " ").replace(/[`*]/g, "").trim();
    workers = wf.split(/\n### /).slice(1).map((block) => {
      const [heading, ...rest] = block.split("\n");
      const [name, when] = heading.split("\u00b7");
      const body = rest.join("\n");
      const field = (label: string) => {
        const m = body.match(new RegExp("\\*\\*" + label + ":\\*\\*([\\s\\S]*?)(?=\\n\\*\\*|$)"));
        return m ? flat(m[1]) : "";
      };
      return {
        name: (name ?? "").trim(), when: (when ?? "").trim(),
        does: field("Does"), reports: field("Reports"), status: field("Status"),
      };
    }).filter((w) => w.name);
  } catch { /* workforce file optional */ }

  let ships: Array<{ text: string; when: string }> = [];
  try {
    const raw = execSync('git log -6 origin/main --date=relative --format=%s%x1f%ad',
      { cwd: REPO, encoding: "utf8" })
      .trim().split("\n").map((l) => {
        const [text, when] = l.split("\u001f");
        return { text: text.replace(/\s*\(#\d+\)$/, ""), when };
      });
    const plain = await toPlainEnglish(raw.map((r) => r.text));
    ships = raw.map((r, i) => ({ text: plain[i], when: r.when }));
  } catch { /* offline ok */ }

  const now = new Date();
  const gen = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const eur = (c: number) => `€${(c / 100).toFixed(2)}`;
  const pct = (a: number, b: number) => (b === 0 ? null : ((a - b) / b) * 100);

  const revDelta = pct(weekEur, prevEur);
  const deltaChip = (v: number | null, suffix = "") =>
    v === null ? `<span class="chip chip-flat">nothing to compare with yet</span>`
      : `<span class="chip ${v >= 0 ? "chip-up" : "chip-down"}">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="${v >= 0 ? "M2 7L5 3l3 4" : "M2 3l3 4 3-4"}" fill="none"
              stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>${v >= 0 ? "+" : ""}${v.toFixed(1)}%${suffix}</span>`;

  // ── icons (16px, 1.5 stroke — matched to the card label size)
  const ico: Record<string, string> = {
    wallet: `<path d="M2.5 5.5A1.5 1.5 0 014 4h8a1.5 1.5 0 011.5 1.5v5A1.5 1.5 0 0112 12H4a1.5 1.5 0 01-1.5-1.5z"/><path d="M10.5 8h1.5"/>`,
    users: `<circle cx="6" cy="6" r="2.2"/><path d="M2.5 13c0-2 1.6-3.3 3.5-3.3S9.5 11 9.5 13"/><path d="M10.8 4.2a2 2 0 010 3.6M11.5 12.8c0-1.4-.5-2.4-1.3-3"/>`,
    inbound: `<path d="M8 2.5v7"/><path d="M5 7l3 3 3-3"/><path d="M3 12.5h10"/>`,
    pulse: `<path d="M2 8h2.5l1.8-4 2.4 8 1.8-4H14"/>`,
    coin: `<circle cx="8" cy="8" r="5.5"/><path d="M8 5.2v5.6M6.4 6.6h2.4a1.2 1.2 0 010 2.4H6.4"/>`,
  };
  const icon = (k: string, cls: string) =>
    `<span class="ibadge ${cls}"><svg viewBox="0 0 16 16" width="16" height="16" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">${ico[k]}</svg></span>`;

  // ── revenue chart: bars, dashed gridlines, quiet axes, last day emphasised
  const CH = { w: 560, h: 170, pl: 42, pr: 8, pt: 12, pb: 26 };
  const plotW = CH.w - CH.pl - CH.pr, plotH = CH.h - CH.pt - CH.pb;
  const rawMax = Math.max(1, ...revDays.map((r: any) => r.cents));
  const step = Math.pow(10, Math.floor(Math.log10(rawMax || 1)));
  const yMax = Math.max(step, Math.ceil(rawMax / step) * step);
  const slot = plotW / Math.max(1, revDays.length);
  const barW = Math.min(38, slot * 0.52);
  const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const y = CH.pt + plotH - f * plotH;
    return `<line x1="${CH.pl}" y1="${y}" x2="${CH.w - CH.pr}" y2="${y}" class="grid"/>
      <text x="${CH.pl - 8}" y="${y + 3.5}" class="ytick">${eur(yMax * f)}</text>`;
  }).join("");
  const bars = (revDays as any[]).map((r, i) => {
    const bh = Math.max(2, (r.cents / yMax) * plotH);
    const x = CH.pl + i * slot + (slot - barW) / 2;
    const y = CH.pt + plotH - bh;
    const last = i === revDays.length - 1;
    const day = new Date(r.d + "T00:00:00Z")
      .toLocaleDateString("en", { weekday: "short", timeZone: "UTC" });
    return `<g class="barg"><title>${r.d} · ${eur(r.cents)} · ${r.calls} calls</title>
      <rect x="${CH.pl + i * slot}" y="${CH.pt}" width="${slot}" height="${plotH}" class="hit"/>
      <path d="M${x},${y + 3} a3,3 0 013-3 h${barW - 6} a3,3 0 013,3 v${bh - 3} h-${barW} z"
        class="bar${last ? " bar-last" : ""}"/>
      <text x="${x + barW / 2}" y="${CH.h - 8}" class="xtick${last ? " xtick-last" : ""}">${day}</text>
    </g>`;
  }).join("");

  const fRow = (label: string, v: number, max: number, note: string) => `
    <div class="frow">
      <span class="flabel">${label}</span>
      <span class="ftrack"><span class="ffill" style="width:${Math.max(1.5, (v / Math.max(1, max)) * 100)}%"></span></span>
      <span class="fval">${v.toLocaleString("en")}</span>
      <span class="fnote">${note}</span>
    </div>`;

  const capMax = Math.max(1, ...(topCaps as any[]).map((c) => c.cents));
  const budgetPct = Math.min(100, (spentEur / BUDGET_ENVELOPE_EUR) * 100);

  const html = `<title>Strale — CEO Dashboard</title>
<style>${DESIGN_SYSTEM_CSS}</style>

<div class="app">
<aside class="side">
  <div class="brand">
    <span class="blogo">S</span>
    <span><span class="bname">Strale</span><div class="bsub">Business overview</div></span>
  </div>

  <div>
    <div class="navgroup">Overview</div>
    <nav class="nav">
      <a class="on" href="#revenue"><span class="dot"></span>Money</a>
      <a href="#funnel"><span class="dot"></span>Getting customers</a>
      <a href="#selling"><span class="dot"></span>Best sellers<span class="count">${topCaps.length}</span></a>
    </nav>
  </div>

  <div>
    <div class="navgroup">Operations</div>
    <nav class="nav">
      <a href="#budget"><span class="dot"></span>Spending</a>
      <a href="#workforce"><span class="dot"></span>Who is working</a>
      <a href="#decisions"><span class="dot"></span>Decisions<span class="count">${queue.length}</span></a>
      <a href="#ships"><span class="dot"></span>Finished work</a>
    </nav>
  </div>

  <div class="usercard">
    <span class="avatar">PL</span>
    <span><div class="uname">Petter Lindström</div><div class="urole">Founder · Moonlighter AB</div></span>
  </div>
</aside>

<div class="main">
  <header class="topbar">
    <span class="ttl">Dashboard</span>
    <div class="topmeta">
      <span class="pill">Last 7 days</span>
      <span class="pill">Next goal <b>€${nextMilestone}</b> a week</span>
      <span class="pill">${gen}</span>
    </div>
  </header>

  <div class="content">

    <div class="kpis">
      <div class="kpi">
        <div class="krow"><span class="klabel">Money made this week</span>${icon("wallet", "i-acc")}</div>
        <div class="kval">€${weekEur.toFixed(2)}</div>
        <div class="kfoot">${deltaChip(revDelta)} compared with the week before (€${prevEur.toFixed(2)})</div>
      </div>

      <div class="kpi">
        <div class="krow"><span class="klabel">Paying customers</span>${icon("users", payerTrustworthy ? "i-good" : "i-warn")}</div>
        <div class="kval">${payerTrustworthy ? payerRow.n : "—"}</div>
        <div class="kfoot">${payerTrustworthy
          ? (payerRow.n === 1
            ? `<span class="chip chip-warn">all from one buyer</span> we need more`
            : `different buyers paid us`)
          : `<span class="chip chip-warn">too early to say</span> we only started counting ${payerDays.toFixed(1)} days ago`}</div>
      </div>

      <div class="kpi">
        <div class="krow"><span class="klabel">AI agents that found us</span>${icon("inbound", "i-neutral")}</div>
        <div class="kval">${fInit.ips}<span class="unit"> this week</span></div>
        <div class="kfoot">${fInit.n.toLocaleString("en")} visits · ${weekCalls} things bought</div>
      </div>

      <div class="kpi">
        <div class="krow"><span class="klabel">Services with problems</span>${icon("pulse", h.breakers > 0 ? "i-warn" : "i-good")}</div>
        <div class="kval">${h.breakers}<span class="unit"> switched off</span></div>
        <div class="kfoot">${h.caps} data services working · ${h.quarantined} paused</div>
      </div>

      <div class="kpi">
        <div class="krow"><span class="klabel">Money spent this week</span>${icon("coin", budgetPct > 80 ? "i-warn" : "i-good")}</div>
        <div class="kval">€${spentEur.toFixed(2)}<span class="unit"> / €${BUDGET_ENVELOPE_EUR}</span></div>
        <div class="kfoot">${budgetPct.toFixed(0)}% of the weekly limit · estimate</div>
      </div>
    </div>

    <div class="row row-2">
      <section class="card" id="revenue">
        <div class="chead"><span class="ctitle">Money made each day</span>
          <span class="pill" style="margin-left:auto">${weekCalls} sold</span></div>
        <div class="csub">Real customers only. Our own testing is never counted.</div>
        <div class="cbody">
          <div class="chartwrap">
            <svg class="chart" viewBox="0 0 ${CH.w} ${CH.h}" role="img"
              aria-label="Money made each day, last seven days">${grid}${bars}</svg>
          </div>
          <div class="ladder">
            ${MILESTONES.map((m) => {
              const f = Math.min(100, (weekEur / m) * 100);
              return `<span class="rung${f >= 100 ? " done" : ""}"><i style="width:${f}%"></i></span>`;
            }).join("")}
          </div>
          <div class="rlabels">${MILESTONES.map((m, i) =>
            `<span>M${i + 1} · €${m}</span>`).join("")}</div>
        </div>
      </section>

      <section class="card" id="funnel">
        <div class="chead"><span class="ctitle">Turning visitors into customers</span></div>
        <div class="csub">Where AI agents give up before paying</div>
        <div class="cbody">
          ${fRow("Found us", fInit.n, fInit.n, `${fInit.ips} agents`)}
          ${fRow("Looked around", fList.n, fInit.n, `${fList.ips} agents`)}
          ${fRow("Tried something", fCall.n, fInit.n, `${fCall.ips} agents`)}
          ${fRow("Turned away", fRej.n, fInit.n, "no account or payment")}
          ${payerTrustworthy ? fRow("Paid us", payerRow.n, fInit.ips, "different buyers") : ""}
          <div class="note">We started measuring this on 15 August, so the first week is
          incomplete. "Turned away" is the step we are trying to fix. Until this week we
          asked every AI agent to fill in a signup form, which a robot cannot do. Now we
          offer them a way to simply pay and carry on.</div>
        </div>
      </section>
    </div>

    <div class="row row-2">
      <section class="card" id="selling">
        <div class="chead"><span class="ctitle">What people are buying</span>
          <span class="pill" style="margin-left:auto">${h.unmet} we could not answer</span></div>
        <div class="csub">Our best sellers over the last seven days</div>
        <div class="cbody"><div class="tablewrap">
          <table>
            <thead><tr><th>What it does</th><th class="num">Times sold</th>
              <th>Share</th><th class="num">Money made</th></tr></thead>
            <tbody>${(topCaps as any[]).map((c) => `<tr>
              <td><div class="slug">${esc(c.slug)}</div><div class="cat">${esc(c.category ?? "")}</div></td>
              <td class="num">${c.calls.toLocaleString("en")}</td>
              <td><span class="mini"><i style="width:${(c.cents / capMax) * 100}%"></i></span></td>
              <td class="num">${eur(c.cents)}</td></tr>`).join("")}</tbody>
          </table>
        </div></div>
      </section>

      <section class="card" id="budget">
        <div class="chead"><span class="ctitle">Spending</span>
          <span class="pill" style="margin-left:auto">€${BUDGET_ENVELOPE_EUR}/wk</span></div>
        <div class="csub">What we pay other companies each week</div>
        <div class="cbody">
          <div class="benv"><i style="width:${budgetPct}%"></i></div>
          <div class="rlabels"><span>€${spentEur.toFixed(2)} spent</span>
            <span>€${(BUDGET_ENVELOPE_EUR - spentEur).toFixed(2)} left</span></div>
          <div class="blines">
            <div class="bline"><span class="bkey" style="background:var(--acc)"></span>
              Our own automatic testing<span class="amt">€${harnessEur.toFixed(2)}</span></div>
            <div class="bline"><span class="bkey" style="background:var(--acc-line)"></span>
              Payment processing fees<span class="amt">€${settleFeeEur.toFixed(2)}</span></div>
            <div class="bline"><span class="bkey" style="background:var(--line)"></span>
              My thinking time<span class="amt">included in your plan</span></div>
          </div>
          <div class="note">These are estimates, not real invoices. We work them out from
          what each test is known to cost and the standard payment fee. Worth checking
          against the real bills once a month.</div>
        </div>
      </section>
    </div>

    <section class="card" id="workforce">
      <div class="chead"><span class="ctitle">Who is working on this</span>
        <span class="pill" style="margin-left:auto">${workers.filter((w) => w.status.startsWith("running")).length} of ${workers.length} running</span></div>
      <div class="csub">The jobs that run on a schedule without anyone starting them</div>
      <div class="cbody"><div class="tablewrap">
        <table>
          <thead><tr><th>Job</th><th>When</th><th>What it does</th><th>State</th></tr></thead>
          <tbody>${workers.map((w) => {
            const on = w.status.startsWith("running");
            return `<tr>
              <td><div class="slug">${esc(w.name)}</div><div class="cat">${esc(w.reports)}</div></td>
              <td style="white-space:nowrap;color:var(--muted)">${esc(w.when)}</td>
              <td style="max-width:430px">${esc(w.does)}</td>
              <td><span class="tag ${on ? "t-auto" : "t-hold"}">${on ? "Running" : "Not yet"}</span></td>
            </tr>`;
          }).join("")}</tbody>
        </table>
      </div></div>
    </section>

    <div class="row row-even">
      <section class="card" id="decisions">
        <div class="chead"><span class="ctitle">Things I need you to decide</span>
          <span class="pill" style="margin-left:auto">${queue.length} waiting</span></div>
        <div class="csub">Click any line to see the detail. Nothing is stuck waiting.</div>
        <div class="cbody">
          ${queue.length ? queue.map((q) => `<details class="qitem">
            <summary>
              <span class="qid">${q.id}</span>
              <span class="qmain">
                <span class="qtext">${esc(q.text)}</span>
                <span class="qmeta">
                  <span class="tag ${q.cls === "your_call" ? "t-hold" : "t-auto"}">${
                    q.cls === "your_call" ? "Needs your yes" : "Done — tell me if you disagree"}</span>
                  <span class="qowner">${esc(q.owner)}</span>
                </span>
              </span>
              <span class="qchev" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12"
                fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
                stroke-linejoin="round"><path d="M3 4.5L6 7.5l3-3"/></svg></span>
            </summary>
            <div class="qbody">${q.fields.map((f) => `<div class="qfield">
              <span class="qflabel">${esc(f.label)}</span>
              <span class="qftext">${esc(f.text)}</span></div>`).join("")}</div>
          </details>`).join("")
            : `<div class="qtext">Nothing needs you right now.</div>`}
        </div>
      </section>

      <section class="card" id="ships">
        <div class="chead"><span class="ctitle">What I finished recently</span></div>
        <div class="csub">Changes that are now live</div>
        <div class="cbody">
          ${ships.map((s) => `<div class="ship"><span class="sdot"></span>
            <span class="stext">${esc(s.text)}</span>
            <span class="swhen">${esc(s.when)}</span></div>`).join("")}
        </div>
      </section>
    </div>

  </div>
</div>
</div>`;

  const out = resolve(REPO, "docs/company/ceo-dashboard.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(
    `wrote ${out} (${(html.length / 1024).toFixed(1)} KB) — week €${weekEur.toFixed(2)}` +
    ` (prior €${prevEur.toFixed(2)}), payers ${payerTrustworthy ? payerRow.n : "n/a — instrument too new"}`,
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
