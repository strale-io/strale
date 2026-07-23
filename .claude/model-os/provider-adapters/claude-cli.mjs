import { existsSync } from "node:fs";
import path from "node:path";

import {
  assertSafeModelId,
  normalizeUsage,
  parseJsonValue,
  resolveWindowsCommand,
  runInvocation,
  safeEffort,
  subscriptionOnlyDispatchEnv,
} from "./common.mjs";

function installedClaudeCommand(env = process.env, { exists = existsSync, nodeExecutable = process.execPath } = {}) {
  const candidate = env.CLAUDE_CODE_EXECUTABLE || (env.APPDATA
    ? path.join(env.APPDATA, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe")
    : null);
  return candidate && exists(candidate) ? resolveWindowsCommand(candidate, { env, exists, nodeExecutable }) : null;
}

export function buildClaudeAuthInvocation({
  platform = process.platform,
  env = process.env,
} = {}, runtime = {}) {
  if (platform !== "win32") return { command: "claude", args: ["auth", "status", "--json"] };
  const resolved = installedClaudeCommand(env, runtime);
  if (!resolved) throw new Error("direct Claude executable is required on Windows for shell-free structured dispatch");
  return { command: resolved.command, args: [...resolved.prefixArgs, "auth", "status", "--json"] };
}

export function parseClaudeAuthStatus(stdout = "") {
  try {
    const parsed = parseJsonValue(stdout);
    const subscription = parsed.subscriptionType || null;
    const ok = parsed.loggedIn === true && parsed.authMethod === "claude.ai" && typeof subscription === "string" && subscription.length > 0;
    return ok
      ? { ok: true, method: parsed.authMethod, subscription }
      : { ok: false, method: parsed.authMethod || "unknown", subscription, reason: "Claude is not authenticated through a claude.ai subscription" };
  } catch (error) {
    return { ok: false, method: "unknown", subscription: null, reason: `Claude auth status invalid: ${error.message}` };
  }
}

export function buildClaudeInvocation({ modelId, effort, outputSchema = null, writeAccess = false }, {
  platform = process.platform,
  env = process.env,
  exists = existsSync,
  nodeExecutable = process.execPath,
} = {}) {
  const model = assertSafeModelId(modelId, "Claude");
  const level = safeEffort(effort, new Set(["low", "medium", "high", "xhigh", "max"]));
  const args = [
    "-p",
    "--model", model,
    "--effort", level,
    "--safe-mode",
    // acceptEdits auto-accepts file tools only for cwd/additionalDirectories. Bash is
    // deliberately absent: native Windows Claude has no OS filesystem sandbox that
    // can enforce the same worktree-only write boundary as Codex workspace-write.
    "--tools", writeAccess ? "Edit,Read,Write,Glob,Grep" : "",
    "--permission-mode", writeAccess ? "acceptEdits" : "plan",
    "--no-session-persistence",
    "--output-format", "json",
    ...(outputSchema ? ["--json-schema", JSON.stringify(outputSchema)] : []),
  ];
  if (platform !== "win32") return { command: "claude", args };
  const resolved = installedClaudeCommand(env, { exists, nodeExecutable });
  if (resolved) return { command: resolved.command, args: [...resolved.prefixArgs, ...args] };
  throw new Error("direct Claude executable is required on Windows for shell-free structured dispatch");
}

export function parseClaudeResult(stdout, requestedModel) {
  const wrapper = parseJsonValue(stdout);
  const output = parseJsonValue(wrapper.structured_output ?? wrapper.result);
  const usage = normalizeUsage(wrapper.usage);
  const modelUsage = wrapper.modelUsage && typeof wrapper.modelUsage === "object" ? Object.keys(wrapper.modelUsage) : [];
  const requested = String(requestedModel || "").toLowerCase();
  const requestedFamily = requested.startsWith("claude-") ? requested : `claude-${requested}-`;
  const observed = modelUsage.find((model) => model.toLowerCase() === requested ||
    model.toLowerCase().startsWith(requestedFamily));
  return { output, usage, observedModel: observed || null };
}

export function createClaudeAdapter({ spawn } = {}) {
  return {
    verifySubscriptionAuth({ env, timeoutMs = 10_000 }) {
      const childEnv = subscriptionOnlyDispatchEnv(env);
      const raw = runInvocation(buildClaudeAuthInvocation({ env: childEnv }), { env: childEnv, timeoutMs, spawn });
      if (raw.exitCode !== 0) return { ok: false, reason: raw.stderr || raw.stdout || `auth status exit ${raw.exitCode}` };
      return parseClaudeAuthStatus(raw.stdout);
    },
    execute({ modelId, effort, cwd, prompt, timeoutMs, env, outputSchema = null, writeAccess = false }) {
      const childEnv = subscriptionOnlyDispatchEnv(env);
      const raw = runInvocation(buildClaudeInvocation({ modelId, effort, outputSchema, writeAccess }, { env: childEnv }), {
        input: prompt, env: childEnv, cwd, timeoutMs, spawn,
      });
      if (raw.exitCode !== 0) return { ...raw, output: null, observedModel: null, usage: null };
      try { return { ...raw, ...parseClaudeResult(raw.stdout, modelId) }; }
      catch (error) { return { ...raw, exitCode: 1, output: null, observedModel: null, usage: null,
        stderr: [raw.stderr, `invalid Claude output: ${error.message}`].filter(Boolean).join("\n") }; }
    },
  };
}
