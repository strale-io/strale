/**
 * H8 (DEC-20261029-A): ship pino's already-redacted JSON lines to Better Stack.
 *
 * Plain HTTP instead of `@logtail/pino`, because the request path's safety is
 * the whole requirement and this is the shape that can be read in one sitting:
 *
 * - `write()` only appends to an in-memory buffer. It never awaits, never
 *   throws, and never touches the network.
 * - The buffer is bounded by line count. A full buffer drops the new line and
 *   counts it, so a dead sink costs at most `maxBufferLines` lines of memory.
 * - A timer (unref'd, so it never keeps the process alive) sends one batch at a
 *   time with a timeout. A failed batch is dropped, never retried, and the sink
 *   pauses before the next attempt so a quota or token error is not hammered;
 *   lines written meanwhile wait in the same bounded buffer.
 * - Failures are reported on stderr, rate-limited, and never through pino: a
 *   sink that logs its own failure into itself loops.
 *
 * Lines arrive here after `logOptions` has redacted them (log.ts), so this
 * module sees exactly what stdout sees.
 */

const LEVEL_LABELS: Record<number, string> = { 10: "trace", 20: "debug", 30: "info", 40: "warn", 50: "error", 60: "fatal" };

/** Better Stack ingesting hosts. Anything else is refused so a mis-set var cannot send logs elsewhere. */
const ALLOWED_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(betterstackdata\.com|betterstack\.com)$/;

export type SinkConfig =
  | { state: "enabled"; token: string; host: string }
  | { state: "disabled"; reason: string }
  | { state: "misconfigured"; reason: string };

/** Decide from the environment whether to ship. Pure, so the gates are tested in-process. */
export function resolveSinkConfig(env: NodeJS.ProcessEnv = process.env): SinkConfig {
  if (env.VITEST === "true" || env.VITEST === "1" || env.NODE_ENV === "test") {
    return { state: "disabled", reason: "test runner" };
  }
  const token = env.BETTERSTACK_SOURCE_TOKEN?.trim();
  const rawHost = env.BETTERSTACK_INGEST_HOST?.trim();
  if (!token && !rawHost) return { state: "disabled", reason: "BETTERSTACK_SOURCE_TOKEN and BETTERSTACK_INGEST_HOST unset" };
  if (!token || !rawHost) {
    return { state: "misconfigured", reason: `${token ? "BETTERSTACK_INGEST_HOST" : "BETTERSTACK_SOURCE_TOKEN"} unset` };
  }
  const host = rawHost.replace(/^https?:\/\//i, "").replace(/\/+$/, "").toLowerCase();
  if (!ALLOWED_HOST.test(host)) return { state: "misconfigured", reason: "BETTERSTACK_INGEST_HOST is not a Better Stack ingesting host" };
  return { state: "enabled", token, host };
}

export interface SinkOptions {
  token: string;
  host: string;
  fetchImpl?: typeof fetch;
  maxBufferLines?: number;
  maxBatchLines?: number;
  /** Characters per request; Better Stack refuses bodies over 10 MiB. */
  maxBatchChars?: number;
  flushIntervalMs?: number;
  timeoutMs?: number;
  pauseAfterFailureMs?: number;
  reportFailure?: (message: string) => void;
  now?: () => number;
}

export interface LogSink {
  /** pino destination. Synchronous, bounded, never throws. */
  write(line: string): void;
  /** Send what is buffered. Resolves when the in-flight batch settles; never rejects. */
  flush(): Promise<void>;
  /** Stop the timer and send what is left. */
  close(): Promise<void>;
  stats(): { buffered: number; sent: number; dropped: number };
}

/** pino line → Better Stack event: `dt` for the timestamp, a level label the alert can match. */
function toEvent(line: string): string | null {
  try {
    const row = JSON.parse(line) as Record<string, unknown>;
    const { time, level, ...rest } = row;
    const event: Record<string, unknown> = { dt: typeof time === "number" ? new Date(time).toISOString() : time, ...rest };
    event.level = typeof level === "number" ? (LEVEL_LABELS[level] ?? String(level)) : level;
    return JSON.stringify(event);
  } catch {
    return null;
  }
}

export function createBetterStackSink(opts: SinkOptions): LogSink {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const maxBufferLines = opts.maxBufferLines ?? 5_000;
  const maxBatchLines = opts.maxBatchLines ?? 500;
  const maxBatchChars = opts.maxBatchChars ?? 1_000_000;
  const timeoutMs = opts.timeoutMs ?? 5_000;
  const pauseAfterFailureMs = opts.pauseAfterFailureMs ?? 60_000;
  const now = opts.now ?? Date.now;
  const report = opts.reportFailure ?? ((message: string) => { process.stderr.write(`${message}\n`); });
  const url = `https://${opts.host}`;

  let buffer: string[] = [];
  let sent = 0;
  let dropped = 0;
  let pausedUntil = 0;
  let lastReportAt = -Infinity;
  let inFlight: Promise<void> | null = null;

  /** stderr, at most once per pause window, so a sink problem never floods it. */
  function reportLimited(entry: Record<string, unknown>): void {
    if (now() - lastReportAt < pauseAfterFailureMs) return;
    lastReportAt = now();
    report(JSON.stringify(entry));
  }

  function fail(count: number, why: string): void {
    dropped += count;
    pausedUntil = now() + pauseAfterFailureMs;
    reportLimited({ label: "log-sink.batch-dropped", why, lines: count, dropped_total: dropped });
  }

  async function send(batch: string[]): Promise<void> {
    const events = batch.map(toEvent).filter((e): e is string => e !== null);
    dropped += batch.length - events.length;
    if (events.length === 0) return;
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.token}`, "Content-Type": "application/x-ndjson" },
        body: events.join("\n"),
        signal: AbortSignal.timeout(timeoutMs),
      });
      await res.body?.cancel().catch((err: unknown) =>
        reportLimited({ label: "log-sink.body-cancel-failed", why: err instanceof Error ? err.name : "error" }));
      if (res.status >= 200 && res.status < 300) sent += events.length;
      else fail(events.length, `http ${res.status}`);
    } catch (err) {
      fail(events.length, err instanceof Error ? err.name : "error");
    }
  }

  function flush(): Promise<void> {
    if (inFlight) return inFlight;
    if (buffer.length === 0 || now() < pausedUntil) return Promise.resolve();
    let take = 0;
    for (let chars = 0; take < buffer.length && take < maxBatchLines; take++) {
      chars += buffer[take].length;
      if (take > 0 && chars > maxBatchChars) break;
    }
    const batch = buffer.slice(0, take);
    buffer = buffer.slice(take);
    inFlight = send(batch).finally(() => { inFlight = null; });
    return inFlight;
  }

  const timer = setInterval(() => { void flush(); }, opts.flushIntervalMs ?? 2_000);
  timer.unref?.();

  return {
    write(line: string): void {
      if (buffer.length >= maxBufferLines) { dropped += 1; return; }
      buffer.push(line);
      if (buffer.length >= maxBatchLines) void flush();
    },
    flush,
    // Bounded by the shutdown budget in shutdown.ts: lines logged after this
    // (or after a forced exit) reach stdout only.
    async close(): Promise<void> {
      clearInterval(timer);
      for (let i = 0; i < 10 && buffer.length > 0 && now() >= pausedUntil; i++) await flush();
      await inFlight;
    },
    stats: () => ({ buffered: buffer.length, sent, dropped }),
  };
}
