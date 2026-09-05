// Offline document builder. No production writes, network requests or paid calls.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve, sep, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const hash = b => createHash('sha256').update(b).digest('hex');
const json = p => JSON.parse(readFileSync(p, 'utf8'));
const escape = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function inside(root, relative) {
  const path = resolve(root, relative);
  assert(path.startsWith(resolve(root) + sep), `Path outside source root: ${relative}`);
  return path;
}
function verifiedFile(root, relative, expected) {
  const p = inside(root, relative), bytes = readFileSync(p);
  assert.equal(hash(bytes), expected, `Digest mismatch: ${relative}`);
  return bytes;
}
const uri = (bytes, path) => `data:${({'.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf'})[extname(path)]};base64,${bytes.toString('base64')}`;

export function validate(reg, tokens, source) {
  const ajv = new Ajv2020({allErrors:true});
  const check = ajv.compile(json(resolve(here,'registry.schema.json')));
  assert(check(reg), JSON.stringify(check.errors));
  const audit = json(resolve(repo,'archive/sessions/2026-09-05-quiet-material-system-audit/asset-inventory.json'));
  const originals = audit.atmosphere_assets ?? audit.assets;
  assert.equal(new Set(reg.assets.map(a=>a.id)).size, reg.assets.length, 'Duplicate asset ids');
  assert.deepEqual(reg.assets.map(a=>a.token).sort(), originals.map(a=>a.token).sort(), 'Current asset coverage drift');
  const vars = tokens.layout.css_variables;
  const consumerCss=readFileSync(resolve(here,'catalogue.css'),'utf8');
  assert(!/#[0-9a-f]{3,8}\b|\b\d+(?:\.\d+)?(?:px|rem|em)\b/i.test(consumerCss),'Off-token catalogue colour or dimension');
  for(const match of consumerCss.matchAll(/var\((--[\w-]+)/g))assert(match[1] in vars||match[1] in tokens.layout.catalogue||['--specimen-surface','--specimen-ink','--specimen-secondary','--crop-position'].includes(match[1]),`Unknown catalogue token: ${match[1]}`);
  for (const a of reg.assets) {
    const old = originals.find(x=>x.token===a.token);
    for (const field of ['sha256','source_path','width','height','bytes']) assert.equal(a[field],old[field],`Source drift: ${a.id}/${field}`);
    for (const key of ['token','surface_token','ink_token','secondary_token']) if(a[key]) assert(a[key] in vars,`Unknown token ${a[key]}`);
    assert.equal(Boolean(a.surface_token),Boolean(a.ink_token),'Incomplete material pair');
  }
  assert.deepEqual(reg.gradients.map(g=>g.token).sort(),Object.keys(vars).filter(k=>k.startsWith('--atmosphere-')).sort(),'Gradient coverage drift');
  for (const g of reg.gradients) {
    assert.equal(g.css,vars[g.token],`Gradient drift: ${g.id}`);
    for(const key of ['surface_token','ink_token','secondary_token'])assert(g[key] in vars,`Unknown gradient pair: ${g[key]}`);
  }
  for (const file of reg.fonts) verifiedFile(here,file.file,file.sha256);
  assert(existsSync(inside(repo,reg.claim_source)),'Missing claims authority');
  for (const id of ['QM-01','QM-02','QM-03','QM-04','QM-05','QM-06']) assert(reg.resolutions.some(r=>r.id===id),`Missing resolution ${id}`);
  assert.equal(reg.assets.find(a=>a.id==='pattern-folded-dark-amber').surface_token,null,'Amber cannot acquire an invented card');
  assert.equal(reg.assets.find(a=>a.id==='pattern-folded-dark-mineral').surface_token,'--surface-card-inverse-mineral');
  for(const image of reg.illustrations) assert.equal(image.eligible_for_implementation,false,'Reference artwork cannot silently become usable');
  if(source) {
    for (const file of [...reg.assets,...reg.identity,...reg.illustrations]) verifiedFile(source,file.source_path,file.sha256);
    for (const file of reg.source.documents) verifiedFile(source,file.path,file.sha256);
    const sourceCss=readFileSync(inside(source,'public/strale-site/design-system/assets/design-tokens.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    const sourceVars=Object.fromEntries([...sourceCss.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m=>[m[1],m[2].trim().replace(/\s+/g,' ')]));
    assert.deepEqual(vars,sourceVars,'Retained CSS changed');
  }
  return {ok:true,assets:reg.assets.length,gradients:reg.gradients.length,source_integrity:source?'verified':'not-requested'};
}
function registerMarkdown(reg) {
  let text=`# Quiet Material - current consolidation register\n\nGenerated from registry.json. Status: candidate. Production is not adopted.\n\n${reg.authority}\n\n## Reading this register\n\nSource status records the preserved package. Recipe status records this consolidation proposal. Neither means production approval. Unavailable references and unknown rights remain explicit. The catalogue is a specimen document, not the website.\n\n## Atmospheres\n\n| Asset | Job | Recipe status | Reading surface | Source status |\n|---|---|---|---|---|\n`;
  for(const a of reg.assets) text+=`| ${a.title} | ${a.role} | ${a.recipe_status} | ${a.surface_token??'Image only'} | ${a.source_status} |\n`;
  for(const a of reg.assets) text+=`\n### ${a.title}\n\n${a.guidance}\n\n- File: \`${a.source_path}\`\n- SHA-256: \`${a.sha256}\`\n- Dimensions: ${a.width} x ${a.height}; ${a.bytes} bytes.\n- Crop: ${a.crop.fit}, ${a.crop.position}. ${a.crop.basis}\n- Narrow: ${a.crop.narrow}\n- Square: ${a.crop.square}\n- Provenance: ${a.provenance.creation_history}. Rights: ${a.provenance.rights}.\n- Context verification: ${a.verification.contextual_contrast}. Accessibility: ${a.verification.accessibility}.\n`;
  text+='\n## Gradients\n\n| Gradient | Role | Proposed reading surface | Exact CSS |\n|---|---|---|---|\n';
  for(const g of reg.gradients) text+=`| ${g.id} | ${g.role} | ${g.surface_token} (${g.pair_status}) | \`${g.css}\` |\n`;
  text+=`\nComposition samples: ${reg.specimens.compact_rule}\n`;
  text+='\n## Rules\n';for(const r of reg.rules)text+=`\n- **${r.id}:** ${r.text}\n`;
  text+='\n## Reconciliation record\n';for(const r of reg.resolutions)text+=`\n### ${r.id}: ${r.title} (${r.status})\n\n${r.choice}\n\nStill open: ${r.remaining}\n`;
  text+='\n## Identity and illustration\n';for(const a of [...reg.identity,...reg.illustrations])text+=`\n- **${a.id}** (${a.status}): ${a.role}. ${a.reason??''} Source: \`${a.source_path}\`.\n`;
  text+='\n## Unavailable sources\n';for(const m of reg.missing_sources)text+=`\n- \`${m.path}\`: ${m.status}; excluded from required build inputs.\n`;
  text+='\n## Fonts\n\nThe bundled Instrument Sans and IBM Plex Mono inputs retain their SIL OFL 1.1 licence files. This packages the specimen fonts; email/print fallback and complete glyph coverage are still separate work.\n';
  return text.replace(/[ \t]+$/gm,'');
}
function documentHtml(reg,tokens,source) {
  const values={...tokens.layout.css_variables,...tokens.layout.catalogue};
  const files=new Map();
  for(const a of [...reg.assets,...reg.identity]) {
    const bytes=verifiedFile(source,a.source_path,a.sha256);
    // Large base64 PNG custom properties can exceed Chromium's token limit.
    // Read verified local masters directly; the final PDF embeds them.
    files.set(a.id,extname(a.source_path)==='.png'?pathToFileURL(inside(source,a.source_path)).href:uri(bytes,a.source_path));
  }
  for(const a of reg.assets) values[a.token]=`url("${files.get(a.id)}")`;
  const font=role=>{const f=reg.fonts.find(x=>x.file.includes(role)&&x.role==='font');return uri(verifiedFile(here,f.file,f.sha256),f.file)};
  let styles=readFileSync(resolve(here,'catalogue.css'),'utf8').replace('TOKEN_PAGE_SIZE',`${values['--c-page-width']} ${values['--c-page-height']}`);
  styles+=`\n:root{${Object.entries(values).map(([k,v])=>`${k}:${v}`).join(';')}}\n@font-face{font-family:'Instrument Sans';src:url('${font('Instrument')}');font-weight:400 600;}@font-face{font-family:'IBM Plex Mono';src:url('${font('Plex')}');font-weight:400;}`;
  let pages=[];
  const sheet=(title,intro,body,tag='ATMOSPHERE / SURFACES')=>pages.push(`<section class="sheet"><header class="mast"><img class="logo" src="${files.get('flowing-s-lockup')}" alt="Strale"><span class="eyebrow">${escape(tag)}</span></header><h1>${escape(title)}</h1>${intro?`<p class="intro">${escape(intro)}</p>`:''}<div class="body">${body}</div><footer><span>QUIET MATERIAL / CONSOLIDATION 0.1 / CANDIDATE</span><span>${String(pages.length+1).padStart(2,'0')}</span></footer></section>`);
  sheet('Quiet Material','The existing direction, made easier to use.',`<div class="cover-art" style="background-image:var(--hero-folded-light-background)"></div><div class="notes"><div><h3>Retain</h3><p>The original artwork and gradients.</p></div><div><h3>Reconcile</h3><p>One register for assets and their uses.</p></div><div><h3>Verify</h3><p>Specific combinations, not blanket approval.</p></div></div>`,'STRALE / BRAND SYSTEM');
  const grid=assets=>`<div class="grid">${assets.map(a=>`<div class="tile"><div class="tile-art ${a.family==='Dark'?'dark':''}" style="background-image:var(${a.token})"></div><h3>${escape(a.title)}</h3><p>${escape(a.role)}</p></div>`).join('')}</div>`;
  sheet('The light family','One material language, with different jobs. Colour variation should serve the section.',grid(reg.assets.filter(a=>a.family==='Light')));
  sheet('The dark family','Related light and depth. Mulberry, Amber and Graphite retain more restricted roles.',grid(reg.assets.filter(a=>a.family==='Dark')));
  for(const [start,title] of [[0,'Gradients: expressive frames'],[5,'Gradients: quieter fields']]) {
    const group=reg.gradients.slice(start,start===0?5:9);
    sheet(title,'Exact retained CSS. These are bounded frames and surfaces, not substitutes for the folded images.',`<div class="grid">${group.map(g=>`<div class="tile"><div class="swatch" style="background:var(${g.token})"></div><h3>${escape(g.id.charAt(0).toUpperCase()+g.id.slice(1))}</h3><p>${escape(g.role)}</p></div>`).join('')}</div>`);
  }
  const card=(a,compact=false)=>a.surface_token?`<div class="specimen-card" style="--specimen-surface:var(${a.surface_token});--specimen-ink:var(${a.ink_token});--specimen-secondary:var(${a.secondary_token})"><h2 class="contrast">${escape(reg.specimen_copy.title)}</h2><div class="row"><span class="secondary contrast">${escape(reg.specimen_copy.row1)}</span><span class="contrast">${escape(reg.specimen_copy.value1)}</span></div>${compact?'':`<div class="row"><span class="secondary contrast">${escape(reg.specimen_copy.row2)}</span><span class="contrast">${escape(reg.specimen_copy.value2)}</span></div>`}<p class="disclosure contrast">${escape(reg.specimen_copy.disclosure)}</p></div>`:'';
  for(const start of [0,6]) {
    sheet('Gradients with a reading surface','Proposed pairings using existing tokens. These are design specimens; no product result is implied.',`<div class="grid">${reg.gradients.slice(start,start+6).map(g=>`<div class="tile"><div class="gradient-stage" style="background:var(${g.token})"><div class="specimen-card" style="--specimen-surface:var(${g.surface_token});--specimen-ink:var(${g.ink_token});--specimen-secondary:var(${g.secondary_token})"><h2 class="contrast">${escape(reg.specimen_copy.gradient_title)}</h2><div class="row"><span class="secondary contrast">${escape(reg.specimen_copy.gradient_body)}</span></div></div></div><h3>${escape(g.id)}</h3><p>${escape(g.role)}</p></div>`).join('')}</div>`,'GRADIENT / CONTEXT SPECIMENS');
  }
  for(const a of reg.assets) {
    const specimen=(shape,label)=>`<div><div class="specimen ${shape}" data-asset="${a.id}" data-shape="${shape}" style="background-image:var(${a.token});--crop-position:${a.crop.position}">${card(a,reg.specimens.rows_by_shape[shape]===1)}</div><p class="caption">${label}</p></div>`;
    const size=(w,h)=>`${parseInt(values[w])} x ${parseInt(values[h])}`;
    sheet(a.title,a.guidance,`<div class="specimen-row">${specimen('wide','LANDSCAPE / '+size('--c-wide-width','--c-wide-height'))}${specimen('square','SQUARE / '+size('--c-square-size','--c-square-size'))}${specimen('phone','NARROW / '+size('--c-phone-width','--c-phone-height'))}</div><div class="notes"><div><h3>Purpose</h3><p>${escape(a.role)}</p><p>${escape(a.recipe_status)}</p></div><div><h3>Reading surface</h3><p>${escape(a.surface_token??'None. Atmospheric field only.')}</p></div><div><h3>Crop rule</h3><p>Center / cover comparison. Narrow and square retain one information row and the same type size.</p></div></div>`, 'RETAINED ASSET / CONTEXT SPECIMENS');
  }
  sheet('Identity has a specific job','Keep the flowing-S lockup. A transformation symbol does not become the brand mark.',`<div class="grid two"><div class="tile"><div class="identity-stage"><img src="${files.get('flowing-s-lockup')}" alt="Retained flowing S lockup"></div><h3>Retained identity reference</h3><p>The original lockup, unchanged. Small-size and inverse exports remain to be qualified.</p></div><div class="tile"><div class="identity-stage legacy"><img src="${files.get('legacy-compass')}" alt="Legacy compass favicon"></div><h3>Legacy identity conflict</h3><p>Comparison only. Exclude this favicon from new brand exports; keep functional glyphs separately named.</p></div></div>`,'IDENTITY / RECONCILIATION');
  sheet('Use fewer layers, deliberately','The plain canvas is part of Quiet Material.',reg.rules.slice(0,4).map(r=>`<div class="rule"><h3>${escape(r.id.toUpperCase())}</h3><p>${escape(r.text)}</p></div>`).join(''),'COMPOSITION / RULES');
  sheet('What this release establishes','A complete register for the current atmosphere set, with the remaining work visible.',`<div class="grid two">${reg.resolutions.map(r=>`<div class="rule"><h3>${escape(r.id+' / '+r.title)}</h3><p>${escape(r.remaining)}</p></div>`).join('')}</div>`,'COVERAGE / OPEN ITEMS');
  return {html:`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Strale - Quiet Material catalogue</title><style>${styles}</style></head><body>${pages.join('')}</body></html>`,pageCount:pages.length};
}
export async function main(args=process.argv.slice(2)) {
  const arg=(key)=>{const i=args.indexOf(key);return i===-1?null:args[i+1]};
  const source=arg('--source');
  const reg=json(resolve(here,'registry.json')), tokens=json(inside(repo,reg.token_source));
  const result=validate(reg,tokens,source);
  const markdown=registerMarkdown(reg), human=resolve(here,'REGISTER.md');
  if(args.includes('--check')) {
    assert.equal(readFileSync(human,'utf8'),markdown,'REGISTER.md drift');
    const evidence=json(resolve(here,'verification.json'));
    assert.equal(evidence.ok,true,'Specimen verification failed');
    assert.equal(evidence.registry_sha256,hash(readFileSync(resolve(here,'registry.json'))),'Stale specimen registry');
    assert.equal(evidence.tokens_sha256,hash(readFileSync(inside(repo,reg.token_source))),'Stale specimen tokens');
    for(const [file,digest] of Object.entries(evidence.builder_inputs))verifiedFile(here,file,digest);
    verifiedFile(here,'output/pdf/quiet-material-catalogue.pdf',evidence.pdf_sha256);
    console.log(JSON.stringify(result));return;
  }
  writeFileSync(human,markdown);
  if(args.includes('--register-only')) {console.log(JSON.stringify(result));return;}
  assert(source,'--source <verified extracted archive root> is required for rendering');
  const preview=resolve(here,'.preview');mkdirSync(preview,{recursive:true});
  const output=resolve(here,'output/pdf/quiet-material-catalogue.pdf');mkdirSync(dirname(output),{recursive:true});
  const doc=documentHtml(reg,tokens,source);writeFileSync(resolve(preview,'catalogue.html'),doc.html);
  const renderInputs={registry_sha256:hash(readFileSync(resolve(here,'registry.json'))),tokens_sha256:hash(readFileSync(inside(repo,reg.token_source))),builder_inputs:Object.fromEntries(['build.mjs','catalogue.css','registry.schema.json','verify.py'].map(name=>[name,hash(readFileSync(resolve(here,name)))]))};
  const pw=await import(arg('--playwright')?pathToFileURL(resolve(arg('--playwright'))).href:'playwright');
  const browser=await pw.chromium.launch({headless:true,channel:'chrome'});
  try {
    const page=await browser.newPage({viewport:{width:parseInt(tokens.layout.catalogue['--c-page-width']),height:parseInt(tokens.layout.catalogue['--c-page-height'])},deviceScaleFactor:1});
    await page.route('http**://**',route=>route.abort());
    await page.goto(pathToFileURL(resolve(preview,'catalogue.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    const errors=await page.evaluate(()=>[...document.querySelectorAll('img')].filter(x=>!x.complete||!x.naturalWidth).map(x=>x.alt));
    assert.deepEqual(errors,[],'Broken embedded image');
    const missingBackgrounds=await page.evaluate(async()=>{
      const failed=[];
      const urls=new Set();
      for(const e of document.querySelectorAll('[style*="background-image"]')) {
        const bg=getComputedStyle(e).backgroundImage;
        if(bg==='none'){failed.push(e.getAttribute('style'));continue;}
        const match=bg.match(/^url\(["']?(.*?)["']?\)$/);if(match)urls.add(match[1]);
      }
      for(const url of urls) {
        const im=new Image();im.src=url;
        try{await im.decode();if(!im.naturalWidth)failed.push(url);}catch{failed.push(url);}
      }
      return failed;
    });
    assert.deepEqual(missingBackgrounds,[],'Missing CSS background image');
    const overflow=await page.evaluate(()=>[...document.querySelectorAll('.sheet h1,.sheet p,.sheet h2,.sheet h3,.specimen-card')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent));
    assert.deepEqual(overflow,[],'Text overflow');
    const collisions=await page.evaluate(()=>[...document.querySelectorAll('.sheet')].filter(e=>e.querySelector('.body').getBoundingClientRect().bottom>e.querySelector('footer').getBoundingClientRect().top).map(e=>e.querySelector('h1').textContent));
    assert.deepEqual(collisions,[],'Body collides with footer');
    await page.pdf({path:output,printBackground:true,preferCSSPageSize:true,tagged:true});
    const samples=[];
    for(let i=0;i<doc.pageCount;i++) {
      const sheet=page.locator('.sheet').nth(i);
      await sheet.screenshot({path:resolve(preview,`page-${String(i+1).padStart(2,'0')}.png`)});
      const boxes=await sheet.locator('.contrast').evaluateAll(els=>els.map(e=>{const s=e.closest('.sheet').getBoundingClientRect(),r=e.getBoundingClientRect();return {text:e.textContent,color:getComputedStyle(e).color,x:r.x-s.x,y:r.y-s.y,width:r.width,height:r.height}}));
      if(boxes.length) {
        await sheet.locator('.contrast').evaluateAll(els=>els.forEach(e=>e.style.visibility='hidden'));
        const file=`background-${String(i+1).padStart(2,'0')}.png`;
        await sheet.screenshot({path:resolve(preview,file)});
        await sheet.locator('.contrast').evaluateAll(els=>els.forEach(e=>e.style.visibility=''));
        samples.push({page:i+1,file,boxes});
      }
    }
    writeFileSync(resolve(preview,'contrast-samples.json'),JSON.stringify(samples,null,2));
    writeFileSync(resolve(preview,'render-inputs.json'),JSON.stringify({...renderInputs,pdf_sha256:hash(readFileSync(output)),sample_inputs:Object.fromEntries(['contrast-samples.json',...samples.map(s=>s.file)].map(file=>[file,hash(readFileSync(resolve(preview,file)))]))},null,2));
    console.log(JSON.stringify({...result,pages:doc.pageCount,pdf:output,pdf_sha256:hash(readFileSync(output)),registry_sha256:hash(readFileSync(resolve(here,'registry.json'))),tokens_sha256:hash(readFileSync(inside(repo,reg.token_source)))}));
  } finally {await browser.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
