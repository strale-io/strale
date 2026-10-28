import { readFileSync } from "node:fs";
const contract = JSON.parse(readFileSync(new URL("../../apps/api/src/lib/job-watch-contract.json", import.meta.url), "utf8"));
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { docsOnly, briefsChanged } from './classify.mjs';
import { waitForDeploy, failingJobs, report, json, production, deploy } from './watch.mjs';
import { mayRetry, retry } from './retry.mjs';
import { checkStartup } from './package-probe.mjs';

test('shared docs classification fails closed on empty and nested source markdown', () => {
  assert.equal(docsOnly([]), false);
  assert.equal(docsOnly(['docs/a.md', 'archive/a.json', 'handoff/a.md', 'README.md']), true);
  assert.equal(docsOnly(['apps/api/README.md']), false);
  assert.equal(briefsChanged(['docs/company/briefs/2026-10-27.md']), true);
});
const a = 'a'.repeat(40), b = 'b'.repeat(40), c = 'c'.repeat(40);
async function poll(served, newer = async () => false) {
  let clock = 0;
  return waitForDeploy({ expected: a, health: async () => ({ commit: served }), head: async () => c, newer,
    now: () => clock, sleep: async (ms) => { clock += ms; }, budget: 90_000 });
}
test('deploy accepts 12-character exact SHA', async () => assert.equal((await poll(a.slice(0, 12))).ok, true));
test('deploy accepts verified descendant, including intermediate deployment', async () => {
  assert.equal((await poll(b.slice(0, 12), async () => true)).ok, true);
});
test('deploy rejects old, malformed and absent commits, exhausts a measured budget', async () => {
  for (const served of [b.slice(0, 12), a.slice(0, 7), null, '']) {
    const result = await poll(served);
    assert.equal(result.ok, false); assert.equal(result.waited, 90_000);
  }
});
test('deploy validates input and does not turn HTTP failure into success', async () => {
  await assert.rejects(waitForDeploy({ expected: '' }));
  await assert.rejects(json('https://example.invalid', async () => ({ status: 503 })));
});
const good = { id: 'test-scheduler', ok: true, expected_interval_seconds: 60, last_success_age_seconds: 10 };
test('empty, duplicate and invalid job inventories fail', () => {
  for (const jobs of [[], [good, good], [{ ...good, ok: 'true' }], [{ ...good, last_success_age_seconds: 181 }]]) assert.throws(() => failingJobs({ jobs }));
  assert.throws(() => failingJobs({ jobs: [good] }));
  const all = Object.entries(contract).map(([id, expected_interval_seconds]) => ({ ...good, id, expected_interval_seconds }));
  assert.deepEqual(failingJobs({ jobs: all }), all);
});
function fakeGithub() {
  const issues = []; const labels = new Set();
  const github = { paginate: async () => issues,
    rest: { issues: {
      listForRepo() {}, getLabel: async ({ name }) => { if (!labels.has(name)) throw { status: 404 }; },
      createLabel: async ({ name }) => { labels.add(name); },
      create: async (data) => { issues.push({ ...data, number: issues.length + 1, state: 'open' }); },
      update: async (data) => { Object.assign(issues.find((i) => i.number === data.issue_number), data); },
    } } };
  return { github, issues };
}
test('issue counts distinct runs, confirms second failure and closes/reset on recovery', async () => {
  const { github, issues } = fakeGithub();
  const base = { label: 'production-watch', id: 'test-scheduler', threshold: 2, body: 'stale', ok: false };
  assert.equal(await report(github, {}, { ...base, run: 1 }), false);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].title, '[watch-state] production-watch');
  assert.equal(await report(github, {}, { ...base, run: 1 }), false);
  assert.equal(await report(github, {}, { ...base, run: 2 }), true);
  assert.deepEqual(issues[1].labels, ['production-watch']);
  assert.equal(await report(github, {}, { ...base, run: 3, ok: true }), false);
  assert.equal(issues[1].state, 'closed');
  assert.equal(await report(github, {}, { ...base, run: 4 }), false);
  assert.equal(issues.length, 2);
});
test('one run persists both signal counters with one state read and write', async () => {
  const { github, issues } = fakeGithub();
  let reads = 0, writes = 0;
  const paginate = github.paginate, create = github.rest.issues.create;
  github.paginate = async (...args) => { reads++; return paginate(...args); };
  github.rest.issues.create = async (data) => { if (data.title.startsWith('[watch-state]')) writes++; return create(data); };
  await report(github, {}, ['first', 'second'].map((id) => ({ label: 'production-watch', id, ok: false, run: 1, threshold: 2 })));
  const state = JSON.parse(/<!-- watch-state:(.*?) -->/.exec(issues[0].body)[1]);
  assert.equal(state['production-watch:first'].count, 1);
  assert.equal(state['production-watch:second'].count, 1);
  assert.equal(reads, 1);
  assert.equal(writes, 1);
});
test('recovery without prior incident creates no issue', async () => {
  const { github, issues } = fakeGithub();
  await report(github, {}, { label: 'deploy-not-live', id: 'deploy', ok: true, run: 1 });
  assert.equal(issues.length, 0);
});
const run = { conclusion: 'failure', run_attempt: 1, event: 'schedule' };
const step = (name, conclusion = 'success') => ({ name, conclusion, started_at: '2026-10-27T08:00:00Z' });
test('retry permits prep failure once, never test-body, empty, second attempt or PR failures', () => {
  const jobs = [{ conclusion: 'failure', steps: [step('Set up job'), step('Run actions/checkout@v4'), step('Run npm ci', 'failure')] }];
  assert.equal(mayRetry(run, jobs), true);
  for (const change of [{ run_attempt: 2 }, { event: 'pull_request' }, { conclusion: 'success' }]) assert.equal(mayRetry({ ...run, ...change }, jobs), false);
  assert.equal(mayRetry(run, []), false);
  assert.equal(mayRetry(run, [{ conclusion: 'failure', steps: [step('Run npm test', 'failure')] }]), false);
  assert.equal(mayRetry(run, [...jobs, { conclusion: 'success', steps: [step('Probe production')] }]), false);
  assert.equal(mayRetry(run, [{ conclusion: 'startup_failure', steps: [] }]), true);
});
test('retry never executes foreign repository code', async () => {
  assert.equal(await retry({}, { repo: { owner: 'a', repo: 'b' }, payload: { workflow_run: { head_repository: { full_name: 'foreign/repo' }, head_branch: 'main' } } }), false);
});
const startup = '[strale-mcp] Loaded 10 capabilities, 2 solutions, 10 cap trust, 2 sol trust from https://api.strale.io\n[strale-mcp] Server running on stdio (6 meta-tools, 10 capabilities, 2 solutions)';
test('published startup contract requires nonzero catalog-consistent counts and rejects logged degradations', () => {
  assert.deepEqual(checkStartup(startup, 10, 2), [10, 2, 10, 2]);
  for (const text of ['', startup.replace('10 cap trust', '0 cap trust'), startup + '\n[strale-mcp] Warning: continuing', startup + '\n[strale_search] falling back']) assert.throws(() => checkStartup(text, 10, 2));
  assert.throws(() => checkStartup(startup, 11, 2));
  // strale-mcp after 0.2.9 dropped the stale tool count from the running line.
  assert.deepEqual(checkStartup(startup.replace('(6 meta-tools, ', '('), 10, 2), [10, 2, 10, 2]);
});

test('timeout issue includes Railway status and guidance; success closes it', async () => {
  const { github, issues } = fakeGithub();
  const original = github.paginate;
  github.rest.repos = { listCommitStatusesForRef() {} };
  github.paginate = async (method, args) => method === github.rest.repos.listCommitStatusesForRef
    ? [{ context: 'Strale - strale', state: 'failure', description: 'Build failed' }] : original(method, args);
  const context = { repo: {}, sha: a, runId: 1 };
  await assert.rejects(deploy(github, context, async () => ({ ok: false, served: b.slice(0, 12), waited: 1_200_000 })));
  assert.match(issues[0].body, /failure: Build failed/);
  assert.match(issues[0].body, /1200 seconds/);
  assert.match(issues[0].body, /Railway build email, deployment status/);
  assert.match(issues[0].body, new RegExp(a));
  await deploy(github, { ...context, runId: 2 }, async () => ({ ok: true, served: a.slice(0, 12), waited: 30000 }));
  assert.equal(issues[0].state, 'closed');
});
test('external watch fails only on the second failing run and closes on recovery', async () => {
  const { github, issues } = fakeGithub();
  let failing = true;
  const jobs = Object.entries(contract).map(([id, expected_interval_seconds]) => ({ ...good, id, expected_interval_seconds }));
  const read = async (url) => url.endsWith('/jobs') ? { jobs: jobs.map((j) => ({ ...j, ok: failing && j.id === 'retention' ? false : true })) } : { status: 'ok' };
  await production(github, { repo: {}, runId: 1 }, read);
  await assert.rejects(production(github, { repo: {}, runId: 2 }, read), /twice/);
  assert.equal(issues.length, 2);
  failing = false;
  await production(github, { repo: {}, runId: 3 }, read);
  assert.equal(issues[1].state, 'closed');
});
test('health request has the ten-second AbortSignal and handles no JSON', async () => {
  await assert.rejects(json('https://example.invalid', async (_url, options) => {
    assert.ok(options.signal instanceof AbortSignal);
    return { status: 200, json: async () => { throw new Error('invalid JSON'); } };
  }), /invalid JSON/);
});
test('workflow YAML is structurally valid and inline actions scripts parse', async () => {
  const { default: yaml } = await import('js-yaml');
  const { readdirSync } = await import('node:fs');
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const name of readdirSync('.github/workflows').filter((f) => f.endsWith('.yml'))) {
    const doc = yaml.load(readFileSync(`.github/workflows/${name}`, 'utf8'));
    assert.ok(doc.name && doc.on && doc.jobs, name);
    for (const job of Object.values(doc.jobs)) for (const step of job.steps ?? []) {
      if (step.uses?.startsWith('actions/github-script@') && step.with?.script && !step.with.script.includes('${{')) new AsyncFunction('github', 'context', 'core', 'require', step.with.script);
    }
  }
});

test('retry covers explicit main-push workflows but never arbitrary pushes or build bodies', () => {
  const jobs = [{ conclusion: 'failure', steps: [step('Run npm ci', 'failure')] }];
  for (const name of ['Verify production deploy', 'Coverage matrix validation']) assert.equal(mayRetry({ ...run, event: 'push', name }, jobs), true);
  assert.equal(mayRetry({ ...run, event: 'push', name: 'CI' }, jobs), false);
  assert.equal(mayRetry(run, [{ conclusion: 'failure', steps: [step('Build', 'failure')] }]), false);
});

test('a hanging probe is bounded by the remaining deploy budget', async () => {
  const result = await waitForDeploy({ expected: a, health: () => new Promise(() => {}), budget: 20 });
  assert.equal(result.ok, false);
  assert.ok(result.waited < 500);
});

test('published artefact probe calls a real free search, validates output and cleans isolation', async () => {
  const { probe, checkSearch } = await import('./package-probe.mjs');
  const { PassThrough } = await import('node:stream');
  const { existsSync } = await import('node:fs');
  let params; let searched = false; let closed = false;
  class Transport {
    stderr = new PassThrough();
    constructor(options) { params = options; }
    async close() { closed = true; }
  }
  class ClientClass {
    async connect(transport) { transport.stderr.write(startup); }
    async listTools() { return { tools: [{}] }; }
    async callTool(call) {
      assert.equal(call.name, 'strale_search'); searched = true;
      return { content: [{ type: 'text', text: '{"results":[{"slug":"example"}]}' }] };
    }
    async close() {}
  }
  const result = await probe({ Transport, ClientClass, read: async (url) => url.endsWith('capabilities') ? { capabilities: Array(10).fill({}) } : { solutions: Array(2).fill({}) } });
  assert.deepEqual(params.args, ['-y', 'strale-mcp@latest']);
  assert.notEqual(params.cwd, process.cwd());
  assert.equal(existsSync(params.cwd), false);
  assert.ok(searched && closed); assert.deepEqual(result.counts, [10, 2, 10, 2]);
  for (const search of [{ isError: true }, {}, { content: [] }, { content: [{ type: 'text', text: '{"results":[]}' }] }]) assert.throws(() => checkSearch(search));
  await assert.rejects(probe({ read: async () => ({}) }), /Empty live catalog/);
});

test('new monitoring workflows are reachable and use only the default token permissions', async () => {
  const { default: yaml } = await import('js-yaml');
  const specs = [
    ['deploy-verify', 'watch.mjs', 'deploy(github, context)', false],
    ['production-watch', 'watch.mjs', 'production(github, context)', true],
    ['package-contract', 'package-probe.mjs', 'packageContract(github, context)', true],
  ];
  for (const [file, script, invoke, scheduled] of specs) {
    const text = readFileSync(`.github/workflows/${file}.yml`, 'utf8');
    const doc = yaml.load(text);
    assert.equal(Boolean(doc.on.schedule?.length), scheduled);
    assert.match(text, new RegExp(script.replace('.', '\\.')));
    assert.ok(text.includes(invoke));
    if (file === 'deploy-verify') assert.deepEqual(doc.concurrency, { group: 'deploy-verify-main', 'cancel-in-progress': false });
    assert.equal(doc.permissions.contents, 'read'); assert.equal(doc.permissions.issues, 'write');
    assert.ok(!text.includes('secrets.'));
  }
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.ok(ci.includes('node scripts/production-watch/classify.mjs'));
});


test('retry also recognizes runner startup loss without running a body', () => {
  for (const conclusion of ['failure', 'timed_out', 'startup_failure']) {
    assert.equal(mayRetry({ ...run, conclusion }, [{ conclusion: 'startup_failure', steps: [] }]), true);
  }
});


test('completed deploy classification does not prevent a failed verify checkout retry', () => {
  const jobs = [
    { conclusion: 'success', steps: [step('Run actions/checkout@v4'), step('Classify changed files')] },
    { conclusion: 'failure', steps: [step('Run actions/checkout@v4', 'failure')] },
  ];
  const deployRun = { ...run, name: 'Verify production deploy', event: 'push' };
  assert.equal(mayRetry(deployRun, jobs), true);
  jobs[1].steps.push(step('Check production deploy'));
  assert.equal(mayRetry(deployRun, jobs), false);
});


test('closed retired jobs stay closed and green runs do not rewrite them', async () => {
  const { github, issues } = fakeGithub();
  issues.push({ title: '[production-watch] retired-job', number: 1, state: 'closed', body: 'unchanged' });
  const jobs = Object.entries(contract).map(([id, expected_interval_seconds]) => ({ ...good, id, expected_interval_seconds }));
  const read = async (url) => url.endsWith('/jobs') ? { jobs } : { status: 'ok' };
  await production(github, { repo: {}, runId: 1 }, read);
  await production(github, { repo: {}, runId: 2 }, read);
  assert.equal(issues.length, 1);
  await report(github, {}, { label: 'production-watch', id: 'retired-job', ok: true, run: 3 });
  assert.equal(issues[0].body, 'unchanged');
});

test('endpoint outages confirm a single inventory alarm, never individual jobs', async () => {
  for (const response of [null, { jobs: [] }]) {
    const { github, issues } = fakeGithub();
    const read = async (url) => {
      if (!url.endsWith('/jobs')) return { status: 'ok' };
      if (!response) throw new Error('unreachable');
      return response;
    };
    await production(github, { repo: {}, runId: 1 }, read);
    assert.deepEqual(issues.map((i) => i.title), ['[watch-state] production-watch']);
    await assert.rejects(production(github, { repo: {}, runId: 2 }, read));
    assert.deepEqual(issues.map((i) => i.title), ['[watch-state] production-watch', '[production-watch] job-inventory']);
  }
});

test('deploy resolves served short SHA before comparing ancestry', async () => {
  const { github } = fakeGithub();
  const resolved = [];
  github.rest.repos = {
    getCommit: async ({ ref }) => { resolved.push(ref); return { data: { sha: b } }; },
    compareCommits: async ({ base, head }) => {
      assert.equal(base.length, 40); assert.equal(head.length, 40);
      return { data: { status: 'ahead' } };
    },
  };
  await deploy(github, { repo: {}, sha: a, runId: 1 }, async ({ newer }) => {
    assert.equal(await newer(a, b.slice(0, 12)), true);
    assert.equal(await newer(b.slice(0, 12), c), true);
    return { ok: true, served: b.slice(0, 12), waited: 0 };
  });
  assert.deepEqual(resolved, [b.slice(0, 12), b.slice(0, 12)]);
});

test('MCP retries install/connect once but never retries a contract failure', async () => {
  const { probe } = await import('./package-probe.mjs');
  for (const failContract of [false, true]) {
    let connects = 0;
    class Transport {
      stderr = { on(_event, listener) { listener(startup); } };
      async close() {}
    }
    class ClientClass {
      async connect() { connects++; if (!failContract && connects === 1) throw new Error('install failed'); }
      async listTools() { return { tools: failContract ? [] : [{}] }; }
      async callTool() { return { content: [{ type: 'text', text: '{"results":[{}]}' }] }; }
      async close() {}
    }
    const options = { Transport, ClientClass, read: async (url) => url.endsWith('capabilities') ? { capabilities: Array(10).fill({}) } : { solutions: Array(2).fill({}) } };
    if (failContract) await assert.rejects(probe(options), /no tools/);
    else assert.deepEqual((await probe(options)).counts, [10, 2, 10, 2]);
    assert.equal(connects, failContract ? 1 : 2);
  }
  assert.throws(() => checkStartup(startup.replace('10 cap trust', '9 cap trust'), 10, 2), /cap trust=9, catalogue capabilities=10/);
});
