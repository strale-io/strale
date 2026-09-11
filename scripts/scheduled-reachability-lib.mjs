/**
 * Scheduled mechanism reachability (T6 M3 batch 5, review round 1 fixes).
 *
 * config/scheduled-mechanisms.yaml declares every scheduled mechanism that
 * runs a repository script -- a step inside a .github/workflows/*.yml job
 * with an `on.schedule` cron trigger -- plus non-repository scheduled
 * mechanisms (the Railway digest cron) recorded as verifiable: false. This
 * library parses every workflow file with the `yaml` package (never a
 * regex over the raw text) and checks the register against it in both
 * directions: every declared entry must resolve to a real, scheduled,
 * script-invoking step with the secrets it claims (MECHANISM_*), and every
 * scheduled step that invokes a repository script must be declared
 * (SCHEDULED_STEP_UNDECLARED). Nothing here changes what any workflow
 * does -- it only proves the wiring DEC-20260504-C requires be verified,
 * not assumed.
 *
 * Working-directory resolution (review finding 1): a step's starting
 * directory is resolved from, in order, the step's own `working-directory`,
 * the job's `defaults.run.working-directory`, the workflow's
 * `defaults.run.working-directory`, else the repository root. Every `cd`
 * in the run command is then applied in order, across `&&`, `;` and line
 * breaks, on top of that starting directory. A `cd` to an absolute path,
 * `$VAR`, or anything else that isn't a plain relative path is
 * RUN_UNPARSEABLE, never guessed at.
 *
 * No silent drops (review finding 2): an argument to a known runner
 * (`node`, `npx tsx`) that looks like a script file and does not resolve to
 * an existing repository file is RUN_SCRIPT_UNRESOLVED, naming the step and
 * the path it tried -- it used to be silently excluded from the
 * completeness rule instead.
 *
 * Other runners (review finding 3): a token that resolves to an existing
 * repository file with a script extension, run by anything (`bash`, `sh`,
 * `python3`, a direct `./x.sh`), needs a register entry too, so the
 * completeness rule (SCHEDULED_STEP_UNDECLARED) covers it. A command that
 * invokes nothing in the repository (`npx tsc -b` in the sibling
 * strale-frontend checkout, `gh`, `git`) is out of scope by this same
 * general rule -- no runner name is special-cased to exclude it.
 *
 * See archive/sessions/2026-09-11-m3-remaining-scope-inventory.md section 4
 * for the survey this register was populated from.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import Ajv2020 from "ajv/dist/2020.js";
import { repoRootFrom } from "./program-tracks-lib.mjs";

export { repoRootFrom };

export const REGISTER_PATH = "config/scheduled-mechanisms.yaml";
export const SCHEMA_PATH = "config/scheduled-mechanisms.schema.json";
export const WORKFLOWS_DIR = ".github/workflows";

const SECRET_ENV_RE = /^\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}$/;
const KNOWN_RUNNERS = ["npx tsx", "node"];
const OTHER_RUNNERS = ["bash", "sh", "python3"];
const KNOWN_SCRIPT_EXT_RE = /\.(mjs|js|cjs|ts|mts)$/;
const OTHER_SCRIPT_EXT_RE = /\.(mjs|js|cjs|ts|mts|sh|py)$/;
const CD_RE = /^cd\s+("([^"]+)"|'([^']+)'|(\S+))/;
const RUNNER_RE = /(?:^|\|)\s*(npx tsx|node|bash|sh|python3)\s+(\S+)/;
const DIRECT_RE = /(?:^|\|)\s*(\.\/\S+)/;

// ── loading ──────────────────────────────────────────────────────────────

export function loadSchema(root) {
  return JSON.parse(readFileSync(resolve(root, SCHEMA_PATH), "utf8"));
}

export function loadRegister(root) {
  return parseYaml(readFileSync(resolve(root, REGISTER_PATH), "utf8"));
}

/** Schema-valid register only (findings otherwise). Mirrors vendors-lib.mjs's checkSchema shape. */
export function checkSchema(root) {
  const findings = [];
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schema = loadSchema(root);
  const validate = ajv.compile(schema);
  const register = loadRegister(root);
  const ok = validate(register);
  if (!ok) {
    for (const err of validate.errors ?? []) {
      findings.push({
        code: "SCHEMA_INVALID",
        file: REGISTER_PATH,
        detail: `${err.instancePath || "(root)"} ${err.message}`,
      });
    }
  }
  return { findings, register: ok ? register : null, valid: ok };
}

export function isVerifiable(mechanism) {
  return mechanism.verifiable !== false;
}

// ── workflow parsing ─────────────────────────────────────────────────────

export function listWorkflowFiles(root) {
  const dir = resolve(root, WORKFLOWS_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => `${WORKFLOWS_DIR}/${f}`)
    .sort();
}

/**
 * Parses one workflow file. Returns { ok: true, workflow } or
 * { ok: false, finding } -- never throws, and never silently returns an
 * empty workflow on a parse failure (WORKFLOWS_UNREADABLE, "never skip").
 */
export function parseWorkflowFile(root, relPath) {
  const absolute = resolve(root, relPath);
  if (!existsSync(absolute)) {
    return { ok: false, finding: { code: "WORKFLOWS_UNREADABLE", file: relPath, detail: "workflow file does not exist" } };
  }
  let text;
  try {
    text = readFileSync(absolute, "utf8");
  } catch (err) {
    return { ok: false, finding: { code: "WORKFLOWS_UNREADABLE", file: relPath, detail: `could not read file: ${err.message}` } };
  }
  let workflow;
  try {
    workflow = parseYaml(text);
  } catch (err) {
    return { ok: false, finding: { code: "WORKFLOWS_UNREADABLE", file: relPath, detail: `could not parse YAML: ${err.message}` } };
  }
  if (!workflow || typeof workflow !== "object") {
    return { ok: false, finding: { code: "WORKFLOWS_UNREADABLE", file: relPath, detail: "parsed workflow is not an object" } };
  }
  return { ok: true, workflow };
}

/** True when the parsed workflow has at least one `on.schedule` cron entry. */
export function hasScheduleTrigger(workflow) {
  const on = workflow?.on;
  if (!on || typeof on !== "object" || Array.isArray(on)) return false;
  const schedule = on.schedule;
  return Array.isArray(schedule) && schedule.length > 0;
}

/** Every step of every job, each tagged with its job id and job object for diagnostics and env lookups. */
export function allSteps(workflow) {
  const steps = [];
  for (const [jobId, job] of Object.entries(workflow?.jobs ?? {})) {
    for (const step of job?.steps ?? []) {
      steps.push({ jobId, job, step });
    }
  }
  return steps;
}

function stepLabel(step) {
  if (step?.id) return `"${step.id}"`;
  if (step?.name) return `"${step.name}"`;
  return "(unnamed)";
}

// ── working-directory resolution (review finding 1) ─────────────────────

/** True for a `cd` target this can resolve without guessing: no absolute path, no `~`, no shell variable, no shell metacharacters. */
function isPlainRelativeDir(dir) {
  if (typeof dir !== "string" || dir.length === 0) return false;
  if (dir.startsWith("/")) return false;
  if (dir.startsWith("~")) return false;
  if (/\$/.test(dir)) return false;
  return /^[A-Za-z0-9_.][A-Za-z0-9_./-]*$/.test(dir);
}

/**
 * Resolves a step's starting directory: the step's own `working-directory`,
 * else the job's `defaults.run.working-directory`, else the workflow's
 * `defaults.run.working-directory`, else the repository root. Returns
 * { ok: true, cwd } or { ok: false, reason } -- never a guess when the
 * declared value isn't a plain relative path.
 */
export function resolveWorkingDirectory(workflow, job, step) {
  const candidates = [step?.["working-directory"], job?.defaults?.run?.["working-directory"], workflow?.defaults?.run?.["working-directory"]];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (!isPlainRelativeDir(trimmed)) {
      return { ok: false, reason: `working-directory "${trimmed}" is not a plain relative path` };
    }
    return { ok: true, cwd: trimmed.replace(/\/+$/, "") };
  }
  return { ok: true, cwd: "" };
}

// ── run-command resolution ──────────────────────────────────────────────

/** Collapses `.` and `..` segments (e.g. "from-job-default/.." -> ""), so a `cd ..` genuinely returns to the parent instead of leaving a literal ".." in the resolved path string. */
function normalizePosix(p) {
  const out = [];
  for (const part of p.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else out.push("..");
    } else {
      out.push(part);
    }
  }
  return out.join("/");
}

function posixJoin(a, b) {
  if (!a) return normalizePosix(b.replace(/^\.\//, ""));
  const left = a.replace(/\/+$/, "");
  const right = b.replace(/^\.\//, "").replace(/^\/+/, "");
  return normalizePosix(`${left}/${right}`);
}

function splitSegments(line) {
  return line
    .split(/&&|;/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Finds at most one runner invocation in a shell segment (a `cd` has
 * already been stripped out by the caller). Returns null when the segment
 * invokes nothing recognised, { unparseable: true, reason } when it invokes
 * a known runner with an unresolvable (shell-variable) script path, or
 * { unparseable: false, kind, tool, scriptArg } otherwise. `kind` is
 * "known" for node / npx tsx (subject to RUN_SCRIPT_UNRESOLVED) or "other"
 * for bash / sh / python3 / a direct `./x.sh` (completeness-only, per
 * review finding 3 -- a missing script under one of these is out of scope,
 * not an error).
 */
function detectInvocation(segment) {
  const runnerMatch = segment.match(RUNNER_RE);
  const directMatch = segment.match(DIRECT_RE);
  let tool;
  let scriptArg;
  if (runnerMatch && (!directMatch || runnerMatch.index <= directMatch.index)) {
    tool = runnerMatch[1];
    scriptArg = runnerMatch[2];
  } else if (directMatch) {
    tool = "direct";
    scriptArg = directMatch[1];
  } else {
    return null;
  }

  if (scriptArg.startsWith("-")) return null; // a flag (`node -e`, `node --version`), not a script path

  if (KNOWN_RUNNERS.includes(tool)) {
    if (/\$/.test(scriptArg)) return { unparseable: true, reason: `script path contains an unresolvable shell variable: ${scriptArg}` };
    if (!KNOWN_SCRIPT_EXT_RE.test(scriptArg)) return null; // not shaped like a script file -- not this rule's concern
    return { unparseable: false, kind: "known", tool, scriptArg };
  }

  if (OTHER_RUNNERS.includes(tool) || tool === "direct") {
    if (/\$/.test(scriptArg)) return null; // out of scope: review finding 3 only requires detecting a token that RESOLVES
    if (!OTHER_SCRIPT_EXT_RE.test(scriptArg)) return null;
    return { unparseable: false, kind: "other", tool, scriptArg };
  }

  return null;
}

/**
 * Resolves the repository scripts a step's `run:` command invokes, given
 * the step's already-resolved starting directory (see
 * resolveWorkingDirectory). Tracks every `cd <dir>` in order, across `&&`,
 * `;` and line breaks (the same shell session persists a cd across a
 * multi-line `run: |` block, since GitHub Actions runs the whole block as
 * one shell script) -- so `cd a && cd b && npx tsx x.ts` resolves under
 * `a/b`. Returns a list of invocation descriptors:
 *   - { unparseable: true, reason, rawLine } for a `cd` or a known runner's
 *     script path this cannot resolve statically -- surfaced by the caller
 *     as RUN_UNPARSEABLE, never silently dropped.
 *   - { unparseable: false, kind: "known" | "other", tool, scriptArg,
 *       scriptPath, absolute, rawLine } for every resolvable invocation.
 *     `scriptPath` is null when `absolute` is true (an absolute script
 *     path never resolves against a working directory).
 * A `cd` whose target isn't resolvable poisons the REST OF THAT LINE only
 * (matching one shell command's worth of `&&`-chained state); a later line
 * still resolves against the last successfully-established directory,
 * mirroring the discipline already proven on this function before this
 * fix.
 */
export function resolveStepInvocations(step, startCwd = "") {
  if (typeof step?.run !== "string") return [];
  const lines = step.run.split("\n");
  const invocations = [];
  let cwd = startCwd;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    let poisoned = false;
    for (const segment of splitSegments(line)) {
      if (poisoned) break;
      const cdMatch = segment.match(CD_RE);
      if (cdMatch) {
        const dir = cdMatch[2] ?? cdMatch[3] ?? cdMatch[4];
        if (!isPlainRelativeDir(dir)) {
          invocations.push({ unparseable: true, reason: `cd target is not a plain relative path: ${dir}`, rawLine });
          poisoned = true;
        } else {
          cwd = dir === "." ? cwd : posixJoin(cwd, dir);
        }
        continue;
      }
      const found = detectInvocation(segment);
      if (!found) continue;
      if (found.unparseable) {
        invocations.push({ unparseable: true, reason: found.reason, rawLine });
        continue;
      }
      const absolute = found.scriptArg.startsWith("/");
      invocations.push({
        unparseable: false,
        kind: found.kind,
        tool: found.tool,
        scriptArg: found.scriptArg,
        scriptPath: absolute ? null : posixJoin(cwd, found.scriptArg),
        absolute,
        rawLine,
      });
    }
  }
  return invocations;
}

/**
 * Secret names keyed by the environment variable name that carries them,
 * read from the job's `env` first, then the step's own `env` (a step-level
 * mapping for the same variable name wins) -- review finding 4. A step
 * that reads NOTION_API_KEY from secrets.NOTION_TOKEN returns
 * { NOTION_API_KEY: "NOTION_TOKEN" }; renaming the variable while keeping
 * the secret changes the key, which MECHANISM_SECRET_MISMATCH now catches.
 */
export function stepEnvSecrets(jobEnv, stepEnv) {
  const map = {};
  for (const env of [jobEnv, stepEnv]) {
    if (!env || typeof env !== "object") continue;
    for (const [key, value] of Object.entries(env)) {
      if (typeof value !== "string") continue;
      const m = value.match(SECRET_ENV_RE);
      if (m) map[key] = m[1];
    }
  }
  return map;
}

function sameSecretsMap(a, b) {
  const aObj = a ?? {};
  const bObj = b ?? {};
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => Object.prototype.hasOwnProperty.call(bObj, k) && bObj[k] === aObj[k]);
}

/** Finds the step matching a mechanism's `step` selector within a workflow's steps. */
export function matchStep(steps, selector) {
  if (!selector) return null;
  if (selector.match === "id") return steps.find(({ step }) => step?.id === selector.value) ?? null;
  if (selector.match === "name") return steps.find(({ step }) => step?.name === selector.value) ?? null;
  if (selector.match === "command") {
    return steps.find(({ step }) => typeof step?.run === "string" && step.run.includes(selector.value)) ?? null;
  }
  return null;
}

function describeSelector(selector) {
  return `${selector.match} "${selector.value}"`;
}

// ── the full check ───────────────────────────────────────────────────────

/**
 * Runs every check and returns { findings, warnings, mechanismCount }.
 * Schema validity gates the rest, same discipline as vendors-lib.mjs and
 * distribution-lib.mjs: an invalid register returns only SCHEMA_INVALID.
 */
export function checkAllScheduledReachability(root) {
  const { findings: schemaFindings, register, valid } = checkSchema(root);
  if (!valid) {
    return { findings: schemaFindings, warnings: [], mechanismCount: 0 };
  }

  const findings = [];
  const mechanisms = register.mechanisms ?? [];

  // Parse every workflow file once, up front.
  const workflowPaths = listWorkflowFiles(root);
  const parsed = new Map(); // path -> workflow (only successfully parsed ones)
  for (const path of workflowPaths) {
    const result = parseWorkflowFile(root, path);
    if (!result.ok) {
      findings.push(result.finding);
      continue;
    }
    parsed.set(path, result.workflow);
  }

  // One pass per scheduled workflow: resolve every step's working
  // directory and run-command invocations, reporting RUN_UNPARSEABLE and
  // RUN_SCRIPT_UNRESOLVED as they're found, and collecting every
  // resolved-and-existing invocation (known or other runner) for the
  // per-entry checks and the completeness rule below. "Never skip" applies
  // to this sweep itself, not just declared rows -- it runs whether or not
  // any register entry names the workflow.
  // `exists` is tracked separately from inclusion: a mechanism entry can
  // still match a step that genuinely invokes it even when the script is
  // missing (that's MECHANISM_SCRIPT_MISSING's job to report), but only an
  // EXISTING script's invocation is subject to the completeness rule --
  // exactly mirroring the discipline this fix restores for RUN_SCRIPT_UNRESOLVED
  // (missing is reported once, not folded into "undeclared" too).
  // Invocations are resolved for EVERY parsed workflow, scheduled or not --
  // MECHANISM_STEP_MISSING still has to know whether an entry's step
  // genuinely invokes its `runs` script even on a workflow that turns out
  // to have no schedule trigger (that gap is MECHANISM_NOT_SCHEDULED's own
  // finding, not a reason to also claim the step is missing). The
  // RUN_UNPARSEABLE / RUN_SCRIPT_UNRESOLVED findings and the completeness
  // rule below, however, are scoped to scheduled workflows only, same as
  // before this fix.
  const scheduledWorkflows = new Set();
  const invocationsByWorkflow = new Map(); // path -> [{ jobId, job, step, scriptPath, tool, kind, exists }]
  for (const [path, workflow] of parsed) {
    const scheduled = hasScheduleTrigger(workflow);
    if (scheduled) scheduledWorkflows.add(path);
    const resolved = [];
    for (const { jobId, job, step } of allSteps(workflow)) {
      const label = stepLabel(step);
      const wd = resolveWorkingDirectory(workflow, job, step);
      if (!wd.ok) {
        if (scheduled) findings.push({ code: "RUN_UNPARSEABLE", file: path, detail: `job "${jobId}" step ${label}: ${wd.reason}` });
        continue;
      }
      for (const inv of resolveStepInvocations(step, wd.cwd)) {
        if (inv.unparseable) {
          if (scheduled) findings.push({ code: "RUN_UNPARSEABLE", file: path, detail: `job "${jobId}" step ${label}: ${inv.reason} (line: ${inv.rawLine.trim()})` });
          continue;
        }
        if (inv.kind === "known") {
          if (inv.absolute) {
            if (scheduled) {
              findings.push({
                code: "RUN_SCRIPT_UNRESOLVED",
                file: path,
                detail: `job "${jobId}" step ${label}: "${inv.tool}" invokes "${inv.scriptArg}", which is an absolute path`,
              });
            }
            continue; // an absolute path can never equal a declared relative `runs`, so no entry could match it either
          }
          const exists = existsSync(resolve(root, inv.scriptPath));
          if (!exists && scheduled) {
            findings.push({
              code: "RUN_SCRIPT_UNRESOLVED",
              file: path,
              detail: `job "${jobId}" step ${label}: "${inv.tool}" invokes "${inv.scriptPath}", which does not resolve to an existing repository file`,
            });
          }
          resolved.push({ jobId, job, step, scriptPath: inv.scriptPath, tool: inv.tool, kind: inv.kind, exists });
        } else if (inv.kind === "other") {
          if (inv.absolute) continue; // out of scope: not a repository-relative invocation
          if (!existsSync(resolve(root, inv.scriptPath))) continue; // not a real repository script -- not this rule's concern (review finding 3 only requires detecting a token that RESOLVES)
          resolved.push({ jobId, job, step, scriptPath: inv.scriptPath, tool: inv.tool, kind: inv.kind, exists: true });
        }
      }
    }
    invocationsByWorkflow.set(path, resolved);
  }

  // Per-entry checks (MECHANISM_*).
  const declared = new Set(); // `${workflowPath}::${scriptPath}` for the completeness rule
  for (const mechanism of mechanisms) {
    if (!isVerifiable(mechanism)) continue; // verifiable: false entries carry no reachability claim to check

    if (!workflowPaths.includes(mechanism.workflow) || !existsSync(resolve(root, mechanism.workflow))) {
      findings.push({ code: "MECHANISM_WORKFLOW_MISSING", file: mechanism.workflow, detail: `entry "${mechanism.id}": workflow file does not exist` });
      continue;
    }
    const workflow = parsed.get(mechanism.workflow);
    if (!workflow) continue; // already reported as WORKFLOWS_UNREADABLE above

    if (!hasScheduleTrigger(workflow)) {
      findings.push({ code: "MECHANISM_NOT_SCHEDULED", file: mechanism.workflow, detail: `entry "${mechanism.id}": workflow has no schedule trigger with at least one cron entry` });
    }

    const resolvedInvocations = invocationsByWorkflow.get(mechanism.workflow) ?? [];
    const steps = allSteps(workflow);
    const selected = matchStep(steps, mechanism.step);
    const invokingEntries = resolvedInvocations.filter((r) => r.scriptPath === mechanism.runs);

    if (invokingEntries.length === 0) {
      findings.push({ code: "MECHANISM_STEP_MISSING", file: mechanism.workflow, detail: `entry "${mechanism.id}": no step invokes "${mechanism.runs}"` });
    } else if (!selected) {
      findings.push({
        code: "MECHANISM_STEP_MISSING",
        file: mechanism.workflow,
        detail: `entry "${mechanism.id}": step selector ${describeSelector(mechanism.step)} matched no step, though job "${invokingEntries[0].jobId}" has a step invoking "${mechanism.runs}"`,
      });
    } else if (!invokingEntries.some((r) => r.step === selected.step)) {
      findings.push({
        code: "MECHANISM_STEP_MISSING",
        file: mechanism.workflow,
        detail: `entry "${mechanism.id}": step selector ${describeSelector(mechanism.step)} matched a step that does not invoke "${mechanism.runs}"`,
      });
    }

    if (!existsSync(resolve(root, mechanism.runs))) {
      findings.push({ code: "MECHANISM_SCRIPT_MISSING", file: mechanism.workflow, detail: `entry "${mechanism.id}": runs script "${mechanism.runs}" does not exist in the repository` });
    }

    const matchedEntry = invokingEntries.find((r) => selected && r.step === selected.step);
    const secretEntry = matchedEntry ?? invokingEntries[0];
    if (secretEntry) {
      const actual = stepEnvSecrets(secretEntry.job?.env, secretEntry.step?.env);
      const expected = mechanism.secrets ?? {};
      if (!sameSecretsMap(actual, expected)) {
        findings.push({
          code: "MECHANISM_SECRET_MISMATCH",
          file: mechanism.workflow,
          detail: `entry "${mechanism.id}": declared secrets ${JSON.stringify(expected)} do not match the step's actual secrets ${JSON.stringify(actual)}`,
        });
      }
    }

    declared.add(`${mechanism.workflow}::${mechanism.runs}`);
  }

  // Completeness rule (SCHEDULED_STEP_UNDECLARED): every resolved,
  // existing-script invocation found in the sweep above -- known runner or
  // other -- must be declared by some entry.
  for (const [path, resolvedList] of invocationsByWorkflow) {
    if (!scheduledWorkflows.has(path)) continue;
    for (const r of resolvedList) {
      if (!r.exists) continue; // a missing script is RUN_SCRIPT_UNRESOLVED's concern, not this one
      const key = `${path}::${r.scriptPath}`;
      if (!declared.has(key)) {
        findings.push({
          code: "SCHEDULED_STEP_UNDECLARED",
          file: path,
          detail: `job "${r.jobId}" step ${stepLabel(r.step)} invokes "${r.scriptPath}", which no config/scheduled-mechanisms.yaml entry declares`,
        });
      }
    }
  }

  return { findings, warnings: [], mechanismCount: mechanisms.length };
}
