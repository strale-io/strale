import { rateLimitByIp } from "../lib/rate-limit.js";
import { Hono } from "hono";
import { readJobFreshness, type JobFreshness } from "../lib/job-heartbeats.js";

export function createHealthJobsRoute(read: () => Promise<JobFreshness[]> = readJobFreshness) {
  const route = new Hono();
  let cached: { jobs: JobFreshness[]; expires: number } | undefined;
  let pending: Promise<JobFreshness[]> | undefined;
  const load = () => {
    if (cached && Date.now() < cached.expires) return Promise.resolve(cached.jobs);
    pending ??= read().then((rows) => {
      // Explicit allowlist: private properties never reach the wire.
      const jobs = rows.map(({ id, ok, last_success_age_seconds, expected_interval_seconds }) =>
        ({ id, ok, last_success_age_seconds, expected_interval_seconds }));
      cached = { jobs, expires: Date.now() + 30_000 };
      return jobs;
    }).catch(() => {
      cached = { jobs: [], expires: Date.now() + 30_000 };
      return [];
    }).finally(() => { pending = undefined; });
    return pending;
  };
  route.get("/", rateLimitByIp(6, 60_000), async (c) => {
    c.header("Cache-Control", "no-store");
    const jobs = await load();
    return c.json({ jobs }, jobs.length ? 200 : 503);
  });
  return route;
}
