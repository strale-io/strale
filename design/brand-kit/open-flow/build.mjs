// Open Flow website design system — build and check.
//   node design/brand-kit/open-flow/build.mjs          regenerate tokens.css, CONTRAST.md and the generated regions of specimen/index.html
//   node design/brand-kit/open-flow/build.mjs --check  fail if any of those is stale, a contrast pair is below its minimum,
//                                                      the specimen uses an off-token literal, or a copied asset/font changed
// Source of every value: design/tokens/candidates/open-flow.json, adopted by DEC-20261024-B as the website surface of
// design/tokens/active.json (the two must stay identical). Asset lineage: provenance.json.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
export const TOKENS_PATH = resolve(repo, 'design/tokens/candidates/open-flow.json');
export const ACTIVE_PATH = resolve(repo, 'design/tokens/active.json');
/** The surface fields active.json carries for the website; each must equal the adopted candidate's value. */
export const SURFACE_FIELDS = ['palette', 'type', 'spacing', 'radii', 'shadows', 'motion', 'layout'];
export const loadWebsiteSurface = () => JSON.parse(readFileSync(ACTIVE_PATH, 'utf8')).surfaces.website;
const read = p => readFileSync(resolve(here, p), 'utf8');
export const loadTokens = () => JSON.parse(readFileSync(TOKENS_PATH, 'utf8'));
export const loadProvenance = () => JSON.parse(read('provenance.json'));
const sha = p => createHash('sha256').update(readFileSync(resolve(here, p))).digest('hex');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- colour maths (WCAG 2.x relative luminance) ----
const channel = v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
export function luminance(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i, `Not a six-digit hex colour: ${hex}`);
  const [r, g, b] = [1, 3, 5].map(i => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---- palette partitions ----
export const THEMES = ['light', 'dark'];
export function rolesFor(t, theme) {
  const out = {};
  for (const [k, v] of Object.entries(t.palette)) if (k.startsWith(theme + '.')) out[k.slice(theme.length + 1)] = v;
  return out;
}
const pick = (t, prefix) => Object.fromEntries(Object.entries(t.palette).filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v]));

export function contrastResults(t) {
  const rows = [];
  for (const theme of THEMES) {
    const roles = rolesFor(t, theme);
    for (const p of t.layout.contrast) {
      const fg = roles[p.fg], bg = roles[p.bg];
      assert(fg && bg, `Contrast pair ${p.fg} on ${p.bg} does not resolve in the ${theme} theme`);
      const ratio = contrast(fg, bg);
      rows.push({ theme, ...p, fgHex: fg, bgHex: bg, ratio, pass: ratio >= p.min });
    }
    for (const [i, hex] of Object.entries(pick(t, `chart.${theme}.`))) {
      const ratio = contrast(hex, roles.canvas);
      rows.push({ theme, fg: `chart-${i}`, bg: 'canvas', min: 3, use: 'Chart mark against page (non-text)', fgHex: hex, bgHex: roles.canvas, ratio, pass: ratio >= 3 });
    }
  }
  return rows;
}

// ---- validation ----
export function validate(t, prov = loadProvenance(), { checkFiles = true, website = loadWebsiteSurface() } = {}) {
  assert.equal(t.status, 'adopted', 'Open Flow is the adopted website system (DEC-20261024-B); its candidate status is adopted');
  const light = Object.keys(rolesFor(t, 'light')).sort(), dark = Object.keys(rolesFor(t, 'dark')).sort();
  assert.deepEqual(dark, light, 'Light and dark themes must define the same role set');
  const lc = Object.keys(pick(t, 'chart.light.')), dc = Object.keys(pick(t, 'chart.dark.'));
  assert.deepEqual(dc, lc, 'Light and dark chart palettes must have the same slots');
  const failures = contrastResults(t).filter(r => !r.pass);
  assert.deepEqual(failures.map(f => `${f.theme}: ${f.fg} on ${f.bg} ${f.ratio.toFixed(2)} < ${f.min}`), [], 'Contrast below minimum');
  for (const a of t.layout.contrast_avoid) {
    assert(t.palette[a.fg] && t.palette[a.bg], `Avoid pair ${a.fg} on ${a.bg} does not resolve`);
    assert(contrast(t.palette[a.fg], t.palette[a.bg]) < 4.5, `Avoid pair ${a.fg} on ${a.bg} actually passes text contrast; drop it from contrast_avoid`);
  }
  for (const [id, r] of Object.entries(t.type.scale)) {
    assert(r.min <= r.max, `Type role ${id}: min above max`);
    assert(r.family in t.type.families, `Type role ${id}: unknown family ${r.family}`);
  }
  assert(t.type.scale.body.min >= 16 && t.type.scale.compact.min >= 16, 'Kit-06 type-measure rule: reading text never below 16px');
  for (const v of Object.values(t.layout.radius_roles)) assert(t.radii.includes(v), `Radius role ${v} is off the radius scale`);
  for (const v of Object.values(t.layout.stack_px)) assert(t.spacing.includes(v), `Stack value ${v} is off the spacing scale`);
  for (const v of [...Object.values(t.layout.gutter_px), ...Object.values(t.layout.section_rhythm_px)]) assert(t.spacing.includes(v), `Layout value ${v} is off the spacing scale`);
  if (checkFiles) {
    for (const f of [...prov.imagery, ...prov.candidate_identity, ...prov.logo, ...prov.fonts]) {
      assert(existsSync(resolve(here, f.file)), `Missing file ${f.file}`);
      assert.equal(sha(f.file), f.sha256, `File changed since it was copied from its source: ${f.file}`);
    }
  }
  if (website) {
    assert.equal(website.adopted_by, 'DEC-20261024-B', 'The website surface in active.json must be adopted by DEC-20261024-B');
    for (const f of SURFACE_FIELDS) assert.deepEqual(website[f], t[f], `active.json website.${f} differs from the adopted Open Flow candidate; promote by decision, never edit one side`);
  }
  return true;
}

// ---- tokens.css ----
const [FMIN, FMAX] = [360, 1440];
export function fluid(min, max) {
  if (min === max) return `${min}px`;
  const slope = (max - min) / (FMAX - FMIN);
  const intercept = min - slope * FMIN;
  return `clamp(${min}px, ${+intercept.toFixed(4)}px + ${+(slope * 100).toFixed(4)}vw, ${max}px)`;
}
const decls = obj => Object.entries(obj).map(([k, v]) => `  --${k}: ${v};`).join('\n');
function themeVars(t, theme) {
  const v = {};
  for (const [k, x] of Object.entries(rolesFor(t, theme))) v[k] = x;
  for (const [i, x] of Object.entries(pick(t, `chart.${theme}.`))) v[`chart-${i}`] = x;
  for (const [lvl, idx] of Object.entries(t.layout.elevation[theme])) v[`shadow-${lvl}`] = t.shadows[idx];
  v['color-scheme-value'] = theme;
  return v;
}
export function renderTokensCss(t, prov = loadProvenance(), { fontBase = 'fonts/', header = null } = {}) {
  const L = t.layout, base = {};
  for (const [k, x] of Object.entries(pick(t, 'brand.'))) base[`brand-${k}`] = x;
  for (const [k, x] of Object.entries(pick(t, 'chart.seq.'))) base[`chart-seq-${k}`] = x;
  for (const [k, x] of Object.entries(pick(t, 'chart.div.'))) base[`chart-div-${k}`] = x;
  for (const [k, x] of Object.entries(t.type.families)) base[`font-${k}`] = x;
  for (const [id, r] of Object.entries(t.type.scale)) {
    base[`type-${id}-family`] = `var(--font-${r.family})`;
    base[`type-${id}-size`] = fluid(r.min, r.max);
    base[`type-${id}-weight`] = r.weight;
    base[`type-${id}-line`] = r.line;
    base[`type-${id}-tracking`] = r.tracking ? `${r.tracking}em` : '0';
    base[`type-${id}-measure`] = r.measure;
    base[`type-${id}-features`] = r.features || 'normal';
  }
  for (const s of t.spacing) base[`space-${s}`] = `${s}px`;
  for (const r of t.radii) base[`radius-${r}`] = r === 'full' ? '999px' : `${r}px`;
  for (const [k, r] of Object.entries(L.radius_roles)) base[`radius-${k}`] = `var(--radius-${r})`;
  for (const [k, d] of Object.entries(t.motion.duration)) base[`duration-${k}`] = `${d}ms`;
  for (const [k, e] of Object.entries(t.motion.easing)) base[`ease-${k}`] = e;
  for (const [k, w] of Object.entries(L.container_px)) base[`container-${k}`] = `${w}px`;
  for (const [k, m] of Object.entries(L.measure)) base[`measure-${k}`] = m;
  for (const [k, s] of Object.entries(L.stack_px)) base[`stack-${k}`] = `var(--space-${s})`;
  Object.assign(base, {
    'control-h-sm': `${L.control.height_sm_px}px`, 'control-h': `${L.control.height_px}px`, 'control-h-lg': `${L.control.height_lg_px}px`,
    'target-min': `${L.control.min_target_px}px`, 'border-width': `${L.control.border_px}px`,
    'focus-width': `${L.control.focus_ring_px}px`, 'focus-offset': `${L.control.focus_offset_px}px`,
    'icon-sm': `${L.icon_px.sm}px`, 'icon-md': `${L.icon_px.md}px`, 'icon-lg': `${L.icon_px.lg}px`,
    gutter: `var(--space-${L.gutter_px.base})`, 'grid-columns': L.grid.columns.base, 'column-gap': `var(--space-${L.grid.column_gap_px.base})`,
    'section-space': `var(--space-${L.section_rhythm_px.base})`, 'nav-h': `${L.nav.height_mobile_px}px`
  });
  for (const [k, z] of Object.entries(L.z)) base[`z-${k}`] = z;
  // Kit-declared reading regions, so layouts place text from the asset record instead of copying numbers.
  for (const a of prov.imagery) if (a.region) for (const k of ['x', 'y', 'width', 'height']) base[`region-${a.id}-${k}`] = `${+(a.region[k] * 100).toFixed(2)}%`;
  const bp = L.breakpoints_px;
  const md = { gutter: `var(--space-${L.gutter_px.md})`, 'grid-columns': L.grid.columns.md, 'column-gap': `var(--space-${L.grid.column_gap_px.md})`, 'section-space': `var(--space-${L.section_rhythm_px.md})`, 'nav-h': `${L.nav.height_px}px` };
  const lg = { gutter: `var(--space-${L.gutter_px.lg})`, 'grid-columns': L.grid.columns.lg, 'column-gap': `var(--space-${L.grid.column_gap_px.lg})`, 'section-space': `var(--space-${L.section_rhythm_px.lg})` };
  const reduced = Object.fromEntries(Object.keys(t.motion.duration).map(k => [`duration-${k}`, '0ms']));
  const lightV = decls(themeVars(t, 'light')), darkV = decls(themeVars(t, 'dark'));
  return `${header ?? `/* GENERATED by design/brand-kit/open-flow/build.mjs from design/tokens/candidates/open-flow.json — do not edit. */
/* Adopted by DEC-20261024-B; identical to the website surface in design/tokens/active.json. */`}
@font-face { font-family: "Space Grotesk"; src: url("${fontBase}SpaceGrotesk.ttf") format("truetype"); font-weight: 300 700; font-display: swap; }
@font-face { font-family: "Instrument Sans"; src: url("${fontBase}InstrumentSans.ttf") format("truetype"); font-weight: 400 700; font-stretch: 75% 100%; font-display: swap; }
@font-face { font-family: "IBM Plex Mono"; src: url("${fontBase}IBMPlexMono-Regular.ttf") format("truetype"); font-weight: 400; font-display: swap; }

:root {
${decls(base)}
}
@media (min-width: ${bp.md}px) {
  :root {
${decls(md).replace(/^/gm, '  ')}
  }
}
@media (min-width: ${bp.lg}px) {
  :root {
${decls(lg).replace(/^/gm, '  ')}
  }
}

/* Light theme: the default, and any element marked data-theme="light". */
:root, [data-theme="light"] {
${lightV}
  color-scheme: light;
}
/* Dark theme follows the system unless the page is pinned to light. */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${darkV.replace(/^/gm, '  ')}
    color-scheme: dark;
  }
}
[data-theme="dark"] {
${darkV}
  color-scheme: dark;
}

@media (prefers-reduced-motion: reduce) {
  :root {
${decls(reduced).replace(/^/gm, '  ')}
  }
}
`;
}

// ---- CONTRAST.md ----
export function renderContrastMd(t) {
  const rows = contrastResults(t);
  const table = theme => ['| Foreground | Background | Ratio | Minimum | Result | Use |', '|---|---|---:|---:|---|---|',
    ...rows.filter(r => r.theme === theme).map(r => `| \`${r.fg}\` ${r.fgHex} | \`${r.bg}\` ${r.bgHex} | ${r.ratio.toFixed(2)} | ${r.min} | ${r.pass ? 'pass' : '**FAIL**'} | ${r.use} |`)].join('\n');
  const avoid = ['| Foreground | Background | Ratio | Why it is avoided |', '|---|---|---:|---|',
    ...t.layout.contrast_avoid.map(a => `| \`${a.fg}\` ${t.palette[a.fg]} | \`${a.bg}\` ${t.palette[a.bg]} | ${contrast(t.palette[a.fg], t.palette[a.bg]).toFixed(2)} | ${a.use} |`)].join('\n');
  const n = rows.length, passed = rows.filter(r => r.pass).length;
  return `# Open Flow — contrast proof

Generated by \`build.mjs\` from \`design/tokens/candidates/open-flow.json\` (\`layout.contrast\` plus every chart slot). Do not edit by hand; \`npm run design:check\` fails if this file is stale or any pair is below its minimum.

WCAG 2.x contrast ratio. Text pairs need 4.5:1 (AA, normal text). Non-text pairs (focus ring, form-field boundary, chart marks) need 3:1 (WCAG 1.4.11). **${passed} of ${n} pairs pass.**

This proves the token pairs. It does not certify text placed over imagery: text on artwork is allowed only inside a kit-declared reading region (see README, Imagery), and the kit checked those regions against ink on its source pixels only.

## Light theme

${table('light')}

## Dark theme

${table('dark')}

## Pairs that must not carry text

${avoid}
`;
}

// ---- generated specimen regions ----
const swatch = (name, hex, note = '') => `<figure class="swatch"><span class="swatch-chip" style="background: var(--${name})"></span><figcaption><code>--${esc(name)}</code><span class="swatch-hex">${esc(hex)}</span>${note ? `<span class="swatch-note">${esc(note)}</span>` : ''}</figcaption></figure>`;
const ROLE_GROUPS = [
  ['Surfaces', ['canvas', 'surface', 'surface-sunken', 'surface-soft', 'surface-blue', 'surface-teal', 'surface-inverse']],
  ['Text and borders', ['text', 'text-muted', 'text-inverse', 'border', 'border-strong']],
  ['Interaction', ['action', 'action-hover', 'action-active', 'action-subtle', 'link', 'link-hover', 'indicator', 'focus', 'focus-inverse', 'focus-code']],
  ['Status (always with an icon and words)', ['success', 'success-bg', 'warning', 'warning-bg', 'danger', 'danger-bg', 'info', 'info-bg']],
  ['Code', ['code-bg', 'code-text', 'code-muted', 'code-keyword', 'code-string', 'code-number', 'code-property']]
];
function genPalette(t) {
  const brandNotes = { blue: 'Primary expression; action colour', violet: 'Flow and depth; never a state', teal: 'Graphic family; not text, not success', soft: 'Editorial surface, dark text', ink: 'Reading text', paper: 'Clear reading space', 'mist-blue': 'Secondary light surface', 'mist-teal': 'Grouped information', 'deep-violet': 'Dark field, light text', 'logo-black': 'Wordmark only', border: 'Quiet division (kit); the light border role', 'image-ground': 'Sampled from the artwork; not a kit colour' };
  const brand = Object.entries(pick(t, 'brand.')).map(([k, v]) => swatch(`brand-${k}`, v, brandNotes[k] || '')).join('');
  const themes = THEMES.map(theme => {
    const roles = rolesFor(t, theme);
    return `<div class="theme-panel" data-theme="${theme}"><h4 class="theme-panel-title">${theme === 'light' ? 'Light' : 'Dark'} theme roles</h4>${ROLE_GROUPS.map(([g, keys]) => `<p class="label">${esc(g)}</p><div class="swatch-grid">${keys.map(k => swatch(k, roles[k])).join('')}</div>`).join('')}</div>`;
  }).join('');
  return `<h3 class="subhead">Brand colours: the eleven kit-06 colours, unchanged, plus the sampled artwork ground</h3><div class="swatch-grid">${brand}</div><h3 class="subhead">Role tokens</h3><p class="muted">Components use role tokens only. The same name resolves per theme.</p><div class="theme-pair">${themes}</div>`;
}
function genContrast(t) {
  const rows = contrastResults(t);
  const table = theme => `<div class="table-wrap"><table class="table"><caption>${theme === 'light' ? 'Light' : 'Dark'} theme · ${rows.filter(r => r.theme === theme && r.pass).length}/${rows.filter(r => r.theme === theme).length} pass</caption><thead><tr><th scope="col">Sample</th><th scope="col">Pair</th><th scope="col" class="num">Ratio</th><th scope="col" class="num">Min</th><th scope="col">Use</th></tr></thead><tbody>${rows.filter(r => r.theme === theme).map(r => `<tr><td><span class="contrast-sample" style="color: ${r.fg.startsWith('chart-') ? `var(--${r.fg})` : `var(--${r.fg})`}; background: var(--${r.bg})">${r.min === 3 ? '■ ━' : 'Aa'}</span></td><td><code>${esc(r.fg)}</code> on <code>${esc(r.bg)}</code></td><td class="num">${r.ratio.toFixed(2)}</td><td class="num">${r.min}</td><td>${esc(r.use)}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="theme-pair"><div class="theme-panel" data-theme="light">${table('light')}</div><div class="theme-panel" data-theme="dark">${table('dark')}</div></div>`;
}
function genChart(t) {
  const slots = Object.keys(pick(t, 'chart.light.'));
  const series = ['Series A', 'Series B', 'Series C', 'Series D', 'Series E', 'Series F'];
  const values = [[42, 30, 18, 12, 9, 6], [48, 34, 21, 15, 10, 8], [55, 37, 26, 17, 12, 9], [61, 41, 29, 20, 14, 10]];
  const cats = ['Q1', 'Q2', 'Q3', 'Q4'];
  const W = 640, H = 260, pad = { l: 40, r: 16, t: 16, b: 32 }, max = 70;
  const gw = (W - pad.l - pad.r) / cats.length, bw = (gw - 24) / slots.length;
  const y = v => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const grid = [0, 20, 40, 60].map(v => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="${pad.l - 8}" y="${y(v) + 4}" class="chart-tick" text-anchor="end">${v}</text>`).join('');
  const bars = values.map((row, ci) => row.map((v, si) => { const x = pad.l + ci * gw + 12 + si * bw; return `<rect x="${(x + 1).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(y(0) - y(v)).toFixed(1)}" rx="2" style="fill: var(--chart-${slots[si]})"><title>${series[si]}, ${cats[ci]}: ${v}</title></rect>`; }).join('') + `<text x="${pad.l + ci * gw + gw / 2}" y="${H - 10}" class="chart-tick" text-anchor="middle">${cats[ci]}</text>`).join('');
  const legend = slots.map((s, i) => `<li><span class="legend-key" style="background: var(--chart-${s})"></span>${series[i]}</li>`).join('');
  const sw = THEMES.map(theme => `<div class="theme-panel" data-theme="${theme}"><p class="label">Categorical · ${theme} · fixed order</p><div class="chart-slots">${slots.map(s => `<span class="chart-slot" style="background: var(--chart-${s})"><span>${s}</span></span>`).join('')}</div></div>`).join('');
  const seq = Object.keys(pick(t, 'chart.seq.')).map(k => `<span class="ramp-step" style="background: var(--chart-seq-${k})"></span>`).join('');
  const div = Object.keys(pick(t, 'chart.div.')).map(k => `<span class="ramp-step" style="background: var(--chart-div-${k})"></span>`).join('');
  return `<div class="theme-pair">${sw}</div><div class="ramp-row"><div><p class="label">Sequential (magnitude) · one hue</p><div class="ramp">${seq}</div></div><div><p class="label">Diverging (polarity) · grey midpoint</p><div class="ramp">${div}</div></div></div><figure class="chart-card"><figcaption class="chart-title">Specimen chart — grouped bars, six series <span class="muted">(specimen data)</span></figcaption><ul class="legend">${legend}</ul><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grouped bar chart specimen with six series over four quarters" class="chart-svg">${grid}${bars}</svg></figure>`;
}
function genType(t) {
  const samples = { hero: 'Hero statement placeholder', campaign: 'Page title placeholder', section: 'Section heading placeholder', subhead: 'Card or sub-section heading', detail: 'Detail heading for a group', lead: 'An introductory paragraph sits under a page or section heading and sets up what follows in one or two sentences.', body: 'Reading text explains the idea in full sentences. It keeps a bounded line length and open leading so a longer explanation stays comfortable. Placeholder copy; the story is decided separately.', compact: 'Compact text for card bodies, table cells and reference rows.', ui: 'Button · Navigation · Tab', small: 'Helper text, metadata and captions.', label: 'Supporting label', code: 'curl -X POST https://api.example.test/v1/run', stat: '1,284', numeric: '€0.02 · 1,284 · 312 ms' };
  return Object.entries(t.type.scale).map(([id, r]) => `<div class="type-row"><div class="type-meta"><code>${id}</code><span>${r.family === 'display' ? 'Space Grotesk' : r.family === 'body' ? 'Instrument Sans' : 'IBM Plex Mono'} ${r.weight}</span><span>${r.min === r.max ? r.min : `${r.min}–${r.max}`}px · ${r.line} · ${r.tracking}em</span><span class="${r.source === 'kit-06' ? 'tag tag-kit' : 'tag'}">${r.source}</span></div><p class="t-${id}">${esc(samples[id])}</p></div>`).join('');
}
function genSpace(t) {
  const space = t.spacing.filter(s => s > 0).map(s => `<div class="space-row"><code>--space-${s}</code><span class="space-bar" style="width: var(--space-${s})"></span></div>`).join('');
  const radii = Object.entries(t.layout.radius_roles).map(([k, r]) => `<figure class="radius-chip" style="border-radius: var(--radius-${k})"><figcaption><code>--radius-${k}</code><span>${r === 'full' ? 'full' : r + 'px'}</span></figcaption></figure>`).join('');
  const elev = THEMES.map(theme => `<div class="theme-panel elev-panel" data-theme="${theme}">${[0, 1, 2, 3].map(l => `<div class="elev-chip" style="box-shadow: var(--shadow-${l})"><code>--shadow-${l}</code></div>`).join('')}</div>`).join('');
  return `<div class="grid-2"><div><h3 class="subhead">Spacing</h3><p class="muted">4px base. Components use these steps only.</p>${space}</div><div><h3 class="subhead">Radii</h3><div class="radius-grid">${radii}</div><h3 class="subhead">Elevation</h3><p class="muted">Dark elevation also lifts the surface one step; a shadow alone does not read on dark.</p><div class="theme-pair">${elev}</div></div></div>`;
}
function genImagery(prov) {
  return `<div class="imagery-grid">${prov.imagery.map(a => {
    const [w, h] = a.ratio.split(':');
    const region = a.region ? `<span class="safe-region" style="left: ${a.region.x * 100}%; top: ${a.region.y * 100}%; width: ${a.region.width * 100}%; height: ${a.region.height * 100}%"><span>Reading region</span></span>` : '';
    return `<figure class="imagery-card"><div class="imagery-frame" style="aspect-ratio: ${w} / ${h}"><img src="../${esc(a.file)}" alt="" loading="lazy">${region}</div><figcaption><span class="imagery-name"><code>${esc(a.id)}</code> · ${esc(a.ratio)}</span><span class="tag">${esc(a.kit_check)}</span><span class="small muted">${esc(a.role)}</span></figcaption></figure>`;
  }).join('')}</div>`;
}
export function generatedRegions(t, prov) {
  return { palette: genPalette(t), contrast: genContrast(t), chart: genChart(t), type: genType(t), space: genSpace(t), imagery: genImagery(prov) };
}
export function fillSpecimen(html, regions) {
  for (const [name, body] of Object.entries(regions)) {
    const re = new RegExp(`(<!-- gen:${name} -->)[\\s\\S]*?(<!-- /gen:${name} -->)`);
    assert(re.test(html), `specimen/index.html is missing the gen:${name} markers`);
    html = html.replace(re, `$1\n${body}\n$2`);
  }
  return html;
}

// ---- literal lint for hand-written specimen CSS and inline styles ----
// Percentages, ch, deg, fr and unitless numbers (opacity, counts) are allowed: they are proportions, not design values.
const NAMED_COLOURS = new Set('black white red green blue yellow orange purple pink violet indigo navy teal cyan aqua magenta fuchsia lime olive maroon silver gray grey brown beige tan gold coral salmon crimson lavender ivory khaki plum orchid turquoise'.split(' '));
export function definedVars(tokensCss, localCss = '') {
  return new Set([...tokensCss.matchAll(/(--[\w-]+)\s*:/g), ...localCss.matchAll(/(--_[\w-]+)\s*:/g)].map(m => m[1]));
}
export function lintCss(css, t, defined, where = 'specimen.css') {
  const errors = [];
  const bps = Object.values(t.layout.breakpoints_px);
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const line of body.split('\n')) {
    let l = line;
    if (/^\s*@media/.test(l)) {
      for (const m of l.matchAll(/(\d+(?:\.\d+)?)px/g)) if (!bps.includes(+m[1])) errors.push(`${where}: media query ${m[0]} is not a token breakpoint`);
      if (/max-width/.test(l)) errors.push(`${where}: use min-width (mobile first), not max-width`);
      l = l.replace(/\d+(?:\.\d+)?px/g, '');
    }
    for (const m of l.matchAll(/#[0-9a-f]{3,8}\b/gi)) errors.push(`${where}: hex literal ${m[0]}`);
    for (const m of l.matchAll(/(?<![\w.])(-?\d*\.?\d+)(px|rem|em|pt|ms|s|vh|vw|vmin|vmax|cqi|cqw)\b/gi)) if (+m[1] !== 0) errors.push(`${where}: off-token length ${m[0]}`);
    if (/\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/i.test(l)) errors.push(`${where}: colour function literal`);
    for (const d of l.matchAll(/(?:^|[;{\s])(color|background(?:-color)?|border(?:-[a-z]+)*|outline(?:-color)?|fill|stroke|box-shadow|accent-color|text-decoration(?:-color)?|caret-color|--_[\w-]+)\s*:\s*([^;}]+)/gi)) {
      const words = d[2].replace(/var\([^)]*\)/g, '').toLowerCase().match(/[a-z]+/g) || [];
      for (const w of words) if (NAMED_COLOURS.has(w)) errors.push(`${where}: named colour ${w}`);
    }
    const ff = l.match(/font-family\s*:\s*([^;]+)/);
    if (ff && !/^\s*(var\(--[\w-]+\)|inherit)\s*$/.test(ff[1])) errors.push(`${where}: raw font-family ${ff[1].trim()}`);
  }
  for (const m of body.matchAll(/var\((--[\w-]+)/g)) if (!defined.has(m[1])) errors.push(`${where}: unknown token ${m[1]}`);
  return errors;
}
export function lintSpecimen(html, css, t, tokensCss, js = '') {
  const defined = definedVars(tokensCss, css);
  const errors = lintCss(css, t, defined);
  for (const m of html.matchAll(/style="([^"]*)"/g)) errors.push(...lintCss(m[1], t, defined, 'index.html inline style'));
  if (/<style[\s>]/.test(html)) errors.push('index.html: put styles in specimen.css, not a <style> block');
  // Behaviour only: specimen.js may toggle classes and attributes, never set style values.
  if (/\.style\b|setProperty\(|cssText/.test(js)) errors.push('specimen.js: sets inline style; toggle a class instead');
  for (const m of js.matchAll(/#[0-9a-f]{3,8}\b|\b\d*\.?\d+(px|rem|em|vh|vw)\b/gi)) errors.push(`specimen.js: style literal ${m[0]}`);
  for (const m of html.matchAll(/(?:src|href)="(\.\.\/[^"#]+|[^":#?]+\.(?:css|js|png|svg))"/g)) {
    const p = resolve(here, 'specimen', m[1]);
    if (m[1] === '../tokens.css') continue; // generated alongside this check
    if (!existsSync(p)) errors.push(`index.html: missing referenced file ${m[1]}`);
  }
  return errors;
}

// ---- main ----
export function buildAll(t = loadTokens(), prov = loadProvenance()) {
  validate(t, prov);
  const tokensCss = renderTokensCss(t, prov);
  const contrastMd = renderContrastMd(t);
  const html = fillSpecimen(read('specimen/index.html'), generatedRegions(t, prov));
  const errors = lintSpecimen(html, read('specimen/specimen.css'), t, tokensCss, read('specimen/specimen.js'));
  assert.deepEqual(errors, [], 'Specimen lint');
  return { 'tokens.css': tokensCss, 'CONTRAST.md': contrastMd, 'specimen/index.html': html };
}
function main() {
  const out = buildAll();
  if (process.argv.includes('--check')) {
    for (const [p, body] of Object.entries(out)) assert.equal(read(p), body, `${p} is stale — run node design/brand-kit/open-flow/build.mjs`);
    const rows = contrastResults(loadTokens());
    console.log(`ok   open-flow design system: ${rows.length} contrast pairs pass, specimen on-token, assets match provenance`);
  } else {
    for (const [p, body] of Object.entries(out)) writeFileSync(resolve(here, p), body);
    console.log('Built open-flow tokens.css, CONTRAST.md and specimen/index.html');
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
