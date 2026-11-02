import {test} from 'node:test';
import assert from 'node:assert/strict';
import {registerStraleTools,stralePost,readPackageVersion} from '../dist/tools.js';
import {readFileSync} from 'node:fs';
test('every shared tool has a title and complete safety annotations',()=>{
  const tools=[];
  registerStraleTools({registerTool:(name,config)=>tools.push({name,...config})},[],[],{baseUrl:'https://example.test',apiKey:'',maxPriceCents:100});
  assert.equal(tools.length,9);
  for(const tool of tools){assert.ok(tool.title);assert.equal(tool.annotations.readOnlyHint,tool.name!=='strale_execute');assert.equal(Object.keys(tool.annotations).length,4);}
});
test('src survives forwarded HTTP execution and client version comes from metadata',async t=>{
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
  assert.equal(readPackageVersion(),pkg.version);
  let observed;
  t.mock.method(globalThis,'fetch',async(url,init)=>{observed={url,init};return Response.json({output:{}});});
  await stralePost('/v1/do?existing=yes',{}, {baseUrl:'https://example.test',apiKey:'fixture',src:'glama'});
  assert.equal(new URL(observed.url).searchParams.get('src'),'glama');
  assert.equal(new URL(observed.url).searchParams.get('existing'),'yes');
  assert.equal(observed.init.headers['X-Strale-Client'],`${pkg.name}/${pkg.version}`);
});
