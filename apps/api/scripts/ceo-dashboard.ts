/**
 * CEO dashboard generator.
 *
 * This script computes NO business numbers. Every figure comes from
 * src/lib/metrics, which owns the window, the population and the instrument
 * guard for each one. Before that module existed those decisions were remade
 * in each script, and on 2026-08-15 that produced five different wrong answers
 * in one afternoon.
 *
 * What remains here is presentation: turning `Measurement<T>` values into a
 * page. The rule that matters is that an unavailable measurement has no value
 * to render — `renderMeasurement` returns a placeholder and an explanation, and
 * there is no way to reach past it to a number.
 *
 * Run:  npx tsx scripts/ceo-dashboard.ts
 * Out:  docs/company/ceo-dashboard.html (gitignored)
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../..");
// Loaded before the metrics module, which opens a database connection on import.
config({ path: resolve(REPO, ".env") });

const { DESIGN_SYSTEM_CSS } = await import("./lib/design-system.js");
const {
  revenueCents, payingActors, mcpFunnel, monitorVisitDays, identityCoverage,
  topSellers, platformHealth, externalSpend, windowOf,
} = await import("../src/lib/metrics/metrics.js");
const { renderMeasurement } = await import("../src/lib/metrics/types.js");
const { closeDbPool } = await import("../src/db/index.js");

/** Milestones in EUR, matching docs/company/GOALS.md. */
const MILESTONES = [230, 550, 1100, 1850];
const BUDGET_ENVELOPE_EUR = 50;

/**
 * Commit subjects are written for engineers. This page has one non-technical
 * reader, so the shipped list is rewritten into ordinary sentences. Best-effort:
 * without a key, on any error, or if the model returns the wrong number of
 * lines, it falls back to stripping the conventional-commit prefix. A
 * wrong-length response is treated as failure rather than zipped up, because a
 * misaligned list would attach the wrong description to the wrong change.
 */
async function toPlainEnglish(subjects: string[]): Promise<string[]> {
  const fallback = subjects.map((x) =>
    x.replace(/^\w+(\([^)]*\))?!?:\s*/, "").replace(/^./, (c) => c.toUpperCase()));
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
      .flatMap((b) => (b.type === "text" ? [b.text] : []))
      .join("").trim().split("\n")
      .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim()).filter(Boolean);
    return lines.length === subjects.length ? lines : fallback;
  } catch {
    return fallback;
  }
}

async function main() {
  const week = windowOf(7);
  const priorWeek = {
    from: new Date(Date.now() - 14 * 86_400_000),
    to: new Date(Date.now() - 7 * 86_400_000),
    label: "the week before",
  };

  const [revenue, prior, actors, funnel, monitors, coverage, sellers, health, spend] =
    await Promise.all([
      revenueCents(week), revenueCents(priorWeek), payingActors(windowOf(28)),
      mcpFunnel(week), monitorVisitDays(week), identityCoverage(week),
      topSellers(week), platformHealth(), externalSpend(week),
    ]);

  // Presentation-only reads: the contents of two files and the git log. Not
  // measurements of the business, so not in the metrics module.
  interface QueueField { label: string; text: string }
  interface QueueItem { id: string; cls: string; owner: string; text: string; fields: QueueField[] }
  let queue: QueueItem[] = [];
  try {
    const dq = readFileSync(resolve(REPO, "docs/company/DECISION-QUEUE.md"), "utf8");
    const open = dq.split("## OPEN")[1]?.split(/\n## /)[0] ?? "";
    queue = open.split(/\n(?=\*\*DQ-)/).flatMap((block) => {
      const head = block.match(/\*\*(DQ-\d+)\*\*\s*·\s*`([a-z_]+)`\s*·\s*owner ([^·]+)·[^\n]*\n/);
      if (!head) return [];
      const body = block.slice(head[0].length);
      const clean = (t: string) => t.replace(/\s+/g, " ").replace(/[`*]/g, "").trim();
      return [{
        id: head[1], cls: head[2], owner: head[3].trim(),
        text: clean(body.split(/\n\s*\*[A-Z]/)[0].split(/\n\s*\n/)[0]),
        fields: [...body.matchAll(/\*([A-Z][^*:]*):\*\s*([\s\S]*?)(?=\n\s*\*[A-Z][^*:]*:\*|$)/g)]
          .map((f) => ({ label: f[1].trim(), text: clean(f[2]) }))
          .filter((f) => f.text.length > 0),
      }];
    });
  } catch { /* optional */ }

  interface Worker { name: string; when: string; does: string; reports: string; status: string }
  let workers: Worker[] = [];
  try {
    const wf = readFileSync(resolve(REPO, "docs/company/WORKFORCE.md"), "utf8");
    const flat = (t: string) => t.replace(/\s+/g, " ").replace(/[`*]/g, "").trim();
    workers = wf.split(/\n### /).slice(1).map((block) => {
      const [heading, ...rest] = block.split("\n");
      const [name, when] = heading.split("·");
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
  } catch { /* optional */ }

  let ships: Array<{ text: string; when: string }> = [];
  try {
    const raw = execSync('git log -6 origin/main --date=relative --format=%s%x1f%ad',
      { cwd: REPO, encoding: "utf8" })
      .trim().split("\n").map((l) => {
        const [text, when] = l.split("");
        return { text: text.replace(/\s*\(#\d+\)$/, ""), when };
      });
    const plain = await toPlainEnglish(raw.map((r) => r.text));
    ships = raw.map((r, i) => ({ text: plain[i], when: r.when }));
  } catch { /* offline ok */ }

  // ── formatting ──────────────────────────────────────────────────────────
  const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const eur = (cents: number) => `€${(cents / 100).toFixed(2)}`;
  const gen = new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC";

  const rev = renderMeasurement(revenue, eur);
  const priorRev = renderMeasurement(prior, eur);
  const weekCents = revenue.status === "observed" ? revenue.value : 0;
  const priorCents = prior.status === "observed" ? prior.value : 0;
  const weekEur = weekCents / 100;
  const nextMilestone = MILESTONES.find((m) => m > weekEur) ?? MILESTONES[MILESTONES.length - 1];

  const delta = priorCents > 0 ? ((weekCents - priorCents) / priorCents) * 100 : null;
  const deltaChip = delta === null
    ? `<span class="chip chip-flat">nothing to compare with yet</span>`
    : `<span class="chip ${delta >= 0 ? "chip-up" : "chip-down"}">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path
          d="${delta >= 0 ? "M2 7L5 3l3 4" : "M2 3l3 4 3-4"}" fill="none" stroke="currentColor"
          stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>${
        delta >= 0 ? "+" : ""}${delta.toFixed(1)}%</span>`;

  const buyers = renderMeasurement(actors, (v) => String(v.total));
  // `unavailable` has no value at all, by design — render the reason, never a
  // fabricated 0. `estimated` has a value but is a lower bound, so it is shown
  // with the reason attached rather than as a fact.
  const buyersNote = actors.status === "unavailable"
    ? esc(buyers.note)
    : [
        actors.value.total === 1
          ? `<span class="chip chip-warn">all from one buyer</span>`
          : `biggest is ${(actors.value.topShare * 100).toFixed(0)}% of the money`,
        actors.value.returning === null
          ? `too early to tell how many came back`
          : `${actors.value.returning} came back`,
        actors.status === "estimated" ? esc(buyers.note) : "",
      ].filter(Boolean).join(" · ");

  const cov = renderMeasurement(coverage, (v) => `${(v * 100).toFixed(1)}%`);
  // Deliberately nullable rather than zero-filled. A zero here reads as
  // "nothing is switched off" and "we spent nothing" — both are claims, and
  // an unavailable measurement entitles us to neither.
  const hv = health.status === "unavailable" ? null : health.value;
  const sp = spend.status === "unavailable" ? null : spend.value;
  const budgetPct = sp === null ? null
    : Math.min(100, (sp.totalCents / 100 / BUDGET_ENVELOPE_EUR) * 100);
  const healthNote = health.status === "unavailable"
    ? esc(renderMeasurement(health, () => "").note) : "";
  const spendNote = spend.status === "unavailable"
    ? esc(renderMeasurement(spend, () => "").note) : "";

  const icons: Record<string, string> = {
    wallet: `<path d="M2.5 5.5A1.5 1.5 0 014 4h8a1.5 1.5 0 011.5 1.5v5A1.5 1.5 0 0112 12H4a1.5 1.5 0 01-1.5-1.5z"/><path d="M10.5 8h1.5"/>`,
    users: `<circle cx="6" cy="6" r="2.2"/><path d="M2.5 13c0-2 1.6-3.3 3.5-3.3S9.5 11 9.5 13"/><path d="M10.8 4.2a2 2 0 010 3.6M11.5 12.8c0-1.4-.5-2.4-1.3-3"/>`,
    inbound: `<path d="M8 2.5v7"/><path d="M5 7l3 3 3-3"/><path d="M3 12.5h10"/>`,
    pulse: `<path d="M2 8h2.5l1.8-4 2.4 8 1.8-4H14"/>`,
    coin: `<circle cx="8" cy="8" r="5.5"/><path d="M8 5.2v5.6M6.4 6.6h2.4a1.2 1.2 0 010 2.4H6.4"/>`,
  };
  const icon = (k: string, cls: string) =>
    `<span class="ibadge ${cls}"><svg viewBox="0 0 16 16" width="16" height="16" fill="none"
      stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
      aria-hidden="true">${icons[k]}</svg></span>`;

  const steps = funnel.status === "observed" ? funnel.value : [];
  const stepMax = Math.max(1, ...steps.map((s) => s.events));
  const funnelRows = steps.map((s) => `
    <div class="frow"><span class="flabel">${esc(s.label)}</span>
      <span class="ftrack"><span class="ffill" style="width:${Math.max(1.5, (s.events / stepMax) * 100)}%"></span></span>
      <span class="fval">${s.events.toLocaleString("en")}</span>
      <span class="fnote">${s.visitDays} visit-days</span></div>`).join("");
  const funnelWindow = funnel.status === "observed" ? funnel.window.label : "";
  const funnelNote = funnel.status === "observed"
    ? (funnel.caveat ?? "")
    : renderMeasurement(funnel, () => "").note;

  const sellersList = sellers.status === "observed" ? sellers.value : [];
  const capMax = Math.max(1, ...sellersList.map((c) => c.cents));

  const html = `<title>Strale — CEO Dashboard</title>
<style>${DESIGN_SYSTEM_CSS}</style>
<div class="app">
<aside class="side">
  <div class="brand"><span class="blogo">S</span>
    <span><span class="bname">Strale</span><div class="bsub">Business overview</div></span></div>
  <div><div class="navgroup">Overview</div><nav class="nav">
    <a class="on" href="#revenue"><span class="dot"></span>Money</a>
    <a href="#funnel"><span class="dot"></span>Getting customers</a>
    <a href="#selling"><span class="dot"></span>Best sellers<span class="count">${sellersList.length}</span></a>
  </nav></div>
  <div><div class="navgroup">Operations</div><nav class="nav">
    <a href="#budget"><span class="dot"></span>Spending</a>
    <a href="#workforce"><span class="dot"></span>Who is working</a>
    <a href="#decisions"><span class="dot"></span>Decisions<span class="count">${queue.length}</span></a>
    <a href="#ships"><span class="dot"></span>Finished work</a>
  </nav></div>
  <div class="usercard"><span class="avatar">PL</span>
    <span><div class="uname">Petter Lindström</div><div class="urole">Founder · Moonlighter AB</div></span></div>
</aside>

<div class="main">
  <header class="topbar"><span class="ttl">Dashboard</span>
    <div class="topmeta">
      <span class="pill">Last 7 days</span>
      <span class="pill">Next goal <b>€${nextMilestone}</b> a week</span>
      <span class="pill">${gen}</span>
    </div></header>

  <div class="content">
    <div class="kpis">
      <div class="kpi"><div class="krow"><span class="klabel">Money made this week</span>${icon("wallet", "i-acc")}</div>
        <div class="kval">${rev.text}</div>
        <div class="kfoot">${deltaChip} compared with the week before (${priorRev.text})</div></div>

      <div class="kpi"><div class="krow"><span class="klabel">Paying customers</span>${
        icon("users", actors.status === "observed" ? "i-good" : "i-warn")}</div>
        <div class="kval">${buyers.text}</div>
        <div class="kfoot">${buyersNote}</div></div>

      <div class="kpi"><div class="krow"><span class="klabel">Can we tell who bought?</span>${
        icon("inbound", coverage.status === "observed" && coverage.value > 0.5 ? "i-good" : "i-warn")}</div>
        <div class="kval">${cov.text}</div>
        <div class="kfoot">${esc(cov.note || "of calls can be traced back to a buyer")}</div></div>

      <div class="kpi"><div class="krow"><span class="klabel">Services with problems</span>${
        icon("pulse", hv && hv.breakersOpen > 0 ? "i-warn" : "i-good")}</div>
        <div class="kval">${hv ? `${hv.breakersOpen}<span class="unit"> switched off</span>` : "—"}</div>
        <div class="kfoot">${hv
          // WP8: renamed from `quarantined`, which the number never was — most
          // of it is pre-launch capabilities, not paused ones. "not yet live"
          // covers both honestly for a founder-facing dashboard.
          ? `${hv.active} data services working · ${hv.withheldFromCatalog} not yet live`
          : healthNote}</div></div>

      <div class="kpi"><div class="krow"><span class="klabel">Money spent this week</span>${
        icon("coin", budgetPct !== null && budgetPct > 80 ? "i-warn" : "i-good")}</div>
        <div class="kval">${sp
          ? `${eur(sp.totalCents)}<span class="unit"> / €${BUDGET_ENVELOPE_EUR}</span>` : "—"}</div>
        <div class="kfoot">${budgetPct !== null
          ? `${budgetPct.toFixed(0)}% of the weekly limit · estimate`
          : spendNote}</div></div>
    </div>

    <div class="row row-2">
      <section class="card" id="revenue">
        <div class="chead"><span class="ctitle">Progress towards the goal</span>
          <span class="pill" style="margin-left:auto">${rev.text} this week</span></div>
        <div class="csub">Real customers only. Our own testing is never counted.</div>
        <div class="cbody">
          <div class="ladder">${MILESTONES.map((m) => {
            const f = Math.min(100, (weekEur / m) * 100);
            return `<span class="rung${f >= 100 ? " done" : ""}"><i style="width:${f}%"></i></span>`;
          }).join("")}</div>
          <div class="rlabels">${MILESTONES.map((m, i) => `<span>M${i + 1} · €${m}</span>`).join("")}</div>
          <div class="note">We are ${
            weekEur > 0 ? `${((weekEur / MILESTONES[3]) * 100).toFixed(1)}%` : "0%"
          } of the way to the final goal. Getting there is about finding more buyers rather
          than persuading one buyer to spend more — which is why the number beside this one
          matters more than this one does.</div>
        </div>
      </section>

      <section class="card" id="funnel">
        <div class="chead"><span class="ctitle">Turning visitors into customers</span>
          ${funnelWindow ? `<span class="pill" style="margin-left:auto">${esc(funnelWindow)}</span>` : ""}</div>
        <div class="csub">Real agents only. Health checkers and directory scanners are excluded.</div>
        <div class="cbody">
          ${funnelRows || `<div class="qtext">${esc(funnelNote)}</div>`}
          <div class="note">${esc(funnelNote)}${
            monitors.status === "observed"
              ? ` Separately, ${monitors.value} monitoring services check we are alive; they are never counted as interest.`
              : ""}</div>
        </div>
      </section>
    </div>

    <div class="row row-2">
      <section class="card" id="selling">
        <div class="chead"><span class="ctitle">What people are buying</span></div>
        <div class="csub">Our best sellers over the last seven days. Free calls are not sales.</div>
        <div class="cbody"><div class="tablewrap">
          <table><thead><tr><th>What it does</th><th class="num">Times sold</th>
            <th>Share</th><th class="num">Money made</th></tr></thead>
          <tbody>${sellersList.map((c) => `<tr>
            <td><div class="slug">${esc(c.slug)}</div><div class="cat">${esc(c.category ?? "")}</div></td>
            <td class="num">${c.calls.toLocaleString("en")}</td>
            <td><span class="mini"><i style="width:${(c.cents / capMax) * 100}%"></i></span></td>
            <td class="num">${eur(c.cents)}</td></tr>`).join("")}</tbody></table>
        </div></div>
      </section>

      <section class="card" id="budget">
        <div class="chead"><span class="ctitle">Spending</span>
          <span class="pill" style="margin-left:auto">€${BUDGET_ENVELOPE_EUR}/wk</span></div>
        <div class="csub">What we pay other companies each week</div>
        <div class="cbody">
          <div class="benv"><i style="width:${budgetPct ?? 0}%"></i></div>
          <div class="rlabels"><span>${sp ? `${eur(sp.totalCents)} spent` : spendNote}</span>
            <span>${sp
              ? `€${(BUDGET_ENVELOPE_EUR - sp.totalCents / 100).toFixed(2)} left` : ""}</span></div>
          <div class="blines">
            <div class="bline"><span class="bkey" style="background:var(--acc)"></span>
              Our own automatic testing<span class="amt">${sp ? eur(sp.harnessCents) : "—"}</span></div>
            <div class="bline"><span class="bkey" style="background:var(--acc-line)"></span>
              Payment processing fees<span class="amt">${sp ? eur(sp.settlementCents) : "—"}</span></div>
            <div class="bline"><span class="bkey" style="background:var(--line)"></span>
              My thinking time<span class="amt">included in your plan</span></div>
          </div>
          <div class="note">${esc(renderMeasurement(spend, () => "").note)}</div>
        </div>
      </section>
    </div>

    <section class="card" id="workforce">
      <div class="chead"><span class="ctitle">Who is working on this</span>
        <span class="pill" style="margin-left:auto">${
          workers.filter((w) => w.status.startsWith("running")).length} of ${workers.length} running</span></div>
      <div class="csub">The jobs that run on a schedule without anyone starting them</div>
      <div class="cbody"><div class="tablewrap">
        <table><thead><tr><th>Job</th><th>When</th><th>What it does</th><th>State</th></tr></thead>
        <tbody>${workers.map((w) => {
          const on = w.status.startsWith("running");
          return `<tr><td><div class="slug">${esc(w.name)}</div><div class="cat">${esc(w.reports)}</div></td>
            <td style="white-space:nowrap;color:var(--muted)">${esc(w.when)}</td>
            <td style="max-width:430px">${esc(w.does)}</td>
            <td><span class="tag ${on ? "t-auto" : "t-hold"}">${on ? "Running" : "Not yet"}</span></td></tr>`;
        }).join("")}</tbody></table>
      </div></div>
    </section>

    <div class="row row-even">
      <section class="card" id="decisions">
        <div class="chead"><span class="ctitle">Things I need you to decide</span>
          <span class="pill" style="margin-left:auto">${queue.length} waiting</span></div>
        <div class="csub">Click any line to see the detail. Nothing is stuck waiting.</div>
        <div class="cbody">${queue.length ? queue.map((q) => `<details class="qitem">
          <summary><span class="qid">${q.id}</span>
            <span class="qmain"><span class="qtext">${esc(q.text)}</span>
              <span class="qmeta"><span class="tag ${q.cls === "your_call" ? "t-hold" : "t-auto"}">${
                q.cls === "your_call" ? "Needs your yes" : "Done — tell me if you disagree"}</span>
                <span class="qowner">${esc(q.owner)}</span></span></span>
            <span class="qchev" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 12 12"
              fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"
              stroke-linejoin="round"><path d="M3 4.5L6 7.5l3-3"/></svg></span></summary>
          <div class="qbody">${q.fields.map((f) => `<div class="qfield">
            <span class="qflabel">${esc(f.label)}</span>
            <span class="qftext">${esc(f.text)}</span></div>`).join("")}</div>
        </details>`).join("") : `<div class="qtext">Nothing needs you right now.</div>`}</div>
      </section>

      <section class="card" id="ships">
        <div class="chead"><span class="ctitle">What I finished recently</span></div>
        <div class="csub">Merged — usually live within minutes, but this reads the code history, not the server</div>
        <div class="cbody">${ships.map((s) => `<div class="ship"><span class="sdot"></span>
          <span class="stext">${esc(s.text)}</span>
          <span class="swhen">${esc(s.when)}</span></div>`).join("")}</div>
      </section>
    </div>
  </div>
</div>
</div>`;

  const out = resolve(REPO, "docs/company/ceo-dashboard.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  console.log(
    `wrote ${out} (${(html.length / 1024).toFixed(1)} KB)\n` +
    `  revenue   ${revenue.status}: ${rev.text}\n` +
    `  buyers    ${actors.status}: ${buyers.text}${buyers.note ? ` — ${buyers.note}` : ""}\n` +
    `  funnel    ${funnel.status}${funnel.status === "observed" ? ` over ${funnel.window.label}` : ""}\n` +
    `  identity  ${coverage.status}: ${cov.text}\n` +
    `  spend     ${spend.status}: ${sp ? eur(sp.totalCents) : "—"}`,
  );
  await closeDbPool();
}

main().catch((e) => { console.error(e); process.exit(1); });
