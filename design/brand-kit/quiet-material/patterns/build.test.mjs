import test from 'node:test';
import assert from 'node:assert/strict';
import {json,validate,render,validateEvidence,validateComposition} from './build.mjs';
const data=()=>[json('registry.json'),json('../../../tokens/candidates/quiet-material-patterns.json')];
test('current pattern sources validate and derive human rules and icon exports',()=>{const [r,t]=data();validate(r,t);const out=render(r,t);assert(out['RULES.md'].includes('Opening promise | 12 | 32'));assert.equal(JSON.parse(out['icons/manifest.json']).items.length,12);});
test('cannot silently change retained type, palette, motion or controls',()=>{for(const mutate of [t=>t.type.scale.body.size=12,t=>t.layout.css_variables['--control-radius']='4px',t=>t.palette['--ink']='#ff0000',t=>t.motion={unknown:true}]){const [r,t]=data();mutate(t);assert.throws(()=>validate(r,t));}});
test('unknown pages cannot render undefined content',()=>{const[r,t]=data();r.pages[0].id='unknown';assert.throws(()=>render(r,t),/No template/);});
test('new geometry cannot hide an off-scale field radius',()=>{for(const value of ['13px','12rem','12junk']){const[r,t]=data();t.layout.css_variables['--p-field-radius']=value;assert.throws(()=>validate(r,t));}});
test('duplicate or executable icon data is rejected',()=>{for(const mutate of [r=>r.icons.items[1].id=r.icons.items[0].id,r=>r.icons.items[0].path='M0 0<script>alert(1)</script>']){const[r,t]=data();mutate(r);assert.throws(()=>validate(r,t));}});
test('marketing budgets refuse overfilled body and extra result rows',()=>{for(const mutate of [r=>r.story.lead='word '.repeat(40),r=>r.story.result.push({label:'Extra',value:'Hidden complexity'})]){const[r,t]=data();mutate(r);assert.throws(()=>validate(r,t));}});
test('claim basis cannot point to an untracked or alternate authority',()=>{const[r,t]=data();r.story.claim_basis='docs/another-proof.md';assert.throws(()=>validate(r,t),/claim basis/);});
test('evidence cannot omit failure recovery or claim a stale output',()=>{const[r]=data(),e=json('verification.json');for(const mutate of [e=>e.checks.failure_recovery=false,e=>e.outputs['website.html']='0'.repeat(64)]){const copy=structuredClone(e);mutate(copy);assert.throws(()=>validateEvidence(copy,r));}});

test('rendered composition budgets reject excess actions, links, proofs, decoration and panel depth',()=>{
 const[r]=data();const item={id:'hero',headline_words:6,body_words:12,primary_actions:1,supporting_links:1,proof_objects:1,rows:3,decorative_fields:1,panel_depth:1};
 validateComposition([item],r);
 for(const key of ['primary_actions','supporting_links','proof_objects','decorative_fields','panel_depth'])assert.throws(()=>validateComposition([{...item,[key]:2}],r));
});
