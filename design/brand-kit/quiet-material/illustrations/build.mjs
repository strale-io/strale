import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const here = dirname(fileURLToPath(import.meta.url));
export const read = path => readFileSync(resolve(here, path), 'utf8');
export const json = path => JSON.parse(read(path));
export const digest = path => createHash('sha256').update(readFileSync(resolve(here, path))).digest('hex');
export const hashText = text => createHash('sha256').update(text).digest('hex');

export const inputFiles = [
  'README.md',
  'build.mjs',
  'build.test.mjs',
  'verify.mjs',
  'registry.json',
  '../../../tokens/candidates/quiet-material-illustrations.json',
  '../../../tokens/candidates/quiet-material-patterns.json',
  '../foundations/masters/strale-lockup.svg',
  '../foundations/registry.json',
  '../fonts/InstrumentSans.ttf',
  '../fonts/InstrumentSans-OFL.txt',
  '../../../../docs/programs/brand-website/homepage-brief.json',
  '../../../../docs/research/2026-09-06-shared-access-illustration.md'
];
export const inputHashes = () => Object.fromEntries(inputFiles.map(path => [path, digest(path)]));

const outputSvgFiles = [
  'masters/shared-access-desktop.svg',
  'masters/shared-access-narrow.svg',
  'exports/shared-access-desktop-light.svg',
  'exports/shared-access-desktop-dark.svg',
  'exports/shared-access-narrow-light.svg',
  'exports/shared-access-narrow-dark.svg'
];
export const generatedFiles = [...outputSvgFiles, 'index.html', 'manifest.json'];
export const verifiedFiles = [...generatedFiles, 'exports/shared-access-desktop.png', 'exports/shared-access-narrow.png'];

const esc = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const px = value => `${value}px`;
const em = value => `${value}em`;
const ch = value => `${value}ch`;

export function validateToken(token, foundation, registry = json('registry.json')) {
  assert.equal(token.name, 'Quiet Material shared-access illustration 0.1');
  assert.equal(token.status, 'proposed');
  assert.equal(registry.id, 'quiet-material-illustrations.shared-access.v1');
  assert.equal(registry.status, 'candidate');
  assert.equal(registry.production_adopted, false);
  assert.equal(registry.publication_approved, false);
  assert.deepEqual(Object.keys(token.layout.geometry), ['desktop', 'narrow'], 'Geometry must be the first bounded pair');
  assert.deepEqual(registry.labels, ['Your agent', 'Strale', 'Research', 'Extraction', 'Validation']);
  assert.equal(registry.motion, 'static');
  assert.equal(registry.asset_id, 'shared-access-diagram');
  assert.equal(registry.source.own_geometry, true);
  assert.equal(registry.source.editable, true);
  assert.equal(registry.rights.logo, 'pending');
  assert.match(registry.rights.logo_note, /No new rights claim/);
  const vars = foundation.layout.css_variables;
  for (const [key, value] of Object.entries(token.palette)) assert.equal(vars[key], value, `Retained palette changed ${key}`);
  assert.equal(token.type.families.sans, foundation.type.families.sans);
  for (const theme of ['light', 'dark']) for (const role of ['canvas', 'ink']) {
    const ref = token.layout.palette_refs[theme][role];
    assert(ref in vars, `Unknown retained token ${ref}`);
  }
  for (const [name, geometry] of Object.entries(token.layout.geometry)) {
    assert.deepEqual(geometry.view_box.slice(0, 2), [0, 0]);
    assert(geometry.view_box[2] > 0 && geometry.view_box[3] > 0);
    assert.equal(geometry.labels.length, 5, `${name} label count`);
    assert.deepEqual(geometry.labels.map(item => item.text), registry.labels, `${name} label set`);
    assert.equal(new Set(geometry.labels.map(item => item.id)).size, 5, `${name} stable label ids`);
    assert.match(geometry.connector.path, /^M /, `${name} connector path`);
    assert.equal(geometry.connector.stroke_width, 2);
    assert.equal(geometry.connector.linecap, 'round');
    assert.equal(geometry.connector.linejoin, 'round');
  }
  assert.equal(token.layout.geometry.desktop.view_box[2], 1080);
  assert.equal(token.layout.geometry.desktop.view_box[3], 360);
  assert.equal(token.layout.geometry.narrow.view_box[2], 320);
  assert.equal(token.layout.geometry.narrow.view_box[3], 440);
  assert(token.type.scale.task.narrow * ((320 - 2 * token.layout.preview.page_padding_narrow_px) / 320) >= registry.minimum_label_css_px);
  assert(token.type.scale.task.desktop * ((token.layout.preview.responsive_breakpoint_px + 1 - 2 * token.layout.preview.page_padding_wide_px) / token.layout.geometry.desktop.view_box[2]) >= registry.minimum_label_css_px);
  assert.equal(registry.prohibited.length, 8);
  return true;
}

function logoGeometry() {
  const source = read('../foundations/masters/strale-lockup.svg');
  const match = source.match(/(<g fill="currentColor">[\s\S]*<\/g>)\s*<\/svg>/);
  assert(match, 'Retained lockup geometry could not be read');
  return match[1];
}

function svgDocument(token, foundation, registry, size, theme, master = false) {
  const geometry = token.layout.geometry[size];
  const palette = token.layout.palette_refs[theme];
  const vars = foundation.layout.css_variables;
  const canvas = vars[palette.canvas];
  const ink = vars[palette.ink];
  const family = token.type.families.sans;
  const font = readFileSync(resolve(here, '../fonts/InstrumentSans.ttf')).toString('base64');
  const logo = geometry.logo;
  const logoScale = logo.width / foundation.layout.identity.source_viewbox[2];
  const labelSize = id => token.type.scale[id === 'agent' ? 'agent' : 'task'][size];
  const metadata = {
    id: registry.asset_id,
    size,
    theme,
    status: registry.status,
    source: registry.source.geometry,
    editable_master: master,
    logo_rights: registry.rights.logo,
    logo_rights_note: registry.rights.logo_note,
    alt: registry.alt
  };
  const labels = geometry.labels.map(label => label.role === 'logo-alternative'
    ? `<text data-label="${esc(label.text)}" data-role="${label.role}" x="${label.x}" y="${label.y}" text-anchor="${label.anchor}" class="visually-hidden">${esc(label.text)}</text>`
    : `<text data-label="${esc(label.text)}" data-role="${label.role}" x="${label.x}" y="${label.y}" text-anchor="${label.anchor}" font-size="${labelSize(label.id)}">${esc(label.text)}</text>`).join('\n    ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${geometry.view_box.join(' ')}" role="img" aria-labelledby="title desc" data-asset-id="${registry.asset_id}" data-layout="${size}" data-theme="${theme}" data-logo-rights="pending">
  <title id="title">Shared access through Strale</title>
  <desc id="desc">${esc(registry.alt)}</desc>
  <metadata>${esc(JSON.stringify(metadata))}</metadata>
  <style>
    @font-face{font-family:"Instrument Sans";src:url(data:font/ttf;base64,${font}) format("truetype");font-style:normal;font-weight:${token.type.scale.task.weight};font-display:block}
    :root{--illustration-canvas:${canvas};--illustration-ink:${ink}}
    text{font-family:${family};font-weight:${token.type.scale.task.weight};line-height:${token.type.scale.task.line};letter-spacing:${em(token.type.scale.task.tracking)};fill:var(--illustration-ink)}
    .visually-hidden{font-size:0;opacity:0}
  </style>
  <rect width="${geometry.view_box[2]}" height="${geometry.view_box[3]}" fill="var(--illustration-canvas)"/>
  <path data-connector-network="true" data-topology="agent-strale-shared-trunk-three-parallel-branches" d="${geometry.connector.path}" fill="none" stroke="var(--illustration-ink)" stroke-width="${geometry.connector.stroke_width}" stroke-linecap="${geometry.connector.linecap}" stroke-linejoin="${geometry.connector.linejoin}"/>
  <g data-node="strale" data-logo-rights="pending" color="var(--illustration-ink)" transform="translate(${logo.x} ${logo.y}) scale(${logoScale})">
    <title>Strale</title>
    ${logoGeometry()}
  </g>
  <g data-labels="true">
    ${labels}
  </g>
</svg>\n`;
}

function previewCss(token, foundation) {
  const p = token.layout.preview;
  const vars = foundation.layout.css_variables;
  const cssVars = {
    '--canvas': vars['--canvas'],
    '--ink': vars['--ink'],
    '--ink-secondary': vars['--ink-secondary'],
    '--section-canvas-dark': vars['--section-canvas-dark'],
    '--ink-inverse': vars['--ink-inverse'],
    '--ink-inverse-secondary': vars['--ink-inverse-secondary'],
    '--hairline': vars['--hairline'],
    '--sans': vars['--sans'],
    '--i-content-max': px(p.content_max_width_px),
    '--i-art-desktop': px(p.artwork_desktop_max_width_px),
    '--i-art-narrow': px(p.artwork_narrow_max_width_px),
    '--i-page-pad': px(p.page_padding_wide_px),
    '--i-page-pad-narrow': px(p.page_padding_narrow_px),
    '--i-section-pad': px(p.section_padding_wide_px),
    '--i-section-pad-narrow': px(p.section_padding_narrow_px),
    '--i-copy-gap': px(p.copy_gap_px),
    '--i-art-gap': px(p.artwork_gap_px),
    '--i-specimen-gap': px(p.specimen_gap_px),
    '--i-headline': px(p.headline_size_px),
    '--i-headline-narrow': px(p.headline_narrow_px),
    '--i-headline-line': p.headline_line_height,
    '--i-headline-track': em(p.headline_tracking_em),
    '--i-headline-measure': ch(p.headline_measure_ch),
    '--i-body': px(p.body_size_px),
    '--i-body-narrow': px(p.body_narrow_px),
    '--i-body-line': p.body_line_height,
    '--i-body-measure': ch(p.body_measure_ch),
    '--i-link': px(p.link_size_px),
    '--i-link-line': p.link_line_height,
    '--i-rule': px(p.rule_width_px),
    '--i-underline': px(p.link_underline_px),
    '--i-link-offset': px(p.link_offset_px),
    '--i-focus': px(p.focus_width_px),
    '--i-focus-offset': px(p.focus_offset_px)
  };
  return `:root{${Object.entries(cssVars).map(([key, value]) => `${key}:${value}`).join(';')}}
*{box-sizing:border-box}html,body{margin:0;min-width:0;background:var(--canvas);color:var(--ink);font-family:var(--sans)}.specimen{padding:var(--i-section-pad) var(--i-page-pad)}.specimen.dark{background:var(--section-canvas-dark);color:var(--ink-inverse);margin-top:var(--i-specimen-gap)}.content{max-width:var(--i-content-max);margin:auto}.copy{display:grid;gap:var(--i-copy-gap)}h1,h2,p{margin:0}h1,h2{max-width:var(--i-headline-measure);font-size:var(--i-headline);font-weight:400;line-height:var(--i-headline-line);letter-spacing:var(--i-headline-track);text-wrap:balance}.copy p{max-width:var(--i-body-measure);font-size:var(--i-body);line-height:var(--i-body-line);color:var(--ink-secondary);text-wrap:pretty}.dark .copy p{color:var(--ink-inverse-secondary)}.artwork{display:block;max-width:var(--i-art-desktop);margin:var(--i-art-gap) auto 0}.artwork img{display:block;width:100%;height:auto}.notes{margin-top:var(--i-copy-gap)}a{color:inherit;font-size:var(--i-link);line-height:var(--i-link-line);text-decoration-thickness:var(--i-underline);text-underline-offset:var(--i-link-offset)}a:focus-visible{outline:var(--i-focus) solid currentColor;outline-offset:var(--i-focus-offset)}
@media(max-width:${px(p.responsive_breakpoint_px)}){.specimen{padding:var(--i-section-pad-narrow) var(--i-page-pad-narrow)}h1,h2{font-size:var(--i-headline-narrow)}.copy p{font-size:var(--i-body-narrow)}.artwork{max-width:var(--i-art-narrow)}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;scroll-behavior:auto!important}}`;
}

export function validateBriefContract(brief, registry = json('registry.json')) {
  const section = brief.sections.find(item => item.id === 'shared-access');
  assert(section, 'Shared-access brief section is missing');
  assert.equal(section.visual, registry.asset_id, 'Brief visual must match the registered asset');
  const illustration = brief.illustrations.find(item => item.id === registry.asset_id);
  assert(illustration, 'Shared-access illustration contract is missing');
  assert.equal(illustration.status, 'candidate-master-for-review');
  assert.equal(illustration.asset_registry, 'design/brand-kit/quiet-material/illustrations/registry.json');
  assert.deepEqual(illustration.labels, registry.labels, 'Brief and registry labels must agree');
  assert.equal(illustration.alt, registry.alt, 'Brief and registry alternatives must agree');
  assert.equal(illustration.motion, 'No animated traffic or concurrent completion states. The diagram explains access, not a captured run.');
  assert.equal(registry.motion, 'static');
  return section;
}

export function render(token = json('../../../tokens/candidates/quiet-material-illustrations.json'), foundation = json('../../../tokens/candidates/quiet-material-patterns.json')) {
  const registry = json('registry.json');
  validateToken(token, foundation, registry);
  const section = validateBriefContract(json('../../../../docs/programs/brand-website/homepage-brief.json'), registry);
  const svg = {
    'masters/shared-access-desktop.svg': svgDocument(token, foundation, registry, 'desktop', 'light', true),
    'masters/shared-access-narrow.svg': svgDocument(token, foundation, registry, 'narrow', 'light', true),
    'exports/shared-access-desktop-light.svg': svgDocument(token, foundation, registry, 'desktop', 'light'),
    'exports/shared-access-desktop-dark.svg': svgDocument(token, foundation, registry, 'desktop', 'dark'),
    'exports/shared-access-narrow-light.svg': svgDocument(token, foundation, registry, 'narrow', 'light'),
    'exports/shared-access-narrow-dark.svg': svgDocument(token, foundation, registry, 'narrow', 'dark')
  };
  const picture = theme => `<picture class="artwork" data-artwork="${theme}"><source media="(max-width: ${token.layout.preview.responsive_breakpoint_px}px)" srcset="exports/shared-access-narrow-${theme}.svg"><img src="exports/shared-access-desktop-${theme}.svg" width="${token.layout.geometry.desktop.view_box[2]}" height="${token.layout.geometry.desktop.view_box[3]}" alt="${esc(registry.alt)}"></picture>`;
  const index = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared access illustration · Quiet Material</title><style>@font-face{font-family:"Instrument Sans";src:url(../fonts/InstrumentSans.ttf) format("truetype");font-style:normal;font-weight:400 600;font-display:swap}${previewCss(token, foundation)}</style></head>
<body><main>
  <section class="specimen light" data-theme="light"><div class="content"><div class="copy"><h1>${esc(section.headline)}</h1><p>${esc(section.body)}</p></div>${picture('light')}<p class="notes"><a href="README.md">Illustration usage notes</a></p></div></section>
  <section class="specimen dark" data-theme="dark"><div class="content"><div class="copy"><h2>${esc(section.headline)}</h2><p>${esc(section.body)}</p></div>${picture('dark')}<p class="notes"><a href="README.md">Illustration usage notes</a></p></div></section>
</main></body></html>\n`;
  const manifest = {
    schema_version: 1,
    id: registry.asset_id,
    status: registry.status,
    production_adopted: registry.production_adopted,
    source: registry.source,
    context: registry.context,
    alt: registry.alt,
    rights: registry.rights,
    token_source: registry.source.geometry,
    reference_lock: registry.reference_lock,
    topology: registry.topology,
    motion: registry.motion,
    palette_refs: token.layout.palette_refs,
    review_exports: registry.exports.filter(file => file.endsWith('.png')).map(file => file.split('/').slice(-2).join('/')),
    files: Object.entries(svg).map(([file, contents]) => ({file, sha256: hashText(contents)}))
  };
  return {...svg, 'index.html': index, 'manifest.json': JSON.stringify(manifest, null, 2) + '\n'};
}

export function assertOutputs(expected, readOutput = read) {
  for (const [path, contents] of Object.entries(expected)) assert.equal(readOutput(path), contents, `Stale output ${path}`);
  return true;
}

export function validateEvidence(evidence, expected = render()) {
  assert(evidence, 'Missing verification evidence');
  assert.equal(evidence.id, 'quiet-material-illustrations.shared-access.v1');
  assert.deepEqual(evidence.inputs, inputHashes(), 'Stale verification inputs');
  assert.deepEqual(evidence.scope.widths, [320, 375, 760, 1120, 1440]);
  assert.deepEqual(evidence.scope.breakpoint_edge_widths, [761]);
  assert.deepEqual(evidence.scope.themes, ['light', 'dark']);
  assert.equal(evidence.scope.network, 'local file and data URI only');
  for (const check of ['no_overflow', 'svg_image_decode', 'labels', 'topology', 'fonts_loaded', 'contrast', 'narrow_label_size', 'reduced_motion_static', 'network_local_only']) assert.equal(evidence.checks[check], true, `Missing evidence check ${check}`);
  assert.deepEqual(evidence.errors, []);
  assert.deepEqual(evidence.contrast.map(item => `${item.theme}:${item.usage}`), ['light:text', 'light:connector', 'dark:text', 'dark:connector']);
  assert(evidence.contrast.length === 4 && evidence.contrast.every(item => Number.isFinite(item.ratio) && item.ratio >= item.required), 'Contrast evidence failed');
  assert.deepEqual(Object.keys(evidence.outputs).sort(), verifiedFiles.sort());
  for (const path of verifiedFiles) assert.equal(evidence.outputs[path], digest(path), `Stale verified output ${path}`);
  assert.deepEqual(Object.keys(expected).sort(), generatedFiles.sort());
  return true;
}

function main() {
  const expected = render();
  if (process.argv.includes('--check')) {
    assertOutputs(expected);
    assert(existsSync(resolve(here, 'verification.json')), 'Missing verification.json; run verify.mjs');
    validateEvidence(json('verification.json'), expected);
    console.log('Shared-access illustration sources, outputs and evidence pass');
    return;
  }
  for (const directory of ['masters', 'exports']) mkdirSync(resolve(here, directory), {recursive: true});
  for (const [path, contents] of Object.entries(expected)) writeFileSync(resolve(here, path), contents);
  console.log('Built shared-access desktop/narrow masters, light/dark exports and preview');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
