/**
 * Strale internal design system — the single source of truth for how any
 * internally-generated page looks. Locked 2026-08-15 (DEC-20260815-A).
 *
 * Written as one exported stylesheet rather than a document, so a second page
 * cannot quietly drift from the first: new pages import DESIGN_SYSTEM_CSS and
 * use the class names below. The human-readable companion — what each token is
 * for, and the writing rules — is docs/company/DESIGN-SYSTEM.md.
 *
 * Direction: light-mode operational SaaS. Deliberately single-theme. The
 * audience is one founder reading it daily in daylight; committing to light
 * means the design is always the one that was approved, rather than an
 * auto-inverted variant nobody reviewed. Every colour is therefore painted
 * explicitly, including the page background, so the page holds its own ground
 * on any host surface.
 */

/** Design tokens. Change a value here and every generated page follows. */
export const TOKENS = {
  // Neutrals carry a slight cool bias toward the accent, so greys read as
  // chosen rather than inherited.
  bg: "#F5F6F9",
  surface: "#FFFFFF",
  raised: "#FAFBFC",
  line: "#E7E9F0",
  lineSoft: "#EFF1F6",
  ink: "#151821",
  ink2: "#3D4453",
  muted: "#767E8E",
  // One accent, used only for the primary data series and the active state.
  accent: "#5A57D6",
  accentSoft: "#EDECFC",
  accentLine: "#C9C7F4",
  // Status colours are reserved for state and never reused as a data series.
  good: "#177245",
  goodSoft: "#E6F4EC",
  warn: "#9A5B12",
  warnSoft: "#FCF0E2",
  crit: "#B3352C",
  critSoft: "#FBEBEA",
} as const;

export const DESIGN_SYSTEM_CSS = `
*{box-sizing:border-box}
:root{
  --bg:${TOKENS.bg}; --surface:${TOKENS.surface}; --raised:${TOKENS.raised};
  --line:${TOKENS.line}; --line-soft:${TOKENS.lineSoft};
  --ink:${TOKENS.ink}; --ink-2:${TOKENS.ink2}; --muted:${TOKENS.muted};
  --acc:${TOKENS.accent}; --acc-soft:${TOKENS.accentSoft}; --acc-line:${TOKENS.accentLine};
  --good:${TOKENS.good}; --good-soft:${TOKENS.goodSoft};
  --warn:${TOKENS.warn}; --warn-soft:${TOKENS.warnSoft};
  --crit:${TOKENS.crit}; --crit-soft:${TOKENS.critSoft};
  --r:12px; --shadow:0 1px 2px rgba(21,24,33,.04),0 1px 1px rgba(21,24,33,.03);
}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);
  font:14px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  -webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px;border-radius:6px}

/* ── shell ───────────────────────────────────────────────────────────── */
.app{display:grid;grid-template-columns:236px 1fr;min-height:100vh}
.side{background:var(--surface);border-right:1px solid var(--line);
  display:flex;flex-direction:column;gap:22px;padding:18px 12px;position:sticky;top:0;height:100vh}
.brand{display:flex;align-items:center;gap:9px;padding:2px 8px 0}
.blogo{width:26px;height:26px;border-radius:8px;background:var(--acc);color:#fff;
  display:grid;place-items:center;font-weight:700;font-size:13px;letter-spacing:-.02em}
.bname{font-weight:650;letter-spacing:-.01em}
.bsub{font-size:11px;color:var(--muted);margin-top:-2px}
.navgroup{font-size:10.5px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;
  color:var(--muted);padding:0 10px 6px}
.nav{display:flex;flex-direction:column;gap:2px}
.nav a{display:flex;align-items:center;gap:9px;padding:7px 10px;border-radius:8px;
  color:var(--ink-2);font-size:13.5px}
.nav a:hover{background:var(--raised);color:var(--ink)}
.nav a.on{background:var(--acc-soft);color:var(--acc);font-weight:550}
.nav .dot{width:6px;height:6px;border-radius:50%;background:currentColor;opacity:.55;flex:none}
.nav .count{margin-left:auto;font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums}
.nav a.on .count{color:var(--acc)}
.usercard{margin-top:auto;display:flex;align-items:center;gap:9px;padding:9px;
  border:1px solid var(--line);border-radius:10px;background:var(--raised)}
.avatar{width:28px;height:28px;border-radius:8px;background:#2B2F3C;color:#fff;
  display:grid;place-items:center;font-size:11px;font-weight:600;flex:none}
.uname{font-size:13px;font-weight:550;line-height:1.25}
.urole{font-size:11px;color:var(--muted)}

.main{min-width:0;display:flex;flex-direction:column}
.topbar{display:flex;align-items:center;gap:12px;padding:14px 24px;
  border-bottom:1px solid var(--line);background:var(--surface);position:sticky;top:0;z-index:5}
.ttl{font-size:15px;font-weight:600;letter-spacing:-.01em}
.topmeta{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.content{padding:20px 24px 56px;display:flex;flex-direction:column;gap:16px;max-width:1320px}
section[id]{scroll-margin-top:70px}

/* ── surfaces ────────────────────────────────────────────────────────── */
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
  box-shadow:var(--shadow)}
.chead{display:flex;align-items:center;gap:10px;padding:14px 16px 0}
.ctitle{font-size:13.5px;font-weight:600;letter-spacing:-.005em}
.csub{font-size:12px;color:var(--muted);padding:2px 16px 0}
.cbody{padding:14px 16px 16px}
.pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:5px 10px;
  border:1px solid var(--line);border-radius:8px;color:var(--ink-2);background:var(--surface)}
.pill b{font-weight:600;font-variant-numeric:tabular-nums}

/* ── metric tiles ────────────────────────────────────────────────────── */
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(188px,1fr));gap:12px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);
  padding:14px 15px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:9px}
.krow{display:flex;align-items:center;gap:9px}
.klabel{font-size:12.5px;color:var(--muted);font-weight:500}
.ibadge{margin-left:auto;width:26px;height:26px;border-radius:7px;display:grid;place-items:center;flex:none}
.i-acc{background:var(--acc-soft);color:var(--acc)}
.i-good{background:var(--good-soft);color:var(--good)}
.i-warn{background:var(--warn-soft);color:var(--warn)}
.i-crit{background:var(--crit-soft);color:var(--crit)}
.i-neutral{background:#EEF0F5;color:#525A6B}
.kval{font-size:25px;font-weight:660;letter-spacing:-.025em;font-variant-numeric:tabular-nums;line-height:1.1}
.kval .unit{font-size:13px;font-weight:500;color:var(--muted);letter-spacing:0}
.kfoot{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:12px;color:var(--muted);line-height:1.4}

/* ── state ───────────────────────────────────────────────────────────── */
.chip{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;font-weight:600;
  padding:2px 7px;border-radius:6px;font-variant-numeric:tabular-nums}
.chip-up{background:var(--good-soft);color:var(--good)}
.chip-down{background:var(--crit-soft);color:var(--crit)}
.chip-flat{background:#EEF0F5;color:#525A6B;font-weight:500}
.chip-warn{background:var(--warn-soft);color:var(--warn)}
.tag{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;
  letter-spacing:.02em;padding:3px 8px;border-radius:999px}
.tag::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor}
.t-hold{background:var(--warn-soft);color:var(--warn)}
.t-auto{background:var(--good-soft);color:var(--good)}

/* ── progress ────────────────────────────────────────────────────────── */
.ladder{display:flex;gap:5px;margin-top:2px}
.rung{flex:1;height:6px;border-radius:3px;background:var(--line-soft);overflow:hidden}
.rung i{display:block;height:100%;background:var(--acc);border-radius:3px}
.rung.done i{background:var(--good)}
.rlabels{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);
  font-variant-numeric:tabular-nums;margin-top:5px}
.benv{height:10px;border-radius:5px;background:var(--line-soft);overflow:hidden;margin:12px 0 8px}
.benv i{display:block;height:100%;border-radius:5px;background:var(--good)}
.mini{width:74px;height:6px;border-radius:3px;background:var(--line-soft);overflow:hidden;display:block}
.mini i{display:block;height:100%;background:var(--acc);border-radius:3px}

/* ── layout rows ─────────────────────────────────────────────────────── */
.row{display:grid;gap:16px}
.row-2{grid-template-columns:1.55fr 1fr}
.row-even{grid-template-columns:1fr 1fr}
@media(max-width:1080px){.row-2,.row-even{grid-template-columns:1fr}}
@media(max-width:820px){.app{grid-template-columns:1fr}.side{display:none}}

/* ── charts ──────────────────────────────────────────────────────────── */
.chartwrap{overflow-x:auto}
svg.chart{display:block;width:100%;height:auto;min-width:420px}
.grid{stroke:var(--line);stroke-width:1;stroke-dasharray:3 4}
.ytick{fill:var(--muted);font:11px system-ui;text-anchor:end;font-variant-numeric:tabular-nums}
.xtick{fill:var(--muted);font:11px system-ui;text-anchor:middle}
.xtick-last{fill:var(--ink-2);font-weight:600}
.bar{fill:var(--acc-line)}
.bar-last{fill:var(--acc)}
.hit{fill:transparent}
.barg:hover .bar{fill:var(--acc)}

/* ── step bars ───────────────────────────────────────────────────────── */
.frow{display:grid;grid-template-columns:104px 1fr 52px 96px;gap:10px;align-items:center;
  padding:7px 0;font-variant-numeric:tabular-nums}
.frow+.frow{border-top:1px solid var(--line-soft)}
.flabel{font-size:13px;color:var(--ink-2)}
.ftrack{height:8px;border-radius:4px;background:var(--line-soft);overflow:hidden}
.ffill{display:block;height:100%;background:var(--acc);border-radius:4px}
.fval{text-align:right;font-weight:600;font-size:13px}
.fnote{font-size:11.5px;color:var(--muted);text-align:right}

/* ── tables ──────────────────────────────────────────────────────────── */
.tablewrap{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
th{text-align:left;font-size:10.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
  color:var(--muted);padding:0 10px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:10px;border-bottom:1px solid var(--line-soft);font-size:13.5px}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:var(--raised)}
.num{text-align:right}
.slug{font-weight:550}
.cat{font-size:11.5px;color:var(--muted)}

/* ── lists ───────────────────────────────────────────────────────────── */
.qitem{display:flex;gap:11px;padding:11px 0;border-top:1px solid var(--line-soft)}
.qitem:first-child{border-top:0;padding-top:2px}
.qid{font-size:11.5px;font-weight:650;color:var(--muted);font-variant-numeric:tabular-nums;
  padding-top:2px;flex:none;width:42px}
.qtext{font-size:13px;color:var(--ink-2);line-height:1.45}
.qmeta{display:flex;align-items:center;gap:7px;margin-top:5px;flex-wrap:wrap}
.qowner{font-size:11.5px;color:var(--muted)}
.ship{display:flex;gap:11px;align-items:baseline;padding:9px 0;border-top:1px solid var(--line-soft)}
.ship:first-child{border-top:0;padding-top:2px}
.sdot{width:6px;height:6px;border-radius:50%;background:var(--acc-line);flex:none;position:relative;top:-1px}
.stext{font-size:13px;color:var(--ink-2);line-height:1.4}
.swhen{margin-left:auto;font-size:11.5px;color:var(--muted);white-space:nowrap;flex:none}
.blines{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.bline{display:flex;align-items:center;gap:9px;font-size:12.5px;color:var(--ink-2)}
.bline .amt{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:550}
.bkey{width:7px;height:7px;border-radius:2px;flex:none}
.note{font-size:11.5px;color:var(--muted);line-height:1.5;margin-top:12px;
  padding-top:11px;border-top:1px solid var(--line-soft)}
`;
