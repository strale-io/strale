import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const state = vi.hoisted(() => ({
  held: false,
  sessions: [] as Array<{ unsafe: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> }>,
  db: { execute: vi.fn() },
}));
vi.mock("../db/index.js", () => ({ getDb: () => state.db }));
vi.mock("./log.js", () => ({ log: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("postgres", () => ({ default: () => {
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
