import { spawnSync } from "node:child_process";
import path from "node:path";

export const DISPATCH_CHILD_ENV = "MODEL_OS_DISPATCH_CHILD";

const METERED_KEY_ENV = new Set([
  "ANTHROPIC_API_KEY",
  "CLAUDE_API_KEY",
  "OPENAI_API_KEY",
  "CODEX_API_KEY",
  "AZURE_OPENAI_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "CLAUDE_CODE_USE_VERTEX",
  "CLAUDE_CODE_USE_FOUNDRY",
  "OPENAI_BASE_URL",
  "ANTHROPIC_BASE_URL",
]);

const ALTERNATE_CREDENTIAL_PREFIXES = [
  "AWS_", "GOOGLE_", "CLOUDSDK_", "AZURE_",
  "ANTHROPIC_BEDROCK_", "ANTHROPIC_VERTEX_", "ANTHROPIC_FOUNDRY_",
];

const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max", "ultra"]);

export function assertSafeModelId(modelId, providerLabel) {
  if (typeof modelId !== "string" || !/^[A-Za-z0-9._:-]+$/.test(modelId)) {
    throw new Error(`unsafe ${providerLabel} model id '${modelId || "missing"}'`);
  }
  return modelId;
}

export function safeEffort(effort, supported = EFFORTS) {
  if (!supported.has(effort)) throw new Error(`unsupported effort '${effort || "missing"}'`);
  return effort;
}

export function subscriptionOnlyEnv(source = process.env) {
  const child = { ...source };
  for (const key of Object.keys(child)) {
    const upper = key.toUpperCase();
    if (METERED_KEY_ENV.has(upper) || ALTERNATE_CREDENTIAL_PREFIXES.some((prefix) => upper.startsWith(prefix))) delete child[key];
  }
  return child;
}

export function subscriptionOnlyDispatchEnv(source = process.env) {
  return { ...subscriptionOnlyEnv(source), MODEL_OS_PROBE_CHILD: "1", [DISPATCH_CHILD_ENV]: "1" };
}

export function resolveWindowsCommand(configured, {
  env = process.env,
  exists,
  nodeExecutable = process.execPath,
} = {}) {
  if (typeof configured !== "string" || !configured || !exists?.(configured)) {
    throw new Error("configured Windows executable does not exist");
  }
  const extension = path.extname(configured).toLowerCase();
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return { command: nodeExecutable, prefixArgs: [configured] };
  }
  if (extension === ".cmd" || extension === ".bat") {
    return { command: env.ComSpec || "C:\\Windows\\System32\\cmd.exe",
      prefixArgs: ["/d", "/s", "/c", "call", configured] };
  }
  if (extension === ".ps1") {
    const powerShell = env.SystemRoot
      ? path.join(env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
      : "powershell.exe";
    return { command: powerShell,
      prefixArgs: ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", configured] };
  }
  return { command: configured, prefixArgs: [] };
}

export function runInvocation(invocation, {
  input = null,
  env,
  cwd,
  timeoutMs = 120_000,
  maxBuffer = 4 * 1024 * 1024,
  spawn = spawnSync,
} = {}) {
  const result = spawn(invocation.command, invocation.args, {
    encoding: "utf8",
    shell: false,
    timeout: timeoutMs,
    maxBuffer,
    windowsHide: true,
    input,
    env,
    cwd,
  });
  return {
    exitCode: Number.isInteger(result.status) ? result.status : 1,
    stdout: result.stdout || "",
    stderr: result.error ? `${result.stderr || ""}\n${result.error.message}`.trim() : (result.stderr || ""),
    signal: result.signal || null,
    timedOut: result.error?.code === "ETIMEDOUT",
  };
}

export function parseJsonValue(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string") throw new Error("provider output is not JSON");
  return JSON.parse(value.trim());
}

export function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") return null;
  const normalized = {};
  for (const [key, value] of Object.entries(usage)) {
    if (Number.isFinite(value)) normalized[key] = value;
  }
  return Object.keys(normalized).length ? normalized : null;
}
