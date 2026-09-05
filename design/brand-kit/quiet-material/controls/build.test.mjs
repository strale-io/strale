import test from 'node:test';
import assert from 'node:assert/strict';
import {json,validate,render,validateEvidence} from './build.mjs';
const r=json('registry.json'),t=json('../../../tokens/candidates/quiet-material-controls.json'),clone=x=>structuredClone(x);
test('current control recipe renders and validates',()=>{assert(validate(r,t));assert(render(r,t).includes('aria-controls="tools-panel"'));});
test('controls cannot silently promote themselves or change the retained type',()=>{const x=clone(r);x.production_adopted=true;assert.throws(()=>validate(x,t));const y=clone(t);y.type.scale.ui.weight=700;assert.throws(()=>validate(r,y));});
test('interaction contract cannot lose focus restoration or native navigation',()=>{for(const change of [{escape:'ignore'},{pattern:'menu'}]){const x=clone(r);Object.assign(x.navigation,change);assert.throws(()=>validate(x,t));}});
test('density and minimum target rules remain bounded',()=>{const x=clone(r);x.cards.marketing.paragraphs_max=5;assert.throws(()=>validate(x,t));const y=clone(r);y.buttons.min_target_px=24;assert.throws(()=>validate(y,t));});
test('retained identity geometry and radius scale cannot disappear',()=>{const x=clone(t);delete x.layout.identity;assert.throws(()=>validate(r,x));const y=clone(t);y.radii=y.radii.filter(x=>x!==12);assert.throws(()=>validate(r,y));});
test('result interaction and row contract cannot silently diverge',()=>{for(const change of [{fixture_rows:9},{interactive_model:'single-anchor'}]){const x=clone(r);Object.assign(x.cards.result,change);assert.throws(()=>validate(x,t));}});
test('evidence rejects omitted checks, missing inputs and stale outputs',()=>{const e=json('verification.json');validateEvidence(e,r);for(const key of ['focus_visible','mobile_keyboard','loading_guard']){const x=clone(e);delete x.checks[key];assert.throws(()=>validateEvidence(x,r));}const x=clone(e);delete x.inputs['interactions.js'];assert.throws(()=>validateEvidence(x,r));const y=clone(e);y.outputs['index.html']='0'.repeat(64);assert.throws(()=>validateEvidence(y,r));});
test('evidence cannot hide qualification limits or claim embedded fonts without them',()=>{const e=json('verification.json');e.limits=[];assert.throws(()=>validateEvidence(e,r));const x=json('verification.json');x.pdf.all_fonts_embedded=false;assert.throws(()=>validateEvidence(x,r));});

test('radius variables cannot hide off-scale corner geometry',()=>{const x=clone(t);x.layout.css_variables['--menu-radius']='17px';assert.throws(()=>validate(r,x));});
