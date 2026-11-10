import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const bundle = await build({ stdin: { contents: `import './src/scripts/signup'; import {initAnalytics} from './src/scripts/analytics'; initAnalytics();`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife' });
const html = `<!doctype html><html><body>
<div data-signup data-api="https://api.strale.io" data-support="support@example.invalid" data-signup-tools='[{"slug":"pdf-extract","name":"PDF Data Extraction"},{"slug":"iban-validate","name":"IBAN Validation"}]'>
<div data-signup-form-view><p data-signup-tool-context hidden>After signup, continue with <strong data-signup-tool-name></strong>.</p><form data-signup-form><input id="signup-email" value="test@example.invalid"><input id="signup-name" value=""><button type="submit"><span data-spinner></span><span data-label>Get API key</span></button><div data-signup-error hidden><span></span></div></form></div>
<div data-signup-done hidden tabindex="-1"><span data-signup-key></span><span data-signup-balance></span><div data-signup-withheld hidden><p></p></div><button data-signup-copy><span></span><svg><use></use></svg></button><span data-signup-copy-status></span><div data-signup-continuation hidden><a data-signup-continue href="/tools">Continue</a></div><ol data-signup-general-steps><li>Make your first API call</li></ol></div>
</div><script>${bundle.outputFiles[0].text}</script></body></html>`;
const launch = () => chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});

test('paid and free tools continue to the same tool with tracking, without moving or storing the key', async () => {
  const browser = await launch();
  try {
    for (const [slug, name, source] of [['pdf-extract','PDF Data Extraction','linkedin'], ['iban-validate','IBAN Validation','x']]) {
      const page = await browser.newPage(); let registration; const outbound = [];
      page.on('request', r => outbound.push(r.url()));
      await page.route('https://strale.io/**', r => r.fulfill({ contentType: 'text/html', body: new URL(r.request().url()).pathname === '/signup' ? html : '<h1>Tool call instructions</h1>' }));
      await page.route('https://api.strale.io/v1/auth/register', r => { registration=r.request().postDataJSON(); return r.fulfill({json:{api_key:'fixture-key-not-real', wallet_balance_cents:200}}); });
      await page.goto(`https://strale.io/signup?tool=${slug}&utm_source=${source}&utm_medium=organic_social&utm_campaign=tools_nov_2026&utm_content=${source}-123-p1&token=private-fixture`);
      await page.locator('[data-signup-tool-context]').waitFor({state:'visible'});
      assert.equal(await page.locator('[data-signup-tool-name]').textContent(), name);
      assert.equal(await page.locator('[data-signup-continue]').isVisible(), false);
      await page.locator('[data-signup-form] button').click();
      await page.locator('[data-signup-continue]').waitFor({state:'visible'});
      assert.equal(await page.locator('[data-signup-continue]').textContent(), `Continue with ${name}`);
      assert.equal(await page.locator('[data-signup-general-steps]').isVisible(), false);
      assert.equal(registration.src, source);
      assert.equal('tool' in registration, false);
      assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
      await page.locator('[data-signup-continue]').click();
      await page.locator('h1').waitFor();
      const url=new URL(page.url());
      assert.equal(url.pathname, `/tools/${slug}`); assert.equal(url.hash, '#call-title');
      assert.equal(url.searchParams.get('utm_source'), source);
      assert.doesNotMatch(url.href, /token=|fixture-key|private-fixture|tool=/);
      assert.equal(outbound.some(u => u.includes('/v1/do')), false, 'continuing must not run a call');
      assert.equal(outbound.some(u => u.includes('fixture-key')), false);
      await page.close();
    }
  } finally { await browser.close(); }
});

test('signup errors preserve tool context and never reveal the success action', async () => {
  const browser=await launch();
  try {
    const page=await browser.newPage();
    await page.route('https://strale.io/**',r=>r.fulfill({contentType:'text/html',body:html}));
    await page.route('https://api.strale.io/v1/auth/register',r=>r.fulfill({status:409,json:{}}));
    await page.goto('https://strale.io/signup?tool=pdf-extract');
    await page.locator('[data-signup-form] button').click();
    await page.locator('[data-signup-error]').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-signup-tool-context]').isVisible(),true);
    assert.equal(await page.locator('[data-signup-continue]').isVisible(),false);
    assert.equal(await page.locator('[data-signup-form] button').isEnabled(),true);
  } finally { await browser.close(); }
});

test('missing, unknown and hostile tool selections retain the ordinary signup quickstart',async()=>{
  const browser=await launch();
  try { for (const query of ['', '?tool=retired-tool', '?tool=https://example.invalid', '?tool=pdf-extract&tool=iban-validate']) {
    const page=await browser.newPage();
    await page.route('https://strale.io/**',r=>r.fulfill({contentType:'text/html',body:html}));
    await page.route('https://api.strale.io/v1/auth/register',r=>r.fulfill({json:{api_key:'fixture-key-not-real'}}));
    await page.goto('https://strale.io/signup'+query);
    await page.locator('[data-signup-form] button').click();
    await page.locator('[data-signup-done]').waitFor({state:'visible'});
    assert.equal(await page.locator('[data-signup-general-steps]').isVisible(),true);
    assert.equal(await page.locator('[data-signup-continue]').isVisible(),false);
    await page.close();
  }} finally { await browser.close(); }
});
