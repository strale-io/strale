import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deployMismatch, staleJob, mcpContractMismatch, liveReads } from './demonstrate-alerts.mjs';

test('deploy SHA mismatch fails the workflow and opens one deploy-not-live issue', async () => {
  const d = await deployMismatch();
  assert.equal(d.fired, true);
  assert.match(d.alerts[0].body, /Production commit: bbbbbbbbbbbb/);
});
test('a stale job is quiet on the first run and opens one issue on the second', async () => {
  const d = await staleJob();
  assert.equal(d.fired, true);
  assert.deepEqual(d.runs.map((r) => r.red), [false, true]);
});
test('a published MCP trust mismatch opens one package-contract issue', async () => {
  const d = await mcpContractMismatch();
  assert.equal(d.fired, true);
  assert.match(d.alerts[0].body, /cap trust=0/);
});
test('live reads report what they could not read instead of throwing', async () => {
  const live = await liveReads(async () => { throw new Error('HTTP 503'); });
  assert.equal(live.production_commit, null);
  assert.equal(live.jobs_total, 0);
  assert.deepEqual(live.catalogue, { error: 'HTTP 503' });
});
