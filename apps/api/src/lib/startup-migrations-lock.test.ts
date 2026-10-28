import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { sql, type SQL } from "drizzle-orm";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { formatStartupError } from "./startup-error.js";

const state = vi.hoisted(() => ({
  held: false,
  sessions: [] as Array<{ unsafe: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }>,
  blockPoolEnd: vi.fn(),
  blockOptions: [] as Array<{ parsers: Record<string, (value: string) => string>; serializers: Record<string, (value: string) => string> }>,
  poolSessions: [] as Array<{ unsafe: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }>,
  db: { execute: vi.fn(), $client: { reserve: vi.fn(), options: { connection: { statement_timeout: 30_000 } } } },
}));
vi.mock("../db/index.js", () => ({ getDb: () => state.db }));
vi.mock("./log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("postgres", () => ({ default: (_url: string, options: { connection: { statement_timeout: number } }) => {
  if (options.connection.statement_timeout !== 5_000) {
    const codecs = { parsers: {}, serializers: {} };
    state.blockOptions.push(codecs);
    return { reserve: state.db.$client.reserve, end: state.blockPoolEnd, options: codecs };
  }
  let owns = false;
  const session = {
    unsafe: vi.fn(async (query: string, binds: unknown[]) => {
      expect(binds).toEqual(["91621622369349"]);
      for (const bind of binds) {
        expect(bind).not.toBeInstanceOf(Date);
        expect(Buffer.isBuffer(bind)).toBe(false);
      }
      if (query.includes("pg_try_advisory_lock")) {
        if (state.held) return [{ acquired: false }];
        state.held = owns = true;
        return [{ acquired: true }];
      }
      expect(owns).toBe(true);
      state.held = owns = false;
      return [{ pg_advisory_unlock: true }];
    }),
    release: vi.fn(),
    end: vi.fn(async () => { if (owns) state.held = owns = false; }),
  };
  state.sessions.push(session);
  return { reserve: async () => session, end: session.end };
} }));
import { BLOCKS, runStartupMigrations } from "./startup-migrations.js";
import { log } from "./log.js";

beforeEach(() => {
  vi.useFakeTimers();
  state.held = false;
  state.sessions = [];
  vi.clearAllMocks();
  state.poolSessions = [];
  state.blockOptions = [];
  state.db.$client.reserve.mockImplementation(async () => {
    const session = { unsafe: vi.fn(async () => []), release: vi.fn() };
    state.poolSessions.push(session);
    return session;
  });
});
afterEach(() => { vi.useRealTimers(); });

// Replace only the block list, never the runner under test. A once-only state
// change models the idempotency contract; all blocks are visited on both boots.
function stubBlocks(run: () => Promise<void>) {
  const mutable = BLOCKS as Array<(db: unknown) => Promise<never>>;
  const original = [...mutable];
  const blocks = original.map((_, i) => vi.fn(async () => {
    await run();
    return { block: `fixture-${i}`, outcome: "no-op", duration_ms: 0 };
  }));
  mutable.splice(0, mutable.length, ...blocks as unknown as typeof mutable);
  return { blocks, restore: () => mutable.splice(0, mutable.length, ...original) };
}

describe("startup migration session lock", () => {
  it("serializes concurrent runners, then visits every idempotent block again", async () => {
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let visits = 0;
    let writes = 0;
    const applied = new Set<number>();
    const fixture = stubBlocks(async () => {
      const index = visits++ % BLOCKS.length;
      if (visits === 1) { entered(); await gate; }
      if (!applied.has(index)) { applied.add(index); writes++; }
    });
    let first: Promise<unknown> | undefined;
    let second: Promise<unknown> | undefined;
    try {
      first = runStartupMigrations();
      await Promise.race([started, first]);
      second = runStartupMigrations();
      await vi.advanceTimersByTimeAsync(500);
      expect(visits).toBe(1); // FAIL-BEFORE: unlocked runner has entered too.
      release();
      await first;
      await vi.advanceTimersByTimeAsync(250);
      expect(await second).toHaveLength(BLOCKS.length);
      expect(writes).toBe(BLOCKS.length);
      for (const block of fixture.blocks) expect(block).toHaveBeenCalledTimes(2);
      expect(state.held).toBe(false);
    } finally {
      release();
      await vi.advanceTimersByTimeAsync(250);
      await Promise.allSettled([first, second]);
      fixture.restore();
    }
  });

  it("times out after a bounded wait and skips all blocks", async () => {
    state.held = true;
    const fixture = stubBlocks(async () => {});
    try {
      const pending = runStartupMigrations();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(await pending).toEqual([expect.objectContaining({ block: "startup-migrations-lock", outcome: "skipped (advisory lock timeout; no migrations ran)" })]);
      for (const block of fixture.blocks) expect(block).not.toHaveBeenCalled();
      expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({ label: "startup-migrations-lock-timeout" }), "startup-migrations-lock-timeout");
      expect(state.sessions[0].release).toHaveBeenCalledOnce();
      expect(state.sessions[0].end).toHaveBeenCalledOnce();
    } finally { fixture.restore(); }
  });

  it("unlocks and closes the reserved session when a migration throws", async () => {
    const fixture = stubBlocks(async () => { throw new Error("migration failed"); });
    try {
      await expect(runStartupMigrations()).rejects.toThrow("migration failed");
      expect(state.held).toBe(false);
      expect(state.sessions[0].unsafe).toHaveBeenLastCalledWith("SELECT pg_advisory_unlock($1::bigint)", ["91621622369349"]);
      expect(state.sessions[0].release).toHaveBeenCalledOnce();
      expect(state.sessions[0].end).toHaveBeenCalledOnce();
    } finally { fixture.restore(); }
  });

  it("keeps Date and Buffer out of SQL bindings across real migration blocks", async () => {
    const dialect = new PgDialect();
    const params: unknown[] = [];
    const invalidChunks: unknown[] = [];
    const seen = new WeakSet<object>();
    function inspect(value: unknown): void {
      if (value instanceof Date || Buffer.isBuffer(value)) invalidChunks.push(value);
      if (value && typeof value === "object" && !seen.has(value)) {
        seen.add(value);
        for (const child of Object.values(value)) inspect(child);
      }
    }
    state.db.execute.mockImplementation(async (query: SQL) => {
      inspect(query.queryChunks);
      params.push(...dialect.sqlToQuery(query).params);
      // Shape probe only: postconditions have dedicated per-block tests.
      return Object.assign([{ cnt: "1", count: "0", remaining_zero: 0 }], { count: 0 });
    });
    await Promise.allSettled(BLOCKS.map((block) => block(state.db)));
    expect(state.db.execute.mock.calls.length).toBeGreaterThan(BLOCKS.length);
    expect(params.length).toBeGreaterThan(0);
    expect(invalidChunks).toEqual([]);
    for (const param of params) {
      expect(param).not.toBeInstanceOf(Date);
      expect(Buffer.isBuffer(param)).toBe(false);
    }
  });
});

function wrapped(code: string) {
  return new DrizzleQueryError("ALTER TABLE capabilities ADD COLUMN example text", ["private-bind-value"],
    Object.assign(new Error("canceling statement due to lock timeout"), { code }));
}

// Exercise the actual runner, including its executor and advisory-lock cleanup.
describe("migration lock contention", () => {
  it.each(["55P03", "40P01"])("retries wrapped %s, then succeeds", async (code) => {
    let calls = 0;
    const fixture = stubBlocks(async () => { if (++calls === 1) throw wrapped(code); });
    try {
      const pending = runStartupMigrations();
      void pending.catch(() => undefined);
      await vi.runAllTimersAsync();
      expect(await pending).toHaveLength(BLOCKS.length);
      expect(fixture.blocks[0]).toHaveBeenCalledTimes(2);
      expect(log.warn).toHaveBeenCalledWith(expect.objectContaining({
        label: "startup-migration-block-retry", attempt: 1, sqlstate: code,
        message: "canceling statement due to lock timeout",
      }), "startup-migration-block-retry");
      expect(state.poolSessions.every((s) => s.release.mock.calls.length === 1)).toBe(true);
    } finally { fixture.restore(); }
  });

  it("does not retry a non-lock error and logs the underlying cause", async () => {
    const error = wrapped("42P01");
    const fixture = stubBlocks(async () => { throw error; });
    try {
      await expect(runStartupMigrations()).rejects.toBe(error);
      expect(fixture.blocks[0]).toHaveBeenCalledOnce();
      expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ sqlstate: "42P01",
        message: error.cause.message }), "startup-migration-block-failed");
      expect(formatStartupError(error)).toContain("SQLSTATE: 42P01");
      expect(formatStartupError(error)).toContain(error.cause.message);
      expect(formatStartupError(error)).not.toContain("private-bind-value");
    } finally { fixture.restore(); }
  });

  it("exhausts retries and propagates the original error", async () => {
    const error = wrapped("55P03");
    const fixture = stubBlocks(async () => { throw error; });
    try {
      const pending = expect(runStartupMigrations()).rejects.toBe(error);
      await vi.runAllTimersAsync();
      await pending;
      expect(fixture.blocks[0]).toHaveBeenCalledTimes(5);
      expect(state.held).toBe(false);
    } finally { fixture.restore(); }
  });

  it("shares the retry budget across blocks but always gives a first attempt the full wait", async () => {
    let calls = 0;
    const fixture = stubBlocks(async () => {
      calls++;
      // Model server lock waits without real sleeps.
      if (calls === 1) { vi.setSystemTime(Date.now() + 5_000); throw wrapped("55P03"); }
      if (calls === 2) { vi.setSystemTime(Date.now() + 4_400); return; }
      if (calls === 3) { vi.setSystemTime(Date.now() + 100); throw wrapped("55P03"); }
    });
    try {
      const pending = expect(runStartupMigrations()).rejects.toThrow("Failed query");
      await vi.runAllTimersAsync();
      await pending;
      // The second block's first attempt still waits the full 2 s although the
      // budget is spent; the spent budget only stops its retry.
      expect(calls).toBe(3);
      expect(state.poolSessions[2].unsafe).toHaveBeenCalledWith(
        "SELECT set_config('lock_timeout', $1, false)", ["2000ms"]);
    } finally { fixture.restore(); }
  });

  it("keeps the stack for non-database fatal errors and names the failing block", () => {
    const plain = new TypeError("x is not a function");
    expect(formatStartupError(plain)).toContain("Stack:");
    expect(formatStartupError(plain)).toContain("x is not a function");
    const db = wrapped("55P03") as Error & { startupBlock?: string };
    db.startupBlock = "runMigration0060_marketplaceEligible";
    expect(formatStartupError(db)).toContain("Block: runMigration0060_marketplaceEligible");
    expect(formatStartupError(db)).not.toContain("Stack:");
  });

  it("executes on the reserved session and passes the original pool to concurrent blocks", async () => {
    const concurrent = BLOCKS.filter((b) => /0125_|0127_|0130_/.test(b.name));
    const original = [...BLOCKS];
    const mutable = BLOCKS as Array<(tx: import("./startup-migrations.js").MigrationExecutor) => Promise<import("./startup-migrations.js").BlockResult>>;
    mutable.splice(0, mutable.length, async (tx) => {
      expect((tx as typeof state.db).$client).toBe(state.db.$client);
      await tx.execute(sql`SELECT ${"safe-bind"}`);
      await tx.execute(sql`SELECT ${JSON.stringify({ key: "value" })}::jsonb`);
      return { block: "probe", outcome: "ok", duration_ms: 0 };
    }, ...concurrent);
    try {
      await runStartupMigrations();
      expect(concurrent).toHaveLength(3);
      // Four runner reservations, plus each concurrent block's own session.
      expect(state.poolSessions).toHaveLength(7);
      expect(state.db.execute).not.toHaveBeenCalled();
      expect(state.poolSessions[0].unsafe).toHaveBeenCalledWith("SELECT $1", ["safe-bind"]);
      const jsonBind = state.poolSessions[0].unsafe.mock.calls.find(([text]) => text.includes("::jsonb"))![1][0];
      // Use the real Drizzle-installed codec, not a double-stringifying stub.
      const codecs = state.blockOptions[0];
      expect(JSON.parse(codecs.serializers["3802"](jsonBind))).toEqual({ key: "value" });
      expect(JSON.parse(codecs.serializers["114"](jsonBind))).toEqual({ key: "value" });
      expect(codecs.parsers["1184"]("2026-10-28T12:00:00Z")).toBe("2026-10-28T12:00:00Z");
      for (const session of state.poolSessions) {
        expect(session.release).toHaveBeenCalledOnce();
        expect(session.unsafe).toHaveBeenLastCalledWith("RESET lock_timeout");
        for (const [, binds] of session.unsafe.mock.calls) for (const bind of binds ?? []) {
          expect(bind).not.toBeInstanceOf(Date);
          expect(Buffer.isBuffer(bind)).toBe(false);
        }
      }
      expect(state.poolSessions.flatMap((s) => s.unsafe.mock.calls).some(([text]) =>
        String(text).includes("CREATE INDEX CONCURRENTLY"))).toBe(true);
    } finally { mutable.splice(0, mutable.length, ...original); }
  });
});


it("charges successful retries against the shared contention budget", async () => {
  let calls = 0;
  const fixture = stubBlocks(async () => {
    calls++;
    vi.setSystemTime(Date.now() + (calls === 1 ? 5_000 : calls === 2 ? 4_500 : 2_000));
    if (calls !== 2) throw wrapped("55P03");
  });
  try {
    const pending = expect(runStartupMigrations()).rejects.toThrow("Failed query");
    await vi.runAllTimersAsync();
    await pending;
    expect(calls).toBe(3);
    expect(state.poolSessions[2].unsafe).toHaveBeenCalledWith(
      "SELECT set_config('lock_timeout', $1, false)", ["2000ms"]);
  } finally { fixture.restore(); }
});

it.each(["42P01", "55P03"])("closes the runner pool on reset failure and preserves original %s", async (code) => {
  const original = wrapped(code);
  state.db.$client.reserve.mockImplementation(async () => {
    const session = { unsafe: vi.fn(async (text: string) => {
      if (text === "RESET lock_timeout") throw new Error("reset canceled");
      return [];
    }), release: vi.fn() };
    state.poolSessions.push(session);
    return session;
  });
  const fixture = stubBlocks(async () => { throw original; });
  try {
    await expect(runStartupMigrations()).rejects.toBe(original);
    expect(fixture.blocks[0]).toHaveBeenCalledOnce();
    expect(state.poolSessions[0].release).not.toHaveBeenCalled();
    expect(state.blockPoolEnd).toHaveBeenCalledWith({ timeout: 0 });
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({
      label: "startup-migration-session-reset-failed", message: "reset canceled",
    }), "startup-migration-session-reset-failed");
    expect(state.held).toBe(false);
  } finally { fixture.restore(); }
});
