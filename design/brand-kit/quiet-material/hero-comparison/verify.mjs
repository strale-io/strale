import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const {chromium}=await import(pathToFileURL(resolve(process.argv[2])).href);
const hash=b=>createHash('sha256').update(b).digest('hex');
const expect=(ok,message)=>{if(!ok)throw Error(message);};
const browser=await chromium.launch({channel:'chrome',headless:true});
const widths=[320,390,900,1100,1101,1120,1440], results=[], remote=[],errors=[];
const shots={};
const authoredCSS=await readFile(resolve(here,'style.css'),'utf8');
const a=(await readFile(resolve(here,'control.html'),'utf8')).replace('data-treatment="control"','data-treatment="paired"');
const b=(await readFile(resolve(here,'refined.html'),'utf8')).replace('data-treatment="refined"','data-treatment="paired"');
expect(a===b,'Paired markup differs beyond treatment identity');
try{
 const page=await browser.newPage({reducedMotion:'reduce'});
 await page.route(/^https?:/,route=>{remote.push(route.request().url());return route.abort();});
 page.on('pageerror',error=>errors.push(error.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 for(const width of widths){
  const pair=[];
  for(const mode of ['control','refined']){
   await page.setViewportSize({width,height:900});await page.goto(pathToFileURL(resolve(here,`${mode}.html`)).href);
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});
   const sample=await page.evaluate(authoredCSS=>{
    const box=s=>document.querySelector(s).getBoundingClientRect().toJSON();
    const rgb=s=>s.match(/[\d.]+/g).map(Number);
    const luminance=xs=>xs.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
    const background=el=>{const c=rgb(getComputedStyle(el).backgroundColor);const a=c[3]??1;if(a===1)return c;const below=el.parentElement?background(el.parentElement):[255,255,255];return c.slice(0,3).map((v,i)=>v*a+below[i]*(1-a));};
    const styleViolations=[];
    const inspectRules=rules=>{for(const rule of rules){
     if(rule.cssRules)inspectRules(rule.cssRules);
     if(!rule.selectorText?.includes('data-treatment'))continue;
     for(const selector of rule.selectorText.split(',').map(s=>s.trim())){
      const stage=selector==='[data-treatment="refined"] .stage';
      const panel=selector==='[data-treatment="refined"] .reading-panel'||selector==='.reading-panel';
      if(!stage&&!panel){styleViolations.push(selector);continue;}
      for(const property of Array.from(rule.style))if(!(stage?/^padding(?:-|$)/.test(property):/^background(?:-|$)/.test(property)||property==='--panel-pad'))styleViolations.push(`${selector}: ${property}`);
     }
    }};
    const sheet=new CSSStyleSheet();sheet.replaceSync(authoredCSS);inspectRules(sheet.cssRules);
    const heldStyles=[...document.body.querySelectorAll('*')].map(el=>{const st=getComputedStyle(el);return [el.tagName,el.getAttribute('src'),st.fontFamily,st.fontSize,st.fontWeight,st.lineHeight,st.letterSpacing,st.color];});
    const selectors=['.request-header strong','.example-label','.meta','.request p','.route>span','.route code','.results dt','.results dd','.request-footer'];
    const contrast=document.body.dataset.treatment==='refined'?selectors.map(s=>{const el=document.querySelector(s),fg=luminance(rgb(getComputedStyle(el).color)),bg=luminance(background(el));return {selector:s,ratio:(Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05)}}):[];
    const bounds=[...document.body.querySelectorAll('*')].filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden').map(el=>({tag:el.tagName,class:el.className,rect:el.getBoundingClientRect()})).filter(x=>x.rect.left<-.5||x.rect.right>innerWidth+.5).map(x=>({tag:x.tag,class:x.class}));
    return {styleViolations,heldStyles,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,text:document.body.innerText,stage:box('.stage'),panel:box('.reading-panel'),copy:box('.hero-copy'),header:box('.site-header'),prompt:box('.request p'),route:box('.route'),bounds,contrast,background:getComputedStyle(document.body).backgroundImage,spectrum:getComputedStyle(document.querySelector('.stage')).backgroundImage,fonts:document.fonts.check('16px "Instrument Sans"')&&document.fonts.check('12px "IBM Plex Mono"'),images:[...document.images].every(i=>i.complete&&i.naturalWidth>0)};
   },authoredCSS);
   expect(sample.styleViolations.length===0,`Uncontrolled treatment CSS: ${JSON.stringify(sample.styleViolations)}`);
   sample.heldStyleDigest=hash(JSON.stringify(sample.heldStyles));delete sample.heldStyles;
   expect(sample.scrollWidth<=width&&sample.bounds.length===0,`${mode}/${width} horizontal bounds: ${JSON.stringify(sample.bounds)}`);
   expect(sample.images&&sample.fonts,`${mode}/${width} assets or fonts missing`);
   expect(sample.prompt.bottom<=sample.route.top,`${mode}/${width} request overlaps tool row`);
   expect(/illustrative example/i.test(sample.text)&&!/completed/i.test(sample.text),`${mode}/${width} illustrative qualifier missing`);
   expect(sample.contrast.every(s=>s.ratio>=4.5),`${mode}/${width} refined reading contrast: ${JSON.stringify(sample.contrast)}`);
   sample.mode=mode;pair.push(sample);results.push(sample);
   if(width===390||width===1440){const file=`output/${mode}-${width===390?'mobile':'desktop'}.png`;await mkdir(resolve(here,'output'),{recursive:true});await page.screenshot({path:resolve(here,file),fullPage:true});shots[file]=hash(await readFile(resolve(here,file)));}
  }
  for(const key of ['text','stage','copy','header','background','spectrum','heldStyleDigest'])expect(JSON.stringify(pair[0][key])===JSON.stringify(pair[1][key]),`${width} changed held property ${key}`);
  expect(pair[1].panel.width>pair[0].panel.width,`${width} refined panel did not gain room`);
  for(const sample of pair){expect(sample.background.includes('/assets/hero-folded-light.png'),'Unexpected atmosphere path');sample.background='url(assets/hero-folded-light.png)';}
 }
 await page.setViewportSize({width:390,height:844});await page.goto(pathToFileURL(resolve(here,'refined.html')).href);
 await page.locator('summary').focus();await page.keyboard.press('Enter');expect(await page.locator('details').evaluate(el=>el.open),'Menu keyboard opening failed');await page.keyboard.press('Escape');expect(await page.locator('details').evaluate(el=>!el.open),'Menu Escape failed');
 const links=await page.locator('a').evaluateAll(xs=>xs.map(x=>x.getAttribute('href')));expect(links.every(x=>x==='index.html'||x==='index.html#scope'),'Unexpected product destination');
 await page.goto(pathToFileURL(resolve(here,'index.html')).href);await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()));});expect(await page.locator('#scope').count()===1,'Review destination missing');
 expect(remote.length===0&&errors.length===0,`Browser errors or remote requests: ${JSON.stringify({remote,errors})}`);
}finally{await browser.close();}
const source=async file=>hash((await readFile(resolve(here,file),'utf8')).replace(/\r\n/g,'\n'));
const evidence={status:'passed',widths,manifest_sha256:await source('manifest.json'),verifier_sha256:await source('verify.mjs'),checks:{same_content_and_outer_geometry:true,only_panel_treatment_changes:true,responsive_bounds:true,local_assets_and_fonts:true,refined_reading_text_contrast:true,keyboard_menu:true,local_destinations:true,no_remote_requests:true,no_browser_errors:true},screenshots:shots,measurements:results,limits:['Screenshot-guided reconstruction; mobile is not a recovered original layout.','Contrast checks cover sampled refined-panel text, not raster-overlay copy or every interaction state.','No production or live-product qualification.']};
await writeFile(resolve(here,'verification.json'),JSON.stringify(evidence,null,2)+'\n','utf8');console.log('Hero comparison verified; paired geometry, text, assets and screenshots recorded.');
