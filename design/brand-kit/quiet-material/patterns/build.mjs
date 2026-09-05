import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {templates,esc} from './templates.mjs';
export const here=dirname(fileURLToPath(import.meta.url));
export const read=p=>readFileSync(resolve(here,p),'utf8');
export const json=p=>JSON.parse(read(p));
export const digest=p=>createHash('sha256').update(readFileSync(resolve(here,p))).digest('hex');
export const inputFiles=['registry.json','templates.mjs','specimen.css','interactions.js','build.mjs','verify.mjs','verify-pdf.py','../../../tokens/candidates/quiet-material-patterns.json','../../../tokens/candidates/quiet-material-controls.json','../controls/specimen.css','../foundations/exports/lockup-ink.svg','../foundations/exports/lockup-inverse.svg','../fonts/InstrumentSans.ttf','../fonts/IBMPlexMono-Regular.ttf','../../../../docs/research/2026-09-05-quiet-material-pattern-references.md','../../../../docs/programs/brand-website/LAUNCH-PROOF.md'];
export const inputHashes=()=>Object.fromEntries(inputFiles.map(x=>[x,digest(x)]));
export const words=s=>s.trim().split(/\s+/).filter(Boolean).length;
const hashText=s=>createHash('sha256').update(s).digest('hex');
export function validateComposition(measured,r){
 for(const item of measured){
  const budget=r.density.profiles.find(x=>x.id===item.id);assert(budget,`Unknown density ${item.id}`);
  for(const key of ['headline_words','body_words','primary_actions','supporting_links','proof_objects'])assert(Number.isInteger(item[key])&&item[key]>=0&&item[key]<=budget[key],`${item.id} exceeds ${key}`);
  for(const key of ['rows','decorative_fields','panel_depth'])assert(Number.isInteger(item[key])&&item[key]>=0,`Invalid ${key}`);
  if(budget.rows_max!==undefined)assert(item.rows<=budget.rows_max,`${item.id} exceeds rows`);
  assert(item.decorative_fields<=r.density.rhythm.decorative_fields_per_section_max,'Too many decorative fields');
  assert(item.panel_depth<=r.density.max_nested_reading_panels,'Nested reading panel');
 }
}
export function validate(r,t){
 assert.equal(r.id,'quiet-material-patterns-0.1');assert.equal(r.status,'candidate');assert.equal(r.production_adopted,false);assert.equal(t.status,'proposed');
 assert.equal(new Set(r.pages.map(x=>x.id)).size,8);assert.equal(r.pages.length,t.layout.page_count);
 const base=json('../../../tokens/candidates/quiet-material-controls.json');
 assert.deepEqual(t.type,base.type);assert.deepEqual(t.layout.identity,base.layout.identity);
 assert.deepEqual(t.motion,base.motion,'Retained motion changed');
 for(const [key,value]of Object.entries(base.palette))assert.equal(t.palette[key],value,`Retained palette changed ${key}`);
 for(const [key,value]of Object.entries(t.palette))assert.equal(t.layout.css_variables[key],value,`Palette/CSS mismatch ${key}`);
 for(const [key,value]of Object.entries(base.layout.css_variables))assert.equal(t.layout.css_variables[key],value,`Retained control token changed ${key}`);
 for(const value of base.spacing)assert(t.spacing.includes(value));for(const value of base.radii)assert(t.radii.includes(value));
 assert.deepEqual(t.spacing,[...t.spacing].sort((a,b)=>a-b),'Spacing must be smallest first');
 const css=read('specimen.css');assert(!/#[0-9a-f]{3,8}\b|\b\d+(?:\.\d+)?(?:px|pt|rem|em|ms)\b/i.test(css),'Off-token CSS');
 for(const m of css.matchAll(/var\((--[\w-]+)/g))assert(m[1] in t.layout.css_variables,`Unknown CSS token ${m[1]}`);
 for(const m of css.matchAll(/border-radius:\s*var\((--[\w-]+)\)/g)){const value=t.layout.css_variables[m[1]];assert(t.radii.includes(value)||(/^\d+(?:\.\d+)?px$/.test(value)&&t.radii.includes(Number(value.slice(0,-2)))),'Off-scale radius');}
 assert.equal(r.forms.network,'none');assert.equal(r.forms.storage,'none');assert.equal(r.forms.target_min_px,44);
 assert.equal(r.density.max_primary_per_group,1);assert.equal(r.density.max_nested_reading_panels,1);
 assert.equal(new Set(r.icons.items.map(x=>x.id)).size,12);assert.deepEqual(r.icons.view_box,[0,0,24,24]);assert.equal(r.icons.stroke_width,Number(t.layout.css_variables['--p-icon-stroke']));
 for(const x of r.icons.items){assert(/^[a-z]+(-[a-z]+)*$/.test(x.id));assert(/^[MmLlHhVvCcSsQqTtAaZz\d\s.,+-]+$/.test(x.path));assert(x.use&&x.label);}
 const profile=id=>r.density.profiles.find(x=>x.id===id);const s=r.story;
 assert.equal(s.claim_basis,'docs/programs/brand-website/LAUNCH-PROOF.md','Application claim basis must resolve to the launch-proof authority');
 for(const [id,title,body]of [['hero',s.headline,s.lead],['section',s.section_title,s.section_body],['card',s.closing_title,s.closing_body],['social',s.headline,s.lead],['email',s.headline,s.email_body]]){assert(words(title)<=profile(id).headline_words,`${id} headline budget`);assert(words(body)<=profile(id).body_words,`${id} body budget`);}
 assert(s.result.length<=profile('result').rows_max);assert.equal(r.limits.length,7);
 return true;
}
export function render(r,t){
 validate(r,t);const vars=t.layout.css_variables;
 const logo=(inverse=false)=>`<img class="logo" src="../foundations/exports/lockup-${inverse?'inverse':'ink'}.svg" alt="Strale">`;
 const parts=templates(r,logo(),logo(true));
 for(const p of r.pages)assert.equal(typeof parts.contents[p.id],'string',`No template for page ${p.id}`);
 const css=(read('../controls/specimen.css')+'\n'+read('specimen.css')).replaceAll('BREAKPOINT',t.layout.responsive_breakpoint_px+'px').replaceAll('PRINT_SIZE',`${vars['--page-width']} ${vars['--page-height']}`);
 const doc=(title,body,cls='',script='')=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>@font-face{font-family:"Instrument Sans";src:url(../fonts/InstrumentSans.ttf);font-weight:400 700;font-style:normal}@font-face{font-family:"IBM Plex Mono";src:url(../fonts/IBMPlexMono-Regular.ttf);font-weight:400;font-style:normal}:root{${Object.entries(vars).map(([k,v])=>`${k}:${v}`).join(';')}}${css}</style></head><body class="${cls}">${body}${script?`<script>${script}</script>`:''}</body></html>\n`;
 const sheets=r.pages.map((p,i)=>`<section class="sheet" id="${p.id}"><div class="mast">${logo()}<span class="label">QUIET MATERIAL / ${esc(p.id.toUpperCase())}</span></div><h1>${esc(p.title)}</h1><p class="intro">${esc(p.summary)}</p><div class="body">${parts.contents[p.id]}</div><footer class="footer"><span>PATTERNS CANDIDATE 0.1 / DESIGN SPECIMEN</span><span>${String(i+1).padStart(2,'0')}</span></footer></section>`).join('');
 const banner='<div class="study-banner">Quiet Material application study · Illustrative content · Not a live product page</div>';
 const out={
  'index.html':doc('Strale forms, symbols and composition',`<main>${sheets}</main>`,'',read('interactions.js')),
  'website.html':doc('Strale website sequence study',`${banner}<main>${parts.website}</main>`),
  'social.html':doc('Strale social composition study',`<main>${parts.social}<section class="social-notes"><h2>Accompanying copy</h2><p class="separated">${esc(r.story.social_caption)}</p><h3>Alternative text</h3><p class="separated">${esc(r.story.social_alt)}</p><p class="small muted">Candidate artwork. Not published. This fixed-size master is intended for export.</p><a class="btn text" href="index.html#social">Back to the guide</a></section></main>`),
  'email.html':doc('Strale email composition study',`${banner}<main>${parts.email}</main>`,'email-page'),
  'email.txt':`COMPOSITION STUDY - NOT FOR SENDING\nSubject: ${r.story.email_subject}\n\n${r.story.headline}\n\n${r.story.email_body}\n\n${r.story.fixture_label}:\n${r.story.result.map(x=>`${x.label}: ${x.value}`).join('\n')}\n\n${r.story.primary}: [verified catalogue destination required]\n\nStrale\n[Recipient context and required footer to be completed before sending]\n`
 };
 for(const item of r.icons.items)out[`icons/${item.id}.svg`]=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r.icons.view_box.join(' ')}" fill="none" stroke="currentColor" stroke-width="${r.icons.stroke_width}" stroke-linecap="${r.icons.linecap}" stroke-linejoin="${r.icons.linejoin}"><path d="${item.path}"/></svg>\n`;
 out['RULES.md']=`# Quiet Material patterns 0.1\n\nGenerated from registry.json; edit that source, then rebuild. Candidate, not production adoption.\n\n## Forms\n\n| Rule | Contract |\n|---|---|\n${Object.entries(r.forms).map(([k,v])=>`| ${k} | ${Array.isArray(v)?v.join(', '):v} |`).join('\n')}\n\n## Utility symbols\n\n${r.icons.authorship}\n\nGrid: ${r.icons.view_box.join(' ')}. Stroke: ${r.icons.stroke_width}. Sizes: ${r.icons.sizes_px.join(', ')}px. Colour: ${r.icons.colour}. Caps and joins: ${r.icons.linecap}/${r.icons.linejoin}.\n\n${r.icons.action}. Decorative: ${r.icons.decorative}.\n\n| Symbol | Use | Master |\n|---|---|---|\n${r.icons.items.map(x=>`| ${x.label} | ${x.use} | [${x.id}](icons/${x.id}.svg) |`).join('\n')}\n\nProhibited: ${r.icons.prohibited.join('; ')}.\n\n## Content budgets\n\n${r.density.method}\n\n| Role | Headline words | Body words | Primary actions | Supporting links | Proof objects |\n|---|---:|---:|---:|---:|---:|\n${r.density.profiles.map(x=>`| ${x.label} | ${x.headline_words} | ${x.body_words} | ${x.primary_actions} | ${x.supporting_links} | ${x.proof_objects} |`).join('\n')}\n\nResult previews: at most ${r.density.profiles.find(x=>x.id==='result').rows_max} rows. Primary actions: ${r.density.max_primary_per_group} per decision group. Reading panels: at most ${r.density.max_nested_reading_panels} nesting level. Subtitles: ${r.density.subtitle_default}.\n\n${r.density.hierarchy.map(x=>'- '+x).join('\n')}\n\n## Page rhythm\n\nSequence: ${r.density.rhythm.sequence.join(' → ')}. At most ${r.density.rhythm.adjacent_same_layout_max} adjacent sections with the same layout; at most ${r.density.rhythm.decorative_fields_per_section_max} decorative field per section. Card-grid purpose: ${r.density.rhythm.card_grid_requires}.\n\n## Applications\n\n${r.applications.map(x=>`- [${x.id}](${x.file}): ${x.role}. ${x.limits}.`).join('\n')}\n\n## Boundaries\n\n${r.limits.map(x=>'- '+x).join('\n')}\n`;
 out['icons/manifest.json']=JSON.stringify({id:r.icons.family,status:r.icons.status,authorship:r.icons.authorship,source:'../registry.json',items:r.icons.items.map(x=>({id:x.id,file:x.id+'.svg',sha256:hashText(out[`icons/${x.id}.svg`]),sizes_px:r.icons.sizes_px,use:x.use}))},null,2)+'\n';
 return out;
}
export function validateEvidence(e,r){
 assert.equal(e.id,r.id);assert.deepEqual(e.inputs,inputHashes());assert.deepEqual(e.errors,[]);assert.deepEqual(e.widths,[320,375,760,1120,1440]);
 for(const key of ['reflow','form_validation','preserved_values','failure_recovery','loading_guard','native_selection','read_only_disabled','labels','focus_visible','targets','icons','density','reduced_motion','network_blocked','print_bounds','contrast'])assert.equal(e.checks[key],true,`Missing ${key} evidence`);
 assert(e.contrast.length>=6&&e.contrast.every(x=>x.ratio>=x.required));assert.equal(e.pdf.pages,8);assert.equal(e.pdf.all_fonts_embedded,true);assert.deepEqual(e.pdf.bounds_errors,[]);
 const scopes={'website.html':['hero','result','section','card'],'social.html':['social','result'],'email.html':['email','result']};
 assert.deepEqual(Object.keys(e.compositions).sort(),Object.keys(scopes).sort());
 for(const [file,ids]of Object.entries(scopes)){assert.deepEqual(e.compositions[file].map(x=>x.id),ids);validateComposition(e.compositions[file],r);}
 const outputs=[...Object.keys(render(r,json('../../../tokens/candidates/quiet-material-patterns.json'))),'exports/social-landscape.png','output/pdf/forms-symbols-composition.pdf'];
 assert.deepEqual(Object.keys(e.outputs).sort(),outputs.sort());for(const p of outputs)assert.equal(e.outputs[p],digest(p),`Stale output ${p}`);
}
function main(){const r=json('registry.json'),t=json('../../../tokens/candidates/quiet-material-patterns.json'),out=render(r,t);if(process.argv.includes('--check')){for(const [p,s]of Object.entries(out))assert.equal(read(p),s,`Stale ${p}`);validateEvidence(json('verification.json'),r);console.log('Patterns inputs, outputs and evidence pass');}else{for(const p of ['icons','exports','output/pdf','.preview'])mkdirSync(resolve(here,p),{recursive:true});for(const [p,s]of Object.entries(out))writeFileSync(resolve(here,p),s);console.log('Built patterns and three application studies');}}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
