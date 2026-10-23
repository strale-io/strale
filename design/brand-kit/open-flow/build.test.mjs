import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { here, loadTokens, loadProvenance, validate, contrast, contrastResults, lintCss, definedVars, renderTokensCss, buildAll, fluid } from './build.mjs';

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
  for (const [k, v] of Object.entries(kit)) assert.equal(tokens.palette[`brand.${k}`], v, k);
  assert.equal(tokens.type.scale.hero.min, 36); assert.equal(tokens.type.scale.hero.max, 76);
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
