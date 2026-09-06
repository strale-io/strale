import {readFile,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import YAML from 'yaml';
const here=dirname(fileURLToPath(import.meta.url)),root=resolve(here,'../../../..');
const read=p=>readFile(resolve(root,p),'utf8').then(s=>s.replace(/\r\n/g,'\n'));
const registry=JSON.parse(await read('design/brand-kit/quiet-material/opening/registry.json'));
const tokens=JSON.parse(await read(registry.tokens));
const brief=await read(registry.copy_source),copy=YAML.parse(brief.split('---')[1]).copy;
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const replace=(s,a,b)=>{if(!s.includes(a))throw Error(`Source changed: ${a}`);return s.replace(a,b)};
let hero=await read(registry.hero_source);
const setText=(pattern,value)=>{if(!pattern.test(hero))throw Error('Hero copy slot missing');hero=hero.replace(pattern,(_,open,close)=>open+escape(value)+close)};
setText(/(<p class="eyebrow">)[^<]*(<\/p>)/,copy.eyebrow);
setText(/(<h1 id="hero-title">)[^<]*(<\/h1>)/,copy.headline);
setText(/(<a class="button primary" href="index.html#scope">)Explore tools( <span)/,copy.primary_action);
setText(/(<a class="button secondary" href="index.html#scope">)[^<]*(<\/a>)/,copy.secondary_action);
hero=replace(hero,' aria-label="Return to comparison"','');
hero=replace(hero,'<body class="hero-page" data-treatment="refined">','<body data-treatment="refined"><main><div class="hero-page">');
hero=hero.replace('<main><section','<section').replace('</section></main>','</section>');
hero=hero.replace(/<p class="lead">.*?<\/p>/,`<p class="lead">${escape(copy.supporting)}</p>`).replace(/<p class="protocol">.*?<\/p>/,'').replace(/<p class="commercial">.*?<\/p>/,'');
hero=hero.replace('Validate these email addresses.',escape(copy.example_request)).replace(/<footer class="request-footer">.*?<\/footer>/,'<footer class="request-footer"></footer>');
hero=hero.replaceAll('<a href="index.html#scope">Sign in</a>','');
hero=hero.replace('href="tokens.css"','href="../hero-comparison/tokens.css"').replace('href="style.css"','href="../hero-comparison/style.css"><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="style.css"').replace('src="interactions.js"','src="../hero-comparison/interactions.js"');
hero=hero.replaceAll('href="index.html#scope"','href="../hero-comparison/index.html#scope"');
hero=hero.replaceAll('href="../hero-comparison/index.html#scope">Tools','href="#tools">Tools');
hero=replace(hero,`href="../hero-comparison/index.html#scope">${escape(copy.primary_action)}`,`href="#tools">${escape(copy.primary_action)}`);
const visuals={
 research:'<div class="sheet"><span class="micro">Company register</span><b>Example Studio</b><i class="ink-bar"></i><i class="ink-bar short"></i><i class="ink-bar"></i></div><div class="profile"><strong>Example Studio</strong><p>Company profile</p><small>Registry information, in one place</small></div>',
 extract:'<div class="sheet"><span class="micro">Invoice</span><b>Example Studio</b><i class="ink-bar"></i><i class="ink-bar short"></i><div class="invoice-total">EUR 480.00</div></div><div class="extracted"><div><span>Supplier</span><strong>Example Studio</strong></div><div><span>Total</span><strong>EUR 480.00</strong></div></div>',
 validate:'<div class="check-stack"><div class="check-item"><code>hello@example.test</code><p><span class="check-symbol">✓</span> Email format valid</p></div><div class="check-item"><code>hello@</code><p><span class="check-symbol">↳</span> Domain missing</p></div></div>'
};
const illustration=j=>`<div class="vignette" role="img" aria-label="${escape(j.visual)}"><div aria-hidden="true">${visuals[j.id]}</div></div>`;
for(const j of registry.jobs)await read(j.manifest);
const cards=registry.jobs.map(j=>`<article class="job">${illustration(j)}<h3>${escape(j.title)}</h3><p>${escape(j.benefit)}</p><a class="job-link" href="${j.id}.html">${escape(j.link)} <span aria-hidden="true">→</span></a></article>`).join('\n');
hero=replace(hero,'</body>',`</div><section class="breadth" id="tools" aria-labelledby="breadth-title"><h2 id="breadth-title">${escape(registry.heading)}</h2><div class="jobs">${cards}</div><p class="illustration-note">Illustrative examples</p></section></main></body>`);
hero=hero.replace('<title>Strale hero — controlled surface comparison</title>','<title>Strale — opening and tools study</title>');
const cssValues={...tokens.palette,'--section-font':tokens.type.families.section,...tokens.layout.css};
const generated={'index.html':hero,'tokens.css':`:root {\n${Object.entries(cssValues).map(([k,v])=>`  ${k}: ${v};`).join('\n')}\n}\n`,'style.css':(await read('design/brand-kit/quiet-material/opening/style.template.css')).replaceAll('__BREAKPOINT__',String(tokens.layout.breakpoint))};
for(const j of registry.jobs)generated[`${j.id}.html`]=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escape(j.title)} — Strale design study</title><link rel="stylesheet" href="../hero-comparison/tokens.css"><link rel="stylesheet" href="../hero-comparison/style.css"><link rel="stylesheet" href="tokens.css"><link rel="stylesheet" href="style.css"></head><body><main class="detail"><a href="index.html#tools">← Back to tools</a><h1>${escape(j.title)}</h1><p>${escape(j.detail)}</p>${illustration(j)}<p class="illustration-note">Design preview · illustrative example. Full catalogue destination is part of website implementation.</p></main></body></html>\n`;
const inputs=[registry.tokens,registry.hero_source,registry.copy_source,'design/brand-kit/quiet-material/opening/registry.json','design/brand-kit/quiet-material/opening/style.template.css','design/brand-kit/quiet-material/opening/build.mjs','design/brand-kit/quiet-material/hero-comparison/style.css','design/brand-kit/quiet-material/hero-comparison/tokens.css',...registry.jobs.map(j=>j.manifest)];
const hash=s=>createHash('sha256').update(s).digest('hex');
const inputsHash={};for(const p of inputs)inputsHash[p]=hash(await read(p));
generated['manifest.json']=JSON.stringify({inputs:inputsHash,outputs:Object.fromEntries(Object.entries(generated).map(([p,s])=>[p,hash(s)]))},null,2)+'\n';
for(const [p,s] of Object.entries(generated)){if(process.argv.includes('--check')){if((await readFile(resolve(here,p),'utf8')).replace(/\r\n/g,'\n')!==s)throw Error(`Stale ${p}`)}else await writeFile(resolve(here,p),s)}
if(process.argv.includes('--check')){
 const evidence=JSON.parse(await readFile(resolve(here,'verification.json'),'utf8'));
 const keys=['responsive_bounds','held_B_dimensions','three_labelled_jobs','local_detail_and_return_links','keyboard_menu','no_remote_requests','no_browser_errors'];
 if(evidence.status!=='passed'||evidence.manifest_sha256!==hash(generated['manifest.json'])||evidence.verifier_sha256!==hash(await read('design/brand-kit/quiet-material/opening/verify.mjs')))throw Error('Stale browser evidence');
 if(JSON.stringify(Object.keys(evidence.checks).sort())!==JSON.stringify(keys.sort())||!Object.values(evidence.checks).every(v=>v===true))throw Error('Incomplete checks');
 const widths=[320,390,tokens.layout.breakpoint,tokens.layout.breakpoint+1,1100,1101,1440];
 if(JSON.stringify(evidence.widths)!==JSON.stringify(widths))throw Error('Incorrect tested widths');
 if(JSON.stringify(Object.keys(evidence.screenshots).sort())!==JSON.stringify(['output/desktop.png','output/mobile.png']))throw Error('Missing screenshots');
 for(const [p,digest] of Object.entries(evidence.screenshots))if(hash(await readFile(resolve(here,p)))!==digest)throw Error(`Changed screenshot ${p}`);
}
console.log('Opening study sources and outputs agree.');
