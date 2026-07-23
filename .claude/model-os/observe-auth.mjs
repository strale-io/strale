#!/usr/bin/env node
// Zero-generation auth observer for the registry migration. It verifies that
// each CLI is subscription-authenticated before the bounded entitlement probe
// may run. It stores no account identity, email, org id, or token.

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { withCodexAppServer } from "./codex-app-server.mjs";
import { findLedger } from "./select.mjs";
import { findPolicy, readPolicy } from "./route-state.mjs";
import { validateLedgerPolicyCompatibility } from "./schema.mjs";
import { resolveStateDir, writeObservations } from "./state-store.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 8_000;

function safeError(error) {
  return String(error?.message || error || "unknown error").replace(/[\r\n]+/g, " ").slice(0, 200);
}

export async function readCodexAuth() {
  return withCodexAppServer((request) => request("account/read", { refreshToken: false }), {
    timeoutMs: TIMEOUT_MS,
    clientName: "model_os_auth_observer",
    clientTitle: "MODEL-OS Auth Observer",
    clientVersion: "2.0.0",
  });
}

export function readClaudeAuth() {
  const windows = process.platform === "win32";
  const command = windows ? (process.env.ComSpec || "C:\\Windows\\System32\\cmd.exe") : "claude";
  const args = windows ? ["/d", "/s", "/c", "claude.cmd auth status --json"] : ["auth", "status", "--json"];
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false,
    timeout: TIMEOUT_MS,
    maxBuffer: 64 * 1024,
  });
  if (result.status !== 0) throw new Error(result.error?.message || result.stderr || "claude auth status failed");
  return JSON.parse(result.stdout);
}

function authObservation(verified, now, ttl, source, reason) {
  return { state: verified ? "disabled" : "unknown", observed_at: now, source,
    confidence: verified ? "high" : "low", ttl, reason };
}

export async function observeAuthGuards({ ledger, policy, stateDir = null,
  now = new Date().toISOString(), readCodex = readCodexAuth, readClaude = readClaudeAuth } = {}) {
  if (!ledger || !policy) throw new Error("auth observer requires registry and policy");
  const ttl = policy.observation_ttl?.spend_guard;
  if (!Number.isFinite(ttl) || ttl <= 0) throw new Error("policy observation_ttl.spend_guard missing or invalid");
  const routes = (ledger.models || []).flatMap((model) => model.access_routes || []);
  const observations = {};
  const summary = {};
  const providers = new Set(routes.map((route) => route.provider));

  if (providers.has("openai")) {
    let verified = false;
    let reason;
    try {
      const result = await readCodex();
      verified = result?.account?.type === "chatgpt";
      reason = verified ? "Codex CLI uses ChatGPT subscription auth; API-key billing fallback is not active" :
        `Codex account type is '${result?.account?.type || "unknown"}'`;
    } catch (error) { reason = `Codex auth unverifiable: ${safeError(error)}`; }
    for (const route of routes.filter((item) => item.provider === "openai")) {
      observations[route.spend_guard_observation] = authObservation(verified, now, ttl,
        "machine:codex-app-server:account/read", reason);
    }
    summary.openai = verified ? "disabled" : "unknown";
  }

  if (providers.has("anthropic")) {
    let verified = false;
    let reason;
    try {
      const result = await readClaude();
      verified = result?.loggedIn === true && result?.authMethod === "claude.ai" &&
        result?.apiProvider === "firstParty" && result?.subscriptionType === "max";
      reason = verified ? "Claude CLI uses first-party claude.ai Max subscription auth; API-key billing fallback is not active" :
        "Claude auth is not a verified first-party claude.ai Max subscription";
    } catch (error) { reason = `Claude auth unverifiable: ${safeError(error)}`; }
    for (const route of routes.filter((item) => item.provider === "anthropic")) {
      observations[route.spend_guard_observation] = authObservation(verified, now, ttl,
        "machine:claude-auth-status", reason);
    }
    summary.anthropic = verified ? "disabled" : "unknown";
  }

  if (Object.keys(observations).length) writeObservations({ stateDir: resolveStateDir(stateDir), observations });
  return { observed_at: now, guards: summary };
}

function parseArgs(argv) {
  const result = { ledger: findLedger(), policy: null, stateDir: null, json: false };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") result.json = true;
    else if (["--ledger", "--policy", "--state-dir"].includes(arg)) {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === "--ledger") result.ledger = path.resolve(value);
      else if (arg === "--policy") result.policy = path.resolve(value);
      else result.stateDir = path.resolve(value);
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return result;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (!options.ledger) throw new Error("auth observer could not find routing.json");
  const ledger = JSON.parse(readFileSync(options.ledger, "utf8"));
  const policyPath = options.policy || findPolicy(options.ledger) || path.join(HERE, "policy.json");
  const policy = readPolicy(policyPath);
  validateLedgerPolicyCompatibility(ledger, policy);
  const result = await observeAuthGuards({ ledger, policy, stateDir: options.stateDir });
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` :
    `${Object.entries(result.guards).map(([provider, state]) => `${provider}=${state}`).join(" | ")}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`MODEL-OS auth observer failed: ${safeError(error)}\n`);
    process.exitCode = 3;
  });
}
