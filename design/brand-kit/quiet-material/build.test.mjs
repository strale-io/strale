import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validate} from './build.mjs';
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
