// Tests for the scheduled mechanism reachability register (T6 M3 batch 5,
// scripts/scheduled-reachability-lib.mjs, scripts/check-scheduled-reachability.mjs,
// config/scheduled-mechanisms.yaml). Every failure mode is planted in its
// own throwaway fixture and must fail there; a clean fixture covering the
// required shapes must pass with zero findings; the real, committed
// register must also pass against the real workflows. Nothing here changes
// a workflow's behaviour.
//
// Review round 1 (this PR) added: working-directory resolution from a
// step's own `working-directory`, a job's `defaults.run.working-directory`,
// or a workflow's, before any `cd` in the command (and a `cd` chain, e.g.
// `cd a && cd b`, resolving under the joined path); RUN_SCRIPT_UNRESOLVED
// for a known-runner script argument that does not resolve to an existing
// repository file, instead of the old silent skip; detection of other
// runners (bash, sh, python3, a direct ./x.sh) for the completeness rule,
// while a command that invokes nothing in the repository (npx tsc -b in
// the sibling strale-frontend checkout, gh, git) stays out by the same
// general rule; and a secrets map (environment variable name -> secret
// name) instead of a bare list, so MECHANISM_SECRET_MISMATCH catches a
// renamed variable reading an unchanged secret.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkAllScheduledReachability,
  resolveStepInvocations,
  resolveWorkingDirectory,
  stepEnvSecrets,
  hasScheduleTrigger,
  matchStep,
  repoRootFrom,
  REGISTER_PATH,
  SCHEMA_PATH,
} from "./scheduled-reachability-lib.mjs";

const realRoot = repoRootFrom(import.meta.url);

function writeFiles(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    const absolute = join(dir, rel);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, content, "utf8");
  }
}

function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

function makeFixture() {
  const dir = mkdtempSync(join(tmpdir(), "scheduled-reachability-"));
  cpSync(join(realRoot, SCHEMA_PATH), join(dir, SCHEMA_PATH));
  return dir;
}

function findingCodes(result) {
  return result.findings.map((f) => f.code);
}

// ── unit: resolveStepInvocations ────────────────────────────────────────

test("resolveStepInvocations: resolves a cd apps/api && npx tsx line", () => {
  const step = { run: "cd apps/api && npx tsx scripts/check-thing.ts" };
  const invocations = resolveStepInvocations(step);
  assert.equal(invocations.length, 1);
  const inv = invocations[0];
  assert.equal(inv.unparseable, false);
  assert.equal(inv.kind, "known");
  assert.equal(inv.tool, "npx tsx");
  assert.equal(inv.scriptPath, "apps/api/scripts/check-thing.ts");
  assert.equal(inv.absolute, false);
});

test("resolveStepInvocations: a cd a && cd b chain resolves under a/b (review finding 1)", () => {
  const step = { run: "cd a && cd b && npx tsx scripts/x.mjs" };
  const invocations = resolveStepInvocations(step);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].scriptPath, "a/b/scripts/x.mjs");
});

test("resolveStepInvocations: a multi-line run block, cd persists across lines in the same shell", () => {
  const step = {
    run: ["set +e", "set -o pipefail", "cd apps/api", "npx tsx scripts/check-thing.ts", "echo done"].join("\n"),
  };
  const invocations = resolveStepInvocations(step).filter((i) => !i.unparseable);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].scriptPath, "apps/api/scripts/check-thing.ts");
});

test("resolveStepInvocations: a bare node script at repo root, no cd", () => {
  const step = { run: "node scripts/plain.mjs" };
  const invocations = resolveStepInvocations(step);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].scriptPath, "scripts/plain.mjs");
  assert.equal(invocations[0].kind, "known");
});

test("resolveStepInvocations: an initial working directory (from resolveWorkingDirectory) applies with no cd at all", () => {
  const step = { run: "npx tsx scripts/y.ts" };
  const invocations = resolveStepInvocations(step, "apps/api");
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].scriptPath, "apps/api/scripts/y.ts");
});

test("resolveStepInvocations: a shell variable in the cd target is unparseable, never silently skipped", () => {
  const step = { run: 'cd "$SOME_DIR" && npx tsx scripts/x.ts' };
  const invocations = resolveStepInvocations(step);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].unparseable, true);
});

test("resolveStepInvocations: cd to an absolute path is unparseable, never a guess (review finding 1)", () => {
  const step = { run: "cd /opt/whatever && npx tsx scripts/x.ts" };
  const invocations = resolveStepInvocations(step);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].unparseable, true);
});

test("resolveStepInvocations: a shell variable in the script path is unparseable", () => {
  const step = { run: "node $SCRIPT_PATH" };
  const invocations = resolveStepInvocations(step);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].unparseable, true);
});

test("resolveStepInvocations: node -e / node --version are flags, not a script path", () => {
  const step = { run: "node -e \"console.log(1)\"\nnode --version" };
  assert.deepEqual(resolveStepInvocations(step), []);
});

test("resolveStepInvocations: an absolute script path under a known runner is flagged, not silently resolved (review finding 2)", () => {
  const step = { run: "node /abs/path/x.mjs" };
  const invocations = resolveStepInvocations(step);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].unparseable, false);
  assert.equal(invocations[0].absolute, true);
  assert.equal(invocations[0].scriptPath, null);
});

test("resolveStepInvocations: a bash script step is detected as an 'other' runner invocation (review finding 3)", () => {
  const step = { run: "bash scripts/x.sh" };
  const invocations = resolveStepInvocations(step);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].kind, "other");
  assert.equal(invocations[0].tool, "bash");
  assert.equal(invocations[0].scriptPath, "scripts/x.sh");
});

test("resolveStepInvocations: a python3 script step is detected as an 'other' runner invocation (review round 2)", () => {
  const step = { run: "python3 scripts/x.py" };
  const invocations = resolveStepInvocations(step);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].kind, "other");
  assert.equal(invocations[0].tool, "python3");
  assert.equal(invocations[0].scriptPath, "scripts/x.py");
});

test("resolveStepInvocations: a direct ./x.sh invocation is detected as an 'other' runner invocation (review finding 3)", () => {
  const step = { run: "./scripts/x.sh" };
  const invocations = resolveStepInvocations(step);
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0].kind, "other");
  assert.equal(invocations[0].tool, "direct");
  assert.equal(invocations[0].scriptPath, "scripts/x.sh");
});

test("resolveStepInvocations: npx tsc -b invokes nothing in the repository, so it is not detected at all (review finding 3)", () => {
  const step = { run: "npm ci --ignore-scripts && npx tsc -b --force" };
  assert.deepEqual(resolveStepInvocations(step), []);
});

test("resolveStepInvocations: gh and git commands invoke nothing in the repository", () => {
  const step = { run: 'gh issue create --title "x"\ngit log --oneline' };
  assert.deepEqual(resolveStepInvocations(step), []);
});

// ── unit: resolveWorkingDirectory (review finding 1) ────────────────────

test("resolveWorkingDirectory: step working-directory wins over job and workflow defaults", () => {
  const workflow = { defaults: { run: { "working-directory": "workflow-dir" } } };
  const job = { defaults: { run: { "working-directory": "job-dir" } } };
  const step = { "working-directory": "step-dir" };
  assert.deepEqual(resolveWorkingDirectory(workflow, job, step), { ok: true, cwd: "step-dir" });
});

test("resolveWorkingDirectory: job defaults.run.working-directory applies when the step has none", () => {
  const workflow = {};
  const job = { defaults: { run: { "working-directory": "apps/api" } } };
  const step = {};
  assert.deepEqual(resolveWorkingDirectory(workflow, job, step), { ok: true, cwd: "apps/api" });
});

test("resolveWorkingDirectory: workflow defaults.run.working-directory applies when neither step nor job has one", () => {
  const workflow = { defaults: { run: { "working-directory": "apps/api" } } };
  assert.deepEqual(resolveWorkingDirectory(workflow, {}, {}), { ok: true, cwd: "apps/api" });
});

test("resolveWorkingDirectory: repository root when nothing declares a working-directory", () => {
  assert.deepEqual(resolveWorkingDirectory({}, {}, {}), { ok: true, cwd: "" });
});

test("resolveWorkingDirectory: an absolute or variable working-directory is not ok, never guessed at", () => {
  assert.equal(resolveWorkingDirectory({}, {}, { "working-directory": "/abs" }).ok, false);
  assert.equal(resolveWorkingDirectory({}, {}, { "working-directory": "${{ env.X }}" }).ok, false);
});

// ── unit: stepEnvSecrets (review finding 4) ─────────────────────────────

test("stepEnvSecrets: maps the environment variable name to the secret name it reads", () => {
  assert.deepEqual(stepEnvSecrets(undefined, { NOTION_API_KEY: "${{ secrets.NOTION_TOKEN }}" }), { NOTION_API_KEY: "NOTION_TOKEN" });
});

test("stepEnvSecrets: reads the job's env, and the step's env wins on a name collision", () => {
  const jobEnv = { DATABASE_URL: "${{ secrets.DATABASE_URL }}", OTHER: "${{ secrets.OTHER_SECRET }}" };
  const stepEnv = { DATABASE_URL: "${{ secrets.OVERRIDE_SECRET }}" };
  assert.deepEqual(stepEnvSecrets(jobEnv, stepEnv), { DATABASE_URL: "OVERRIDE_SECRET", OTHER: "OTHER_SECRET" });
});

test("stepEnvSecrets: a step with no env reads no secrets", () => {
  assert.deepEqual(stepEnvSecrets(undefined, undefined), {});
});

// ── unit: unchanged helpers ──────────────────────────────────────────────

test("hasScheduleTrigger: false for a push-only workflow, true for a schedule with a cron entry", () => {
  assert.equal(hasScheduleTrigger({ on: { push: {} } }), false);
  assert.equal(hasScheduleTrigger({ on: { schedule: [] } }), false);
  assert.equal(hasScheduleTrigger({ on: { schedule: [{ cron: "0 6 * * *" }] } }), true);
});

test("matchStep: matches by id, by name, and by command substring; matches nothing when not found", () => {
  const steps = [
    { jobId: "j", step: { id: "a", run: "node scripts/a.mjs" } },
    { jobId: "j", step: { name: "B step", run: "node scripts/b.mjs" } },
  ];
  assert.equal(matchStep(steps, { match: "id", value: "a" }).step.id, "a");
  assert.equal(matchStep(steps, { match: "name", value: "B step" }).step.name, "B step");
  assert.equal(matchStep(steps, { match: "command", value: "scripts/b.mjs" }).step.name, "B step");
  assert.equal(matchStep(steps, { match: "id", value: "does-not-exist" }), null);
});

// ── clean fixture: all required shapes, zero findings ──────────────────

function writeCleanFixture(dir) {
  writeFiles(dir, {
    "apps/api/scripts/check-thing.ts": "// fixture script\n",
    "scripts/plain.mjs": "// fixture script\n",
    "scripts/x.sh": "#!/bin/sh\n# fixture script\n",
    "scripts/never-declared.mjs": "// lives only on an unscheduled workflow, so it needs no entry\n",
    ".github/workflows/scheduled.yml": [
      "name: Scheduled Fixture",
      "on:",
      "  schedule:",
      '    - cron: "0 6 * * *"',
      "jobs:",
      "  sweep:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - id: manifest-step",
      "        env:",
      "          DATABASE_URL: ${{ secrets.DATABASE_URL }}",
      "        run: |",
      "          set +e",
      "          set -o pipefail",
      "          cd apps/api && npx tsx scripts/check-thing.ts",
      "          echo done",
      "      - name: Plain step",
      "        run: node scripts/plain.mjs",
      "      - id: bash-step",
      "        run: bash scripts/x.sh",
      "      - id: frontend-typecheck-lookalike",
      "        run: |",
      "          cd strale-frontend",
      "          npm ci --ignore-scripts && npx tsc -b --force",
      "  job-default-sweep:",
      "    runs-on: ubuntu-latest",
      "    defaults:",
      "      run:",
      "        working-directory: from-job-default",
      "    steps:",
      "      - id: job-default-step",
      "        run: npx tsx scripts/job-default.mjs",
      "  step-default-sweep:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - id: step-default-step",
      "        working-directory: from-step-default",
      "        run: npx tsx scripts/step-default.mjs",
      "",
    ].join("\n"),
    ".github/workflows/unscheduled.yml": [
      "name: Unscheduled Fixture",
      "on:",
      "  push: {}",
      "jobs:",
      "  build:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - id: undeclared",
      "        run: node scripts/never-declared.mjs",
      "",
    ].join("\n"),
    [REGISTER_PATH]: [
      "schema_version: 1",
      "mechanisms:",
      "  - id: fixture-manifest-step",
      "    workflow: .github/workflows/scheduled.yml",
      "    trigger: schedule",
      "    step:",
      "      match: id",
      "      value: manifest-step",
      "    runs: apps/api/scripts/check-thing.ts",
      "    secrets:",
      "      DATABASE_URL: DATABASE_URL",
      "    purpose: fixture",
      "  - id: fixture-plain-step",
      "    workflow: .github/workflows/scheduled.yml",
      "    trigger: schedule",
      "    step:",
      "      match: name",
      "      value: Plain step",
      "    runs: scripts/plain.mjs",
      "    secrets: {}",
      "    purpose: fixture",
      "  - id: fixture-job-default-step",
      "    workflow: .github/workflows/scheduled.yml",
      "    trigger: schedule",
      "    step:",
      "      match: id",
      "      value: job-default-step",
      "    runs: from-job-default/scripts/job-default.mjs",
      "    secrets: {}",
      "    purpose: fixture",
      "  - id: fixture-step-default-step",
      "    workflow: .github/workflows/scheduled.yml",
      "    trigger: schedule",
      "    step:",
      "      match: id",
      "      value: step-default-step",
      "    runs: from-step-default/scripts/step-default.mjs",
      "    secrets: {}",
      "    purpose: fixture",
      "  - id: fixture-bash-step",
      "    workflow: .github/workflows/scheduled.yml",
      "    trigger: schedule",
      "    step:",
      "      match: id",
      "      value: bash-step",
      "    runs: scripts/x.sh",
      "    secrets: {}",
      "    purpose: fixture",
      "  - id: fixture-unverifiable",
      "    verifiable: false",
      "    reason: fixture reason",
      "    evidence: [some/evidence.md]",
      "    purpose: fixture",
      "",
    ].join("\n"),
  });
}

test("clean fixture: cd chains, a job default, a step default, a bash step, an npx-tsc-b lookalike, and an unscheduled workflow all pass with zero findings", () => {
  const dir = makeFixture();
  try {
    // "from-step-default/scripts/step-default.mjs" and
    // "from-job-default/scripts/job-default.mjs" need real files on disk
    // for MECHANISM_SCRIPT_MISSING / RUN_SCRIPT_UNRESOLVED not to fire.
    writeFiles(dir, {
      "from-job-default/scripts/job-default.mjs": "// fixture script\n",
      "from-step-default/scripts/step-default.mjs": "// fixture script\n",
    });
    writeCleanFixture(dir);
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(result.findings, []);
    assert.equal(result.mechanismCount, 6);
  } finally {
    cleanup(dir);
  }
});

// ── one planted failure per finding code ───────────────────────────────────

test("MECHANISM_WORKFLOW_MISSING: entry names a workflow file that does not exist", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      [REGISTER_PATH]: [
        "schema_version: 1",
        "mechanisms:",
        "  - id: ghost",
        "    workflow: .github/workflows/does-not-exist.yml",
        "    trigger: schedule",
        "    step:",
        "      match: id",
        "      value: whatever",
        "    runs: scripts/ghost.mjs",
        "    secrets: {}",
        "    purpose: fixture",
        "",
      ].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["MECHANISM_WORKFLOW_MISSING"]);
  } finally {
    cleanup(dir);
  }
});

test("MECHANISM_NOT_SCHEDULED: the entry's workflow has no schedule trigger", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      "scripts/foo.mjs": "// fixture\n",
      ".github/workflows/push-only.yml": [
        "name: Push Only",
        "on:",
        "  push: {}",
        "jobs:",
        "  build:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: foo",
        "        run: node scripts/foo.mjs",
        "",
      ].join("\n"),
      [REGISTER_PATH]: [
        "schema_version: 1",
        "mechanisms:",
        "  - id: fixture-not-scheduled",
        "    workflow: .github/workflows/push-only.yml",
        "    trigger: schedule",
        "    step:",
        "      match: id",
        "      value: foo",
        "    runs: scripts/foo.mjs",
        "    secrets: {}",
        "    purpose: fixture",
        "",
      ].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["MECHANISM_NOT_SCHEDULED"]);
  } finally {
    cleanup(dir);
  }
});

test("MECHANISM_STEP_MISSING: no step of the workflow invokes the declared runs script", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      "scripts/foo.mjs": "// fixture\n",
      "scripts/unrelated.mjs": "// fixture\n",
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: unrelated-step",
        "        run: node scripts/unrelated.mjs",
        "",
      ].join("\n"),
      [REGISTER_PATH]: [
        "schema_version: 1",
        "mechanisms:",
        "  - id: fixture-step-missing",
        "    workflow: .github/workflows/scheduled.yml",
        "    trigger: schedule",
        "    step:",
        "      match: id",
        "      value: unrelated-step",
        "    runs: scripts/foo.mjs",
        "    secrets: {}",
        "    purpose: fixture",
        "",
      ].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.equal(findingCodes(result).filter((c) => c === "MECHANISM_STEP_MISSING").length, 1);
    // The unrelated step's own script is on a scheduled workflow and undeclared.
    assert.ok(findingCodes(result).includes("SCHEDULED_STEP_UNDECLARED"));
  } finally {
    cleanup(dir);
  }
});

test("MECHANISM_SCRIPT_MISSING: the declared runs script does not exist in the repository", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: ghost-step",
        "        run: node scripts/ghost.mjs",
        "",
      ].join("\n"),
      [REGISTER_PATH]: [
        "schema_version: 1",
        "mechanisms:",
        "  - id: fixture-script-missing",
        "    workflow: .github/workflows/scheduled.yml",
        "    trigger: schedule",
        "    step:",
        "      match: id",
        "      value: ghost-step",
        "    runs: scripts/ghost.mjs",
        "    secrets: {}",
        "    purpose: fixture",
        "",
      ].join("\n"),
      // deliberately no scripts/ghost.mjs on disk
    });
    const result = checkAllScheduledReachability(dir);
    // The step also invokes a known runner against a nonexistent script,
    // so the general sweep reports RUN_SCRIPT_UNRESOLVED as well as the
    // per-entry MECHANISM_SCRIPT_MISSING -- both true, different concerns.
    assert.deepEqual(new Set(findingCodes(result)), new Set(["MECHANISM_SCRIPT_MISSING", "RUN_SCRIPT_UNRESOLVED"]));
  } finally {
    cleanup(dir);
  }
});

test("MECHANISM_SECRET_MISMATCH: the step's actual env secrets differ from the declared map", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      "scripts/needs-secret.mjs": "// fixture\n",
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: secret-step",
        "        env:",
        "          DATABASE_URL: ${{ secrets.DATABASE_URL }}",
        "        run: node scripts/needs-secret.mjs",
        "",
      ].join("\n"),
      [REGISTER_PATH]: [
        "schema_version: 1",
        "mechanisms:",
        "  - id: fixture-secret-mismatch",
        "    workflow: .github/workflows/scheduled.yml",
        "    trigger: schedule",
        "    step:",
        "      match: id",
        "      value: secret-step",
        "    runs: scripts/needs-secret.mjs",
        "    secrets:",
        "      OTHER_VAR: OTHER_SECRET",
        "    purpose: fixture",
        "",
      ].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["MECHANISM_SECRET_MISMATCH"]);
  } finally {
    cleanup(dir);
  }
});

test("MECHANISM_SECRET_MISMATCH: renaming the environment variable while keeping the same secret still fails (review finding 4)", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      "scripts/needs-secret.mjs": "// fixture\n",
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: secret-step",
        "        env:",
        // renamed from NOTION_API_KEY to NOTION_KEY -- the secret behind
        // it (NOTION_TOKEN) is unchanged.
        "          NOTION_KEY: ${{ secrets.NOTION_TOKEN }}",
        "        run: node scripts/needs-secret.mjs",
        "",
      ].join("\n"),
      [REGISTER_PATH]: [
        "schema_version: 1",
        "mechanisms:",
        "  - id: fixture-renamed-var",
        "    workflow: .github/workflows/scheduled.yml",
        "    trigger: schedule",
        "    step:",
        "      match: id",
        "      value: secret-step",
        "    runs: scripts/needs-secret.mjs",
        "    secrets:",
        "      NOTION_API_KEY: NOTION_TOKEN",
        "    purpose: fixture",
        "",
      ].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["MECHANISM_SECRET_MISMATCH"]);
  } finally {
    cleanup(dir);
  }
});

test("SCHEDULED_STEP_UNDECLARED: a scheduled workflow's script-invoking step has no register entry", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      "scripts/undeclared.mjs": "// fixture\n",
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: undeclared-step",
        "        run: node scripts/undeclared.mjs",
        "",
      ].join("\n"),
      [REGISTER_PATH]: ["schema_version: 1", "mechanisms: []", ""].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["SCHEDULED_STEP_UNDECLARED"]);
  } finally {
    cleanup(dir);
  }
});

test("SCHEDULED_STEP_UNDECLARED: a bash script step on a scheduled workflow needs an entry too (review finding 3)", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      "scripts/x.sh": "#!/bin/sh\n",
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: bash-step",
        "        run: bash scripts/x.sh",
        "",
      ].join("\n"),
      [REGISTER_PATH]: ["schema_version: 1", "mechanisms: []", ""].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["SCHEDULED_STEP_UNDECLARED"]);
  } finally {
    cleanup(dir);
  }
});

test("npx tsc -b in a scheduled workflow is correctly ignored -- no entry required (review finding 3)", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: typecheck-lookalike",
        "        run: |",
        "          cd strale-frontend",
        "          npm ci --ignore-scripts && npx tsc -b --force",
        "",
      ].join("\n"),
      [REGISTER_PATH]: ["schema_version: 1", "mechanisms: []", ""].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(result.findings, []);
  } finally {
    cleanup(dir);
  }
});

test("RUN_SCRIPT_UNRESOLVED: a known runner's script argument does not resolve to an existing repository file (review finding 2)", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: missing-step",
        "        run: npx tsx scripts/does-not-exist.ts",
        "",
      ].join("\n"),
      [REGISTER_PATH]: ["schema_version: 1", "mechanisms: []", ""].join("\n"),
      // deliberately no scripts/does-not-exist.ts on disk
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["RUN_SCRIPT_UNRESOLVED"]);
  } finally {
    cleanup(dir);
  }
});

test("RUN_SCRIPT_UNRESOLVED: an absolute script path under a known runner (review finding 2)", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: absolute-step",
        "        run: node /opt/somewhere/x.mjs",
        "",
      ].join("\n"),
      [REGISTER_PATH]: ["schema_version: 1", "mechanisms: []", ""].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["RUN_SCRIPT_UNRESOLVED"]);
  } finally {
    cleanup(dir);
  }
});

test("WORKFLOWS_UNREADABLE: a workflow file that cannot be parsed as YAML", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      ".github/workflows/broken.yml": "on: [this is not: valid: yaml\n",
      [REGISTER_PATH]: ["schema_version: 1", "mechanisms: []", ""].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["WORKFLOWS_UNREADABLE"]);
    assert.equal(result.findings[0].file, ".github/workflows/broken.yml");
  } finally {
    cleanup(dir);
  }
});

test("RUN_UNPARSEABLE: a scheduled step's cd target is a shell variable, reported rather than silently skipped", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: variable-cd",
        '        run: cd "$SOME_DIR" && npx tsx scripts/x.ts',
        "",
      ].join("\n"),
      [REGISTER_PATH]: ["schema_version: 1", "mechanisms: []", ""].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["RUN_UNPARSEABLE"]);
  } finally {
    cleanup(dir);
  }
});

test("RUN_UNPARSEABLE: a step working-directory that is not a plain relative path (review finding 1)", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: bad-wd",
        "        working-directory: /absolute/path",
        "        run: node scripts/x.mjs",
        "",
      ].join("\n"),
      [REGISTER_PATH]: ["schema_version: 1", "mechanisms: []", ""].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["RUN_UNPARSEABLE"]);
  } finally {
    cleanup(dir);
  }
});

test("SCHEMA_INVALID gates the rest: an invalid register returns only schema findings", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, { [REGISTER_PATH]: ["schema_version: 2", "mechanisms: []", ""].join("\n") });
    const result = checkAllScheduledReachability(dir);
    assert.ok(findingCodes(result).every((c) => c === "SCHEMA_INVALID"));
    assert.ok(result.findings.length > 0);
  } finally {
    cleanup(dir);
  }
});

test("SCHEMA_INVALID: a bare list of secret names is no longer a valid shape (review finding 4)", () => {
  const dir = makeFixture();
  try {
    writeFiles(dir, {
      "scripts/foo.mjs": "// fixture\n",
      ".github/workflows/scheduled.yml": [
        "name: Scheduled",
        "on:",
        "  schedule:",
        '    - cron: "0 6 * * *"',
        "jobs:",
        "  sweep:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - id: a",
        "        run: node scripts/foo.mjs",
        "",
      ].join("\n"),
      [REGISTER_PATH]: [
        "schema_version: 1",
        "mechanisms:",
        "  - id: fixture-old-shape",
        "    workflow: .github/workflows/scheduled.yml",
        "    trigger: schedule",
        "    step:",
        "      match: id",
        "      value: a",
        "    runs: scripts/foo.mjs",
        "    secrets: [DATABASE_URL]",
        "    purpose: fixture",
        "",
      ].join("\n"),
    });
    const result = checkAllScheduledReachability(dir);
    assert.ok(findingCodes(result).every((c) => c === "SCHEMA_INVALID"));
    assert.ok(result.findings.length > 0);
  } finally {
    cleanup(dir);
  }
});

// ── real-repo test ───────────────────────────────────────────────────────

test("the committed config/scheduled-mechanisms.yaml passes against the real workflows", () => {
  const result = checkAllScheduledReachability(realRoot);
  assert.deepEqual(result.findings, []);
  assert.ok(result.mechanismCount > 0);
});
