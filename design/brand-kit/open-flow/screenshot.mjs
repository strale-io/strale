// Render specimen/index.html at desktop 1440 and mobile 390, light and dark, into screenshots/.
// Chrome repeats content past ~16,384px in one capture, so each view is shot in parts: the page with only
// that part's sections shown (navigation stays on top of every part).
// Not part of CI (needs a browser). Usage:
//   node design/brand-kit/open-flow/screenshot.mjs [path/to/node_modules/playwright/index.mjs]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import { here } from './build.mjs';

const pwPath = process.argv[2];
const pw = await import(pwPath ? pathToFileURL(resolve(pwPath)).href : 'playwright');
const browser = await pw.chromium.launch({ headless: true, channel: 'chrome' });
const url = pathToFileURL(resolve(here, 'specimen/index.html')).href;
const out = resolve(here, 'screenshots');
mkdirSync(out, { recursive: true });
const problems = [];
const PARTS = [
  ['1-identity-colour', ['top', 'identity', 'colour']],
  ['2-contrast', ['contrast']],
  ['3-charts-type-space', ['charts', 'type', 'space', 'layout', 'motion']],
  ['4-imagery', ['imagery']],
  ['5-components', ['components']],
  ['6-content-data', ['components-2']],
  ['7-patterns', ['patterns', 'footer']]
];
try {
  for (const [name, width, height] of [['desktop-1440', 1440, 900], ['mobile-390', 390, 844]]) {
    for (const scheme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1, colorScheme: scheme });
      page.on('console', m => { if (m.type() === 'error') problems.push(`${name}/${scheme}: ${m.text()}`); });
      page.on('pageerror', e => problems.push(`${name}/${scheme}: ${e.message}`));
      await page.goto(url, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) problems.push(`${name}/${scheme}: horizontal overflow ${overflow}px`);
      const fonts = await page.evaluate(() => ['Space Grotesk', 'Instrument Sans', 'IBM Plex Mono'].map(f => [f, document.fonts.check(`16px "${f}"`)]));
      for (const [f, ok] of fonts) if (!ok) problems.push(`${name}/${scheme}: font not loaded ${f}`);
      await page.evaluate(() => document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager'; }));
      await page.waitForLoadState('networkidle');
      for (const [part, ids] of PARTS) {
        await page.evaluate(keep => {
          document.querySelectorAll('main > section, main > .doc-header, body > footer').forEach(el => { el.style.display = keep.includes(el.id || el.tagName.toLowerCase()) ? '' : 'none'; });
          window.scrollTo(0, 0);
        }, ids);
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        if (h > 16000) problems.push(`${name}/${scheme}/${part}: part is ${h}px tall; split it further`);
        await page.screenshot({ path: resolve(out, `${name}-${scheme}-${part}.png`), fullPage: true });
      }
      await page.close();
    }
  }
} finally {
  await browser.close();
}
console.log(problems.length ? problems.join('\n') : 'Screenshots written; no console errors, overflow or missing fonts.');
process.exitCode = problems.length ? 1 : 0;
