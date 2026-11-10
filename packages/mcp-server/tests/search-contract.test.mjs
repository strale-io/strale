import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerStraleTools} from '../dist/tools.js';

const capabilities = [
  {slug:'fixture-free',name:'Fixture free',description:'Fixture',category:'fixture',price_cents:5,is_free_tier:true,input_schema:null},
  {slug:'fixture-paid',name:'Fixture paid',description:'Fixture',category:'fixture',price_cents:7,is_free_tier:false,input_schema:null},
];
const solutions = [
  {slug:'fixture-bundle',name:'Fixture bundle',description:'Fixture',category:'fixture',price_cents:150,geography:'global',step_count:2,capabilities:[]},
  {slug:'fixture-zero',name:'Fixture zero',description:'Fixture',category:'fixture',price_cents:0,geography:'global',step_count:1,capabilities:[]},
];
const upstream = [
  ...capabilities.map(c=>({...c,type:'capability',price_cents:null})),
  ...solutions.map(s=>({...s,type:'solution'})),
];
function tools(connector) {
  const result = new Map();
  registerStraleTools({registerTool:(name,config,call)=>result.set(name,{config,call})},capabilities,solutions,
    {baseUrl:'https://fixture.invalid',apiKey:'',maxPriceCents:200,connector});
  return result;
}
const parsed = result => JSON.parse(result.content[0].text);
const prices = rows => Object.fromEntries(rows.map(r=>[r.slug, {
  price_cents:r.price_cents,price_formatted:r.price_formatted,price:r.price,
  ...(r.type==='capability'?{is_free_tier:r.is_free_tier}:{}),
}]));
const expected = {
  'fixture-free':{price_cents:null,price_formatted:null,price:null,is_free_tier:true},
  'fixture-paid':{price_cents:null,price_formatted:null,price:null,is_free_tier:false},
  'fixture-bundle':{price_cents:150,price_formatted:'€1.50',price:'€1.50'},
  'fixture-zero':{price_cents:0,price_formatted:'€0.00',price:'€0.00'},
};

for (const connector of [false,true]) {
  test(`search pricing agrees across typeahead, category and outage paths (connector=${connector})`,async t=>{
    let outage=false;
    t.mock.method(globalThis,'fetch',async url=>{
      assert.equal(new URL(url).pathname,'/v1/suggest/typeahead');
      if(outage)throw new Error('fixture outage');
      return Response.json({results:upstream,total:upstream.length});
    });
    const search=tools(connector).get('strale_search').call;
    assert.deepEqual(prices(parsed(await search({query:'fixture'})).results),expected);
    assert.deepEqual(prices(parsed(await search({query:'fixture',category:'fixture'})).results),expected);
    outage=true;
    assert.deepEqual(prices(parsed(await search({query:'fixture'})).results),expected);
  });
  test(`search recovers a missing free flag from the catalogue and preserves unknown bundle price (connector=${connector})`,async t=>{
    t.mock.method(globalThis,'fetch',async()=>Response.json({total:2,results:[
      {...upstream[0],is_free_tier:undefined},
      {...upstream[2],price_cents:null},
    ]}));
    const rows=parsed(await tools(connector).get('strale_search').call({query:'fixture'})).results;
    assert.equal(rows[0].is_free_tier,true);
    assert.equal(rows[1].price_cents,null);
    assert.equal(rows[1].price_formatted,null);
    assert.equal(rows[1].price,null);
  });
  test(`transaction and search descriptions state access and pricing limits (connector=${connector})`,()=>{
    const registered=tools(connector);
    const transaction=registered.get('strale_transaction').config.description;
    assert.match(transaction,/Without authentication.*redacted metadata/);
    assert.match(transaction,/authenticated.*own/i);
    const search=registered.get('strale_search').config.description;
    assert.match(search,/price_cents/);
    assert.match(search,/null.*not.*free/i);
    assert.match(search,/is_free_tier/);
    assert.match(search,/monthly.*allowance/);
  });
}
