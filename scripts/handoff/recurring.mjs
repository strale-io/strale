// The recurring-work due-list (docs/company/RECURRING.yaml): validation and the
// overdue rule, shared by session orientation and its test. Pure functions; the
// caller parses the YAML and supplies today's date.

const RUNS_AS = new Set(["api-job", "github-action", "due-list"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dayNumber(iso) {
  if (!DATE.test(iso)) return null;
  const ms = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== iso) return null;
  return Math.round(ms / 86_400_000);
}

// YAML parses an unquoted 2026-11-01 as a string in the yaml package's default
// (core) schema, but a Date under yaml-1.1; accept both.
function isoOf(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  return typeof value === "string" ? value : null;
}

// todayIso is optional: given, a last_run in the future is refused, because
// it would silence the job until that date.
export function validateRecurring(doc, todayIso) {
  const today = todayIso === undefined ? null : dayNumber(todayIso);
  const problems = [];
  if (!doc || doc.version !== 1 || !Array.isArray(doc.jobs)) return ["RECURRING.yaml must have version: 1 and a jobs list"];
  const seen = new Set();
  doc.jobs.forEach((job, index) => {
    const at = `jobs[${index}]${job?.id ? ` (${job.id})` : ""}`;
    if (!job || typeof job.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(job.id)) { problems.push(`${at}: id must be kebab-case`); return; }
    if (seen.has(job.id)) problems.push(`${at}: duplicate id`);
    seen.add(job.id);
    if (typeof job.title !== "string" || !job.title.trim()) problems.push(`${at}: title is required`);
    if (!RUNS_AS.has(job.runs_as)) problems.push(`${at}: runs_as must be one of ${[...RUNS_AS].join(", ")}`);
    if (job.runs_as === "due-list") {
      if (!Number.isInteger(job.cadence_days) || job.cadence_days < 1) problems.push(`${at}: cadence_days must be a whole number of days, at least 1`);
      const last = dayNumber(isoOf(job.last_run) ?? "");
      if (last === null) problems.push(`${at}: last_run must be a YYYY-MM-DD date`);
      else if (today !== null && last > today) problems.push(`${at}: last_run ${isoOf(job.last_run)} is in the future, which would hide the job until then`);
      if (typeof job.procedure !== "string" || !job.procedure.trim()) problems.push(`${at}: procedure (the file that says how to run it) is required`);
    } else {
      if (typeof job.where !== "string" || !job.where.trim()) problems.push(`${at}: where (the job or workflow) is required`);
      if (job.last_run !== undefined) problems.push(`${at}: only due-list rows carry last_run; ${job.runs_as} runs are tracked by the job itself`);
    }
  });
  return problems;
}

// A due-list job is due once cadence_days have passed since last_run: a daily
// job last run yesterday is due today.
export function overdueJobs(doc, todayIso) {
  const today = dayNumber(todayIso);
  if (today === null) throw new Error(`today must be YYYY-MM-DD, got ${todayIso}`);
  const due = [];
  for (const job of Array.isArray(doc?.jobs) ? doc.jobs : []) {
    if (job?.runs_as !== "due-list") continue;
    const lastIso = isoOf(job.last_run);
    const last = dayNumber(lastIso ?? "");
    if (last === null || !Number.isInteger(job.cadence_days)) continue;
    const daysSince = today - last;
    if (daysSince >= job.cadence_days) due.push({ id: job.id, title: job.title, lastRun: lastIso, daysSince, cadenceDays: job.cadence_days, procedure: job.procedure });
  }
  return due.sort((a, b) => b.daysSince / b.cadenceDays - a.daysSince / a.cadenceDays);
}

// Swedish calendar date (CLAUDE.md: times for Petter are Europe/Stockholm).
export function stockholmToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
