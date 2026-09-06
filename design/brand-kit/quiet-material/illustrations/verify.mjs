import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {digest, generatedFiles, here, inputHashes, json, verifiedFiles} from './build.mjs';

assert(process.argv[2], 'Pass the Playwright module path as argv[2]');
const {chromium} = await import(pathToFileURL(resolve(process.argv[2])).href);
const token = json('../../../tokens/candidates/quiet-material-illustrations.json');
const foundation = json('../../../tokens/candidates/quiet-material-patterns.json');
const registry = json('registry.json');
const widths = [320, 375, 760, 1120, 1440];
const breakpointEdgeWidths = [761];
const themes = ['light', 'dark'];
const errors = [];
const remoteRequests = [];
const measurements = {responsive: [], svg: []};
const checks = {};
const decodedSvgExports = new Set();

const browser = await chromium.launch({channel: 'chrome', headless: true});
const context = await browser.newContext({viewport: {width: 1120, height: 900}, deviceScaleFactor: 1});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await context.route('**/*', route => {
  const url = route.request().url();
  if (/^(file:|data:)/.test(url)) return route.continue();
  remoteRequests.push(url);
  return route.abort();
});

const openLocal = async path => {
  await page.goto(pathToFileURL(resolve(here, path)).href);
  await page.evaluate(() => document.fonts.ready);
};

for (const width of [...widths, ...breakpointEdgeWidths]) {
  await page.setViewportSize({width, height: 900});
  await openLocal('index.html');
  await page.locator('img').evaluateAll(async images => Promise.all(images.map(image => image.decode())));
  const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width && box.height && style.display !== 'none' && (box.left < -0.5 || box.right > innerWidth + 0.5);
  }).map(element => `${element.tagName}.${element.className}`));
  assert.deepEqual(overflow, [], `Preview overflow at ${width}px`);
  for (const theme of themes) {
    const artwork = page.locator(`[data-artwork="${theme}"] img`);
    const current = await artwork.evaluate(image => ({
      source: new URL(image.currentSrc).pathname.split('/').pop(),
      width: image.getBoundingClientRect().width,
      height: image.getBoundingClientRect().height
    }));
    const expectedLayout = width <= token.layout.preview.responsive_breakpoint_px ? 'narrow' : 'desktop';
    assert.equal(current.source, `shared-access-${expectedLayout}-${theme}.svg`);
    decodedSvgExports.add(current.source);
    measurements.responsive.push({width, theme, layout: expectedLayout, rendered_width: current.width, rendered_height: current.height});
  }
}
checks.no_overflow = true;
assert.deepEqual([...decodedSvgExports].sort(), [
  'shared-access-desktop-dark.svg',
  'shared-access-desktop-light.svg',
  'shared-access-narrow-dark.svg',
  'shared-access-narrow-light.svg'
]);
checks.svg_image_decode = true;

const svgFiles = generatedFiles.filter(path => path.endsWith('.svg'));
for (const file of svgFiles) {
  const layout = file.includes('narrow') ? 'narrow' : 'desktop';
  const geometry = token.layout.geometry[layout];
  await page.setViewportSize({width: geometry.view_box[2], height: geometry.view_box[3]});
  await openLocal(file);
  const root = page.locator('svg');
  assert.equal(await root.getAttribute('data-logo-rights'), 'pending');
  assert.equal(await page.locator('[data-node="strale"]').getAttribute('data-logo-rights'), 'pending');
  assert((await page.locator('metadata').textContent()).includes('"logo_rights":"pending"'));
  assert.deepEqual(await page.locator('[data-label]').allTextContents(), registry.labels);
  assert.equal(await page.locator('[data-connector-network]').count(), 1);
  assert.equal(await page.locator('[data-connector-network]').getAttribute('data-topology'), 'agent-strale-shared-trunk-three-parallel-branches');
  assert.equal(await page.locator('[data-connector-network]').getAttribute('d'), geometry.connector.path);
  assert.equal(await page.evaluate(() => document.fonts.check('20px "Instrument Sans"')), true, `${file} embedded font`);
  assert(await page.locator('text:not(.visually-hidden)').evaluateAll(elements => elements.every(element => getComputedStyle(element).fontFamily.includes('Instrument Sans'))));
  const bounds = await page.locator('text:not(.visually-hidden)').evaluateAll(elements => elements.map(element => {
    const box = element.getBBox();
    return {text: element.textContent, left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height, size: parseFloat(getComputedStyle(element).fontSize)};
  }));
  assert(bounds.every(box => box.left >= 0 && box.right <= geometry.view_box[2] && box.top >= 0 && box.bottom <= geometry.view_box[3]), `${file} label bounds`);
  const tasks = bounds.filter(box => ['Research', 'Extraction', 'Validation'].includes(box.text));
  if (layout === 'narrow') {
    const ordered = [...tasks].sort((a, b) => a.top - b.top);
    for (let index = 1; index < ordered.length; index++) assert(ordered[index - 1].bottom < ordered[index].top, `${file} narrow labels overlap`);
  }
  assert.equal(await page.evaluate(() => document.getAnimations().length), 0, `${file} must remain static`);
  measurements.svg.push({file, layout, labels: bounds});
}
checks.labels = true;
checks.topology = true;
checks.fonts_loaded = true;

await page.setViewportSize({width: 320, height: 900});
await openLocal('index.html');
await page.locator('img').evaluateAll(async images => Promise.all(images.map(image => image.decode())));
const narrowRenderedWidth = await page.locator('[data-artwork="light"] img').evaluate(image => image.getBoundingClientRect().width);
const effectiveNarrowTaskSize = token.type.scale.task.narrow * narrowRenderedWidth / token.layout.geometry.narrow.view_box[2];
assert(effectiveNarrowTaskSize >= registry.minimum_label_css_px, `Narrow labels render at ${effectiveNarrowTaskSize}px`);
measurements.minimum_narrow_label_css_px = effectiveNarrowTaskSize;
const minimumDesktopLabelSize = token.type.scale.task.desktop * (token.layout.preview.responsive_breakpoint_px + 1 - 2 * token.layout.preview.page_padding_wide_px) / token.layout.geometry.desktop.view_box[2];
assert(minimumDesktopLabelSize >= registry.minimum_label_css_px);
measurements.minimum_desktop_label_css_px_above_breakpoint = minimumDesktopLabelSize;
checks.narrow_label_size = true;

await page.emulateMedia({reducedMotion: 'reduce'});
assert.equal(await page.evaluate(() => document.getAnimations().length), 0);
assert(await page.locator('*').evaluateAll(elements => elements.every(element => getComputedStyle(element).animationName === 'none')));
checks.reduced_motion_static = true;
await page.emulateMedia({reducedMotion: 'no-preference'});

const rgb = hex => hex.replace('#', '').match(/.{2}/g).map(value => parseInt(value, 16));
const luminance = color => rgb(color).map(value => value / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
const ratio = (foreground, background) => (Math.max(luminance(foreground), luminance(background)) + 0.05) / (Math.min(luminance(foreground), luminance(background)) + 0.05);
const retained = foundation.layout.css_variables;
const contrast = [];
for (const theme of themes) {
  const refs = token.layout.palette_refs[theme];
  const foreground = retained[refs.ink];
  const background = retained[refs.canvas];
  const measured = ratio(foreground, background);
  contrast.push({theme, usage: 'text', foreground: refs.ink, background: refs.canvas, required: registry.contrast.text_min, ratio: measured});
  contrast.push({theme, usage: 'connector', foreground: refs.ink, background: refs.canvas, required: registry.contrast.connector_min, ratio: measured});
}
assert(contrast.every(item => item.ratio >= item.required));
checks.contrast = true;

mkdirSync(resolve(here, 'exports'), {recursive: true});
for (const [layout, path] of [['desktop', 'exports/shared-access-desktop.png'], ['narrow', 'exports/shared-access-narrow.png']]) {
  const geometry = token.layout.geometry[layout];
  await page.setViewportSize({width: geometry.view_box[2], height: geometry.view_box[3]});
  await openLocal(`exports/shared-access-${layout}-light.svg`);
  await page.locator('svg').screenshot({path: resolve(here, path), omitBackground: false});
}

assert.deepEqual(remoteRequests, []);
assert.deepEqual(errors, []);
checks.network_local_only = true;
const evidence = {
  schema_version: 1,
  id: registry.id,
  status: 'verified-candidate',
  verified_at: '2026-09-06',
  inputs: inputHashes(),
  scope: {widths, breakpoint_edge_widths: breakpointEdgeWidths, themes, network: 'local file and data URI only', layouts: ['desktop', 'narrow'], motion: 'static'},
  checks,
  measurements,
  contrast,
  errors,
  runtime: {node: process.version, chromium: browser.version(), playwright_module: 'supplied via argv[2]'},
  limits: [
    'Local Chromium verification is not production website or cross-browser certification.',
    'The illustration is conceptual and does not evidence a captured run or route parity.',
    'Retained logo creation and rights history remains pending; verification does not resolve it.'
  ],
  outputs: Object.fromEntries(verifiedFiles.map(path => [path, digest(path)]))
};
writeFileSync(resolve(here, 'verification.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify({ok: true, checks, screenshots: ['exports/shared-access-desktop.png', 'exports/shared-access-narrow.png']}));
await context.close();
await browser.close();
