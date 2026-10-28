/** Conservative retry: only failed preparation steps, with no body ever started.
 * Network failures INSIDE a probe/test are real and never retried here. */
const PREPARATION = /^(Set up job|Initialize containers|Set up runner|Run actions\/checkout@v\d+|Checkout(?: .*)?|Run actions\/setup-node@v\d+|Setup Node(?: .*)?|Run npm ci|Install dependencies)$/i;
const TEARDOWN = /^(Post |Complete job$|Stop containers$)/;
export function mayRetry(run, jobs) {
  const allowedEvent = ['schedule', 'workflow_dispatch'].includes(run.event) ||
    run.event === 'push' && ['Verify production deploy', 'Coverage matrix validation'].includes(run.name);
  if (!['failure', 'timed_out', 'startup_failure'].includes(run.conclusion) ||
      run.run_attempt !== 1 || !allowedEvent || !jobs.length) return false;
  const harmless = (name) => PREPARATION.test(name) || TEARDOWN.test(name) ||
    run.name === 'Verify production deploy' && name === 'Classify changed files';
  const failed = jobs.filter((j) => ['failure', 'timed_out', 'startup_failure'].includes(j.conclusion));
  if (!failed.length) return false;
  return failed.every((job) => {
    const steps = job.steps ?? [];
    const bad = steps.find((s) => ['failure', 'timed_out'].includes(s.conclusion));
    // No steps at all plus runner loss is safe: no body could have run.
    if (!steps.length) return job.conclusion === 'startup_failure';
    if (!bad || !PREPARATION.test(bad.name)) return false;
    return steps.every((s) => s.conclusion === 'skipped' || !s.started_at || harmless(s.name));
  }) && jobs.every((j) => (j.steps ?? []).every((s) => s.conclusion === 'skipped' || !s.started_at || harmless(s.name)));
}
export async function retry(github, context) {
  const run = context.payload.workflow_run;
  if (run.head_repository?.full_name !== `${context.repo.owner}/${context.repo.repo}` || run.head_branch !== 'main') return false;
  const jobs = await github.paginate(github.rest.actions.listJobsForWorkflowRunAttempt, { ...context.repo, run_id: run.id, attempt_number: run.run_attempt, per_page: 100 });
  if (!mayRetry(run, jobs)) return false;
  await github.rest.actions.reRunWorkflowFailedJobs({ ...context.repo, run_id: run.id });
  return true;
}
