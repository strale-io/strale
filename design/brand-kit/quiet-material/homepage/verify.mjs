import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const playwrightArg = process.argv[2];
const lf = value => String(value).replace(/\r\n/g, '\n');
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = message => { throw new Error(message); };
const expect = (condition, message) => { if (!condition) fail(message); };

let playwright;
if (playwrightArg) playwright = await import(pathToFileURL(resolve(playwrightArg)).href);
else {
  try { playwright = await import('playwright'); }
  catch { fail('Pass the bundled Playwright entry path, for example playwright/index.mjs.'); }
}

const registry = JSON.parse(await readFile(resolve(here, 'registry.json'), 'utf8'));
const brief = JSON.parse(await readFile(resolve(root, 'docs/programs/brand-website/homepage-brief.json'), 'utf8'));
const manifestBytes = Buffer.from(lf(await readFile(resolve(here, 'manifest.json'), 'utf8')));
const manifest = JSON.parse(manifestBytes);
const pageTokens = JSON.parse(await readFile(resolve(root, 'design/tokens/candidates/quiet-material-homepage.json'), 'utf8'));
const indexUrl = pathToFileURL(resolve(here, 'index.html')).href;
const details = await readFile(resolve(here, 'details.html'), 'utf8');
const widths = [320, 375, 760, 761, 1120, 1440];
const checks = new Set();
const consoleErrors = [];
const remoteRequests = [];
const settleAssets = page => page.evaluate(async () => {
  await document.fonts.ready;
  await Promise.all([...document.images].map(image => image.decode()));
});

for (const binding of registry.source_bindings) {
  const bytes = await readFile(resolve(root, binding.path));
  const input = binding.mode === 'text-lf' ? Buffer.from(lf(bytes.toString('utf8'))) : bytes;
  expect(hash(input) === binding.sha256, `Source hash changed: ${binding.id}`);
}
for (const asset of registry.assets) expect(hash(await readFile(resolve(here, asset.file))) === asset.sha256, `Asset hash changed: ${asset.id}`);
checks.add('retained_source_hashes');

for (const [file, expected] of Object.entries(manifest.outputs)) {
  expect(hash(Buffer.from(lf(await readFile(resolve(here, file), 'utf8')))) === expected, `Generated output hash changed: ${file}`);
}
for (const [file, expected] of Object.entries(manifest.local_sources)) {
  expect(hash(Buffer.from(lf(await readFile(resolve(here, file), 'utf8')))) === expected, `Authored source hash changed: ${file}`);
}
expect(hash(Buffer.from(lf(await readFile(resolve(root, 'design/tokens/candidates/quiet-material-homepage.json'), 'utf8')))) === manifest.candidate_token, 'Candidate token hash changed.');
checks.add('output_integrity');
const executionRecord = brief.sections.find(section => section.id === 'execution-record');
expect(executionRecord?.design_gate === 'Outline only until successful own-transaction retrieval. Do not render invented product fields or a fictional dashboard.', 'Execution-record design gate is missing or changed.');
expect(registry.excluded_sections.length === 1 && registry.excluded_sections[0].id === 'execution-record', 'Execution-record exclusion is missing.');
checks.add('execution_gate_contract');

const toRgb = hex => hex.slice(1).match(/../g).map(value => Number.parseInt(value, 16) / 255);
const luminance = hex => {
  const [r,g,b] = toRgb(hex).map(value => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (foreground, background) => {
  const values = [luminance(foreground), luminance(background)].sort((a,b) => b-a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
const palette = pageTokens.palette;
expect(contrast(palette['--ink'], palette['--canvas']) >= 4.5, 'Primary light contrast fell below 4.5:1.');
expect(contrast(palette['--ink-secondary'], palette['--canvas']) >= 4.5, 'Secondary light contrast fell below 4.5:1.');
expect(contrast(palette['--canvas'], palette['--ink']) >= 4.5, 'Primary action contrast fell below 4.5:1.');
expect(contrast(palette['--ink'], palette['--surface']) >= 4.5, 'Light action contrast fell below 4.5:1.');
const duskToken = pageTokens.layout.retained_css_variables['--atmosphere-dusk'];
expect(/^linear-gradient\(/.test(duskToken), 'Retained Dusk token is not a linear gradient.');
const duskStops = [...duskToken.matchAll(/#[0-9a-f]{6}/gi)].map(match => match[0].toLowerCase());
expect(duskStops.length === 4 && new Set(duskStops).size === 4, 'Retained Dusk token must contain four distinct colour stops.');
for (const stop of duskStops) {
  expect(contrast(palette['--ink-inverse'], stop) >= 4.5, `Dusk heading contrast fell below 4.5:1 on ${stop}.`);
  expect(contrast(palette['--ink-inverse-secondary'], stop) >= 4.5, `Dusk body contrast fell below 4.5:1 on ${stop}.`);
}
checks.add('contrast');

const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true });
try {
  const context = await browser.newContext({ viewport: {width: widths[0], height: 900}, reducedMotion: 'reduce' });
  await context.route(/^https?:\/\//, route => route.abort());
  const page = await context.newPage();
  page.on('request', request => { if (/^https?:\/\//i.test(request.url())) remoteRequests.push(request.url()); });
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => consoleErrors.push(error.message));

  for (const width of widths) {
    await page.setViewportSize({width, height: 900});
    await page.goto(indexUrl, {waitUntil: 'load'});
    await page.evaluate(() => document.fonts.ready);
    const state = await page.evaluate(async currentWidth => {
      const visible = element => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden' && element.getClientRects().length > 0;
      };
      const images = [...document.images];
      await Promise.all(images.map(image => image.decode()));
      const bounds = [...document.body.querySelectorAll('*')]
        .filter(element => visible(element) && !element.classList.contains('skip-link'))
        .map(element => ({tag: element.tagName, cls: element.className?.baseVal ?? element.className ?? '', ...(() => { const r = element.getBoundingClientRect(); return {left:r.left,right:r.right}; })()}))
        .filter(item => item.left < -0.6 || item.right > currentWidth + 0.6);
      const access = document.querySelector('.access-picture img');
      const desktop = currentWidth > 760;
      const intrinsicWidth = desktop ? 1080 : 320;
      const sourceMinLabel = desktop ? 28 : 20;
      return {
        scrollWidth: document.documentElement.scrollWidth,
        images: images.map(image => ({src:image.getAttribute('src'),complete:image.complete,naturalWidth:image.naturalWidth})),
        fonts: {
          instrument: document.fonts.check('16px "Instrument Sans"'),
          plex: document.fonts.check('13px "IBM Plex Mono"')
        },
        bounds,
        sections: [...document.querySelectorAll('main > section[data-section]')].map(section => section.dataset.section),
        resultRows: document.querySelectorAll('.result-panel dl > div').length,
        taskRows: document.querySelectorAll('.task-row').length,
        taskImages: document.querySelectorAll('.breadth img').length,
        taskArrows: document.querySelectorAll('.breadth .task-arrow').length,
        cards: document.querySelectorAll('.card').length,
        heroFields: document.querySelectorAll('.hero-visual').length,
        fixtureLabel: document.querySelector('.result-panel .fixture-label')?.textContent.trim(),
        blockedText: /execution record|completed|receipt|timer|live badge/i.test(document.querySelector('main').innerText),
        diagramLabelPx: access.clientWidth / intrinsicWidth * sourceMinLabel,
        diagramWidth: access.clientWidth,
        accessSource: decodeURIComponent(new URL(access.currentSrc).pathname),
        menuVisible: getComputedStyle(document.querySelector('.menu-trigger')).display !== 'none'
        ,duskBackground: getComputedStyle(document.querySelector('.begin')).backgroundImage
      };
    }, width);
    expect(state.scrollWidth <= width, `${width}px layout overflows horizontally (${state.scrollWidth}px).`);
    expect(state.bounds.length === 0, `${width}px has out-of-bounds elements: ${JSON.stringify(state.bounds.slice(0, 4))}`);
    expect(state.images.every(image => image.complete && image.naturalWidth > 0), `${width}px has an undecoded image.`);
    expect(state.fonts.instrument && state.fonts.plex, `${width}px did not load both bundled fonts.`);
    expect(JSON.stringify(state.sections) === JSON.stringify(registry.sections), `${width}px section order changed.`);
    expect(state.resultRows === 3 && state.fixtureLabel === 'Illustrative example', `${width}px illustrative result contract changed.`);
    expect(state.taskRows === 3 && state.taskImages === 0 && state.taskArrows === 3, `${width}px breadth list density changed.`);
    expect(state.cards === 0 && state.heroFields === 1 && !state.blockedText, `${width}px introduced a prohibited card, field or claim.`);
    expect(state.diagramLabelPx >= 18, `${width}px diagram labels render below 18px (${state.diagramLabelPx.toFixed(2)}px).`);
    if (width === 761) expect(state.diagramWidth >= 697, `Desktop access SVG is narrower than 697px at the breakpoint (${state.diagramWidth}px).`);
    const expectedAccessSource = width <= 760 ? 'shared-access-narrow-light.svg' : 'shared-access-desktop-light.svg';
    expect(state.accessSource.endsWith(expectedAccessSource), `${width}px loaded the wrong access SVG: ${state.accessSource}`);
    expect(state.menuVisible === (width <= 760), `${width}px navigation breakpoint changed.`);
    expect(state.duskBackground.startsWith('linear-gradient('), `${width}px did not render the retained Dusk gradient.`);
    for (const stop of duskStops) {
      const [r,g,b] = toRgb(stop).map(value => Math.round(value * 255));
      expect(state.duskBackground.includes(`rgb(${r}, ${g}, ${b})`), `${width}px rendered Dusk is missing ${stop}.`);
    }
  }
  checks.add('responsive_bounds');
  checks.add('breakpoint_switch');
  checks.add('image_decode');
  checks.add('bundled_fonts');
  checks.add('density_limits');
  checks.add('execution_record_absent');
  checks.add('access_label_size');
  checks.add('picture_sources');

  await page.setViewportSize({width: 375, height: 812});
  await page.goto(indexUrl, {waitUntil: 'load'});
  const trigger = page.locator('.menu-trigger');
  await trigger.focus();
  await trigger.press('Enter');
  expect(await trigger.getAttribute('aria-expanded') === 'true', 'Enter did not open the mobile menu.');
  await page.locator('#mobile-menu a').first().focus();
  await page.keyboard.press('Escape');
  expect(await trigger.getAttribute('aria-expanded') === 'false', 'Escape did not close the mobile menu.');
  expect(await trigger.evaluate(element => document.activeElement === element), 'Escape did not restore focus to the menu trigger.');
  await trigger.press(' ');
  expect(await trigger.getAttribute('aria-expanded') === 'true', 'Space did not open the mobile menu.');
  await page.mouse.click(10, 500);
  expect(await trigger.getAttribute('aria-expanded') === 'false', 'Outside click did not close the mobile menu.');
  await trigger.press('Enter');
  await page.locator('.hero-copy .action.primary').focus();
  expect(await trigger.getAttribute('aria-expanded') === 'false', 'Focus leaving the disclosure did not close the mobile menu.');
  checks.add('mobile_disclosure_keyboard');
  checks.add('disclosure_dismissal');

  const hrefs = await page.locator('a[href]').evaluateAll(links => links.map(link => link.getAttribute('href')));
  const detailIds = new Set([...details.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]));
  for (const href of hrefs) {
    expect(!/^(?:https?:|\/\/)/i.test(href), `External study link is not allowed: ${href}`);
    if (href.startsWith('#')) expect(await page.locator(href).count() === 1, `Missing local anchor target: ${href}`);
    if (href.startsWith('details.html#')) expect(detailIds.has(decodeURIComponent(href.split('#')[1])), `Missing details target: ${href}`);
  }
  for (const destination of brief.destinations.filter(item => item.id !== 'catalogue')) expect(detailIds.has(destination.id), `Missing canonical destination detail: ${destination.id}`);
  checks.add('local_link_targets');

  expect(remoteRequests.length === 0, `Remote requests were attempted: ${remoteRequests.join(' | ')}`);
  checks.add('zero_remote_requests');
  expect(consoleErrors.length === 0, `Browser errors: ${consoleErrors.join(' | ')}`);
  checks.add('browser_console_clean');
  await mkdir(resolve(here, 'output'), {recursive: true});
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto(indexUrl, {waitUntil: 'load'});
  await settleAssets(page);
  await page.screenshot({path:resolve(here, 'output/homepage-desktop.png'),fullPage:true,animations:'disabled'});
  await page.setViewportSize({width: 375, height: 812});
  await page.goto(indexUrl, {waitUntil: 'load'});
  await settleAssets(page);
  await page.screenshot({path:resolve(here, 'output/homepage-mobile.png'),fullPage:true,animations:'disabled'});
  checks.add('screenshot_exports');
} finally {
  await browser.close();
}

const inputs = {
  sources: manifest.sources,
  candidate_token: manifest.candidate_token,
  local_sources: manifest.local_sources,
  assets: manifest.assets,
  generated_outputs: manifest.outputs
};
const screenshots = {
  'output/homepage-desktop.png': hash(await readFile(resolve(here, 'output/homepage-desktop.png'))),
  'output/homepage-mobile.png': hash(await readFile(resolve(here, 'output/homepage-mobile.png')))
};
const requiredChecks = ['retained_source_hashes','output_integrity','execution_gate_contract','responsive_bounds','breakpoint_switch','image_decode','bundled_fonts','contrast','density_limits','execution_record_absent','access_label_size','picture_sources','mobile_disclosure_keyboard','disclosure_dismissal','local_link_targets','zero_remote_requests','browser_console_clean','screenshot_exports'];
const checkResults = Object.fromEntries(requiredChecks.map(key => [key, checks.has(key)]));
expect(Object.values(checkResults).every(Boolean), 'Verifier did not complete every required check.');
const verification = {
  schema_version: 1,
  status: 'passed',
  verified_at: new Date().toISOString(),
  browser: 'installed Chrome via Playwright',
  widths,
  manifest_sha256: hash(manifestBytes),
  inputs,
  screenshots,
  checks: checkResults,
  limits: ['Bounded Chromium evidence only; no cross-browser or screen-reader qualification.', 'No production route, network request, publication or token adoption is established.']
};
await writeFile(resolve(here, 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`, 'utf8');
console.log(`Homepage verification passed at ${widths.join(', ')}px.`);
