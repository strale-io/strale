import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate,validateEvidence} from './build.mjs';
const reg=JSON.parse(readFileSync(new URL('./registry.json',import.meta.url)));
const tokens=JSON.parse(readFileSync(new URL('../../tokens/candidates/quiet-material-catalogue.json',import.meta.url)));
test('complete retained register passes without claiming source-file verification',()=>assert.equal(validate(reg,tokens).source_integrity,'not-requested'));
test('a lost current asset fails even if the remaining records are valid',()=>{
 const r=structuredClone(reg);r.assets.pop();assert.throws(()=>validate(r,tokens),/coverage drift/);
});
test('changing a retained source hash fails closed',()=>{
 const r=structuredClone(reg);r.assets[0].sha256='0'.repeat(64);assert.throws(()=>validate(r,tokens),/Source drift/);
});
test('an invented Amber card and silent illustration promotion fail closed',()=>{
 const r=structuredClone(reg);r.assets.find(a=>a.id==='pattern-folded-dark-amber').surface_token='--surface';
 assert.throws(()=>validate(r,tokens));
 const p=structuredClone(reg);p.illustrations[0].eligible_for_implementation=true;
 assert.throws(()=>validate(p,tokens),/silently become usable/);
});
test('a gradient change cannot disagree with its token source',()=>{
 const r=structuredClone(reg);r.gradients[0].css='none';assert.throws(()=>validate(r,tokens),/Gradient drift/);
});

test('duplicate gradient identities and missing authority cannot enter the register',()=>{
 const r=structuredClone(reg);r.gradients[1].id=r.gradients[0].id;assert.throws(()=>validate(r,tokens),/Duplicate gradients/);
 const p=structuredClone(reg);delete p.authority;assert.throws(()=>validate(p,tokens),/authority/);
});

test('font source provenance and file linkage must agree with packaged inputs',()=>{
 const r=structuredClone(reg);r.font_sources[0].url='https://example.org/font';assert.throws(()=>validate(r,tokens),/provenance drift/);
 const p=structuredClone(reg);p.font_sources[0].files=p.font_sources[1].files;assert.throws(()=>validate(p,tokens),/linkage drift/);
});

test('evidence rejects missing builder inputs and contradictory measurements',()=>{
 const evidence=JSON.parse(readFileSync(new URL('./verification.json',import.meta.url)));
 validateEvidence(evidence,reg);
 const mutations=[
  e=>{delete e.builder_inputs['verify.py']},
  e=>{e.render_inputs.registry_sha256='0'.repeat(64)},
  e=>{e.failures=[e.results[0]]},
  e=>{e.results[0].ratio=2},
  e=>{e.pages--},
  e=>{e.results.pop()},
  e=>{delete e.render_inputs.sample_inputs['background-06.png']},
  e=>{e.out_of_page_text=[{page:1,word:'overflow'}]},
  e=>{e.optimisation_verified=false},
 ];
 for(const mutate of mutations){const e=structuredClone(evidence);mutate(e);assert.throws(()=>validateEvidence(e,reg));}
});
