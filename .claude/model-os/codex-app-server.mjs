#!/usr/bin/env node
// Bounded newline-JSON RPC client shared by account discovery and quota reads.

import { spawn } from "node:child_process";

function boundedText(value, limit = 240) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim().slice(0, limit);
}

function spawnServer(spawnProcess = spawn) {
  if (process.platform === "win32") {
    return spawnProcess(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "codex.cmd app-server --stdio"], {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
  return spawnProcess("codex", ["app-server", "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
}

export async function withCodexAppServer(operation, {
  timeoutMs = 20_000,
  clientName = "model_os",
  clientTitle = "MODEL-OS",
  clientVersion = "2.0.0",
  spawnProcess = spawn,
} = {}) {
  const child = spawnServer(spawnProcess);
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  let buffer = "";
  let stderr = "";
  let nextId = 1;
  let closed = false;
  const pending = new Map();

  function finishPending(error) {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  }

  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-2000); });
  child.on("error", (error) => { closed = true; finishPending(error); });
  child.on("close", (code) => {
    closed = true;
    if (pending.size) finishPending(new Error(`Codex app-server exited ${code}: ${boundedText(stderr)}`));
  });
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    while (buffer.includes("\n")) {
      const split = buffer.indexOf("\n");
      const line = buffer.slice(0, split).trim();
      buffer = buffer.slice(split + 1);
      if (!line) continue;
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      if (message.id === undefined || message.id === null) continue;
      const item = pending.get(message.id);
      if (!item) continue;
      pending.delete(message.id);
      clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else item.resolve(message.result);
    }
  });

  function send(message) {
    if (closed || !child.stdin.writable) throw new Error("Codex app-server is not writable");
    child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  function request(method, params = {}) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try { send({ method, id, params }); } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error);
      }
    });
  }

  try {
    await request("initialize", { clientInfo: { name: clientName, title: clientTitle, version: clientVersion } });
    send({ method: "initialized", params: {} });
    return await operation(request);
  } finally {
    child.stdin.end();
    if (!closed) child.kill();
  }
}
