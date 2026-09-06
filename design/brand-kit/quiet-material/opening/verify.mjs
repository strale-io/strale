import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import YAML from 'yaml';
const here=dirname(fileURLToPath(import.meta.url));
const {chromium}=await import(pathToFileURL(resolve(process.argv[2])).href);
const token=JSON.parse(await readFile(resolve(here,'../../../tokens/candidates/quiet-material-opening.json'),'utf8'));
const copy=YAML.parse((await readFile(resolve(here,'../../../../docs/programs/brand-website/HERO-COPY.md'),'utf8')).split('---')[1]).copy;
const widths=[320,390,token.layout.breakpoint,token.layout.breakpoint+1,1100,1101,1440];
const hash=s=>createHash('sha256').update(s).digest('hex'),assert=(x,m)=>{if(!x)throw Error(m)};
const browser=await chromium.launch({channel:'chrome',headless:true});
const measurements=[],screenshots={},errors=[],remote=[];
await mkdir(resolve(here,'output'),{recursive:true});
try{
 const page=await browser.newPage({reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.route(/^https?:/,r=>{remote.push(r.request().url());return r.abort()});
 for(const width of widths){
  await page.setViewportSize({width,height:900});
  await page.goto(pathToFileURL(resolve(here,'../hero-comparison/refined.html')).href);
  await page.evaluate(()=>document.fonts.ready);
  const reference=await page.locator('.stage').boundingBox();
  await page.goto(pathToFileURL(resolve(here,'index.html')).href);
  await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(i=>i.decode()))});
  const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,main:document.querySelectorAll('main').length,h1:document.querySelectorAll('h1').length,jobs:document.querySelectorAll('.job').length,fonts:document.fonts.check('16px "Instrument Sans"'),stage:document.querySelector('.stage').getBoundingClientRect().toJSON(),overflow:[...document.querySelectorAll('.job,.vignette,.job-link')].filter(x=>x.getBoundingClientRect().right>innerWidth+.5||x.getBoundingClientRect().left<-.5).length,jobBodies:[...document.querySelectorAll('.job>p')].map(x=>x.innerText),labels:[...document.querySelectorAll('.vignette')].every(x=>x.getAttribute('aria-label')?.length>20)}));
  assert(state.scrollWidth===width&&state.overflow===0,`Overflow at ${width}`);
  assert(state.main===1&&state.h1===1&&state.jobs===3&&state.fonts&&state.labels,`Structure/assets at ${width}`);
  const renderedCopy=await page.evaluate(()=>[document.querySelector('.eyebrow').textContent,document.querySelector('h1').textContent,document.querySelector('.lead').textContent,document.querySelector('.actions .primary').firstChild.textContent.trim(),document.querySelector('.actions .secondary').textContent,document.querySelector('.request p').textContent]);
  assert(JSON.stringify(renderedCopy)===JSON.stringify([copy.eyebrow,copy.headline,copy.supporting,copy.primary_action,copy.secondary_action,copy.example_request]),'Copy source mismatch');
  const innerOverflow=await page.locator('.extracted div,.profile,.check-item').evaluateAll(xs=>xs.filter(x=>x.scrollWidth>x.clientWidth+1).map(x=>x.className));assert(!innerOverflow.length,`Illustration text overflow at ${width}: ${innerOverflow}`);
  assert(Math.abs(reference.width-state.stage.width)<.5&&Math.abs(reference.height-state.stage.height)<.5,`B footprint changed at ${width}`);
  measurements.push(state);
  if(width===1440||width===390){const file=`output/${width===1440?'desktop':'mobile'}.png`;await page.screenshot({path:resolve(here,file),fullPage:true});screenshots[file]=hash(await readFile(resolve(here,file)))}
 }
 for(const id of ['research','extract','validate']){
  await page.goto(pathToFileURL(resolve(here,'index.html')).href);await page.locator(`.job-link[href="${id}.html"]`).click();
  assert(new URL(page.url()).pathname.endsWith(`/${id}.html`),'Detail link failed');
  assert(await page.locator('main h1').count()===1,'Detail missing heading');
  await page.locator('a[href="index.html#tools"]').click();assert(page.url().endsWith('index.html#tools'),'Return link failed');
 }
 await page.goto(pathToFileURL(resolve(here,'index.html')).href);await page.locator('.actions a.primary').click();assert(page.url().endsWith('#tools'),'Hero explore destination failed');
 await page.setViewportSize({width:390,height:900});await page.goto(pathToFileURL(resolve(here,'index.html')).href);
 await page.locator('summary').focus();await page.keyboard.press('Enter');assert(await page.locator('details').evaluate(e=>e.open),'Menu keyboard opening');await page.keyboard.press('Escape');assert(await page.locator('details').evaluate(e=>!e.open),'Menu Escape');
 assert(!errors.length&&!remote.length,JSON.stringify({errors,remote}));
}finally{await browser.close()}
const digest=async p=>hash((await readFile(resolve(here,p),'utf8')).replace(/\r\n/g,'\n'));
await writeFile(resolve(here,'verification.json'),JSON.stringify({status:'passed',manifest_sha256:await digest('manifest.json'),verifier_sha256:await digest('verify.mjs'),widths,checks:{responsive_bounds:true,held_B_dimensions:true,three_labelled_jobs:true,local_detail_and_return_links:true,keyboard_menu:true,no_remote_requests:true,no_browser_errors:true},measurements,screenshots,limits:['Illustrative static design study, not live product responses or production navigation.','Fonts, bounds and interaction checks do not certify full accessibility or all browser families.']},null,2)+'\n');
console.log('Opening and breadth verified across seven widths; details and keyboard menu pass.');
