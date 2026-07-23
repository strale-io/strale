#!/usr/bin/env node
// Phase 2 discovery runner. It reads ratified inputs, calls bounded provider/
// compatibility adapters, and writes only machine-local observations + a report.

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  discoverFromFiles,
  listModelsViaRpc,
  renderDiscoveryReport,
} from "./discovery-lib.mjs";
import { withCodexAppServer } from "./codex-app-server.mjs";
import { atomicWriteFile } from "./state-store.mjs";
import { createProviderRegistry, PROVIDER_PLUGIN_CONTRACT_VERSION } from "./provider-registry.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_API_PAGES = 20;

function boundedText(value, limit = 240) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, limit);
}

export async function discoverCodexAccount() {
  return withCodexAppServer(async (request) => {
    const models = await listModelsViaRpc(request);
    return { status: "ok", method: "app-server:model/list", models };
  }, { timeoutMs: REQUEST_TIMEOUT_MS, clientName: "model_os_discovery",
    clientTitle: "MODEL-OS Discovery", clientVersion: "2.0.0-phase2" });
}

async function fetchJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} from ${url}`);
  return response.json();
}

export async function discoverAnthropicApi() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { status: "skipped", reason: "ANTHROPIC_API_KEY is not configured" };
  const models = [];
  let afterId = null;
  for (let page = 0; page < MAX_API_PAGES; page++) {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);
    const body = await fetchJson(url, { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" } });
    for (const model of body.data || []) if (model?.id) models.push({ id: model.id, displayName: model.display_name || null });
    if (!body.has_more) return { status: "ok", method: "anthropic:/v1/models", models };
    afterId = body.last_id || body.data?.at(-1)?.id;
    if (!afterId) throw new Error("Anthropic model pagination omitted last_id");
  }
  throw new Error(`Anthropic model list exceeded the ${MAX_API_PAGES}-page safety bound`);
}

export async function discoverOpenAiApi() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { status: "skipped", reason: "OPENAI_API_KEY is not configured" };
  const body = await fetchJson("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return {
    status: "ok",
    method: "openai:/v1/models",
    models: (body.data || []).filter((model) => model?.id).map((model) => ({ id: model.id })),
  };
}

export async function fetchOfficialTerm(source, previous = null) {
  const headers = { "user-agent": "MODEL-OS-discovery/2.0 (+https://github.com/)" };
  if (previous?.etag) headers["if-none-match"] = previous.etag;
  if (previous?.last_modified) headers["if-modified-since"] = previous.last_modified;
  const response = await fetch(source.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers,
  });
  if (response.status === 304) return { notModified: true, finalUrl: response.url || source.url,
    etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified") };
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const body = await response.text();
  if (!body.trim()) throw new Error("empty response body");
  return {
    body,
    finalUrl: response.url,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}

export async function inspectLocalCli(requirement) {
  const args = ["--version"];
  let output;
  if (process.platform === "win32") {
    const command = requirement.command === "codex" ? "codex.cmd" : requirement.command === "claude" ? "claude.cmd" : null;
    if (!command) throw new Error(`CLI command '${requirement.command}' is not allowlisted`);
    output = execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `${command} --version`], {
      encoding: "utf8", timeout: 10_000, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
  } else {
    output = execFileSync(requirement.command, args, {
      encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"],
    });
  }
  return { status: "ok", version: boundedText(output) };
}

function parseArgs(argv) {
  const options = {
    ledgerPath: path.join(HERE, "routing.json"),
    policyPath: path.join(HERE, "policy.json"),
    stateDir: null,
    report: null,
    environment: "local",
    json: false,
    respectFreshness: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--if-stale") options.respectFreshness = true;
    else if (["--ledger", "--policy", "--state-dir", "--report", "--environment"].includes(arg)) {
      const value = argv[++index];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === "--ledger") options.ledgerPath = path.resolve(value);
      else if (arg === "--policy") options.policyPath = path.resolve(value);
      else if (arg === "--state-dir") options.stateDir = path.resolve(value);
      else if (arg === "--report") options.report = path.resolve(value);
      else options.environment = value;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  if (!new Set(["local", "ci"]).has(options.environment)) throw new Error("--environment must be local or ci");
  return options;
}

export function defaultDiscoveryAdapters() {
  return createProviderRegistry([
    {
      contract_version: PROVIDER_PLUGIN_CONTRACT_VERSION,
      id: "openai-catalog",
      provider: "openai",
      discovery_adapters: {
        "codex-app-server-model-list": discoverCodexAccount,
        "openai-models-api": discoverOpenAiApi,
      },
      telemetry: { identity: false, usage: false, quota: true, catalog: true },
    },
    {
      contract_version: PROVIDER_PLUGIN_CONTRACT_VERSION,
      id: "anthropic-catalog",
      provider: "anthropic",
      discovery_adapters: {
        "claude-bounded-probe-only": async () => ({
          status: "skipped",
          reason: "Claude Code exposes no stable account model-list interface; use the Phase 1 spend-guarded bounded probe for an event-scoped entitlement check",
        }),
        "anthropic-models-api": discoverAnthropicApi,
      },
      telemetry: { identity: false, usage: false, quota: true, catalog: true },
    },
  ]).discoveryAdapters;
}

export async function runDefaultDiscovery(options) {
  return discoverFromFiles({
    ...options,
    adapters: defaultDiscoveryAdapters(),
    fetchTerm: fetchOfficialTerm,
    inspectCli: inspectLocalCli,
  });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const summary = await runDefaultDiscovery({
    ledgerPath: options.ledgerPath,
    policyPath: options.policyPath,
    stateDir: options.stateDir,
    environment: options.environment,
    respectFreshness: options.respectFreshness,
  });
  if (options.report) {
    atomicWriteFile(options.report, renderDiscoveryReport(summary));
  }
  process.stdout.write(options.json ? `${JSON.stringify(summary, null, 2)}\n` : `${renderDiscoveryReport(summary)}\n`);
  return summary;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`MODEL-OS discovery failed: ${boundedText(error?.stack || error)}\n`);
    process.exitCode = 3;
  });
}
