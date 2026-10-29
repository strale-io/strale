/**
 * Parent side of places-search: forks ./worker on first use, sends it one
 * query at a time, and stops it after IDLE_MS without calls so its DuckDB
 * memory is released (see worker.ts for why it is a separate process).
 */
import { fork, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolvePlacesRelease, type PlacesQuery, type PlacesRelease, type PlacesResult, type WorkerResponse } from "./shared.js";

const IDLE_MS = 120_000;
/** Covers a cold start (extension load, release index) plus the query. */
const QUERY_TIMEOUT_MS = 45_000;

let child: ChildProcess | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let nextId = 1;
let chain: Promise<unknown> = Promise.resolve();
/** Releases are monthly; re-list the bucket at most every six hours. */
const RELEASE_TTL_MS = 6 * 60 * 60 * 1000;
let release: { value: PlacesRelease; at: number } | null = null;

async function currentRelease(): Promise<PlacesRelease> {
  if (release && Date.now() - release.at < RELEASE_TTL_MS) return release.value;
  release = { value: await resolvePlacesRelease(), at: Date.now() };
  return release.value;
}

function workerEntry(): { path: string; execArgv: string[] } {
  // Compiled: dist/lib/overture-places/worker.js. Under tsx or vitest the
  // parent runs from .ts source, so the child needs tsx's loader too.
  const fromSource = import.meta.url.endsWith(".ts");
  return {
    path: fileURLToPath(new URL(fromSource ? "./worker.ts" : "./worker.js", import.meta.url)),
    execArgv: fromSource ? ["--import", "tsx"] : [],
  };
}

function stop(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  child?.kill();
  child = null;
}

function worker(): ChildProcess {
  if (child && child.connected) return child;
  const { path, execArgv } = workerEntry();
  const c = fork(path, [], { execArgv, stdio: ["ignore", "ignore", "inherit", "ipc"] });
  c.on("exit", () => {
    if (child === c) child = null;
  });
  child = c;
  return c;
}

function runOne(placesRelease: PlacesRelease, query: PlacesQuery): Promise<PlacesResult> {
  if (idleTimer) clearTimeout(idleTimer);
  const c = worker();
  const id = nextId++;
  return new Promise<PlacesResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      // A stuck query holds the worker; restart it rather than queue behind it.
      stop();
      reject(new Error(`Overture places query timed out after ${QUERY_TIMEOUT_MS / 1000}s`));
    }, QUERY_TIMEOUT_MS);
    const onMessage = (msg: WorkerResponse) => {
      if (msg.id !== id) return;
      // Forget a retiring worker now, so the next call forks a fresh one
      // instead of racing its exit.
      if (msg.retire && child === c) child = null;
      cleanup();
      if (msg.ok) resolve(msg.result);
      else reject(new Error(`Overture places query failed: ${msg.error}`));
    };
    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`Overture places worker exited (code ${code ?? "signal"})`));
    };
    function cleanup() {
      clearTimeout(timer);
      c.off("message", onMessage);
      c.off("exit", onExit);
      if (child === c) {
        idleTimer = setTimeout(stop, IDLE_MS);
        idleTimer.unref();
      }
    }
    c.on("message", onMessage);
    c.on("exit", onExit);
    c.send({ id, release: placesRelease, query });
  });
}

/** Queries run one after another: the worker's DuckDB memory limit is per process. */
export function queryPlaces(query: PlacesQuery): Promise<PlacesResult> {
  const run = chain.then(async () => runOne(await currentRelease(), query));
  chain = run.catch(() => undefined);
  return run;
}

/** Test hook: stop the worker now. */
export function stopPlacesWorker(): void {
  stop();
}
