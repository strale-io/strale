import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {StraleClient} from "../src/client.js";
test("every request carries the framework metadata version",async t => {
  const pkg=JSON.parse(readFileSync(new URL("../package.json",import.meta.url),"utf8"));
  const calls: RequestInit[]=[];
  t.mock.method(globalThis,"fetch",async (_url: unknown,init: RequestInit = {}) => {calls.push(init);return Response.json({capabilities:[],balance_cents:0});});
  const client=new StraleClient({apiKey:"fixture",baseUrl:"https://example.test"});
  await client.listCapabilities(); await client.execute({capabilitySlug:"fixture"}); await client.getBalance();
  assert.equal(calls.length,3);
  assert.ok(calls.every(c => (c.headers as Record<string,string>)["X-Strale-Client"]===`${pkg.name}/${pkg.version}`));
});
