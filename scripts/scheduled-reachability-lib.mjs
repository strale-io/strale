/**
 * Scheduled mechanism reachability (T6 M3 batch 5).
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

/** Every step of every job, each tagged with its job id for diagnostics. */
export function allSteps(workflow) {
  const steps = [];
  for (const [jobId, job] of Object.entries(workflow?.jobs ?? {})) {
    for (const step of job?.steps ?? []) {
      steps.push({ jobId, step });
    }
  }
  return steps;
}

// ── run-command resolution ──────────────────────────────────────────────

function posixJoin(a, b) {
  if (!a) return b.replace(/^\.\//, "");
  const left = a.replace(/\/+$/, "");
  const right = b.replace(/^\.\//, "").replace(/^\/+/, "");
  return `${left}/${right}`;
}

/**
 * Resolves the repository scripts a step's `run:` command invokes, line by
 * line, tracking a `cd <dir>` prefix (the same shell session persists a cd
 * across lines of one multi-line `run: |` block, since GitHub Actions runs
 * the whole block as one shell script). Returns a list of
 * { scriptPath, tool, rawLine } for every resolvable `npx tsx <path>` /
 * `node <path>` invocation, and { unparseable: true, reason, rawLine } for
 * every invocation-shaped line this cannot resolve statically (a shell
 * variable in the cd target or the script path) -- surfaced by the caller
 * as RUN_UNPARSEABLE, never silently dropped.
 */
export function resolveStepInvocations(step) {
  if (typeof step?.run !== "string") return [];
  const lines = step.run.split("\n");
  const invocations = [];
  let cwd = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const cdMatch = line.match(/(?:^|&&|;)\s*cd\s+("([^"]+)"|'([^']+)'|(\S+))/);
    if (cdMatch) {
      const dir = cdMatch[2] ?? cdMatch[3] ?? cdMatch[4];
      if (/\$/.test(dir)) {
        invocations.push({ unparseable: true, reason: `cd target contains an unresolvable shell variable: ${dir}`, rawLine });
        continue;
      }
      cwd = dir === "." ? cwd : posixJoin(cwd, dir);
    }

    const runMatch = line.match(/(?:^|&&|\|)\s*(npx tsx|node)\s+(\S+)/);
    if (!runMatch) continue;
    const [, tool, scriptArg] = runMatch;
    if (scriptArg.startsWith("-")) continue; // a flag (`node -e`, `node --version`), not a script path
    if (/\$/.test(scriptArg)) {
      invocations.push({ unparseable: true, reason: `script path contains an unresolvable shell variable: ${scriptArg}`, rawLine });
      continue;
    }
    invocations.push({ unparseable: false, tool, scriptPath: posixJoin(cwd, scriptArg), rawLine });
  }
  return invocations;
}

/** Secret names (not env-var names) a step's own `env:` block reads. */
export function stepSecrets(step) {
  const env = step?.env;
  if (!env || typeof env !== "object") return [];
  const names = new Set();
  for (const value of Object.values(env)) {
    if (typeof value !== "string") continue;
    const m = value.match(SECRET_ENV_RE);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

function sameSet(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const v of sa) if (!sb.has(v)) return false;
  return true;
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

  // Parse every workflow file once, up front -- both for the per-entry
  // checks below and for the completeness rule.
  const workflowPaths = listWorkflowFiles(root);
  const parsed = new Map(); // path -> workflow (only successfully parsed ones)
  for (const path of workflowPaths) {
    const result = parseWorkflowFile(root, path);
    if (!result.ok) {
      findings.push(result.finding);
      continue;
    }
    parsed.set(path, result.workflow);

    // RUN_UNPARSEABLE: scan every step of every scheduled workflow for an
    // invocation-shaped line this cannot resolve statically. Reported
    // whether or not any register entry names that workflow -- "never
    // skip" applies to the workflow sweep itself, not just declared rows.
    if (hasScheduleTrigger(result.workflow)) {
      for (const { jobId, step } of allSteps(result.workflow)) {
        for (const inv of resolveStepInvocations(step)) {
          if (inv.unparseable) {
            findings.push({
              code: "RUN_UNPARSEABLE",
              file: path,
              detail: `job "${jobId}" step ${step.id ? `"${step.id}"` : step.name ? `"${step.name}"` : "(unnamed)"}: ${inv.reason} (line: ${inv.rawLine.trim()})`,
            });
          }
        }
      }
    }
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

    const steps = allSteps(workflow);
    const selected = matchStep(steps, mechanism.step);
    const invokingSteps = steps.filter(({ step }) => resolveStepInvocations(step).some((inv) => !inv.unparseable && inv.scriptPath === mechanism.runs));

    if (invokingSteps.length === 0) {
      findings.push({ code: "MECHANISM_STEP_MISSING", file: mechanism.workflow, detail: `entry "${mechanism.id}": no step invokes "${mechanism.runs}"` });
    } else if (!selected) {
      findings.push({
        code: "MECHANISM_STEP_MISSING",
        file: mechanism.workflow,
        detail: `entry "${mechanism.id}": step selector ${describeSelector(mechanism.step)} matched no step, though job "${invokingSteps[0].jobId}" has a step invoking "${mechanism.runs}"`,
      });
    } else if (!invokingSteps.some(({ step }) => step === selected.step)) {
      findings.push({
        code: "MECHANISM_STEP_MISSING",
        file: mechanism.workflow,
        detail: `entry "${mechanism.id}": step selector ${describeSelector(mechanism.step)} matched a step that does not invoke "${mechanism.runs}"`,
      });
    }

    if (!existsSync(resolve(root, mechanism.runs))) {
      findings.push({ code: "MECHANISM_SCRIPT_MISSING", file: mechanism.workflow, detail: `entry "${mechanism.id}": runs script "${mechanism.runs}" does not exist in the repository` });
    }

    const secretStep = selected && invokingSteps.some(({ step }) => step === selected.step) ? selected : invokingSteps[0];
    if (secretStep) {
      const actual = stepSecrets(secretStep.step);
      const expected = [...(mechanism.secrets ?? [])].sort();
      if (!sameSet(actual, expected)) {
        findings.push({
          code: "MECHANISM_SECRET_MISMATCH",
          file: mechanism.workflow,
          detail: `entry "${mechanism.id}": declared secrets [${expected.join(", ")}] do not match the step's actual secrets [${actual.join(", ")}]`,
        });
      }
    }

    declared.add(`${mechanism.workflow}::${mechanism.runs}`);
  }

  // Completeness rule (SCHEDULED_STEP_UNDECLARED): every step in a
  // scheduled workflow that invokes an existing repository script must be
  // declared by some entry above.
  for (const [path, workflow] of parsed) {
    if (!hasScheduleTrigger(workflow)) continue;
    for (const { jobId, step } of allSteps(workflow)) {
      for (const inv of resolveStepInvocations(step)) {
        if (inv.unparseable) continue; // already reported as RUN_UNPARSEABLE
        if (!existsSync(resolve(root, inv.scriptPath))) continue; // not a real repository script -- not this rule's concern
        const key = `${path}::${inv.scriptPath}`;
        if (!declared.has(key)) {
          findings.push({
            code: "SCHEDULED_STEP_UNDECLARED",
            file: path,
            detail: `job "${jobId}" step ${step.id ? `"${step.id}"` : step.name ? `"${step.name}"` : "(unnamed)"} invokes "${inv.scriptPath}", which no config/scheduled-mechanisms.yaml entry declares`,
          });
        }
      }
    }
  }

  return { findings, warnings: [], mechanismCount: mechanisms.length };
}
