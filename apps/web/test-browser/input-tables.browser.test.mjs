import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

test('input descriptions remain readable and keyboard-scrollable on mobile', async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    await page.route('https://fixture.invalid/**', async route => {
      const path = new URL(route.request().url()).pathname;
      try {
        const body = await readFile(resolve('dist', `.${path}${path.startsWith('/tools/') ? '.html' : ''}`));
        await route.fulfill({ body, contentType: path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'text/javascript' : path.endsWith('.ttf') ? 'font/ttf' : 'text/html' });
      } catch { await route.fulfill({ status: 404, body: '' }); }
    });
    for (const slug of ['belgian-company-data', 'sec-edgar-filings', 'vat-validate', 'dns-lookup', 'eori-validate', 'aml-risk-score']) {
      await page.goto(`https://fixture.invalid/tools/${slug}`);
      await page.evaluate(() => document.fonts.ready);
      const wrapper = page.getByRole('region', { name: 'Input fields table', exact: true });
      await wrapper.waitFor();
      const dimensions = await wrapper.evaluate(el => ({
        available: el.clientWidth, scroll: el.scrollWidth,
        descriptions: [...el.querySelectorAll('tbody td:last-child')].map(cell => ({
          width: cell.clientWidth, height: cell.clientHeight,
          fontSize: parseFloat(getComputedStyle(cell).fontSize),
        })),
      }));
      for (const cell of dimensions.descriptions) {
        assert.ok(cell.width >= 200, `${slug}: description column must fit words, not individual letters`);
        assert.ok(cell.height < 400, `${slug}: input row must not become a page-long column`);
        assert.ok(cell.fontSize >= 14, `${slug}: retain the existing compact table type`);
      }
      assert.ok(dimensions.scroll > dimensions.available, `${slug}: table should scroll within its wrapper`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0, slug);
      await wrapper.focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.activeElement?.scrollLeft > 0, null, { timeout: 3000 });
      assert.ok(await wrapper.evaluate(el => el.scrollLeft > 0), `${slug}: keyboard can reach description column`);
    }
  } finally { await browser.close(); }
});
