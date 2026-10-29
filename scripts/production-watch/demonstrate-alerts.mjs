#!/usr/bin/env node
/**
 * H1 exit evidence: every production watch fires on a forced mismatch.
 *
 * Runs the real alerting code of each watch against a forced bad input, up to
 * the delivery call, with only the edges faked:
 *   - deploy SHA check: deploy() + the real waitForDeploy, production serving
 *     a commit that is neither the push nor a descendant of it;
 *   - job freshness: production() over two runs with one job stale;
 *   - strale-mcp contract: packageContract() with the published package
 *     reporting "0 cap trust";
 *   - x402 volume watch and bus delivery: the vitest file
 *     apps/api/src/jobs/x402-alert-delivery.e2e.test.ts.
 * Delivery for the first three is a GitHub issue (actions/github-script's
 * client); a recording fake stands in for it, so no issue is opened. Then it
 * reads the public production endpoints once to show today's healthy values.
 * Nothing here writes to production.
 *
 * Usage: node scripts/production-watch/demonstrate-alerts.mjs [--offline] > out.json
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deploy, waitForDeploy, production, json } from './watch.mjs';
import { packageContract } from './package-probe.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONTRACT = JSON.parse(readFileSync(new URL('../../apps/api/src/lib/job-watch-contract.json', import.meta.url), 'utf8'));
const EXPECTED = 'a'.repeat(40), OLD = 'b'.repeat(40), MAIN = 'c'.repeat(40);

/** Records every issue write the watches make, the way actions/github-script's client would receive them. */
export function recordingGithub() {
  const issues = []; const labels = new Set();
  const github = {
    paginate: async (method, args) => method === github.rest.repos.listCommitStatusesForRef
      ? [{ context: 'Strale - strale', state: 'success', description: 'Deployment succeeded' }]
      : issues.filter((i) => args?.state !== 'open' || i.state === 'open'),
    rest: {
      issues: {
        listForRepo() {},
        getLabel: async ({ name }) => { if (!labels.has(name)) throw Object.assign(new Error('nf'), { status: 404 }); },
        createLabel: async ({ name }) => { labels.add(name); },
        create: async (data) => { issues.push({ ...data, number: issues.length + 1, state: 'open' }); },
        update: async (data) => { Object.assign(issues.find((i) => i.number === data.issue_number), data); },
      },
      repos: {
        listCommitStatusesForRef() {},
        getCommit: async ({ ref }) => ({ data: { sha: ref === 'main' ? MAIN : [EXPECTED, OLD, MAIN].find((s) => s.startsWith(ref)) } }),
        // OLD is behind the push; MAIN is ahead of it.
        compareCommits: async ({ base, head }) => ({ data: { status: base === head ? 'identical' : base === OLD || head === MAIN ? 'ahead' : 'behind' } }),
      },
    },
  };
  return { github, issues };
}

const alertsOf = (issues) => issues.filter((i) => !i.title.startsWith('[watch-state]') && i.state === 'open')
  .map((i) => ({ title: i.title, labels: i.labels, body: i.body }));

async function runDeploy(served) {
  const { github, issues } = recordingGithub();
  let clock = 0;
  // The real waitForDeploy and history comparison; only health and the clock are forced.
  const wait = (args) => waitForDeploy({ ...args, health: async () => ({ commit: served.slice(0, 12) }),
    now: () => clock, sleep: async (ms) => { clock += ms; } });
  let thrown = null;
  try { await deploy(github, { repo: { owner: 'o', repo: 'r' }, sha: EXPECTED, runId: 1 }, wait); } catch (e) { thrown = e.message; }
  return { thrown, alerts: alertsOf(issues) };
}

export async function deployMismatch() {
  const bad = await runDeploy(OLD);
  // Positive control: production on a descendant of the push (current main) is live, no alert.
  const good = await runDeploy(MAIN);
  const fired = /did not reach production/.test(bad.thrown ?? '') && bad.alerts.length === 1 &&
    bad.alerts[0].body.includes(`Production commit: ${OLD.slice(0, 12)}`) && good.thrown === null && good.alerts.length === 0;
  return { watch: 'deploy-sha', forced: `production serves ${OLD.slice(0, 12)}, push is ${EXPECTED.slice(0, 12)}`, fired,
    workflow_failed: bad.thrown, alerts: bad.alerts, control: { served: MAIN.slice(0, 12), workflow_failed: good.thrown, alerts: good.alerts.length } };
}

export async function staleJob() {
  const { github, issues } = recordingGithub();
  const [staleId, interval] = Object.entries(CONTRACT)[0];
  const read = async (url) => url.endsWith('/jobs')
    ? { jobs: Object.entries(CONTRACT).map(([id, expected_interval_seconds]) => id === staleId
        ? { id, ok: false, expected_interval_seconds, last_success_age_seconds: interval * 4 }
        : { id, ok: true, expected_interval_seconds, last_success_age_seconds: 1 }) }
    : { status: 'ok' };
  const runs = [];
  for (const runId of [1, 2]) {
    try { await production(github, { repo: { owner: 'o', repo: 'r' }, runId }, read); runs.push({ run: runId, red: false, alerts: alertsOf(issues).length }); }
    catch (e) { runs.push({ run: runId, red: true, error: e.message, alerts: alertsOf(issues).length }); }
  }
  return { watch: 'job-freshness', forced: `${staleId} last succeeded ${interval * 4}s ago (interval ${interval}s)`, runs,
    fired: runs[0].red === false && runs[0].alerts === 0 && runs[1].red === true &&
      alertsOf(issues).length === 1 && alertsOf(issues)[0].title === `[production-watch] ${staleId}`, alerts: alertsOf(issues) };
}

async function runMcp(capTrust) {
  const { github, issues } = recordingGithub();
  const startup = `[strale-mcp] Loaded 10 capabilities, 2 solutions, ${capTrust} cap trust, 2 sol trust from https://api.strale.io\n`;
  class Transport { stderr = { on(_e, listener) { listener(startup); } }; async close() {} }
  class ClientClass {
    async connect() {}
    async listTools() { return { tools: [{}] }; }
    async callTool() { return { content: [{ type: 'text', text: '{"results":[{"slug":"x"}]}' }] }; }
    async close() {}
  }
  const read = async (url) => url.endsWith('capabilities') ? { capabilities: Array(10).fill({}) } : { solutions: Array(2).fill({}) };
  let thrown = null;
  try { await packageContract(github, { repo: { owner: 'o', repo: 'r' }, runId: 1 }, { Transport, ClientClass, read }); } catch (e) { thrown = e.message; }
  return { thrown, alerts: alertsOf(issues) };
}

export async function mcpContractMismatch() {
  const bad = await runMcp(0);
  const good = await runMcp(10); // positive control: a consistent package opens nothing
  const fired = /cap trust=0, catalogue capabilities=10/.test(bad.thrown ?? '') && bad.alerts.length === 1 &&
    good.thrown === null && good.alerts.length === 0;
  return { watch: 'mcp-contract', forced: 'published package reports 0 cap trust against a 10-capability catalogue', fired,
    workflow_failed: bad.thrown, alerts: bad.alerts, control: { cap_trust: 10, workflow_failed: good.thrown, alerts: good.alerts.length } };
}

export function x402AndBus() {
  let report;
  try {
    const out = execFileSync('npx', ['vitest', 'run', 'src/jobs/x402-alert-delivery.e2e.test.ts', '--reporter=json'],
      { cwd: `${ROOT}apps/api`, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    report = JSON.parse(out.slice(out.indexOf('{"numTotalTestSuites"')));
  } catch (e) {
    return { watch: 'x402-volume+bus', fired: false, error: e.message.split('\n')[0] };
  }
  const tests = report.testResults.flatMap((f) => f.assertionResults.map((t) => ({ name: t.title, status: t.status })));
  return { watch: 'x402-volume+bus', source: 'apps/api/src/jobs/x402-alert-delivery.e2e.test.ts', fired: report.success && tests.length === 4, tests };
}

export async function liveReads(read = json) {
  const out = {};
  for (const [key, url] of [['health', 'https://api.strale.io/health'], ['jobs', 'https://api.strale.io/health/jobs']]) {
    try { out[key] = await read(url); } catch (e) { out[key] = { error: e.message }; }
  }
  try {
    const [caps, sols] = await Promise.all([read('https://api.strale.io/v1/capabilities'), read('https://api.strale.io/v1/solutions')]);
    out.catalogue = { capabilities: caps.capabilities?.length ?? null, solutions: sols.solutions?.length ?? null };
  } catch (e) { out.catalogue = { error: e.message }; }
  const jobs = Array.isArray(out.jobs?.jobs) ? out.jobs.jobs : [];
  return {
    production_commit: out.health?.commit ?? null,
    health_status: out.health?.status ?? null,
    jobs_total: jobs.length,
    jobs_not_ok: jobs.filter((j) => !j.ok).map((j) => j.id),
    jobs_missing_from_contract: Object.keys(CONTRACT).filter((id) => !jobs.some((j) => j.id === id)),
    catalogue: out.catalogue,
  };
}

export async function demonstrate({ offline = false } = {}) {
  const demos = [await deployMismatch(), await staleJob(), await mcpContractMismatch(), x402AndBus()];
  const live = offline ? null : await liveReads();
  const failures = demos.filter((d) => !d.fired).map((d) => `${d.watch} did not fire`);
  return { ok: failures.length === 0, failures, warnings: [], watches_demonstrated: demos.length, watches_fired: demos.length - failures.length, demos, live };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await demonstrate({ offline: process.argv.includes('--offline') });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
