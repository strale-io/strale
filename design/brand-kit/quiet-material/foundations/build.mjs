// Offline, deterministic sources; browser evidence is bound to exact generated files.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import Ajv2020 from 'ajv/dist/2020.js';
const here=dirname(fileURLToPath(import.meta.url)), repo=resolve(here,'../../../..');
const read=p=>readFileSync(p,'utf8'), json=p=>JSON.parse(read(p));
export const sha=b=>createHash('sha256').update(b).digest('hex');
const digest=p=>sha(readFileSync(p));
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roleIds=['display','section','heading','lead','body','ui','compact','caption','label','code','number','document'];
const ruleIds=['identity','clearspace','small','inverse','weights','density','numerals','direct-dark','fallback','coverage'];
export const inputFiles=['registry.json','registry.schema.json','catalogue.css','build.mjs','verify.py','evidence.schema.json','masters/strale-lockup.svg','../registry.json','../../../tokens/candidates/quiet-material-catalogue.json'];
const outputs=['output/pdf/identity-typography.pdf','output/pdf/document-specimen.pdf','exports/social-square.png','exports/social-landscape.png','exports/avatar-light.png','exports/avatar-dark.png','exports/favicon-16.png','exports/favicon-32.png','exports/favicon.ico','exports/email-logo.png','exports/email.html'];

export function validate(reg,tokens) {
  const check=new Ajv2020({allErrors:true}).compile(json(resolve(here,'registry.schema.json')));
  assert(check(reg),JSON.stringify(check.errors));
  assert.equal(tokens.name,'Quiet Material identity and typography 0.1');
  assert.equal(tokens.status,'proposed');
  assert.deepEqual(reg.roles.map(r=>r.id),roleIds,'Type coverage drift');
  assert.deepEqual(reg.rules.map(r=>r.id),ruleIds,'Rule coverage drift');
  assert.deepEqual(reg.channels.map(c=>c.id),['web','social','email','pdf']);
  assert.equal(digest(resolve(here,reg.source.file)),reg.source.sha256,'Master changed');
  const old=json(resolve(here,'../registry.json'));
  assert.deepEqual(reg.fonts.map(f=>({...f,file:f.file.replace(/^\.\.\//,'')})),old.fonts,'Font provenance drift');
  for(const f of reg.fonts)assert.equal(digest(resolve(here,f.file)),f.sha256,'Font bytes changed');
  for(const [id,r] of Object.entries(tokens.type.scale)) {
    assert(roleIds.includes(id),'Unknown role');
    assert(['sans','mono'].includes(r.family));
    assert(r.family==='mono'?r.weight===400:[400,500,600].includes(r.weight),'Unavailable weight');
    assert(r.size>0&&r.narrow>0&&r.line>=1.08,'Invalid type dimensions');
    const unit=id==='document'?'pt':'px',v=tokens.layout.css_variables;
    for(const [key,value] of Object.entries({size:r.size+unit,narrow:r.narrow+unit,line:String(r.line),weight:String(r.weight),tracking:r.tracking+'em',measure:r.measure,family:`var(--${r.family})`}))assert.equal(v[`--t-${id}-${key}`],value,'Role/CSS drift');
  }
  assert.deepEqual(Object.keys(tokens.type.scale),roleIds);
  const v=tokens.layout.css_variables, oldTokens=json(resolve(repo,'design/tokens/candidates/quiet-material-catalogue.json')).layout.css_variables;
  for(const key of [...Object.keys(tokens.palette),'--atmosphere-cobalt','--atmosphere-dusk','--atmosphere-midnight'])assert.equal(v[key],oldTokens[key],`Retained colour drift: ${key}`);
  for(const [key,value] of Object.entries(tokens.palette))assert.equal(value,v[key],'Palette/CSS disagreement');
  for(const [key,cssKey] of Object.entries({sans:'--sans',mono:'--mono',email:'--email-sans'}))assert.equal(tokens.type.families[key],v[cssKey],'Font family/CSS disagreement');
  assert.equal(v['--sans'],oldTokens['--sans'],'Retained sans family changed');
  assert.equal(v['--mono'],oldTokens['--mono'],'Retained mono family changed');
  const css=read(resolve(here,'catalogue.css'));
  assert(!/#[0-9a-f]{3,8}\b|\b\d+(?:\.\d+)?(?:px|pt|rem|em)\b/i.test(css),'Off-token CSS');
  for(const m of css.matchAll(/var\((--[\w-]+)/g))assert(m[1] in v,`Unknown token ${m[1]}`);
  assert(css.includes('font-synthesis: none'),'Synthetic font styles enabled');
  return {ok:true,roles:roleIds.length,fonts:2,production_adopted:false};
}

export function validateEvidence(reg,tokens,evidence,manifest) {
  const schema=json(resolve(here,'evidence.schema.json'));
  const ajv=new Ajv2020({allErrors:true});
  for(const [kind,data] of Object.entries({evidence,manifest})) {
    const check=ajv.compile({...schema,$ref:`#/$defs/${kind}`});assert(check(data),JSON.stringify(check.errors));
  }
  assert.deepEqual(evidence.dark_contrast.map(s=>'--atmosphere-'+s.gradient).sort(),reg.direct_dark.gradient_tokens.flatMap(token=>[token,token,token]).sort(),'Contrast gradient coverage drift');
  assert.deepEqual(manifest.source,reg.source,'Manifest source drift');
  assert.deepEqual(manifest.scope,reg.channels,'Manifest scope drift');
  assert.deepEqual(manifest.inputs,evidence.inputs);assert.deepEqual(manifest.outputs,evidence.outputs);
  const expectedInputs=[...inputFiles,reg.token_source,...reg.fonts.map(f=>f.file)].sort();
  assert.deepEqual(Object.keys(evidence.inputs).sort(),expectedInputs,'Incomplete input bindings');
  assert.deepEqual(evidence.email_browser_reflow.map(x=>x.width),tokens.layout.verification_widths,'Incomplete email widths');
  const fonts=reg.fonts.filter(f=>f.role==='font');
  assert.deepEqual(evidence.font_audit.map(f=>[f.family,f.sha256]),fonts.map(f=>[f.family,f.sha256]),'Font audit drift');
  assert.deepEqual(evidence.font_audit[0].axes,{wdth:[75,100,100],wght:[400,400,700]});
  assert.deepEqual(evidence.font_audit[1].axes,{});assert(evidence.font_audit[0].features.includes('tnum'));
  assert.equal(evidence.font_audit[0].checkmark_present,false);assert.equal(evidence.font_audit[1].checkmark_present,true);
  assert.deepEqual(evidence.pdf_text.map(p=>[p.document,p.pages,p.title]),[['identity-typography',13,'Strale identity and typography'],['document-specimen',2,'Strale A4 document typography specimen']]);
  for(const [document,pages] of [['identity-typography',13],['document-specimen',2]]) {
    assert.deepEqual([...new Set(evidence.embedded_fonts.filter(f=>f.document===document).map(f=>f.page))].sort((a,b)=>a-b),Array.from({length:pages},(_,i)=>i+1),'Missing font embedding page');
  }
  for(const limit of ['No physical print proof','No real email-client or dark-mode inbox qualification','No production adoption','Glyph fixtures are not full language coverage'])assert(evidence.limits.includes(limit),'Missing qualification limit');
}

export function identityExports(reg,tokens) {
  const source=read(resolve(here,reg.source.file));
  const groups=[...source.matchAll(/<g transform="[^"]+">[\s\S]*?<\/g>/g)].map(m=>m[0]);
  assert.equal(groups.length,2,'Expected separate mark and outlined name');
  assert.equal((groups[0].match(/<path /g)||[]).length,3,'Unexpected S paths');
  const geo=tokens.layout.identity, [x0,y0,x1,y1]=geo.source_mark_bounds;
  const mark=(height)=>{
    const scale=height/(y1-y0),x=500-(x0+x1)/2*scale,y=500-(y0+y1)/2*scale;
    return `<g transform="translate(${x} ${y}) scale(${scale})">${groups[0]}</g>`;
  };
  const wrap=(title,box,content)=>`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}"><title>${title}</title>${content}</svg>\n`;
  const result={};
  for(const [variant,ink,paper] of [['ink','--ink','--surface'],['inverse','--ink-inverse','--section-canvas-dark']]) {
    const colour=tokens.palette[ink];
    result[`lockup-${variant}.svg`]=source.replace('fill="currentColor"',`fill="${colour}"`);
    result[`mark-${variant}.svg`]=wrap('Strale',geo.mark_viewbox,`<g fill="${colour}">${mark(geo.mark_art_height)}</g>`);
    result[`avatar-${variant}.svg`]=wrap('Strale',geo.avatar_viewbox,`<path fill="${tokens.palette[paper]}" d="M0 0H1000V1000H0Z"/><g fill="${colour}">${mark(1000*geo.avatar_mark_share)}</g>`);
  }
  return result;
}

function human(reg,tokens) {
  return `# Identity and typography companion\n\nCandidate 0.1. Complements the accepted atmosphere/surface catalogue 0.2; does not adopt production tokens.\n\n## Type roles\n\n| Role | Family | Wide / narrow | Weight | Leading | Use |\n|---|---|---|---|---|---|\n${reg.roles.map(({id,job})=>{const r=tokens.type.scale[id];return `| ${id} | ${r.family} | ${r.size} / ${r.narrow} ${id==='document'?'pt':'px'} | ${r.weight} | ${r.line} | ${job} |`;}).join('\n')}\n\n## Rules\n\n${reg.rules.map(r=>`### ${r.id}\n\n${r.text}`).join('\n\n')}\n\n## Channel scope\n\n${reg.channels.map(c=>`- **${c.id}:** ${c.scope}`).join('\n')}\n\n## Provenance\n\nThe outlined master is preserved at \`${reg.source.file}\` (SHA-256 \`${reg.source.sha256}\`). ${reg.source.rights}\n\nFonts are the existing packaged files and OFL licences. Only container/export geometry and solid colour variants are derived here. No font glyphs or logo paths are redrawn. \`exports/manifest.json\` binds each output to these inputs.\n`;
}

function document(reg,tokens) {
  const v=tokens.layout.css_variables;
  const local=p=>pathToFileURL(resolve(here,p)).href;
  const img=(name,cls='')=>`<img class="${cls}" src="${local('exports/'+name+'.svg')}" alt="Strale">`;
  const fonts=`@font-face{font-family:'Instrument Sans';src:url('${local('../fonts/InstrumentSans.ttf')}');font-weight:400 700;}@font-face{font-family:'IBM Plex Mono';src:url('${local('../fonts/IBMPlexMono-Regular.ttf')}');font-weight:400;}`;
  const roles=roleIds.map(id=>`.type-${id}{font-family:var(--t-${id}-family);font-size:var(--t-${id}-size);line-height:var(--t-${id}-line);font-weight:var(--t-${id}-weight);letter-spacing:var(--t-${id}-tracking);max-width:var(--t-${id}-measure);}.narrow .type-${id}{font-size:var(--t-${id}-narrow);}`).join('\n');
  const css=read(resolve(here,'catalogue.css')).replace('PAGE_SIZE',`${v['--f-page-width']} ${v['--f-page-height']}`)+`\n:root{${Object.entries(v).map(([k,val])=>`${k}:${val}`).join(';')}}\n`+fonts+roles;
  const wrap=(body,extra='',title='Strale identity and typography')=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}${extra}</style></head><body>${body}</body></html>`;
  const pages=[];
  const sheet=(title,intro,body,tag)=>pages.push(`<section class="sheet"><header class="mast">${img('lockup-ink')}<span class="micro">CANDIDATE 0.1 / ${tag}</span></header><h1>${title}</h1>${intro?`<p class="intro">${intro}</p>`:''}<div class="body">${body}</div><footer><span>QUIET MATERIAL / IDENTITY AND TYPOGRAPHY</span><span>${String(pages.length+1).padStart(2,'0')}</span></footer></section>`);
  const note=(title,copy)=>`<div class="note"><h2>${title}</h2><p>${copy}</p></div>`;
  const rule=id=>esc(reg.rules.find(r=>r.id===id).text);
  sheet('Identity and typography','A practical extension of the existing Quiet Material direction.',`${img('lockup-ink','cover-lockup')}<p class="cover-statement">The same Strale.<br>In every setting.</p><div class="three note"><div><h2>One identity</h2><p>The existing S and outlined name.</p></div><div><h2>Two families</h2><p>Clear reading and exact technical detail.</p></div><div><h2>Real contexts</h2><p>Web, social, email and A4 examples.</p></div></div>`,'COMPANION');
  sheet('An identity with a clear role','Keep the name visible until the context makes the symbol enough.',`<div class="two"><div><div class="panel identity">${img('lockup-ink')}</div><p class="caption">Ink lockup on a plain light field.</p></div><div><div class="panel identity dark">${img('lockup-inverse')}</div><p class="caption">Off-white lockup on a plain dark field.</p></div></div><div class="two note"><div><h2>Use the whole name</h2><p>Navigation, documents, email and unfamiliar contexts use the horizontal lockup.</p></div><div><h2>Use the S selectively</h2><p>Avatars and browser icons can use the isolated mark. It stays separate from functional icons.</p></div></div>`,'IDENTITY');
  sheet('Small sizes need their own check','These marks are shown at actual CSS sizes in the source specimen; view at 100% for scale.',`<div class="two"><div>${tokens.layout.identity.preview_css_sizes.map(size=>`<div class="scale-line"><img src="${local('exports/mark-ink.svg')}" width="${size}" height="${size}" alt="Strale"><span>${size} px${size===16?' / favicon exception':' / isolated S'}</span></div>`).join('')}<div class="scale-line"><img src="${local('exports/lockup-ink.svg')}" width="${tokens.layout.identity.lockup_min_css_px}" alt="Strale"><span>120 px / minimum lockup width</span></div></div><div class="panel"><h2 class="small-title">Keep the geometry intact.</h2><div class="clearspace">${img('lockup-ink')}</div><p class="type-compact">${rule('clearspace')}</p><div class="scale-line">${img('avatar-ink','avatar')}${img('avatar-inverse','avatar')}</div><p class="caption">Square masters retain safe space for circular crops.</p></div></div>`,'IDENTITY / SCALE');
  sheet('Let the message sit on the dark field','Comparison requested by the founder. Short marketing copy can be lighter without an inner card.',`<div class="two"><div><div class="dark-example" data-direct-dark="cobalt" style="background:var(--atmosphere-cobalt)"><h2 class="contrast">Give your agents more useful tools.</h2><p class="contrast">Start with research, extraction or validation.</p><span class="action contrast">Explore tools</span></div><p class="caption">Cobalt / short message and one light action.</p></div><div><div class="dark-example" data-direct-dark="dusk" style="background:var(--atmosphere-dusk)"><h2 class="contrast">Start with one useful task.</h2><p class="contrast">Find a tool that fits the work.</p><span class="action contrast">Explore tools</span></div><p class="caption">Dusk / the same hierarchy on a quieter dark field.</p></div></div><div class="two note"><div><h2>Direct text for a short story</h2><p>One heading, one optional paragraph and one primary action. This is a new candidate treatment.</p></div><div><h2>Paper for detailed information</h2><p>Keep the accepted light reading panel for results, tables and technical content. Atmospheric images need separate crop checks.</p></div></div>`,'DARK CARD / COMPARISON');
  sheet('Two families. Distinct jobs.','Keep the warmth of the existing sans; use mono only where precision helps.',`<div class="two"><div><p class="family-example">Instrument<br>Sans</p><p class="type-lead">A clear voice for useful work.</p><div class="note"><p class="type-body">Regular 400 for reading and display.<br><span class="medium">Medium 500 for UI and subheads.</span><br><span class="semibold">Semibold 600 for deliberate emphasis.</span></p></div></div><div><p class="family-example mono">IBM Plex<br>Mono</p><p class="type-code">email-validate<br>request_id: example_001<br>0123456789</p><div class="note"><p>Regular 400 only. Code and identifiers keep their own texture without turning every caption into a technical label.</p></div></div></div>${note('Use real weights',rule('weights'))}`,'TYPE / FAMILIES');
  sheet('A register for every text role','A finite set of roles keeps hierarchy predictable. Screen values are CSS px; document body is pt.',`<div class="role-list">${reg.roles.map(({id,job})=>{const r=tokens.type.scale[id];return `<div class="role-row"><h2 class="type-${id} ${id==='number'?'numbers':''}">${id==='number'?'1,234.50':esc(id.charAt(0).toUpperCase()+id.slice(1))}</h2><p><span class="micro">${r.size}/${r.narrow}${id==='document'?' PT':' PX'} · ${r.weight} · ${r.line}</span><br>${esc(job)}</p></div>`;}).join('')}</div>`,'TYPE / ROLES');
  sheet('Read words. Compare values. Inspect code.','The role follows the reader’s task.',`<div class="two"><div class="panel"><h2 class="small-title">Reading and glyphs</h2><p class="glyphs">Å Ä Ö Æ Ø Ü É Ñ ß<br>å ä ö æ ø ü é ñ<br>“Clear words.” € £ $ ¥<br>0123456789</p><p class="caption">English and selected Nordic/Western European fixtures, checked against the exact font files.</p></div><div><h2 class="small-title">Aligned values</h2><table class="numbers"><thead><tr><th>Example</th><th>Value</th></tr></thead><tbody><tr><td>Small</td><td>12.50</td></tr><tr><td>Medium</td><td>987.00</td></tr><tr><td>Large</td><td>1,234.50</td></tr></tbody></table><div class="note"><h2>Exact characters</h2><p class="type-code">0O 1Il | {} [] ()<br>email-validate<br>request_id: example_001</p></div></div></div>${note('A font is not an icon library','Instrument Sans lacks the checkmark glyph in this file. Use a separate accessible icon when needed. Do not depend on accidental font substitution.')}`,'TYPE / GLYPHS');
  const web=(narrow=false)=>`<article class="web ${narrow?'narrow':''}" data-web="${narrow?'narrow':'wide'}"><h2 class="type-display">Give your agents more useful tools.</h2><p class="type-body">Search the web, extract document data and validate inputs through one Strale connection.</p><h3 class="type-heading">Start with a task.</h3><p class="type-body">Choose what your agent needs to do. Then inspect the tool’s inputs and results before adding it to your workflow.</p><p class="type-caption">Typography example. Proposed marketing copy.</p></article>`;
  sheet('Reflow the idea, not just the font size','The narrow layout keeps the same hierarchy and loses no essential information.',`<div class="web-row">${web()}${web(true)}</div>`,'WEB / READING');
  sheet('Give technical detail enough room','Long identifiers and numeric rows need practical rules, not smaller type.',`<div class="web-row"><article class="web"><h2 class="type-heading">A result your agent can use.</h2><p class="type-body">A short description should help the reader understand the output. Detailed schemas belong with the tool documentation.</p><h3 class="type-ui">Example identifier</h3><p class="type-code wrap">request_example_abcdefghijklmnopqrstuvwxyz_0123456789</p><pre class="type-code">{\n  "tool": "email-validate",\n  "example": true\n}</pre><p class="caption">Illustrative content, not a verified API response.</p></article><article class="web narrow"><h2 class="type-heading">A result your agent can use.</h2><h3 class="type-ui">Example identifier</h3><p class="type-code wrap">request_example_abcdefghijklmnopqrstuvwxyz_0123456789</p><pre class="type-code">{ "tool": "email-validate", "example": true }</pre><p class="caption">Code scrolls inside its boundary; prose and identifiers reflow.</p></article></div>${note('Reduce before shrinking',rule('density'))}`,'WEB / DETAIL');
  const social=(wide=false)=>`<div class="social ${wide?'wide':''}" data-export="social-${wide?'landscape':'square'}">${img(wide?'lockup-inverse':'lockup-ink')}<h2>${wide?'Start with one<br>useful task.':'Give your agents<br>more useful tools.'}</h2></div>`;
  sheet('The same voice at a glance','A square and a landscape composition. One thought is enough.',`<div class="social-row"><div><div class="social-shell square">${social()}</div><p class="caption">1080 × 1080 / square composition specimen.</p></div><div><div class="social-shell wide">${social(true)}</div><p class="caption">1200 × 630 / landscape composition specimen.</p>${note('Keep the export simple','These are type and identity proofs, not a complete platform template library. Check platform crops and final copy before publishing.')}</div></div>`,'SOCIAL / TYPE PROOFS');
  const email=(brand=false)=>`<article class="email ${brand?'brand':''}">${img('lockup-ink')}<h2>Start with one useful task.</h2><p>Choose the information your agent needs. Find a suitable tool, read the input requirements, and inspect an example result.</p><p>Keep the first workflow small enough to understand.</p><p class="caption">Email layout specimen. Not a sent message.</p></article>`;
  sheet('Email keeps its shape without a web font','Use the fallback deliberately, rather than treating it as a broken brand experience.',`<div class="two"><div>${email(true)}<p class="caption">Instrument Sans / browser comparison.</p></div><div>${email()}<p class="caption">Arial / the intended email fallback.</p></div></div>${note('Qualify the actual inbox','The exported HTML uses system fonts and inline styles. This browser comparison tests text reflow only; Outlook, Gmail, dark-mode changes and image blocking remain email-client checks.')}`,'EMAIL / FALLBACK');
  const papers=`<article class="paper">${img('lockup-ink')}<h2>A clear record<br>of the work.</h2><p>Clear hierarchy for a document cover and interior page.</p><p class="small">Identity and typography specimen<br>Example content. No product results.</p><footer><span>STRALE / QUIET MATERIAL</span><span>01</span></footer></article><article class="paper">${img('lockup-ink')}<h3>Start with the question.</h3><p>A useful document gives the reader a clear route through the information. State the purpose, show the supporting material, then explain what it means.</p><h3>Let structure do the work.</h3><p>Use short paragraphs for connected ideas. Keep tables for comparisons, and reserve code styling for exact technical content. A new box is not needed for every thought.</p><p>Emphasis should help a reader find the important point. The text remains selectable and the font is embedded in this PDF.</p><h3>Keep evidence readable.</h3><p>Introduce supporting material before asking the reader to interpret it. A clear label explains what a value represents. A short note can distinguish an example from an observed result without crowding the main text.</p><p>When several items share the same structure, use a table. Keep the headings brief and let consistent alignment make the comparison easier. Avoid turning each row into a separate card.</p><table><thead><tr><th>Element</th><th>Purpose</th></tr></thead><tbody><tr><td>Heading</td><td>Introduce the question</td></tr><tr><td>Paragraph</td><td>Develop one connected idea</td></tr><tr><td>Table</td><td>Compare related items</td></tr></tbody></table><p class="small">Example content only. Long-document pagination and physical print proof remain open.</p><footer><span>STRALE / QUIET MATERIAL</span><span>02</span></footer></article>`;
  sheet('A document needs a reading system','An A4 cover and interior page test identity, paragraphs and a simple table.',`<div class="paper-row">${papers.replaceAll('<article class="paper">','<div class="paper-shell"><article class="paper">').replaceAll('</article>','</article></div>')}</div>`,'PDF / EMBEDDED TYPE');
  sheet('Apply the role. Check the context.','The companion is ready for review; channel and component qualification continue from here.',`<div class="rules"><section><h2>Identity</h2><p>${rule('identity')}</p></section><section><h2>Typography</h2><p>${rule('density')}</p></section><section><h2>Dark marketing cards</h2><p>Compare the direct-text candidate with the accepted reading-panel treatment. Choose by content, not by a universal dark/light inversion rule.</p></section><section><h2>Next in the kit</h2><p>Navigation, buttons, cards and their interaction states. Then density patterns, motion and final channel templates.</p></section></div>${note('One source hierarchy','Use the structured register and tokens alongside this document. The original atmosphere catalogue remains the accepted baseline; this companion adds candidates rather than replacing it.')}`,'APPLICATION / NEXT');
  return {html:wrap(pages.join('')),social:wrap(social()+social(true)),email:wrap(email()),papers:wrap(papers,`@page{size:${v['--f-doc-paper-width']} ${v['--f-doc-paper-height']};margin:0;}`,'Strale A4 document typography specimen'),pageCount:pages.length};
}

export async function main(args=process.argv.slice(2)) {
  const reg=json(resolve(here,'registry.json')),tokens=json(resolve(repo,reg.token_source));
  const result=validate(reg,tokens), svgs=identityExports(reg,tokens),md=human(reg,tokens);
  if(args.includes('--check')) {
    assert.equal(read(resolve(here,'REGISTER.md')),md,'Human view drift');
    for(const [name,data] of Object.entries(svgs))assert.equal(read(resolve(here,'exports',name)),data,'Identity export drift');
    const evidence=json(resolve(here,'verification.json'));
    validateEvidence(reg,tokens,evidence,json(resolve(here,'exports/manifest.json')));
    for(const file of [...inputFiles,reg.token_source,...reg.fonts.map(f=>f.file)])assert.equal(evidence.inputs[file],digest(resolve(file===reg.token_source?repo:here,file)),`Stale input ${file}`);
    assert.equal(evidence.ok,true);assert.equal(evidence.pages,13);assert.equal(evidence.document_pages,2);
    assert.deepEqual(Object.keys(evidence.outputs).sort(),[...outputs,...Object.keys(svgs).map(n=>'exports/'+n)].sort(),'Output coverage drift');
    for(const [file,hash] of Object.entries(evidence.outputs))assert.equal(digest(resolve(here,file)),hash,`Output drift ${file}`);
    const manifest=json(resolve(here,'exports/manifest.json'));assert.deepEqual(manifest.outputs,evidence.outputs);assert.deepEqual(manifest.inputs,evidence.inputs);
    assert.equal(evidence.dark_contrast.length,6);assert(evidence.dark_contrast.every(r=>r.ratio>=4.5));
    assert.deepEqual(evidence.layout_errors,[]);assert.deepEqual(evidence.pdf_bounds_errors,[]);
    console.log(JSON.stringify(result));return;
  }
  mkdirSync(resolve(here,'exports'),{recursive:true});mkdirSync(resolve(here,'output/pdf'),{recursive:true});mkdirSync(resolve(here,'.preview'),{recursive:true});
  for(const [name,data] of Object.entries(svgs))writeFileSync(resolve(here,'exports',name),data);
  writeFileSync(resolve(here,'REGISTER.md'),md);
  const doc=document(reg,tokens);writeFileSync(resolve(here,'.preview/catalogue.html'),doc.html);
  writeFileSync(resolve(here,'.preview/social.html'),doc.social);writeFileSync(resolve(here,'.preview/email.html'),doc.email);writeFileSync(resolve(here,'.preview/papers.html'),doc.papers);
  const arg=args.indexOf('--playwright');const pw=await import(arg<0?'playwright':pathToFileURL(resolve(args[arg+1])).href);
  const browser=await pw.chromium.launch({headless:true,channel:'chrome'});
  const playwrightPackage=arg<0?fileURLToPath(import.meta.resolve('playwright/package.json')):resolve(dirname(args[arg+1]),'package.json');
  const runtime={node:process.version,chromium:browser.version(),playwright:json(playwrightPackage).version};
  const inputs=Object.fromEntries([...inputFiles,reg.token_source,...reg.fonts.map(f=>f.file)].map(file=>[file,digest(resolve(file===reg.token_source?repo:here,file))]));
  try {
    const page=await browser.newPage({viewport:{width:parseInt(tokens.layout.css_variables['--f-page-width']),height:parseInt(tokens.layout.css_variables['--f-page-height'])},deviceScaleFactor:1});await page.route('http**://**',r=>r.abort());
    const goto=async(file)=>{await page.goto(pathToFileURL(resolve(here,'.preview',file)).href);await page.evaluate(()=>document.fonts.ready);};
    await goto('catalogue.html');
    assert.equal(await page.locator('.sheet').count(),doc.pageCount);
    const layoutErrors=await page.evaluate(()=>{
      const errors=[];
      for(const e of document.querySelectorAll('img'))if(!e.complete||!e.naturalWidth)errors.push('Missing image '+e.src);
      for(const e of document.querySelectorAll('.sheet')){
        const b=e.getBoundingClientRect(),footer=e.querySelector(':scope > footer').getBoundingClientRect();
        for(const child of e.querySelector('.body').children){const r=child.getBoundingClientRect();if(r.bottom>footer.top||r.right>b.right||r.left<b.left)errors.push('Page body outside safe bounds: '+e.querySelector('h1').textContent);}
      }
      for(const e of document.querySelectorAll('.web'))if(e.scrollWidth>e.clientWidth)errors.push('Web specimen overflows');
      return errors;
    });
    for(let i=0;i<doc.pageCount;i++)await page.locator('.sheet').nth(i).screenshot({path:resolve(here,`.preview/browser-${String(i+1).padStart(2,'0')}.png`)});
    assert.deepEqual(layoutErrors,[],'Layout defects');
    const samples=await page.locator('.contrast').evaluateAll(elements=>elements.map(e=>{const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect(),s=getComputedStyle(e);return {gradient:e.closest('[data-direct-dark]').dataset.directDark,text:e.textContent,color:s.color,x:r.x,y:r.y+scrollY,width:r.width,height:r.height};}));
    await page.pdf({path:resolve(here,'output/pdf/identity-typography.pdf'),printBackground:true,preferCSSPageSize:true,tagged:true,outline:true});
    await page.addStyleTag({content:'.contrast { color: transparent !important; }'});
    const dark=page.locator('.sheet').nth(3);await dark.screenshot({path:resolve(here,'.preview/dark-background.png')});
    const darkTop=await dark.evaluate(e=>e.getBoundingClientRect().top+scrollY);
    for(const s of samples)s.y-=darkTop;
    await goto('papers.html');await page.pdf({path:resolve(here,'output/pdf/document-specimen.pdf'),printBackground:true,preferCSSPageSize:true,tagged:true,outline:true});
    await goto('social.html');for(const name of ['square','landscape'])await page.locator(`[data-export="social-${name}"]`).screenshot({path:resolve(here,`exports/social-${name}.png`)});
    // Browser-generated PNGs use the preserved SVG; no raster master is edited.
    for(const [name,svg,size] of [['avatar-light','avatar-ink',tokens.layout.identity.avatar_export_px],['avatar-dark','avatar-inverse',tokens.layout.identity.avatar_export_px],['favicon-16','mark-ink',16],['favicon-32','mark-ink',32]]) {
      await page.setViewportSize({width:size,height:size});await page.setContent(`<html><body style="margin:0;background:transparent"><img width="${size}" height="${size}" src="${pathToFileURL(resolve(here,'exports',svg+'.svg')).href}"></body></html>`);
      await page.locator('img').evaluate(e=>e.decode());await page.screenshot({path:resolve(here,`exports/${name}.png`),omitBackground:true});
    }
    const logoWidth=tokens.layout.identity.email_logo_export_width,logoHeight=Math.round(logoWidth/(tokens.layout.identity.source_viewbox[2]/tokens.layout.identity.source_viewbox[3])),logoGutter=tokens.layout.identity.email_logo_gutter_px;
    await page.setViewportSize({width:logoWidth+2*logoGutter,height:logoHeight+2*logoGutter});await page.setContent(`<html><body style="margin:${logoGutter}px;background:transparent"><img width="${logoWidth}" height="${logoHeight}" src="${pathToFileURL(resolve(here,'exports/lockup-ink.svg')).href}"></body></html>`);await page.locator('img').evaluate(e=>e.decode());await page.screenshot({path:resolve(here,'exports/email-logo.png'),omitBackground:true});
    await page.setViewportSize({width:640,height:1000});await goto('email.html');
    // Inline resolved presentation so the exported example does not require CSS variables or a web font.
    const email=await page.locator('.email').evaluate(e=>{
      const props=['font-family','font-size','font-weight','line-height','color','background-color','margin-top','margin-bottom','padding','border','width','max-width','box-sizing'];
      const snapshots=[e,...e.querySelectorAll('*')].map(node=>{const style=getComputedStyle(node);return {node,css:props.map(p=>p+':'+(p==='width'&&node!==e&&node.tagName!=='IMG'?'auto':style.getPropertyValue(p))).join(';')};});
      for(const {node,css} of snapshots){node.setAttribute('style',css);node.removeAttribute('class');}
      e.querySelector('img').setAttribute('src','email-logo.png');return e.outerHTML;
    });
    writeFileSync(resolve(here,'exports/email.html'),`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Strale email specimen</title><body>${email}</body></html>\n`);
    const narrowChecks=[];for(const width of tokens.layout.verification_widths){await page.setViewportSize({width,height:1000});await page.goto(pathToFileURL(resolve(here,'exports/email.html')).href);narrowChecks.push({width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)});}
    assert(narrowChecks.every(r=>!r.overflow),'Email specimen overflows');
    writeFileSync(resolve(here,'.preview/render.json'),JSON.stringify({inputs,runtime,pages:doc.pageCount,layout_errors:layoutErrors,samples,narrow_checks:narrowChecks,raw_pdf_hashes:Object.fromEntries(outputs.filter(x=>x.endsWith('.pdf')).map(file=>[file,digest(resolve(here,file))]))},null,2)+'\n');
    console.log(JSON.stringify({...result,pages:doc.pageCount,rendered:true}));
  } finally {await browser.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
