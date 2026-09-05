import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate,identityExports,validateEvidence} from './build.mjs';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const reg=read('./registry.json'), tokens=read('../../../tokens/candidates/quiet-material-foundations.json');
const clone=x=>structuredClone(x);
test('complete candidate validates with original fonts and master',()=>assert.equal(validate(reg,tokens).ok,true));
test('candidate cannot claim production adoption',()=>{const r=clone(reg);r.production_adopted=true;assert.throws(()=>validate(r,tokens));});
test('missing role or channel cannot silently reduce coverage',()=>{const r=clone(reg);r.roles.pop();assert.throws(()=>validate(r,tokens));const c=clone(reg);c.channels[3]=c.channels[0];assert.throws(()=>validate(c,tokens));});
test('unavailable mono weights and mismatched role values fail',()=>{const t=clone(tokens);t.type.scale.code.weight=500;assert.throws(()=>validate(reg,t));const u=clone(tokens);u.layout.css_variables['--t-body-size']='12px';assert.throws(()=>validate(reg,u));});
test('font and logo provenance cannot be replaced by unknown sources',()=>{const r=clone(reg);r.fonts[0].sha256='0'.repeat(64);assert.throws(()=>validate(r,tokens));const s=clone(reg);s.source.sha256='0'.repeat(64);assert.throws(()=>validate(s,tokens));});
test('derived variants preserve the original path data',()=>{const files=identityExports(reg,tokens);const paths=s=>[...s.matchAll(/<path d="([^"]+)"/g)].map(m=>m[1]);const master=readFileSync(new URL('./masters/strale-lockup.svg',import.meta.url),'utf8');assert.deepEqual(paths(files['lockup-inverse.svg']),paths(master));for(const name of ['mark-ink.svg','mark-inverse.svg','avatar-ink.svg','avatar-inverse.svg'])assert.deepEqual(paths(files[name]),paths(master).slice(0,3));});

test('identity palette and font families cannot disagree with specimen CSS',()=>{const t=clone(tokens);t.palette['--ink']='#ff0000';assert.throws(()=>validate(reg,t));const u=clone(tokens);u.type.families.sans='Arial';assert.throws(()=>validate(reg,u));});
test('dark-card scope cannot silently expand to an unmeasured gradient',()=>{const r=clone(reg);r.direct_dark.gradient_tokens.push('--atmosphere-midnight');assert.throws(()=>validate(r,tokens));});
test('evidence requires font, Unicode, fallback and limitation coverage',()=>{const e=read('./verification.json'),m=read('./exports/manifest.json');validateEvidence(reg,tokens,e,m);for(const field of ['font_audit','embedded_fonts','email_browser_reflow','pdf_text','runtime','limits']){const changed=clone(e);delete changed[field];assert.throws(()=>validateEvidence(reg,tokens,changed,m));}const changed=clone(e);changed.email_browser_reflow[0].overflow=true;assert.throws(()=>validateEvidence(reg,tokens,changed,m));});
test('export manifest cannot promote the candidate or change its provenance',()=>{const e=read('./verification.json'),m=read('./exports/manifest.json');for(const change of [{production_adopted:true},{source:{file:'unknown.svg'}},{scope:[]}])assert.throws(()=>validateEvidence(reg,tokens,e,{...m,...change}));});

test('contrast evidence must cover three samples for each declared gradient',()=>{const e=read('./verification.json'),m=read('./exports/manifest.json');for(const gradient of ['midnight','cobalt']){const changed=clone(e);changed.dark_contrast[3].gradient=gradient;assert.throws(()=>validateEvidence(reg,tokens,changed,m));}});
