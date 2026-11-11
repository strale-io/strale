/**
 * HTML → Markdown conversion, off the event loop and under a time limit
 * (robustness R1).
 *
 * url-to-markdown is free-tier and keyless, so anyone can point it at a page
 * built to be slow. The conversion is synchronous (jsdom, Readability,
 * Turndown) and its cost is not bounded by any limit on the markup: the
 * independent review of #964 measured 10-80 s for pages that pass every
 * markup limit (29k flat <div>, 15 MB of text in one <p>). Run on the main
 * thread, that is 10-80 s in which no other request is served.
 *
 * So the conversion runs in a worker thread
 * (readability-worker.ts). Each conversion has a wall-clock limit and each
 * worker a heap limit; past either, the worker is terminated, replaced, and
 * the caller gets HtmlTooComplexError, a non-billable refusal. When every
 * worker is busy, a bounded queue holds further pages; a full queue is
 * refused at once rather than piling up.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { logWarn } from "../../lib/log.js";
import { currentCallerKey } from "../../lib/caller-scope.js";
import { ResourceLimitError } from "../../lib/resource-limits.js";
import { HtmlTooComplexError } from "./html-parse-bound.js";
import type {
  MarkdownOptions,
  ReadabilityResult,
} from "./readability-convert-sync.js";

export type {
  MarkdownOptions,
  ReadabilityResult,
} from "./readability-convert-sync.js";

export const CONVERSION_LIMITS = {
  /**
   * Worker threads converting at once. One: memory per conversion depends on
   * the page's markup, not its size (64 attributes per tag in 256 KiB reached
   * +314 MB; two such pages at once +605 MB, fifth R1 review), so the only
   * bound that holds for every page shape on a 1 GB box is one conversion at
   * a time. Ordinary pages take 0.5-1 s; a 1.3 MB article about 3 s.
   */
  workers: 1,
  /** Wall-clock limit for one conversion, from the moment a worker takes it. */
  timeoutMs: 8_000,
  /**
   * Heap limits per worker (MB). The API runs on a 1 GB Railway box
   * (web-provider.ts). At 256 a dense 1 MiB article ran out of heap; at 384
   * the time limit binds first. One hostile page converting alone measured
   * +314 to +438 MB of process memory (fourth and fifth R1 reviews).
   */
  maxOldGenerationSizeMb: 384,
  maxYoungGenerationSizeMb: 48,
  /**
   * Characters of HTML handed to the converter; the rest of a longer page is
   * dropped. The Markdown is cut to 50,000 characters anyway, a 4 MiB article
   * already runs into the time limit, and the R1 reviews measured 650-775 MB
   * of process memory for one 15 MB conversion.
   */
  maxInputChars: 2 * 1024 * 1024,
  /**
   * Pages waiting for the worker; beyond this a page is refused at once. With
   * one worker, a longer queue only makes callers wait to be refused.
   */
  maxQueued: 4,
  /**
   * Longest a page waits for the worker before it is refused: one timed-out
   * page, a respawn and one ordinary page (sixth R1 review).
   */
  maxQueueWaitMs: 13_000,
  /** How long a stopped worker may take to exit before its slot is freed anyway. */
  exitWatchdogMs: 5_000,
  /** Refusal period after this caller makes the converter hit a resource limit. */
  callerCooldownMs: 30_000,
  /** Suggested delay before retrying a converter-busy refusal. */
  busyRetryAfterMs: 5_000,
};

/** Refused because every converter is busy; non-billable, worth retrying. */
export class ConversionBusyError extends ResourceLimitError {
  readonly retryAfterSeconds = CONVERSION_LIMITS.busyRetryAfterMs / 1000;

  constructor() {
    super(
      "The page converter is busy with other pages. Please retry in a few seconds."
    );
    this.name = "ConversionBusyError";
  }
}

/** Refused because this caller recently exhausted a converter resource limit. */
export class ConversionCallerCooldownError extends ResourceLimitError {
  readonly retryAfterSeconds = CONVERSION_LIMITS.callerCooldownMs / 1000;

  constructor() {
    super(
      `Pages you sent recently took too long or too much memory to convert. Please retry in ${
        CONVERSION_LIMITS.callerCooldownMs / 1000
      } seconds.`
    );
    this.name = "ConversionCallerCooldownError";
  }
}

type Reply =
  | { id: number; ok: true; result: ReadabilityResult }
  | { id: number; ok: false; tooComplex: boolean; message: string };

interface Job {
  id: number;
  html: string;
  url: string;
  options?: MarkdownOptions;
  queuedAt: number;
  resolve: (r: ReadabilityResult) => void;
  reject: (e: unknown) => void;
  queueTimer?: NodeJS.Timeout;
  callerKey: string | null;
}

const MAX_CALLER_COOLDOWNS = 10_000;
const callerCooldowns = new Map<string, number>();

function pruneCooldowns(now = Date.now()): void {
  for (const [key, until] of callerCooldowns)
    if (until <= now) callerCooldowns.delete(key);
}
function coolDown(key: string): void {
  pruneCooldowns();
  callerCooldowns.delete(key);
  callerCooldowns.set(key, Date.now() + CONVERSION_LIMITS.callerCooldownMs);
  while (callerCooldowns.size > MAX_CALLER_COOLDOWNS)
    callerCooldowns.delete(callerCooldowns.keys().next().value!);
}
function releaseCaller(job: Job, limited = false): void {
  if (!job.callerKey) return;
  if (limited) coolDown(job.callerKey);
}
/** Refuse before fetching when this caller is still cooling down. */
export function assertConverterAvailableForCaller(): void {
  const key = currentCallerKey();
  if (!key) return;
  const now = Date.now();
  pruneCooldowns(now);
  if ((callerCooldowns.get(key) ?? 0) > now)
    throw new ConversionCallerCooldownError();
}

/** Tests only: observe the bounded cooldown collection. */
export function __callerCooldownCountForTests(): number {
  pruneCooldowns();
  return callerCooldowns.size;
}
/** Tests only: exercise the production insertion/eviction path without 10,001 timeouts. */
export function __coolDownCallerForTests(key: string): void {
  coolDown(key);
}

// In production this module and the worker are compiled .js. Under tsx (dev,
// tests) both are TypeScript, and a worker thread does not inherit tsx's
// loader, so the worker starts from a bootstrap that registers it first.
function createWorker(options: {
  resourceLimits: {
    maxOldGenerationSizeMb: number;
    maxYoungGenerationSizeMb: number;
  };
}): Worker {
  const self = fileURLToPath(import.meta.url);
  if (self.endsWith(".ts")) {
    const tsxApi = import.meta.resolve("tsx/esm/api");
    const entry = new URL("./readability-worker.ts", import.meta.url).href;
    const bootstrap = `import(${JSON.stringify(
      tsxApi
    )}).then((m) => { m.register(); return import(${JSON.stringify(
      entry
    )}); });`;
    return new Worker(bootstrap, { ...options, eval: true });
  }
  const url = new URL("./readability-worker.js", import.meta.url);
  if (!existsSync(fileURLToPath(url)))
    throw new Error(`readability worker missing at ${fileURLToPath(url)}`);
  return new Worker(url, options);
}

type WorkerFactory = typeof createWorker;
let workerFactory: WorkerFactory = createWorker;
/** Tests only: replace how workers are created (null restores the real one). */
export function __setWorkerFactoryForTests(
  factory: WorkerFactory | null
): void {
  workerFactory = factory ?? createWorker;
}

function tooComplex(message: string): HtmlTooComplexError {
  const e = new HtmlTooComplexError("over a conversion limit");
  e.message = message;
  return e;
}

/**
 * One worker and the job it runs. The slot is busy from the moment a job
 * starts until the job is answered AND, if the worker was stopped or died,
 * until that worker has exited: a replacement never runs beside a worker that
 * is still releasing its heap (fifth R1 review, finding 4).
 */
class Slot {
  private worker: Worker | null = null;
  job: Job | null = null;
  /** True while a stopped or dying worker has not exited yet. */
  private closing = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly onFree: () => void) {}

  get busy(): boolean {
    return this.job !== null || this.closing;
  }

  private spawn(): Worker {
    const w = workerFactory({
      resourceLimits: {
        maxOldGenerationSizeMb: CONVERSION_LIMITS.maxOldGenerationSizeMb,
        maxYoungGenerationSizeMb: CONVERSION_LIMITS.maxYoungGenerationSizeMb,
      },
    });
    w.unref(); // an idle converter never keeps the process alive
    w.on("message", (reply: Reply) => {
      const job = this.job;
      if (this.worker !== w || !job || reply.id !== job.id) return;
      this.answered();
      releaseCaller(job);
      if (reply.ok) job.resolve(reply.result);
      else
        job.reject(
          reply.tooComplex
            ? tooComplex(reply.message)
            : new Error(reply.message)
        );
      this.onFree();
    });
    // A worker error (heap limit, crash) fails its job at once; the slot
    // stays busy until the worker has exited.
    w.on("error", (err: unknown) => {
      if (this.worker !== w) return;
      this.closing = true;
      this.watchExit(w);
      const job = this.job;
      if (!job) return;
      this.answered();
      const oom =
        err instanceof Error &&
        /ERR_WORKER_OUT_OF_MEMORY|heap/i.test(
          `${(err as { code?: string }).code ?? ""} ${err.message}`
        );
      if (oom) {
        releaseCaller(job, true);
        job.reject(
          tooComplex(
            new HtmlTooComplexError(
              "it needs more memory than the converter allows"
            ).message
          )
        );
      } else {
        releaseCaller(job);
        // The log keeps the detail; the caller gets a plain message.
        logWarn(
          "readability-worker-error",
          err instanceof Error ? err.message : String(err)
        );
        job.reject(new Error("The page converter failed. Please retry."));
      }
    });
    w.on("exit", (code) => {
      if (this.worker !== w) return;
      this.worker = null;
      this.closing = false;
      const job = this.job;
      if (job) {
        this.answered();
        releaseCaller(job);
        job.reject(
          new Error(
            `The page converter stopped unexpectedly (code ${code}). Please retry.`
          )
        );
      }
      this.onFree();
    });
    return w;
  }

  run(job: Job): void {
    // A worker that cannot start fails this job only; the slot stays free.
    if (!this.worker) {
      try {
        this.worker = this.spawn();
      } catch (err) {
        // The log keeps the detail (a file path, in production); the caller
        // gets a plain message.
        logWarn(
          "readability-worker-spawn-failed",
          err instanceof Error ? err.message : String(err)
        );
        releaseCaller(job);
        job.reject(
          new Error("The page converter could not start. Please retry later.")
        );
        this.onFree();
        return;
      }
    }
    this.job = job;
    const w = this.worker;
    this.timer = setTimeout(() => {
      // Answer the caller now; the slot frees when the worker has exited.
      this.closing = true;
      const j = this.job;
      this.answered();
      if (j) releaseCaller(j, true);
      j?.reject(
        tooComplex(
          new HtmlTooComplexError(
            `conversion did not finish within ${
              CONVERSION_LIMITS.timeoutMs / 1000
            } s`
          ).message
        )
      );
      void w.terminate();
      this.watchExit(w);
    }, CONVERSION_LIMITS.timeoutMs);
    w.postMessage({
      id: job.id,
      html: job.html,
      url: job.url,
      options: job.options,
    });
  }

  /**
   * Frees the slot if a stopping worker has not exited after exitWatchdogMs.
   * Node always emits "exit", but with one worker a lost event would refuse
   * every page until a restart, so this is the backstop (sixth R1 review).
   */
  private watchExit(w: Worker): void {
    const timer = setTimeout(() => {
      if (this.worker !== w || !this.closing) return;
      logWarn(
        "readability-worker-exit-timeout",
        `worker did not exit within ${CONVERSION_LIMITS.exitWatchdogMs} ms; freeing its slot`
      );
      this.worker = null;
      this.closing = false;
      this.onFree();
    }, CONVERSION_LIMITS.exitWatchdogMs);
    timer.unref();
  }

  /** The current job has its answer; clears it and its timer. */
  private answered(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.job = null;
  }

  async stop(): Promise<void> {
    const w = this.worker;
    const job = this.job;
    this.answered();
    this.worker = null;
    this.closing = false;
    if (job) releaseCaller(job);
    job?.reject(new ConversionBusyError());
    // Bounded: a worker that never exits must not hang shutdown.
    if (w) {
      await Promise.race([
        w.terminate(),
        new Promise((resolve) =>
          setTimeout(resolve, CONVERSION_LIMITS.exitWatchdogMs).unref()
        ),
      ]);
    }
  }
}

let nextId = 1;
let slots: Slot[] = [];
const queue: Job[] = [];

/** Last dispatch time by caller bucket; insertion order makes oldest eviction O(1). */
const lastServed = new Map<string, number>();
const MAX_LAST_SERVED = 10_000;
let serveSequence = 0;

function callerBucket(job: Job): string {
  return job.callerKey ?? "__unkeyed__";
}
function rememberServed(bucket: string): void {
  lastServed.delete(bucket);
  lastServed.set(bucket, ++serveSequence);
  while (lastServed.size > MAX_LAST_SERVED)
    lastServed.delete(lastServed.keys().next().value!);
}

/** Hands queued pages to free workers, round-robin by least recently served caller. */
function dispatch(): void {
  for (const slot of slots) {
    if (slot.busy) continue;
    let selected = 0;
    let least = Number.POSITIVE_INFINITY;
    for (let i = 0; i < queue.length; i++) {
      const served =
        lastServed.get(callerBucket(queue[i]!)) ?? Number.NEGATIVE_INFINITY;
      if (served < least) {
        least = served;
        selected = i;
      }
    }
    const [job] = queue.splice(selected, 1);
    if (!job) return;
    if (job.queueTimer) clearTimeout(job.queueTimer);
    rememberServed(callerBucket(job));
    slot.run(job);
  }
}

function ensureSlots(): void {
  while (slots.length < CONVERSION_LIMITS.workers)
    slots.push(new Slot(() => setImmediate(dispatch)));
}

/**
 * Convert HTML to clean Markdown with Readability + Turndown, in a worker.
 * Rejects with HtmlTooComplexError past a limit, ConversionBusyError when the
 * queue is full; both are non-billable refusals.
 */
export async function htmlToCleanMarkdown(
  html: string,
  url: string,
  options?: MarkdownOptions
): Promise<ReadabilityResult> {
  const queuedAt = Date.now();
  // Everything before the first await runs synchronously, so a page is queued
  // (or refused) before this call returns, as when this was not async.
  try {
    ensureSlots();
    assertConverterAvailableForCaller();
    const callerKey = currentCallerKey();
    if (queue.length >= CONVERSION_LIMITS.maxQueued) admitOrRefuse(callerKey);
    const input = boundInput(html);
    return await new Promise<ReadabilityResult>((resolve, reject) => {
      const job: Job = {
        id: nextId++,
        html: input,
        url,
        options,
        queuedAt,
        resolve,
        reject,
        callerKey,
      };
      job.queueTimer = setTimeout(() => {
        const i = queue.indexOf(job);
        if (i >= 0) {
          queue.splice(i, 1);
          releaseCaller(job);
          reject(new ConversionBusyError());
        }
      }, CONVERSION_LIMITS.maxQueueWaitMs);
      queue.push(job);
      dispatch();
    });
  } catch (err) {
    // Every refusal is logged with its reason and how long it took, so real
    // pages that hit the limits show up (second R1 review of #964, F8).
    if (err instanceof ResourceLimitError) {
      logWarn("readability-convert-refused", err.message, {
        reason: err.name,
        ms: Date.now() - queuedAt,
        input_chars: html.length, // never the URL: what customers fetch is not logged
      });
    }
    throw err;
  }
}

/**
 * The queue is full. A keyed caller may take the place of the newest queued
 * page of a caller holding at least 2 more queued pages than it; that page is
 * refused as busy. Otherwise the new page is refused. Unkeyed pages neither
 * evict nor are evicted. Throws ConversionBusyError when the page is refused.
 */
function admitOrRefuse(callerKey: string | null): void {
  if (!callerKey) throw new ConversionBusyError();
  const counts = new Map<string, { count: number; newestIndex: number }>();
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i]!.callerKey;
    if (!key) continue; // unkeyed pages neither evict nor are evicted
    const current = counts.get(key);
    counts.set(key, { count: (current?.count ?? 0) + 1, newestIndex: i });
  }
  const incomingCount = counts.get(callerKey)?.count ?? 0;
  let candidate: { key: string; count: number; newestIndex: number } | null =
    null;
  for (const [key, value] of counts) {
    if (
      !candidate ||
      value.count > candidate.count ||
      (value.count === candidate.count &&
        value.newestIndex > candidate.newestIndex)
    ) {
      candidate = { key, ...value };
    }
  }
  if (!candidate || candidate.count < incomingCount + 2) {
    throw new ConversionBusyError();
  }
  const [evicted] = queue.splice(candidate.newestIndex, 1);
  if (evicted?.queueTimer) clearTimeout(evicted.queueTimer);
  if (evicted) {
    releaseCaller(evicted);
    evicted.reject(new ConversionBusyError());
  }
}

/**
 * Cuts the HTML at maxInputChars. It cuts before a tag that starts within the
 * last 64 KiB, so no tag is split; otherwise (one long run of text crosses the
 * limit) it cuts the text there. Cutting at an earlier "<" could drop the
 * whole page: `<p>` and 15 MB of words would keep only `<html><body>` (third
 * R1 review, M1). parse5 handles a cut anywhere; a surrogate pair is never split.
 */
export function boundInput(html: string): string {
  const max = CONVERSION_LIMITS.maxInputChars;
  if (html.length <= max) return html;
  const lt = html.lastIndexOf("<", max);
  let cut = lt > 0 && max - lt <= 64 * 1024 ? lt : max;
  const c = html.charCodeAt(cut - 1);
  if (c >= 0xd800 && c <= 0xdbff) cut -= 1; // high surrogate: keep the pair together
  return html.slice(0, cut);
}

/** Stops every converter (tests, shutdown). Queued pages are refused. */
export async function stopConversionWorkers(): Promise<void> {
  for (const job of queue.splice(0)) {
    if (job.queueTimer) clearTimeout(job.queueTimer);
    releaseCaller(job);
    job.reject(new ConversionBusyError());
  }
  const old = slots;
  slots = [];
  await Promise.all(old.map((s) => s.stop()));
}
