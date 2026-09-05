import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {here,json,inputHashes,digest} from './build.mjs';
const pwPath=process.argv[2];
const pw=await import(pwPath?pathToFileURL(resolve(pwPath)).href:'playwright');
const browser=await pw.chromium.launch({headless:true,channel:'chrome'});
const r=json('registry.json'),t=json('../../../tokens/candidates/quiet-material-controls.json');
const checks={},layoutErrors=[],consoleErrors=[];
try {
  const page=await browser.newPage({viewport:{width:1120,height:900},deviceScaleFactor:1});
  page.on('pageerror',e=>consoleErrors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  await page.route('http**://**',route=>route.abort());
  await page.goto(pathToFileURL(resolve(here,'index.html')).href);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.sheet').count(),6);
  const trigger=page.locator('#tools-trigger'),panel=page.locator('#tools-panel');
  await trigger.focus();await page.keyboard.press('Enter');assert(await panel.isVisible());await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Browse tools');await page.keyboard.press('Escape');assert(await panel.isHidden());assert(await trigger.evaluate(e=>e===document.activeElement));checks.desktop_keyboard=true;
  await trigger.click();await page.locator('#navigation h1').click();assert(await panel.isHidden());checks.outside_close=true;
  await trigger.click();await page.locator('.desktop-action a').first().focus();assert(await panel.isHidden());checks.focus_leaves_close=true;
  await trigger.focus();await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Use cases');checks.hidden_links_unfocusable=true;
  await trigger.focus();await page.keyboard.press('Tab');const focus=await page.locator(':focus').evaluate(e=>({visible:e.matches(':focus-visible'),width:getComputedStyle(e).outlineWidth,style:getComputedStyle(e).outlineStyle}));assert(focus.visible&&parseFloat(focus.width)>=3&&focus.style==='solid');checks.focus_visible=true;
  const mobile=page.locator('#mobile-trigger');await mobile.focus();await page.keyboard.press('Space');assert(await page.locator('#mobile-panel').isVisible());await page.keyboard.press('Tab');assert.equal(await page.locator(':focus').textContent(),'Tools');await page.keyboard.press('Escape');assert(await page.locator('#mobile-panel').isHidden());assert(await mobile.evaluate(e=>e===document.activeElement));checks.mobile_keyboard=true;
  const run=page.locator('#run-example');await run.click();assert.equal(await run.getAttribute('aria-busy'),'true');assert.equal(await run.getAttribute('aria-disabled'),'true');await run.dispatchEvent('click');assert.equal(await run.textContent(),'Load example');await page.waitForFunction(()=>document.querySelector('#example-feedback').textContent==='Example loaded. No tool was called.');assert.equal(await run.getAttribute('aria-disabled'),null);checks.loading_guard=true;
  await page.locator('#retry-example').click();assert.equal(await page.locator('#retry-feedback').textContent(),'Retry example complete. No request was sent.');checks.retry_announcement=true;
  assert.equal(await page.locator('a a,a button,button a,button button').count(),0);checks.no_nested_targets=true;
  for(const card of await page.locator('[data-pattern=marketing]').all()){assert.equal(await card.locator('h2').count(),r.cards.marketing.headings);assert(await card.locator('p').count()<=r.cards.marketing.paragraphs_max);assert(await card.locator('a,button').count()<=r.cards.marketing.primary_actions_max);}
  const discovery=page.locator('[data-pattern=discovery]');assert.equal(await discovery.evaluate(e=>e.tagName),'A');assert.equal(await discovery.locator('h3').count(),r.cards.discovery.headings);assert(await discovery.locator('p').count()<=r.cards.discovery.paragraphs_max);assert(await discovery.locator('.meta').count()<=r.cards.discovery.metadata_rows_max);assert.equal(await discovery.locator('a,button').count(),0);
  const result=page.locator('[data-pattern=result]');assert.equal(await result.evaluate(e=>e.tagName),'ARTICLE');assert.equal(await result.locator('dl > div').count(),r.cards.result.fixture_rows);assert.equal(await result.locator('a').count(),1);assert.equal(await result.locator('.card').count(),0);checks.card_contract=true;
  await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await run.evaluate(e=>getComputedStyle(e).transitionDuration),'0s');checks.reduced_motion=true;await page.emulateMedia({reducedMotion:'no-preference'});
  for(const width of t.layout.verification_widths) {
    await page.setViewportSize({width,height:900});
    const responsive=page.locator('#responsive-trigger');
    if(width<=t.layout.responsive_breakpoint_px){
      for(const [button,panelId] of [[responsive,'responsive-panel'],[mobile,'mobile-panel']]) {
        await button.click();const openPanel=page.locator('#'+panelId);assert(await openPanel.isVisible());
        const metrics=await openPanel.evaluate(e=>({overflow:e.scrollWidth>e.clientWidth,box:e.getBoundingClientRect().toJSON(),targets:[...e.querySelectorAll('a,button')].map(x=>x.getBoundingClientRect().toJSON())}));
        assert(!metrics.overflow&&metrics.box.left>=0&&metrics.box.right<=width);assert(metrics.targets.every(b=>b.height>=44&&b.left>=0&&b.right<=width));
        await page.locator(panelId==='responsive-panel'?'#navigation':'#mobile').screenshot({path:resolve(here,`.preview/open-${panelId}-${width}.png`)});
        await page.keyboard.press('Escape');assert(await openPanel.isHidden());
      }
    }
    const errors=await page.evaluate(()=>{const errors=[];if(document.documentElement.scrollWidth>innerWidth)errors.push('Document overflow');for(const e of document.querySelectorAll('a,button,p,h1,h2,h3,.card,.dark')){if(!e.getClientRects().length)continue;const b=e.getBoundingClientRect();if(b.left<0||b.right>innerWidth+.5)errors.push('Horizontal overflow: '+e.textContent.slice(0,40));if(e.scrollWidth>e.clientWidth+1)errors.push('Content overflow: '+e.textContent.slice(0,40));}return errors;});layoutErrors.push(...errors.map(error=>({width,error})));
    const smallTargets=await page.locator('a,button').evaluateAll(els=>els.filter(e=>e.getClientRects().length&&e.getBoundingClientRect().height<44).map(e=>e.textContent));assert.deepEqual(smallTargets,[]);
    if(width===375||width===1120)for(let i=0;i<6;i++)await page.locator('.sheet').nth(i).screenshot({path:resolve(here,`.preview/screen-${width}-${i+1}.png`)});
  }
  checks.targets_minimum=true;checks.responsive_menu=true;checks.open_state_layout=true;
  // Contrast for the exact solid colour pairs used by text and controls.
  const v=t.layout.css_variables;
  const lum=hex=>{const c=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
  const pairs=[['--ink','--canvas'],['--ink-secondary','--canvas'],['--canvas','--ink'],['--canvas','--hover-ink'],['--canvas','--ink-secondary'],['--ink','--surface'],['--ink','--hover-paper'],['--disabled-ink','--disabled-bg'],['--status-good','--canvas'],['--ink','--status-good-bg'],['--ink','--status-bad-bg']].map(([fg,bg])=>{const a=lum(v[fg]),b=lum(v[bg]),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert(ratio>=4.5,`${fg} / ${bg}: ${ratio}`);return {fg,bg,ratio};});checks.contrast_pairs=true;
  // Measure actual direct-text regions against a text-free rendering of each dark card.
  await page.reload();await page.evaluate(()=>document.fonts.ready);await page.setViewportSize({width:1120,height:900});
  const darkSamples=[];
  for(let i=0;i<await page.locator('.dark').count();i++) {
    const card=page.locator('.dark').nth(i);
    const samples=await card.evaluate(e=>{const origin=e.getBoundingClientRect();return [...e.querySelectorAll('h2,p,.label')].map(n=>{const range=document.createRange();range.selectNodeContents(n);const b=range.getBoundingClientRect();return {text:n.textContent,color:getComputedStyle(n).color,box:[b.x-origin.x,b.y-origin.y,b.right-origin.x,b.bottom-origin.y]};});});
    await card.evaluate(e=>e.querySelectorAll('h2,p,.label').forEach(n=>n.style.color='transparent'));
    const file=`.preview/dark-${i}.png`;await card.screenshot({path:resolve(here,file)});
    darkSamples.push({file,sha256:digest(file),samples});
  }
  // Reset action output before the PDF, then inspect all print body elements against the footer.
  await page.reload();await page.evaluate(()=>document.fonts.ready);await page.setViewportSize({width:1120,height:800});await page.emulateMedia({media:'print'});await page.evaluate(()=>{for(const panel of document.querySelectorAll('.print-open')){panel.hidden=false;document.querySelector(`[aria-controls="${panel.id}"]`).setAttribute('aria-expanded','true');}});
  const printErrors=await page.evaluate(()=>[...document.querySelectorAll('.sheet')].flatMap(sheet=>{const stop=sheet.querySelector('.footer').getBoundingClientRect().top;return [...sheet.querySelector('.body').querySelectorAll('*')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().bottom>stop).map(e=>sheet.id+': '+e.textContent.slice(0,50));}));assert.deepEqual(printErrors,[]);checks.print_bounds=true;
  await page.pdf({path:resolve(here,'output/pdf/navigation-controls.pdf'),printBackground:true,preferCSSPageSize:true,tagged:true,outline:true});
  assert.deepEqual(layoutErrors,[]);assert.deepEqual(consoleErrors,[]);
  const evidence={id:r.id,production_adopted:false,inputs:inputHashes(),outputs:{'index.html':digest('index.html'),'output/pdf/navigation-controls.pdf':digest('output/pdf/navigation-controls.pdf')},runtime:{node:process.version,chromium:browser.version(),playwright:pwPath?JSON.parse(readFileSync(resolve(dirname(pwPath),'package.json'),'utf8')).version:'installed'},widths:t.layout.verification_widths,checks,layout_errors:layoutErrors,console_errors:consoleErrors,contrast_pairs:pairs,dark_samples:darkSamples,limits:r.limits};
  writeFileSync(resolve(here,'.preview/browser-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({ok:true,widths:evidence.widths,checks:Object.keys(checks).length}));
} catch(error) { console.error(error); throw error; } finally {await browser.close();}
