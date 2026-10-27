import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {StraleFallbackTool} from "../src/index.js";
test("framework calls identify the package and metadata version", async t => {
  const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
  const calls: RequestInit[]=[];
  t.mock.method(globalThis,"fetch",async (_url: unknown,init: RequestInit = {}) => {calls.push(init);return Response.json({result:{output:{valid:true}}});});
  const tool=new StraleFallbackTool({apiKey:"fixture",capabilitySlug:"fixture",baseUrl:"https://example.test"});
  await tool.invoke("fixture");
  assert.equal(calls.length,1);
  assert.equal((calls[0].headers as Record<string,string>)["X-Strale-Client"],`${pkg.name}/${pkg.version}`);
});
