import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Strale, StraleError } from '../dist/index.js';

test('key methods use the documented HTTP methods, paths and JSON bodies', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, method: init.method, body: init.body, headers: init.headers });
    return Response.json(init.method === 'GET' ? { keys: [{ id: 'key-id' }] } : { id: 'key-id', ...(init.method === 'POST' ? { api_key: 'once-only-test-value' } : {}) });
  });
  const client = new Strale({ apiKey: 'test-primary', baseUrl: 'https://example.test' });
  assert.equal((await client.createApiKey({ label: 'Agent', max_spend_total_cents: 25 })).api_key, 'once-only-test-value');
  assert.deepEqual(await client.apiKeys(), [{ id: 'key-id' }]);
  await client.updateApiKey('key/id', { label: 'Renamed', max_spend_per_hour_cents: null });
  await client.revokeApiKey('key/id');
  assert.deepEqual(requests.map(r => [r.method, r.url, r.body]), [
    ['POST', 'https://example.test/v1/api-keys', '{"label":"Agent","max_spend_total_cents":25}'],
    ['GET', 'https://example.test/v1/api-keys', undefined],
    ['PATCH', 'https://example.test/v1/api-keys/key%2Fid', '{"label":"Renamed","max_spend_per_hour_cents":null}'],
    ['DELETE', 'https://example.test/v1/api-keys/key%2Fid', undefined],
  ]);
  assert.ok(requests.every(r => r.headers.Authorization === 'Bearer test-primary'));
});

test('key cap refusal preserves stable code and details', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error_code: 'key_total_cap_exceeded', message: "Raise this key's limit in key settings or use another key.", details: { limit_cents: 25, retryable: false } }, { status: 429 }));
  const client = new Strale({ apiKey: 'test-key' });
  await assert.rejects(client.do({ capability_slug: 'test', inputs: {}, max_price_cents: 25 }), (error) => {
    assert.ok(error instanceof StraleError);
    assert.equal(error.errorCode, 'key_total_cap_exceeded');
    assert.deepEqual(error.details, { limit_cents: 25, retryable: false });
    return true;
  });
});

for (const [status, code] of [[403, 'primary_key_required'], [409, 'active_key_limit_exceeded']]) {
  test(`key management preserves ${code}`, async (t) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({error_code: code, message: 'Action required'}, {status}));
    const client = new Strale({apiKey: 'test-key'});
    await assert.rejects(client.createApiKey({label: 'Agent'}), error => {
      assert.ok(error instanceof StraleError); assert.equal(error.statusCode, status); assert.equal(error.errorCode, code); return true;
    });
  });
}

test('framework wrappers can identify themselves while the SDK defaults to its own metadata', async t => {
  const {readFileSync} = await import('node:fs');
  const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
  const headers=[];
  t.mock.method(globalThis,'fetch',async (_url,init)=>{headers.push(init.headers);return Response.json({keys:[]});});
  await new Strale({apiKey:'fixture',clientHeader:'framework-fixture/1.2.3'}).apiKeys();
  await new Strale({apiKey:'fixture'}).apiKeys();
  assert.equal(headers[0]['X-Strale-Client'],'framework-fixture/1.2.3');
  assert.equal(headers[1]['X-Strale-Client'],`straleio-js/${pkg.version}`);
});
