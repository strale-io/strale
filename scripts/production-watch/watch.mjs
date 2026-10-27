import { readFileSync } from "node:fs";
const EXPECTED_JOBS = JSON.parse(readFileSync(new URL("../../apps/api/src/lib/job-watch-contract.json", import.meta.url), "utf8"));
/** Credential-free public probes; GitHub client supplied by actions/github-script. */
export async function json(url, fetcher = fetch, timeout = 10_000) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'Strale/1.0 (+https://strale.dev)', 'Cache-Control': 'no-cache' } });
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function bounded(task, remaining) {
  if (remaining <= 0) throw new Error('Deploy budget exhausted');
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(task), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Probe deadline exceeded')), Math.min(10_000, remaining));
    })]);
  } finally { clearTimeout(timer); }
}

export async function waitForDeploy({ expected, health, head, newer, now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), budget = 1_200_000 }) {
  if (!/^[a-f0-9]{40}$/.test(expected)) throw new Error('Missing expected commit');
  const start = now();
  let served = null;
  const read = (task) => bounded(task, budget - (now() - start));
  while (now() - start < budget) {
    try {
      served = (await read(health)).commit;
      if (/^[a-f0-9]{12}$/.test(served ?? '')) {
        if (expected.startsWith(served)) return { ok: true, served, waited: now() - start };
        const latest = await read(head);
        // Compare history, not string order: production must be a descendant
        // of this push AND an ancestor of current main (intermediate deploys count).
        if (latest.startsWith(served) && await read(() => newer(expected, latest))) return { ok: true, served, waited: now() - start };
        if (await read(() => newer(expected, served)) && await read(() => newer(served, latest))) return { ok: true, served, waited: now() - start };
      }
    } catch { /* A transient health/GitHub failure consumes the same budget. */ }
    await sleep(Math.min(30_000, Math.max(0, budget - (now() - start))));
  }
  return { ok: false, served, waited: now() - start };
}

export async function ensureLabel(github, repo, name) {
  try { await github.rest.issues.getLabel({ ...repo, name }); }
  catch (error) {
    if (error.status !== 404) throw error;
    try { await github.rest.issues.createLabel({ ...repo, name, color: 'b60205' }); }
    catch (e) { if (e.status !== 422) throw e; }
  }
}

/** Pending counters share one rolling state issue; per-signal issues are
 * created only after confirmation. Workflow concurrency serializes writers. */
export async function report(github, repo, input) {
  const signals = Array.isArray(input) ? input : [input];
  const issues = await github.paginate(github.rest.issues.listForRepo, { ...repo, state: 'all', creator: 'github-actions[bot]', per_page: 100 });
  const stateTitle = '[watch-state] production-watch';
  const stateIssue = issues.find((i) => !i.pull_request && i.title === stateTitle);
  const match = /<!-- watch-state:(.*?) -->/.exec(stateIssue?.body ?? '');
  const state = match ? JSON.parse(match[1]) : {};
  let changed = false, red = false;
  for (const { label, id, ok, body, run, threshold = 1 } of signals) {
    const title = `[${label}] ${id}`;
    const issue = issues.find((i) => !i.pull_request && i.title === title);
    let count = ok ? 0 : 1;
    if (threshold > 1) {
      const key = `${label}:${id}`;
      const previous = state[key];
      count = ok ? 0 : previous?.run === String(run) ? previous.count : (previous?.count ?? 0) + 1;
      if (ok && previous) { delete state[key]; changed = true; }
      if (!ok && previous?.run !== String(run)) { state[key] = { count, run: String(run) }; changed = true; }
    }
    const alert = count >= threshold;
    if (ok && (!issue || issue.state === 'closed') || !ok && !alert) continue;
    await ensureLabel(github, repo, label);
    const data = { ...repo, title, body: `<!-- watch:${count}:${run} -->\n${ok ? 'Recovered' : 'Confirmed failure'}\n\n${body}`, labels: [label] };
    if (issue) await github.rest.issues.update({ ...data, issue_number: issue.number, state: ok ? 'closed' : 'open' });
    else await github.rest.issues.create(data);
    red ||= !ok && alert;
  }
  if (changed) {
    const data = { ...repo, title: stateTitle, body: `<!-- watch-state:${JSON.stringify(state)} -->\nRolling pending failure counters. Per-job issues open only after confirmation.` };
    if (stateIssue) await github.rest.issues.update({ ...data, issue_number: stateIssue.number });
    else await github.rest.issues.create(data);
  }
  return red;
}

export async function deploy(github, context, wait = waitForDeploy) {
  const repo = context.repo;
  const result = await wait({ expected: context.sha,
    health: () => json('https://api.strale.io/health'),
    head: async () => (await github.rest.repos.getCommit({ ...repo, ref: 'main', request: { timeout: 10_000 } })).data.sha,
    newer: async (base, head) => {
      const resolve = async (ref) => ref.length === 12
        ? (await github.rest.repos.getCommit({ ...repo, ref, request: { timeout: 10_000 } })).data.sha : ref;
      const [fullBase, fullHead] = await Promise.all([resolve(base), resolve(head)]);
      return ['ahead', 'identical'].includes((await github.rest.repos.compareCommits({ ...repo, base: fullBase, head: fullHead, request: { timeout: 10_000 } })).data.status);
    },
  });
  let status = 'not queried (deploy live)';
  if (!result.ok) {
    try {
      const statuses = await github.paginate(github.rest.repos.listCommitStatusesForRef, { ...repo, ref: context.sha, per_page: 100, request: { timeout: 10_000 } });
      const railway = statuses.find((s) => s.context === 'Strale - strale');
      status = railway ? `${railway.state}: ${railway.description}` : 'Strale - strale: absent';
    } catch (error) { status = `status unavailable: HTTP ${error.status ?? 'unknown'}`; }
  }
  await report(github, repo, { label: 'deploy-not-live', id: 'Production deploy', ok: result.ok, run: context.runId,
    body: `Expected commit: ${context.sha}\nProduction commit: ${result.served ?? 'unavailable'}\nWaited: ${Math.round(result.waited / 1000)} seconds (20-minute budget).\nStrale - strale: ${status}\nCheck the Railway build email, deployment status, and commit status Strale - strale on this SHA.` });
  if (!result.ok) throw new Error('Deploy did not reach production within 20 minutes');
  return result;
}

export function failingJobs(data) {
  if (!Array.isArray(data?.jobs) || !data.jobs.length) throw new Error('Empty job inventory');
  const ids = new Set();
  for (const job of data.jobs) {
    if (!/^[a-z][a-z0-9-]+$/.test(job.id) || ids.has(job.id) || typeof job.ok !== 'boolean' ||
        !Number.isFinite(job.expected_interval_seconds) || job.expected_interval_seconds <= 0 ||
        !(job.last_success_age_seconds === null || Number.isFinite(job.last_success_age_seconds) && job.last_success_age_seconds >= 0) ||
        job.ok && job.last_success_age_seconds !== null && job.last_success_age_seconds > job.expected_interval_seconds * 3) throw new Error('Invalid job inventory');
    ids.add(job.id);
  }
  for (const [id, interval] of Object.entries(EXPECTED_JOBS)) {
    if (!data.jobs.some((j) => j.id === id && j.expected_interval_seconds === interval)) throw new Error("Missing expected job");
  }
  return data.jobs;
}

export async function production(github, context, read = json) {
  const signals = [];
  try {
    const health = await read('https://api.strale.io/health');
    signals.push({ id: 'http-health', ok: health.status === 'ok' });
  } catch { signals.push({ id: 'http-health', ok: false }); }
  try {
    const jobs = failingJobs(await read('https://api.strale.io/health/jobs'));
    signals.push({ id: 'job-inventory', ok: true }, ...jobs);
    // A removed entry cannot silently close its alarm or evade the check.
    const issues = await github.paginate(github.rest.issues.listForRepo, { ...context.repo, state: 'open', creator: 'github-actions[bot]', per_page: 100 });
    for (const issue of issues) {
      const id = /^\[production-watch\] ([a-z][a-z0-9-]+)$/.exec(issue.title)?.[1];
      if (issue.state === 'open' && id && !signals.some((s) => s.id === id)) signals.push({ id, ok: false });
    }
  } catch { signals.push({ id: 'job-inventory', ok: false }); }
  const red = await report(github, context.repo, signals.map((signal) => ({
    ...signal, label: 'production-watch', run: context.runId, threshold: 2,
    body: `${signal.id}: ${signal.ok ? 'fresh' : 'unavailable or stale'}. Check /health and /health/jobs.`,
  })));
  if (red) throw new Error('Production probe failed twice consecutively');
}
