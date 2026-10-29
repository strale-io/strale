import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Strale } from '../dist/index.js';

test('doBatch posts one batch with one idempotency key and returns per-item results', async (t) => {
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    requests.push({ url, method: init.method, body: init.body, headers: init.headers });
    return Response.json({ batch_id: 'b-1', status: 'partial', charged_cents: 25, results: [
      { index: 0, status: 'completed', price_cents: 25 },
      { index: 1, status: 'failed', price_cents: 0, error: { error_code: 'execution_failed', message: 'x', retryable: false } },
    ] });
  });
  const client = new Strale({ apiKey: 'test-key', baseUrl: 'https://example.test' });
  const res = await client.doBatch({
    capability_slug: 'vat-validate', inputs: [{ vat_number: 'A' }, { vat_number: 'B' }],
    max_total_price_cents: 50, idempotency_key: 'order-1',
  });
  assert.equal(res.status, 'partial');
  assert.deepEqual(res.results.map(r => r.status), ['completed', 'failed']);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, 'https://example.test/v1/do/batch');
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].headers['Idempotency-Key'], 'order-1');
  assert.deepEqual(JSON.parse(requests[0].body), {
    capability_slug: 'vat-validate', inputs: [{ vat_number: 'A' }, { vat_number: 'B' }], max_total_price_cents: 50,
  });
});
