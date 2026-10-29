import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {ENTRY_POINTS,findEntryPoint,registerEntryPointTools} from '../dist/entry-points.js';
const dir=new URL('../entry-points/',import.meta.url);
const cap=(slug,free=false)=>({slug,name:slug,description:`${slug}.`,category:'x',price_cents:5,is_free_tier:free,input_schema:{type:'object',properties:{q:{type:'string'}}},output_schema:null});
test('each entry point has exactly one remote-only registry entry that names it',()=>{
  assert.ok(ENTRY_POINTS.length<=3);
  assert.deepEqual(readdirSync(dir).sort(),ENTRY_POINTS.map(e=>e.id).sort());
  for(const e of ENTRY_POINTS){
    const s=JSON.parse(readFileSync(new URL(`${e.id}/server.json`,dir)));
    assert.equal(s.name,`io.github.strale-io/${e.id}`);
    assert.equal(s.title,e.title);
    assert.ok(s.description.length<=100);
    assert.equal(s.packages,undefined,'the strale-mcp package names io.github.strale-io/strale; a narrow entry is remote-only');
    assert.deepEqual(s.remotes,[{type:'streamable-http',url:`https://api.strale.io/mcp/${e.id}?src=mcp-registry`}]);
    assert.equal(e.src,`mcp-${e.id}`);
  }
});
test('registers one tool per catalogued slug, skips missing slugs, and tags calls with the entry src',async t=>{
  const e=findEntryPoint('web-reader');
  const tools=[];
  const names=registerEntryPointTools({registerTool:(name,config,handler)=>tools.push({name,config,handler})},e,[cap('url-to-markdown',true),cap('web-extract'),cap('email-validate',true)],{baseUrl:'https://example.test',apiKey:'k',maxPriceCents:100,src:'smithery'});
  assert.deepEqual(names,['url-to-markdown','web-extract']);
  assert.equal(tools.find(x=>x.name==='url-to-markdown').config.annotations.readOnlyHint,true);
  assert.equal(tools.find(x=>x.name==='web-extract').config.annotations.destructiveHint,true);
  let seen;
  t.mock.method(globalThis,'fetch',async(url,init)=>{seen={url,init};return Response.json({result:{output:{}}});});
  await tools[1].handler({q:'x'});
  assert.equal(new URL(seen.url).searchParams.get('src'),'mcp-web-reader');
  assert.equal(JSON.parse(seen.init.body).capability_slug,'web-extract');
});
