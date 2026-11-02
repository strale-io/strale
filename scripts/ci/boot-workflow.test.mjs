import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

const { jobs } = yaml.load(readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8'));
const guard = jobs.check.steps[0];
function gate(classify, docs, smoke) {
  assert.equal(jobs.check.if, '${{ !cancelled() }}');
  assert.ok(jobs.check.needs.includes('image-boot-smoke'));
  assert.equal(guard.env.CLASSIFY_RESULT, '${{ needs.classify.result }}');
  assert.equal(guard.env.DOCS_ONLY, '${{ needs.classify.outputs.docs_only }}');
  assert.equal(guard.env.SMOKE_RESULT, '${{ needs.image-boot-smoke.result }}');
  return spawnSync('bash', ['-c', guard.run], { env: { ...process.env, CLASSIFY_RESULT: classify, DOCS_ONLY: docs, SMOKE_RESULT: smoke } });
}
for (const docs of ['true', 'false']) {
  for (const smoke of ['success', 'failure', 'cancelled', 'skipped']) {
    test(`required check: docs_only=${docs}, smoke=${smoke}`, () => {
      assert.equal(jobs['image-boot-smoke'].if, "needs.classify.outputs.docs_only == 'false'");
      const result = gate('success', docs, smoke);
      const allowed = smoke === 'success' || (docs === 'true' && smoke === 'skipped');
      assert.equal(result.status, allowed ? 0 : 1);
      if (!allowed) assert.match(result.stdout.toString(), /::error::/);
    });
  }
}
for (const result of ['failure', 'cancelled', 'skipped']) test(`failed classification (${result}) cannot pass the merge gate`, () => {
  assert.equal(gate(result, 'true', 'skipped').status, 1);
});
