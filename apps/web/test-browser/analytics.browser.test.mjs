import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';
const bundle=await build({stdin:{contents:`import {initAnalytics} from './src/scripts/analytics'; import './src/scripts/try-it'; import './src/scripts/signup'; initAnalytics();`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife'});
const html=(preview=false)=>`<!doctype html><html><head>${preview?'':'<meta name="strale-analytics" data-domains="strale.io" data-website-id="test" data-src="https://cloud.umami.is/script.js">'}</head><body>
<a href="/signup">Get an API key</a><form data-try data-api="https://api.strale.io" data-slug="iban-validate"><textarea>{"example":"test"}</textarea><button type="submit">Run</button><span data-try-status></span><pre data-try-output></pre></form>
<div data-signup data-api="https://api.strale.io" data-support="support@example.invalid"><div data-signup-form-view><form data-signup-form><input id="signup-email" value="test@example.invalid"><input id="signup-name" value=""><button type="submit"><span data-spinner></span><span data-label>Get API key</span></button><div data-signup-error hidden><span></span></div></form></div><div data-signup-done hidden tabindex="-1"><span data-signup-key></span><span data-signup-balance></span><div data-signup-withheld hidden><p></p></div><button data-signup-copy><span></span><svg><use></use></svg></button><span data-signup-copy-status></span></div></div><script>${bundle.outputFiles[0].text}</script></body></html>`;
const mockTracker=`const clean=(p)=>window.straleBeforeSend('event',p);window.captured=[clean({url:location.href,referrer:document.referrer})];window.umami={track:(name,data)=>{window.captured.push(clean({url:location.href,referrer:document.referrer,name,data}));return Promise.resolve()}};`;
test('campaign → tool result → signup source; sensitive values never enter analytics',async()=>{
 const browser=await chromium.launch(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{});
 try{const page=await browser.newPage();let registration;
 await page.route('https://strale.io/**',r=>r.fulfill({contentType:'text/html',body:html()}));
 await page.route('https://cloud.umami.is/script.js',r=>r.fulfill({contentType:'text/javascript',body:mockTracker}));
 // Match executeFreeTier's public envelope: the execution status is inside result.
 await page.route('https://api.strale.io/v1/do',r=>r.fulfill({json:{result:{status:'completed',output:{example:'test'}},free_tier:true}}));
 await page.route('https://api.strale.io/v1/auth/register',r=>{registration=r.request().postDataJSON();return r.fulfill({json:{api_key:'test-only-not-a-real-key'}})});
 await page.goto('https://strale.io/tools/iban-validate?utm_source=x&utm_medium=organic_social&utm_campaign=tools_2026_11&utm_content=x-123-p1&token=private-test-token#private-test-fragment');
 await page.waitForFunction(()=>window.umami);
 assert.match(await page.locator('a').getAttribute('href'),/utm_source=x/);
 await page.locator('[data-try] button').click();await page.waitForFunction(()=>window.captured.some(e=>e.name==='tool_run_completed'));
 const first=await page.evaluate(()=>window.captured);assert.equal(first.filter(e=>e.name==='tool_run_started').length,1);
 assert.match(first[0].url,/utm_source=x/);assert.doesNotMatch(JSON.stringify(first),/private-test|example.invalid|not-a-real-key/);
 await page.locator('a').click();await page.waitForFunction(()=>window.umami);
 await page.locator('[data-signup-form] button').click();await page.waitForFunction(()=>window.captured.some(e=>e.name==='signup_completed'));
 assert.equal(registration.src,'x');assert.equal(registration.email,'test@example.invalid');
 const events=await page.evaluate(()=>window.captured);assert.doesNotMatch(JSON.stringify(events),/example.invalid|not-a-real-key|private-test/);
 assert.equal(await page.evaluate(()=>localStorage.length+sessionStorage.length),0);
 }finally{await browser.close()}
});
test('preview sends no analytics and blocked analytics does not break tool or signup',async()=>{
 const browser=await chromium.launch(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{});
 try{for(const preview of [true,false]){
 const page=await browser.newPage();let requests=0;
 await page.route('https://strale.io/**',r=>r.fulfill({contentType:'text/html',body:html(preview)}));
 await page.route('https://cloud.umami.is/**',r=>{requests++;return r.abort()});
 await page.route('https://api.strale.io/v1/do',r=>r.fulfill({json:{result:{status:'completed'},free_tier:true}}));
 await page.route('https://api.strale.io/v1/auth/register',r=>r.fulfill({json:{api_key:'test-only-not-a-real-key'}}));
 await page.goto('https://strale.io/?utm_source=linkedin');
 await page.locator('[data-try] button').click();await page.locator('[data-try-status]').filter({hasText:'Done.'}).waitFor();
 await page.locator('[data-signup-form] button').click();await page.locator('[data-signup-done]').waitFor({state:'visible'});
 assert.equal(requests,preview?0:1);await page.close();
 }}finally{await browser.close()}
});
test('failed, pending, malformed and HTTP-error tool responses are not completed conversions',async()=>{
 const browser=await chromium.launch(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{});
 try{for(const response of [
  {json:{result:{status:'failed'}},status:200},
  {json:{result:{status:'pending'}},status:202},
  {json:{status:'completed'},status:200},
  {json:{result:{status:'completed'}},status:500},
  {body:'not JSON',status:200},
  {json:null,status:200},
 ]){
 const page=await browser.newPage();
 await page.route('https://strale.io/**',r=>r.fulfill({contentType:'text/html',body:html()}));
 await page.route('https://cloud.umami.is/script.js',r=>r.fulfill({contentType:'text/javascript',body:mockTracker}));
 await page.route('https://api.strale.io/v1/do',r=>r.fulfill(response));
 await page.goto('https://strale.io/tools/iban-validate?utm_source=x');await page.waitForFunction(()=>window.umami);
 await page.locator('[data-try] button').click();await page.waitForFunction(()=>window.captured.some(e=>e.name==='tool_run_failed'));
 const events=await page.evaluate(()=>window.captured);
 assert.equal(events.filter(e=>e.name==='tool_run_started').length,1);
 assert.equal(events.filter(e=>e.name==='tool_run_failed').length,1);
 assert.equal(events.filter(e=>e.name==='tool_run_completed').length,0);
 await page.close();
 }}finally{await browser.close()}
});
