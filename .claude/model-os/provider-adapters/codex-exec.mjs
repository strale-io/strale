import { existsSync } from "node:fs";
import path from "node:path";

import {
  assertSafeModelId,
  parseJsonValue,
  resolveWindowsCommand,
  runInvocation,
  safeEffort,
  subscriptionOnlyDispatchEnv,
} from "./common.mjs";

export function resolveCodexCommand({
  platform = process.platform,
  env = process.env,
  exists = existsSync,
  nodeExecutable = process.execPath,
} = {}) {
  if (platform !== "win32") return { command: "codex", prefixArgs: [] };
  const configured = env.CODEX_EXECUTABLE || null;
  if (configured && exists(configured)) {
    return resolveWindowsCommand(configured, { env, exists, nodeExecutable });
  }
  const script = env.APPDATA ? path.join(env.APPDATA, "npm", "node_modules", "@openai", "codex", "bin", "codex.js") : null;
  if (!script || !exists(script)) throw new Error("direct Codex executable is required on Windows for shell-free dispatch");
  return { command: nodeExecutable, prefixArgs: [script] };
}

export function buildCodexAuthInvocation({
  platform = process.platform,
  env = process.env,
} = {}) {
  const resolved = resolveCodexCommand({ platform, env });
  return { command: resolved.command, args: [...resolved.prefixArgs, "login", "status"] };
}

export function parseCodexAuthStatus(stdout = "", stderr = "") {
  const text = `${stdout}\n${stderr}`.trim();
  if (/^logged in using chatgpt\.?$/i.test(text)) return { ok: true, method: "chatgpt", subscription: "chatgpt" };
  return { ok: false, method: /api key/i.test(text) ? "api-key" : "unknown", reason: text || "Codex auth status unavailable" };
}

export function buildCodexInvocation({ modelId, effort, cwd = null, writeAccess = false }, {
  platform = process.platform,
  env = process.env,
} = {}) {
  const model = assertSafeModelId(modelId, "Codex");
  const level = safeEffort(effort);
  const args = [
    "exec", "-m", model,
    "--sandbox", writeAccess ? "workspace-write" : "read-only",
    "--skip-git-repo-check",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "-c", `model_reasoning_effort=${level}`,
    "--color", "never",
    "-",
  ];
  const resolved = resolveCodexCommand({ platform, env });
  return { command: resolved.command, args: [...resolved.prefixArgs, ...args] };
}

export function parseCodexPlain(stdout, stderr) {
  const output = parseJsonValue(String(stdout || "").trim());
  const observedModel = String(stderr || "").match(/^model:\s*([^\s]+)\s*$/im)?.[1] || null;
  const tokenText = String(stderr || "").match(/tokens used\s*\r?\n\s*([\d,]+)/i)?.[1] || null;
  const totalTokens = tokenText == null ? null : Number(tokenText.replace(/,/g, ""));
  return { output, usage: Number.isFinite(totalTokens) ? { total_tokens: totalTokens } : null, observedModel };
}

export function createCodexAdapter({ spawn } = {}) {
  return {
    verifySubscriptionAuth({ env, timeoutMs = 10_000 }) {
      const childEnv = subscriptionOnlyDispatchEnv(env);
      const raw = runInvocation(buildCodexAuthInvocation({ env: childEnv }), { env: childEnv, timeoutMs, spawn });
      if (raw.exitCode !== 0) return { ok: false, reason: raw.stderr || raw.stdout || `auth status exit ${raw.exitCode}` };
      return parseCodexAuthStatus(raw.stdout, raw.stderr);
    },
    execute({ modelId, effort, cwd, prompt, timeoutMs, env, writeAccess = false }) {
      const childEnv = subscriptionOnlyDispatchEnv(env);
      const raw = runInvocation(buildCodexInvocation({ modelId, effort, cwd, writeAccess }, { env: childEnv }), {
        input: prompt, env: childEnv, cwd, timeoutMs, spawn,
      });
      if (raw.exitCode !== 0) return { ...raw, output: null, observedModel: null, usage: null };
      try { return { ...raw, ...parseCodexPlain(raw.stdout, raw.stderr) }; }
      catch (error) { return { ...raw, exitCode: 1, output: null, observedModel: null, usage: null,
        stderr: [raw.stderr, `invalid Codex output: ${error.message}`].filter(Boolean).join("\n") }; }
    },
  };
}
