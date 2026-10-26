import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { here, loadTokens, loadProvenance, validate, contrast, contrastResults, lintCss, lintSpecimen, definedVars, renderTokensCss, buildAll, fluid } from './build.mjs';

const tokens = loadTokens();
const prov = loadProvenance();
const tokensCss = renderTokensCss(tokens);
const defined = definedVars(tokensCss);

test('WCAG maths matches known reference ratios', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(2), '21.00');
  assert.equal(contrast('#ffffff', '#3027ff').toFixed(2), '7.34'); // kit-06 colourPairs records 7.34
  assert.equal(contrast('#17151c', '#3027ff').toFixed(2), '2.46'); // kit-06 records 2.46 (avoid)
});

test('every contrast pair passes in both themes', () => {
  const rows = contrastResults(tokens);
  assert(rows.length >= 90);
  assert.deepEqual(rows.filter(r => !r.pass), []);
  assert.deepEqual([...new Set(rows.map(r => r.theme))], ['light', 'dark']);
});

test('a role colour that drops below AA fails the check', () => {
  const t = structuredClone(tokens);
  t.palette['light.text-muted'] = '#9a93a6';
  assert.throws(() => validate(t, prov, { checkFiles: false }), /Contrast below minimum/);
});

test('a dark theme missing a role fails', () => {
  const t = structuredClone(tokens);
  delete t.palette['dark.focus'];
  assert.throws(() => validate(t, prov, { checkFiles: false }), /same role set|does not resolve/);
});

test('reading text below 16px violates the kit rule', () => {
  const t = structuredClone(tokens);
  t.type.scale.body.min = 15;
  assert.throws(() => validate(t, prov, { checkFiles: false }), /never below 16px/);
});

test('kit-06 brand colours are carried over unchanged', () => {
  const kit = { blue: '#3027ff', violet: '#7222ff', teal: '#008c87', soft: '#eecff2', ink: '#17151c', paper: '#ffffff', 'mist-blue': '#e4e8ff', 'mist-teal': '#d7efeb', 'deep-violet': '#29164b', 'logo-black': '#000000' };
  for (const [k, v] of Object.entries({ ...kit, border: '#d2cfd8' })) assert.equal(tokens.palette[`brand.${k}`], v, k);
  // kit-06 typeRoles, verbatim: every role tagged source "kit-06" must match it exactly.
  const kitRoles = { hero: [600, 36, 76, 1.04, -0.045, '16ch', 'display'], campaign: [600, 30, 52, 1.08, -0.04, '20ch', 'display'], section: [600, 26, 36, 1.15, -0.03, '28ch', 'display'], body: [400, 16, 19, 1.6, 0, '62ch', 'body'], compact: [400, 16, 17, 1.5, 0, '58ch', 'body'], label: [600, 12, 13, 1.5, 0.06, '40ch', 'body'], detail: [600, 17, 20, 1.35, 0, '42ch', 'body'] };
  // A kit role revised later (0.3, 2026-10-26: smaller running text, shorter measures) is tagged derived and keeps
  // the kit's own sizes and measure in kit_original; everything else about it must still be the kit's.
  for (const [id, r] of Object.entries(tokens.type.scale)) {
    if (r.source !== 'kit-06' && !r.kit_original) continue;
    assert(id in kitRoles, `${id} is tagged kit-06 but kit-06 has no such role`);
    const k = r.source === 'kit-06' ? r : { ...r, ...r.kit_original };
    if (r.source !== 'kit-06') assert.equal(r.source, 'derived', `${id}: a revised kit role is tagged derived`);
    assert.deepEqual([k.weight, k.min, k.max, k.line, k.tracking, k.measure, k.family], kitRoles[id], `${id} differs from kit-06`);
  }
  assert.deepEqual(Object.keys(kitRoles).sort(), Object.entries(tokens.type.scale).filter(([, r]) => r.source === 'kit-06' || r.kit_original).map(([id]) => id).sort());
  assert.equal(tokens.layout.radius_roles.control, 8);
  assert.equal(tokens.motion.duration['reveal-signature'], 1600); assert.equal(tokens.motion.duration['reveal-atmosphere'], 2200);
});

test('lint rejects planted hex, px, raw font stacks, unknown tokens and off-scale breakpoints', () => {
  assert.deepEqual(lintCss('.a { color: var(--text); padding: var(--space-16); }', tokens, defined), []);
  assert.match(lintCss('.a { color: #ff0000; }', tokens, defined).join(), /hex literal/);
  assert.match(lintCss('.a { padding: 13px; }', tokens, defined).join(), /off-token length/);
  assert.match(lintCss('.a { transition: color 150ms; }', tokens, defined).join(), /off-token length/);
  assert.match(lintCss('.a { font-family: Arial, sans-serif; }', tokens, defined).join(), /raw font-family/);
  assert.match(lintCss('.a { color: var(--not-a-token); }', tokens, defined).join(), /unknown token/);
  assert.match(lintCss('@media (min-width: 900px) { .a { display: none; } }', tokens, defined).join(), /not a token breakpoint/);
  assert.match(lintCss('@media (max-width: 768px) { .a { display: none; } }', tokens, defined).join(), /min-width/);
  assert.match(lintCss('.a { background: rgb(0 0 0); }', tokens, defined).join(), /colour function/);
  assert.match(lintCss('.a { margin: -13px; }', tokens, defined).join(), /off-token length -13px/);
  assert.match(lintCss('.a { padding: 7Px; }', tokens, defined).join(), /off-token length/);
  assert.match(lintCss('.a { color: rebeccapurple; background: white; }', tokens, defined).join(), /named colour white/);
  assert.match(lintCss('.a { border: var(--border-width) solid red; }', tokens, defined).join(), /named colour red/);
  assert.match(lintCss('.a { background: color-mix(in srgb, var(--text) 8%, transparent); }', tokens, defined).join(), /colour function/);
  assert.match(lintCss('.a { color: oklch(60% 0.2 270); }', tokens, defined).join(), /colour function/);
  assert.match(lintCss('.btn-x { --_bg: white; }', tokens, defined).join(), /named colour white/);
  assert.deepEqual(lintCss('.a { width: 53%; opacity: 0.45; transform: rotate(180deg); max-width: 62ch; }', tokens, defined), []);
});

test('the candidate must stay adopted and identical to the active.json website surface', () => {
  assert.equal(validate(tokens, prov, { checkFiles: false }), true);
  const proposed = structuredClone(tokens);
  proposed.status = 'proposed';
  assert.throws(() => validate(proposed, prov, { checkFiles: false }), /status is adopted/);
  const drifted = structuredClone(tokens);
  drifted.palette['light.canvas'] = '#fdf7ff';
  assert.throws(() => validate(drifted, prov, { checkFiles: false }), /website\.palette differs/);
  const website = { ...structuredClone(tokens), adopted_by: 'DEC-OTHER' };
  assert.throws(() => validate(tokens, prov, { checkFiles: false, website }), /adopted by DEC-20261025-A/);
});

test('renderTokensCss can point fonts at a web path', () => {
  const css = renderTokensCss(tokens, prov, { fontBase: '/fonts/', header: '/* x */' });
  assert.match(css, /url\("\/fonts\/SpaceGrotesk\.ttf"\)/);
  assert(css.startsWith('/* x */'));
});

test('a changed asset fails the provenance hash check', () => {
  const p = structuredClone(prov);
  p.imagery[0].sha256 = '0'.repeat(64);
  assert.throws(() => validate(tokens, p), /File changed/);
});

test('copied imagery hashes match the kit-06 asset hashes', () => {
  const kitHashes = { 'wide.png': 'cbeba88715e0d54d9dbe068d9e1985bbb2f99dffc622b4023d0c2446e37fb55d', 'centre-field.png': '3e7858b8a5e13abfb9c6d7e46227b38d42cc0641a6e76644100b0ef14122d3bd', 'card-field.png': 'd768d11c1c9f4c99d1c43098e9104cb1e4c9f6a077e1d8063694effc3717ee9f', 'portrait-field.png': 'fe3d52911d3882be282d0c87d6e0a32e426b6449f3fb8d9e0937ca51c66cec5c', 'field.png': '3d9707b7f2496d75c004f9738bbc44f2c662b7708196f579875e4864cd62edb9', 'light.png': '7f177398b2ebf444dd85e3c55b2ac81240ca6bcd8284007115a12729fbf321c6', 'bands.svg': 'f2eb514469c7f9afde187ac87392dcad164c71d70eeb5e6742911ccf8d6f09fa' };
  for (const a of prov.imagery) assert.equal(a.sha256, kitHashes[a.file.split('/').pop()], a.id);
});

test('fluid sizes hit their endpoints at 360px and 1440px', () => {
  const css = fluid(36, 76);
  const m = css.match(/clamp\(36px, ([\d.-]+)px \+ ([\d.]+)vw, 76px\)/);
  assert(m, css);
  const at = w => +m[1] + (+m[2] * w) / 100;
  assert(Math.abs(at(360) - 36) < 0.01 && Math.abs(at(1440) - 76) < 0.01);
});

test('generated outputs are in sync with the token file', () => {
  for (const [p, body] of Object.entries(buildAll())) assert.equal(readFileSync(resolve(here, p), 'utf8'), body, `${p} is stale`);
});

test('the specimen stays on-token after a planted inline literal', () => {
  const html = readFileSync(resolve(here, 'specimen/index.html'), 'utf8');
  assert.match(lintCss('padding: 13px', tokens, defined, 'inline').join(), /off-token/);
  assert(html.includes('<!-- gen:contrast -->'));
});

test('the hero shell reads its text region from the asset record, not a copied number', () => {
  const css = readFileSync(resolve(here, 'specimen/specimen.css'), 'utf8');
  const wide = prov.imagery.find(a => a.id === 'wide').region;
  assert.match(tokensCss, new RegExp(`--region-wide-x: ${wide.x * 100}%`));
  assert.match(css, /left: var\(--region-wide-x\)/);
});

test('dark-theme state indicators and special focus rings are proven, not assumed', () => {
  const rows = contrastResults(tokens);
  for (const [fg, bg] of [['indicator', 'canvas'], ['indicator', 'surface'], ['focus-inverse', 'surface-inverse'], ['focus-code', 'code-bg'], ['border-strong', 'surface-soft']]) {
    const r = rows.filter(x => x.fg === fg && x.bg === bg);
    assert.equal(r.length, 2, `${fg} on ${bg} must be proven in both themes`);
    assert(r.every(x => x.pass));
  }
});

test('specimen.js may not set styles or carry colour/length literals', () => {
  const lint = js => lintSpecimen('', '', tokens, tokensCss, js).join();
  assert.match(lint("el.style.color = 'x';"), /sets inline style/);
  assert.match(lint("const c = '#fff';"), /style literal #fff/);
  assert.match(lint("const w = '2rem';"), /style literal 2rem/);
  assert.equal(lint("el.classList.add('is-open');"), '');
});
