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
/** Calls waiting behind the one running; beyond this a call is refused at once. */
const MAX_QUEUED = 4;
/** A queued call that waited this long is dropped: its caller has likely given up. */
const MAX_QUEUE_WAIT_MS = 20_000;

let child: ChildProcess | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let nextId = 1;
let chain: Promise<unknown> = Promise.resolve();
let queued = 0;
/** Releases are monthly; re-list the bucket at most every six hours. */
const RELEASE_TTL_MS = 6 * 60 * 60 * 1000;
let release: { value: PlacesRelease; at: number } | null = null;

async function currentRelease(): Promise<PlacesRelease> {
  if (release && Date.now() - release.at < RELEASE_TTL_MS) return release.value;
  release = { value: await resolvePlacesRelease(), at: Date.now() };
  return release.value;
}

function workerEntry(): { path: string; execArgv: string[] } {
  // Compiled: dist/capabilities/lib/overture-places/worker.js. Under tsx or vitest the
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
  const forget = () => {
    if (child === c) child = null;
  };
  c.on("exit", forget);
  // Spawn and IPC failures arrive as 'error'; unhandled, they would crash the
  // API process. The pending call rejects through its own listener in runOne.
  c.on("error", forget);
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
    const onError = (err: Error) => {
      cleanup();
      stop();
      reject(new Error(`Overture places worker failed: ${err.message}`));
    };
    function cleanup() {
      clearTimeout(timer);
      c.off("message", onMessage);
      c.off("exit", onExit);
      c.off("error", onError);
      if (child === c) {
        idleTimer = setTimeout(stop, IDLE_MS);
        idleTimer.unref();
      }
    }
    c.on("message", onMessage);
    c.on("exit", onExit);
    c.on("error", onError);
    c.send({ id, release: placesRelease, query }, (err) => {
      if (err) onError(err);
    });
  });
}

/**
 * Queries run one after another: the worker's DuckDB memory limit is per
 * process. The queue is short and its waits are bounded, so a burst is refused
 * quickly rather than leaving work running for callers that have gone.
 */
export function queryPlaces(query: PlacesQuery): Promise<PlacesResult> {
  if (queued >= MAX_QUEUED) {
    return Promise.reject(new Error("Overture places search is rate limited: too many searches queued; retry in a few seconds"));
  }
  queued++;
  const enqueuedAt = Date.now();
  const run = chain.then(async () => {
    queued--;
    if (Date.now() - enqueuedAt > MAX_QUEUE_WAIT_MS) {
      throw new Error("Overture places search is rate limited: the search waited too long in the queue; retry in a few seconds");
    }
    return runOne(await currentRelease(), query);
  });
  chain = run.catch(() => undefined);
  return run;
}

/** Test hook: stop the worker now. */
export function stopPlacesWorker(): void {
  stop();
}
