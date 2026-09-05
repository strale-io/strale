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

test('dark fields cannot regain same-tone reading cards',()=>{
 const r=structuredClone(reg);r.gradients.find(g=>g.id==='cobalt').surface_token='--surface-card-inverse-neutral';
 assert.throws(()=>validate(r,tokens),/reading surface drift/);
 const p=structuredClone(reg);p.assets.find(a=>a.id==='pattern-folded-dark-dusk').surface_token='--surface-card-inverse-neutral';
 assert.throws(()=>validate(p,tokens),/solid light paper/);
});

test('Frost and Mint remain direct-text compositions with no nested reading panel',()=>{
 for(const id of ['frost','mint']) {
  const r=structuredClone(reg);r.gradients.find(g=>g.id===id).surface_token='--surface';
  assert.throws(()=>validate(r,tokens),/reading surface drift/);
  const p=structuredClone(reg);p.gradients.find(g=>g.id===id).composition='frame';
  assert.throws(()=>validate(p,tokens),/composition drift/);
 }
});

test('revision metadata cannot contradict candidate identity, adoption or geometry',()=>{
 const mutations=[
  r=>{r.composition_revision={}},
  r=>{r.composition_revision.production_adopted=true},
  r=>{r.composition_revision.version='9.9'},
  r=>{r.composition_revision.predecessor_commit='not-a-commit'},
  r=>{r.composition_revision.gradient_frame_inset_token='--missing'},
  r=>{r.composition_revision.reading_surface_token='--surface-card-inverse-neutral'},
  r=>{r.id='quiet-material-consolidation-9.9'},
 ];
 for(const mutate of mutations){const r=structuredClone(reg);mutate(r);assert.throws(()=>validate(r,tokens));}
 const t=structuredClone(tokens);t.name='Quiet Material catalogue 9.9';assert.throws(()=>validate(reg,t),/Token revision drift/);
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
