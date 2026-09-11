// Tests for the scheduled mechanism reachability register (T6 M3 batch 5,
// scripts/scheduled-reachability-lib.mjs, scripts/check-scheduled-reachability.mjs,
// config/scheduled-mechanisms.yaml). Every failure mode is planted in its
// own throwaway fixture and must fail there; a clean fixture covering the
// four required shapes (a `cd apps/api && npx tsx scripts/...` step, a
// multi-line `run: |` block, a step reading a secret via `env`, and a
// workflow with no schedule trigger) must pass with zero findings; the
// real, committed register must also pass against the real workflows.
// Nothing here changes a workflow's behaviour.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  checkAllScheduledReachability,
  resolveStepInvocations,
  stepSecrets,
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

// ── unit helpers ─────────────────────────────────────────────────────────

test("resolveStepInvocations: resolves a cd apps/api && npx tsx line", () => {
  const step = { run: "cd apps/api && npx tsx scripts/check-thing.ts" };
  const invocations = resolveStepInvocations(step);
  assert.equal(invocations.length, 1);
  assert.deepEqual(invocations[0], { unparseable: false, tool: "npx tsx", scriptPath: "apps/api/scripts/check-thing.ts", rawLine: step.run });
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
});

test("resolveStepInvocations: a shell variable in the cd target is unparseable, never silently skipped", () => {
  const step = { run: 'cd "$SOME_DIR" && npx tsx scripts/x.ts' };
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

test("stepSecrets: reads the secret name, not the env-var name it's mapped to", () => {
  const step = { env: { NOTION_API_KEY: "${{ secrets.NOTION_TOKEN }}" } };
  assert.deepEqual(stepSecrets(step), ["NOTION_TOKEN"]);
});

test("stepSecrets: a step with no env reads no secrets", () => {
  assert.deepEqual(stepSecrets({ run: "node scripts/x.mjs" }), []);
});

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

// ── clean fixture: all four required shapes, zero findings ────────────────

function writeCleanFixture(dir) {
  writeFiles(dir, {
    "apps/api/scripts/check-thing.ts": "// fixture script\n",
    "scripts/plain.mjs": "// fixture script\n",
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
      "    secrets: [DATABASE_URL]",
      "    purpose: fixture",
      "  - id: fixture-plain-step",
      "    workflow: .github/workflows/scheduled.yml",
      "    trigger: schedule",
      "    step:",
      "      match: name",
      "      value: Plain step",
      "    runs: scripts/plain.mjs",
      "    secrets: []",
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

test("clean fixture: cd-prefixed step, multi-line run block, a secret-reading step, and an unscheduled workflow all pass with zero findings", () => {
  const dir = makeFixture();
  try {
    writeCleanFixture(dir);
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(result.findings, []);
    assert.equal(result.mechanismCount, 3);
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
        "    secrets: []",
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
        "    secrets: []",
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
        "    secrets: []",
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
        "    secrets: []",
        "    purpose: fixture",
        "",
      ].join("\n"),
      // deliberately no scripts/ghost.mjs on disk
    });
    const result = checkAllScheduledReachability(dir);
    assert.deepEqual(findingCodes(result), ["MECHANISM_SCRIPT_MISSING"]);
  } finally {
    cleanup(dir);
  }
});

test("MECHANISM_SECRET_MISMATCH: the step's actual env secrets differ from the declared list", () => {
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
        "    secrets: [OTHER_SECRET]",
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

// ── real-repo test ───────────────────────────────────────────────────────

test("the committed config/scheduled-mechanisms.yaml passes against the real workflows", () => {
  const result = checkAllScheduledReachability(realRoot);
  assert.deepEqual(result.findings, []);
  assert.ok(result.mechanismCount > 0);
});
